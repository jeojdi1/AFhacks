"""engine/graph.py (capability graph) and engine/cache.py (per-revision memoization).

The graph must answer exactly what the brute-force rules scan answers: candidate sets,
failing-filter codes, per-filter counts, near misses and readiness, on the demo scenario,
on a 10x scaled one and on randomly perturbed networks. The cache must never serve a
stale view: every mutation bumps the persisted revision.
"""

from __future__ import annotations

import copy
import importlib
import json
import random
from pathlib import Path

import pytest
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

import engine.app as app_module
from engine import cache, gaps, pipeline, rules, tagger
from engine import state as st
from engine.graph import CapabilityGraph

REPO = Path(__file__).resolve().parents[2]
DEMO_SHOP = "syn-012"


# --------------------------------------------------------------------------- scenarios

_BASE: dict = {}


def _base() -> tuple[st.State, list[dict]]:
    if not _BASE:
        rows = tagger.parse_csv(st.DEMO_PARTS_CSV.read_text(encoding="utf-8"))
        jobs, counts = tagger.tag_rows(rows, use_llm=False)
        _BASE.update(seed=st.load_seed(), jobs=jobs, counts=counts)
    return copy.deepcopy(_BASE["seed"]), copy.deepcopy(_BASE["jobs"])


def demo_state() -> st.State:
    s, jobs = _base()
    s.jobs, s.tagger_counts, s.stage = jobs, dict(_BASE["counts"]), "uploaded"
    return s


def scaled_state(k: int = 10, seed: int = 7) -> st.State:
    """k x shops (jittered clones, ids syn-001-i) and k x jobs (ids NG-001-i)."""
    rng = random.Random(seed)
    s, jobs = _base()
    shops = {}
    for i in range(k):
        for sid, shop in s.shops.items():
            c = copy.deepcopy(shop)
            c["id"] = f"{sid}-{i}"
            c["lat"] = round(c["lat"] + rng.uniform(-0.05, 0.05), 4)
            c["lon"] = round(c["lon"] + rng.uniform(-0.05, 0.05), 4)
            for cert in c["certifications"]:
                cert["shop_id"] = c["id"]
            shops[c["id"]] = c
    s.shops = shops
    s.jobs = []
    for i in range(k):
        for j in jobs:
            c = copy.deepcopy(j)
            c["id"], c["part_no"] = f"{j['id']}-{i}", f"{j['part_no']}-{i}"
            s.jobs.append(c)
    s.stage = "uploaded"
    return s


def perturbed_state(seed: int) -> st.State:
    """Demo network with random processes / cert statuses / envelopes / capacities, and
    jobs with random requirements (duplicates, empty lists, controlled flags)."""
    rng = random.Random(seed)
    s = demo_state()
    procs = sorted(rules.PROCESS_LABEL)
    ctypes = sorted(rules.CERT_LABEL)
    statuses = ["verified", "declared", "unknown", "pending_training", None]
    for shop in s.shops.values():
        shop["processes"] = rng.sample(procs, rng.randint(0, 4))
        shop["max_envelope_mm"] = [rng.choice([200, 800, 1500, 3000]) for _ in range(3)]
        shop["capacity_hours_week"] = rng.choice([0, 20, 40, 80, 160])
        shop["certifications"] = [
            {"shop_id": shop["id"], "type": rng.choice(ctypes), "status": rng.choice(statuses)}
            for _ in range(rng.randint(0, 6))  # duplicates of a type: the first one wins
        ]
    for job in s.jobs:
        job["process_tags"] = rng.sample(procs, rng.randint(1, 2)) * rng.choice([1, 2])
        job["required_certs"] = rng.sample(ctypes, rng.randint(0, 3))
        job["controlled"] = rng.random() < 0.4
        job["envelope_mm"] = [rng.choice([100, 500, 1200, 2500]) for _ in range(3)]
    return s


class BruteContext(pipeline.Context):
    """The pre-graph reference: every question answered by scanning rules.evaluate over
    every shop, and engine.gaps' original loops (they run when ``ctx.graph`` is None)."""

    graph = None  # type: ignore[assignment]

    def failing(self, sid, job, with_capacity=True):
        return self.evaluate(sid, job, with_capacity)["failing"]

    def missing_certs(self, sid, job):
        return rules.missing_certs(job, self.shops[sid], self.counting)

    def counts(self, sid, ctype):
        return rules.cert_counts(self.shops[sid], ctype, self.counting)

    def eligible_ignoring_capacity(self, job):
        return [sid for sid in self.shops if not self.failing(sid, job, with_capacity=False)]


def routed(s: st.State, solver: str = "greedy") -> st.State:
    pipeline.route(s, solver=solver)
    return s


# --------------------------------------------------------------------------- graph == brute force


def assert_graph_matches_brute(ctx: pipeline.Context) -> None:
    g = ctx.graph
    for jid in ctx.job_order:
        job = ctx.jobs[jid]
        brute_cands = []
        for sid, shop in ctx.shops.items():
            rem = ctx.remaining(sid)
            full = rules.evaluate(job, shop, rem, counting=ctx.counting)["failing"]
            nocap = rules.evaluate(job, shop, None, counting=ctx.counting)["failing"]
            assert g.failing(sid, job, rem) == full, (jid, sid)
            assert g.failing(sid, job, None) == nocap, (jid, sid)
            assert g.missing_certs(sid, job) == rules.missing_certs(job, shop, ctx.counting)
            assert g.fits(sid, job) == rules.fits(job.get("envelope_mm") or [],
                                                 shop.get("max_envelope_mm") or [])
            if not nocap:
                brute_cands.append(sid)
        assert list(g.candidates(job)) == brute_cands, jid
        # BlockedJob.failing_filters counts, from index sizes.
        ff = {f: 0 for f in rules.FILTERS}
        for sid in ctx.shops:
            for f in ctx.evaluate(sid, job)["failing"]:
                ff[f] += 1
        assert g.filter_counts(job, ctx.remaining) == ff, jid
        # Near misses: exactly one failing filter.
        only_cert = [s for s in ctx.shops if ctx.evaluate(s, job)["failing"] == ["certs"]]
        only_cap = [s for s in ctx.shops if ctx.evaluate(s, job)["failing"] == ["capacity"]]
        assert g.near_miss_cert(job, ctx.remaining) == only_cert, jid
        assert g.near_miss_capacity(job, ctx.remaining) == only_cap, jid


def test_graph_matches_brute_force_demo_routed_and_funded():
    s = routed(demo_state(), "auto")
    assert_graph_matches_brute(pipeline.Context(s))
    pipeline.fund(s, "TP-01")  # pending_training cert + capacity bonus now in play
    assert s.cert_overrides and s.capacity_bonus
    assert_graph_matches_brute(pipeline.Context(s))


def test_graph_matches_brute_force_scaled():
    s = routed(scaled_state(10))
    ctx = pipeline.Context(s)
    assert len(ctx.shops) == 300 and len(ctx.jobs) == 400
    assert_graph_matches_brute(ctx)


@pytest.mark.parametrize("seed", range(12))
def test_graph_matches_brute_force_random_networks(seed):
    s = perturbed_state(seed)
    ctx = pipeline.Context(s)
    # Random partial assignments so capacity bites.
    rng = random.Random(seed)
    sids = list(s.shops)
    ctx.set_assignments({j["id"]: rng.choice(sids) for j in s.jobs if rng.random() < 0.5})
    assert_graph_matches_brute(ctx)


def test_graph_unknown_status_counting_config():
    """If "unknown" were configured to count, a shop WITHOUT the cert counts too."""
    s = demo_state()
    s.config = copy.deepcopy(s.config)
    s.config["filters"]["counting_cert_statuses"] = ["verified", "unknown"]
    ctx = pipeline.Context(s)
    assert ctx.counting == ("verified", "unknown")
    assert ctx.graph.holders("NOT_A_REAL_CERT") == frozenset(ctx.shops)
    assert_graph_matches_brute(ctx)


def test_graph_basic_indexes():
    shops = {
        "a": {"processes": ["welding"], "max_envelope_mm": [100, 100, 100],
              "certifications": [{"type": "CGP", "status": "declared"},
                                 {"type": "CGP", "status": "unknown"}]},
        "b": {"processes": ["welding", "painting"], "max_envelope_mm": [50, 50, 50],
              "certifications": [{"type": "CWB_W47.1", "status": "pending_training"}]},
    }
    g = CapabilityGraph(shops)
    assert g.process_index["welding"] == {"a", "b"}
    assert g.holders("CGP") == {"a"}  # first entry of a type wins
    assert g.holders("CWB_W47.1") == {"b"}
    job = {"id": "j", "process_tags": ["welding"], "required_certs": ["CWB_W47.1"],
           "controlled": False, "envelope_mm": [10, 10, 10], "hours_week": 5}
    assert g.candidates(job) == ("b",)
    assert g.failing("a", job, 1) == ["certs", "capacity"]


# --------------------------------------------------------------------------- whole outputs


def _with_brute(monkeypatch, fn):
    with monkeypatch.context() as m:
        m.setattr(pipeline, "Context", BruteContext)
        return fn()


def _flow(s: st.State, solver: str) -> dict:
    out = {"route": pipeline.route(s, solver=solver)}
    out["gaps"] = pipeline.gaps(s)
    out["shops"] = {sid: pipeline.shop_detail(s, sid) for sid in s.shops}
    pkg = next((p for p, v in s.packages.items() if v["status"] != "funded"), None)
    if pkg:
        f = pipeline.fund(s, pkg)
        f.pop("elapsed_ms", None)
        out["fund"] = f
        out["gaps_after"] = pipeline.gaps(s)
        out["shops_after"] = {sid: pipeline.shop_detail(s, sid) for sid in s.shops}
        out["ledger"] = pipeline.ledger(s)
    out["route"].pop("elapsed_ms")
    return out


@pytest.mark.parametrize(
    "make,solver",
    [(demo_state, "auto"), (demo_state, "greedy"), (lambda: scaled_state(3), "greedy")]
    + [(lambda seed=seed: perturbed_state(seed), "greedy") for seed in range(4)],
)
def test_route_gaps_fund_readiness_identical_to_brute_force(monkeypatch, make, solver):
    fast = _flow(make(), solver)
    slow = _with_brute(monkeypatch, lambda: _flow(make(), solver))
    assert fast == slow


def test_readiness_and_suggestions_identical_scaled(monkeypatch):
    s = routed(scaled_state(10))
    ctx, brute = pipeline.Context(s), BruteContext(s)
    for sid in list(s.shops)[:60]:
        assert gaps.readiness(ctx, sid, s.assignments) == gaps.readiness(brute, sid, s.assignments)
    blocked = [b["job_id"] for b in s.blocked]
    assert blocked
    assert gaps.build_suggestions(ctx, blocked, {}) == gaps.build_suggestions(brute, blocked, {})
    pkgs = list(s.packages.values())
    for jid in blocked:
        assert gaps.blocked_job(ctx, jid, pkgs) == gaps.blocked_job(brute, jid, pkgs)


def test_one_shop_context_gives_same_readiness():
    s = routed(demo_state())
    full = pipeline.Context(s)
    for sid in s.shops:
        one = pipeline.Context(s, shop_ids=(sid,))
        assert list(one.shops) == [sid]
        assert gaps.readiness(one, sid, s.assignments) == gaps.readiness(full, sid, s.assignments)


# --------------------------------------------------------------------------- cache + revision


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSTER_DB", str(tmp_path / "graph_test.db"))
    cache.clear()
    with TestClient(app_module.app) as c:
        yield c


def _rev() -> int:
    return st.load_state().revision


def test_every_mutation_bumps_revision(client):
    assert client.post("/demo/reset").status_code == 200
    r0 = _rev()
    assert client.post("/programs/northgate/parts?use_demo=true").status_code == 200
    r1 = _rev()
    assert client.post("/programs/northgate/route").status_code == 200
    r2 = _rev()
    assert client.post("/programs/northgate/training/TP-01/fund").status_code == 200
    r3 = _rev()
    assert client.post("/demo/reset").status_code == 200
    r4 = _rev()
    assert r0 < r1 < r2 < r3 < r4  # a reset continues the count
    # A failed mutation (409) saves nothing.
    client.post("/programs/northgate/parts?use_demo=true")
    client.post("/programs/northgate/route")
    client.post("/programs/northgate/training/TP-01/fund")
    r5 = _rev()
    assert client.post("/programs/northgate/training/TP-01/fund").status_code == 409
    assert _rev() == r5


def test_reads_are_memoized_and_fund_invalidates_immediately(client):
    client.post("/demo/reset")
    client.post("/programs/northgate/parts?use_demo=true")
    client.post("/programs/northgate/route")
    paths = ["/programs/northgate/ledger", "/programs/northgate/gaps", f"/shops/{DEMO_SHOP}",
             "/programs/northgate/jobs", "/programs/northgate/assignments", "/programs/northgate",
             "/shops"]
    before = {p: client.get(p).json() for p in paths}
    hits = cache.stats["hits"]
    again = {p: client.get(p).json() for p in paths}
    assert again == before
    assert cache.stats["hits"] - hits == len(paths)  # second round served from cache

    assert client.post("/programs/northgate/training/TP-01/fund").status_code == 200
    after = {p: client.get(p).json() for p in paths}
    s = st.load_state()
    assert after["/programs/northgate/ledger"] == pipeline.ledger(s)
    assert after["/programs/northgate/gaps"] == pipeline.gaps(s)
    assert after[f"/shops/{DEMO_SHOP}"] == pipeline.shop_detail(s, DEMO_SHOP)
    assert after["/programs/northgate/jobs"] == pipeline.jobs_view(s)
    assert after["/programs/northgate"] == pipeline.program_view(s)
    assert after["/programs/northgate/ledger"]["credit_total_cad"] > before[
        "/programs/northgate/ledger"]["credit_total_cad"]
    assert after["/programs/northgate/gaps"] != before["/programs/northgate/gaps"]
    assert after[f"/shops/{DEMO_SHOP}"]["training"][0]["status"] == "funded"
    assert before[f"/shops/{DEMO_SHOP}"]["training"][0]["status"] == "suggested"

    # Upload and reset invalidate too.
    client.post("/programs/northgate/parts?use_demo=true")
    assert client.get("/programs/northgate").json()["state"] == "uploaded"
    assert client.get("/programs/northgate/ledger").status_code == 400
    client.post("/demo/reset")
    assert client.get("/programs/northgate").json()["counts"]["jobs"] == 0


def test_cached_bytes_equal_uncached_rendering(client):
    client.post("/demo/reset")
    client.post("/programs/northgate/parts?use_demo=true")
    client.post("/programs/northgate/route")
    s = st.load_state()
    for path, value in [
        ("/programs/northgate/ledger", pipeline.ledger(s)),
        ("/programs/northgate/gaps", pipeline.gaps(s)),
        ("/shops/syn-003", pipeline.shop_detail(s, "syn-003")),
        ("/shops?source=synthetic", pipeline.shops_list(s, "synthetic")),
    ]:
        for _ in range(2):  # miss, then hit
            r = client.get(path)
            assert r.status_code == 200
            assert r.headers["content-type"] == "application/json"
            assert r.json() == json.loads(json.dumps(value))
            # Byte-for-byte what FastAPI's default path renders for the returned dict.
            assert r.content == JSONResponse(jsonable_encoder(value)).body


def test_write_from_elsewhere_is_seen(client):
    """A save that did not go through the API (another process, a script) is picked up."""
    client.post("/demo/reset")
    assert client.get("/programs/northgate").json()["state"] == "empty"
    s = st.load_state()
    s.stage = "uploaded"
    st.save_state(s)
    assert client.get("/programs/northgate").json()["state"] == "uploaded"


def test_revision_persists_across_reload(client, tmp_path):
    client.post("/demo/reset")
    client.post("/programs/northgate/parts?use_demo=true")
    client.post("/programs/northgate/route")
    rev = _rev()
    key = st.state_key()
    assert key is not None and key[2] == rev
    ledger = client.get("/programs/northgate/ledger").json()
    cache.clear()
    fresh = importlib.reload(app_module)
    try:
        with TestClient(fresh.app) as c2:
            assert st.load_state().revision == rev
            assert st.state_key() == key
            assert c2.get("/programs/northgate/ledger").json() == ledger
            assert c2.post("/programs/northgate/training/TP-01/fund").status_code == 200
            assert st.load_state().revision == rev + 1
    finally:
        importlib.reload(app_module)


def test_save_state_revision_is_monotonic_even_for_stale_objects(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSTER_DB", str(tmp_path / "mono.db"))
    a = st.load_seed()
    st.save_state(a)
    st.save_state(a)
    stale = st.load_seed()  # revision 0
    st.save_state(stale)
    assert (a.revision, stale.revision) == (2, 3)
    assert st.state_key()[2] == 3
    assert st.reset_state().revision == 4


def test_old_database_without_revision_columns_is_migrated(tmp_path, monkeypatch):
    import sqlite3

    db = tmp_path / "old.db"
    monkeypatch.setenv("MUSTER_DB", str(db))
    s = st.load_seed()
    with sqlite3.connect(db) as conn:
        conn.execute("CREATE TABLE state (program_id TEXT PRIMARY KEY, json TEXT NOT NULL, "
                     "updated_at TEXT)")
        conn.execute("INSERT INTO state VALUES ('northgate', ?, 'x')", (st.to_json(s),))
    assert st.state_key() is None  # uncacheable until the next save
    assert st.load_state().stage == "empty"
    st.save_state(st.load_state())
    assert st.state_key()[2] == 1


def test_cors_any_local_port(client):
    for origin in ("http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3107",
                   "http://127.0.0.1:5173", "http://localhost"):
        r = client.get("/health", headers={"Origin": origin})
        assert r.headers.get("access-control-allow-origin") == origin, origin
    for origin in ("http://evil.example", "http://localhost:3000.evil.example",
                   "http://notlocalhost:3000"):
        r = client.get("/health", headers={"Origin": origin})
        assert "access-control-allow-origin" not in r.headers, origin
