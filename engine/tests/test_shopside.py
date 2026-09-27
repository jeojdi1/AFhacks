"""Shop-side actions and the activity log (engine/shopside.py, docs/api.md §6).

Every new endpoint: happy path, 400 / 404 / 409, persistence across a State reload, cache
invalidation, and the events emitted on route / fund / decision / ask / capacity / cert.
Also: decisions never change the ledger or the fund response, and the existing views stay
unchanged apart from ``assignment.status``.

Every test runs on its own temporary SQLite file (MUSTER_DB). The routed demo State is
built once per session and copied, so each test starts routed without re-routing.
"""

from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

import engine.app as app_module
from engine import cache, shopside
from engine import state as st

FIXED_NOW = datetime(2026, 9, 26, 21, 30, tzinfo=UTC)
DEMO_SHOP = "syn-012"
EVENT_KEYS = {"seq", "ts", "kind", "shop_id", "shop_name", "job_id", "package_id", "value_cad",
              "credit_cad", "message", "payload"}
DECISION_KEYS = {"shop_id", "job_id", "decision", "reason_code", "question_code", "note", "at",
                 "idempotency_key"}


# --------------------------------------------------------------------------- fixtures


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch):
    monkeypatch.setattr(shopside, "clock", lambda: FIXED_NOW)


def _prepare(path, routed: bool) -> None:
    import os

    old = os.environ.get("MUSTER_DB")
    old_clock = shopside.clock
    os.environ["MUSTER_DB"] = str(path)
    shopside.clock = lambda: FIXED_NOW
    try:
        with TestClient(app_module.app) as c:
            assert c.post("/demo/reset").status_code == 200
            assert c.post("/programs/northgate/parts?use_demo=true").status_code == 200
            if routed:
                assert c.post("/programs/northgate/route").status_code == 200
    finally:
        shopside.clock = old_clock
        if old is None:
            os.environ.pop("MUSTER_DB", None)
        else:
            os.environ["MUSTER_DB"] = old
        cache.clear()


@pytest.fixture(scope="session")
def templates(tmp_path_factory):
    d = tmp_path_factory.mktemp("shopside_templates")
    routed, uploaded = d / "routed.db", d / "uploaded.db"
    _prepare(routed, routed=True)
    _prepare(uploaded, routed=False)
    return {"routed": routed, "uploaded": uploaded}


def _client_from(template, tmp_path, monkeypatch):
    db = tmp_path / "shopside.db"
    shutil.copyfile(template, db)
    monkeypatch.setenv("MUSTER_DB", str(db))
    return TestClient(app_module.app)


@pytest.fixture
def client(templates, tmp_path, monkeypatch):
    """Routed demo program (36 assigned, 4 blocked), no shop actions yet."""
    with _client_from(templates["routed"], tmp_path, monkeypatch) as c:
        yield c


@pytest.fixture
def uploaded(templates, tmp_path, monkeypatch):
    """Parts uploaded but not routed."""
    with _client_from(templates["uploaded"], tmp_path, monkeypatch) as c:
        yield c


# --------------------------------------------------------------------------- helpers


def decide(c, job_id, decision, shop=DEMO_SHOP, **kw):
    return c.post(f"/shops/{shop}/offers/{job_id}/decision", json={"decision": decision, **kw})


def ok(r) -> dict:
    assert r.status_code == 200, r.text
    return r.json()


def err(r, status: int) -> str:
    assert r.status_code == status, r.text
    body = r.json()
    assert set(body) == {"detail"} and isinstance(body["detail"], str)
    return body["detail"]


def events(c, **params) -> dict:
    return ok(c.get("/programs/northgate/events", params=params))


def kinds(c) -> list[str]:
    return [e["kind"] for e in events(c)["events"]]


def assignment(c, job_id) -> dict:
    rows = ok(c.get("/programs/northgate/assignments"))["assignments"]
    return next(a for a in rows if a["job_id"] == job_id)


def revision() -> int:
    return st.state_key()[2]


def shop_offers(c, shop=DEMO_SHOP) -> dict:
    return {o["job_id"]: o for o in ok(c.get(f"/shops/{shop}"))["offers"]}


# --------------------------------------------------------------------------- T3 decisions


def test_route_emits_routed_event_and_routed_at(client):
    ev = events(client)
    assert ev["program_id"] == "northgate" and ev["last_seq"] == 1 and ev["has_more"] is False
    (routed,) = ev["events"]
    assert set(routed) == EVENT_KEYS
    assert routed["kind"] == "routed" and routed["seq"] == 1
    assert routed["ts"] == "2026-09-26T21:30:00Z"
    assert routed["payload"]["assigned"] == 36 and routed["payload"]["blocked"] == 4
    assert "routed 36 of 40 jobs" in routed["message"]
    acts = ok(client.get(f"/shops/{DEMO_SHOP}/actions"))
    assert acts == {"shop_id": DEMO_SHOP, "routed_at": "2026-09-26T21:30:00Z", "decisions": [],
                    "funding_requests": [], "capacity": None, "declared_certs": []}


def test_accept_sets_status_emits_event_and_leaves_ledger(client):
    ledger_before = client.get("/programs/northgate/ledger").content
    gaps_before = client.get("/programs/northgate/gaps").content
    body = ok(decide(client, "NG-021", "accepted", idempotency_key="k-acc"))
    assert set(body) == {"decision", "assignment_status", "event"}
    d = body["decision"]
    assert set(d) == DECISION_KEYS
    assert d == {"shop_id": DEMO_SHOP, "job_id": "NG-021", "decision": "accepted", "reason_code": None,
                 "question_code": None, "note": None, "at": "2026-09-26T21:30:00Z",
                 "idempotency_key": "k-acc"}
    assert body["assignment_status"] == "accepted"
    ev = body["event"]
    assert set(ev) == EVENT_KEYS and ev["kind"] == "offer_accepted" and ev["seq"] == 2
    a = assignment(client, "NG-021")
    assert a["status"] == "accepted"
    assert ev["value_cad"] == a["value_cad"] and ev["credit_cad"] == a["credit_cad"]
    assert ev["message"].startswith("Tallowfield Fabricating Ltd. accepted NG-021 (+$")
    assert shop_offers(client)["NG-021"]["status"] == "accepted"
    # routing and credit are untouched
    assert client.get("/programs/northgate/ledger").content == ledger_before
    assert client.get("/programs/northgate/gaps").content == gaps_before
    assert kinds(client) == ["routed", "offer_accepted"]


def test_decline_with_reason_ledger_unchanged(client):
    ledger_before = ok(client.get("/programs/northgate/ledger"))
    body = ok(decide(client, "NG-022", "declined", reason_code="capacity", note="Full until March"))
    assert body["assignment_status"] == "declined"
    assert body["decision"]["reason_code"] == "capacity" and body["decision"]["note"] == "Full until March"
    ev = body["event"]
    assert ev["kind"] == "offer_declined"
    assert ev["message"] == "Tallowfield Fabricating Ltd. declined NG-022: no capacity"
    assert ev["payload"] == {"reason_code": "capacity", "note": "Full until March"}
    assert assignment(client, "NG-022")["status"] == "declined"
    # a declined job still counts as routed tonight
    assert ok(client.get("/programs/northgate/ledger")) == ledger_before
    prog = ok(client.get("/programs/northgate"))
    assert prog["counts"]["assigned"] == 36 and prog["counts"]["blocked"] == 4


def test_question_keeps_offered_and_emits(client):
    body = ok(decide(client, "NG-021", "question", question_code="lead_time"))
    assert body["assignment_status"] == "offered"
    assert body["event"]["kind"] == "offer_question"
    assert body["event"]["message"] == "Tallowfield Fabricating Ltd. asked about lead time on NG-021"
    assert body["event"]["payload"] == {"question_code": "lead_time"}
    assert assignment(client, "NG-021")["status"] == "offered"
    # irrelevant codes are dropped, not stored
    body = ok(decide(client, "NG-021", "accepted", reason_code="price", question_code="lead_time"))
    assert body["decision"]["reason_code"] is None and body["decision"]["question_code"] is None
    assert body["event"]["payload"] == {"previous": "question"}


def test_undo_restores_offered_and_deletes_decision(client):
    ok(decide(client, "NG-021", "accepted"))
    body = ok(decide(client, "NG-021", "undo"))
    assert body["decision"]["decision"] == "undo"
    assert body["assignment_status"] == "offered"
    assert body["event"]["kind"] == "offer_undo" and body["event"]["payload"] == {"previous": "accepted"}
    assert assignment(client, "NG-021")["status"] == "offered"
    assert ok(client.get(f"/shops/{DEMO_SHOP}/actions"))["decisions"] == []
    detail = err(decide(client, "NG-021", "undo"), 409)
    assert "No decision to undo" in detail


@pytest.mark.parametrize(
    ("payload", "needle"),
    [
        ({"decision": "declined"}, "reason_code is required"),
        ({"decision": "question"}, "question_code is required"),
        ({"decision": "declined", "reason_code": "bored"}, "Unknown reason_code"),
        ({"decision": "question", "question_code": "colour"}, "Unknown question_code"),
        ({"decision": "maybe"}, "decision must be one of"),
        ({"decision": "accepted", "note": "x" * 281}, "at most 280"),
        ({}, "decision"),
    ],
)
def test_decision_400s(client, payload, needle):
    r = client.post(f"/shops/{DEMO_SHOP}/offers/NG-021/decision", json=payload)
    assert needle in err(r, 400)
    assert kinds(client) == ["routed"]


def test_decision_404s(client):
    assert err(decide(client, "NG-021", "accepted", shop="syn-999"), 404) == "Unknown shop 'syn-999'"
    assert err(decide(client, "NG-099", "accepted"), 404) == "Job 'NG-099' is not offered to shop 'syn-012'"
    # a real job, but offered to a different shop
    other = next(a for a in ok(client.get("/programs/northgate/assignments"))["assignments"]
                 if a["shop_id"] != DEMO_SHOP)
    assert "is not offered to shop 'syn-012'" in err(decide(client, other["job_id"], "accepted"), 404)


def test_actions_before_routing_400(uploaded):
    assert err(decide(uploaded, "NG-021", "accepted"), 400) == "Route the program first"
    r = uploaded.post(f"/shops/{DEMO_SHOP}/funding-requests", json={"requirement": "CWB_W47.1"})
    assert err(r, 400) == "Route the program first"
    # the reads work (empty) before routing
    acts = ok(uploaded.get(f"/shops/{DEMO_SHOP}/actions"))
    assert acts["routed_at"] is None and acts["decisions"] == []
    assert err(uploaded.get("/programs/northgate/training/TP-01/seats/1"), 404) == \
        "Unknown training package 'TP-01'"


def test_decision_idempotency(client):
    first = ok(decide(client, "NG-022", "declined", reason_code="capacity", idempotency_key="same"))
    rev = revision()
    again = ok(decide(client, "NG-022", "declined", reason_code="capacity", idempotency_key="same"))
    assert again == first
    assert revision() == rev, "a replay must not write a new revision"
    assert kinds(client) == ["routed", "offer_declined"]
    # same key, different request
    assert "already used" in err(decide(client, "NG-022", "accepted", idempotency_key="same"), 409)
    # the same answer under a new key: stored, but nothing new for the prime
    third = ok(decide(client, "NG-022", "declined", reason_code="capacity", idempotency_key="other"))
    assert third["event"] is None and third["decision"] == first["decision"]
    assert kinds(client) == ["routed", "offer_declined"]


def reply(c, job_id, reply_code="yes_date", text="Yes, November works", shop=DEMO_SHOP, **kw):
    return c.post(f"/shops/{shop}/offers/{job_id}/reply",
                  json={"reply_code": reply_code, "text": text, **kw})


def test_prime_reply_reaches_the_shop(client):
    ledger_before = client.get("/programs/northgate/ledger").content
    ok(decide(client, "NG-021", "question", question_code="lead_time", idempotency_key="q-1"))
    body = ok(reply(client, "NG-021", idempotency_key="r-1"))
    assert set(body) == {"decision", "event"}
    d = body["decision"]
    assert set(d) == DECISION_KEYS | {"reply"}
    assert d["decision"] == "question" and d["question_code"] == "lead_time"
    assert d["reply"] == {"code": "yes_date", "text": "Yes, November works", "at": "2026-09-26T21:30:00Z"}
    ev = body["event"]
    assert set(ev) == EVENT_KEYS and ev["kind"] == "offer_reply"
    assert ev["shop_id"] == DEMO_SHOP and ev["job_id"] == "NG-021"
    assert ev["message"] == 'Northgate replied to Tallowfield Fabricating Ltd. on NG-021: "Yes, November works"'
    assert ev["payload"] == {"reply_code": "yes_date", "question_code": "lead_time"}
    # the shop sees it on its actions and the prime on the program actions
    shop_d = ok(client.get(f"/shops/{DEMO_SHOP}/actions"))["decisions"]
    assert [x.get("reply") for x in shop_d] == [d["reply"]]
    prog_d = ok(client.get("/programs/northgate/actions"))["decisions"]
    assert [x.get("reply") for x in prog_d] == [d["reply"]]
    assert kinds(client) == ["routed", "offer_question", "offer_reply"]
    assert assignment(client, "NG-021")["status"] == "offered"
    assert client.get("/programs/northgate/ledger").content == ledger_before
    # replay: same key, same body -> byte-identical, no write, no event
    rev = revision()
    assert ok(reply(client, "NG-021", idempotency_key="r-1")) == body
    assert revision() == rev
    assert "already used" in err(reply(client, "NG-021", text="No", idempotency_key="r-1"), 409)
    # same reply under a new key: nothing new
    again = ok(reply(client, "NG-021", idempotency_key="r-2"))
    assert again["event"] is None and again["decision"] == d
    # a changed reply replaces it and names the previous code
    changed = ok(reply(client, "NG-021", reply_code="no_date", text="December at the earliest"))
    assert changed["decision"]["reply"]["code"] == "no_date"
    assert changed["event"]["payload"] == {"reply_code": "no_date", "question_code": "lead_time",
                                           "previous_reply_code": "yes_date"}
    # the shop answering again replaces the record and so drops the reply
    ok(decide(client, "NG-021", "accepted"))
    acc = ok(client.get(f"/shops/{DEMO_SHOP}/actions"))["decisions"]
    assert acc[0]["decision"] == "accepted" and "reply" not in acc[0]
    assert "No open question" in err(reply(client, "NG-021"), 409)


def test_prime_reply_persists_and_route_clears_it(client):
    ok(decide(client, "NG-021", "question", question_code="first_article"))
    ok(reply(client, "NG-021"))
    before = ok(client.get(f"/shops/{DEMO_SHOP}/actions"))
    st.save_state(st.load_state("northgate"))
    cache_cleared = ok(client.get(f"/shops/{DEMO_SHOP}/actions"))
    assert cache_cleared == before and before["decisions"][0]["reply"]["text"] == "Yes, November works"
    ok(client.post("/programs/northgate/route"))
    assert ok(client.get(f"/shops/{DEMO_SHOP}/actions"))["decisions"] == []


def test_prime_reply_errors(client):
    assert "No open question" in err(reply(client, "NG-021"), 409)
    ok(decide(client, "NG-022", "declined", reason_code="capacity"))
    assert "No open question" in err(reply(client, "NG-022"), 409)
    ok(decide(client, "NG-021", "question", question_code="lead_time"))
    assert err(reply(client, "NG-021", shop="syn-999"), 404) == "Unknown shop 'syn-999'"
    assert "is not offered to shop" in err(reply(client, "NG-099"), 404)
    assert err(reply(client, "NG-021", reply_code="x" * 41), 400) == "reply_code must be at most 40 characters"
    assert err(reply(client, "NG-021", text="x" * 281), 400) == "text must be at most 280 characters"
    assert err(reply(client, "NG-021", text="   "), 400) == "text is required"
    assert err(reply(client, "NG-021", reply_code=" "), 400) == "reply_code is required"
    r = client.post(f"/shops/{DEMO_SHOP}/offers/NG-021/reply", json={"text": "hi"})
    assert err(r, 400) == "reply_code is required"
    assert kinds(client) == ["routed", "offer_declined", "offer_question"]


def test_prime_reply_before_routing_400(uploaded):
    assert err(reply(uploaded, "NG-021"), 400) == "Route the program first"


def test_decisions_do_not_change_fund_response(client, templates, tmp_path, monkeypatch):
    ok(decide(client, "NG-021", "accepted"))
    ok(decide(client, "NG-022", "declined", reason_code="price"))
    with_decisions = ok(client.post("/programs/northgate/training/TP-01/fund"))
    # decided statuses survive funding (fund only adds the unblocked jobs)
    assert assignment(client, "NG-021")["status"] == "accepted"
    assert assignment(client, "NG-022")["status"] == "declined"
    clean_db = tmp_path / "clean.db"
    shutil.copyfile(templates["routed"], clean_db)
    monkeypatch.setenv("MUSTER_DB", str(clean_db))
    clean = ok(client.post("/programs/northgate/training/TP-01/fund"))
    assert with_decisions == clean


# --------------------------------------------------------------------------- persistence + cache


def test_actions_persist_across_state_reload(client):
    ok(decide(client, "NG-021", "accepted", idempotency_key="persist-1"))
    ok(client.post(f"/shops/{DEMO_SHOP}/funding-requests", json={"requirement": "CWB_W47.1"}))
    ok(client.post(f"/shops/{DEMO_SHOP}/capacity", json={"hours_week": 40}))
    ok(client.post(f"/shops/{DEMO_SHOP}/certifications/CPCSC_L1", json={"expires_at": "2027-04-30"}))
    before = ok(client.get(f"/shops/{DEMO_SHOP}/actions"))
    cache.clear()  # as after an engine restart: everything comes back from SQLite
    s = st.load_state()
    assert set(s.offer_decisions) == {"syn-012:NG-021"}
    assert set(s.funding_requests) == {"TP-01"}
    assert s.capacity_checkins[DEMO_SHOP]["hours_week"] == 40
    assert s.cert_declarations[DEMO_SHOP]["CPCSC_L1"]["expires_at"] == "2027-04-30"
    assert [e["kind"] for e in s.events] == ["routed", "offer_accepted", "funding_requested",
                                             "capacity_confirmed", "cert_declared"]
    assert s.event_seq == 5 and "persist-1" in s.idempotency
    with TestClient(app_module.app) as fresh:
        assert ok(fresh.get(f"/shops/{DEMO_SHOP}/actions")) == before
        # the idempotency record survived too
        again = ok(decide(fresh, "NG-021", "accepted", idempotency_key="persist-1"))
        assert again["event"]["seq"] == 2


def test_old_database_without_new_fields_loads(client):
    s = st.load_state()
    data = json.loads(st.to_json(s))
    for k in ("offer_decisions", "funding_requests", "capacity_checkins", "cert_declarations",
              "events", "event_seq", "idempotency"):
        data.pop(k)
    conn = st.connect()
    with conn:
        conn.execute("UPDATE state SET json = ?, revision = revision + 1 WHERE program_id = 'northgate'",
                     (json.dumps(data),))
    conn.close()
    acts = ok(client.get(f"/shops/{DEMO_SHOP}/actions"))
    assert acts["routed_at"] is None and acts["decisions"] == []
    body = ok(decide(client, "NG-021", "accepted"))
    assert body["event"]["seq"] == 1


def test_every_mutation_invalidates_cached_views(client):
    # warm every cached view
    for path in (f"/shops/{DEMO_SHOP}/actions", "/programs/northgate/actions", "/programs/northgate/events",
                 "/programs/northgate/assignments", f"/shops/{DEMO_SHOP}"):
        ok(client.get(path))
        ok(client.get(path))
    rev = revision()
    ok(decide(client, "NG-021", "accepted"))
    assert revision() == rev + 1
    assert ok(client.get(f"/shops/{DEMO_SHOP}/actions"))["decisions"][0]["job_id"] == "NG-021"
    assert ok(client.get("/programs/northgate/actions"))["decisions"][0]["job_id"] == "NG-021"
    assert events(client)["last_seq"] == 2
    assert assignment(client, "NG-021")["status"] == "accepted"
    assert shop_offers(client)["NG-021"]["status"] == "accepted"

    steps = [
        lambda: client.post(f"/shops/{DEMO_SHOP}/funding-requests", json={"requirement": "CWB_W47.1"}),
        lambda: client.post(f"/shops/{DEMO_SHOP}/capacity", json={"hours_week": 40}),
        lambda: client.post(f"/shops/{DEMO_SHOP}/certifications/CPCSC_L1", json={"expires_at": "2027-04-30"}),
    ]
    for i, step in enumerate(steps, start=3):
        rev = revision()
        ok(step())
        assert revision() == rev + 1
        assert events(client)["last_seq"] == i
    acts = ok(client.get(f"/shops/{DEMO_SHOP}/actions"))
    assert acts["funding_requests"] and acts["capacity"] and acts["declared_certs"]


# --------------------------------------------------------------------------- lifecycle


def test_upload_clears_program_actions_keeps_shop_facts(client):
    ok(decide(client, "NG-021", "accepted", idempotency_key="life-1"))
    ok(client.post(f"/shops/{DEMO_SHOP}/funding-requests", json={"requirement": "CWB_W47.1"}))
    ok(client.post(f"/shops/{DEMO_SHOP}/capacity", json={"hours_week": 40}))
    ok(client.post(f"/shops/{DEMO_SHOP}/certifications/CPCSC_L1", json={"expires_at": "2027-04-30"}))
    ok(client.post("/programs/northgate/parts?use_demo=true"))
    acts = ok(client.get(f"/shops/{DEMO_SHOP}/actions"))
    assert acts["decisions"] == [] and acts["funding_requests"] == [] and acts["routed_at"] is None
    assert acts["capacity"]["hours_week"] == 40
    assert [d["type"] for d in acts["declared_certs"]] == ["CPCSC_L1"]
    ev = events(client)
    assert ev["events"] == [] and ev["last_seq"] == 0
    assert st.load_state().idempotency == {}
    # route: a fresh routed event; seq keeps counting so pollers never miss it
    ok(client.post("/programs/northgate/route"))
    ev = events(client)
    assert [e["kind"] for e in ev["events"]] == ["routed"] and ev["events"][0]["seq"] == 6


def test_route_clears_decisions_and_requests(client):
    ok(decide(client, "NG-021", "accepted", idempotency_key="r-1"))
    ok(client.post(f"/shops/{DEMO_SHOP}/funding-requests", json={"requirement": "CWB_W47.1"}))
    ok(client.post(f"/shops/{DEMO_SHOP}/capacity", json={"hours_week": 40, "idempotency_key": "cap-1"}))
    ok(client.post("/programs/northgate/route"))
    acts = ok(client.get(f"/shops/{DEMO_SHOP}/actions"))
    assert acts["decisions"] == [] and acts["funding_requests"] == []
    assert acts["capacity"] is not None
    assert assignment(client, "NG-021")["status"] == "offered"
    assert kinds(client) == ["routed", "offer_accepted", "funding_requested", "capacity_confirmed", "routed"]
    idem = st.load_state().idempotency
    assert "r-1" not in idem and "cap-1" in idem
    # the key can be used again after a re-route
    assert ok(decide(client, "NG-021", "accepted", idempotency_key="r-1"))["event"] is not None


def test_reset_clears_everything(client):
    ok(decide(client, "NG-021", "accepted"))
    ok(client.post(f"/shops/{DEMO_SHOP}/capacity", json={"hours_week": 40}))
    ok(client.post("/demo/reset"))
    acts = ok(client.get(f"/shops/{DEMO_SHOP}/actions"))
    assert acts == {"shop_id": DEMO_SHOP, "routed_at": None, "decisions": [], "funding_requests": [],
                    "capacity": None, "declared_certs": []}
    assert events(client) == {"program_id": "northgate", "last_seq": 0, "has_more": False, "events": []}


# --------------------------------------------------------------------------- T5 funding requests


def test_funding_request_happy_repeat_and_funded(client):
    body = ok(client.post(f"/shops/{DEMO_SHOP}/funding-requests",
                          json={"requirement": "CWB_W47.1", "idempotency_key": "fr-1"}))
    assert body["request"] == {"package_id": "TP-01", "shop_id": DEMO_SHOP, "requirement": "CWB_W47.1",
                               "status": "requested", "at": "2026-09-26T21:30:00Z",
                               "idempotency_key": "fr-1"}
    pkg = next(p for p in ok(client.get("/programs/northgate/gaps"))["suggestions"] if p["id"] == "TP-01")
    ev = body["event"]
    assert ev["kind"] == "funding_requested" and ev["package_id"] == "TP-01"
    assert ev["value_cad"] == pkg["unblocks_value_cad"] and ev["credit_cad"] == pkg["est_credit_cad"]
    assert "asked Northgate to fund CWB W47.1" in ev["message"]
    # replay
    assert ok(client.post(f"/shops/{DEMO_SHOP}/funding-requests",
                          json={"requirement": "CWB_W47.1", "idempotency_key": "fr-1"})) == body
    # repeat with a new key: the existing request, no new event
    rep = ok(client.post(f"/shops/{DEMO_SHOP}/funding-requests", json={"requirement": "CWB_W47.1"}))
    assert rep == {"request": body["request"], "event": None}
    assert kinds(client) == ["routed", "funding_requested"]
    # the prime funds it: derived status, package_funded event, and further requests are 409
    fund = ok(client.post("/programs/northgate/training/TP-01/fund"))
    assert ok(client.get(f"/shops/{DEMO_SHOP}/actions"))["funding_requests"][0]["status"] == "funded"
    assert ok(client.get("/programs/northgate/actions"))["funding_requests"][0]["status"] == "funded"
    funded = events(client)["events"][-1]
    assert funded["kind"] == "package_funded" and funded["package_id"] == "TP-01"
    assert funded["credit_cad"] == fund["credit_added"]
    assert funded["payload"]["unblocked_job_ids"] == [a["job_id"] for a in fund["unblocked_jobs"]]
    assert funded["payload"]["headline"] == fund["headline"]
    detail = err(client.post(f"/shops/{DEMO_SHOP}/funding-requests", json={"requirement": "CWB_W47.1"}), 409)
    assert detail == "Training package 'TP-01' is already funded"


def test_funding_request_errors(client):
    r = client.post(f"/shops/{DEMO_SHOP}/funding-requests", json={"requirement": "AS9100"})
    assert err(r, 404) == "No training package for AS9100 at shop 'syn-012'"
    r = client.post("/shops/syn-999/funding-requests", json={"requirement": "CWB_W47.1"})
    assert err(r, 404) == "Unknown shop 'syn-999'"
    assert "requirement" in err(client.post(f"/shops/{DEMO_SHOP}/funding-requests", json={}), 400)
    assert "requirement" in err(client.post(f"/shops/{DEMO_SHOP}/funding-requests",
                                            json={"requirement": "  "}), 400)


def test_fund_without_request_still_emits(client):
    fund = ok(client.post("/programs/northgate/training/TP-01/fund"))
    ev = events(client)["events"]
    assert [e["kind"] for e in ev] == ["routed", "package_funded"]
    assert ev[-1]["credit_cad"] == fund["credit_added"]
    assert ev[-1]["shop_id"] == DEMO_SHOP and ev[-1]["shop_name"] == "Tallowfield Fabricating Ltd."


# --------------------------------------------------------------------------- T7 capacity


def test_capacity_checkin_over_by_and_no_routing_change(client):
    shop_before = ok(client.get(f"/shops/{DEMO_SHOP}"))
    ledger_before = client.get("/programs/northgate/ledger").content
    offers = shop_offers(client)
    offered = sum(o["hours_week"] for o in offers.values())
    for jid in offers:
        ok(decide(client, jid, "accepted"))
    body = ok(client.post(f"/shops/{DEMO_SHOP}/capacity",
                          json={"by_process": {"welding": 20, "sheet_metal": 0, "painting": 0},
                                "horizon_weeks": 8, "idempotency_key": "cap"}))
    assert body["capacity"] == {"shop_id": DEMO_SHOP, "hours_week": 20,
                                "by_process": {"welding": 20, "sheet_metal": 0, "painting": 0},
                                "horizon_weeks": 8, "confirmed_at": "2026-09-26T21:30:00Z",
                                "used_in_routing": False}
    assert body["accepted_load_hours"] == offered and body["offered_load_hours"] == offered
    assert body["over_by_hours"] == offered - 20
    ev = body["event"]
    assert ev["kind"] == "capacity_confirmed" and ev["value_cad"] is None
    assert ev["message"].endswith(f"over by {offered - 20} h")
    assert ev["payload"]["over_by_hours"] == offered - 20
    # replay: no new event
    assert ok(client.post(f"/shops/{DEMO_SHOP}/capacity",
                          json={"by_process": {"welding": 20, "sheet_metal": 0, "painting": 0},
                                "horizon_weeks": 8, "idempotency_key": "cap"})) == body
    assert kinds(client).count("capacity_confirmed") == 1
    # routing inputs untouched
    after = ok(client.get(f"/shops/{DEMO_SHOP}"))
    assert after["shop"] == shop_before["shop"]
    assert after["readiness"] == shop_before["readiness"]
    assert client.get("/programs/northgate/ledger").content == ledger_before
    # the program feed lists check-ins
    assert ok(client.get("/programs/northgate/actions"))["capacity"][0]["shop_id"] == DEMO_SHOP


def test_capacity_hours_week_given_and_before_routing(uploaded):
    body = ok(uploaded.post(f"/shops/{DEMO_SHOP}/capacity", json={"hours_week": 40}))
    assert body["capacity"]["hours_week"] == 40 and body["capacity"]["horizon_weeks"] == 4
    assert body["capacity"]["by_process"] is None
    assert body["accepted_load_hours"] == 0 and body["offered_load_hours"] == 0
    assert body["over_by_hours"] == 0
    assert body["event"]["message"] == "Tallowfield Fabricating Ltd.: 40 h/wk free · accepted 0 h/wk"


@pytest.mark.parametrize(
    ("payload", "status", "needle"),
    [
        ({"hours_week": -1}, 400, "between 0 and 2000"),
        ({"hours_week": 2001}, 400, "between 0 and 2000"),
        ({"by_process": {"knitting": 10}}, 400, "Unknown process_tag 'knitting'"),
        ({"by_process": {"welding": -5}}, 400, "between 0 and 2000"),
        ({"by_process": {"welding": 1500, "painting": 600}}, 400, "between 0 and 2000"),
        ({"hours_week": 40, "horizon_weeks": 5}, 400, "horizon_weeks must be 4, 8 or 12"),
        ({}, 400, "Send hours_week or by_process"),
        ({"hours_week": "lots"}, 400, "hours_week"),
    ],
)
def test_capacity_400s(client, payload, status, needle):
    r = client.post(f"/shops/{DEMO_SHOP}/capacity", json=payload)
    assert needle in err(r, status)


def test_capacity_unknown_shop_404(client):
    assert err(client.post("/shops/syn-999/capacity", json={"hours_week": 40}), 404) == "Unknown shop 'syn-999'"


# --------------------------------------------------------------------------- T4 declared expiries


def test_cert_declaration_stored_only(client):
    certs_before = ok(client.get(f"/shops/{DEMO_SHOP}"))["certifications"]
    body = ok(client.post(f"/shops/{DEMO_SHOP}/certifications/CPCSC_L1",
                          json={"expires_at": "2027-04-30", "cert_number": "SA-2026-0042",
                                "idempotency_key": "cert-1"}))
    assert body["declaration"] == {"shop_id": DEMO_SHOP, "type": "CPCSC_L1", "expires_at": "2027-04-30",
                                   "cert_number": "SA-2026-0042", "status": "declared",
                                   "declared_at": "2026-09-26T21:30:00Z",
                                   "note": "Shop-declared; not used for routing until reviewed"}
    ev = body["event"]
    assert ev["kind"] == "cert_declared"
    assert ev["payload"] == {"cert_type": "CPCSC_L1", "expires_at": "2027-04-30"}
    assert "shop-declared" in ev["message"]
    # never touches the shop's certifications (or routing)
    assert ok(client.get(f"/shops/{DEMO_SHOP}"))["certifications"] == certs_before
    # replay + re-declare replaces
    assert ok(client.post(f"/shops/{DEMO_SHOP}/certifications/CPCSC_L1",
                          json={"expires_at": "2027-04-30", "cert_number": "SA-2026-0042",
                                "idempotency_key": "cert-1"})) == body
    ok(client.post(f"/shops/{DEMO_SHOP}/certifications/CPCSC_L1", json={"expires_at": "2027-05-01"}))
    decl = ok(client.get(f"/shops/{DEMO_SHOP}/actions"))["declared_certs"]
    assert [(d["type"], d["expires_at"]) for d in decl] == [("CPCSC_L1", "2027-05-01")]
    # cert types with ':' and '.' work in the path
    ok(client.post(f"/shops/{DEMO_SHOP}/certifications/NADCAP:HEAT_TREAT", json={"expires_at": "2027-01-01"}))
    ok(client.post(f"/shops/{DEMO_SHOP}/certifications/CWB_W47.1", json={"expires_at": "2028-01-01"}))
    assert kinds(client).count("cert_declared") == 4


@pytest.mark.parametrize(
    ("cert", "payload", "status", "needle"),
    [
        ("WIZARD", {"expires_at": "2027-01-01"}, 400, "Unknown cert_type 'WIZARD'"),
        ("CGP", {"expires_at": "2027-02-30"}, 400, "not a valid date"),
        ("CGP", {"expires_at": "30/01/2027"}, 400, "YYYY-MM-DD"),
        ("CGP", {"expires_at": "2036-09-27"}, 400, "more than 10 years"),
        ("CGP", {"expires_at": "1999-12-31"}, 400, "before 2000"),
        ("CGP", {"expires_at": "2027-01-01", "cert_number": "x" * 41}, 400, "at most 40"),
        ("CGP", {}, 400, "expires_at"),
    ],
)
def test_cert_declaration_400s(client, cert, payload, status, needle):
    assert needle in err(client.post(f"/shops/{DEMO_SHOP}/certifications/{cert}", json=payload), status)


def test_cert_declaration_edges(client):
    ok(client.post(f"/shops/{DEMO_SHOP}/certifications/CGP", json={"expires_at": "2036-09-26"}))  # exactly 10y
    ok(client.post(f"/shops/{DEMO_SHOP}/certifications/CGP", json={"expires_at": "2026-01-01"}))  # lapsed is fine
    r = client.post("/shops/syn-999/certifications/CGP", json={"expires_at": "2027-01-01"})
    assert err(r, 404) == "Unknown shop 'syn-999'"


# --------------------------------------------------------------------------- reads


def test_program_actions_and_events_paging(client):
    ok(decide(client, "NG-021", "accepted"))
    ok(decide(client, "NG-022", "question", question_code="first_article"))
    ok(client.post("/shops/syn-001/capacity", json={"hours_week": 30}))
    ok(client.post(f"/shops/{DEMO_SHOP}/capacity", json={"hours_week": 40}))
    ok(client.post("/shops/syn-001/certifications/CGP", json={"expires_at": "2027-01-15"}))
    pa = ok(client.get("/programs/northgate/actions"))
    assert set(pa) == {"program_id", "routed_at", "decisions", "funding_requests", "capacity", "declared_certs"}
    assert [d["job_id"] for d in pa["decisions"]] == ["NG-021", "NG-022"]
    assert [c["shop_id"] for c in pa["capacity"]] == ["syn-001", DEMO_SHOP]
    assert [d["shop_id"] for d in pa["declared_certs"]] == ["syn-001"]
    # per-shop view filters
    assert ok(client.get("/shops/syn-001/actions"))["decisions"] == []
    # paging
    ev = events(client, since=0, limit=2)
    assert [e["seq"] for e in ev["events"]] == [1, 2] and ev["has_more"] is True and ev["last_seq"] == 6
    ev = events(client, since=2, limit=100)
    assert [e["seq"] for e in ev["events"]] == [3, 4, 5, 6] and ev["has_more"] is False
    assert events(client, since=6)["events"] == []
    # errors
    assert err(client.get("/programs/nope/events"), 404) == "Unknown program 'nope'"
    assert err(client.get("/programs/nope/actions"), 404) == "Unknown program 'nope'"
    assert err(client.get("/shops/syn-999/actions"), 404) == "Unknown shop 'syn-999'"
    err(client.get("/programs/northgate/events", params={"since": -1}), 400)
    err(client.get("/programs/northgate/events", params={"limit": 0}), 400)


def test_trainee_seat_before_and_after_funding(client):
    seat = ok(client.get("/programs/northgate/training/TP-01/seats/3"))
    assert seat["label"] == "Seat 3 of 4 · TP-01" and seat["seats"] == 4
    assert seat["stage"] == "not_funded" and seat["funded_at"] is None and seat["example_test_date"] is None
    assert seat["funding_requested_at"] is None
    assert seat["jobs_unlocked"] == ["NG-031", "NG-032", "NG-033"] and seat["jobs_now_assigned"] == []
    assert seat["shop_label"] == "Synthetic"
    # pseudonymous: no personal fields at all
    assert not {k for k in seat if "name" in k} - {"shop_name"}
    ok(client.post(f"/shops/{DEMO_SHOP}/funding-requests", json={"requirement": "CWB_W47.1"}))
    assert ok(client.get("/programs/northgate/training/TP-01/seats/3"))["funding_requested_at"] is not None
    ok(client.post("/programs/northgate/training/TP-01/fund"))
    seat = ok(client.get("/programs/northgate/training/TP-01/seats/3"))
    assert seat["stage"] == "enrolled" and seat["package_status"] == "funded"
    assert seat["funded_at"] == "2026-09-26T21:30:00Z" and seat["example_test_date"] == "2026-11-07"
    assert seat["jobs_now_assigned"] == ["NG-031", "NG-032", "NG-033"]
    assert err(client.get("/programs/northgate/training/TP-01/seats/5"), 404) == \
        "Seat 5 does not exist on TP-01 (4 seats)"
    err(client.get("/programs/northgate/training/TP-01/seats/0"), 404)
    assert err(client.get("/programs/northgate/training/TP-77/seats/1"), 404) == \
        "Unknown training package 'TP-77'"
    err(client.get("/programs/northgate/training/TP-01/seats/three"), 400)


# --------------------------------------------------------------------------- CORS


@pytest.mark.parametrize(
    ("origin", "allowed"),
    [
        ("http://localhost:3000", True),
        ("http://127.0.0.1:3101", True),
        ("http://192.168.1.23:3000", True),
        ("http://10.0.0.5:3000", True),
        ("http://172.20.4.9", True),
        ("http://172.32.0.1:3000", False),
        ("http://192.168.1.23.evil.example", False),
        ("https://evil.example", False),
    ],
)
def test_cors_lan_origins(client, origin, allowed):
    r = client.get("/health", headers={"Origin": origin})
    assert (r.headers.get("access-control-allow-origin") == origin) is allowed


# --------------------------------------------------------------------------- contract goldens


def test_app_fixtures_are_current(monkeypatch):
    """data/fixtures/app/* equals a fresh deterministic run (scripts/build_app_fixtures.py)."""
    import importlib.util
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location("build_app_fixtures", root / "scripts" / "build_app_fixtures.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    files = mod.build()
    out = root / "data" / "fixtures" / "app"
    assert sorted(files) == sorted(p.name for p in out.glob("*.json"))
    for name, obj in files.items():
        assert (out / name).read_text(encoding="utf-8") == mod.dumps(obj), f"stale fixture {name}"
    # the examples tell the demo story
    assert files["decision_decline_NG-022.json"]["event"]["message"] == \
        "Tallowfield Fabricating Ltd. declined NG-022: no capacity"
    assert files["funding_request_TP-01.json"]["request"]["status"] == "requested"
    assert files["shop_actions_syn-012.json"]["funding_requests"][0]["status"] == "funded"
    assert [e["kind"] for e in files["events.json"]["events"]] == [
        "routed", "offer_question", "offer_accepted", "offer_declined", "funding_requested",
        "capacity_confirmed", "cert_declared", "package_funded"]
