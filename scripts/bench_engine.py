"""Engine latency benchmark: demo scale over HTTP + a 10x scaled scenario in memory.

    .venv/bin/python scripts/bench_engine.py            # full run (50 demo runs)
    .venv/bin/python scripts/bench_engine.py --runs 10 --scaled-runs 3

(a) DEMO SCALE (fastapi TestClient, a temporary MUSTER_DB; data/muster.db is never
    touched). Each run starts from POST /demo/reset and walks docs/demo-script.md:
    reset, upload ?use_demo, route, assignments, jobs, ledger, gaps, shops,
    shops/syn-012, fund TP-01, shops/syn-012 again. Every GET is timed twice: "cold"
    (first read after the mutation) and "warm" (an immediate repeat). shop_detail is
    also timed for all 30 shops after routing.

(b) SCALED (in memory, no HTTP): 10x shops (300, cloned from the 30 with jittered
    lat/lon, ids ``syn-001-k``) and 10x jobs (400, cloned parts with ``-k`` suffixes).
    Times pipeline.route (auto and greedy), gaps (the view and the full blocked/suggestion
    rebuild), shop_detail/readiness for 50 shops, ledger and one fund. The scaled state is
    also saved to the temp DB and read over HTTP (cold vs warm).

Prints p50 / p95 / max in milliseconds.
"""

from __future__ import annotations

import argparse
import copy
import os
import random
import statistics
import sys
import tempfile
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

PID = "northgate"
DEMO_SHOP = "syn-012"
DEMO_PACKAGE = "TP-01"
SCALE = 10


# --------------------------------------------------------------------------- helpers


class Timer:
    def __init__(self) -> None:
        self.samples: dict[str, list[float]] = {}
        self.order: list[str] = []

    def add(self, name: str, ms: float) -> None:
        if name not in self.samples:
            self.samples[name] = []
            self.order.append(name)
        self.samples[name].append(ms)

    def time(self, name: str, fn, *args, **kwargs):
        t0 = time.perf_counter()
        out = fn(*args, **kwargs)
        self.add(name, (time.perf_counter() - t0) * 1000)
        return out


def pct(values: list[float], p: float) -> float:
    xs = sorted(values)
    if len(xs) == 1:
        return xs[0]
    k = (len(xs) - 1) * p
    lo = int(k)
    hi = min(lo + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)


def table(title: str, timer: Timer) -> str:
    w = max([len(n) for n in timer.order] + [10])
    lines = [title, f"{'step':<{w}}  {'n':>4}  {'p50 ms':>9}  {'p95 ms':>9}  {'max ms':>9}"]
    lines.append("-" * len(lines[-1]))
    for name in timer.order:
        xs = timer.samples[name]
        lines.append(
            f"{name:<{w}}  {len(xs):>4}  {statistics.median(xs):>9.2f}  {pct(xs, 0.95):>9.2f}"
            f"  {max(xs):>9.2f}"
        )
    return "\n".join(lines)


def invalidate_cache() -> None:
    """Drop the engine's in-process response/graph cache, if this build has one."""
    try:
        from engine import cache
    except ImportError:
        return
    cache.clear()


def ok(r, name: str):
    if r.status_code != 200:
        raise SystemExit(f"{name}: HTTP {r.status_code} {r.text[:300]}")
    return r


# --------------------------------------------------------------------------- (a) demo


def bench_demo(runs: int) -> Timer:
    from fastapi.testclient import TestClient

    import engine.app as app_module

    t = Timer()
    with TestClient(app_module.app) as c:
        # One warm-up run so imports / OR-Tools loading are not in the numbers.
        ok(c.post("/demo/reset"), "warmup reset")
        ok(c.post(f"/programs/{PID}/parts?use_demo=true"), "warmup upload")
        ok(c.post(f"/programs/{PID}/route"), "warmup route")

        def get(name: str, path: str) -> None:
            ok(t.time(f"{name} (cold)", c.get, path), name)
            ok(t.time(f"{name} (warm)", c.get, path), name)

        for _ in range(runs):
            t0 = time.perf_counter()
            ok(t.time("reset", c.post, "/demo/reset"), "reset")
            ok(t.time("upload use_demo", c.post, f"/programs/{PID}/parts?use_demo=true"), "upload")
            ok(t.time("route (auto)", c.post, f"/programs/{PID}/route"), "route")
            get("program", f"/programs/{PID}")
            get("assignments", f"/programs/{PID}/assignments")
            get("jobs", f"/programs/{PID}/jobs")
            get("ledger", f"/programs/{PID}/ledger")
            get("gaps", f"/programs/{PID}/gaps")
            get("shops", "/shops")
            get(f"shops/{DEMO_SHOP} before fund", f"/shops/{DEMO_SHOP}")
            ok(t.time(f"fund {DEMO_PACKAGE}", c.post, f"/programs/{PID}/training/{DEMO_PACKAGE}/fund"), "fund")
            get(f"shops/{DEMO_SHOP} after fund", f"/shops/{DEMO_SHOP}")
            get("ledger after fund", f"/programs/{PID}/ledger")
            get("gaps after fund", f"/programs/{PID}/gaps")
            t.add("= demo walkthrough total", (time.perf_counter() - t0) * 1000)

        # shop_detail for all 30 shops at the routed state.
        ok(c.post("/demo/reset"), "reset")
        ok(c.post(f"/programs/{PID}/parts?use_demo=true"), "upload")
        ok(c.post(f"/programs/{PID}/route"), "route")
        shop_ids = [s["id"] for s in c.get("/shops").json()["shops"]]
        for _ in range(runs):
            invalidate_cache()
            t0 = time.perf_counter()
            for sid in shop_ids:
                ok(c.get(f"/shops/{sid}"), sid)
            t.add(f"shop_detail x{len(shop_ids)} (cold)", (time.perf_counter() - t0) * 1000)
            t0 = time.perf_counter()
            for sid in shop_ids:
                ok(c.get(f"/shops/{sid}"), sid)
            t.add(f"shop_detail x{len(shop_ids)} (warm)", (time.perf_counter() - t0) * 1000)
    return t


# --------------------------------------------------------------------------- (b) scaled


def scaled_state(scale: int = SCALE, seed: int = 7):
    """An uploaded (stage "uploaded") State with ``scale``x shops and jobs."""
    from engine import state as st
    from engine import tagger

    rng = random.Random(seed)
    base = st.load_seed()
    rows = tagger.parse_csv(st.DEMO_PARTS_CSV.read_text(encoding="utf-8"))
    jobs, counts = tagger.tag_rows(rows, use_llm=False, program_id=PID)

    shops: dict[str, dict] = {}
    for k in range(scale):
        for sid, shop in base.shops.items():
            s = copy.deepcopy(shop)
            nid = f"{sid}-{k}"
            s["id"] = nid
            s["lat"] = round(float(shop["lat"]) + rng.uniform(-0.05, 0.05), 4)
            s["lon"] = round(float(shop["lon"]) + rng.uniform(-0.05, 0.05), 4)
            for cert in s.get("certifications") or []:
                cert["shop_id"] = nid
            shops[nid] = s
    big_jobs = []
    for k in range(scale):
        for j in jobs:
            nj = copy.deepcopy(j)
            nj["id"] = f"{j['id']}-{k}"
            nj["part_no"] = f"{j['part_no']}-{k}"
            big_jobs.append(nj)
    base.shops = shops
    base.jobs = big_jobs
    base.tagger_counts = {kk: v * scale for kk, v in counts.items()}
    base.stage = "uploaded"
    return base


def bench_scaled(runs: int) -> tuple[Timer, str]:
    from fastapi.testclient import TestClient

    import engine.app as app_module
    from engine import pipeline
    from engine import state as st

    t = Timer()
    uploaded = scaled_state()
    info = f"scaled scenario: {len(uploaded.shops)} shops, {len(uploaded.jobs)} jobs"

    routed = None
    for solver in ("greedy", "auto"):
        for _ in range(runs):
            s = copy.deepcopy(uploaded)
            invalidate_cache()
            res = t.time(f"route ({solver})", pipeline.route, s, solver=solver)
            if solver == "auto":
                routed = s
        info += (
            f"\n  route({solver}): assigned {res['stats']['assigned']}, blocked "
            f"{res['stats']['blocked']}, solver {res['solver']}, suggestions {len(s.packages)}"
        )
    assert routed is not None

    for _ in range(runs):
        invalidate_cache()
        t.time("gaps view", pipeline.gaps, routed)
    for _ in range(runs):
        s = copy.deepcopy(routed)
        invalidate_cache()
        ctx = pipeline.Context(s)
        t.time("gaps rebuild (blocked+suggestions)", pipeline._refresh_gaps, s, ctx)
    shop_ids = list(routed.shops)[:50]
    for _ in range(runs):
        invalidate_cache()
        t0 = time.perf_counter()
        for sid in shop_ids:
            pipeline.shop_detail(routed, sid)
        t.add(f"readiness/shop_detail x{len(shop_ids)}", (time.perf_counter() - t0) * 1000)
    for _ in range(runs):
        invalidate_cache()
        t.time("ledger", pipeline.ledger, routed)
    pkg = next((p for p, v in routed.packages.items() if v.get("status") != "funded"), None)
    if pkg:
        for _ in range(runs):
            s = copy.deepcopy(routed)
            invalidate_cache()
            t.time(f"fund {pkg}", pipeline.fund, s, pkg)

    # Over HTTP: the scaled state saved to the temp DB, read cold (cache dropped) and warm.
    st.save_state(copy.deepcopy(routed))
    paths = {
        "HTTP gaps": f"/programs/{PID}/gaps",
        "HTTP ledger": f"/programs/{PID}/ledger",
        "HTTP jobs": f"/programs/{PID}/jobs",
        "HTTP shops": "/shops",
        f"HTTP shops/{shop_ids[0]}": f"/shops/{shop_ids[0]}",
    }
    with TestClient(app_module.app) as c:
        for name, path in paths.items():
            for _ in range(runs):
                invalidate_cache()
                ok(t.time(f"{name} (cold)", c.get, path), name)
                ok(t.time(f"{name} (warm)", c.get, path), name)
    return t, info


# --------------------------------------------------------------------------- main


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--runs", type=int, default=50, help="demo-scale runs (default 50)")
    ap.add_argument("--scaled-runs", type=int, default=5, help="scaled runs per step (default 5)")
    ap.add_argument("--out", type=Path, default=None, help="also write the report here")
    ap.add_argument("--skip-demo", action="store_true")
    ap.add_argument("--skip-scaled", action="store_true")
    args = ap.parse_args(argv)

    tmp = tempfile.TemporaryDirectory(prefix="muster-bench-")
    os.environ["MUSTER_DB"] = str(Path(tmp.name) / "bench.db")
    logs = [f"engine bench  python {sys.version.split()[0]}  MUSTER_DB={os.environ['MUSTER_DB']}"]
    try:
        from engine import graph as _g  # noqa: F401

        logs.append("build: capability graph + response cache PRESENT")
    except ImportError:
        logs.append("build: baseline (no engine.graph)")
    if not args.skip_demo:
        t0 = time.perf_counter()
        demo = bench_demo(args.runs)
        logs.append("")
        logs.append(table(f"(a) DEMO SCALE: 30 shops, 40 jobs, {args.runs} runs (HTTP, TestClient)", demo))
        logs.append(f"   wall {time.perf_counter() - t0:.1f}s")
    if not args.skip_scaled:
        t0 = time.perf_counter()
        scaled, info = bench_scaled(args.scaled_runs)
        logs.append("")
        logs.append(table(f"(b) SCALED x{SCALE}: {args.scaled_runs} runs per step", scaled))
        logs.append(info)
        logs.append(f"   wall {time.perf_counter() - t0:.1f}s")
    report = "\n".join(logs)
    print(report)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(report + "\n", encoding="utf-8")
    tmp.cleanup()
    return 0


if __name__ == "__main__":
    sys.exit(main())

