"""Match scoring (H2.4): bounds, reference values, reasons."""

from __future__ import annotations

import pytest

from engine import rules, scoring
from engine.tests.test_pipeline import build_state
from engine.tests.test_rules import make_job, make_shop

PROGRAM = {"prime_name": "Northgate Land Systems",
           "site": {"city": "London", "lat": 42.9849, "lon": -81.2453}}


def test_score_bounds_real_scenario():
    st = build_state()
    w = st.config["weights"]
    for job in st.jobs:
        for shop in st.shops.values():
            d = scoring.distance_km(st.program, shop)
            s, bd = scoring.score(job, shop, d, w)
            assert 0.0 <= s <= 1.0
            assert set(bd) == {"fit", "distance", "lead_time", "itb_value"}
            assert all(0.0 <= v <= 1.0 for v in bd.values())


@pytest.mark.parametrize("dist,lead,tol,mat,env", [
    (0, 0, "ultra", "steel", [10, 10, 10]),
    (10_000, 999, "standard", "titanium", [2000, 1000, 800]),
    (-5, -5, "precision", "steel", [5000, 5000, 5000]),
])
def test_score_bounds_extremes(dist, lead, tol, mat, env):
    shop = make_shop(lead_time_days=lead, tolerance_class="standard")
    job = make_job(tolerance_class=tol, material=mat, envelope_mm=env)
    for sme in (True, False):
        shop["is_sme"] = sme
        s, bd = scoring.score(job, shop, dist, None)
        assert 0.0 <= s <= 1.0
        assert all(0.0 <= v <= 1.0 for v in bd.values())


def test_reference_value_ng001_syn021():
    st = build_state()
    job = next(j for j in st.jobs if j["id"] == "NG-001")
    shop = st.shops["syn-021"]
    d = scoring.distance_km(st.program, shop)
    s, bd = scoring.score(job, shop, d, st.config["weights"])
    assert s == 0.9428
    assert bd == {"fit": 1.0, "distance": 0.981, "lead_time": 0.65, "itb_value": 1.0}
    assert round(d, 1) == 3.7


def test_sme_scores_higher():
    job, shop = make_job(), make_shop()
    s_sme, _ = scoring.score(job, shop, 50, None)
    s_big, _ = scoring.score(job, {**shop, "is_sme": False}, 50, None)
    assert s_sme > s_big


def test_weights_from_config():
    cfg = {"weights": {"fit": 1.0, "distance": 0.0, "lead_time": 0.0, "itb_value": 0.0}}
    job, shop = make_job(), make_shop()
    s, bd = scoring.score(job, shop, 150, cfg)
    assert s == pytest.approx(scoring.fit_score(job, shop), abs=1e-4)
    assert bd["fit"] == round(scoring.fit_score(job, shop), 3)


def test_fit_terms():
    shop = make_shop(tolerance_class="precision", max_envelope_mm=[2000, 2000, 2000])
    exact = scoring.fit_score(make_job(tolerance_class="precision", envelope_mm=[10, 10, 10]), shop)
    better = scoring.fit_score(make_job(tolerance_class="standard", envelope_mm=[10, 10, 10]), shop)
    worse = scoring.fit_score(make_job(tolerance_class="ultra", envelope_mm=[10, 10, 10]), shop)
    assert exact == pytest.approx(1.0) and exact > better > worse


def test_reasons_exactly_three():
    shop, job = make_shop(), make_job(process_tags=["welding", "sheet_metal", "painting"],
                                      required_certs=["ISO9001", "CWB_W47.1"])
    r = scoring.reasons(job, shop, 87.6, 3, PROGRAM)
    assert r == ["Welding + sheet metal + CWB W47.1", "88 km from Northgate's London site",
                 "SME: 2x direct credit"]


def test_reasons_controlled_and_non_sme():
    shop = make_shop(is_sme=False)
    r = scoring.reasons(make_job(controlled=True), shop, 10, 1, PROGRAM)
    assert r[1] == "CGP-registered (controlled job)"
    assert r[2] == "Only qualified shop in range (1x credit)"
    assert scoring.reasons(make_job(), shop, 10, 2, PROGRAM)[2] == "Large firm: 1x direct credit"


def test_reason_cert_priority():
    job = make_job(process_tags=["wire_harness"], required_certs=["ISO9001", "CPCSC_L1"])
    assert scoring.reasons(job, make_shop(), 1, 1, PROGRAM)[0] == "Wire harness + CPCSC Level 1"
    assert rules.CERT_REASON_PRIORITY[0] == "CWB_W47.1"
