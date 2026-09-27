"""Hand-calculated tests for engine/ledger.py (H2.5).

credit = value_cad x ccv_pct x multiplier  (CLAUDE.md §3.5)
"""

from __future__ import annotations

import json

import pytest

from engine.ledger import (
    CATEGORY_LABELS,
    DEFAULT_MULTIPLIERS,
    assignment_txn,
    build_ledger,
    credit,
    load_multipliers,
    snapshot,
    training_txn,
)

PROGRAM = {
    "id": "northgate",
    "contract_value_cad": 500_000_000.0,
    "obligation_cad": 500_000_000.0,
    "smb_target_pct": 0.15,  # target = 500,000,000 x 0.15 = 75,000,000
    "rules_version": "demo-2026-09-26",
    "rules_label": "Simplified ITB rules for demo",
}


def _assignment(job_id: str, shop_id: str, value: float, ccv: float, is_sme: bool) -> dict:
    return {
        "job_id": job_id,
        "shop_id": shop_id,
        "is_sme": is_sme,
        "value_cad": value,
        "ccv_pct": ccv,
    }


def _package(pid: str, shop_id: str, cost: float, multiplier: int, recipient: str = "college") -> dict:
    return {
        "id": pid,
        "shop_id": shop_id,
        "est_cost_cad": cost,
        "multiplier": multiplier,
        "recipient_type": recipient,
    }


def _check_invariants(ledger: dict) -> None:
    total = ledger["credit_total_cad"]
    assert total == round(sum(t["credit_cad"] for t in ledger["transactions"]), 2)
    assert total == round(ledger["direct_credit_cad"] + ledger["indirect_credit_cad"], 2)
    ob = ledger["obligation_cad"]
    assert ledger["obligation_met_pct"] == (total / ob if ob else 0.0)
    smb = ledger["smb"]
    assert smb["progress_pct"] == (smb["achieved_cad"] / smb["target_cad"] if smb["target_cad"] else 0.0)
    assert [b["category"] for b in ledger["multiplier_breakdown"]] == [
        "regular", "sme_direct", "training", "indigenous_training",
    ]
    assert round(sum(b["credit_cad"] for b in ledger["multiplier_breakdown"]), 2) == total


# ---------------------------------------------------------------------------
# Case 1: single SME job, 2x
#   value 1,000,000 x ccv 0.85 x 2 = 1,700,000.00
#   SMB achieved = 1,000,000 x 0.85 = 850,000 (before multiplier)
#   SMB progress = 850,000 / 75,000,000 = 0.011333...
#   obligation met = 1,700,000 / 500,000,000 = 0.0034
# ---------------------------------------------------------------------------
def test_case1_single_sme_job_2x():
    tx = assignment_txn("northgate", _assignment("NG-001", "syn-001", 1_000_000.0, 0.85, True), 1)
    assert tx == {
        "id": "TX-0001",
        "program_id": "northgate",
        "origin": "assignment",
        "ref_id": "NG-001",
        "shop_id": "syn-001",
        "type": "direct",
        "category": "sme_direct",
        "value_cad": 1_000_000.0,
        "ccv_pct": 0.85,
        "multiplier": 2,
        "credit_cad": 1_700_000.0,
        "flags": ["simplified-demo"],
    }
    led = build_ledger(PROGRAM, [tx])
    assert led["credit_total_cad"] == 1_700_000.0
    assert led["direct_credit_cad"] == 1_700_000.0
    assert led["indirect_credit_cad"] == 0.0
    assert led["obligation_met_pct"] == pytest.approx(0.0034)
    assert led["smb"]["achieved_cad"] == 850_000.0
    assert led["smb"]["target_cad"] == 75_000_000.0
    assert led["smb"]["progress_pct"] == pytest.approx(850_000 / 75_000_000)
    sme = led["multiplier_breakdown"][1]
    assert sme == {
        "category": "sme_direct", "label": "SME direct work", "multiplier": 2,
        "count": 1, "value_cad": 1_000_000.0, "credit_cad": 1_700_000.0,
    }
    _check_invariants(led)


# ---------------------------------------------------------------------------
# Case 2: single non-SME job, 1x
#   value 2,000,000 x ccv 0.75 x 1 = 1,500,000.00
#   SMB achieved = 0 (not SME work) -> progress 0
#   obligation met = 1,500,000 / 500,000,000 = 0.003
# ---------------------------------------------------------------------------
def test_case2_single_regular_job_1x():
    tx = assignment_txn("northgate", _assignment("NG-002", "syn-020", 2_000_000.0, 0.75, False), 2)
    assert tx["id"] == "TX-0002"
    assert tx["category"] == "regular"
    assert tx["type"] == "direct"
    assert tx["multiplier"] == 1
    assert tx["credit_cad"] == 1_500_000.0
    led = build_ledger(PROGRAM, [tx])
    assert led["credit_total_cad"] == 1_500_000.0
    assert led["direct_credit_cad"] == 1_500_000.0
    assert led["obligation_met_pct"] == pytest.approx(0.003)
    assert led["smb"]["achieved_cad"] == 0.0
    assert led["smb"]["progress_pct"] == 0.0
    assert led["multiplier_breakdown"][0]["count"] == 1
    assert led["multiplier_breakdown"][0]["credit_cad"] == 1_500_000.0
    _check_invariants(led)


# ---------------------------------------------------------------------------
# Case 3: mixed direct SME + direct regular + indirect training 5x
#   SME job:     2,160,000 x 0.90 x 2 = 3,888,000.00  (direct)
#   Regular job:   500,000 x 0.80 x 1 =   400,000.00  (direct)
#   Training:       96,000 x 1.00 x 5 =   480,000.00  (indirect)
#   direct   = 3,888,000 + 400,000 = 4,288,000.00
#   indirect = 480,000.00
#   total    = 4,288,000 + 480,000 = 4,768,000.00
#   obligation met = 4,768,000 / 500,000,000 = 0.009536
#   SMB achieved = 2,160,000 x 0.90 = 1,944,000 -> progress 1,944,000 / 75,000,000 = 0.02592
# ---------------------------------------------------------------------------
def test_case3_mixed_direct_and_indirect():
    t1 = assignment_txn("northgate", _assignment("NG-004", "syn-004", 2_160_000.0, 0.9, True), 1)
    t2 = assignment_txn("northgate", _assignment("NG-010", "syn-021", 500_000.0, 0.8, False), 2)
    t3 = training_txn("northgate", _package("TP-01", "syn-012", 96_000.0, 5), 3)
    assert t1["credit_cad"] == 3_888_000.0
    assert t2["credit_cad"] == 400_000.0
    assert t3 == {
        "id": "TX-0003",
        "program_id": "northgate",
        "origin": "training",
        "ref_id": "TP-01",
        "shop_id": "syn-012",
        "type": "indirect",
        "category": "training",
        "value_cad": 96_000.0,
        "ccv_pct": 1.0,
        "multiplier": 5,
        "credit_cad": 480_000.0,
        "flags": ["assumption", "simplified-demo"],
    }
    led = build_ledger(PROGRAM, [t1, t2, t3])
    assert led["direct_credit_cad"] == 4_288_000.0
    assert led["indirect_credit_cad"] == 480_000.0
    assert led["credit_total_cad"] == 4_768_000.0
    assert led["obligation_met_pct"] == pytest.approx(0.009536)
    assert led["smb"]["achieved_cad"] == 1_944_000.0
    assert led["smb"]["progress_pct"] == pytest.approx(0.02592)
    counts = {b["category"]: (b["count"], b["credit_cad"]) for b in led["multiplier_breakdown"]}
    assert counts == {
        "regular": (1, 400_000.0),
        "sme_direct": (1, 3_888_000.0),
        "training": (1, 480_000.0),
        "indigenous_training": (0, 0.0),
    }
    assert len(led["transactions"]) == 3
    _check_invariants(led)


# ---------------------------------------------------------------------------
# Case 4: Indigenous training 10x
#   50,000 x 1.00 x 10 = 500,000.00 (indirect)
#   Category is indigenous_training when package multiplier == 10 OR
#   recipient_type == "indigenous_institution".
# ---------------------------------------------------------------------------
def test_case4_indigenous_training_10x():
    by_mult = training_txn("northgate", _package("TP-02", "syn-007", 50_000.0, 10), 7)
    by_recipient = training_txn(
        "northgate", _package("TP-03", "syn-008", 50_000.0, 5, "indigenous_institution"), 8
    )
    for tx in (by_mult, by_recipient):
        assert tx["category"] == "indigenous_training"
        assert tx["multiplier"] == 10
        assert tx["type"] == "indirect"
        assert tx["credit_cad"] == 500_000.0
    assert by_mult["id"] == "TX-0007"
    led = build_ledger(PROGRAM, [by_mult])
    assert led["indirect_credit_cad"] == 500_000.0
    assert led["direct_credit_cad"] == 0.0
    assert led["credit_total_cad"] == 500_000.0
    assert led["obligation_met_pct"] == pytest.approx(0.001)
    ind = led["multiplier_breakdown"][3]
    assert ind == {
        "category": "indigenous_training", "label": "Indigenous workforce development",
        "multiplier": 10, "count": 1, "value_cad": 50_000.0, "credit_cad": 500_000.0,
    }
    _check_invariants(led)


# ---------------------------------------------------------------------------
# Case 5: rounding with cents
#   SME:     12,345.67 x 0.83 x 2 = 20,493.8122  -> 20,493.81
#   Regular:  1,234.56 x 0.77 x 1 =    950.6112  ->    950.61
#   Regular:    333.33 x 0.90 x 1 =    299.997   ->    300.00
#   Training:   1,111.11 x 1.0 x 5 =  5,555.55   ->  5,555.55
#   direct   = 20,493.81 + 950.61 + 300.00 = 21,744.42
#   indirect = 5,555.55
#   total    = 21,744.42 + 5,555.55 = 27,299.97
#   SMB achieved = 12,345.67 x 0.83 = 10,246.9061 -> 10,246.91
# ---------------------------------------------------------------------------
def test_case5_rounding_cents():
    t1 = assignment_txn("northgate", _assignment("NG-011", "syn-001", 12_345.67, 0.83, True), 1)
    t2 = assignment_txn("northgate", _assignment("NG-012", "syn-020", 1_234.56, 0.77, False), 2)
    t3 = assignment_txn("northgate", _assignment("NG-013", "syn-020", 333.33, 0.9, False), 3)
    t4 = training_txn("northgate", _package("TP-04", "syn-012", 1_111.11, 5), 4)
    assert t1["credit_cad"] == 20_493.81
    assert t2["credit_cad"] == 950.61
    assert t3["credit_cad"] == 300.0
    assert t4["credit_cad"] == 5_555.55
    led = build_ledger(PROGRAM, [t1, t2, t3, t4])
    assert led["direct_credit_cad"] == 21_744.42
    assert led["indirect_credit_cad"] == 5_555.55
    assert led["credit_total_cad"] == 27_299.97
    assert led["smb"]["achieved_cad"] == 10_246.91
    _check_invariants(led)


def test_rounding_no_float_drift():
    # ten 0.10 credits: float sum is 0.9999999999999999, ledger must say 1.00
    txns = [
        assignment_txn("northgate", _assignment(f"NG-{i}", "syn-020", 0.1, 1.0, False), i)
        for i in range(10)
    ]
    led = build_ledger(PROGRAM, txns)
    assert led["credit_total_cad"] == 1.0
    _check_invariants(led)


def test_credit_function():
    assert credit(1_000_000, 0.85, 2) == 1_700_000.0
    assert credit(12_345.67, 0.83, 2) == 20_493.81
    assert credit(0, 0.9, 5) == 0.0


def test_empty_ledger_lists_all_four_categories():
    led = build_ledger(PROGRAM, [])
    assert led["program_id"] == "northgate"
    assert led["rules_version"] == "demo-2026-09-26"
    assert led["rules_label"] == "Simplified ITB rules for demo"
    assert led["obligation_cad"] == 500_000_000.0
    assert led["credit_total_cad"] == 0.0
    assert led["obligation_met_pct"] == 0.0
    assert led["transactions"] == []
    assert led["flags"] == ["simplified-demo"]
    assert led["multiplier_breakdown"] == [
        {"category": c, "label": CATEGORY_LABELS[c], "multiplier": DEFAULT_MULTIPLIERS[c],
         "count": 0, "value_cad": 0.0, "credit_cad": 0.0}
        for c in ("regular", "sme_direct", "training", "indigenous_training")
    ]
    assert set(led) == {
        "program_id", "rules_version", "rules_label", "obligation_cad", "credit_total_cad",
        "obligation_met_pct", "direct_credit_cad", "indirect_credit_cad", "smb",
        "multiplier_breakdown", "transactions", "flags",
    }
    _check_invariants(led)


def test_zero_obligation_and_zero_target():
    prog = {"id": "x", "obligation_cad": 0.0, "contract_value_cad": 0.0, "smb_target_pct": 0.0}
    tx = assignment_txn("x", _assignment("J", "S", 100.0, 1.0, True), 1)
    led = build_ledger(prog, [tx])
    assert led["obligation_met_pct"] == 0.0
    assert led["smb"]["target_cad"] == 0.0
    assert led["smb"]["progress_pct"] == 0.0
    assert led["rules_label"] == "Simplified ITB rules for demo"
    _check_invariants(led)


def test_smb_progress():
    # 3 SME jobs: CCV before multipliers
    #   10,000,000 x 0.9 = 9,000,000
    #   20,000,000 x 0.8 = 16,000,000
    #    5,000,000 x 1.0 = 5,000,000
    #   achieved = 30,000,000 ; target 75,000,000 ; progress = 0.4
    # a regular job does not count toward SMB
    txns = [
        assignment_txn("northgate", _assignment("A", "s1", 10_000_000.0, 0.9, True), 1),
        assignment_txn("northgate", _assignment("B", "s2", 20_000_000.0, 0.8, True), 2),
        assignment_txn("northgate", _assignment("C", "s3", 5_000_000.0, 1.0, True), 3),
        assignment_txn("northgate", _assignment("D", "s4", 9_000_000.0, 0.9, False), 4),
    ]
    led = build_ledger(PROGRAM, txns)
    smb = led["smb"]
    assert smb == {
        "target_pct": 0.15,
        "target_cad": 75_000_000.0,
        "achieved_cad": 30_000_000.0,
        "progress_pct": pytest.approx(0.4),
        "basis": "CCV of SME work before multipliers (assumption)",
    }
    _check_invariants(led)


def test_snapshot_fields():
    t1 = assignment_txn("northgate", _assignment("NG-004", "syn-004", 2_160_000.0, 0.9, True), 1)
    t2 = training_txn("northgate", _package("TP-01", "syn-012", 96_000.0, 5), 2)
    led = build_ledger(PROGRAM, [t1, t2])
    snap = snapshot(led, assigned=36, blocked=4)
    assert snap == {
        "assigned": 36,
        "blocked": 4,
        "credit_total_cad": 4_368_000.0,  # 3,888,000 + 480,000
        "obligation_met_pct": led["obligation_met_pct"],
        "direct_credit_cad": 3_888_000.0,
        "indirect_credit_cad": 480_000.0,
        "smb_achieved_cad": 1_944_000.0,
        "smb_progress_pct": led["smb"]["progress_pct"],
    }


def test_custom_multipliers_flow_through():
    m = {"regular": 1, "sme_direct": 3, "training": 5, "indigenous_training": 10}
    tx = assignment_txn("northgate", _assignment("J", "S", 1_000.0, 1.0, True), 1, m)
    assert tx["multiplier"] == 3 and tx["credit_cad"] == 3_000.0
    led = build_ledger(PROGRAM, [tx], m)
    assert led["multiplier_breakdown"][1]["multiplier"] == 3


# ---------------------------------------------------------------------------
# load_multipliers
# ---------------------------------------------------------------------------
def test_load_multipliers_plain_numbers(tmp_path):
    p = tmp_path / "policy.json"
    p.write_text(json.dumps({"multipliers": {"regular": 1, "sme_direct": 3, "training": 5,
                                             "indigenous_training": 10}}))
    assert load_multipliers(p) == {"regular": 1, "sme_direct": 3, "training": 5,
                                   "indigenous_training": 10}


def test_load_multipliers_value_source_objects(tmp_path):
    p = tmp_path / "policy.json"
    p.write_text(json.dumps({
        "version": "demo-2026-09-26",
        "itb": {
            "multipliers": {
                "regular": {"value": 1, "source": "ITB overview"},
                "sme_direct": {"value": 2, "source": "ITB overview"},
                "training": {"value": 6, "source": "assumption"},
                "indigenous_training": {"value": 10, "source": "ITB overview"},
                "unknown_thing": {"value": 99},
            }
        },
    }))
    assert load_multipliers(str(p)) == {"regular": 1, "sme_direct": 2, "training": 6,
                                        "indigenous_training": 10}


def test_load_multipliers_missing_or_bad_file(tmp_path):
    assert load_multipliers(tmp_path / "nope.json") == DEFAULT_MULTIPLIERS
    bad = tmp_path / "bad.json"
    bad.write_text("{not json")
    assert load_multipliers(bad) == DEFAULT_MULTIPLIERS
    noshape = tmp_path / "noshape.json"
    noshape.write_text(json.dumps({"smb_target_pct": 0.15}))
    assert load_multipliers(noshape) == DEFAULT_MULTIPLIERS


def test_load_multipliers_default_path_returns_all_categories():
    m = load_multipliers()
    assert set(m) >= set(DEFAULT_MULTIPLIERS)


# ---------------------------------------------------------------------------
# Regression tests (wave A review)
# ---------------------------------------------------------------------------
def test_ledger_flags_include_assumption_when_any_txn_has_it():
    direct = assignment_txn("northgate", _assignment("J", "S", 1_000.0, 1.0, True), 1)
    assert build_ledger(PROGRAM, [direct])["flags"] == ["simplified-demo"]
    assert build_ledger(PROGRAM, [])["flags"] == ["simplified-demo"]
    train = training_txn("northgate", _package("TP-01", "S", 1_000.0, 5), 2)
    assert build_ledger(PROGRAM, [direct, train])["flags"] == ["simplified-demo", "assumption"]


def test_indigenous_detection_uses_multiplier_table():
    m = {"regular": 1, "sme_direct": 2, "training": 5, "indigenous_training": 8}
    # multiplier 8 == table's indigenous value -> indigenous even though not 10
    tx = training_txn("northgate", _package("TP-09", "S", 1_000.0, 8), 1, m)
    assert tx["category"] == "indigenous_training"
    assert tx["multiplier"] == 8 and tx["credit_cad"] == 8_000.0
    # a hard-coded 10 no longer triggers indigenous under a table that says 8
    tx10 = training_txn("northgate", _package("TP-10", "S", 1_000.0, 10), 2, m)
    assert tx10["category"] == "training" and tx10["multiplier"] == 5
    # recipient type always wins
    tx_r = training_txn(
        "northgate", _package("TP-11", "S", 1_000.0, 5, "indigenous_institution"), 3, m
    )
    assert tx_r["category"] == "indigenous_training" and tx_r["multiplier"] == 8


@pytest.mark.parametrize("name", ["ledger.json", "ledger_after_fund.json"])
def test_rebuild_fixture_ledgers_exactly(name):
    from pathlib import Path

    fixtures = Path(__file__).resolve().parents[2] / "data" / "fixtures"
    fx_path = fixtures / name
    prog_path = fixtures / "program.json"
    if not fx_path.exists() or not prog_path.exists():
        pytest.skip(f"fixture {name} not generated")
    fx = json.loads(fx_path.read_text(encoding="utf-8"))
    prog = json.loads(prog_path.read_text(encoding="utf-8"))
    prog = prog.get("program", prog)
    rebuilt = build_ledger(prog, fx["transactions"], load_multipliers())
    assert rebuilt == fx
