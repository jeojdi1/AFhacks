"""Tests for engine/tagger.py (H2.2). No network: the Anthropic client is mocked."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from engine import tagger
from engine.tagger import (
    CERT_TYPES,
    MATERIALS,
    PROCESS_TAGS,
    TOLERANCE_CLASSES,
    cache_key,
    llm_tags,
    load_cache,
    parse_csv,
    rule_tags,
    tag_rows,
)

REPO = Path(__file__).resolve().parents[2]
REAL_CSV = REPO / "data" / "processed" / "parts_northgate.csv"
REAL_CACHE = REPO / "data" / "cache" / "tags_northgate.json"

HEADER = "part_no,description,qty,unit_price_cad"


# --- mocked Anthropic client --------------------------------------------------------
class FakeMessages:
    def __init__(self, text: str | None = None, exc: Exception | None = None, stop="end_turn"):
        self.text, self.exc, self.stop = text, exc, stop
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.exc is not None:
            raise self.exc
        return SimpleNamespace(
            stop_reason=self.stop,
            content=[SimpleNamespace(type="text", text=self.text)],
        )


class FakeClient:
    def __init__(self, **kw):
        self.messages = FakeMessages(**kw)


LLM_JSON = json.dumps(
    {
        "process_tags": ["cnc_turning", "heat_treat"],
        "material": "titanium",
        "envelope_mm": [300, 50, 50],
        "tolerance_class": "ultra",
        "required_certs": ["AS9100"],
        "controlled": True,
    }
)


@pytest.fixture(autouse=True)
def _no_api_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)


# --- cache_key ----------------------------------------------------------------------
def test_cache_key_formula():
    expected = hashlib.sha256(b"NG-1|Bracket, steel").hexdigest()
    assert cache_key("NG-1", "Bracket, steel") == expected
    assert len(cache_key("a", "b")) == 64


# --- parse_csv ----------------------------------------------------------------------
def test_parse_csv_happy_path_with_optional_columns():
    text = (
        "part_no,description,qty,unit_price_cad,material,process_tags,envelope_mm,"
        "tolerance_class,required_certs,controlled,ccv_pct,hours_week\n"
        'P-1,"Bracket, steel",100,25.5,,,,,,,,\n'
        "\n"
        'P-2,"Hull weldment",10,1000,armour_steel,welding;painting,900x600x450,'
        "precision,CWB_W47.1;ISO9001,yes,0.9,12\n"
    )
    rows = parse_csv(text)
    assert len(rows) == 2
    r1, r2 = rows
    assert r1["part_no"] == "P-1" and r1["description"] == "Bracket, steel"
    assert r1["qty"] == 100 and r1["unit_price_cad"] == 25.5
    assert r1["ccv_pct"] == 0.85
    assert r1["hours_week"] == 4  # tiny value -> clamped to the minimum
    for f in tagger.TAG_FIELDS:
        assert f not in r1  # blanks are not explicit values
    assert r2["material"] == "armour_steel"
    assert r2["process_tags"] == ["welding", "painting"]
    assert r2["envelope_mm"] == [900, 600, 450]
    assert r2["tolerance_class"] == "precision"
    assert r2["required_certs"] == ["CWB_W47.1", "ISO9001"]
    assert r2["controlled"] is True
    assert r2["ccv_pct"] == 0.9 and r2["hours_week"] == 12


def test_parse_csv_hours_derived_and_clamped_high():
    rows = parse_csv(f"{HEADER}\nP-1,Big job,1000,100000\n")
    assert rows[0]["hours_week"] == 60


def test_parse_csv_missing_columns_named():
    with pytest.raises(ValueError) as ei:
        parse_csv("part_no,description\nP-1,thing\n")
    msg = str(ei.value)
    assert "qty" in msg and "unit_price_cad" in msg


def test_parse_csv_bad_number_names_row():
    text = f"{HEADER}\nP-1,ok,10,5\nP-2,bad,ten,5\n"
    with pytest.raises(ValueError, match=r"Row 3: qty 'ten' is not a number"):
        parse_csv(text)


def test_parse_csv_bad_controlled_names_row():
    text = f"{HEADER},controlled\nP-1,ok,10,5,maybe\n"
    with pytest.raises(ValueError, match="Row 2: controlled"):
        parse_csv(text)


def test_parse_csv_strips_bom_and_ignores_blank_lines():
    text = f"﻿{HEADER}\r\n\r\nP-1,Bolt kit,5,2\r\n\r\n"
    rows = parse_csv(text)
    assert len(rows) == 1 and rows[0]["part_no"] == "P-1"


def test_parse_csv_empty_is_error():
    with pytest.raises(ValueError):
        parse_csv("")
    with pytest.raises(ValueError, match="no data rows"):
        parse_csv(HEADER + "\n")


# --- rule_tags ----------------------------------------------------------------------
@pytest.mark.parametrize(
    ("desc", "procs", "material", "certs", "controlled", "tol"),
    [
        (
            "Turret ring bearing housing, 4340 steel, 5-axis milled, AS9100, controlled technical data (CGP)",
            ["five_axis_milling"], "steel", ["AS9100"], True, "standard",
        ),
        (
            "Hull belly plate weldment, armour steel, structural welding to CWB W47.1",
            ["welding"], "armour_steel", ["CWB_W47.1"], False, "standard",
        ),
        (
            "Chassis power distribution wire harness, copper, ISO 9001",
            ["wire_harness"], "copper", ["ISO9001"], False, "standard",
        ),
        (
            "Type III hard anodize service, aluminum turret housings, Nadcap chemical processing",
            ["anodizing"], "aluminum", ["NADCAP:CHEM_PROCESSING"], False, "standard",
        ),
        (
            "Heat treat service: through-harden and temper 4340 drive shafts, Nadcap heat treating",
            ["heat_treat"], "steel", ["NADCAP:HEAT_TREAT"], False, "standard",
        ),
        (
            "Powder coat service, steel stowage brackets, CARC topcoat",
            ["painting"], "steel", [], False, "standard",
        ),
        (
            "Drive shaft, 17-4 stainless, precision ground, ±0.01 mm",
            ["cnc_turning"], "stainless", [], False, "precision",
        ),
        (
            "Periscope guard bracket, mild steel, laser cut and press-brake formed sheet metal",
            ["sheet_metal"], "steel", [], False, "standard",
        ),
        (
            "Armour bolt kits, grade 8 steel fasteners, zinc-nickel finish, ISO 9001",
            ["fasteners"], "armour_steel", ["ISO9001"], False, "standard",
        ),
        (
            (
                "Mission computer chassis, CNC milled aluminium enclosure with electronics "
                "assembly, CPCSC Level 1, controlled goods"
            ),
            ["electronics_assembly", "cnc_milling"], "aluminum", ["CPCSC_L1"], True, "standard",
        ),
        (
            "Hydraulic valve block, 7075, ultra-precision bores ±0.005 mm",
            ["cnc_milling"], "aluminum", [], False, "ultra",
        ),
        (
            "Titanium hinge pin, CNC turned on a lathe, AS9100",
            ["cnc_turning"], "titanium", ["AS9100"], False, "standard",
        ),
        (
            "Nylon cable assembly strain relief, polymer",
            ["wire_harness"], "polymer", [], False, "standard",
        ),
        (
            "Electroless nickel plating service, hydraulic manifold components",
            ["plating"], "steel", [], False, "standard",
        ),
    ],
)
def test_rule_tags_representative(desc, procs, material, certs, controlled, tol):
    t = rule_tags(desc)
    assert t["process_tags"] == procs
    assert t["material"] == material
    assert t["required_certs"] == certs
    assert t["controlled"] is controlled
    assert t["tolerance_class"] == tol
    assert "tag_warning" not in t
    assert len(t["envelope_mm"]) == 3


def test_rule_tags_output_in_vocabularies():
    t = rule_tags("Nadcap painting and plating, CWB weld, AS9100 ISO 9001 CPCSC, 5-axis")
    assert set(t["process_tags"]) <= set(PROCESS_TAGS)
    assert set(t["required_certs"]) <= set(CERT_TYPES)
    assert t["material"] in MATERIALS and t["tolerance_class"] in TOLERANCE_CLASSES
    assert {"NADCAP:COATINGS", "NADCAP:CHEM_PROCESSING", "CWB_W47.1"} <= set(t["required_certs"])


def test_rule_tags_fallback_warning_and_envelope():
    t = rule_tags("Miscellaneous widget")
    assert t["process_tags"] == ["cnc_milling"]
    assert "tag_warning" in t
    assert t["material"] == "steel"
    assert rule_tags("Hull plate weldment, 3200 x 1400 x 40 mm, armour")["envelope_mm"] == [3200, 1400, 40]
    # default envelope by item type
    assert rule_tags("Armour bolt kit, grade 8")["envelope_mm"] == [60, 25, 25]


# --- load_cache ---------------------------------------------------------------------
def test_load_cache_merges_and_skips_metadata(tmp_path):
    (tmp_path / "a.json").write_text(
        json.dumps({"_key": "meta", "k1": {"process_tags": ["welding"]}, "junk": 3})
    )
    (tmp_path / "b.json").write_text(json.dumps({"entries": {"k2": {"process_tags": ["plating"]}}}))
    (tmp_path / "c.json").write_text(json.dumps(["not", "a", "dict"]))
    (tmp_path / "bad.json").write_text("{not json")
    cache = load_cache(tmp_path)
    assert set(cache) == {"k1", "k2"}
    assert load_cache(tmp_path / "missing") == {}


# --- precedence ---------------------------------------------------------------------
def _write_cache(d: Path, part_no: str, desc: str, tags: dict) -> None:
    (d / "tags_test.json").write_text(json.dumps({"_note": "x", cache_key(part_no, desc): tags}))


def test_precedence_csv_beats_cache_beats_rules(tmp_path):
    desc = "Tow bracket weldment, armour steel, CWB W47.1"
    _write_cache(
        tmp_path,
        "P-1",
        desc,
        {
            "process_tags": ["welding", "painting"],
            "material": "stainless",
            "envelope_mm": [900, 600, 450],
            "tolerance_class": "bogus",  # invalid -> dropped -> rules fill it
            "required_certs": ["CWB_W47.1", "NOT_A_CERT"],
            "controlled": False,
        },
    )
    row = {
        "part_no": "P-1",
        "description": desc,
        "qty": 10,
        "unit_price_cad": 100.0,
        "material": "titanium",  # explicit CSV column wins over cache
    }
    jobs, counts = tag_rows([row], use_llm=False, cache_dir=tmp_path)
    j = jobs[0]
    assert counts == {"llm": 0, "cache": 1, "rules": 0}
    assert j["tag_source"] == "cache"
    assert j["material"] == "titanium"  # CSV
    assert j["process_tags"] == ["welding", "painting"]  # cache over rules (["welding"])
    assert j["envelope_mm"] == [900, 600, 450]  # cache
    assert j["required_certs"] == ["CWB_W47.1"]  # vocabulary-filtered
    assert j["tolerance_class"] == "standard"  # rules filled the invalid cache field


def test_cache_miss_uses_rules(tmp_path):
    jobs, counts = tag_rows(
        [{"part_no": "X", "description": "Hull weldment, CWB W47.1", "qty": 2, "unit_price_cad": 3}],
        use_llm=False,
        cache_dir=tmp_path,
    )
    assert counts == {"llm": 0, "cache": 0, "rules": 1}
    assert jobs[0]["tag_source"] == "rules"
    assert jobs[0]["process_tags"] == ["welding"]
    assert jobs[0]["required_certs"] == ["CWB_W47.1"]


# --- LLM path -----------------------------------------------------------------------
def _row(desc="Turbo shaft, turned", part_no="P-9"):
    return {"part_no": part_no, "description": desc, "qty": 4, "unit_price_cad": 250.0}


def test_llm_valid_json_is_used_and_cached(tmp_path):
    client = FakeClient(text=LLM_JSON)
    jobs, counts = tag_rows([_row()], use_llm=True, cache_dir=tmp_path, client=client)
    j = jobs[0]
    assert counts == {"llm": 1, "cache": 0, "rules": 0}
    assert j["tag_source"] == "llm"
    assert j["process_tags"] == ["cnc_turning", "heat_treat"]
    assert j["material"] == "titanium" and j["tolerance_class"] == "ultra"
    assert j["required_certs"] == ["AS9100"] and j["controlled"] is True
    # request was constrained to the vocabularies via structured output
    call = client.messages.calls[0]
    schema = call["output_config"]["format"]["schema"]
    assert schema["properties"]["process_tags"]["items"]["enum"] == list(PROCESS_TAGS)
    assert call["model"] == "claude-sonnet-5"
    # appended to tags_llm.json, and a second run hits the cache without calling the LLM
    stored = json.loads((tmp_path / "tags_llm.json").read_text())
    assert cache_key("P-9", "Turbo shaft, turned") in stored
    client2 = FakeClient(exc=AssertionError("should not be called"))
    jobs2, counts2 = tag_rows([_row()], use_llm=True, cache_dir=tmp_path, client=client2)
    assert counts2 == {"llm": 0, "cache": 1, "rules": 0}
    assert jobs2[0]["process_tags"] == ["cnc_turning", "heat_treat"]
    assert client2.messages.calls == []


def test_llm_model_env_override(monkeypatch):
    monkeypatch.setenv("MUSTER_LLM_MODEL", "claude-opus-5")
    client = FakeClient(text=LLM_JSON)
    assert llm_tags("P", "d", client=client) is not None
    assert client.messages.calls[0]["model"] == "claude-opus-5"


def test_llm_invalid_json_falls_back_to_rules(tmp_path):
    client = FakeClient(text="not json {")
    jobs, counts = tag_rows([_row()], use_llm=True, cache_dir=tmp_path, client=client)
    assert counts == {"llm": 0, "cache": 0, "rules": 1}
    assert jobs[0]["tag_source"] == "rules"
    assert jobs[0]["process_tags"] == ["cnc_turning"]
    assert not (tmp_path / "tags_llm.json").exists()


def test_llm_exception_falls_back_to_rules(tmp_path):
    client = FakeClient(exc=TimeoutError("20 s timeout"))
    jobs, counts = tag_rows([_row()], use_llm=True, cache_dir=tmp_path, client=client)
    assert counts == {"llm": 0, "cache": 0, "rules": 1}
    assert jobs[0]["tag_source"] == "rules"


def test_llm_refusal_and_empty_tags_return_none():
    assert llm_tags("P", "d", client=FakeClient(text=LLM_JSON, stop="refusal")) is None
    bad = json.dumps({"process_tags": ["laser_welding"], "material": "steel"})
    assert llm_tags("P", "d", client=FakeClient(text=bad)) is None


def test_llm_invalid_field_dropped_rules_fill(tmp_path):
    partial = json.dumps(
        {
            "process_tags": ["welding"],
            "material": "unobtainium",
            "envelope_mm": [1, 2],
            "tolerance_class": "standard",
            "required_certs": [],
            "controlled": False,
        }
    )
    jobs, _ = tag_rows(
        [_row("Stainless weldment", "P-7")], use_llm=True, cache_dir=tmp_path,
        client=FakeClient(text=partial),
    )
    assert jobs[0]["tag_source"] == "llm"
    assert jobs[0]["material"] == "stainless"  # from rules
    assert jobs[0]["envelope_mm"] == [1200, 800, 600]  # default for welding


def test_llm_none_without_api_key():
    assert llm_tags("P", "d") is None


def test_use_llm_default_off_without_key(tmp_path, monkeypatch):
    called = []
    monkeypatch.setattr(tagger, "llm_tags", lambda *a, **k: called.append(1))
    tag_rows([_row()], cache_dir=tmp_path)
    assert called == []


# --- job shape, ids, counts ---------------------------------------------------------
def test_tag_rows_ids_counts_and_shape(tmp_path):
    rows = [_row(f"Bracket {i}, 3-axis CNC milled", f"P-{i}") for i in range(12)]
    rows[0]["hours_week"] = 7
    rows[0]["ccv_pct"] = 0.9
    jobs, counts = tag_rows(rows, use_llm=False, cache_dir=tmp_path)
    assert [j["id"] for j in jobs[:2]] == ["NG-001", "NG-002"]
    assert jobs[11]["id"] == "NG-012"
    assert counts == {"llm": 0, "cache": 0, "rules": 12}
    j = jobs[0]
    assert list(j) == [
        "id", "program_id", "part_no", "description", "qty", "unit_price_cad",
        "est_value_cad", "ccv_pct", "hours_week", "material", "process_tags",
        "envelope_mm", "tolerance_class", "required_certs", "controlled",
        "tag_source", "status",
    ]
    assert j["program_id"] == "northgate" and j["status"] == "unrouted"
    assert j["est_value_cad"] == 1000.0
    assert j["hours_week"] == 7 and j["ccv_pct"] == 0.9
    assert jobs[1]["ccv_pct"] == 0.85 and jobs[1]["hours_week"] == 4


def test_tag_rows_other_program_prefix_and_warning(tmp_path):
    jobs, _ = tag_rows(
        [{"part_no": "Q", "description": "Widget", "qty": 3, "unit_price_cad": 0.333}],
        use_llm=False, program_id="kestrel", cache_dir=tmp_path,
    )
    assert jobs[0]["id"] == "KE-001"
    assert jobs[0]["program_id"] == "kestrel"
    assert jobs[0]["est_value_cad"] == 1.0
    assert jobs[0]["process_tags"] == ["cnc_milling"]
    assert "tag_warning" in jobs[0]


# --- real demo data (H1 fixtures) ---------------------------------------------------
real = pytest.mark.skipif(
    not (REAL_CSV.exists() and REAL_CACHE.exists()), reason="demo parts CSV / tag cache not built"
)


@real
def test_real_csv_all_from_cache():
    rows = parse_csv(REAL_CSV.read_text(encoding="utf-8"))
    jobs, counts = tag_rows(rows, use_llm=False)
    assert len(jobs) == 40
    assert counts == {"llm": 0, "cache": 40, "rules": 0}
    assert all(j["tag_source"] == "cache" for j in jobs)
    assert jobs[0]["id"] == "NG-001" and jobs[-1]["id"] == "NG-040"


@real
def test_real_csv_rules_reproduce_cache():
    rows = parse_csv(REAL_CSV.read_text(encoding="utf-8"))
    cache = load_cache(REAL_CACHE.parent)
    proc_ok = ctrl_ok = 0
    for r in rows:
        cached = cache[cache_key(r["part_no"], r["description"])]
        rt = rule_tags(r["description"])
        proc_ok += rt["process_tags"] == cached["process_tags"]
        ctrl_ok += rt["controlled"] == cached["controlled"]
    assert len(rows) == 40
    assert proc_ok >= 32, f"process_tags exact match {proc_ok}/40"
    assert ctrl_ok == 40, f"controlled match {ctrl_ok}/40"


# --- regressions (wave A review) ------------------------------------------------------
@pytest.mark.parametrize(
    "cell,expected",
    [
        ("ISO 9001:2015", ["ISO9001"]),
        ("CWB 47.1", ["CWB_W47.1"]),
        ("CWB-47", ["CWB_W47.1"]),
        ("W47.1", ["CWB_W47.1"]),
        ("AS 9100D", ["AS9100"]),
        ("CGP", ["CGP"]),
        ("CPCSC L1", ["CPCSC_L1"]),
        ("ISO 9001:2015; AS 9100D", ["ISO9001", "AS9100"]),
    ],
)
def test_csv_cert_variants_normalised(cell, expected):
    rows = parse_csv(f'{HEADER},required_certs\nP-1,Bracket,1,10,"{cell}"\n')
    assert rows[0]["required_certs"] == expected
    assert "tag_warning" not in rows[0]


def test_csv_invalid_certs_fall_through_to_cache_with_warning(tmp_path):
    desc = "Hull weldment, armour steel"
    _write_cache(
        tmp_path,
        "P-1",
        desc,
        {
            "process_tags": ["welding"],
            "material": "armour_steel",
            "envelope_mm": [900, 600, 450],
            "tolerance_class": "standard",
            "required_certs": ["CWB_W47.1"],
            "controlled": True,
        },
    )
    rows = parse_csv(f'{HEADER},required_certs,process_tags\nP-1,"{desc}",1,10,BOGUS-CERT,frobnicating\n')
    assert "required_certs" not in rows[0] and "process_tags" not in rows[0]
    assert "BOGUS-CERT" in rows[0]["tag_warning"] and "frobnicating" in rows[0]["tag_warning"]
    jobs, _ = tag_rows(rows, use_llm=False, cache_dir=tmp_path)
    assert jobs[0]["required_certs"] == ["CWB_W47.1"]  # cache, not []
    assert jobs[0]["process_tags"] == ["welding"]
    assert "BOGUS-CERT" in jobs[0]["tag_warning"]


def test_csv_invalid_certs_fall_through_to_rules(tmp_path):
    rows = parse_csv(f"{HEADER},required_certs\nP-2,\"Hull weldment, CWB W47.1\",1,10,XYZ\n")
    jobs, counts = tag_rows(rows, use_llm=False, cache_dir=tmp_path)
    assert counts["rules"] == 1
    assert jobs[0]["required_certs"] == ["CWB_W47.1"]
    assert "XYZ" in jobs[0]["tag_warning"]


def test_row_dict_invalid_certs_not_explicit(tmp_path):
    # rows not coming from parse_csv are validated the same way
    row = {"part_no": "P", "description": "Hull weldment, CWB W47.1", "qty": 1,
           "unit_price_cad": 1, "required_certs": "NOPE"}
    jobs, _ = tag_rows([row], use_llm=False, cache_dir=tmp_path)
    assert jobs[0]["required_certs"] == ["CWB_W47.1"]
    # an explicit empty value still means "no certs"
    row["required_certs"] = []
    jobs, _ = tag_rows([row], use_llm=False, cache_dir=tmp_path)
    assert jobs[0]["required_certs"] == []


def test_temperature_is_not_heat_treat():
    assert rule_tags("Temperature sensor wiring harness")["process_tags"] == ["wire_harness"]
    assert "heat_treat" not in rule_tags("Tempered glass viewport")["process_tags"]
    assert rule_tags("Quench and temper 4140 steel drive shafts")["process_tags"] == ["heat_treat"]
    assert "heat_treat" in rule_tags(
        "Heat treat service: through-harden and temper 4340 drive shafts"
    )["process_tags"]


@pytest.mark.parametrize(
    "header,cell,expected",
    [
        ("ccv_pct", "0.85", 0.85),
        ("ccv_pct", "85", 0.85),
        ("ccv_pct", "1.5", 0.015),  # > 1 without % -> percent
        ("ccv_pct", "1", 1.0),  # exactly 1 -> fraction
        ("ccv_pct", "0.5%", 0.005),  # % in value -> always percent
        ("ccv_pct", "85%", 0.85),
        ("ccv_pct (%)", "0.5", 0.005),  # % in header -> always percent
        ("ccv_pct %", "90", 0.9),
    ],
)
def test_ccv_pct_parsing(header, cell, expected):
    rows = parse_csv(f"{HEADER},{header}\nP-1,Bracket,1,10,{cell}\n")
    assert rows[0]["ccv_pct"] == pytest.approx(expected)


@pytest.mark.parametrize("cell", ["101", "-0.1", "250"])
def test_ccv_pct_out_of_range_names_row(cell):
    with pytest.raises(ValueError, match=r"Row 3: ccv_pct"):
        parse_csv(f"{HEADER},ccv_pct\nP-0,Bracket,1,10,0.8\nP-1,Bracket,1,10,{cell}\n")


@pytest.mark.parametrize("cell", ['"1.250,00"', '"12,5"', '"1,25"'])
def test_european_numbers_rejected_with_row(cell):
    with pytest.raises(ValueError, match=r"Row 2: unit_price_cad"):
        parse_csv(f"{HEADER}\nP-1,Bracket,1,{cell}\n")


def test_thousands_separator_still_ok():
    rows = parse_csv(f'{HEADER}\nP-1,Bracket,"1,000","$1,250.50"\n')
    assert rows[0]["qty"] == 1000 and rows[0]["unit_price_cad"] == 1250.5


def test_duplicate_column_rejected():
    with pytest.raises(ValueError, match=r"duplicate column 'qty'"):
        parse_csv("part_no,description,qty,unit_price_cad,qty\nP-1,Bracket,1,10,2\n")


def test_unclosed_quote_is_clear_error():
    with pytest.raises(ValueError, match=r"malformed CSV near row \d+"):
        parse_csv(f'{HEADER}\nP-1,"Bracket, unclosed,1,10\nP-2,Pin,1,10\n')


@pytest.mark.parametrize(
    "desc,controlled",
    [
        ("Bracket per ITAR, export-controlled drawing", True),
        ("Export controlled hull fitting", True),
        ("Controlled goods hull bracket", True),
        ("Weldment, controlled technical data", True),
        ("CGP registered supplier only", True),
        ("Uncontrolled goods bracket, milled", False),
        ("Milled bracket (not controlled goods)", False),
        ("Non-controlled technical data: milled bracket", False),
        ("Non controlled goods spacer", False),
        ("Milled bracket, no controlled goods", False),
        ("Non-ITAR bracket, milled", False),
    ],
)
def test_rule_tags_controlled_gate(desc, controlled):
    assert rule_tags(desc)["controlled"] is controlled



def test_unit_price_kept_est_value_rounded_to_cents():
    jobs, _ = tagger.tag_rows(
        [{"part_no": "P-1", "description": "Milled bracket", "qty": 3, "unit_price_cad": 333.333}],
        use_llm=False,
    )
    assert jobs[0]["unit_price_cad"] == 333.333 and jobs[0]["est_value_cad"] == 1000.0
