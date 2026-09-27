"""engine/graphdb.py: settings, availability (never crashes when Neo4j is down), the
canonical property graph, and (when Neo4j is reachable) the loader round trip."""

import time

import pytest

from engine import graphdb

DEAD_URI = "bolt://127.0.0.1:1"


@pytest.fixture(autouse=True)
def _fresh_availability():
    graphdb.reset_availability()
    yield
    graphdb.reset_availability()


def test_parse_env_file(tmp_path):
    p = tmp_path / ".env"
    p.write_text(
        "# comment\n"
        "NEO4J_URI=bolt://example:7687\n"
        "export NEO4J_USER='neo'\n"
        'NEO4J_PASSWORD="s3cret"\n'
        "OTHER=value # trailing comment\n"
        "not a pair\n",
        encoding="utf-8",
    )
    vals = graphdb._parse_env_file(p)
    assert vals["NEO4J_URI"] == "bolt://example:7687"
    assert vals["NEO4J_USER"] == "neo"
    assert vals["NEO4J_PASSWORD"] == "s3cret"
    assert vals["OTHER"] == "value"
    assert "not a pair" not in vals
    assert graphdb._parse_env_file(tmp_path / "missing.env") == {}


def test_settings_environment_wins_over_file(tmp_path, monkeypatch):
    p = tmp_path / ".env"
    p.write_text("NEO4J_URI=bolt://file:7687\nNEO4J_USER=fileuser\nNEO4J_PASSWORD=filepw\n", encoding="utf-8")
    monkeypatch.setenv("NEO4J_URI", "bolt://env:7687")
    monkeypatch.delenv("NEO4J_USER", raising=False)
    monkeypatch.delenv("NEO4J_PASSWORD", raising=False)
    cfg = graphdb.settings(p)
    assert cfg == {"uri": "bolt://env:7687", "user": "fileuser", "password": "filepw"}


def test_dead_port_is_unavailable_quickly(monkeypatch):
    monkeypatch.delenv("MUSTER_GRAPH", raising=False)
    monkeypatch.setenv("NEO4J_URI", DEAD_URI)
    t0 = time.monotonic()
    assert graphdb.available() is False
    assert graphdb.reachable() is False
    assert graphdb.marker() == ""
    assert time.monotonic() - t0 < 5
    t1 = time.monotonic()
    assert graphdb.available() is False  # cached: no second probe
    assert time.monotonic() - t1 < 0.2
    with pytest.raises(Exception):  # noqa: B017 - run() raises; callers fall back
        graphdb.run("RETURN 1")


def test_forced_memory(monkeypatch):
    monkeypatch.setenv("MUSTER_GRAPH", "memory")
    assert graphdb.forced_memory()
    assert graphdb.available() is False
    assert graphdb.reachable() is False


def test_property_graph_shape():
    g = graphdb.build_property_graph()
    nodes, edges = g.summary()
    assert nodes["Shop"] == 108  # 30 synthetic + 78 public
    assert nodes["Job"] == 40
    assert nodes["Process"] == 12 and nodes["Cert"] == 8
    assert nodes["Manufacturer"] > 2000 and nodes["DNDVendor"] > 1000
    assert set(nodes) <= set(graphdb.KINDS)
    for t in ("HAS_PROGRAM", "HAS_JOB", "NEEDS_PROCESS", "NEEDS_CERT", "HAS_PROCESS", "HOLDS_CERT",
              "IN_REGION", "OUTLOOK", "MATCHES_DND_VENDOR", "ITB_OBLIGATION"):
        assert edges.get(t, 0) > 0, t
    assert edges["HAS_JOB"] == 40
    for e in g.edges:
        assert e["source"] in g.nodes and e["target"] in g.nodes
        assert all(v is not None for v in e["props"].values())
    for n in g.nodes.values():
        assert n["props"]["id"] == n["id"]
        assert all(v is not None for v in n["props"].values())
        assert "contact_role_email" not in n["props"]  # no contact data in the graph
    shops = [n["props"] for n in g.nodes.values() if n["kind"] == "Shop"]
    assert sum(1 for s in shops if s["source"] == "synthetic") == 30
    for s in shops:
        if s["source"] == "public":
            assert s["onboarding"] == "discovered"
            assert s["label_text"] == "Public data — unverified — not affiliated"
        else:
            assert s["label_text"] == "Synthetic"
    # Unknown cert statuses are not edges; HOLDS_CERT carries status + source_url.
    assert all(e["props"]["status"] != "unknown" for e in g.edges if e["type"] == "HOLDS_CERT")
    ng = [e for e in g.edges if e["type"] == "ITB_OBLIGATION" and e["target"] == "program:northgate"]
    assert ng and ng[0]["props"]["value"] == 500000000.0
    # Controlled jobs need CGP.
    controlled = [n["id"] for n in g.nodes.values() if n["kind"] == "Job" and n["props"]["controlled"]]
    assert len(controlled) == 5
    for jid in controlled:
        assert any(e["source"] == jid and e["target"] == "cert:CGP" for e in g.edges)


def test_property_graph_is_deterministic():
    a = graphdb._build.__wrapped__(graphdb.data_hash())
    b = graphdb._build.__wrapped__(graphdb.data_hash())
    assert list(a.nodes) == list(b.nodes)
    assert a.edges == b.edges


def test_resolve_id():
    g = graphdb.build_property_graph()
    assert graphdb.resolve_id(g, "syn-012") == "shop:syn-012"
    assert graphdb.resolve_id(g, "shop:syn-012") == "shop:syn-012"
    assert graphdb.resolve_id(g, "NG-034") == "job:NG-034"
    assert graphdb.resolve_id(g, "welding") == "process:welding"
    assert graphdb.resolve_id(g, "nope-999") is None


# ---------------------------------------------------------------- Neo4j (skips if down)
@pytest.fixture
def neo4j_loaded(monkeypatch):
    monkeypatch.delenv("MUSTER_GRAPH", raising=False)
    if not graphdb.ensure_loaded():
        pytest.skip("Neo4j not reachable (make graph-up)")
    return True


def test_neo4j_counts_match_memory(neo4j_loaded):
    nodes, edges = graphdb.build_property_graph().summary()
    assert graphdb.counts_neo4j() == {"nodes": nodes, "edges": edges}
    m = graphdb.meta(force=True)
    assert m and m["data_hash"] == graphdb.build_property_graph().data_hash
    assert graphdb.marker().startswith(m["data_hash"])


def test_neo4j_constraints_and_point_index(neo4j_loaded):
    names = {r["name"] for r in graphdb.run("SHOW CONSTRAINTS YIELD name")}
    assert {"node_id", "shop_id", "job_id"} <= names
    idx = {r["name"]: r["type"] for r in graphdb.run("SHOW INDEXES YIELD name, type")}
    assert idx.get("shop_location") == "POINT"
    rows = graphdb.run("MATCH (s:Shop {shop_id: 'syn-012'}) RETURN s.location IS NOT NULL AS has_point")
    assert rows == [{"has_point": True}]
