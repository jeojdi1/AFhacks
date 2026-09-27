"""Discovered public shops (engine/public.py): listed and viewable, never routed.

The 78 real companies in data/processed/shops_public.json appear in GET /shops (after the
synthetic shops) and GET /shops/pub-XXX, but never in candidates, assignments, gaps,
readiness or the ledger, and the demo numbers do not move.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import engine.app as app_module
from engine import pipeline, public
from engine.tests.test_pipeline import build_state

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "data" / "fixtures"
LABEL = "Public data — unverified — not affiliated"
SHOP_KEYS = {"id", "name", "source", "label", "city", "lat", "lon", "naics", "employee_band", "is_sme",
             "processes", "machines", "materials", "max_envelope_mm", "tolerance_class",
             "capacity_hours_week", "lead_time_days", "website", "contact_role_email", "provenance"}
CERT_KEYS = {"shop_id", "type", "status", "source_url", "verified_at", "expires_at", "note"}
PHONE = re.compile(r"\(?\b\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b")


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def funded():
    """Routed, then TP-01 funded: every routing view after the whole demo flow."""
    st = build_state()
    route = pipeline.route(st)
    views = {"route": route, "gaps_before": pipeline.gaps(st), "ledger_before": pipeline.ledger(st)}
    views["fund"] = pipeline.fund(st, "TP-01")
    views.update(
        assignments=pipeline.assignments_view(st),
        gaps=pipeline.gaps(st),
        ledger=pipeline.ledger(st),
        jobs=pipeline.jobs_view(st),
        program=pipeline.program_view(st),
        synthetic_details=[pipeline.shop_detail(st, sid) for sid in st.shops],
    )
    return st, views


# --------------------------------------------------------------------------- data


def test_78_discovered_public_shops_labelled_and_without_contact_data():
    shops = public.shops()
    assert len(shops) == 78
    assert [s["id"] for s in shops] == [f"pub-{i:03d}" for i in range(1, 79)]
    for s in shops:
        assert SHOP_KEYS <= set(s), s["id"]
        assert s["source"] == "public" and s["label"] == LABEL
        assert s["onboarding"] == "discovered"
        assert s["contact_role_email"] is None
        assert all(p["field"] not in public.CONTACT_FIELDS for p in s["provenance"])
        assert all(p.get("source_url") or p["confidence"] in ("search", "odbus") for p in s["provenance"])
    blob = json.dumps(shops, ensure_ascii=False)
    assert "@" not in blob, "no email addresses"
    assert not PHONE.search(blob), "no phone numbers"


def test_self_reported_certs_carry_a_source_url():
    counted = 0
    for s in public.shops():
        d = public.detail(s["id"])
        assert [(c["type"], c["status"]) for c in d["certifications"]] == [
            (c["type"], c["status"]) for c in s["cert_summary"]]
        for c in d["certifications"]:
            assert set(c) >= CERT_KEYS and c["shop_id"] == s["id"]
            assert c["status"] in ("declared", "unknown"), "public data is never verified"
            if c["status"] == "declared":
                counted += 1
                assert c["source_url"], f"{s['id']} {c['type']} declared without a source"
    assert counted == 66  # ISO9001 30 + CGP 15 + CWB 14 + AS9100 6 + Nadcap chem 1


def test_list_entry_is_enough_to_rebuild_the_detail():
    """The web builds a public shop page from its GET /shops entry (web/lib/data/fixture-source.ts
    publicShopDetailFrom); it must equal GET /shops/pub-XXX."""
    for s in public.shops():
        rebuilt = {
            "shop": s,
            "certifications": [{"shop_id": s["id"], **c} for c in s["cert_summary"]],
            "offers": [], "readiness": [], "training": [], "notice": public.NOTICE,
        }
        assert rebuilt == public.detail(s["id"]), s["id"]


def test_detail_shape_and_unknown_id():
    d = public.detail("pub-001")
    assert set(d) == {"shop", "certifications", "offers", "readiness", "training", "notice"}
    assert d["offers"] == [] and d["readiness"] == [] and d["training"] == []
    assert d["shop"]["website"] and d["shop"]["provenance"]
    assert "not offered work" in d["notice"]
    with pytest.raises(KeyError):
        public.detail("pub-999")
    d["shop"]["name"] = "mutated"
    assert public.detail("pub-001")["shop"]["name"] != "mutated"  # callers get copies


def test_missing_file_means_no_public_shops(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSTER_PUBLIC_SHOPS", str(tmp_path / "absent.json"))
    try:
        assert public.shops() == []
        st = build_state(upload=False)
        assert pipeline.shops_list(st) == fixture("shops.json")
        with pytest.raises(KeyError):
            pipeline.shop_detail(st, "pub-001")
    finally:
        monkeypatch.delenv("MUSTER_PUBLIC_SHOPS")
        public.clear_cache()


# --------------------------------------------------------------------------- fixtures


def test_public_fixtures_are_up_to_date():
    sys.path.insert(0, str(ROOT / "scripts"))
    try:
        import build_public_fixtures as bpf
    finally:
        sys.path.pop(0)
    for name, text in bpf.build().items():
        assert (FIXTURES / name).read_text(encoding="utf-8") == text, f"{name} is stale"
    assert fixture("shops_public.json") == pipeline.shops_list(build_state(upload=False), "public")
    assert fixture("shop_pub-001.json") == pipeline.shop_detail(build_state(upload=False), "pub-001")
    # The demo manifest never maps the public files (the demo flow does not read them).
    idx = json.dumps(fixture("index.json"))
    assert "shops_public" not in idx and "pub-" not in idx


# --------------------------------------------------------------------------- pipeline


def test_shops_list_appends_public_after_unchanged_synthetic(funded):
    st, _ = funded
    before = build_state(upload=False)
    all_shops = pipeline.shops_list(before)["shops"]
    synthetic = pipeline.shops_list(before, "synthetic")["shops"]
    assert json.dumps(all_shops[:30]) == json.dumps(synthetic) == json.dumps(fixture("shops.json")["shops"])
    assert all_shops[30:] == public.shops()
    assert pipeline.shops_list(before, "public") == public.list_response()
    # After routing + funding the synthetic part tracks the State; the public part is static.
    after = pipeline.shops_list(st)["shops"]
    assert after[:30] == pipeline.shops_list(st, "synthetic")["shops"]
    assert after[30:] == public.shops()


def test_shop_detail_serves_public_shops_in_any_stage(funded):
    st, _ = funded
    assert pipeline.shop_detail(st, "pub-006") == public.detail("pub-006")
    assert pipeline.shop_detail(build_state(upload=False), "pub-006") == public.detail("pub-006")
    with pytest.raises(KeyError):
        pipeline.shop_detail(st, "pub-999")


def test_public_shops_are_never_routed(funded):
    st, views = funded
    assert not any(public.is_public_id(sid) for sid in st.shops)
    ctx = pipeline.Context(st)
    for job in st.jobs:
        assert not any(public.is_public_id(s) for s in ctx.eligible_ignoring_capacity(job))
    for name, value in views.items():
        assert "pub-" not in json.dumps(value), f"a public shop leaked into {name}"
    # Demo numbers unchanged: 36 / 4 routed, 39 / 1 after TP-01, 30 shops in the program.
    assert views["route"]["stats"]["assigned"] == 36 and views["route"]["stats"]["blocked"] == 4
    assert views["fund"]["after"]["assigned"] == 39 and views["fund"]["after"]["blocked"] == 1
    assert views["program"]["counts"]["shops"] == 30
    for b in views["gaps_before"]["blocked"]:
        assert sum(1 for _ in b["failing_filters"]) == 6
        assert max(b["failing_filters"].values()) <= 30  # counts cover the 30 routable shops only


# --------------------------------------------------------------------------- HTTP


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSTER_DB", str(tmp_path / "public_test.db"))
    with TestClient(app_module.app) as c:
        yield c


def test_http_lists_public_shops_and_numbers_do_not_move(client):
    client.post("/demo/reset")
    shops = client.get("/shops").json()["shops"]
    assert len(shops) == 108
    assert client.get("/shops?source=public").json() == fixture("shops_public.json")
    assert client.get("/shops?source=synthetic").json() == fixture("shops.json")
    assert client.post("/programs/northgate/parts?use_demo=true").status_code == 200
    rt = client.post("/programs/northgate/route").json()
    assert rt["stats"]["assigned"] == 36 and rt["stats"]["blocked"] == 4
    fund = client.post("/programs/northgate/training/TP-01/fund").json()
    assert fund["after"]["assigned"] == 39
    for path in ("/programs/northgate/assignments", "/programs/northgate/gaps",
                 "/programs/northgate/ledger", "/programs/northgate/jobs", "/programs/northgate"):
        assert "pub-" not in client.get(path).text, path
    assert client.get("/programs/northgate").json()["counts"]["shops"] == 30
    assert client.get("/shops").json()["shops"][30:] == fixture("shops_public.json")["shops"]


def test_http_public_shop_detail(client):
    client.post("/demo/reset")
    r = client.get("/shops/pub-001")
    assert r.status_code == 200
    assert r.json() == fixture("shop_pub-001.json")
    assert client.get("/shops/pub-999").status_code == 404
