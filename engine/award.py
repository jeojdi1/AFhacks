"""Award onboarding after a shop accepts an offer (docs/api.md §6.1, additive).

When a shop presses Accept, the phone app jumps to a formal "award" page: the paperwork
Northgate (fictional) needs for THIS job, and a kickoff call to book with Northgate's
supplier development team. Northgate's desktop sees the same progress.

Everything is a demo:
- no real e-signature: "signing" records only that the shop pressed Sign;
- no upload is stored: an "upload" document records only that it was marked as sent
  (Shieldworks never stores drawings or controlled technical data);
- no calendar invite is sent: booking records only the chosen slot.

Numbers never change: an award touches no assignment, job, package or ledger value. The
document list is built deterministically from the job and the shop; only progress is
stored (``State.awards``, keyed ``"shop:job"``). A record belongs to one routing (the
``routed`` event's ``seq``), so a new route, an upload or a reset clears it; a fresh seed
has none. Undoing and re-accepting the same offer keeps the progress.

Routes: ``GET /shops/{shop}/offers/{job}/award``, ``POST …/award/documents/{key}``,
``POST …/award/call``. Mutations emit ``paperwork_done`` / ``kickoff_booked`` events.
"""

from __future__ import annotations

import copy
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict

from engine import cache, shopside, trades
from engine.pipeline import config, effective_shop
from engine.rules import cert_label
from engine.state import DEFAULT_PROGRAM_ID, STATE_LOCK, State, load_state, save_state

router = APIRouter()

# The two award events join the shared activity log (engine/shopside.py emit()).
AWARD_EVENT_KINDS = ("paperwork_done", "kickoff_booked")
shopside.EVENT_KINDS = tuple(shopside.EVENT_KINDS) + tuple(
    k for k in AWARD_EVENT_KINDS if k not in shopside.EVENT_KINDS
)

CALL_WITH = "Northgate supplier development (fictional)"
CALL_MINUTES = 30
SLOT_DAYS = 5
SLOT_HOURS = (10, 14)
DEMO_NOTE = (
    "Demo paperwork: no real e-signature, nothing is uploaded or stored, and no calendar "
    "invite is sent. Northgate Land Systems is fictional."
)
NET_TERMS = "Net 30 payment (assumption)"
CWB_TRAINING_NOTE = (
    "Welding certification (CWB W47.1): welders in training — qualification expected "
    "before first article (assumption)"
)
HELD = ("verified", "declared")

try:  # Northgate's site is in London, Ontario: slots are Eastern time.
    from zoneinfo import ZoneInfo

    LOCAL_TZ: Any = ZoneInfo("America/Toronto")
except (ImportError, KeyError, OSError):  # pragma: no cover - no tz database: fixed EDT
    LOCAL_TZ = timezone(timedelta(hours=-4))


# --------------------------------------------------------------------------- helpers


def _key(shop_id: str, job_id: str) -> str:
    return f"{shop_id}:{job_id}"


def _routed_seq(state: Any) -> int | None:
    for ev in reversed(getattr(state, "events", None) or []):
        if ev.get("kind") == "routed":
            return ev.get("seq")
    return None


def _awards(state: Any) -> dict:
    val = getattr(state, "awards", None)
    if val is None:
        val = {}
        state.awards = val
    return val


def _record(state: Any, shop_id: str, job_id: str) -> dict | None:
    """The stored progress for this award, or None (none yet, or from an older routing)."""
    rec = (getattr(state, "awards", None) or {}).get(_key(shop_id, job_id))
    if rec is None or rec.get("routed_seq") != _routed_seq(state):
        return None
    return rec


def _prune(state: Any) -> None:
    """Drop records from an older routing (a write-time tidy-up; reads ignore them)."""
    seq = _routed_seq(state)
    awards = _awards(state)
    for k in [k for k, v in awards.items() if v.get("routed_seq") != seq]:
        del awards[k]


def _money(x: float, cents: bool = False) -> str:
    return f"${float(x):,.2f}" if cents else f"${float(x):,.0f}"


def _target(state: Any, shop_id: str, job_id: str) -> tuple[dict, dict, dict, dict]:
    """(shop, assignment, job, decision) for an accepted offer. 404 unless the offer
    exists for this shop; 409 unless the shop's decision is ``accepted``."""
    shop = state.shops.get(shop_id)
    if shop is None:
        raise shopside.ActionError(404, f"Unknown shop '{shop_id}'")
    if state.stage not in ("routed", "funded"):
        raise shopside.ActionError(404, f"Job '{job_id}' is not offered to shop '{shop_id}'")
    a, _own = shopside._offer_target(state, shop_id, job_id)
    job = next((j for j in state.jobs if j.get("id") == job_id), None)
    if job is None:  # pragma: no cover - an assignment always has its job
        raise shopside.ActionError(404, f"Unknown job '{job_id}'")
    rec = (getattr(state, "offer_decisions", None) or {}).get(_key(shop_id, job_id))
    status = shopside.decision_status(rec)
    if status != "accepted":
        raise shopside.ActionError(
            409, f"Accept the offer first: job '{job_id}' is {status} for shop '{shop_id}'"
        )
    return shop, a, job, rec


# --------------------------------------------------------------------------- documents


def _trade_for_cert(state: Any, ctype: str) -> dict | None:
    """The trade whose workers a funded package is training for ``ctype`` (IPC, ...)."""
    found = trades.for_cert(config(state).get("training_costs"), ctype)
    return found[1] if found else None


def _quality_detail(state: Any, shop_id: str, job: dict) -> str:
    try:
        eff = effective_shop(state, shop_id)
    except KeyError:  # pragma: no cover
        eff = state.shops.get(shop_id) or {}
    certs = {c.get("type"): c for c in eff.get("certifications") or []}
    required = [c for c in job.get("required_certs") or [] if c != "CPCSC_L1"]
    lines: list[str] = []
    for ctype in required:
        c = certs.get(ctype) or {}
        status = c.get("status") or "unknown"
        if ctype == "CWB_W47.1" and status not in HELD:
            lines.append(CWB_TRAINING_NOTE)
        elif status == "pending_training" and (trade := _trade_for_cert(state, ctype)):
            lines.append(
                f"{trade.get('label') or 'Training'} certification ({cert_label(ctype)}): "
                f"{trades.workers(trade)} in training — qualification expected before first "
                "article (assumption)"
            )
        elif status in HELD:
            lines.append(f"{cert_label(ctype)}: {status} on the shop's profile")
        else:
            lines.append(f"{cert_label(ctype)}: {status.replace('_', ' ')} on the shop's profile (assumption)")
    iso = certs.get("ISO9001") or {}
    if "ISO9001" not in required and iso.get("status") in HELD:
        lines.append(f"{cert_label('ISO9001')}: {iso['status']} on the shop's profile")
    if not lines:
        lines.append("No certificate is required for this job; the shop's quality system is "
                     "taken from its profile (assumption)")
    return "Attached from the shop's profile — " + "; ".join(lines)


def documents_for(state: Any, shop: dict, a: dict, job: dict) -> list[dict]:
    """The job's paperwork, in order, without progress (deterministic)."""
    prime = "Northgate"
    qty = int(job.get("qty") or 0)
    unit = float(job.get("unit_price_cad") or 0)
    value = float(a.get("value_cad") or job.get("est_value_cad") or qty * unit)
    ccv_pct = float(a.get("ccv_pct") if a.get("ccv_pct") is not None else job.get("ccv_pct") or 0)
    required = set(job.get("required_certs") or [])
    docs: list[dict] = [
        {
            "key": "subcontract", "title": "Subcontract / purchase order (draft)", "kind": "sign",
            "why": f"The agreement to make this part for {prime}: quantity, price and payment terms.",
            "detail": (f"{qty:,} × {job.get('part_no')} at {_money(unit, cents=True)} each = "
                       f"{_money(value)} CAD total · {NET_TERMS}"),
        },
        {
            "key": "nda", "title": "Mutual non-disclosure agreement", "kind": "sign",
            "why": f"Both sides keep each other's business information private before {prime} shares job details.",
            "detail": "Standard two-way template for the demo (assumption); not legal advice.",
        },
    ]
    if job.get("controlled"):
        docs.append({
            "key": "cgp", "title": "Controlled Goods declaration", "kind": "sign",
            "why": "This part is a controlled good, so only a Controlled Goods Program registered shop may see its technical data.",
            "detail": ("Technical data moves only through Northgate's secure channel after this check; "
                       "Shieldworks never stores drawings"),
        })
    if "CPCSC_L1" in required:
        docs.append({
            "key": "cpcsc", "title": "Cyber-security self-check (CPCSC Level 1) attestation", "kind": "sign",
            "why": "This job requires the Level 1 cyber-security self-check before any job data is exchanged.",
            "detail": "13 controls, self-assessed and shop-declared; there is no public registry.",
        })
    docs += [
        {
            "key": "quality", "title": "Quality certificates", "kind": "auto",
            "why": f"{prime} needs proof of the quality system and certificates this job asks for.",
            "detail": _quality_detail(state, shop["id"], job),
        },
        {
            "key": "fai", "title": "First article inspection plan", "kind": "upload",
            "why": "How the first part will be measured and checked before full production starts.",
            "detail": "Demo: marking it sent records only that it was sent; no file or drawing is stored.",
        },
        {
            "key": "ccv", "title": "Canadian content declaration (for Northgate's ITB report)", "kind": "sign",
            "why": f"{prime} reports the Canadian content of this work toward its ITB obligation.",
            "detail": (f"Canadian content {round(ccv_pct * 100)}% of {_money(value)} = "
                       f"{_money(value * ccv_pct)} CCV (Simplified ITB rules for demo)"),
        },
        {
            "key": "insurance", "title": "Certificate of insurance", "kind": "upload",
            "why": f"Shows the shop carries business liability insurance, with {prime} named as certificate holder.",
            "detail": "Coverage amount per Northgate's terms (assumption). Demo: no file is stored.",
        },
    ]
    return docs


# --------------------------------------------------------------------------- call slots


def slots(now: datetime | None = None) -> list[str]:
    """The next SLOT_DAYS business days after today (Eastern time), at 10:00 and 14:00."""
    local = (now or shopside.clock()).astimezone(LOCAL_TZ)
    day: date = local.date()
    out: list[str] = []
    while len(out) < SLOT_DAYS * len(SLOT_HOURS):
        day += timedelta(days=1)
        if day.weekday() >= 5:
            continue
        for h in SLOT_HOURS:
            out.append(datetime.combine(day, time(h, 0), tzinfo=LOCAL_TZ).isoformat(timespec="seconds"))
    return out


def _instant(value: str) -> datetime | None:
    try:
        dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None
    return dt if dt.tzinfo is not None else None


def slot_label(slot: str) -> str:
    """"Tue Sep 29, 10:00 AM" (Eastern time)."""
    dt = _instant(slot)
    if dt is None:
        return slot
    dt = dt.astimezone(LOCAL_TZ)
    hour = dt.strftime("%I").lstrip("0")
    return f"{dt.strftime('%a %b')} {dt.day}, {hour}:{dt.strftime('%M %p')}"


# --------------------------------------------------------------------------- view


def build(state: Any, shop_id: str, job_id: str) -> dict:
    """``GET /shops/{shop_id}/offers/{job_id}/award``."""
    shop, a, job, decision = _target(state, shop_id, job_id)
    rec = _record(state, shop_id, job_id) or {}
    done_map: dict = rec.get("documents") or {}
    accepted_at = decision.get("at")
    docs = []
    for d in documents_for(state, shop, a, job):
        if d["kind"] == "auto":
            done_at = done_map.get(d["key"]) or accepted_at
        else:
            done_at = done_map.get(d["key"])
        docs.append({**d, "status": "done" if done_at else "todo", "done_at": done_at})
    call_rec = rec.get("call") or {}
    booked = bool(call_rec.get("slot"))
    done = sum(1 for d in docs if d["status"] == "done")
    total = len(docs)
    manual_done = any(d["status"] == "done" and d["kind"] != "auto" for d in docs)
    if done == total and booked:
        status = "complete"
    elif manual_done or booked:
        status = "in_progress"
    else:
        status = "not_started"
    agenda = [
        "Scope and quantities",
        "Delivery schedule",
        "Quality plan and first article",
        "ITB reporting (Canadian content)",
    ]
    if job.get("controlled"):
        agenda.append("Controlled goods handling")
    left = total - done
    next_steps: list[str] = []
    if left:
        next_steps.append(f"Complete the remaining paperwork ({left} of {total} left)")
    if not booked:
        next_steps.append("Book the kickoff call with Northgate's supplier development team")
    else:
        next_steps.append(f"Kickoff call {slot_label(call_rec['slot'])} (Eastern time, {CALL_MINUTES} min)")
    if status == "complete":
        next_steps.append("Northgate reviews the package and confirms the purchase order (demo: nothing is sent)")
    next_steps.append("First article inspection before full production")
    return {
        "shop_id": shop_id,
        "shop_name": shop.get("name"),
        "job_id": job_id,
        "part_no": job.get("part_no") or a.get("part_no"),
        "description": job.get("description") or a.get("description"),
        "value_cad": a.get("value_cad"),
        "hours_week": a.get("hours_week"),
        "credit_cad": a.get("credit_cad"),
        "controlled": bool(job.get("controlled")),
        "required_certs": list(job.get("required_certs") or []),
        "accepted_at": accepted_at,
        "status": status,
        "done": done,
        "total": total,
        "documents": docs,
        "call": {
            "booked": booked,
            "slot": call_rec.get("slot") if booked else None,
            "booked_at": call_rec.get("at") if booked else None,
            "slots": slots(),
            "timezone": "America/Toronto",
            "duration_min": CALL_MINUTES,
            "agenda": agenda,
            "with": CALL_WITH,
        },
        "next_steps": next_steps,
        "demo_note": DEMO_NOTE,
        "flags": ["assumption"],
    }


# --------------------------------------------------------------------------- actions


def _ensure_record(state: Any, shop_id: str, job_id: str) -> dict:
    _prune(state)
    awards = _awards(state)
    rec = awards.get(_key(shop_id, job_id))
    if rec is None:
        rec = {"shop_id": shop_id, "job_id": job_id, "routed_seq": _routed_seq(state),
               "documents": {}, "call": None}
        awards[_key(shop_id, job_id)] = rec
    return rec


VERB = {"sign": "signed", "upload": "sent", "auto": "attached"}


def complete_document(state: Any, shop_id: str, job_id: str, key: str) -> tuple[dict, bool]:
    """``POST …/award/documents/{key}``: mark one document done (idempotent)."""
    current = build(state, shop_id, job_id)
    doc = next((d for d in current["documents"] if d["key"] == key), None)
    if doc is None:
        keys = ", ".join(d["key"] for d in current["documents"])
        raise shopside.ActionError(404, f"Unknown document '{key}' for job '{job_id}' (one of: {keys})")
    if doc["status"] == "done":
        return current, False
    rec = _ensure_record(state, shop_id, job_id)
    rec["documents"][key] = shopside._now()
    award = build(state, shop_id, job_id)
    shopside.emit(
        state, "paperwork_done",
        f"{award['shop_name']} {VERB[doc['kind']]} the {doc['title']} for {job_id} "
        f"({award['done']} of {award['total']} done, demo)",
        shop_id=shop_id, job_id=job_id,
        payload={"job_id": job_id, "key": key, "title": doc["title"], "done": award["done"],
                 "total": award["total"], "demo": True},
    )
    return award, True


def book_call(state: Any, shop_id: str, job_id: str, slot: Any) -> tuple[dict, bool]:
    """``POST …/award/call`` with ``{slot}``: one of ``call.slots`` (same instant)."""
    current = build(state, shop_id, job_id)
    if not isinstance(slot, str) or not slot.strip():
        raise shopside.ActionError(400, "slot is required (one of call.slots)")
    want = _instant(slot)
    match = next((s for s in current["call"]["slots"] if want is not None and _instant(s) == want), None)
    if match is None:
        raise shopside.ActionError(400, f"slot '{slot}' is not one of the offered times (call.slots)")
    previous = current["call"]["slot"]
    if previous == match:
        return current, False
    rec = _ensure_record(state, shop_id, job_id)
    rec["call"] = {"slot": match, "at": shopside._now()}
    award = build(state, shop_id, job_id)
    payload: dict = {"job_id": job_id, "slot": match, "with": CALL_WITH, "demo": True}
    if previous:
        payload["previous_slot"] = previous
    shopside.emit(
        state, "kickoff_booked",
        f"{award['shop_name']} booked the kickoff call with Northgate for {job_id}: "
        f"{slot_label(match)} ET (demo, no invite sent)",
        shop_id=shop_id, job_id=job_id, payload=payload,
    )
    return award, True


# --------------------------------------------------------------------------- HTTP


class _Body(BaseModel):
    model_config = ConfigDict(extra="ignore")
    idempotency_key: str | None = None


class CallBody(_Body):
    slot: str | None = None  # required; checked above for a readable 400


def _http(fn):
    try:
        return fn()
    except shopside.ActionError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail) from None


def _mutate(fn) -> Any:
    with STATE_LOCK:
        state: State = load_state(DEFAULT_PROGRAM_ID)
        result, changed = _http(lambda: fn(state))
        if changed:
            save_state(state)
            cache.invalidate(DEFAULT_PROGRAM_ID)
        return copy.deepcopy(result)


@router.get("/shops/{shop_id}/offers/{job_id}/award")
def get_award(shop_id: str, job_id: str) -> Response:
    # The slots follow the demo clock's date, so the cache key carries it.
    day = shopside.clock().astimezone(LOCAL_TZ).date().isoformat()
    with STATE_LOCK:
        body = cache.view(
            DEFAULT_PROGRAM_ID, ("award", shop_id, job_id, day),
            lambda s: JSONResponse(_http(lambda: build(s, shop_id, job_id))).body,
        )
    return Response(content=body, media_type="application/json")


@router.post("/shops/{shop_id}/offers/{job_id}/award/documents/{key}")
def post_award_document(shop_id: str, job_id: str, key: str, body: _Body | None = None) -> dict:
    return _mutate(lambda s: complete_document(s, shop_id, job_id, key))


@router.post("/shops/{shop_id}/offers/{job_id}/award/call")
def post_award_call(shop_id: str, job_id: str, body: CallBody) -> dict:
    return _mutate(lambda s: book_call(s, shop_id, job_id, body.slot))
