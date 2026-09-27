"""Shop-side actions and the program activity log (docs/api.md §6, docs/app-spec.md §2.3–§2.8).

What a shop tells Muster from the phone app, and what the prime hears back:

- offer decisions: accept / decline (with a reason) / ask a templated question / undo;
- the prime's reply to a shop's question (stored on the question's decision record);
- funding requests ("Ask Northgate to fund this") for a suggested training package;
- a weekly capacity check-in (free hours per week);
- shop-declared certification expiry dates;
- the activity log (``Event``) the prime's feed and desktop bell poll, including the
  ``routed`` and ``package_funded`` hooks called by engine/app.py.

Everything here is **additive**: it never changes routing, the ledger, jobs, packages or
``state.shops``. The one visible effect on an existing response is ``assignment.status``
(``offered | accepted | declined``, already in the docs/api.md §1 enum), which the
decision endpoint sets. Declined jobs still count as routed (re-routing is a later stretch).

Pure functions over ``engine.state.State``; the HTTP layer (engine/app.py) loads and saves
the State. Mutating functions return ``(response, changed)`` so an idempotent replay does
not write a new revision. Errors are ``ActionError(status, detail)``.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import re
from datetime import UTC, date, datetime, timedelta
from typing import Any

from engine.gaps import short_money
from engine.rules import cert_label, process_label
from engine.tagger import CERT_TYPES, PROCESS_TAGS

# --------------------------------------------------------------------------- vocabularies

DECISIONS = ("accepted", "declined", "question", "undo")
REASON_LABEL = {
    "capacity": "no capacity",
    "price": "price too low",
    "tooling": "tooling/process",
    "schedule": "schedule",
    "not_our_process": "not our process",
    "other": "other",
}
QUESTION_LABEL = {
    "lead_time": "lead time",
    "material_supply": "material supply",
    "first_article": "first-article inspection",
    "quantity_split": "splitting the quantity",
}
EVENT_KINDS = (
    "routed",
    "offer_accepted",
    "offer_declined",
    "offer_question",
    "offer_undo",
    "offer_reply",
    "funding_requested",
    "package_funded",
    "capacity_confirmed",
    "cert_declared",
)
HORIZON_WEEKS = (4, 8, 12)
SEAT_STAGES = (
    "nominated",
    "eligibility_attested",
    "enrolled",
    "started",
    "test_booked",
    "passed",
    "ticket_issued",
)

NOTE_MAX = 280
REPLY_CODE_MAX = 40
CERT_NUMBER_MAX = 40
KEY_MAX = 128
HOURS_MAX = 2000
EXPIRY_MAX_YEARS = 10
EXAMPLE_TEST_WEEKS = 6  # seat card: example test date = funding date + 6 weeks (assumption)
MAX_EVENTS = 2000
MAX_IDEMPOTENCY = 2000
DECLARATION_NOTE = "Shop-declared; not used for routing until reviewed"
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class ActionError(Exception):
    """A client error: ``status`` (400 / 404 / 409) and a readable ``detail``."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


# --------------------------------------------------------------------------- clock


def clock() -> datetime:
    """Current UTC time. scripts/build_app_fixtures.py replaces it with a fixed stepping
    clock so the example responses are deterministic."""
    return datetime.now(UTC)


def _now() -> str:
    return clock().astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _num(x: float) -> int | float:
    x = round(float(x), 2)
    return int(x) if x.is_integer() else x


# --------------------------------------------------------------------------- helpers


def _state_list(state: Any, name: str, default):
    """The State attribute ``name``, created with ``default`` if missing (duck-typed States)."""
    val = getattr(state, name, None)
    if val is None:
        val = default
        setattr(state, name, val)
    return val


def _shop(state: Any, shop_id: str) -> dict:
    shop = state.shops.get(shop_id)
    if shop is None:
        raise ActionError(404, f"Unknown shop '{shop_id}'")
    return shop


def _is_routed(state: Any) -> bool:
    return state.stage in ("routed", "funded")


def _require_routed(state: Any) -> None:
    if not _is_routed(state):
        raise ActionError(400, "Route the program first")


def _opt_str(body: dict, key: str, max_len: int | None = None) -> str | None:
    v = body.get(key)
    if v is None:
        return None
    if not isinstance(v, str):
        raise ActionError(400, f"{key} must be a string")
    v = v.strip()
    if not v:
        return None
    if max_len is not None and len(v) > max_len:
        raise ActionError(400, f"{key} must be at most {max_len} characters")
    return v


def _idem_key(body: dict) -> str | None:
    return _opt_str(body, "idempotency_key", KEY_MAX)


def _fingerprint(kind: str, target: tuple, body: dict) -> str:
    clean = {k: v for k, v in body.items() if k != "idempotency_key"}
    raw = json.dumps([kind, list(target), clean], sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _replay(state: Any, key: str | None, kind: str, fingerprint: str) -> dict | None:
    """The stored response for a reused idempotency key (None if the key is new). A key
    reused for a different request is a 409."""
    if not key:
        return None
    rec = _state_list(state, "idempotency", {}).get(key)
    if rec is None:
        return None
    if rec.get("fingerprint") != fingerprint:
        raise ActionError(409, f"idempotency_key '{key}' was already used for a different request")
    return copy.deepcopy(rec["response"])


def _remember(state: Any, key: str | None, kind: str, fingerprint: str, response: dict) -> None:
    if not key:
        return
    store = _state_list(state, "idempotency", {})
    store.pop(key, None)
    store[key] = {"kind": kind, "fingerprint": fingerprint, "at": _now(), "response": copy.deepcopy(response)}
    while len(store) > MAX_IDEMPOTENCY:
        store.pop(next(iter(store)))


def emit(
    state: Any,
    kind: str,
    message: str,
    *,
    shop_id: str | None = None,
    job_id: str | None = None,
    package_id: str | None = None,
    value_cad: float | None = None,
    credit_cad: float | None = None,
    payload: dict | None = None,
) -> dict:
    """Append an Event (seq = previous + 1) and return a copy of it."""
    if kind not in EVENT_KINDS:
        raise ValueError(f"unknown event kind {kind!r}")
    events = _state_list(state, "events", [])
    last = max(int(getattr(state, "event_seq", 0) or 0), events[-1]["seq"] if events else 0)
    shop = state.shops.get(shop_id) if shop_id else None
    ev = {
        "seq": last + 1,
        "ts": _now(),
        "kind": kind,
        "shop_id": shop_id,
        "shop_name": shop["name"] if shop else None,
        "job_id": job_id,
        "package_id": package_id,
        "value_cad": None if value_cad is None else round(float(value_cad), 2),
        "credit_cad": None if credit_cad is None else round(float(credit_cad), 2),
        "message": message,
        "payload": dict(payload or {}),
    }
    events.append(ev)
    state.event_seq = ev["seq"]
    if len(events) > MAX_EVENTS:
        del events[: len(events) - MAX_EVENTS]
    return copy.deepcopy(ev)


def _money2(x: float) -> str:
    """$1.68M / $777.6K / $950: two significant decimals for per-offer credit lines."""
    x = float(x)
    if abs(x) >= 1_000_000:
        return f"${x / 1_000_000:.2f}M"
    if abs(x) >= 1000:
        return f"${x / 1000:.1f}K".replace(".0K", "K")
    return f"${x:.0f}"


def routed_at(state: Any) -> str | None:
    """Timestamp of the latest ``routed`` event (None before routing, or for a program
    routed before the activity log existed)."""
    for ev in reversed(getattr(state, "events", None) or []):
        if ev.get("kind") == "routed":
            return ev["ts"]
    return None


# --------------------------------------------------------------------------- lifecycle hooks


def on_uploaded(state: Any) -> None:
    """A new parts list: the program's shop answers and log start over. Capacity check-ins
    and certification declarations belong to the shop and are kept."""
    state.offer_decisions = {}
    state.funding_requests = {}
    state.events = []
    state.idempotency = {}


def on_routed(state: Any, result: dict) -> dict:
    """After ``POST /route``: fresh offers, so decisions and funding requests are cleared
    (and their idempotency records); then a ``routed`` event. Returns the event."""
    state.offer_decisions = {}
    state.funding_requests = {}
    idem = _state_list(state, "idempotency", {})
    for k in [k for k, v in idem.items() if v.get("kind") in ("decision", "funding")]:
        del idem[k]
    stats = result.get("stats") or {}
    assignments = result.get("assignments") or []
    n_shops = len({a["shop_id"] for a in assignments})
    credit = round(sum(round(float(a["credit_cad"]) * 100) for a in assignments) / 100, 2)
    prime = state.program.get("prime_name") or "The prime"
    blocked = stats.get("blocked", len(result.get("blocked") or []))
    return emit(
        state,
        "routed",
        f"{prime} routed {stats.get('assigned', len(assignments))} of {stats.get('jobs', len(state.jobs))} "
        f"jobs to {n_shops} shops · {blocked} blocked",
        value_cad=stats.get("assigned_value_cad"),
        credit_cad=credit,
        payload={
            "assigned": stats.get("assigned", len(assignments)),
            "blocked": blocked,
            "shops": n_shops,
            "solver": result.get("solver"),
        },
    )


def on_funded(state: Any, result: dict) -> dict:
    """After ``POST /training/{pkg}/fund``: a ``package_funded`` event with
    ``credit_cad = credit_added``. Returns the event."""
    pkg = result.get("package") or {}
    unblocked = result.get("unblocked_jobs") or []
    value = round(sum(round(float(a["value_cad"]) * 100) for a in unblocked) / 100, 2)
    prime = state.program.get("prime_name") or "The prime"
    return emit(
        state,
        "package_funded",
        f"{prime} funded {result.get('package_id')} at {pkg.get('shop_name')}: {result.get('headline')}",
        shop_id=pkg.get("shop_id"),
        package_id=result.get("package_id"),
        value_cad=value,
        credit_cad=result.get("credit_added"),
        payload={
            "headline": result.get("headline"),
            "requirement": (pkg.get("gap") or {}).get("requirement"),
            "trainees": pkg.get("trainees"),
            "unblocked_job_ids": [a["job_id"] for a in unblocked],
            "still_blocked": list(result.get("still_blocked") or []),
            "training_credit_cad": (result.get("credit_added_breakdown") or {}).get("training_cad"),
        },
    )


# --------------------------------------------------------------------------- T3 decisions


def _decision_key(shop_id: str, job_id: str) -> str:
    return f"{shop_id}:{job_id}"


def decide(state: Any, shop_id: str, job_id: str, body: dict) -> tuple[dict, bool]:
    """``POST /shops/{shop_id}/offers/{job_id}/decision``."""
    shop = _shop(state, shop_id)
    _require_routed(state)
    decision = body.get("decision")
    if decision not in DECISIONS:
        raise ActionError(400, f"decision must be one of: {', '.join(DECISIONS)}")
    reason = _opt_str(body, "reason_code")
    question = _opt_str(body, "question_code")
    note = _opt_str(body, "note", NOTE_MAX)
    if reason is not None and reason not in REASON_LABEL:
        raise ActionError(400, f"Unknown reason_code '{reason}' (one of: {', '.join(REASON_LABEL)})")
    if question is not None and question not in QUESTION_LABEL:
        raise ActionError(400, f"Unknown question_code '{question}' (one of: {', '.join(QUESTION_LABEL)})")
    if decision == "declined" and reason is None:
        raise ActionError(400, "reason_code is required when declining")
    if decision == "question" and question is None:
        raise ActionError(400, "question_code is required when asking a question")
    if decision != "declined":
        reason = None
    if decision != "question":
        question = None
    if decision == "undo":
        note = None

    a = state.assignments.get(job_id)
    if a is None or a.get("shop_id") != shop_id:
        raise ActionError(404, f"Job '{job_id}' is not offered to shop '{shop_id}'")

    key = _idem_key(body)
    norm = {"decision": decision, "reason_code": reason, "question_code": question, "note": note}
    fp = _fingerprint("decision", (shop_id, job_id), norm)
    stored = _replay(state, key, "decision", fp)
    if stored is not None:
        return stored, False

    decisions = _state_list(state, "offer_decisions", {})
    dkey = _decision_key(shop_id, job_id)
    current = decisions.get(dkey)
    name = shop["name"]

    if decision == "undo":
        if current is None:
            raise ActionError(409, f"No decision to undo for job '{job_id}' at shop '{shop_id}'")
        del decisions[dkey]
        a["status"] = "offered"
        rec = {
            "shop_id": shop_id, "job_id": job_id, "decision": "undo", "reason_code": None,
            "question_code": None, "note": None, "at": _now(), "idempotency_key": key,
        }
        ev = emit(
            state, "offer_undo",
            f"{name} withdrew its answer on {job_id} (was {current['decision']}; back to offered)",
            shop_id=shop_id, job_id=job_id, value_cad=a["value_cad"], credit_cad=a["credit_cad"],
            payload={"previous": current["decision"]},
        )
        resp = {"decision": rec, "assignment_status": a["status"], "event": ev}
        _remember(state, key, "decision", fp, resp)
        return resp, True

    if current is not None and all(current.get(k) == v for k, v in norm.items()):
        # Same answer again under a new key: nothing new to tell the prime.
        resp = {"decision": copy.deepcopy(current), "assignment_status": a["status"], "event": None}
        _remember(state, key, "decision", fp, resp)
        return resp, True

    rec = {
        "shop_id": shop_id, "job_id": job_id, "decision": decision, "reason_code": reason,
        "question_code": question, "note": note, "at": _now(), "idempotency_key": key,
    }
    decisions.pop(dkey, None)
    decisions[dkey] = rec
    a["status"] = decision if decision in ("accepted", "declined") else "offered"
    if decision == "accepted":
        kind = "offer_accepted"
        msg = f"{name} accepted {job_id} (+{_money2(a['credit_cad'])} credit)"
        payload: dict = {}
    elif decision == "declined":
        kind = "offer_declined"
        msg = f"{name} declined {job_id}: {REASON_LABEL[reason]}"
        payload = {"reason_code": reason}
    else:
        kind = "offer_question"
        msg = f"{name} asked about {QUESTION_LABEL[question]} on {job_id}"
        payload = {"question_code": question}
    if note:
        payload["note"] = note
    if current is not None:
        payload["previous"] = current["decision"]
    ev = emit(
        state, kind, msg, shop_id=shop_id, job_id=job_id,
        value_cad=a["value_cad"], credit_cad=a["credit_cad"], payload=payload,
    )
    resp = {"decision": copy.deepcopy(rec), "assignment_status": a["status"], "event": ev}
    _remember(state, key, "decision", fp, resp)
    return resp, True


def reply(state: Any, shop_id: str, job_id: str, body: dict) -> tuple[dict, bool]:
    """``POST /shops/{shop_id}/offers/{job_id}/reply``: the prime answers the shop's
    current question on this job. Stored on the decision record as
    ``decision["reply"] = {code, text, at}`` (the key is absent until the prime replies),
    so ``GET /shops/{id}/actions`` carries it back to the shop. A new decision by the shop
    replaces the record and so drops the reply; reset / route / reseed clear it with the
    decisions."""
    shop = _shop(state, shop_id)
    _require_routed(state)
    code = _opt_str(body, "reply_code", REPLY_CODE_MAX)
    if code is None:
        raise ActionError(400, "reply_code is required")
    text = _opt_str(body, "text", NOTE_MAX)
    if text is None:
        raise ActionError(400, "text is required")

    a = state.assignments.get(job_id)
    if a is None or a.get("shop_id") != shop_id:
        raise ActionError(404, f"Job '{job_id}' is not offered to shop '{shop_id}'")

    key = _idem_key(body)
    norm = {"reply_code": code, "text": text}
    fp = _fingerprint("reply", (shop_id, job_id), norm)
    stored = _replay(state, key, "reply", fp)
    if stored is not None:
        return stored, False

    current = (getattr(state, "offer_decisions", None) or {}).get(_decision_key(shop_id, job_id))
    if current is None or current.get("decision") != "question":
        raise ActionError(409, f"No open question from shop '{shop_id}' on job '{job_id}'")

    prev = current.get("reply")
    if prev is not None and prev.get("code") == code and prev.get("text") == text:
        # Same reply again under a new key: nothing new to tell the shop.
        resp = {"decision": copy.deepcopy(current), "event": None}
        _remember(state, key, "reply", fp, resp)
        return resp, True

    current["reply"] = {"code": code, "text": text, "at": _now()}
    prime = (state.program.get("prime_name") or "The prime").split()[0]
    payload: dict = {"reply_code": code, "question_code": current.get("question_code")}
    if prev is not None:
        payload["previous_reply_code"] = prev.get("code")
    ev = emit(
        state, "offer_reply",
        f'{prime} replied to {shop["name"]} on {job_id}: "{text}"',
        shop_id=shop_id, job_id=job_id,
        value_cad=a["value_cad"], credit_cad=a["credit_cad"], payload=payload,
    )
    resp = {"decision": copy.deepcopy(current), "event": ev}
    _remember(state, key, "reply", fp, resp)
    return resp, True


# --------------------------------------------------------------------------- T5 funding requests


def _request_view(state: Any, req: dict) -> dict:
    out = copy.deepcopy(req)
    pkg = state.packages.get(req["package_id"])
    if pkg is not None and pkg.get("status") == "funded":
        out["status"] = "funded"
    return out


def request_funding(state: Any, shop_id: str, body: dict) -> tuple[dict, bool]:
    """``POST /shops/{shop_id}/funding-requests``."""
    shop = _shop(state, shop_id)
    _require_routed(state)
    requirement = _opt_str(body, "requirement", 64)
    if requirement is None:
        raise ActionError(400, "requirement is required (e.g. \"CWB_W47.1\")")
    key = _idem_key(body)
    fp = _fingerprint("funding", (shop_id,), {"requirement": requirement})
    stored = _replay(state, key, "funding", fp)
    if stored is not None:
        return stored, False

    pkg = next(
        (
            p for p in state.packages.values()
            if p.get("shop_id") == shop_id and (p.get("gap") or {}).get("requirement") == requirement
        ),
        None,
    )
    if pkg is None:
        raise ActionError(404, f"No training package for {requirement} at shop '{shop_id}'")
    if pkg.get("status") == "funded":
        raise ActionError(409, f"Training package '{pkg['id']}' is already funded")

    requests = _state_list(state, "funding_requests", {})
    existing = requests.get(pkg["id"])
    if existing is not None:
        resp = {"request": _request_view(state, existing), "event": None}
        _remember(state, key, "funding", fp, resp)
        return resp, True

    req = {
        "package_id": pkg["id"], "shop_id": shop_id, "requirement": requirement,
        "status": "requested", "at": _now(), "idempotency_key": key,
    }
    requests[pkg["id"]] = req
    what = cert_label(requirement) if pkg.get("cert_unlock") else f"{process_label(requirement)} capacity"
    prime = (state.program.get("prime_name") or "the prime").split()[0]
    ev = emit(
        state, "funding_requested",
        f"{shop['name']} asked {prime} to fund {what} ({pkg['id']}) · "
        f"{short_money(pkg['est_cost_cad'])} → {short_money(pkg['est_credit_cad'])} credit",
        shop_id=shop_id, package_id=pkg["id"],
        value_cad=pkg.get("unblocks_value_cad"), credit_cad=pkg.get("est_credit_cad"),
        payload={
            "requirement": requirement,
            "est_cost_cad": pkg.get("est_cost_cad"),
            "multiplier": pkg.get("multiplier"),
            "trainees": pkg.get("trainees"),
            "blocked_job_ids": list(pkg.get("blocked_job_ids") or []),
        },
    )
    resp = {"request": copy.deepcopy(req), "event": ev}
    _remember(state, key, "funding", fp, resp)
    return resp, True


# --------------------------------------------------------------------------- T7 capacity


def _hours(v: Any, what: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ActionError(400, f"{what} must be a number of hours")
    v = float(v)
    if math.isnan(v) or v < 0 or v > HOURS_MAX:
        raise ActionError(400, f"{what} must be between 0 and {HOURS_MAX}")
    return v


def shop_loads(state: Any, shop_id: str) -> tuple[float, float]:
    """(accepted_load_hours, offered_load_hours) over this shop's assignments."""
    accepted = offered = 0.0
    for a in state.assignments.values():
        if a.get("shop_id") != shop_id:
            continue
        offered += float(a.get("hours_week") or 0)
        if a.get("status") == "accepted":
            accepted += float(a.get("hours_week") or 0)
    return accepted, offered


def confirm_capacity(state: Any, shop_id: str, body: dict) -> tuple[dict, bool]:
    """``POST /shops/{shop_id}/capacity``. Stored only; never changes routing."""
    shop = _shop(state, shop_id)
    by_process_raw = body.get("by_process")
    by_process: dict[str, int | float] | None = None
    if by_process_raw is not None:
        if not isinstance(by_process_raw, dict):
            raise ActionError(400, "by_process must be an object of process_tag → hours")
        by_process = {}
        for k, v in by_process_raw.items():
            if k not in PROCESS_TAGS:
                raise ActionError(400, f"Unknown process_tag '{k}' in by_process")
            by_process[k] = _num(_hours(v, f"by_process.{k}"))
    raw_hours = body.get("hours_week")
    if raw_hours is None:
        if by_process is None:
            raise ActionError(400, "Send hours_week or by_process")
        hours = float(sum(by_process.values()))
        if hours > HOURS_MAX:
            raise ActionError(400, f"hours_week must be between 0 and {HOURS_MAX}")
    else:
        hours = _hours(raw_hours, "hours_week")
    horizon = body.get("horizon_weeks", 4)
    if horizon is None:
        horizon = 4
    if isinstance(horizon, bool) or horizon not in HORIZON_WEEKS:
        raise ActionError(400, "horizon_weeks must be 4, 8 or 12")
    horizon = int(horizon)

    key = _idem_key(body)
    norm = {"hours_week": _num(hours), "by_process": by_process, "horizon_weeks": horizon}
    fp = _fingerprint("capacity", (shop_id,), norm)
    stored = _replay(state, key, "capacity", fp)
    if stored is not None:
        return stored, False

    accepted, offered = shop_loads(state, shop_id)
    over = max(0.0, accepted - hours)
    rec = {
        "shop_id": shop_id, "hours_week": _num(hours), "by_process": by_process,
        "horizon_weeks": horizon, "confirmed_at": _now(), "used_in_routing": False,
    }
    _state_list(state, "capacity_checkins", {})[shop_id] = rec
    msg = f"{shop['name']}: {_num(hours)} h/wk free · accepted {_num(accepted)} h/wk"
    if over > 0:
        msg += f" · over by {_num(over)} h"
    ev = emit(
        state, "capacity_confirmed", msg, shop_id=shop_id,
        payload={
            "hours_week": _num(hours), "horizon_weeks": horizon,
            "accepted_load_hours": _num(accepted), "offered_load_hours": _num(offered),
            "over_by_hours": _num(over),
        },
    )
    resp = {
        "capacity": copy.deepcopy(rec),
        "accepted_load_hours": _num(accepted),
        "offered_load_hours": _num(offered),
        "over_by_hours": _num(over),
        "event": ev,
    }
    _remember(state, key, "capacity", fp, resp)
    return resp, True


# --------------------------------------------------------------------------- T4 declared expiries


def declare_cert(state: Any, shop_id: str, cert_type: str, body: dict) -> tuple[dict, bool]:
    """``POST /shops/{shop_id}/certifications/{cert_type}``. Stored in
    ``cert_declarations`` only: never changes ``state.shops`` or routing."""
    shop = _shop(state, shop_id)
    if cert_type not in CERT_TYPES:
        raise ActionError(400, f"Unknown cert_type '{cert_type}' (one of: {', '.join(CERT_TYPES)})")
    raw = body.get("expires_at")
    if not isinstance(raw, str) or not _DATE_RE.match(raw.strip()):
        raise ActionError(400, "expires_at must be a date as YYYY-MM-DD")
    try:
        expires = date.fromisoformat(raw.strip())
    except ValueError:
        raise ActionError(400, f"expires_at '{raw}' is not a valid date") from None
    today = clock().astimezone(UTC).date()
    if expires < date(2000, 1, 1):
        raise ActionError(400, "expires_at is before 2000-01-01")
    try:
        latest = today.replace(year=today.year + EXPIRY_MAX_YEARS)
    except ValueError:  # 29 Feb
        latest = today.replace(year=today.year + EXPIRY_MAX_YEARS, day=28)
    if expires > latest:
        raise ActionError(400, f"expires_at is more than {EXPIRY_MAX_YEARS} years from today")
    cert_number = _opt_str(body, "cert_number", CERT_NUMBER_MAX)

    key = _idem_key(body)
    norm = {"expires_at": expires.isoformat(), "cert_number": cert_number}
    fp = _fingerprint("cert", (shop_id, cert_type), norm)
    stored = _replay(state, key, "cert", fp)
    if stored is not None:
        return stored, False

    decl = {
        "shop_id": shop_id, "type": cert_type, "expires_at": expires.isoformat(),
        "cert_number": cert_number, "status": "declared", "declared_at": _now(),
        "note": DECLARATION_NOTE,
    }
    _state_list(state, "cert_declarations", {}).setdefault(shop_id, {})[cert_type] = decl
    ev = emit(
        state, "cert_declared",
        f"{shop['name']} declared {cert_label(cert_type)} expiry {expires.isoformat()} "
        "(shop-declared, not used for routing)",
        shop_id=shop_id,
        payload={"cert_type": cert_type, "expires_at": expires.isoformat()},
    )
    resp = {"declaration": copy.deepcopy(decl), "event": ev}
    _remember(state, key, "cert", fp, resp)
    return resp, True


# --------------------------------------------------------------------------- reads


def _decisions(state: Any, shop_id: str | None = None) -> list[dict]:
    return [
        copy.deepcopy(d) for d in (getattr(state, "offer_decisions", None) or {}).values()
        if shop_id is None or d["shop_id"] == shop_id
    ]


def _requests(state: Any, shop_id: str | None = None) -> list[dict]:
    return [
        _request_view(state, r) for r in (getattr(state, "funding_requests", None) or {}).values()
        if shop_id is None or r["shop_id"] == shop_id
    ]


def _declared(state: Any, shop_id: str | None = None) -> list[dict]:
    out = []
    for sid, by_type in (getattr(state, "cert_declarations", None) or {}).items():
        if shop_id is None or sid == shop_id:
            out.extend(copy.deepcopy(d) for d in by_type.values())
    return out


def shop_actions(state: Any, shop_id: str) -> dict:
    """``GET /shops/{shop_id}/actions``: everything this shop has told Muster."""
    _shop(state, shop_id)
    cap = (getattr(state, "capacity_checkins", None) or {}).get(shop_id)
    return {
        "shop_id": shop_id,
        "routed_at": routed_at(state),
        "decisions": _decisions(state, shop_id),
        "funding_requests": _requests(state, shop_id),
        "capacity": copy.deepcopy(cap) if cap else None,
        "declared_certs": _declared(state, shop_id),
    }


def program_actions(state: Any) -> dict:
    """``GET /programs/{id}/actions``: the same lists across every shop."""
    return {
        "program_id": state.program.get("id"),
        "routed_at": routed_at(state),
        "decisions": _decisions(state),
        "funding_requests": _requests(state),
        "capacity": [copy.deepcopy(c) for c in (getattr(state, "capacity_checkins", None) or {}).values()],
        "declared_certs": _declared(state),
    }


def events_view(state: Any, since: int = 0, limit: int = 100) -> dict:
    """``GET /programs/{id}/events?since=&limit=``: events with ``seq > since``, oldest
    first, at most ``limit``. ``last_seq`` is the newest seq in the log (0 when empty); a
    ``last_seq`` below the client's ``since`` means the log was cleared (reset / upload)."""
    events = getattr(state, "events", None) or []
    newer = [e for e in events if e["seq"] > since]
    page = newer[:limit]
    return {
        "program_id": state.program.get("id"),
        "last_seq": events[-1]["seq"] if events else 0,
        "has_more": len(newer) > len(page),
        "events": copy.deepcopy(page),
    }


def trainee_seat(state: Any, package_id: str, seat: int) -> dict:
    """``GET /programs/{id}/training/{package_id}/seats/{seat}``: a pseudonymous seat card.
    No personal data exists anywhere in Muster; a seat is "Seat 3 of 4 · TP-01"."""
    pkg = state.packages.get(package_id)
    if pkg is None:
        raise ActionError(404, f"Unknown training package '{package_id}'")
    seats = int(pkg.get("trainees") or 0)
    if seat < 1 or seat > seats:
        raise ActionError(404, f"Seat {seat} does not exist on {package_id} ({seats} seats)")
    shop = state.shops.get(pkg["shop_id"]) or {}
    funded = pkg.get("status") == "funded"
    funded_at = None
    for ev in reversed(getattr(state, "events", None) or []):
        if ev.get("kind") == "package_funded" and ev.get("package_id") == package_id:
            funded_at = ev["ts"]
            break
    req = (getattr(state, "funding_requests", None) or {}).get(package_id)
    example_test = None
    if funded and funded_at:
        d = date.fromisoformat(funded_at[:10])
        example_test = (d + timedelta(weeks=EXAMPLE_TEST_WEEKS)).isoformat()
    job_ids = list(pkg.get("blocked_job_ids") or [])
    now_assigned = [
        j for j in job_ids
        if (state.assignments.get(j) or {}).get("shop_id") == pkg["shop_id"]
    ]
    return {
        "program_id": state.program.get("id"),
        "package_id": package_id,
        "seat": seat,
        "seats": seats,
        "label": f"Seat {seat} of {seats} · {package_id}",
        "shop_id": pkg["shop_id"],
        "shop_name": pkg.get("shop_name") or shop.get("name"),
        "shop_source": shop.get("source"),
        "shop_label": shop.get("label"),
        "package_status": pkg.get("status"),
        "funding_requested_at": req["at"] if req else None,
        "funded_at": funded_at,
        "stage": "enrolled" if funded else "not_funded",
        "stages": list(SEAT_STAGES),
        "stage_flag": "assumption",
        "category": pkg.get("category"),
        "recipient_example": pkg.get("recipient_example"),
        "cert_unlock": pkg.get("cert_unlock"),
        "capacity_unlock": dict(pkg.get("capacity_unlock") or {}),
        "jobs_unlocked": job_ids,
        "jobs_unlocked_value_cad": pkg.get("unblocks_value_cad"),
        "jobs_now_assigned": now_assigned,
        "example_test_date": example_test,
        "example_test_date_flag": "assumption",
        "eligibility_note": pkg.get("eligibility_note"),
        "flags": ["assumption"],
    }
