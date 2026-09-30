"""Right-sized work (engine/rightsize.py + engine/shopside.py, docs/api.md §9).

Offer size (annual value, duration, "meets your minimum"), work packages, the shop's work
preferences, counter-offers with the prime's answer, the new decline reasons and the
prime's "why shops said no" insights. Every behaviour is display/data only: the demo
headline numbers (36 assigned / 4 blocked, TP-01 $96K → $480K credit, obligation
11.5% → 13.4%) never move.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from engine import rightsize, shopside
from engine.tests import test_shopside as ss
from engine.tests.test_shopside import DEMO_SHOP, FIXED_NOW, err, events, ok

FIXTURES = Path(__file__).resolve().parents[2] / "data" / "fixtures"
SMALL_JOB = "NG-022"  # $777.6K over 8 years = $97.2K a year: below Tallowfield's $100K minimum
BIG_JOB = "NG-021"  # $921.6K → $115.2K a year: meets it


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch):
    monkeypatch.setattr(shopside, "clock", lambda: FIXED_NOW)


@pytest.fixture(scope="module")
def rs_templates(tmp_path_factory):
    d = tmp_path_factory.mktemp("rightsize_templates")
    routed = d / "routed.db"
    ss._prepare(routed, routed=True)
    return routed


@pytest.fixture
def client(rs_templates, tmp_path, monkeypatch):
    with ss._client_from(rs_templates, tmp_path, monkeypatch) as c:
        yield c


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def shop(c, shop_id=DEMO_SHOP) -> dict:
    return ok(c.get(f"/shops/{shop_id}"))


def offers(c, shop_id=DEMO_SHOP) -> dict:
    return {o["job_id"]: o for o in shop(c, shop_id)["offers"]}


def counter(c, job_id=SMALL_JOB, shop_id=DEMO_SHOP, **kw):
    return c.post(f"/shops/{shop_id}/offers/{job_id}/decision", json={"decision": "counter", **kw})


def respond(c, response, job_id=SMALL_JOB, shop_id=DEMO_SHOP, **kw):
    return c.post(f"/shops/{shop_id}/offers/{job_id}/counter-response", json={"response": response, **kw})


def prefs(c, shop_id=DEMO_SHOP, **body):
    return c.post(f"/shops/{shop_id}/preferences", json=body)


def headline_numbers(c) -> tuple:
    led = ok(c.get("/programs/northgate/ledger"))
    rows = ok(c.get("/programs/northgate/assignments"))["assignments"]
    return (len(rows), round(led["credit_total_cad"], 2), round(led["obligation_met_pct"], 6),
            sorted((a["job_id"], a["shop_id"], a["value_cad"], a["credit_cad"]) for a in rows))


# --------------------------------------------------------------------------- program years


def test_program_years_from_program_else_eight_year_assumption():
    assert rightsize.program_years({}) == (8, "assumption")
    assert rightsize.program_years({"program_years": 10}) == (10, "program")
    assert rightsize.program_years({"duration_years": 12.5}) == (12.5, "program")
    assert rightsize.program_years({"program_years": 0}) == (8, "assumption")
    assert rightsize.program_years({"program_years": True}) == (8, "assumption")


# --------------------------------------------------------------------------- offer size


def test_every_offer_shows_annual_value_and_duration(client):
    detail = shop(client)
    assert detail["shop"]["min_annual_value_cad"] == 100000
    assert detail["shop"]["prefers_ongoing"] is True
    assert detail["shop"]["preferences_basis"] == "illustrative"
    by = {o["job_id"]: o for o in detail["offers"]}
    for o in by.values():
        assert o["annual_value_cad"] == round(o["value_cad"] / 8, 2)
        assert o["duration_years"] == 8 and o["duration_flag"] == "assumption" and o["ongoing"] is True
    assert by[BIG_JOB]["annual_value_cad"] == 115200 and by[BIG_JOB]["meets_minimum"] is True
    assert by[SMALL_JOB]["annual_value_cad"] == 97200 and by[SMALL_JOB]["meets_minimum"] is False


def test_offers_group_into_one_work_package_per_program(client):
    (pkg,) = shop(client)["work_packages"]
    assert pkg["program_id"] == "northgate" and pkg["prime_name"] == "Northgate Land Systems"
    assert pkg["job_ids"] == [BIG_JOB, SMALL_JOB] and pkg["offers"] == 2 and pkg["declined"] == 0
    assert pkg["total_value_cad"] == 1699200 and pkg["annual_value_cad"] == 212400
    assert pkg["meets_minimum"] is True and pkg["below_minimum_job_ids"] == [SMALL_JOB]
    assert pkg["message"] == (
        "Northgate work package: 2 jobs · $212K a year for about 8 years · meets your $100K-a-year minimum"
    )


def test_package_below_minimum_and_no_preference(client):
    (pkg,) = shop(client, "syn-006")["work_packages"]  # two small sheet-metal brackets
    assert pkg["meets_minimum"] is False and pkg["below_minimum_job_ids"] == pkg["job_ids"]
    assert pkg["message"].endswith("below your $100K-a-year minimum")
    # A shop without preferences: sizes, no verdict.
    d = shop(client, "syn-003")
    assert "min_annual_value_cad" not in d["shop"]
    assert all(o["meets_minimum"] is None for o in d["offers"])
    assert d["work_packages"][0]["meets_minimum"] is None
    assert "minimum" not in d["work_packages"][0]["message"]


def test_declined_offers_leave_the_package(client):
    ok(ss.decide(client, SMALL_JOB, "declined", reason_code="too_small"))
    (pkg,) = shop(client)["work_packages"]
    assert pkg["job_ids"] == [BIG_JOB] and pkg["declined"] == 1
    assert pkg["annual_value_cad"] == 115200


# --------------------------------------------------------------------------- preferences


def test_set_preferences_shows_on_offers_and_emits_event(client):
    before = headline_numbers(client)
    body = ok(prefs(client, min_annual_value_cad=150000, idempotency_key="p1"))
    p = body["preferences"]
    assert p == {"shop_id": DEMO_SHOP, "min_annual_value_cad": 150000, "prefers_ongoing": True,
                 "basis": "shop-declared", "updated_at": "2026-09-26T21:30:00Z", "used_in_routing": False}
    ev = body["event"]
    assert ev["kind"] == "preferences_set" and ev["shop_id"] == DEMO_SHOP
    assert ev["message"] == ("Tallowfield Fabricating Ltd. updated its work preferences: "
                             "smallest work it looks at: $150K a year · prefers ongoing work")
    d = shop(client)
    assert d["shop"]["min_annual_value_cad"] == 150000 and d["shop"]["preferences_basis"] == "shop-declared"
    by = {o["job_id"]: o for o in d["offers"]}
    assert by[BIG_JOB]["meets_minimum"] is False and by[SMALL_JOB]["meets_minimum"] is False
    assert d["work_packages"][0]["meets_minimum"] is True  # $212K a year as a package
    listed = next(s for s in ok(client.get("/shops?source=synthetic"))["shops"] if s["id"] == DEMO_SHOP)
    assert listed["min_annual_value_cad"] == 150000
    # Replay: stored response, no new event. Same key, other body: 409. Same prefs, new key: no event.
    n = len(events(client)["events"])
    assert ok(prefs(client, min_annual_value_cad=150000, idempotency_key="p1")) == body
    assert "already used" in err(prefs(client, min_annual_value_cad=1, idempotency_key="p1"), 409)
    assert ok(prefs(client, min_annual_value_cad=150000, idempotency_key="p2"))["event"] is None
    assert len(events(client)["events"]) == n
    assert headline_numbers(client) == before


def test_preferences_partial_update_null_and_validation(client):
    ok(prefs(client, prefers_ongoing=False))
    p = ok(prefs(client, min_annual_value_cad=None))["preferences"]
    assert p["min_annual_value_cad"] is None and p["prefers_ongoing"] is False
    d = shop(client)
    assert all(o["meets_minimum"] is None for o in d["offers"])
    assert ok(prefs(client, min_annual_value_cad=0))["preferences"]["min_annual_value_cad"] is None
    assert "Send min_annual_value_cad or prefers_ongoing" in err(prefs(client), 400)
    assert "must be a number" in err(prefs(client, min_annual_value_cad="lots"), 400)
    assert "must be a number" in err(prefs(client, min_annual_value_cad=True), 400)
    assert "between 0 and" in err(prefs(client, min_annual_value_cad=-5), 400)
    assert "true, false or null" in err(prefs(client, prefers_ongoing="yes"), 400)
    err(prefs(client, "syn-999", prefers_ongoing=True), 404)


def test_preferences_survive_routing_and_reset_clears_them(client):
    ok(prefs(client, min_annual_value_cad=300000))
    ok(client.post("/programs/northgate/route"))
    assert shop(client)["shop"]["min_annual_value_cad"] == 300000
    ok(client.post("/demo/reset"))
    assert shop(client)["shop"]["min_annual_value_cad"] == 100000  # back to the seed value


# --------------------------------------------------------------------------- counter-offers


def test_counter_offer_is_recorded_and_the_prime_hears_it(client):
    before = headline_numbers(client)
    body = ok(counter(client, setup_charge_cad=4500, min_quantity=500, note="Short runs need a setup",
                      idempotency_key="c1"))
    d = body["decision"]
    assert set(d) == ss.DECISION_KEYS | {"counter"}
    assert d["decision"] == "counter" and d["reason_code"] is None and d["question_code"] is None
    assert d["counter"] == {"setup_charge_cad": 4500, "min_quantity": 500, "response": None}
    assert body["assignment_status"] == "offered"
    ev = body["event"]
    assert ev["kind"] == "offer_countered"
    assert ev["message"] == ("Tallowfield Fabricating Ltd. countered on NG-022: "
                             "$4.5K setup charge and a minimum of 500 parts per order")
    assert ev["payload"] == {"setup_charge_cad": 4500, "min_quantity": 500, "note": "Short runs need a setup"}
    assert offers(client)[SMALL_JOB]["status"] == "offered"
    acts = ok(client.get(f"/shops/{DEMO_SHOP}/actions"))
    assert acts["decisions"][0]["counter"]["min_quantity"] == 500
    # Replay and the same counter under a new key: nothing new.
    assert ok(counter(client, setup_charge_cad=4500, min_quantity=500, note="Short runs need a setup",
                      idempotency_key="c1")) == body
    again = ok(counter(client, setup_charge_cad=4500, min_quantity=500, note="Short runs need a setup"))
    assert again["event"] is None
    # New terms replace the counter.
    new = ok(counter(client, min_quantity=800))
    assert new["decision"]["counter"] == {"setup_charge_cad": None, "min_quantity": 800, "response": None}
    assert new["event"]["payload"] == {"setup_charge_cad": None, "min_quantity": 800, "previous": "counter"}
    assert headline_numbers(client) == before


def test_counter_offer_validation(client):
    assert "needs setup_charge_cad or min_quantity" in err(counter(client), 400)
    assert "more than 0" in err(counter(client, setup_charge_cad=0), 400)
    assert "must be a number" in err(counter(client, setup_charge_cad="4500"), 400)
    assert "must be a number" in err(counter(client, setup_charge_cad=True), 400)
    assert "whole number" in err(counter(client, min_quantity=12.5), 400)
    assert "whole number" in err(counter(client, min_quantity=0), 400)
    err(counter(client, "NG-099", setup_charge_cad=100), 404)
    # Terms on another decision are dropped, like a stray reason code.
    d = ok(ss.decide(client, SMALL_JOB, "accepted", setup_charge_cad=4500))["decision"]
    assert "counter" not in d


def test_prime_accepts_the_counter(client):
    before = headline_numbers(client)
    ok(counter(client, setup_charge_cad=3000))
    body = ok(respond(client, "accepted", note="Setup fee approved", idempotency_key="r1"))
    d = body["decision"]
    assert d["decision"] == "accepted" and body["assignment_status"] == "accepted"
    assert d["counter"]["setup_charge_cad"] == 3000
    assert d["counter"]["response"] == {"response": "accepted", "note": "Setup fee approved",
                                        "at": "2026-09-26T21:30:00Z"}
    ev = body["event"]
    assert ev["kind"] == "counter_accepted" and ev["shop_id"] == DEMO_SHOP and ev["job_id"] == SMALL_JOB
    assert ev["message"] == "Northgate accepted Tallowfield Fabricating Ltd.'s counter on NG-022: $3K setup charge"
    assert ev["payload"] == {"response": "accepted", "setup_charge_cad": 3000, "min_quantity": None,
                             "note": "Setup fee approved"}
    assert offers(client)[SMALL_JOB]["status"] == "accepted"
    assert ss.assignment(client, SMALL_JOB)["status"] == "accepted"
    # It is an accept like any other: the award paperwork opens.
    assert client.get(f"/shops/{DEMO_SHOP}/offers/{SMALL_JOB}/award").status_code == 200
    # Replay; same answer again under a new key; a different answer now is a 409.
    assert ok(respond(client, "accepted", note="Setup fee approved", idempotency_key="r1")) == body
    assert ok(respond(client, "accepted", note="Setup fee approved"))["event"] is None
    assert "already accepted" in err(respond(client, "declined"), 409)
    # Terms are recorded only: value, credit and the ledger never change.
    after = headline_numbers(client)
    assert after[1:3] == before[1:3] and after[3] == before[3]


def test_prime_keeps_the_original_offer(client):
    ok(counter(client, min_quantity=500))
    body = ok(respond(client, "declined"))
    d = body["decision"]
    assert d["decision"] == "counter" and d["counter"]["response"]["response"] == "declined"
    assert body["assignment_status"] == "offered"
    assert body["event"]["kind"] == "counter_declined"
    assert body["event"]["message"] == (
        "Northgate kept its original offer on NG-022 for Tallowfield Fabricating Ltd. (counter not accepted)"
    )
    # The same counter again is a new ask (Northgate answered the last one).
    assert ok(counter(client, min_quantity=500))["event"]["kind"] == "offer_countered"
    # The prime can still accept later; the shop can accept the original offer instead.
    assert ok(respond(client, "accepted"))["assignment_status"] == "accepted"
    undo = ok(ss.decide(client, SMALL_JOB, "undo"))
    assert undo["assignment_status"] == "offered" and undo["event"]["payload"] == {"previous": "accepted"}
    assert "No counter-offer" in err(respond(client, "accepted"), 409)


def test_counter_response_errors_and_route_clears(client):
    assert "response must be one of" in err(respond(client, "maybe"), 400)
    assert "No counter-offer" in err(respond(client, "accepted"), 409)
    ok(ss.decide(client, SMALL_JOB, "question", question_code="lead_time"))
    assert "No counter-offer" in err(respond(client, "accepted"), 409)
    err(respond(client, "accepted", job_id="NG-099"), 404)
    err(respond(client, "accepted", shop_id="syn-999"), 404)
    ok(counter(client, setup_charge_cad=100))
    ok(client.post("/programs/northgate/route"))
    assert "No counter-offer" in err(respond(client, "accepted"), 409)


# --------------------------------------------------------------------------- decline reasons + insights


@pytest.mark.parametrize(("code", "label"), [
    ("too_small", "job too small for us"),
    ("paperwork", "too much paperwork"),
    ("min_quantity", "below our minimum quantity"),
])
def test_new_decline_reasons(client, code, label):
    body = ok(ss.decide(client, SMALL_JOB, "declined", reason_code=code))
    assert body["event"]["message"] == f"Tallowfield Fabricating Ltd. declined NG-022: {label}"
    assert body["event"]["payload"] == {"reason_code": code}


def test_decline_insights_group_reasons_counters_and_small_offers(client):
    before = headline_numbers(client)
    empty = ok(client.get("/programs/northgate/decline-insights"))
    assert empty["declined"] == 0 and empty["countered"] == 0
    assert empty["reasons"] == [] and empty["counters"] == []
    # Seed preferences put some placed offers below their shop's own minimum.
    small = empty["below_minimum"]
    assert small["count"] > 0 and SMALL_JOB in small["job_ids"] and DEMO_SHOP in small["shop_ids"]
    assert small["duration_years"] == 8 and small["duration_flag"] == "assumption"
    assert small["suggestion"].startswith("Bundle")

    ok(ss.decide(client, SMALL_JOB, "declined", reason_code="too_small"))
    ok(ss.decide(client, "NG-002", "declined", shop="syn-006", reason_code="too_small"))
    ok(ss.decide(client, "NG-035", "declined", shop="syn-006", reason_code="paperwork"))
    ok(counter(client, BIG_JOB, setup_charge_cad=2500, min_quantity=300))
    ins = ok(client.get("/programs/northgate/decline-insights"))
    assert ins["declined"] == 3 and ins["countered"] == 1 and ins["flags"] == ["assumption"]
    top, second = ins["reasons"]
    assert top["code"] == "too_small" and top["count"] == 2 and top["label"] == "job too small for us"
    assert top["job_ids"] == ["NG-002", SMALL_JOB] and top["shop_ids"] == ["syn-006", DEMO_SHOP]
    assert top["suggestion"] == rightsize.DECLINE_SUGGESTION["too_small"]
    assert "Bundle small jobs into one package" in top["suggestion"]
    assert second["code"] == "paperwork" and second["count"] == 1
    terms = {r["code"]: r for r in ins["counters"]}
    assert terms["setup_charge"]["count"] == 1 and terms["setup_charge"]["total_setup_cad"] == 2500
    assert terms["min_quantity"]["job_ids"] == [BIG_JOB]
    assert headline_numbers(client) == before


def test_demo_headline_numbers_unchanged_with_everything_used(client):
    """Preferences, counters (accepted and declined) and the new declines leave the demo
    numbers exactly as the fixtures have them."""
    ok(prefs(client, min_annual_value_cad=500000))
    ok(counter(client, setup_charge_cad=4000))
    ok(respond(client, "accepted"))
    ok(counter(client, BIG_JOB, min_quantity=200))
    ok(respond(client, "declined", job_id=BIG_JOB))
    ok(ss.decide(client, "NG-002", "declined", shop="syn-006", reason_code="min_quantity"))
    rows = ok(client.get("/programs/northgate/assignments"))["assignments"]
    assert len(rows) == 36 and len(ok(client.get("/programs/northgate/gaps"))["blocked"]) == 4
    led = ok(client.get("/programs/northgate/ledger"))
    assert led["credit_total_cad"] == pytest.approx(fixture("ledger.json")["credit_total_cad"])
    fund = ok(client.post("/programs/northgate/training/TP-01/fund"))
    fx = fixture("fund_TP-01.json")
    assert fund["headline"] == fx["headline"]
    assert fund["credit_added"] == pytest.approx(fx["credit_added"])
    assert round(fund["before"]["obligation_met_pct"], 3) == 0.115
    assert round(fund["after"]["obligation_met_pct"], 3) == 0.134
