"""Award onboarding after an accept (engine/award.py, docs/api.md §6.1).

Document list per job type, 404/409 rules, idempotent "done", call slot validation,
events, persistence across a reload, reset / route / upload clearing, and the ledger
staying unchanged. Each test runs on its own copy of a routed (and TP-01 funded) State.
"""

from __future__ import annotations

import os
import shutil
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

import engine.app as app_module
from engine import award, cache, shopside
from engine import state as st

FIXED_NOW = datetime(2026, 9, 26, 21, 30, tzinfo=UTC)  # a Saturday (Eastern: Sat 17:30)
DEMO_SHOP = "syn-012"
PLAIN_JOB = "NG-021"  # syn-012, not controlled, no certificates
CWB_JOB = "NG-031"  # syn-012 after TP-01 is funded (CWB W47.1, welders in training)
CONTROLLED_JOB = "NG-024"  # controlled, CPCSC L1 + ISO 9001
AWARD_KEYS = {"shop_id", "job_id", "part_no", "description", "value_cad", "hours_week", "credit_cad",
              "controlled", "required_certs", "status", "documents", "call", "next_steps"}


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch):
    monkeypatch.setattr(shopside, "clock", lambda: FIXED_NOW)


def _prepare(path, routed: bool) -> None:
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
                assert c.post("/programs/northgate/training/TP-01/fund").status_code == 200
    finally:
        shopside.clock = old_clock
        if old is None:
            os.environ.pop("MUSTER_DB", None)
        else:
            os.environ["MUSTER_DB"] = old
        cache.clear()


@pytest.fixture(scope="session")
def templates(tmp_path_factory):
    d = tmp_path_factory.mktemp("award_templates")
    routed, uploaded = d / "routed.db", d / "uploaded.db"
    _prepare(routed, routed=True)
    _prepare(uploaded, routed=False)
    return {"routed": routed, "uploaded": uploaded}


def _client_from(template, tmp_path, monkeypatch):
    db = tmp_path / "award.db"
    shutil.copyfile(template, db)
    monkeypatch.setenv("MUSTER_DB", str(db))
    cache.clear()
    return TestClient(app_module.app)


@pytest.fixture
def client(templates, tmp_path, monkeypatch):
    with _client_from(templates["routed"], tmp_path, monkeypatch) as c:
        yield c


@pytest.fixture
def uploaded(templates, tmp_path, monkeypatch):
    with _client_from(templates["uploaded"], tmp_path, monkeypatch) as c:
        yield c


# --------------------------------------------------------------------------- helpers


def ok(r) -> dict:
    assert r.status_code == 200, r.text
    return r.json()


def err(r, status: int) -> str:
    assert r.status_code == status, r.text
    return r.json()["detail"]


def holder(c, job_id) -> str:
    rows = ok(c.get("/programs/northgate/assignments"))["assignments"]
    return next(a["shop_id"] for a in rows if a["job_id"] == job_id)


def accept(c, job_id, shop=None) -> str:
    shop = shop or holder(c, job_id)
    ok(c.post(f"/shops/{shop}/offers/{job_id}/decision", json={"decision": "accepted"}))
    return shop


def get_award(c, job_id, shop=DEMO_SHOP):
    return c.get(f"/shops/{shop}/offers/{job_id}/award")


def done(c, job_id, key, shop=DEMO_SHOP):
    return c.post(f"/shops/{shop}/offers/{job_id}/award/documents/{key}", json={})


def book(c, job_id, slot, shop=DEMO_SHOP):
    return c.post(f"/shops/{shop}/offers/{job_id}/award/call", json={"slot": slot})


def events(c) -> list[dict]:
    return ok(c.get("/programs/northgate/events", params={"limit": 500}))["events"]


def keys(a) -> list[str]:
    return [d["key"] for d in a["documents"]]


# --------------------------------------------------------------------------- documents


def test_plain_job_documents_and_shape(client):
    accept(client, PLAIN_JOB, DEMO_SHOP)
    a = ok(get_award(client, PLAIN_JOB))
    assert AWARD_KEYS <= set(a)
    assert keys(a) == ["subcontract", "nda", "quality", "fai", "ccv", "insurance"]
    assert a["controlled"] is False and "cgp" not in keys(a)
    assert a["status"] == "not_started" and a["done"] == 1 and a["total"] == 6
    docs = {d["key"]: d for d in a["documents"]}
    assert docs["quality"]["kind"] == "auto" and docs["quality"]["status"] == "done"
    assert all(docs[k]["status"] == "todo" and docs[k]["done_at"] is None for k in ("subcontract", "fai"))
    sub = docs["subcontract"]["detail"]
    assert "1,440 × NG-STW-2210" in sub and "$640.00" in sub and "$921,600" in sub and "Net 30 payment (assumption)" in sub
    assert "91%" in docs["ccv"]["detail"] and "Simplified ITB rules for demo" in docs["ccv"]["detail"]
    for d in a["documents"]:
        assert d["kind"] in ("sign", "upload", "auto") and d["title"] and d["why"]
    call = a["call"]
    assert call["booked"] is False and call["slot"] is None
    assert call["with"] == "Northgate supplier development (fictional)"
    assert "Controlled goods handling" not in call["agenda"]
    assert call["agenda"][:4] == ["Scope and quantities", "Delivery schedule",
                                  "Quality plan and first article", "ITB reporting (Canadian content)"]
    # Sat Sep 26 → Mon Sep 28 .. Fri Oct 2, 10:00 and 14:00 Eastern.
    assert len(call["slots"]) == 10
    assert call["slots"][0] == "2026-09-28T10:00:00-04:00"
    assert call["slots"][-1] == "2026-10-02T14:00:00-04:00"
    assert a["next_steps"]


def test_controlled_job_gets_cgp_and_cpcsc(client):
    shop = accept(client, CONTROLLED_JOB)
    a = ok(get_award(client, CONTROLLED_JOB, shop))
    assert a["controlled"] is True
    assert keys(a) == ["subcontract", "nda", "cgp", "cpcsc", "quality", "fai", "ccv", "insurance"]
    cgp = next(d for d in a["documents"] if d["key"] == "cgp")
    assert cgp["kind"] == "sign" and "Shieldworks never stores drawings" in cgp["detail"]
    assert "Controlled goods handling" in a["call"]["agenda"]


def test_cwb_job_quality_mentions_welders_in_training(client):
    assert holder(client, CWB_JOB) == DEMO_SHOP
    accept(client, CWB_JOB, DEMO_SHOP)
    a = ok(get_award(client, CWB_JOB))
    quality = next(d for d in a["documents"] if d["key"] == "quality")
    assert "welders in training" in quality["detail"] and "(assumption)" in quality["detail"]
    assert "cgp" not in keys(a)


# --------------------------------------------------------------------------- errors


def test_404_before_routing(uploaded):
    err(get_award(uploaded, PLAIN_JOB), 404)  # not routed: no offer yet
    err(done(uploaded, PLAIN_JOB, "nda"), 404)


def test_404_and_409_rules(client):
    err(get_award(client, PLAIN_JOB, "syn-999"), 404)  # unknown shop
    err(get_award(client, "NG-999"), 404)  # unknown job
    other = holder(client, CONTROLLED_JOB)
    err(get_award(client, CONTROLLED_JOB, DEMO_SHOP if other != DEMO_SHOP else "syn-001"), 404)
    assert "Accept the offer first" in err(get_award(client, PLAIN_JOB), 409)  # still offered
    err(done(client, PLAIN_JOB, "nda"), 409)
    err(book(client, PLAIN_JOB, award.slots(FIXED_NOW)[0]), 409)
    ok(client.post(f"/shops/{DEMO_SHOP}/offers/{PLAIN_JOB}/decision",
                   json={"decision": "declined", "reason_code": "capacity"}))
    err(get_award(client, PLAIN_JOB), 409)
    accept(client, PLAIN_JOB, DEMO_SHOP)
    err(done(client, PLAIN_JOB, "cgp"), 404)  # not a document of this job
    err(done(client, PLAIN_JOB, "nope"), 404)


# --------------------------------------------------------------------------- actions


def test_document_done_is_idempotent_and_emits(client):
    accept(client, PLAIN_JOB, DEMO_SHOP)
    rev = st.state_key()[2]
    a = ok(done(client, PLAIN_JOB, "nda"))
    assert a["status"] == "in_progress" and a["done"] == 2
    nda = next(d for d in a["documents"] if d["key"] == "nda")
    assert nda["status"] == "done" and nda["done_at"] == "2026-09-26T21:30:00Z"
    assert st.state_key()[2] == rev + 1
    ev = events(client)[-1]
    assert ev["kind"] == "paperwork_done" and ev["shop_id"] == DEMO_SHOP and ev["job_id"] == PLAIN_JOB
    assert ev["payload"]["job_id"] == PLAIN_JOB and ev["payload"]["key"] == "nda"
    assert ev["payload"]["done"] == 2 and ev["payload"]["total"] == 6
    assert ev["value_cad"] is None and ev["credit_cad"] is None
    n = len(events(client))
    again = ok(done(client, PLAIN_JOB, "nda"))
    assert again == a
    assert len(events(client)) == n and st.state_key()[2] == rev + 1  # nothing written
    ok(done(client, PLAIN_JOB, "quality"))  # auto: already done, no event
    assert len(events(client)) == n


def test_call_slot_validation_and_booking(client):
    accept(client, PLAIN_JOB, DEMO_SHOP)
    slots = ok(get_award(client, PLAIN_JOB))["call"]["slots"]
    assert "not one of the offered times" in err(book(client, PLAIN_JOB, "2026-09-28T11:00:00-04:00"), 400)
    err(book(client, PLAIN_JOB, "tomorrow"), 400)
    err(client.post(f"/shops/{DEMO_SHOP}/offers/{PLAIN_JOB}/award/call", json={}), 400)
    a = ok(book(client, PLAIN_JOB, slots[2]))
    assert a["call"]["booked"] is True and a["call"]["slot"] == slots[2]
    assert a["status"] == "in_progress"
    ev = events(client)[-1]
    assert ev["kind"] == "kickoff_booked" and ev["payload"]["job_id"] == PLAIN_JOB
    assert ev["payload"]["slot"] == slots[2]
    n = len(events(client))
    ok(book(client, PLAIN_JOB, slots[2]))
    assert len(events(client)) == n  # same slot again: no event
    # The same instant in UTC is accepted and normalized to the offered slot.
    a = ok(book(client, PLAIN_JOB, "2026-09-29T18:00:00Z"))
    assert a["call"]["slot"] == "2026-09-29T14:00:00-04:00"
    assert events(client)[-1]["payload"]["previous_slot"] == slots[2]


def test_complete_after_all_documents_and_call(client):
    accept(client, PLAIN_JOB, DEMO_SHOP)
    a = ok(get_award(client, PLAIN_JOB))
    for d in a["documents"]:
        a = ok(done(client, PLAIN_JOB, d["key"]))
    assert a["done"] == a["total"] and a["status"] == "in_progress"
    a = ok(book(client, PLAIN_JOB, a["call"]["slots"][0]))
    assert a["status"] == "complete"


# --------------------------------------------------------------------------- lifecycle


def test_persists_across_reload_and_undo(client):
    accept(client, PLAIN_JOB, DEMO_SHOP)
    ok(done(client, PLAIN_JOB, "subcontract"))
    ok(book(client, PLAIN_JOB, award.slots(FIXED_NOW)[3]))
    cache.clear()
    s = st.load_state()
    assert f"{DEMO_SHOP}:{PLAIN_JOB}" in s.awards
    a = ok(get_award(client, PLAIN_JOB))
    assert a["done"] == 2 and a["call"]["booked"] is True
    ok(client.post(f"/shops/{DEMO_SHOP}/offers/{PLAIN_JOB}/decision", json={"decision": "undo"}))
    err(get_award(client, PLAIN_JOB), 409)
    accept(client, PLAIN_JOB, DEMO_SHOP)
    assert ok(get_award(client, PLAIN_JOB))["done"] == 2  # progress kept through undo


def test_reset_route_upload_clear_awards(client):
    accept(client, PLAIN_JOB, DEMO_SHOP)
    ok(done(client, PLAIN_JOB, "nda"))
    ok(client.post("/programs/northgate/route"))
    accept(client, PLAIN_JOB, DEMO_SHOP)
    assert ok(get_award(client, PLAIN_JOB))["done"] == 1  # fresh after a new route
    ok(done(client, PLAIN_JOB, "nda"))
    assert list(st.load_state().awards) == [f"{DEMO_SHOP}:{PLAIN_JOB}"]
    ok(client.post("/programs/northgate/parts?use_demo=true"))
    err(get_award(client, PLAIN_JOB), 404)
    ok(client.post("/programs/northgate/route"))
    accept(client, PLAIN_JOB, DEMO_SHOP)
    assert ok(get_award(client, PLAIN_JOB))["done"] == 1
    ok(client.post("/demo/reset"))
    assert st.load_state().awards == {}


def test_reseed_has_no_awards(client):
    ok(client.post("/demo/seed?scenario=populated"))
    assert st.load_state().awards == {}


def test_ledger_and_assignments_unchanged(client):
    accept(client, PLAIN_JOB, DEMO_SHOP)
    ledger = ok(client.get("/programs/northgate/ledger"))
    rows = ok(client.get("/programs/northgate/assignments"))
    a = ok(get_award(client, PLAIN_JOB))
    for d in a["documents"]:
        ok(done(client, PLAIN_JOB, d["key"]))
    ok(book(client, PLAIN_JOB, a["call"]["slots"][0]))
    assert ok(client.get("/programs/northgate/ledger")) == ledger
    assert ok(client.get("/programs/northgate/assignments")) == rows


def test_slots_skip_weekends():
    fri = datetime(2026, 10, 2, 15, 0, tzinfo=UTC)
    s = award.slots(fri)
    assert s[0].startswith("2026-10-05T10:00") and s[-1].startswith("2026-10-09T14:00")
    assert award.slot_label("2026-09-29T10:00:00-04:00") == "Tue Sep 29, 10:00 AM"
