"""Search + graph routes (docs/api.md §7): memory path always, Neo4j path when reachable.

Every test uses a temporary MUSTER_DB. Memory tests force ``MUSTER_GRAPH=memory``; the
Neo4j tests load the graph if it is stale (``graphdb.ensure_loaded``) and skip when
Neo4j is down. Both engines must return the same shops for the canned queries.
"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import engine.app as app_module
from engine import graphdb

REPO = Path(__file__).resolve().parents[2]
PUBLIC_LABEL = "Public data — unverified — not affiliated"
COUNTING = {"verified", "declared", "pending_training"}
RESULT_KEYS = {"shop_id", "name", "source", "label", "onboarding", "city", "lat", "lon", "distance_km",
               "processes", "certs", "dnd_history", "match", "score"}
CANNED = [
    "/search/shops?process=cnc_milling&near=London&radius_km=50",
    "/search/shops?cert=CWB_W47.1",
    "/search/shops?process=welding&cert=CGP&source=public",
    "/search/shops?dnd_history=true",
    "/search/shops?q=machin&near=Kitchener&radius_km=80&limit=200",
    "/search/shops?process=welding&process=painting&match=any&source=synthetic&limit=200",
]


@pytest.fixture(autouse=True)
def _fresh_availability():
    graphdb.reset_availability()
    yield
    graphdb.reset_availability()


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSTER_DB", str(tmp_path / "search_test.db"))
    monkeypatch.setenv("MUSTER_GRAPH", "memory")
    with TestClient(app_module.app) as c:
        yield c


def ok(client, url):
    r = client.get(url)
    assert r.status_code == 200, f"{url}: {r.status_code} {r.text}"
    return r.json()


def upload_and_route(client):
    assert client.post("/demo/reset").status_code == 200
    assert client.post("/programs/northgate/parts?use_demo=true").status_code == 200
    r = client.post("/programs/northgate/route")
    assert r.status_code == 200
    assert r.json()["stats"]["assigned"] == 36 and r.json()["stats"]["blocked"] == 4


# ------------------------------------------------------------------- /search/shops (memory)
def test_search_all_shops_memory(client):
    d = ok(client, "/search/shops?limit=200")
    assert d["engine"] == "memory"
    assert d["counts"] == {"total": 108, "synthetic": 30, "public": 78}
    assert len(d["results"]) == 108
    for r in d["results"]:
        assert RESULT_KEYS <= set(r)
        if r["source"] == "public":
            assert r["onboarding"] == "discovered" and r["routable"] is False
            assert r["label"] == PUBLIC_LABEL
        else:
            assert r["source"] == "synthetic" and r["label"] == "Synthetic"
            assert r["onboarding"] == "onboarded" and r["routable"] is True
        assert r["distance_km"] is None  # no near= given
        assert all(c["status"] != "unknown" for c in r["certs"])
    # default limit 25; synthetic (onboarded) shops rank first at equal fit
    d25 = ok(client, "/search/shops")
    assert len(d25["results"]) == 25 and d25["counts"]["total"] == 108
    assert all(r["source"] == "synthetic" for r in d25["results"])


def test_search_process_near_city(client):
    d = ok(client, "/search/shops?process=cnc_milling&near=London&radius_km=50")
    assert d["query"]["near"] == "London" and d["query"]["radius_km"] == 50
    assert d["counts"]["total"] == len(d["results"]) > 0
    scores = [r["score"] for r in d["results"]]
    assert scores == sorted(scores, reverse=True)
    for r in d["results"]:
        assert "cnc_milling" in r["processes"]
        assert r["distance_km"] is not None and r["distance_km"] <= 50
        assert r["match"] == {"matched": ["CNC milling"], "missing": []}
    # aliases + labels normalize to the same query
    assert ok(client, "/search/shops?process=CNC%20milling&near=london&radius_km=50")["results"] == d["results"]
    # near without radius defaults to 100 km
    assert ok(client, "/search/shops?near=London")["query"]["radius_km"] == 100


def test_search_cert_filter_counts_only_counting_statuses(client):
    d = ok(client, "/search/shops?cert=CWB_W47.1&limit=200")
    assert d["counts"]["total"] == len(d["results"]) > 0
    for r in d["results"]:
        cwb = [c for c in r["certs"] if c["type"] == "CWB_W47.1"]
        assert cwb and cwb[0]["status"] in COUNTING
        if r["source"] == "public":
            assert cwb[0]["source_url"]  # self-reported, with the page it was read from
    assert ok(client, "/search/shops?cert=cwb&limit=200")["results"] == d["results"]


def test_search_match_any_lists_missing(client):
    d = ok(client, "/search/shops?process=welding&cert=AS9100&match=any&limit=200")
    strict = ok(client, "/search/shops?process=welding&cert=AS9100&limit=200")
    assert d["counts"]["total"] > strict["counts"]["total"]
    assert any(r["match"]["missing"] for r in d["results"])
    assert all(not r["match"]["missing"] for r in strict["results"])
    assert all(r["match"]["matched"] for r in d["results"])


def test_search_dnd_history(client):
    d = ok(client, "/search/shops?dnd_history=true")
    assert [r["shop_id"] for r in d["results"]] == ["pub-020"]
    h = d["results"][0]["dnd_history"]
    assert h["confidence"] == "high" and h["contracts"] == 1 and h["value_cad"] == 1149796.8
    assert h["last_date"] == "2022-12-22"
    none = ok(client, "/search/shops?dnd_history=false&limit=200")
    assert none["counts"]["total"] == 107
    assert all(r["dnd_history"] is None for r in none["results"])


def test_search_q_and_source(client):
    d = ok(client, "/search/shops?q=woolwich&source=synthetic")
    assert d["results"] and all(r["source"] == "synthetic" for r in d["results"])
    assert all("woolwich" in (r["name"] + r["city"]).lower() for r in d["results"])
    pub = ok(client, "/search/shops?source=public&limit=200")
    assert pub["counts"] == {"total": 78, "synthetic": 0, "public": 78}


@pytest.mark.parametrize(
    "url, fragment",
    [
        ("/search/shops?process=teleportation", "Unknown process"),
        ("/search/shops?cert=XYZ", "Unknown certification"),
        ("/search/shops?near=Atlantis", "Unknown city"),
        ("/search/shops?source=odbus", "source must be"),
        ("/search/shops?radius_km=10", "needs near"),
        ("/search/shops?match=some", "match must be"),
        ("/search/shops?limit=0", "limit"),
        ("/search/shops?near=London&radius_km=-5", "radius_km"),
    ],
)
def test_search_shops_errors(client, url, fragment):
    r = client.get(url)
    assert r.status_code == 400, r.text
    assert fragment in r.json()["detail"]


def test_search_after_funding_sees_pending_training(client):
    upload_and_route(client)
    before = {r["shop_id"] for r in ok(client, "/search/shops?cert=CWB_W47.1&limit=200")["results"]}
    assert "syn-012" not in before
    assert client.post("/programs/northgate/training/TP-01/fund").status_code == 200
    d = ok(client, "/search/shops?cert=CWB_W47.1&limit=200")
    row = next(r for r in d["results"] if r["shop_id"] == "syn-012")
    assert {"type": "CWB_W47.1", "status": "pending_training", "source_url": None} in row["certs"]
    assert row["match"]["matched"] == ["CWB W47.1 (pending training)"]


# ------------------------------------------------------------------- /search/jobs
def test_search_jobs_before_upload(client):
    client.post("/demo/reset")
    d = ok(client, "/search/jobs?shop_id=syn-012")
    assert d["eligible"] == [] and d["near_miss"] == []
    assert d["routable"] is True and d["tenders"]


def test_search_jobs_flow(client):
    upload_and_route(client)
    offers = {o["job_id"] for o in ok(client, "/shops/syn-012")["offers"]}
    d = ok(client, "/search/jobs?shop_id=syn-012")
    assert d["engine"] == "memory" and d["shop_id"] == "syn-012"
    mine = {r["job_id"] for r in d["eligible"] if r["status"] == "offered_to_you"}
    assert mine == offers
    for r in d["eligible"]:
        assert r["status"] in {"offered_to_you", "assigned_elsewhere", "open"}
        assert r["credit_cad"] > 0 and r["multiplier"] == 2 and len(r["reasons"]) == 3
    # the three CWB-blocked welding jobs are single-requirement near misses
    near = {n["job_id"]: n for n in d["near_miss"]}
    for jid in ("NG-031", "NG-032", "NG-033"):
        assert near[jid]["missing"] == [{"kind": "cert", "requirement": "CWB_W47.1",
                                        "message": "Get CWB W47.1 (now: unknown)"}]
    assert all(1 <= len(n["missing"]) <= 2 for n in d["near_miss"])
    assert all(m["kind"] != "capacity" for n in d["near_miss"] for m in n["missing"])
    assert d["tenders"] and all({"title", "reference", "closing_date", "buyer", "category"} <= set(t)
                                for t in d["tenders"])
    # filters
    w = ok(client, "/search/jobs?shop_id=syn-012&process=welding&include_near_miss=false")
    assert w["near_miss"] == []
    assert all("welding" in r["process_tags"] for r in w["eligible"])
    q = ok(client, "/search/jobs?shop_id=syn-012&q=NG-021")
    assert [r["job_id"] for r in q["eligible"]] == ["NG-021"]
    # funding TP-01 turns the near misses into offers
    assert client.post("/programs/northgate/training/TP-01/fund").status_code == 200
    after = ok(client, "/search/jobs?shop_id=syn-012")
    mine = {r["job_id"] for r in after["eligible"] if r["status"] == "offered_to_you"}
    assert {"NG-031", "NG-032", "NG-033"} <= mine
    assert not {"NG-031", "NG-032", "NG-033"} & {n["job_id"] for n in after["near_miss"]}


def test_search_jobs_public_and_errors(client):
    upload_and_route(client)
    d = ok(client, "/search/jobs?shop_id=pub-001")
    assert d["routable"] is False and d["eligible"] == [] and d["near_miss"] == []
    assert "not offered work" in d["notice"]
    assert client.get("/search/jobs?shop_id=syn-999").status_code == 404
    assert client.get("/search/jobs").status_code == 400
    assert client.get("/search/jobs?shop_id=syn-012&process=nope").status_code == 400


def test_search_is_read_only(client):
    upload_and_route(client)
    ledger = ok(client, "/programs/northgate/ledger")
    program = ok(client, "/programs/northgate")
    for url in CANNED + ["/search/jobs?shop_id=syn-012", "/graph/summary", "/graph/ego?id=syn-012"]:
        ok(client, url)
    assert ok(client, "/programs/northgate/ledger") == ledger
    assert ok(client, "/programs/northgate") == program


# ------------------------------------------------------------------- /graph
def test_graph_summary_memory(client):
    d = ok(client, "/graph/summary")
    nodes, edges = graphdb.build_property_graph().summary()
    assert d == {"engine": "memory", "nodes": nodes, "edges": edges,
                 "totals": {"nodes": sum(nodes.values()), "edges": sum(edges.values())}}


def test_graph_ego_memory(client):
    d = ok(client, "/graph/ego?id=syn-012")
    assert d["engine"] == "memory" and d["root"] == "shop:syn-012" and d["depth"] == 1
    ids = {n["id"] for n in d["nodes"]}
    assert {"shop:syn-012", "process:welding", "process:sheet_metal", "process:painting",
            "cert:CPCSC_L1"} <= ids
    assert d["nodes"][0]["type"] == "Shop" and d["nodes"][0]["props"]["label_text"] == "Synthetic"
    for e in d["edges"]:
        assert e["source"] in ids and e["target"] in ids
    d2 = ok(client, "/graph/ego?id=shop:syn-012&depth=2&limit=40")
    assert len(d2["nodes"]) == 40 and d2["truncated"] is True
    assert client.get("/graph/ego?id=nope-000").status_code == 404
    assert client.get("/graph/ego?id=syn-012&depth=3").status_code == 400
    assert client.get("/graph/ego").status_code == 400


# ------------------------------------------------------------------- Neo4j vs memory
@pytest.fixture
def neo4j(client, monkeypatch):
    monkeypatch.delenv("MUSTER_GRAPH", raising=False)
    if not graphdb.ensure_loaded():
        pytest.skip("Neo4j not reachable (make graph-up)")
    return client


def both(client, monkeypatch, url):
    monkeypatch.delenv("MUSTER_GRAPH", raising=False)
    graphdb.reset_availability()
    a = ok(client, url)
    monkeypatch.setenv("MUSTER_GRAPH", "memory")
    b = ok(client, url)
    monkeypatch.delenv("MUSTER_GRAPH", raising=False)
    return a, b


def test_neo4j_and_memory_return_identical_shops(neo4j, monkeypatch):
    client = neo4j
    for url in CANNED:
        a, b = both(client, monkeypatch, url)
        assert a["engine"] == "neo4j" and b["engine"] == "memory"
        assert [r["shop_id"] for r in a["results"]] == [r["shop_id"] for r in b["results"]], url
        assert json.dumps({**a, "engine": None}) == json.dumps({**b, "engine": None}), url


def test_neo4j_sees_funding_overrides(neo4j, monkeypatch):
    client = neo4j
    upload_and_route(client)
    assert client.post("/programs/northgate/training/TP-01/fund").status_code == 200
    a, b = both(client, monkeypatch, "/search/shops?cert=CWB_W47.1&process=welding&limit=200")
    assert "syn-012" in {r["shop_id"] for r in a["results"]}
    assert json.dumps({**a, "engine": None}) == json.dumps({**b, "engine": None})


def test_neo4j_graph_views_match_memory(neo4j, monkeypatch):
    client = neo4j
    a, b = both(client, monkeypatch, "/graph/summary")
    assert a["engine"] == "neo4j" and {**a, "engine": None} == {**b, "engine": None}
    for url in ("/graph/ego?id=syn-012", "/graph/ego?id=syn-012&depth=2", "/graph/ego?id=NG-034&depth=2",
                "/graph/ego?id=region:3560"):
        a, b = both(client, monkeypatch, url)
        assert a["engine"] == "neo4j"
        assert {**a, "engine": None} == {**b, "engine": None}, url


def test_dead_neo4j_falls_back_to_memory(client, monkeypatch):
    monkeypatch.delenv("MUSTER_GRAPH", raising=False)
    monkeypatch.setenv("NEO4J_URI", "bolt://127.0.0.1:1")
    for url in CANNED[:2] + ["/graph/summary", "/graph/ego?id=syn-012"]:
        d = ok(client, url)
        assert d["engine"] == "memory", url


def test_search_fixtures_are_current():
    """data/fixtures/search/* equals a fresh deterministic run (scripts/build_search_fixtures.py)."""
    import importlib.util

    spec = importlib.util.spec_from_file_location("bsf", REPO / "scripts" / "build_search_fixtures.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    files = mod.build()
    out = REPO / "data" / "fixtures" / "search"
    assert sorted(files) == sorted(p.name for p in out.glob("*.json"))
    for name, obj in files.items():
        assert (out / name).read_text(encoding="utf-8") == mod.dumps(obj), name


def test_neo4j_query_failure_falls_back_to_memory(client, monkeypatch):
    """Neo4j looks available but every query fails: answers still come from memory."""
    from engine import search

    monkeypatch.delenv("MUSTER_GRAPH", raising=False)
    monkeypatch.setattr(search, "engine_name", lambda: "neo4j")

    def boom(*a, **k):
        raise RuntimeError("connection lost")

    monkeypatch.setattr(graphdb, "run", boom)
    d = ok(client, CANNED[0])
    assert d["engine"] == "memory" and d["counts"]["total"] > 0
    assert ok(client, "/graph/summary")["engine"] == "memory"
    assert ok(client, "/graph/ego?id=syn-012")["engine"] == "memory"


def test_tenders_leave_out_equipment_and_follow_q():
    """Find work lists notices for parts a shop could supply, never machine or stock purchases."""
    from engine.search import tender_kind, tenders_for

    assert tender_kind("W0113-27CS29 Lathe") == "equipment"
    assert tender_kind("RCEMES Milling Machines") == "equipment"
    assert tender_kind("Spare Parts for Material Handling Equipment 4") == "fits"
    assert tender_kind("Multiple Victoria-Class Spares : SILICONE BRONZE SPLIT LOCK WASHER, O-RING") == "stock"
    got = tenders_for(["welding", "sheet_metal"], None)
    assert got and len(got) <= 5
    assert all(tender_kind(t["title"]) == "fits" for t in got)
    assert tenders_for(["welding"], "zzz") == []
    assert all("spare" in t["title"].lower() for t in tenders_for(["welding"], "spare"))


def test_tenders_drop_closed_notices_and_rank_ontario_cities():
    """A notice past its closing time is never listed as open; Ontario cities count as Ontario."""
    from datetime import datetime

    from engine.search import tender_closes_at, tender_in_ontario, tenders_for

    local = datetime.fromisoformat  # naive local times, as the notices state them

    before = tenders_for(["welding", "sheet_metal"], None, now=local("2026-09-26T12:00"))
    assert before and not any(t["closed"] for t in before)
    assert tender_in_ontario(before[0]["region"])  # Belleville first
    assert tender_in_ontario("Belleville") and tender_in_ontario("Ontario (except NCR) / Ottawa")
    assert not tender_in_ontario("Quebec (except NCR) / Montréal")

    now = local("2026-09-28T15:00")
    got = tenders_for(["welding", "sheet_metal"], None, now=now)
    for t in got:
        if not t["closed"]:
            assert tender_closes_at(t["closing_date"]) >= now
    assert all(t["closing_date"] >= "2026-09-28T15" for t in got if not t["closed"])

    late = tenders_for(["welding", "sheet_metal"], None, now=local("2026-12-01T00:00"))
    assert late and all(t["closed"] for t in late) and len(late) <= 3
    # date-only: open through 23:59 that day
    assert tender_closes_at("2026-10-01") == local("2026-10-01T23:59:59")
