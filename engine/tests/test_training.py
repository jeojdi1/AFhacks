"""Fund-training simulation (H2.7)."""

from __future__ import annotations

import pytest

from engine import pipeline, training
from engine.tests.test_pipeline import DEMO_SHOP, TP01_JOBS, build_state


def test_fund_before_routing_raises():
    st = build_state()
    with pytest.raises(ValueError, match="not routed"):
        pipeline.fund(st, "TP-01")


def test_fund_unknown_package_raises():
    st = build_state()
    pipeline.route(st)
    with pytest.raises(KeyError):
        pipeline.fund(st, "TP-99")


def test_fund_applies_unlocks_and_txn():
    st = build_state()
    pipeline.route(st)
    n_txns = len(st.txns)
    res = pipeline.fund(st, "TP-01")
    assert st.cert_overrides == {DEMO_SHOP: {"CWB_W47.1": "pending_training"}}
    assert st.capacity_bonus == {DEMO_SHOP: 80}
    assert st.funded == ["TP-01"]
    shop = pipeline.effective_shop(st, DEMO_SHOP)
    assert shop["capacity_hours_week"] == 280
    cwb = next(c for c in shop["certifications"] if c["type"] == "CWB_W47.1")
    assert cwb["status"] == "pending_training"
    assert cwb["note"] == "Pending training: TP-01 funded (4 trainees; demo simulation)"
    # base shop data is never mutated by funding
    base = next(c for c in st.shops[DEMO_SHOP]["certifications"] if c["type"] == "CWB_W47.1")
    assert base["status"] == "unknown" and st.shops[DEMO_SHOP]["capacity_hours_week"] == 200

    txn = res["training_txn"]
    assert txn["id"] == f"TX-{n_txns + 1:04d}"
    assert txn["origin"] == "training" and txn["type"] == "indirect" and txn["ccv_pct"] == 1.0
    assert txn["value_cad"] == 96000.0 and txn["credit_cad"] == 480000.0
    assert txn["flags"] == ["assumption", "simplified-demo"]
    new_ids = [t["ref_id"] for t in st.txns[n_txns + 1:]]
    assert new_ids == TP01_JOBS
    assert [t["id"] for t in st.txns] == [f"TX-{i:04d}" for i in range(1, len(st.txns) + 1)]


def test_credit_added_is_after_minus_before():
    st = build_state()
    pipeline.route(st)
    res = pipeline.fund(st, "TP-01")
    b, a = res["before"], res["after"]
    assert (b["assigned"], b["blocked"], a["assigned"], a["blocked"]) == (36, 4, 39, 1)
    added = round(a["credit_total_cad"] * 100) - round(b["credit_total_cad"] * 100)
    assert round(res["credit_added"] * 100) == added
    jobs_c = sum(round(x["credit_cad"] * 100) for x in res["unblocked_jobs"])
    assert round(res["credit_added_breakdown"]["jobs_cad"] * 100) == jobs_c
    assert added == jobs_c + 48000000
    assert a["smb_progress_pct"] > b["smb_progress_pct"]
    assert a["obligation_met_pct"] - b["obligation_met_pct"] >= 0.012


def test_headline_format():
    pkg = {"est_cost_cad": 96000.0, "est_credit_cad": 480000.0, "multiplier": 5}
    assert training.headline(pkg, 3, 9122400.0) == (
        "$96K training → $480K credit (5x) + 3 jobs unblocked (+$9.1M credit)")
    pkg = {"est_cost_cad": 40000.0, "est_credit_cad": 400000.0, "multiplier": 10}
    assert training.headline(pkg, 1, 2701800.0) == (
        "$40K training → $400K credit (10x) + 1 job unblocked (+$2.7M credit)")
    assert training.headline(pkg, 0, 0).endswith("0 jobs unblocked (+$0 credit)")


def test_apply_funding_accumulates_capacity():
    from types import SimpleNamespace

    s = SimpleNamespace(cert_overrides={}, capacity_bonus={})
    training.apply_funding(s, {"shop_id": "x", "cert_unlock": None, "capacity_unlock": {"welding": 40}})
    training.apply_funding(s, {"shop_id": "x", "cert_unlock": "CWB_W47.1",
                               "capacity_unlock": {"welding": 20}})
    assert s.capacity_bonus == {"x": 60}
    assert s.cert_overrides == {"x": {"CWB_W47.1": "pending_training"}}


def test_fund_capacity_package_first_unblocks_its_own_job():
    """Funding TP-02 before TP-01: the extra hours at syn-026 go to NG-034 (the package's
    job), not a higher-scoring job, and no duplicate of TP-02 is suggested."""
    from engine.tests.test_pipeline import HULL_JOB

    st = build_state()
    pipeline.route(st)
    tp02 = st.packages["TP-02"]
    assert tp02["blocked_job_ids"] == [HULL_JOB]
    res = pipeline.fund(st, "TP-02")
    assert [a["job_id"] for a in res["unblocked_jobs"]] == [HULL_JOB]
    assert st.assignments[HULL_JOB]["shop_id"] == tp02["shop_id"]
    assert res["still_blocked"] == TP01_JOBS
    g = pipeline.gaps(st)
    assert [(p["id"], p["status"], p["blocked_job_ids"]) for p in g["suggestions"]] == [
        ("TP-01", "suggested", TP01_JOBS), ("TP-02", "funded", [HULL_JOB])]
    assert [b["suggestion_ids"] for b in g["blocked"]] == [["TP-01"]] * 3
    # a full re-route keeps the funded job on the trained shop
    pipeline.route(st)
    assert st.assignments[HULL_JOB]["shop_id"] == tp02["shop_id"]
    assert [b["job_id"] for b in st.blocked] == TP01_JOBS
    # then TP-01 unblocks the rest
    res = pipeline.fund(st, "TP-01")
    assert [a["job_id"] for a in res["unblocked_jobs"]] == TP01_JOBS and res["still_blocked"] == []


def test_funded_package_never_in_suggestion_ids():
    st = build_state()
    pipeline.route(st)
    pipeline.fund(st, "TP-01")
    for b in st.blocked:
        assert all(st.packages[p]["status"] == "suggested" for p in b["suggestion_ids"])
