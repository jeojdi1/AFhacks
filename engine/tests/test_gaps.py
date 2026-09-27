"""Blocked jobs, training suggestions (H2.6) and readiness (H2.9)."""

from __future__ import annotations

import pytest

from engine import gaps, pipeline
from engine.tests.test_pipeline import DEMO_SHOP, HULL_JOB, TP01_JOBS, build_state


@pytest.fixture(scope="module")
def routed():
    st = build_state()
    pipeline.route(st)
    return st


def test_every_blocked_job_has_a_suggestion(routed):
    g = pipeline.gaps(routed)
    assert len(g["blocked"]) == 4
    pkg_ids = {p["id"] for p in g["suggestions"]}
    for b in g["blocked"]:
        assert b["suggestion_ids"] and set(b["suggestion_ids"]) <= pkg_ids
        assert b["reason_code"] == "capacity"
        assert b["reason"]
        assert set(b["failing_filters"]) == {"process", "envelope", "certs", "controlled_cgp",
                                             "cpcsc", "capacity"}
    assert [b["eligible_shop_count"] for b in g["blocked"]] == [2, 2, 2, 1]
    assert g["summary"]["top_reason"] == "CWB W47.1 welder shortage (certification + capacity)"
    assert g["summary"]["blocked_value_cad"] == 6569000.0


def test_package_fields(routed):
    pk = routed.packages
    tp1, tp2 = pk["TP-01"], pk["TP-02"]
    assert tp1["gap"]["kind"] == "cert" and tp1["gap"]["requirement"] == "CWB_W47.1"
    assert tp1["category"] == "personal_certification"
    assert tp1["categories"] == ["personal_certification", "apprentice_sponsorship"]
    assert tp1["recipient_type"] == "college" and tp1["trainees"] == 4
    assert tp1["est_cost_cad"] == 96000.0 and tp1["est_credit_cad"] == 480000.0
    assert tp1["cert_unlock"] == "CWB_W47.1" and tp1["capacity_unlock"] == {"welding": 80}
    assert tp1["unblocks_value_cad"] == 5068000.0
    assert tp2["gap"]["kind"] == "capacity" and tp2["gap"]["requirement"] == "welding"
    assert tp2["category"] == "apprentice_sponsorship"
    assert tp2["recipient_type"] == "indigenous_institution" and tp2["trainees"] == 2
    assert tp2["est_cost_cad"] == 40000.0 and tp2["est_credit_cad"] == 400000.0
    assert tp2["cert_unlock"] is None and tp2["capacity_unlock"] == {"welding": 40}
    for p in (tp1, tp2):
        assert p["flags"] == ["assumption"] and p["status"] == "suggested"
        assert p["cost_basis"] == "data/rules/training_costs.json (assumption)"
        assert p["eligibility_note"]
        assert p["est_credit_cad"] == p["est_cost_cad"] * p["multiplier"]


def test_costs_come_from_config():
    st = build_state()
    st.config["training_costs"]["costs"]["personal_certification"]["cwb_w47_1_welder_cad"] = 10000
    pipeline.route(st)
    assert st.packages["TP-01"]["est_cost_cad"] == 40000.0


def test_suggestion_ids_reused_and_lowest_free():
    st = build_state()
    pipeline.route(st)
    ctx = pipeline.Context(st)
    blocked = [b["job_id"] for b in st.blocked]
    again = gaps.build_suggestions(ctx, blocked, st.packages)
    assert list(again) == ["TP-01", "TP-02"]
    # with TP-01 marked funded, the TP-02 suggestion keeps its id
    existing = {k: dict(v) for k, v in st.packages.items()}
    existing["TP-01"]["status"] = "funded"
    out = gaps.build_suggestions(ctx, [HULL_JOB], existing)
    assert [(k, v["status"]) for k, v in out.items()] == [("TP-01", "funded"), ("TP-02", "suggested")]
    # an unmatched new suggestion takes the lowest free number
    out = gaps.build_suggestions(ctx, [HULL_JOB], {"TP-01": existing["TP-01"]})
    assert list(out) == ["TP-01", "TP-02"]
    assert gaps.build_suggestions(ctx, [HULL_JOB], {})["TP-01"]["shop_id"] == "syn-026"


def test_readiness_demo_shop(routed):
    ctx = pipeline.Context(routed)
    items = gaps.readiness(ctx, DEMO_SHOP, routed.assignments)
    assert items == [{
        "kind": "cert", "requirement": "CWB_W47.1", "jobs_unlocked": TP01_JOBS,
        "value_cad": 5068000.0,
        "message": "Get CWB W47.1 → qualify for 3 more jobs worth $5.1M",
    }]
    # the hull job fails the envelope at syn-012, so it is never a readiness item
    assert all(HULL_JOB not in it["jobs_unlocked"] for it in items)


def test_readiness_excludes_offered_jobs(routed):
    ctx = pipeline.Context(routed)
    for sid in routed.shops:
        offered = {j for j, a in routed.assignments.items() if a["shop_id"] == sid}
        for it in gaps.readiness(ctx, sid, routed.assignments):
            assert not offered & set(it["jobs_unlocked"])
            assert it["kind"] in ("cert", "capacity", "process")
            assert it["message"].count("→") == 1


def test_training_entries_messages():
    pkgs = {
        "TP-01": {"id": "TP-01", "shop_id": "s", "status": "suggested", "category": "c",
                  "trainees": 4, "recipient_example": "x", "cert_unlock": "CWB_W47.1",
                  "capacity_unlock": {"welding": 80}},
        "TP-02": {"id": "TP-02", "shop_id": "s", "status": "funded", "category": "c",
                  "trainees": 2, "recipient_example": "x", "cert_unlock": None,
                  "capacity_unlock": {"welding": 40}},
    }
    msgs = [e["message"] for e in gaps.training_entries("s", pkgs)]
    assert msgs == ["Suggested: certify 4 welders to CWB W47.1", "2 welding apprentices in training"]
    assert gaps.training_entries("other", pkgs) == []


@pytest.mark.parametrize("x,out", [
    (96000, "$96K"), (480000, "$480K"), (9122400, "$9.1M"), (5068000, "$5.1M"), (950, "$950"),
])
def test_short_money(x, out):
    assert gaps.short_money(x) == out


def test_blocked_reason_when_no_shop_offers_the_process():
    st = build_state()
    job = dict(st.jobs[0], id="NG-999", part_no="X-1", process_tags=["heat_treat", "cnc_turning"],
               required_certs=["AS9100", "CWB_W47.1"], controlled=False, status="unrouted")
    for s in st.shops.values():
        s["processes"] = [p for p in s["processes"] if p != "heat_treat"]
    st.jobs = [job]
    pipeline.route(st, solver="greedy")
    (b,) = st.blocked
    assert b["reason_code"] == "process"
    assert b["reason"] == "No shop in the network offers heat treating + CNC turning"


@pytest.mark.parametrize("x,out", [(999_600, "$1.0M"), (999_499, "$999K"), (999.6, "$1K"), (999.4, "$999")])
def test_short_money_rounds_before_unit(x, out):
    assert gaps.short_money(x) == out


USER_CSV = """part_no,description,qty,unit_price_cad,process_tags,required_certs,controlled,envelope_mm,hours_week
U-1,Milled bracket,10,100,cnc_milling,,false,200x200x100,4
U-2,Welded frame,10,1000,welding,CWB_W47.1,true,1000x800x600,8
U-3,Big welded frame,10,1000,welding,CWB_W47.1,false,6000x3000x2000,8
U-4,Turned pin,10,333.333,cnc_turning,CPCSC_L1;AS9100,false,100x100x100,4
"""


@pytest.fixture(scope="module")
def user_routed():
    from engine import tagger

    st = build_state(upload=False)
    st.jobs, _ = tagger.tag_rows(tagger.parse_csv(USER_CSV), use_llm=False)
    pipeline.route(st)
    return st, {b["part_no"]: b for b in st.blocked}, pipeline.gaps(st)


def test_blocked_reason_names_the_real_filter_not_capacity(user_routed):
    _, blocked, _ = user_routed
    u2, u3, u4 = blocked["U-2"], blocked["U-3"], blocked["U-4"]
    assert u2["reason_code"] == "controlled_cgp"
    assert u2["reason"] == ("2 shops offer welding with CWB W47.1, but none is CGP-registered "
                            "(the job is controlled); 4 other welding shops lack CWB W47.1")
    assert u3["reason_code"] == "envelope"
    assert u3["reason"].startswith("2 shops offer welding with CWB W47.1, but none has a work "
                                   "envelope large enough for the 6000x3000x2000 mm part")
    assert u4["reason_code"] == "cpcsc" and "none holds CPCSC Level 1" in u4["reason"]
    for b in (u2, u3, u4):
        assert "capacity" not in b["reason"] and "shortage" not in b["reason"]


def test_top_reason_ignores_certs_of_jobs_not_blocked_on_certs(user_routed):
    _, blocked, g = user_routed
    assert {b["reason_code"] for b in blocked.values()} == {"controlled_cgp", "envelope", "cpcsc"}
    assert "shortage" not in g["summary"]["top_reason"]
    assert g["summary"]["top_reason"] == "Most common failure: part too large for the work envelope"


def test_top_reason_demo_still_welder_shortage(routed):
    g = pipeline.gaps(routed)
    assert g["summary"]["top_reason"] == "CWB W47.1 welder shortage (certification + capacity)"
