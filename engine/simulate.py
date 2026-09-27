"""Simulated marketplace activity for demos (additive; docs/api.md §6 events).

Two things make the live demo look like a working marketplace instead of an empty one:

- ``POST /demo/seed?scenario=populated``: reset, upload the demo parts list, route, then
  apply a short scripted history through the EXISTING shop actions (engine/shopside.py):
  four other synthetic shops accept, one declines ("No capacity this month"), one asks
  "Can delivery start in November?", two confirm capacity and one declares a certificate
  whose renewal is coming up. ``scenario=empty`` is ``POST /demo/reset``.
- ``POST /demo/simulate/tick``: apply the next event of a fixed scripted queue (another
  shop accepts, a question, a capacity check-in, a new declaration and, only once the
  presenter has funded TP-01, a funding request from another shop).
  ``GET /demo/simulate/status`` reports progress.

Guardrails:
- The presenter's shop (Tallowfield, ``syn-012``) is never touched, so both of its offers
  stay open; no package is ever funded (a funding *request* for TP-02 is not funding).
- The presenter's fund moment stays uncontested: a scripted funding request waits
  (skipped, not counted as remaining) until ``DEMO_PACKAGE`` is funded, and it sits at the
  end of the queue, so /gaps never features another shop's request ahead of TP-01.
- Declared certificate dates are relative to "now" and to the renewal rule's act-by lead
  (data/rules/renewals.json, e.g. Nadcap: act by 90 days before expiry), so a seeded
  renewal always reads "act by in N days", never an act-by date already passed.
- Only shop actions are used, so routing, jobs, packages and the ledger never change.
- Every scripted event carries ``"simulated": true`` (top level and in ``payload``) plus
  ``payload.sim_step``; scripted decisions/requests use ``idempotency_key = "sim:<step>"``.
  The ``routed`` event of the seed is the ordinary route and is not marked.
- Progress lives in the event log itself (``payload.sim_step``), so it survives a State
  reload and is cleared by ``/demo/reset`` or a new upload. No new State fields.
- Every mutation is a new State revision (cached views invalidated); a tick with
  nothing left to apply writes nothing.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from engine import cache, shopside
from engine.state import DEFAULT_PROGRAM_ID, STATE_LOCK, State, load_state, save_state

router = APIRouter()

DEMO_SHOP = "syn-012"  # the presenter's shop: never touched by the simulator
DEMO_PACKAGE = "TP-01"  # the presenter's fund moment: never funded or requested here
SCENARIOS = ("populated", "empty")
SIM_KEY_PREFIX = "sim:"

# Seeded history timing: routed ROUTED_AGO_MIN minutes before "now", then one scripted
# event at each offset (minutes after routing), so the feed reads like a live hour.
ROUTED_AGO_MIN = 47

RENEWALS_PATH = Path(__file__).resolve().parent.parent / "data" / "rules" / "renewals.json"


@lru_cache(maxsize=1)
def _renewal_rules() -> tuple[dict, ...]:
    try:
        return tuple(json.loads(RENEWALS_PATH.read_text(encoding="utf-8")).get("rules") or ())
    except (OSError, ValueError):  # pragma: no cover - rules file is part of the repo
        return ()


def act_by_days(cert_type: str) -> int:
    """Days before expiry the shop must act (data/rules/renewals.json; the phone's
    renewalFor uses the same rule). "NADCAP:HEAT_TREAT" matches "NADCAP:*"."""
    rules = _renewal_rules()
    rule = next((r for r in rules if r.get("cert_type") == cert_type), None)
    if rule is None:
        rule = next(
            (r for r in rules
             if str(r.get("cert_type", "")).endswith(":*") and cert_type.startswith(r["cert_type"][:-1])),
            None,
        )
    return int((rule or {}).get("act_by_days") or 0)


def _decision(shop: str, job: str, decision: str, **extra: Any) -> dict:
    return {"type": "decision", "shop_id": shop, "job_id": job, "body": {"decision": decision, **extra}}


def _capacity(shop: str, hours: float, horizon: int = 4) -> dict:
    return {"type": "capacity", "shop_id": shop, "body": {"hours_week": hours, "horizon_weeks": horizon}}


def _cert(shop: str, cert_type: str, act_by_in_days: int) -> dict:
    """Declare ``cert_type`` expiring so its act-by date is ``act_by_in_days`` from now
    (expiry = now + act-by lead + act_by_in_days)."""
    return {"type": "cert", "shop_id": shop, "cert_type": cert_type, "act_by_in": act_by_in_days}


def _funding(shop: str, requirement: str) -> dict:
    return {"type": "funding", "shop_id": shop, "body": {"requirement": requirement}}


# (step id, minutes after routing, action). Order is the order applied.
SEED_SCRIPT: tuple[tuple[str, int, dict], ...] = (
    ("seed-01", 4, _decision("syn-001", "NG-004", "accepted")),
    ("seed-02", 8, _decision("syn-017", "NG-024", "accepted")),
    ("seed-03", 13, _decision("syn-002", "NG-005", "declined", reason_code="capacity",
                              note="No capacity this month")),
    ("seed-04", 17, _decision("syn-015", "NG-019", "accepted")),
    ("seed-05", 22, _decision("syn-018", "NG-023", "question", question_code="lead_time",
                              note="Can delivery start in November?")),
    ("seed-06", 27, _capacity("syn-016", 120)),
    ("seed-07", 31, _decision("syn-021", "NG-003", "accepted")),
    ("seed-08", 36, _capacity("syn-021", 24, 8)),
    # Act by in 24 days: "urgent" on the prime's supplier list, still ahead of today.
    ("seed-09", 41, _cert("syn-011", "NADCAP:CHEM_PROCESSING", 24)),
)

# The tick queue (applied one per POST /demo/simulate/tick, in this order). The funding
# request is last and waits for the presenter to fund TP-01 (see _applicable).
TICK_QUEUE: tuple[tuple[str, dict], ...] = (
    ("tick-01", _decision("syn-014", "NG-017", "accepted")),
    ("tick-02", _decision("syn-006", "NG-002", "question", question_code="quantity_split",
                          note="Can we ship this in two lots?")),
    ("tick-03", _capacity("syn-009", 80, 12)),
    # Act by in 45 days: "renewal window open" on the prime's supplier list.
    ("tick-04", _cert("syn-009", "NADCAP:HEAT_TREAT", 45)),
    ("tick-05", _decision("syn-029", "NG-010", "accepted")),
    ("tick-06", _decision("syn-008", "NG-029", "accepted")),
    ("tick-07", _decision("syn-030", "NG-014", "declined", reason_code="schedule",
                          note="Plating line down for maintenance until December")),
    ("tick-08", _decision("syn-018", "NG-023", "accepted",
                          note="Thanks, November start works for us")),
    ("tick-09", _capacity("syn-018", 20)),
    ("tick-10", _decision("syn-003", "NG-006", "accepted")),
    ("tick-11", _decision("syn-019", "NG-039", "accepted")),
    ("tick-12", _funding("syn-026", "welding")),
)


# --------------------------------------------------------------------------- core (pure)


def _applicable(state: State, action: dict, *, ignore_gate: bool = False) -> bool:
    """Whether a scripted action can run now without overriding anyone. Decisions skip
    when the job is no longer offered to that shop or the shop has already answered
    (unless the answer came from the simulator and differs); funding requests skip until
    the presenter's package is funded, and when the package is gone, funded or already
    requested; decisions also skip when the job was re-offered to another shop. Never the
    presenter's shop."""
    shop_id = action["shop_id"]
    if shop_id == DEMO_SHOP or shop_id not in state.shops:
        return False
    kind = action["type"]
    if kind == "decision":
        a = state.assignments.get(action["job_id"])
        if a is None or a.get("shop_id") != shop_id:
            return False
        if action["job_id"] in shopside.reoffers(state):
            return False  # Northgate sent it to another shop; the decliner can't answer again
        current = (state.offer_decisions or {}).get(f"{shop_id}:{action['job_id']}")
        if current is None:
            return True
        by_sim = str(current.get("idempotency_key") or "").startswith(SIM_KEY_PREFIX)
        return by_sim and current.get("decision") != action["body"]["decision"]
    if kind == "funding":
        demo_pkg = state.packages.get(DEMO_PACKAGE) or {}
        if demo_pkg.get("status") != "funded" and not ignore_gate:
            return False  # never compete with the presenter's fund moment
        req = action["body"]["requirement"]
        pkg = next(
            (p for p in state.packages.values()
             if p.get("shop_id") == shop_id and (p.get("gap") or {}).get("requirement") == req),
            None,
        )
        return (
            pkg is not None and pkg["id"] != DEMO_PACKAGE and pkg.get("status") != "funded"
            and pkg["id"] not in (state.funding_requests or {})
        )
    return True


def _run(state: State, step_id: str, action: dict, now: datetime) -> list[dict]:
    """Apply one scripted action through engine.shopside and mark the events it added as
    simulated. Returns copies of those events (empty if the action added none)."""
    before = int(state.event_seq or 0)
    key = SIM_KEY_PREFIX + step_id
    shop_id = action["shop_id"]
    kind = action["type"]
    if kind == "decision":
        shopside.decide(state, shop_id, action["job_id"], {**action["body"], "idempotency_key": key})
    elif kind == "capacity":
        shopside.confirm_capacity(state, shop_id, {**action["body"], "idempotency_key": key})
    elif kind == "cert":
        lead = act_by_days(action["cert_type"]) + action["act_by_in"]
        expires = (now.astimezone(UTC).date() + timedelta(days=lead)).isoformat()
        shopside.declare_cert(state, shop_id, action["cert_type"],
                              {"expires_at": expires, "idempotency_key": key})
    elif kind == "funding":
        shopside.request_funding(state, shop_id, {**action["body"], "idempotency_key": key})
    else:  # pragma: no cover - script typo
        raise ValueError(f"unknown scripted action {kind!r}")
    added = []
    for ev in state.events or []:
        if ev["seq"] > before:
            ev["simulated"] = True
            ev["payload"]["simulated"] = True
            ev["payload"]["sim_step"] = step_id
            added.append(dict(ev, payload=dict(ev["payload"])))
    return added


def applied_steps(state: State) -> set[str]:
    """Scripted step ids already in the event log."""
    return {
        str((ev.get("payload") or {}).get("sim_step"))
        for ev in state.events or []
        if (ev.get("payload") or {}).get("sim_step")
    }


def _pending(state: State) -> list[tuple[str, dict]]:
    done = applied_steps(state)
    return [(sid, act) for sid, act in TICK_QUEUE if sid not in done and _applicable(state, act)]


def waiting(state: State) -> int:
    """Queued steps held back only until the presenter funds ``DEMO_PACKAGE`` (they play
    after the fund moment). 0 once it is funded: those steps then count as remaining."""
    if (state.packages.get(DEMO_PACKAGE) or {}).get("status") == "funded":
        return 0
    done = applied_steps(state)
    return sum(
        1 for sid, act in TICK_QUEUE
        if sid not in done and act["type"] == "funding" and _applicable(state, act, ignore_gate=True)
    )


def apply_history(state: State, routed_at: datetime) -> list[dict]:
    """Apply SEED_SCRIPT to a routed State with timestamps ``routed_at + offset``."""
    old_clock = shopside.clock
    added: list[dict] = []
    try:
        for step_id, minutes, action in SEED_SCRIPT:
            t = routed_at + timedelta(minutes=minutes)
            shopside.clock = lambda t=t: t
            if _applicable(state, action):
                added.extend(_run(state, step_id, action, t))
    finally:
        shopside.clock = old_clock
    return added


def tick(state: State) -> tuple[dict | None, int]:
    """Apply the next applicable queued step: ``(event, remaining)``; ``(None, 0)`` when
    nothing is left (the State is then untouched)."""
    for step_id, action in _pending(state):
        try:
            events = _run(state, step_id, action, shopside.clock())
        except shopside.ActionError:  # pragma: no cover - guarded by _applicable
            continue
        if events:
            return events[-1], len(_pending(state))
    return None, 0


def status(state: State) -> dict:
    done = applied_steps(state)
    pending = _pending(state) if state.stage in ("routed", "funded") else []
    return {
        "queue_length": len(TICK_QUEUE),
        "applied": sum(1 for sid, _ in TICK_QUEUE if sid in done),
        "remaining": len(pending),
        "next": None if not pending else _describe(*pending[0]),
        "seeded": any(sid in done for sid, _, _ in SEED_SCRIPT),
        "stage": state.stage,
    }


def _describe(step_id: str, action: dict) -> dict:
    return {"step": step_id, "type": action["type"], "shop_id": action["shop_id"],
            "job_id": action.get("job_id")}


def seed_counts(state: State) -> dict:
    decisions = list((state.offer_decisions or {}).values())
    by = {d: sum(1 for x in decisions if x["decision"] == d) for d in ("accepted", "declined", "question")}
    demo_open = [
        a["job_id"] for a in state.assignments.values()
        if a.get("shop_id") == DEMO_SHOP and a.get("status", "offered") == "offered"
        and f"{DEMO_SHOP}:{a['job_id']}" not in (state.offer_decisions or {})
    ]
    return {
        "jobs": len(state.jobs),
        "assigned": len(state.assignments),
        "blocked": len(state.blocked),
        "shops_with_offers": len({a["shop_id"] for a in state.assignments.values()}),
        "accepted": by["accepted"],
        "declined": by["declined"],
        "questions": by["question"],
        "capacity_checkins": len(state.capacity_checkins or {}),
        "cert_declarations": sum(len(v) for v in (state.cert_declarations or {}).values()),
        "funding_requests": len(state.funding_requests or {}),
        "packages_funded": sum(1 for p in state.packages.values() if p.get("status") == "funded"),
        "demo_shop_open_offers": sorted(demo_open),
    }


# --------------------------------------------------------------------------- HTTP


def _locked(fn: Callable[[State], tuple[Any, bool]]) -> Any:
    with STATE_LOCK:
        state = load_state(DEFAULT_PROGRAM_ID)
        result, changed = fn(state)
        if changed:
            save_state(state)
            cache.invalidate(DEFAULT_PROGRAM_ID)
        return result


def _require_routed(state: State) -> None:
    if state.stage not in ("routed", "funded"):
        raise HTTPException(
            status_code=400,
            detail="Route the program first (or POST /demo/seed?scenario=populated)",
        )


@router.post("/demo/seed")
def demo_seed(scenario: str = Query("populated")) -> dict:
    if scenario not in SCENARIOS:
        raise HTTPException(status_code=400, detail=f"scenario must be one of: {', '.join(SCENARIOS)}")
    from engine import app as app_module  # lazy: engine.app imports this module

    reset = app_module.demo_reset()
    if scenario == "empty":
        return {**reset, "scenario": "empty", "stage": "empty", "events_added": 0}

    # Upload and route exactly as the endpoints do (their own lock + save each), with the
    # shopside clock set back so the routed event starts the seeded hour.
    now = shopside.clock()
    routed_at = now - timedelta(minutes=ROUTED_AGO_MIN)
    old_clock = shopside.clock
    shopside.clock = lambda: routed_at
    try:
        app_module.upload_parts(DEFAULT_PROGRAM_ID, None, True)
        app_module.route_program(DEFAULT_PROGRAM_ID, "auto")
    finally:
        shopside.clock = old_clock

    def op(state: State) -> tuple[dict, bool]:
        added = apply_history(state, routed_at)
        return {
            "ok": True,
            "scenario": "populated",
            "program_id": state.program["id"],
            "stage": state.stage,
            "counts": seed_counts(state),
            "events_added": len(added),
            "demo_shop_id": DEMO_SHOP,
            "simulated": True,
            "message": (
                "Demo seeded with simulated shop activity. Tallowfield's two offers are open "
                "and no training is funded."
            ),
        }, bool(added)

    return _locked(op)


@router.post("/demo/simulate/tick")
def simulate_tick() -> dict:
    def op(state: State) -> tuple[dict, bool]:
        _require_routed(state)
        event, remaining = tick(state)
        return {"event": event, "remaining": remaining, "waiting": waiting(state)}, event is not None

    return _locked(op)


@router.get("/demo/simulate/status")
def simulate_status() -> dict:
    with STATE_LOCK:
        return status(load_state(DEFAULT_PROGRAM_ID))
