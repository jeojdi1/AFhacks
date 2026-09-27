"""Hard filters (H2.3): each filter, CGP gate, pending_training, readable reasons."""

from __future__ import annotations

import pytest

from engine import rules
from engine.tests.test_pipeline import build_state


def make_shop(**kw) -> dict:
    certs = kw.pop("certs", {})
    shop = {
        "id": "s1", "name": "Test Shop", "source": "synthetic", "city": "Kitchener",
        "lat": 43.45, "lon": -80.49, "is_sme": True,
        "processes": ["welding", "sheet_metal"], "materials": ["steel"],
        "max_envelope_mm": [2000, 1000, 800], "tolerance_class": "standard",
        "capacity_hours_week": 80, "lead_time_days": 20,
    }
    shop.update(kw)
    shop["certifications"] = [
        {"shop_id": shop["id"], "type": t, "status": s} for t, s in certs.items()
    ]
    return shop


def make_job(**kw) -> dict:
    job = {
        "id": "J-1", "part_no": "P-1", "description": "test", "hours_week": 20,
        "est_value_cad": 100000.0, "ccv_pct": 0.9, "material": "steel",
        "process_tags": ["welding"], "envelope_mm": [900, 600, 450],
        "tolerance_class": "standard", "required_certs": [], "controlled": False,
    }
    job.update(kw)
    return job


def test_all_pass():
    res = rules.evaluate(make_job(), make_shop(), 80)
    assert res == {"eligible": True, "failing": [], "reasons": {}}


def test_process_filter():
    res = rules.evaluate(make_job(process_tags=["welding", "painting"]), make_shop())
    assert res["failing"] == ["process"]
    assert "painting" in res["reasons"]["process"]


def test_envelope_filter_uses_sorted_dims():
    shop = make_shop(max_envelope_mm=[800, 2000, 1000])
    assert rules.evaluate(make_job(envelope_mm=[450, 900, 600]), shop)["eligible"]
    res = rules.evaluate(make_job(envelope_mm=[2100, 100, 100]), shop)
    assert res["failing"] == ["envelope"]
    assert "2100x100x100" in res["reasons"]["envelope"]


@pytest.mark.parametrize("status,ok", [
    ("verified", True), ("declared", True), ("pending_training", True),
    ("unknown", False), (None, False),
])
def test_certs_filter_counting_statuses(status, ok):
    certs = {"CWB_W47.1": status} if status else {}
    res = rules.evaluate(make_job(required_certs=["CWB_W47.1"]), make_shop(certs=certs))
    assert res["eligible"] is ok
    if not ok:
        assert res["failing"] == ["certs"]
        assert "CWB W47.1" in res["reasons"]["certs"]


def test_pending_training_cert_counts():
    shop = make_shop(certs={"CWB_W47.1": "pending_training"})
    assert rules.cert_counts(shop, "CWB_W47.1")
    assert rules.is_eligible(make_job(required_certs=["CWB_W47.1"]), shop, 80)


@pytest.mark.parametrize("cgp", ["unknown", None])
def test_controlled_job_never_eligible_for_non_cgp_shop(cgp):
    certs = {"CGP": cgp} if cgp else {}
    job = make_job(controlled=True)
    res = rules.evaluate(job, make_shop(certs=certs), 80)
    assert not res["eligible"]
    assert res["failing"] == ["controlled_cgp"]
    assert "CGP" in res["reasons"]["controlled_cgp"]


@pytest.mark.parametrize("cgp", ["verified", "declared", "pending_training"])
def test_controlled_job_ok_for_cgp_shop(cgp):
    assert rules.is_eligible(make_job(controlled=True), make_shop(certs={"CGP": cgp}), 80)


def test_controlled_never_on_non_cgp_across_real_scenario():
    st = build_state()
    for job in st.jobs:
        if not job["controlled"]:
            continue
        for shop in st.shops.values():
            if not rules.cert_counts(shop, "CGP"):
                assert "controlled_cgp" in rules.failing_filters(job, shop, 10_000)


def test_cpcsc_filter_only_when_required():
    shop = make_shop(certs={"CPCSC_L1": "unknown"})
    assert rules.is_eligible(make_job(), shop)
    res = rules.evaluate(make_job(required_certs=["CPCSC_L1"]), shop)
    assert res["failing"] == ["cpcsc"]  # CPCSC is checked by cpcsc, not certs
    assert "CPCSC Level 1" in res["reasons"]["cpcsc"]
    assert rules.is_eligible(make_job(required_certs=["CPCSC_L1"]),
                             make_shop(certs={"CPCSC_L1": "declared"}))


def test_capacity_filter():
    job = make_job(hours_week=20)
    assert rules.is_eligible(job, make_shop(), 20)  # remaining >= hours_week
    res = rules.evaluate(job, make_shop(), 19)
    assert res["failing"] == ["capacity"]
    assert "19" in res["reasons"]["capacity"] and "20" in res["reasons"]["capacity"]
    assert rules.is_eligible(job, make_shop(), None)  # None skips capacity


def test_multiple_failures_in_filter_order():
    job = make_job(process_tags=["painting"], envelope_mm=[5000, 10, 10],
                   required_certs=["AS9100", "CPCSC_L1"], controlled=True, hours_week=99)
    res = rules.evaluate(job, make_shop(), 10)
    assert res["failing"] == list(rules.FILTERS)
    assert set(res["reasons"]) == set(rules.FILTERS)


def test_every_rejection_has_a_reason_real_scenario():
    st = build_state()
    n_rejections = 0
    for job in st.jobs:
        for shop in st.shops.values():
            for rem in (None, 0, shop["capacity_hours_week"]):
                res = rules.evaluate(job, shop, rem)
                assert set(res["reasons"]) == set(res["failing"])
                assert all(isinstance(r, str) and r.strip() for r in res["reasons"].values())
                assert res["eligible"] == (not res["failing"])
                n_rejections += len(res["failing"])
    assert n_rejections > 0


def test_counting_statuses_from_config():
    cfg = rules.load_rules()
    assert rules.counting_statuses(cfg["filters"]) == ("verified", "declared", "pending_training")
    assert rules.counting_statuses({}) == rules.COUNTING_STATUSES
    shop = make_shop(certs={"CWB_W47.1": "declared"})
    job = make_job(required_certs=["CWB_W47.1"])
    assert not rules.is_eligible(job, shop, counting=("verified",))


def test_load_rules_missing_dir(tmp_path):
    assert rules.load_rules(tmp_path) == {k: {} for k in rules.RULE_FILES}
