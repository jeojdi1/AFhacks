"""Simulated marketplace activity (engine/simulate.py): /demo/seed and /demo/simulate/*.

Each test runs on its own temporary SQLite file (MUSTER_DB) with a fixed shopside clock.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

import engine.app as app_module
from engine import cache, shopside, simulate
from engine import state as st

FIXED_NOW = datetime(2026, 9, 26, 21, 30, tzinfo=UTC)
DEMO_SHOP = "syn-012"
EVENT_KEYS = {"seq", "ts", "kind", "shop_id", "shop_name", "job_id", "package_id", "value_cad",
              "credit_cad", "message", "payload"}


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch):
    monkeypatch.setattr(shopside, "clock", lambda: FIXED_NOW)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSTER_DB", str(tmp_path / "sim.db"))
    cache.clear()
    with TestClient(app_module.app) as c:
        yield c
    cache.clear()


def ok(r) -> dict:
    assert r.status_code == 200, r.text
    return r.json()


def seed(c) -> dict:
    return ok(c.post("/demo/seed", params={"scenario": "populated"}))


def events(c) -> list[dict]:
    return ok(c.get("/programs/northgate/events", params={"limit": 500}))["events"]


def tick(c) -> dict:
    return ok(c.post("/demo/simulate/tick"))


def revision() -> int:
    return st.state_key()[2]


# --------------------------------------------------------------------------- seed


def test_seed_populated_produces_the_scripted_history(client):
    body = seed(client)
    assert body["ok"] is True and body["stage"] == "routed" and body["events_added"] == 9
    counts = body["counts"]
    assert counts["jobs"] == 40 and counts["assigned"] == 36 and counts["blocked"] == 4
    assert (counts["accepted"], counts["declined"], counts["questions"]) == (4, 1, 1)
    assert counts["capacity_checkins"] == 2 and counts["cert_declarations"] == 1
    assert counts["funding_requests"] == 0 and counts["packages_funded"] == 0
    assert counts["demo_shop_open_offers"] == ["NG-021", "NG-022"]

    evs = events(client)
    assert [e["kind"] for e in evs] == [
        "routed", "offer_accepted", "offer_accepted", "offer_declined", "offer_accepted",
        "offer_question", "capacity_confirmed", "offer_accepted", "capacity_confirmed", "cert_declared",
    ]
    routed, scripted = evs[0], evs[1:]
    assert set(routed) == EVENT_KEYS  # the ordinary route event, not marked
    for e in scripted:
        assert e["simulated"] is True and e["payload"]["simulated"] is True
        assert e["payload"]["sim_step"].startswith("seed-")
        assert e["shop_id"] != DEMO_SHOP
    decline = next(e for e in scripted if e["kind"] == "offer_declined")
    assert decline["payload"]["reason_code"] == "capacity"
    assert decline["payload"]["note"] == "No capacity this month"
    question = next(e for e in scripted if e["kind"] == "offer_question")
    assert question["payload"]["note"] == "Can delivery start in November?"
    cert = next(e for e in scripted if e["kind"] == "cert_declared")
    # Nadcap acts 90 days before expiry: FIXED_NOW + 90 + 24 days, so act-by is 24 days out.
    assert cert["payload"]["expires_at"] == "2027-01-18"
    # Timestamps read like the last hour, oldest first, none in the future.
    ts = [e["ts"] for e in evs]
    assert ts == sorted(ts) and ts[-1] <= "2026-09-26T21:30:00Z" and ts[0] == "2026-09-26T20:43:00Z"


def test_seed_leaves_presenter_shop_open_and_training_unfunded(client):
    seed(client)
    offers = ok(client.get(f"/shops/{DEMO_SHOP}"))["offers"]
    assert {o["job_id"]: o["status"] for o in offers} == {"NG-021": "offered", "NG-022": "offered"}
    actions = ok(client.get(f"/shops/{DEMO_SHOP}/actions"))
    assert actions["decisions"] == [] and actions["funding_requests"] == []
    assert actions["capacity"] is None and actions["declared_certs"] == []
    gaps = ok(client.get("/programs/northgate/gaps"))
    assert {p["id"]: p["status"] for p in gaps["suggestions"]} == {"TP-01": "suggested", "TP-02": "suggested"}
    # The presenter's flow still works on top of the seeded history.
    ok(client.post(f"/shops/{DEMO_SHOP}/offers/NG-021/decision", json={"decision": "accepted"}))
    funded = ok(client.post("/programs/northgate/training/TP-01/fund"))
    assert funded["package_id"] == "TP-01"


def test_seed_does_not_change_ledger_or_gaps(client):
    ok(client.post("/demo/reset"))
    ok(client.post("/programs/northgate/parts", params={"use_demo": "true"}))
    ok(client.post("/programs/northgate/route"))
    plain = {k: ok(client.get(f"/programs/northgate/{k}")) for k in ("ledger", "gaps", "jobs")}
    plain_assign = ok(client.get("/programs/northgate/assignments"))["assignments"]
    seed(client)
    for k, v in plain.items():
        assert ok(client.get(f"/programs/northgate/{k}")) == v, k
    seeded_assign = ok(client.get("/programs/northgate/assignments"))["assignments"]
    strip = [{k: v for k, v in a.items() if k != "status"} for a in seeded_assign]
    assert strip == [{k: v for k, v in a.items() if k != "status"} for a in plain_assign]


def test_seed_empty_is_reset(client):
    seed(client)
    body = ok(client.post("/demo/seed", params={"scenario": "empty"}))
    reset = ok(client.post("/demo/reset"))
    assert {k: body[k] for k in reset} == reset
    assert body["stage"] == "empty" and body["events_added"] == 0
    assert events(client) == []


def test_seed_rejects_unknown_scenario(client):
    r = client.post("/demo/seed", params={"scenario": "chaos"})
    assert r.status_code == 400 and "scenario must be one of" in r.json()["detail"]


def test_seed_bumps_revision(client):
    ok(client.post("/demo/reset"))
    before = revision()
    seed(client)
    assert revision() > before


# --------------------------------------------------------------------------- tick


def _run_all(c) -> list[tuple]:
    out = []
    while True:
        r = tick(c)
        if r["event"] is None:
            assert r["remaining"] == 0
            return out
        e = r["event"]
        out.append((e["payload"]["sim_step"], e["kind"], e["shop_id"], e["job_id"], r["remaining"]))


FUNDING_STEPS = [sid for sid, act in simulate.TICK_QUEUE if act["type"] == "funding"]
NON_FUNDING_STEPS = [sid for sid, act in simulate.TICK_QUEUE if act["type"] != "funding"]


def test_tick_order_is_deterministic(client, tmp_path, monkeypatch):
    seed(client)
    first = _run_all(client)
    # Before TP-01 is funded the funding request never plays (and is not counted).
    assert [x[0] for x in first] == NON_FUNDING_STEPS
    assert [x[4] for x in first] == list(range(len(NON_FUNDING_STEPS) - 1, -1, -1))
    assert {x[1] for x in first} >= {"offer_accepted", "offer_question", "capacity_confirmed",
                                    "cert_declared", "offer_declined"}
    monkeypatch.setenv("MUSTER_DB", str(tmp_path / "second.db"))
    cache.clear()
    seed(client)
    assert _run_all(client) == first


def test_tick_never_touches_presenter_shop_or_tp01(client):
    seed(client)
    _run_all(client)
    assert all(e["shop_id"] != DEMO_SHOP for e in events(client))
    offers = ok(client.get(f"/shops/{DEMO_SHOP}"))["offers"]
    assert all(o["status"] == "offered" for o in offers)
    # No funding request competes with the presenter's TP-01 fund moment.
    assert ok(client.get("/programs/northgate/actions"))["funding_requests"] == []
    assert all(e["kind"] != "funding_requested" for e in events(client))
    gaps = ok(client.get("/programs/northgate/gaps"))
    assert all(p["status"] == "suggested" for p in gaps["suggestions"])


def test_funding_request_waits_until_tp01_is_funded(client):
    seed(client)
    for _ in range(5):  # the old tick-05 slot was a TP-02 funding request
        tick(client)
    assert ok(client.get("/programs/northgate/actions"))["funding_requests"] == []
    status = ok(client.get("/demo/simulate/status"))
    assert status["remaining"] == len(NON_FUNDING_STEPS) - 5
    # The presenter funds TP-01: the request becomes the next thing the queue can play.
    ok(client.post("/programs/northgate/training/TP-01/fund"))
    played = _run_all(client)
    assert [x[0] for x in played] == NON_FUNDING_STEPS[5:] + FUNDING_STEPS
    assert played[-1][1] == "funding_requested"
    reqs = ok(client.get("/programs/northgate/actions"))["funding_requests"]
    assert [(r["package_id"], r["shop_id"]) for r in reqs] == [("TP-02", "syn-026")]


def test_funding_request_is_last_in_the_queue():
    kinds = [act["type"] for _, act in simulate.TICK_QUEUE]
    assert "funding" in kinds and kinds.index("funding") == len(kinds) - 1


def test_declared_certs_act_by_in_the_future(client):
    """Every scripted cert reads "act by in N days" (20-45 days out), never past act-by."""
    seed(client)
    _run_all(client)
    today = FIXED_NOW.date()
    decls = [e for e in events(client) if e["kind"] == "cert_declared"]
    assert len(decls) == 2
    for e in decls:
        cert_type = e["payload"]["cert_type"]
        expires = datetime.fromisoformat(e["payload"]["expires_at"]).date()
        act_by = expires - timedelta(days=simulate.act_by_days(cert_type))
        assert 20 <= (act_by - today).days <= 45, (cert_type, act_by)


def test_act_by_days_matches_renewal_rules():
    assert simulate.act_by_days("NADCAP:HEAT_TREAT") == 90
    assert simulate.act_by_days("NADCAP:CHEM_PROCESSING") == 90
    assert simulate.act_by_days("CPCSC_L1") == 0
    assert simulate.act_by_days("NOT_A_CERT") == 0


def test_tick_marks_events_and_bumps_revision(client):
    seed(client)
    before = revision()
    r = tick(client)
    assert r["event"]["simulated"] is True and r["event"]["payload"]["sim_step"] == "tick-01"
    assert revision() == before + 1
    assert events(client)[-1] == r["event"]


def test_ticks_after_exhaustion_are_noops(client):
    seed(client)
    _run_all(client)
    rev, n = revision(), len(events(client))
    for _ in range(3):
        assert tick(client) == {"event": None, "remaining": 0}
    assert revision() == rev and len(events(client)) == n
    status = ok(client.get("/demo/simulate/status"))
    assert status["queue_length"] == len(simulate.TICK_QUEUE)
    assert status["applied"] == len(NON_FUNDING_STEPS)  # the funding request waits for TP-01
    assert status["remaining"] == 0 and status["next"] is None


def test_tick_skips_offers_a_shop_already_answered(client):
    seed(client)
    # A tester answers as Carapace (tick-01's shop) from the phone app first.
    ok(client.post("/shops/syn-014/offers/NG-017/decision",
                   json={"decision": "declined", "reason_code": "price"}))
    r = tick(client)
    assert r["event"]["payload"]["sim_step"] == "tick-02"
    decision = ok(client.get("/shops/syn-014/actions"))["decisions"][0]
    assert decision["decision"] == "declined"  # never overridden


def test_tick_requires_routing(client):
    ok(client.post("/demo/reset"))
    r = client.post("/demo/simulate/tick")
    assert r.status_code == 400 and "Route the program first" in r.json()["detail"]


def test_reset_clears_simulated_events(client):
    seed(client)
    tick(client)
    ok(client.post("/demo/reset"))
    assert events(client) == []
    status = ok(client.get("/demo/simulate/status"))
    assert status["applied"] == 0 and status["seeded"] is False and status["stage"] == "empty"
    # A new plain upload + route starts the queue from the top again.
    ok(client.post("/programs/northgate/parts", params={"use_demo": "true"}))
    ok(client.post("/programs/northgate/route"))
    assert tick(client)["event"]["payload"]["sim_step"] == "tick-01"


def test_progress_persists_across_state_reload(client):
    seed(client)
    for _ in range(3):
        tick(client)
    cache.clear()
    state = st.load_state()
    assert simulate.applied_steps(state) >= {"tick-01", "tick-02", "tick-03"}
    assert all(e.get("simulated") for e in state.events[1:])
    with TestClient(app_module.app) as fresh:
        status = ok(fresh.get("/demo/simulate/status"))
        assert status["applied"] == 3 and status["next"]["step"] == "tick-04"
        assert tick(fresh)["event"]["payload"]["sim_step"] == "tick-04"


def test_status_before_seed(client):
    ok(client.post("/demo/reset"))
    status = ok(client.get("/demo/simulate/status"))
    assert status == {"queue_length": len(simulate.TICK_QUEUE), "applied": 0, "remaining": 0,
                      "next": None, "seeded": False, "stage": "empty"}
