"""Every trade, not just welders: the trade catalog, gap → trade mapping, packages,
readiness and training messages for CNC machining, electronics and harness work.

The Northgate demo's welding packages (TP-01, TP-02) must not change: see
test_welding_demo_unchanged_with_or_without_catalog.
"""

from __future__ import annotations

import copy
import math
import re

import pytest

from engine import gaps, pipeline, rules, search, tagger, trades
from engine.tests.test_pipeline import DEMO_SHOP, TP01_JOBS, build_state

HEADER = "part_no,description,qty,unit_price_cad,process_tags,required_certs,controlled,envelope_mm,hours_week\n"


def tc_of(st) -> dict:
    return pipeline.config(st)["training_costs"]


def routed_user(rows: str, tweak=None):
    """A fresh state with only the given CSV rows uploaded and routed."""
    st = build_state(upload=False)
    if tweak:
        tweak(st)
    st.jobs, _ = tagger.tag_rows(tagger.parse_csv(HEADER + rows), use_llm=False)
    pipeline.route(st)
    return st


def only_package(st) -> dict:
    (pkg,) = st.packages.values()
    return pkg


# --------------------------------------------------------------------------- catalog


def test_catalog_covers_the_trades_and_is_labelled():
    cat = trades.catalog(rules.load_rules()["training_costs"])
    assert {"welding", "cnc_machining", "electronics_assembly", "cable_harness",
            "coatings_plating", "quality_inspection"} <= set(cat)
    for key, t in cat.items():
        assert t["label"] and t["worker"] and t["workers"], key
        assert t.get("flag") == "assumption", key
        assert set(t.get("processes") or []) <= set(tagger.PROCESS_TAGS), key
        assert set(t.get("certs") or []) <= set(tagger.CERT_TYPES), key
        for cat_name, val in (t.get("cost_cad") or {}).items():
            assert cat_name in ("personal_certification", "apprentice_sponsorship",
                                "skills_program_contribution", "education_costs")
            assert isinstance(val, (int, float)) and val > 0
    # welding keeps the original costs block, so TP-01 stays $24K per seat
    assert "cost_cad" not in cat["welding"] and "categories" not in cat["welding"]


def test_every_process_but_three_maps_to_a_trade():
    tc = rules.load_rules()["training_costs"]
    want = {
        "welding": "welding",
        "cnc_milling": "cnc_machining", "five_axis_milling": "cnc_machining",
        "cnc_turning": "cnc_machining",
        "electronics_assembly": "electronics_assembly",
        "wire_harness": "cable_harness",
        "plating": "coatings_plating", "anodizing": "coatings_plating",
        "painting": "coatings_plating",
    }
    for proc, key in want.items():
        assert trades.for_gap(tc, "capacity", proc)[0] == key, proc
    for proc in ("heat_treat", "sheet_metal", "fasteners"):
        assert trades.for_gap(tc, "capacity", proc) is None
    assert trades.for_gap(tc, "cert", "CWB_W47.1")[0] == "welding"
    assert trades.for_gap(tc, "cert", "IPC_A_610")[0] == "electronics_assembly"
    assert trades.for_gap(tc, "cert", "IPC_J_STD_001")[0] == "electronics_assembly"
    assert trades.for_gap(tc, "cert", "IPC_WHMA_A_620")[0] == "cable_harness"
    # a cert in no trade falls back to the job's process
    assert trades.for_gap(tc, "cert", "AS9100", "cnc_turning")[0] == "cnc_machining"
    assert {"CWB_W47.1", "IPC_A_610", "IPC_J_STD_001", "IPC_WHMA_A_620"} <= set(tc["trainable_certs"])


def test_worker_nouns():
    tc = rules.load_rules()["training_costs"]
    cnc = trades.catalog(tc)["cnc_machining"]
    assert trades.workers(cnc, 1) == "1 CNC machinist"
    assert trades.workers(cnc, 2) == "2 CNC machinists"
    assert trades.workers(None, 3) == "3 qualified workers"
    assert trades.for_package(tc, {"cert_unlock": None, "capacity_unlock": {"wire_harness": 40}})[0] \
        == "cable_harness"
    assert trades.for_package(tc, {"cert_unlock": "CWB_W47.1", "capacity_unlock": {"welding": 80}})[0] \
        == "welding"


# --------------------------------------------------------------------------- welding unchanged


def test_welding_demo_unchanged_with_or_without_catalog():
    """TP-01/TP-02 are identical with the trade catalog and with the original rule file."""
    new = build_state()
    pipeline.route(new)
    old = build_state()
    legacy = copy.deepcopy(old.config["training_costs"])
    legacy.pop("trades", None)
    legacy["trainable_certs"] = ["CWB_W47.1"]
    old.config["training_costs"] = legacy
    pipeline.route(old)
    assert new.packages == old.packages
    assert pipeline.gaps(new) == pipeline.gaps(old)
    assert pipeline.shop_detail(new, DEMO_SHOP) == pipeline.shop_detail(old, DEMO_SHOP)
    tp1 = new.packages["TP-01"]
    assert tp1["title"] == "Certify 4 welders to CWB W47.1 at Tallowfield Fabricating Ltd. (Woolwich)"
    assert tp1["blocked_job_ids"] == TP01_JOBS
    assert new.packages["TP-02"]["title"].startswith("Sponsor 2 welding apprentices at ")
    f1 = pipeline.fund(new, "TP-01")
    assert f1["headline"] == "$96K training → $480K credit (5x) + 3 jobs unblocked (+$9.1M credit)"


# --------------------------------------------------------------------------- IPC (electronics)


IPC_ROW = "E-1,Power converter board assembly,100,1000,electronics_assembly,IPC-A-610 Class 3,false,300x200x100,10\n"


@pytest.fixture(scope="module")
def ipc():
    return routed_user(IPC_ROW)


def test_ipc_cert_gap_certifies_electronics_assemblers(ipc):
    st = ipc
    assert st.jobs[0]["required_certs"] == ["IPC_A_610"]
    (b,) = st.blocked
    assert b["reason_code"] == "certs"
    assert b["reason"].startswith("No electronics assembly shop holds IPC-A-610")
    pkg = only_package(st)
    assert pkg["gap"] == {
        "kind": "cert", "requirement": "IPC_A_610",
        "detail": pkg["gap"]["detail"],
    }
    assert pkg["title"].startswith("Certify 4 electronics assemblers to IPC-A-610 at ")
    assert "welder" not in pkg["title"]
    assert pkg["category"] == "personal_certification" and pkg["multiplier"] == 5
    assert pkg["est_cost_cad"] == 4 * 6000.0 and pkg["est_credit_cad"] == 4 * 6000.0 * 5
    assert pkg["recipient_example"] == "IPC-licensed training centre (example, not affiliated)"
    assert pkg["cert_unlock"] == "IPC_A_610"
    g = pipeline.gaps(st)
    assert g["summary"]["top_reason"] == "IPC-A-610 electronics assembler shortage (certification + capacity)"


def test_ipc_readiness_and_training_messages(ipc):
    st = copy.deepcopy(ipc)
    pkg = only_package(st)
    other = next(s for s in ("syn-016", "syn-017", "syn-018", "syn-019") if s != pkg["shop_id"])
    ready = pipeline.shop_detail(st, other)["readiness"]
    assert [r["message"] for r in ready if r["requirement"] == "IPC_A_610"] == [
        "Certify 4 electronics assemblers to IPC-A-610 → qualify for 1 more job worth $100K"
    ]
    before = pipeline.shop_detail(st, pkg["shop_id"])["training"]
    assert before[0]["message"] == "Suggested: certify 4 electronics assemblers to IPC-A-610"
    pipeline.fund(st, pkg["id"])
    assert st.assignments["NG-001"]["shop_id"] == pkg["shop_id"]
    after = pipeline.shop_detail(st, pkg["shop_id"])["training"]
    assert after[0]["message"] == "4 electronics assemblers in training for IPC-A-610"


# --------------------------------------------------------------------------- capacity gaps


def _big_job(st, proc: str) -> int:
    """Hours/week above every shop's capacity for ``proc`` (so every shop fails capacity)."""
    return max(s["capacity_hours_week"] for s in st.shops.values() if proc in s["processes"]) + 10


def test_cnc_capacity_gap_sponsors_cnc_machinist_apprentices():
    probe = build_state(upload=False)
    hours = _big_job(probe, "cnc_milling")

    def cheaper(st):
        st.config["training_costs"]["trades"]["cnc_machining"]["cost_cad"]["apprentice_sponsorship"] = 15000

    st = routed_user(f"M-1,Milled housing,10,20000,cnc_milling,,false,300x200x100,{hours}\n", cheaper)
    pkg = only_package(st)
    shop = st.shops[pkg["shop_id"]]
    n = math.ceil((hours - shop["capacity_hours_week"]) / 20)
    assert pkg["gap"]["kind"] == "capacity" and pkg["gap"]["requirement"] == "cnc_milling"
    assert pkg["category"] == "apprentice_sponsorship" and pkg["multiplier"] == 10
    noun = "CNC machinist apprentice" if n == 1 else "CNC machinist apprentices"
    assert pkg["title"] == (
        f"Sponsor {n} {noun} at {shop['name']} ({shop['city']}) through an Indigenous-governed "
        "training institute"
    )
    assert pkg["est_cost_cad"] == n * 15000.0  # the trade's own cost, not the welding one
    assert pkg["capacity_unlock"] == {"cnc_milling": n * 20}
    (b,) = st.blocked
    assert "all are at capacity" in b["reason"] and b["reason"].endswith("(shortage of CNC machinists)")
    # another milling shop that only lacks hours: readiness names the trade
    other = next(
        sid for sid, s in st.shops.items()
        if sid != pkg["shop_id"] and "cnc_milling" in s["processes"]
    )
    k = math.ceil((hours - st.shops[other]["capacity_hours_week"]) / 20)
    (item,) = [r for r in pipeline.shop_detail(st, other)["readiness"] if r["kind"] == "capacity"]
    assert item["message"] == (
        f"Train {trades.workers(trades.catalog(tc_of(st))['cnc_machining'], k)} "
        f"(+{k * 20} h/week CNC milling) → qualify for 1 more job worth $200K"
    )


def test_electronics_capacity_gap_trains_assemblers_for_education_costs():
    probe = build_state(upload=False)
    hours = _big_job(probe, "electronics_assembly")
    st = routed_user(f"B-1,Box build: rugged enclosure with boards,10,20000,,,false,300x200x100,{hours}\n")
    assert st.jobs[0]["process_tags"][0] == "electronics_assembly"
    pkg = only_package(st)
    shop = st.shops[pkg["shop_id"]]
    n = math.ceil((hours - shop["capacity_hours_week"]) / 20)
    assert pkg["category"] == "education_costs" and pkg["categories"] == ["education_costs"]
    assert re.fullmatch(
        rf"Train {n} electronics assemblers? at .+ through an Indigenous-governed training institute",
        pkg["title"],
    )
    assert pkg["est_cost_cad"] == n * 12000.0 and pkg["multiplier"] == 10
    assert "education costs" in pkg["eligibility_note"]
    who = trades.workers(trades.catalog(tc_of(st))["electronics_assembly"], n)
    assert pipeline.shop_detail(st, shop["id"])["training"][0]["message"] == f"Suggested: train {who}"
    pipeline.fund(st, pkg["id"])
    assert pipeline.shop_detail(st, shop["id"])["training"][0]["message"] == f"{who} in training"


def test_unmapped_process_keeps_generic_readiness():
    probe = build_state(upload=False)
    hours = _big_job(probe, "heat_treat")
    st = routed_user(f"H-1,Heat treat service,10,20000,heat_treat,,false,300x200x100,{hours}\n")
    msgs = [r["message"] for sid in st.shops for r in pipeline.shop_detail(st, sid)["readiness"]
            if r["kind"] == "capacity"]
    assert msgs and all(m.startswith("Add heat treating capacity → ") for m in msgs)


# --------------------------------------------------------------------------- matching vocabulary


@pytest.mark.parametrize("desc,proc", [
    ("Box build: rugged enclosure, boards and harness integration", "electronics_assembly"),
    ("Electronics subassembly for the crew intercom", "electronics_assembly"),
    ("PCBA, surface-mount, IPC-A-610 Class 3", "electronics_assembly"),
    ("Cable harness for the turret, IPC/WHMA-A-620", "wire_harness"),
    ("Cable assemblies, shielded", "wire_harness"),
])
def test_rule_tags_recognise_electronics_and_harness_work(desc, proc):
    assert rules_first(desc) == proc


def rules_first(desc: str) -> str:
    return tagger.rule_tags(desc)["process_tags"][0]


def test_rule_tags_ipc_certs_only_when_named():
    assert tagger.rule_tags("Power converter, IPC-A-610 Class 3, ISO 9001")["required_certs"] == [
        "ISO9001", "IPC_A_610"]
    assert tagger.rule_tags("Harness, IPC/WHMA-A-620")["required_certs"] == ["IPC_WHMA_A_620"]
    assert tagger.rule_tags("Solder to J-STD-001")["required_certs"] == ["IPC_J_STD_001"]
    assert tagger.rule_tags("Intercom control box electronics assembly")["required_certs"] == []
    assert "box build" not in tagger.rule_tags("Tool and equipment box, steel, MIG welded")["process_tags"]
    assert tagger.rule_tags("Tool and equipment box, steel, MIG welded")["process_tags"] == ["welding"]


@pytest.mark.parametrize("cell,expected", [
    ("IPC-A-610 Class 3", ["IPC_A_610"]),
    ("J-STD-001", ["IPC_J_STD_001"]),
    ("IPC/WHMA-A-620", ["IPC_WHMA_A_620"]),
    ("ISO 9001; IPC-A-610", ["ISO9001", "IPC_A_610"]),
])
def test_csv_ipc_cells_normalised(cell, expected):
    rows = tagger.parse_csv(f'part_no,description,qty,unit_price_cad,required_certs\nP-1,Board,1,10,"{cell}"\n')
    assert rows[0]["required_certs"] == expected


@pytest.mark.parametrize("cell,expected", [
    ("box build", ["electronics_assembly"]),
    ("electronics subassembly; cable harness", ["electronics_assembly", "wire_harness"]),
    ("PCBA", ["electronics_assembly"]),
    ("CNC machining", ["cnc_milling"]),
])
def test_csv_process_synonyms(cell, expected):
    rows = tagger.parse_csv(f'part_no,description,qty,unit_price_cad,process_tags\nP-1,Part,1,10,"{cell}"\n')
    assert rows[0]["process_tags"] == expected


def test_search_understands_trade_words():
    assert search.normalize_process("box build") == "electronics_assembly"
    assert search.normalize_process("cable harness") == "wire_harness"
    assert search.normalize_process("electronics subassembly") == "electronics_assembly"
    assert search.normalize_cert("IPC-A-610") == "IPC_A_610"
    assert search.normalize_cert("IPC/WHMA-A-620") == "IPC_WHMA_A_620"
    assert search.normalize_cert("J-STD-001") == "IPC_J_STD_001"


def test_ipc_labels():
    assert rules.cert_label("IPC_A_610") == "IPC-A-610"
    assert rules.cert_label("IPC_WHMA_A_620") == "IPC/WHMA-A-620"
    assert rules.cert_label("IPC_J_STD_001") == "IPC J-STD-001"
    # IPC is an operator certification, not one of the company certifications every profile tracks
    assert "IPC_A_610" not in rules.CERT_LABEL
    assert gaps.main_cert({"required_certs": ["ISO9001", "IPC_A_610"]}) == "IPC_A_610"
