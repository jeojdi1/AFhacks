"""Acceptance tests for engine.pipeline on the real Northgate scenario (H2.4, H2.6, H2.7, H2.9).

The State is built here straight from data/processed + data/rules (tagging the CSV with
engine.tagger.tag_rows), so these tests do not depend on engine/state.py.
"""

from __future__ import annotations

import copy
import json
import time
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from engine import pipeline, rules, tagger
from engine.tests.fixture_compat import pending

ROOT = Path(__file__).resolve().parents[2]
PROCESSED = ROOT / "data" / "processed"
FIXTURES = ROOT / "data" / "fixtures"
TP01_JOBS = ["NG-031", "NG-032", "NG-033"]
HULL_JOB = "NG-034"
DEMO_SHOP = "syn-012"


@dataclass
class _State:
    """Mirror of engine.state.State (the shared interface)."""

    program: dict
    shops: dict[str, dict]
    jobs: list[dict] = field(default_factory=list)
    assignments: dict[str, dict] = field(default_factory=dict)
    blocked: list[dict] = field(default_factory=list)
    packages: dict[str, dict] = field(default_factory=dict)
    txns: list[dict] = field(default_factory=list)
    funded: list[str] = field(default_factory=list)
    cert_overrides: dict[str, dict[str, str]] = field(default_factory=dict)
    capacity_bonus: dict[str, float] = field(default_factory=dict)
    stage: str = "empty"
    solver: str | None = None
    elapsed_ms: int = 0
    tagger_counts: dict = field(default_factory=dict)
    config: dict = field(default_factory=dict)


_BASE: dict = {}


def build_state(*, upload: bool = True) -> _State:
    """Fresh State from the data files; ``upload`` tags data/processed/parts_northgate.csv."""
    if not _BASE:
        program = json.loads((PROCESSED / "program_northgate.json").read_text(encoding="utf-8"))
        raw = json.loads((PROCESSED / "shops_synthetic.json").read_text(encoding="utf-8"))
        shops = {s["id"]: s for s in raw["shops"]}
        rows = tagger.parse_csv((PROCESSED / "parts_northgate.csv").read_text(encoding="utf-8"))
        jobs, counts = tagger.tag_rows(rows, use_llm=False)
        _BASE.update(program=program, shops=shops, jobs=jobs, counts=counts,
                     config=rules.load_rules())
    b = copy.deepcopy(_BASE)
    st = _State(program=b["program"], shops=b["shops"], config=b["config"])
    if upload:
        st.jobs, st.tagger_counts, st.stage = b["jobs"], b["counts"], "uploaded"
    return st


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def cents(x: float) -> int:
    return round(float(x) * 100)


def assert_ledger_invariants(lg: dict) -> None:
    total = sum(cents(t["credit_cad"]) for t in lg["transactions"])
    assert cents(lg["credit_total_cad"]) == total
    assert cents(lg["direct_credit_cad"]) + cents(lg["indirect_credit_cad"]) == total
    assert lg["obligation_met_pct"] == pytest.approx(lg["credit_total_cad"] / lg["obligation_cad"])
    assert lg["smb"]["progress_pct"] == pytest.approx(lg["smb"]["achieved_cad"] / lg["smb"]["target_cad"])
    assert [m["category"] for m in lg["multiplier_breakdown"]] == [
        "regular", "sme_direct", "training", "indigenous_training"]
    assert sum(cents(m["credit_cad"]) for m in lg["multiplier_breakdown"]) == total
    for t in lg["transactions"]:
        assert cents(t["credit_cad"]) == cents(t["value_cad"] * t["ccv_pct"] * t["multiplier"])
    ids = [t["id"] for t in lg["transactions"]]
    assert ids == [f"TX-{i:04d}" for i in range(1, len(ids) + 1)]


@pytest.fixture(scope="module")
def routed():
    st = build_state()
    t0 = time.perf_counter()
    res = pipeline.route(st)
    return st, res, time.perf_counter() - t0


# --------------------------------------------------------------------------- 1. route


def test_route_36_assigned_4_blocked_under_2s(routed):
    st, res, elapsed = routed
    assert elapsed < 2.0
    assert res["stats"]["jobs"] == 40
    assert res["stats"]["assigned"] == 36 and res["stats"]["blocked"] == 4
    assert len(res["assignments"]) == 36 and len(res["blocked"]) == 4
    assert res["solver"] in ("ortools", "greedy")
    assert st.stage == "routed"
    for a in res["assignments"]:
        assert len(a["reasons"]) == 3 and all(isinstance(r, str) and r for r in a["reasons"])
        assert 0.0 <= a["score"] <= 1.0
        assert a["status"] == "offered"


def test_controlled_jobs_only_on_cgp_shops(routed):
    st, res, _ = routed
    controlled = [a for a in res["assignments"] if a["controlled"]]
    assert len(controlled) == 5
    for a in controlled:
        shop = pipeline.effective_shop(st, a["shop_id"])
        assert rules.cert_counts(shop, "CGP"), a
        assert a["reasons"][1] == "CGP-registered (controlled job)"


def test_capacity_never_exceeded(routed):
    st, _, _ = routed
    load: dict[str, float] = {}
    for a in st.assignments.values():
        load[a["shop_id"]] = load.get(a["shop_id"], 0) + a["hours_week"]
    for sid, hours in load.items():
        assert hours <= pipeline.effective_shop(st, sid)["capacity_hours_week"]


def test_job_statuses_updated(routed):
    st, _, _ = routed
    status = {j["id"]: j["status"] for j in pipeline.jobs_view(st)["jobs"]}
    assert sorted(j for j, s in status.items() if s == "blocked") == TP01_JOBS + [HULL_JOB]
    assert sum(s == "assigned" for s in status.values()) == 36


# --------------------------------------------------------------------------- 2. blocked set


def test_blocked_jobs_match_fixture(routed):
    _, res, _ = routed
    expected = [b["job_id"] for b in fixture("route.json")["blocked"]]
    assert [b["job_id"] for b in res["blocked"]] == expected == TP01_JOBS + [HULL_JOB]


def test_blocked_job_fields_match_fixture(routed):
    _, res, _ = routed
    fx = {b["job_id"]: b for b in fixture("route.json")["blocked"]}
    for b in res["blocked"]:
        assert b == fx[b["job_id"]]


# --------------------------------------------------------------------------- 3. ledger + gaps


def test_ledger_invariants_and_totals(routed):
    st, _, _ = routed
    lg = pipeline.ledger(st)
    assert_ledger_invariants(lg)
    fx = fixture("ledger.json")
    for k in ("credit_total_cad", "direct_credit_cad", "indirect_credit_cad", "obligation_met_pct"):
        assert lg[k] == pytest.approx(fx[k])
    assert lg["smb"] == fx["smb"]
    assert lg["multiplier_breakdown"] == fx["multiplier_breakdown"]
    assert 0.10 <= lg["obligation_met_pct"] <= 0.15


def test_gaps_packages(routed):
    st, _, _ = routed
    g = pipeline.gaps(st)
    assert g["summary"]["blocked_jobs"] == 4
    assert all(b["suggestion_ids"] for b in g["blocked"])
    pk = {p["id"]: p for p in g["suggestions"]}
    assert sorted(pk) == ["TP-01", "TP-02"]
    assert pk["TP-01"]["shop_id"] == DEMO_SHOP and pk["TP-01"]["blocked_job_ids"] == TP01_JOBS
    assert pk["TP-01"]["multiplier"] == 5 and pk["TP-01"]["est_cost_cad"] == 96000.0
    assert pk["TP-02"]["blocked_job_ids"] == [HULL_JOB] and pk["TP-02"]["multiplier"] == 10
    assert pk["TP-02"]["shop_id"] == "syn-026" and pk["TP-02"]["est_cost_cad"] == 40000.0
    assert g == fixture("gaps.json")


# --------------------------------------------------------------------------- 4. fund


@pytest.fixture(scope="module")
def funded():
    st = build_state()
    pipeline.route(st)
    before_assign = {j: a["shop_id"] for j, a in st.assignments.items()}
    shop_before = pipeline.shop_detail(st, DEMO_SHOP)
    f1 = pipeline.fund(st, "TP-01")
    shop_after = pipeline.shop_detail(st, DEMO_SHOP)
    after1 = copy.deepcopy(st)
    return st, before_assign, shop_before, f1, shop_after, after1


def test_fund_tp01_unblocks_three(funded):
    st, before_assign, _, f1, _, _ = funded
    assert [a["job_id"] for a in f1["unblocked_jobs"]] == TP01_JOBS
    assert all(a["shop_id"] == DEMO_SHOP for a in f1["unblocked_jobs"])
    assert f1["still_blocked"] == [HULL_JOB]
    assert f1["credit_added"] > 0
    assert cents(f1["credit_added"]) == cents(f1["after"]["credit_total_cad"]) - cents(
        f1["before"]["credit_total_cad"])
    bd = f1["credit_added_breakdown"]
    assert cents(f1["credit_added"]) == cents(bd["training_cad"]) + cents(bd["jobs_cad"])
    assert bd["training_cad"] == 480000.0
    assert f1["package"]["status"] == "funded"
    assert f1["training_txn"]["category"] == "training"
    assert f1["headline"] == "$96K training → $480K credit (5x) + 3 jobs unblocked (+$9.1M credit)"
    for jid, sid in before_assign.items():
        assert st.assignments[jid]["shop_id"] == sid
    assert_ledger_invariants(pipeline.ledger(st))
    assert pipeline.program_view(st)["state"] == "funded"


def test_fund_matches_fixture_numbers(funded):
    _, _, _, f1, _, _ = funded
    fx = fixture("fund_TP-01.json")
    for k in ("credit_added", "credit_added_breakdown", "headline", "still_blocked",
              "training_txn", "package", "before", "after"):
        assert f1[k] == fx[k], k


def test_fund_twice_and_tp02():
    st = build_state()
    pipeline.route(st)
    pipeline.fund(st, "TP-01")
    with pytest.raises(ValueError, match="already funded"):
        pipeline.fund(st, "TP-01")
    before = {j: a["shop_id"] for j, a in st.assignments.items()}
    f2 = pipeline.fund(st, "TP-02")
    assert [a["job_id"] for a in f2["unblocked_jobs"]] == [HULL_JOB]
    assert f2["still_blocked"] == [] and f2["after"]["blocked"] == 0
    assert f2["training_txn"]["category"] == "indigenous_training"
    assert cents(f2["credit_added"]) == cents(f2["after"]["credit_total_cad"]) - cents(
        f2["before"]["credit_total_cad"])
    for jid, sid in before.items():
        assert st.assignments[jid]["shop_id"] == sid
    g = pipeline.gaps(st)
    assert g["blocked"] == [] and g["summary"]["top_reason"] == "None"
    assert [p["status"] for p in g["suggestions"]] == ["funded", "funded"]
    assert_ledger_invariants(pipeline.ledger(st))
    fx = fixture("fund_TP-02.json")
    for k in ("credit_added", "credit_added_breakdown", "headline", "training_txn", "package",
              "before", "after", "unblocked_jobs"):
        assert f2[k] == fx[k], k


def test_gaps_after_fund(funded):
    *_, after1 = funded
    g = pipeline.gaps(after1)
    assert g["summary"]["blocked_jobs"] == 1
    assert [(p["id"], p["status"]) for p in g["suggestions"]] == [("TP-01", "funded"),
                                                                ("TP-02", "suggested")]
    assert g["blocked"][0]["suggestion_ids"] == ["TP-02"]
    assert g == fixture("gaps_after_fund.json")


# --------------------------------------------------------------------------- 5. shop view


def test_shop_detail_before_and_after_fund(funded):
    _, _, before, _, after, _ = funded
    r0 = before["readiness"]
    cwb = [r for r in r0 if r["kind"] == "cert" and r["requirement"] == "CWB_W47.1"]
    assert len(cwb) == 1 and cwb[0]["jobs_unlocked"] == TP01_JOBS
    assert cwb[0]["message"] == "Get CWB W47.1 → qualify for 3 more jobs worth $5.1M"
    assert before["training"][0]["status"] == "suggested"
    assert before["training"][0]["message"] == "Suggested: certify 4 welders to CWB W47.1"
    assert not any(r["requirement"] == "CWB_W47.1" for r in after["readiness"])
    assert after["training"][0]["status"] == "funded"
    assert after["training"][0]["message"] == "4 welders in training for CWB W47.1"
    assert {o["job_id"] for o in after["offers"]} >= set(TP01_JOBS)
    cwb_cert = next(c for c in after["certifications"] if c["type"] == "CWB_W47.1")
    assert cwb_cert["status"] == "pending_training"
    assert after["shop"]["capacity_hours_week"] == 280
    fx_before, fx_after = fixture("shop_syn-012.json"), fixture("shop_syn-012_after_fund.json")
    assert pending(before, fx_before) == fx_before
    assert pending(after, fx_after) == fx_after


def test_shop_detail_unknown_and_unrouted():
    st = build_state(upload=False)
    with pytest.raises(KeyError):
        pipeline.shop_detail(st, "nope")
    d = pipeline.shop_detail(st, DEMO_SHOP)
    assert d["offers"] == [] and d["training"] == []
    # Synthetic entries unchanged; discovered public shops (never routed) are appended after them.
    fx = fixture("shops.json")
    assert pending(pipeline.shops_list(st)["shops"][:30], fx["shops"]) == fx["shops"]
    assert pending(pipeline.shops_list(st, source="synthetic"), fx) == fx
    assert pipeline.shops_list(st, source="public") == fixture("shops_public.json")


# --------------------------------------------------------------------------- 6. reference parity


def test_greedy_route_reproduces_fixtures_exactly():
    st = build_state()
    res = pipeline.route(st, solver="greedy")
    fx = fixture("route.json")
    assert res["solver"] == "greedy"
    assert res["stats"] == fx["stats"]
    assert res["assignments"] == fx["assignments"]
    assert res["blocked"] == fx["blocked"]
    assert pipeline.ledger(st) == fixture("ledger.json")


def test_cpsat_total_score_at_least_greedy():
    a = build_state()
    b = build_state()
    ra = pipeline.route(a, solver="auto")
    rb = pipeline.route(b, solver="greedy")
    assert ra["stats"]["assigned"] == rb["stats"]["assigned"]
    def total(r: dict) -> float:
        return sum(x["score"] for x in r["assignments"])

    assert total(ra) >= total(rb) - 1e-9
    assert ra["stats"]["assigned_value_cad"] == rb["stats"]["assigned_value_cad"]


# --------------------------------------------------------------------------- misc


def test_route_without_parts_raises():
    st = build_state(upload=False)
    with pytest.raises(ValueError):
        pipeline.route(st)


def test_reroute_after_fund_keeps_training():
    st = build_state()
    pipeline.route(st)
    pipeline.fund(st, "TP-01")
    res = pipeline.route(st)
    assert res["stats"]["assigned"] == 39 and [b["job_id"] for b in res["blocked"]] == [HULL_JOB]
    assert st.stage == "funded"
    assert [(p["id"], p["status"]) for p in st.packages.values()] == [("TP-01", "funded"),
                                                                     ("TP-02", "suggested")]
    assert sum(t["origin"] == "training" for t in st.txns) == 1
    assert_ledger_invariants(pipeline.ledger(st))


def test_program_view_counts(routed):
    st, _, _ = routed
    pv = pipeline.program_view(st)
    assert pv["counts"] == {"jobs": 40, "assigned": 36, "blocked": 4, "shops": 30}
    assert pv["state"] == "routed"
