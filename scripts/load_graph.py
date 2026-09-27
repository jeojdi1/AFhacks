#!/usr/bin/env python3
"""Load Shieldworks' property graph into Neo4j (``make graph-load``; docs/api.md §7).

Wipes the database, creates constraints + indexes (unique ``id`` per kind, a point index
on shop / manufacturer ``location``), then writes the graph built by
``engine.graphdb.build_property_graph`` from data/processed (synthetic + public shops,
the national graph seed, entity links, the Job Bank outlook, ITB obligations) and the
Northgate parts fixture, and prints node / edge counts read back from Neo4j.

    (:Prime)-[:HAS_PROGRAM]->(:Program)-[:HAS_JOB]->(:Job)-[:NEEDS_PROCESS]->(:Process)
                                                        (:Job)-[:NEEDS_CERT]->(:Cert)
    (:Prime)-[:ITB_OBLIGATION {value, achieved}]->(:Program)
    (:Shop)-[:HAS_PROCESS]->(:Process)   (:Shop)-[:HOLDS_CERT {status, source_url}]->(:Cert)
    (:Shop)-[:IN_REGION]->(:Region)-[:OUTLOOK {noc, label}]->(:Occupation)
    (:Shop)-[:MATCHES_DND_VENDOR {confidence, contracts, value_cad, last_date}]->(:DNDVendor)
    (:Shop)-[:SAME_AS]->(:Manufacturer)  (ODBus sites; also IN_REGION / MATCHES_DND_VENDOR)

Credentials come from NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD (environment or .env);
the password is never printed.

    .venv/bin/python scripts/load_graph.py            # wipe + load, print counts
    .venv/bin/python scripts/load_graph.py --if-stale # load only if the data changed
    .venv/bin/python scripts/load_graph.py --ping [--wait 30]  # exit 0 once reachable
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from engine import graphdb


def wait_reachable(seconds: float) -> bool:
    deadline = time.monotonic() + seconds
    while True:
        if graphdb.reachable():
            return True
        if time.monotonic() >= deadline:
            return False
        graphdb.close()
        time.sleep(1.0)


def main() -> int:
    ap = argparse.ArgumentParser(description="Load Shieldworks' property graph into Neo4j.")
    ap.add_argument("--ping", action="store_true", help="only check that Neo4j is reachable")
    ap.add_argument("--wait", type=float, default=0.0, metavar="S", help="wait up to S seconds for Neo4j")
    ap.add_argument("--if-stale", action="store_true", help="skip the load if the graph is current")
    args = ap.parse_args()

    uri = graphdb.settings()["uri"] or "(NEO4J_URI not set)"
    if not wait_reachable(args.wait):
        print(f"Neo4j not reachable at {uri}; the API falls back to the in-memory graph.")
        return 1
    if args.ping:
        print(f"Neo4j reachable at {uri}")
        return 0

    g = graphdb.build_property_graph()
    if args.if_stale:
        m = graphdb._probe_meta()
        if m and m.get("data_hash") == g.data_hash:
            print(f"Neo4j graph is current (data {g.data_hash}, loaded {m.get('loaded_at')}); nothing to do.")
            return 0

    t0 = time.perf_counter()
    counts = graphdb.load(g)
    secs = time.perf_counter() - t0
    want_nodes, want_edges = g.summary()
    print(f"Loaded Shieldworks graph into {uri} in {secs:.1f}s (data {g.data_hash})")
    print(f"Nodes: {sum(counts['nodes'].values())}")
    for k, v in counts["nodes"].items():
        print(f"  {k:<14} {v:>6}")
    print(f"Edges: {sum(counts['edges'].values())}")
    for k, v in counts["edges"].items():
        print(f"  {k:<20} {v:>6}")
    if counts["nodes"] != want_nodes or counts["edges"] != want_edges:
        print("WARNING: counts in Neo4j differ from the built graph", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
