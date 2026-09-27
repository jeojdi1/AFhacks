#!/usr/bin/env python3
"""Build the search + graph fixtures in data/fixtures/search/ (docs/api.md §7).

Runs the real engine in-process (FastAPI TestClient on a temporary MUSTER_DB, never
data/muster.db) with the **memory** graph engine forced (``MUSTER_GRAPH=memory``), so the
output does not depend on whether Neo4j is running: reset → upload the demo parts →
route (36 / 4, not funded) → the reads below. Deterministic: JSON with indent 2 and a
trailing newline; re-running gives byte-identical files. No other fixture is touched.

    .venv/bin/python scripts/build_search_fixtures.py          # write
    .venv/bin/python scripts/build_search_fixtures.py --check  # exit 1 if any file differs
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

OUT = ROOT / "data" / "fixtures" / "search"

# file -> GET path (after reset + upload + route; before funding)
READS = {
    "shops_cnc_london.json": "/search/shops?process=cnc_milling&near=London&radius_km=50",
    "shops_cwb.json": "/search/shops?cert=CWB_W47.1",
    "jobs_syn-012.json": "/search/jobs?shop_id=syn-012",
    "graph_summary.json": "/graph/summary",
    "graph_ego_syn-012.json": "/graph/ego?id=syn-012&depth=2&limit=150",
}


def dumps(obj) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def build() -> dict[str, object]:
    from fastapi.testclient import TestClient

    import engine.app as app_module
    from engine import cache, graphdb

    out: dict[str, object] = {}
    with tempfile.TemporaryDirectory() as tmp:
        old = {k: os.environ.get(k) for k in ("MUSTER_DB", "MUSTER_GRAPH")}
        os.environ["MUSTER_DB"] = str(Path(tmp) / "search_fixtures.db")
        os.environ["MUSTER_GRAPH"] = "memory"
        graphdb.reset_availability()
        cache.clear()
        try:
            with TestClient(app_module.app) as c:
                for method, path in (("POST", "/demo/reset"),
                                     ("POST", "/programs/northgate/parts?use_demo=true"),
                                     ("POST", "/programs/northgate/route")):
                    r = c.request(method, path)
                    if r.status_code != 200:
                        raise SystemExit(f"{method} {path}: {r.status_code} {r.text}")
                for name, path in READS.items():
                    r = c.get(path)
                    if r.status_code != 200:
                        raise SystemExit(f"GET {path}: {r.status_code} {r.text}")
                    out[name] = r.json()
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
            cache.clear()
    out["index.json"] = {
        "generated_by": "scripts/build_search_fixtures.py",
        "engine": "memory (MUSTER_GRAPH=memory; Neo4j returns the same content with engine 'neo4j')",
        "state": "reset -> upload demo parts -> route (36 assigned / 4 blocked, not funded)",
        "note": ("docs/api.md §7. Synthetic shops are fictional; public shops are 'Public data — "
                 "unverified — not affiliated' and never routed. Tenders are a CanadaBuys sample (OGL)."),
        "endpoints": {f"GET {path}": name for name, path in READS.items()},
    }
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="exit 1 if any fixture differs")
    args = ap.parse_args()
    files = build()
    if args.check:
        bad = [n for n, obj in files.items()
               if not (OUT / n).is_file() or (OUT / n).read_text(encoding="utf-8") != dumps(obj)]
        extra = sorted(p.name for p in OUT.glob("*.json") if p.name not in files) if OUT.is_dir() else []
        if bad or extra:
            print(f"search fixtures out of date: {bad + extra}")
            return 1
        print(f"search fixtures current ({len(files)} files)")
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    for n, obj in files.items():
        (OUT / n).write_text(dumps(obj), encoding="utf-8")
    print(f"wrote {len(files)} files to {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
