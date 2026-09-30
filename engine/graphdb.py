"""Optional Neo4j graph database + the canonical property graph it holds (docs/api.md §7).

Two things live here:

1. **The property graph** (``build_property_graph``), built in pure Python from the data
   files (synthetic + public shops, the national graph seed, entity links, the Job Bank
   outlook, the ITB obligations and the Northgate parts fixture). ``scripts/load_graph.py``
   writes exactly this graph into Neo4j, and the memory fallback of ``engine.search``
   serves ``/graph/summary`` and ``/graph/ego`` from it, so both engines answer with the
   same nodes and edges.

   Every node has a unique namespaced ``id`` (``shop:syn-012``, ``job:NG-001``,
   ``process:welding``, ``cert:CWB_W47.1``, ``region:3560``, ``occupation:72106``,
   ``dnd:<vendor>``, ``prime:<slug>``, ``program:<slug>``, ``mfr:<odbus id>``) and one
   kind (Neo4j label): Prime, Program, Job, Process, Cert, Shop, Region, Occupation,
   DNDVendor, Manufacturer. ``None`` properties are dropped (Neo4j never stores nulls).

2. **Neo4j access**: settings from the environment or the repo ``.env`` (parsed by hand,
   never printed), a lazy driver, and ``available()``: reachable within ~1 s **and**
   loaded (a ``(:Meta {id: "meta"})`` node written by the loader). The answer is cached
   for a few seconds so a dead database costs one short probe, not one per request.
   ``MUSTER_GRAPH=memory`` forces the memory engine (tests, fixture builds). Nothing
   here raises to the API when Neo4j is down: callers fall back to memory.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import threading
import time
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

from engine.rules import CERT_LABEL, CGP, NOT_HELD_STATUSES, PROCESS_LABEL

log = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = REPO_ROOT / ".env"
DATA = REPO_ROOT / "data"
PROCESSED = DATA / "processed"
NATIONAL = PROCESSED / "national"

SOURCES = {
    "shops_synthetic": PROCESSED / "shops_synthetic.json",
    "shops_public": PROCESSED / "shops_public.json",
    "program": PROCESSED / "program_northgate.json",
    "graph_seed": NATIONAL / "graph_seed.json",
    "entity_links": NATIONAL / "entity_links.json",
    "labour_outlook": NATIONAL / "labour_outlook.json",
    "itb_obligations": PROCESSED / "itb_obligations.json",
    "parts": DATA / "fixtures" / "parts_upload.json",
}
BUILDER_VERSION = "1"  # bump when the graph shape changes (forces a reload)

SYNTHETIC_LABEL = "Synthetic"
PUBLIC_LABEL = "Public data — unverified — not affiliated"
KINDS = (
    "Prime", "Program", "Job", "Process", "Cert", "Shop", "Region", "Occupation",
    "DNDVendor", "Manufacturer",
)
ID_PREFIXES = (
    "shop:", "job:", "process:", "cert:", "region:", "occupation:", "prime:", "program:",
    "dnd:", "mfr:",
)

CONNECT_TIMEOUT_S = 1.0
QUERY_TIMEOUT_S = 10.0
AVAILABLE_TTL_S = 5.0


# =========================================================================== settings
def _parse_env_file(path: Path) -> dict[str, str]:
    """KEY=VALUE lines (``export`` prefix, quotes and ``#`` comments allowed)."""
    out: dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return out
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):].lstrip()
        key, val = line.split("=", 1)
        key, val = key.strip(), val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        elif " #" in val:
            val = val.split(" #", 1)[0].rstrip()
        out[key] = val
    return out


def settings(env_file: Path | None = None) -> dict[str, str | None]:
    """``{"uri", "user", "password"}``: environment first, then the repo ``.env``."""
    file_vals = _parse_env_file(env_file or ENV_FILE)

    def get(name: str) -> str | None:
        v = os.environ.get(name)
        if v is None or v == "":
            v = file_vals.get(name)
        return v or None

    return {"uri": get("NEO4J_URI"), "user": get("NEO4J_USER"), "password": get("NEO4J_PASSWORD")}


def forced_memory() -> bool:
    return (os.environ.get("MUSTER_GRAPH") or "").strip().lower() == "memory"


# =========================================================================== driver
_lock = threading.RLock()
_driver: Any = None
_driver_key: tuple | None = None
_avail: dict[tuple, tuple[float, dict | None]] = {}  # settings key -> (checked at, meta or None)


def _key(cfg: dict) -> tuple:
    return (cfg.get("uri"), cfg.get("user"), cfg.get("password"))


def driver() -> Any:
    """The shared neo4j Driver for the current settings (created lazily), or None if the
    settings are incomplete or the neo4j package is missing."""
    global _driver, _driver_key
    cfg = settings()
    if not cfg["uri"]:
        return None
    key = _key(cfg)
    with _lock:
        if _driver is not None and _driver_key == key:
            return _driver
        close()
        try:
            from neo4j import GraphDatabase
        except ImportError:  # pragma: no cover - neo4j is in engine/requirements.txt
            return None
        auth = (cfg["user"], cfg["password"]) if cfg["user"] else None
        _driver = GraphDatabase.driver(
            cfg["uri"],
            auth=auth,
            connection_timeout=CONNECT_TIMEOUT_S,
            connection_acquisition_timeout=CONNECT_TIMEOUT_S * 2,
            max_transaction_retry_time=0,
        )
        _driver_key = key
        return _driver


def close() -> None:
    global _driver, _driver_key
    with _lock:
        if _driver is not None:
            try:
                _driver.close()
            except Exception as exc:  # noqa: BLE001 - closing a dead driver must never raise
                log.debug("neo4j driver close failed: %s", type(exc).__name__)
        _driver, _driver_key = None, None


def reachable() -> bool:
    """True if Neo4j answers within ~1 s (loaded or not). Never raises."""
    if forced_memory():
        return False
    try:
        d = driver()
        if d is None:
            return False
        d.verify_connectivity()
        return True
    except Exception as exc:  # noqa: BLE001 - any driver error means "not reachable"
        log.info("neo4j not reachable: %s", type(exc).__name__)
        return False


def _probe_meta() -> dict | None:
    """The loader's Meta node properties, or None (down, or never loaded)."""
    if not reachable():
        return None
    try:
        rows = run("MATCH (m:Meta {id: 'meta'}) RETURN m {.*} AS m LIMIT 1")
    except Exception as exc:  # noqa: BLE001
        log.info("neo4j meta probe failed: %s", type(exc).__name__)
        return None
    return dict(rows[0]["m"]) if rows else None


def meta(force: bool = False) -> dict | None:
    """Cached ``_probe_meta`` (``AVAILABLE_TTL_S``); None when Neo4j is not usable."""
    if forced_memory():
        return None
    key = _key(settings())
    now = time.monotonic()
    with _lock:
        hit = _avail.get(key)
        if hit is not None and not force and now - hit[0] < AVAILABLE_TTL_S:
            return hit[1]
    m = _probe_meta()
    with _lock:
        _avail[key] = (time.monotonic(), m)
    return m


def available(force: bool = False) -> bool:
    """Neo4j reachable (1 s timeout) and loaded by scripts/load_graph.py."""
    return meta(force) is not None


def marker() -> str:
    """Cache-key fragment: the loaded graph's data hash + load time ("" for memory)."""
    m = meta()
    if not m:
        return ""
    return f"{m.get('data_hash', '')}:{m.get('loaded_at', '')}"


def mark_down() -> None:
    """Forget the cached availability (after a failed query): the next call re-probes,
    and until then callers use memory."""
    key = _key(settings())
    with _lock:
        _avail[key] = (time.monotonic(), None)


def reset_availability() -> None:
    with _lock:
        _avail.clear()


def run(cypher: str, params: dict | None = None, timeout: float = QUERY_TIMEOUT_S) -> list[dict]:
    """Run one auto-commit query and return its records as dicts. Raises on any error
    (callers catch, ``mark_down()`` and fall back to memory)."""
    from neo4j import Query

    d = driver()
    if d is None:
        raise RuntimeError("Neo4j is not configured (NEO4J_URI)")
    with d.session() as s:
        return s.run(Query(cypher, timeout=timeout), params or {}).data()


# =========================================================================== property graph
@dataclass
class PropertyGraph:
    """Nodes by id (``{"id", "kind", "props"}``, props include ``id``) and edges
    (``{"source", "target", "type", "props"}``) in build order (deterministic)."""

    nodes: dict[str, dict] = field(default_factory=dict)
    edges: list[dict] = field(default_factory=list)
    data_hash: str = ""
    _adj: dict[str, list[int]] | None = None

    def add_node(self, nid: str, kind: str, props: dict) -> dict:
        p = {"id": nid, **{k: v for k, v in props.items() if v is not None}}
        node = self.nodes.get(nid)
        if node is None:
            node = self.nodes[nid] = {"id": nid, "kind": kind, "props": p}
        else:  # merge (first writer keeps its values)
            for k, v in p.items():
                node["props"].setdefault(k, v)
        return node

    def add_edge(self, source: str, etype: str, target: str, props: dict | None = None) -> None:
        if source not in self.nodes or target not in self.nodes:
            return
        self.edges.append(
            {
                "source": source,
                "target": target,
                "type": etype,
                "props": {k: v for k, v in (props or {}).items() if v is not None},
            }
        )

    def adjacency(self) -> dict[str, list[int]]:
        if self._adj is None:
            adj: dict[str, list[int]] = {}
            for i, e in enumerate(self.edges):
                adj.setdefault(e["source"], []).append(i)
                if e["target"] != e["source"]:
                    adj.setdefault(e["target"], []).append(i)
            self._adj = adj
        return self._adj

    def summary(self) -> tuple[dict[str, int], dict[str, int]]:
        nodes: dict[str, int] = {}
        for n in self.nodes.values():
            nodes[n["kind"]] = nodes.get(n["kind"], 0) + 1
        edges: dict[str, int] = {}
        for e in self.edges:
            edges[e["type"]] = edges.get(e["type"], 0) + 1
        return dict(sorted(nodes.items())), dict(sorted(edges.items()))


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def data_hash() -> str:
    """sha256 over every source file + BUILDER_VERSION (the loader's staleness check)."""
    h = hashlib.sha256(BUILDER_VERSION.encode())
    for name in sorted(SOURCES):
        p = SOURCES[name]
        h.update(name.encode())
        h.update(p.read_bytes() if p.is_file() else b"<missing>")
    return h.hexdigest()[:16]


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")


def _items(doc: Any, key: str) -> list:
    if isinstance(doc, dict):
        return list(doc.get(key) or [])
    return list(doc or [])


def _shop_props(s: dict, source: str) -> dict:
    return {
        "shop_id": s["id"],
        "name": s.get("name"),
        "source": source,
        "label_text": SYNTHETIC_LABEL if source == "synthetic" else PUBLIC_LABEL,
        "onboarding": "discovered" if source == "public" else "onboarded",
        "city": s.get("city"),
        "lat": s.get("lat"),
        "lon": s.get("lon"),
        "naics": s.get("naics"),
        "employee_band": s.get("employee_band"),
        "is_sme": bool(s.get("is_sme")),
        "capacity_hours_week": s.get("capacity_hours_week"),
        "website": s.get("website") if source == "public" else None,
    }


@lru_cache(maxsize=2)
def _build(hash_key: str) -> PropertyGraph:
    g = PropertyGraph(data_hash=hash_key)
    seed = _read(SOURCES["graph_seed"]) if SOURCES["graph_seed"].is_file() else {"nodes": [], "edges": []}
    seed_nodes = {n["id"]: n for n in seed.get("nodes") or []}
    seed_edges = seed.get("edges") or []

    # ---- vocabularies: processes and cert types
    for tag, label in PROCESS_LABEL.items():
        g.add_node(f"process:{tag}", "Process", {"name": tag, "label": label})
    for ctype, label in CERT_LABEL.items():
        g.add_node(f"cert:{ctype}", "Cert", {"type": ctype, "label": label})

    def process(tag: str) -> str:
        return g.add_node(f"process:{tag}", "Process", {"name": tag, "label": tag.replace("_", " ")})["id"]

    def cert(ctype: str) -> str:
        return g.add_node(f"cert:{ctype}", "Cert", {"type": ctype, "label": ctype})["id"]

    # ---- regions + occupations (+ Job Bank outlooks)
    for n in seed_nodes.values():
        if n["label"] == "Region":
            p = n["props"]
            g.add_node(n["id"], "Region", {
                "code": p.get("code"), "name": p.get("name"), "level": p.get("level"),
                "province": p.get("province"),
                "welder_vacancies_latest": p.get("welder_vacancies_latest"),
                "welder_vacancies_quarter": p.get("welder_vacancies_quarter"),
                "odbus_manufacturer_sites": p.get("odbus_manufacturer_sites"),
            })
        elif n["label"] == "Occupation":
            g.add_node(n["id"], "Occupation", {"noc": n["props"].get("noc"), "name": n["props"].get("name")})
    for e in seed_edges:
        if e["type"] == "REGION_PART_OF":
            g.add_edge(e["source"], "PART_OF", e["target"])
    if SOURCES["labour_outlook"].is_file():
        # labour_outlook.json is the source of the outlook edges (graph_seed derives the same).
        for r in _read(SOURCES["labour_outlook"]).get("rows") or []:
            wage = r.get("wage") or {}
            g.add_edge(
                f"region:{r.get('region_code')}", "OUTLOOK", f"occupation:{r.get('noc')}",
                {
                    "noc": r.get("noc"), "label": r.get("outlook"), "score": r.get("outlook_score"),
                    "prior_label": r.get("prior_outlook_2024_2026"), "period": r.get("period"),
                    "wage_median": wage.get("wage_median") if isinstance(wage, dict) else None,
                },
            )

    # ---- primes, programs, ITB obligations
    itb_rows = {}
    if SOURCES["itb_obligations"].is_file():
        for r in _read(SOURCES["itb_obligations"]).get("rows") or []:
            itb_rows.setdefault(((r.get("contractor") or "").strip(), (r.get("project") or "").strip()), r)
    for n in seed_nodes.values():
        if n["label"] == "Prime":
            p = n["props"]
            g.add_node(n["id"], "Prime", {"name": p.get("name"), "fictional": bool(p.get("fictional")),
                                          "label_text": p.get("label_text")})
        elif n["label"] == "Program":
            p = n["props"]
            g.add_node(n["id"], "Program", {
                "name": p.get("name"), "fictional": bool(p.get("fictional")), "status": p.get("status"),
                "contract_award_year": p.get("contract_award_year"),
                "estimated_timeframe": p.get("estimated_timeframe"), "source_url": p.get("source_url"),
            })
    program = _read(SOURCES["program"]) if SOURCES["program"].is_file() else {}
    if program:
        site = program.get("site") or {}
        g.add_node("prime:northgate", "Prime", {"name": program.get("prime_name"), "fictional": True,
                                                "label_text": "Fictional prime"})
        g.add_node("program:northgate", "Program", {
            "name": "Northgate demo program", "fictional": True, "status": "demo",
            "program_id": program.get("id"),
            "contract_value_cad": program.get("contract_value_cad"),
            "obligation_cad": program.get("obligation_cad"),
            "smb_target_pct": program.get("smb_target_pct"),
            "rules_label": program.get("rules_label") or "Simplified ITB rules for demo",
            "site_city": site.get("city"), "lat": site.get("lat"), "lon": site.get("lon"),
        })
    for e in seed_edges:
        if e["type"] != "PRIME_HAS_ITB_OBLIGATION":
            continue
        g.add_edge(e["source"], "HAS_PROGRAM", e["target"])
        p = dict(e.get("props") or {})
        prime_name = ((g.nodes.get(e["source"]) or {}).get("props") or {}).get("name") or ""
        prog_name = ((g.nodes.get(e["target"]) or {}).get("props") or {}).get("name") or ""
        row = itb_rows.get((prime_name.strip(), prog_name.strip()))
        if e["target"] == "program:northgate":
            value, achieved = (program.get("obligation_cad") or p.get("value")), None
        elif row is not None:
            value, achieved = row.get("obligation"), row.get("completed_to_date")
        else:
            value, achieved = p.get("value"), p.get("achieved")
        g.add_edge(e["source"], "ITB_OBLIGATION", e["target"], {
            "value": value, "achieved": achieved, "currency": p.get("currency"),
            "progress_pct": p.get("progress_pct"), "status": p.get("status"),
        })
    for e in seed_edges:
        if e["type"] == "PROGRAM_SITE_IN_REGION":
            g.add_edge(e["source"], "IN_REGION", e["target"])

    # ---- Northgate jobs (the demo parts list, tagged)
    parts = _read(SOURCES["parts"]) if SOURCES["parts"].is_file() else {}
    for j in _items(parts, "jobs"):
        jid = f"job:{j['id']}"
        g.add_node(jid, "Job", {
            "job_id": j["id"], "part_no": j.get("part_no"), "description": j.get("description"),
            "value_cad": j.get("est_value_cad"), "controlled": bool(j.get("controlled")),
            "hours_week": j.get("hours_week"), "material": j.get("material"), "qty": j.get("qty"),
            "ccv_pct": j.get("ccv_pct"),
        })
        g.add_edge("program:northgate", "HAS_JOB", jid)
        for tag in dict.fromkeys(j.get("process_tags") or []):
            g.add_edge(jid, "NEEDS_PROCESS", process(tag))
        for ctype in dict.fromkeys(j.get("required_certs") or []):
            g.add_edge(jid, "NEEDS_CERT", cert(ctype), {"via": "required_certs"})
        if j.get("controlled") and CGP not in (j.get("required_certs") or []):
            g.add_edge(jid, "NEEDS_CERT", cert(CGP), {"via": "controlled"})

    # ---- shops (synthetic + public), their processes, certs and regions
    shop_region = {e["source"]: e["target"] for e in seed_edges if e["type"] == "SHOP_IN_REGION"}
    for key, source in (("shops_synthetic", "synthetic"), ("shops_public", "public")):
        if not SOURCES[key].is_file():
            continue
        for s in _items(_read(SOURCES[key]), "shops"):
            if not isinstance(s, dict) or not s.get("id"):
                continue
            sid = f"shop:{s['id']}"
            g.add_node(sid, "Shop", _shop_props(s, source))
            for tag in dict.fromkeys(s.get("processes") or []):
                g.add_edge(sid, "HAS_PROCESS", process(tag))
            seen = set()
            for c in s.get("certifications") or []:
                ctype, status = c.get("type"), c.get("status") or "unknown"
                if not ctype or ctype in seen:
                    continue
                seen.add(ctype)  # first entry per type wins (rules.cert_status)
                if status in NOT_HELD_STATUSES:
                    continue  # unknown or lapsed (expired) = no edge (as in graph_seed)
                g.add_edge(sid, "HOLDS_CERT", cert(ctype), {
                    "status": status, "source_url": c.get("source_url"),
                    "verified_at": c.get("verified_at"), "expires_at": c.get("expires_at"),
                })
            if sid in shop_region:
                g.add_edge(sid, "IN_REGION", shop_region[sid])

    # ---- DND vendors, ODBus manufacturers and entity links
    for n in seed_nodes.values():
        if n["label"] == "DNDVendorRecord":
            p = n["props"]
            g.add_node(n["id"], "DNDVendor", {
                "name": p.get("vendor"), "vendor_key": p.get("vendor_key"), "province": p.get("province"),
                "contracts": p.get("contracts"), "value_cad": p.get("total_value"),
                "first_date": p.get("first_date"), "last_date": p.get("last_date"),
                "mfg_relevant": p.get("mfg_relevant"), "top_commodity": p.get("top_commodity"),
            })
        elif n["label"] == "Shop" and (n["props"] or {}).get("source") == "odbus":
            p = n["props"]
            odbus_id = str(p.get("shop_id") or n["id"]).split("odbus:", 1)[-1]
            g.add_node(f"mfr:{odbus_id}", "Manufacturer", {
                "odbus_id": odbus_id, "name": p.get("name"), "source": "odbus",
                "label_text": PUBLIC_LABEL, "city": p.get("city"), "province": p.get("province"),
                "lat": p.get("lat"), "lon": p.get("lon"), "naics": p.get("naics"), "naics4": p.get("naics4"),
            })

    def node_for_seed(seed_id: str) -> str:
        if seed_id.startswith("shop:odbus:"):
            return "mfr:" + seed_id.split("shop:odbus:", 1)[1]
        return seed_id

    for e in seed_edges:
        t = e["type"]
        if t == "SHOP_IN_REGION" and e["source"].startswith("shop:odbus:"):
            g.add_edge(node_for_seed(e["source"]), "IN_REGION", e["target"])
        elif t == "DND_VENDOR_IN_REGION":
            g.add_edge(e["source"], "IN_REGION", e["target"])
        elif t in ("SHOP_MATCHES_DND_VENDOR", "PRIME_MATCHES_DND_VENDOR"):
            src = node_for_seed(e["source"])
            if src.startswith("shop:pub-") and SOURCES["entity_links"].is_file():
                continue  # public shop links come from entity_links.json below
            p = e.get("props") or {}
            g.add_edge(src, "MATCHES_DND_VENDOR", e["target"], {
                "confidence": p.get("confidence"), "method": p.get("method"),
                "contracts": p.get("count"), "value_cad": p.get("value"), "last_date": p.get("last_date"),
            })

    if SOURCES["entity_links"].is_file():
        links = _read(SOURCES["entity_links"])
        for s in links.get("shops") or []:
            sid = f"shop:{s.get('shop_id')}"
            if sid not in g.nodes:
                continue
            for o in s.get("odbus") or []:
                g.add_edge(sid, "SAME_AS", f"mfr:{o.get('id')}",
                           {"confidence": o.get("confidence"), "method": o.get("method")})
            for v in s.get("dnd_vendor") or []:
                vid = f"dnd:{_slug(v.get('vendor_key') or v.get('vendor') or '')}"
                if vid not in g.nodes:
                    g.add_node(vid, "DNDVendor", {
                        "name": v.get("vendor"), "vendor_key": v.get("vendor_key"),
                        "province": v.get("province"), "contracts": v.get("contracts"),
                        "value_cad": v.get("total_value"), "first_date": v.get("first_date"),
                        "last_date": v.get("last_date"), "mfg_relevant": v.get("mfg_relevant"),
                    })
                g.add_edge(sid, "MATCHES_DND_VENDOR", vid, {
                    "confidence": v.get("confidence"), "method": v.get("method"),
                    "contracts": v.get("contracts"), "value_cad": v.get("total_value"),
                    "last_date": v.get("last_date"),
                })
    return g


def build_property_graph() -> PropertyGraph:
    """The canonical graph for the current data files (memoized by their hash)."""
    return _build(data_hash())


def resolve_id(g: PropertyGraph, node_id: str) -> str | None:
    """A node id, accepting bare ids (``syn-012`` -> ``shop:syn-012``)."""
    if node_id in g.nodes:
        return node_id
    for prefix in ID_PREFIXES:
        if prefix + node_id in g.nodes:
            return prefix + node_id
    return None


# =========================================================================== loader
CONSTRAINT_KINDS = KINDS
INDEXES = (
    ("shop_shop_id", "Shop", "shop_id"),
    ("shop_source", "Shop", "source"),
    ("shop_city", "Shop", "city"),
    ("job_job_id", "Job", "job_id"),
    ("process_name", "Process", "name"),
    ("cert_type", "Cert", "type"),
    ("region_code", "Region", "code"),
    ("occupation_noc", "Occupation", "noc"),
    ("dndvendor_key", "DNDVendor", "vendor_key"),
)
POINT_KINDS = ("Shop", "Manufacturer")
BATCH = 2000


def _chunks(rows: list, n: int = BATCH):
    for i in range(0, len(rows), n):
        yield rows[i:i + n]


def load(g: PropertyGraph | None = None, *, wipe: bool = True) -> dict:
    """Write the property graph into Neo4j: wipe, constraints + indexes, nodes (label
    ``:Node:<Kind>``, a ``location`` point on shops and manufacturers), edges, then the
    ``(:Meta {id: "meta"})`` marker. Returns ``{"nodes": {...}, "edges": {...}}`` as
    counted back from the database. Raises if Neo4j is unreachable."""
    from datetime import UTC, datetime

    g = g or build_property_graph()
    if wipe:
        run("MATCH (n) CALL (n) { DETACH DELETE n } IN TRANSACTIONS OF 5000 ROWS", timeout=120)
    run("CREATE CONSTRAINT node_id IF NOT EXISTS FOR (n:Node) REQUIRE n.id IS UNIQUE")
    for kind in CONSTRAINT_KINDS:
        run(f"CREATE CONSTRAINT {kind.lower()}_id IF NOT EXISTS FOR (n:{kind}) REQUIRE n.id IS UNIQUE")
    for name, kind, prop in INDEXES:
        run(f"CREATE INDEX {name} IF NOT EXISTS FOR (n:{kind}) ON (n.{prop})")
    for kind in POINT_KINDS:
        run(f"CREATE POINT INDEX {kind.lower()}_location IF NOT EXISTS FOR (n:{kind}) ON (n.location)")
    run("CALL db.awaitIndexes(60)", timeout=90)

    by_kind: dict[str, list[dict]] = {}
    for n in g.nodes.values():
        by_kind.setdefault(n["kind"], []).append({"p": n["props"]})
    for kind, rows in by_kind.items():
        point = (
            " WITH n WHERE n.lat IS NOT NULL AND n.lon IS NOT NULL"
            " SET n.location = point({latitude: n.lat, longitude: n.lon})"
            if kind in POINT_KINDS else ""
        )
        for chunk in _chunks(rows):
            run(
                f"UNWIND $rows AS r CREATE (n:Node:{kind}) SET n = r.p, n.kind = '{kind}'{point}",
                {"rows": chunk}, timeout=120,
            )
    by_type: dict[str, list[dict]] = {}
    for e in g.edges:
        by_type.setdefault(e["type"], []).append({"s": e["source"], "t": e["target"], "p": e["props"]})
    for etype, rows in by_type.items():
        for chunk in _chunks(rows):
            run(
                "UNWIND $rows AS r MATCH (a:Node {id: r.s}) MATCH (b:Node {id: r.t}) "
                f"CREATE (a)-[x:{etype}]->(b) SET x = r.p",
                {"rows": chunk}, timeout=120,
            )
    loaded_at = datetime.now(UTC).isoformat(timespec="seconds")
    run(
        "MERGE (m:Meta {id: 'meta'}) SET m.data_hash = $h, m.loaded_at = $at, "
        "m.builder_version = $v",
        {"h": g.data_hash, "at": loaded_at, "v": BUILDER_VERSION},
    )
    reset_availability()
    return counts_neo4j()


def counts_neo4j() -> dict:
    nodes = {r["k"]: r["c"] for r in run("MATCH (n:Node) RETURN n.kind AS k, count(*) AS c")}
    edges = {r["t"]: r["c"] for r in run("MATCH (:Node)-[r]->(:Node) RETURN type(r) AS t, count(*) AS c")}
    return {"nodes": dict(sorted(nodes.items())), "edges": dict(sorted(edges.items()))}


def ensure_loaded() -> bool:
    """Load the graph only if Neo4j is reachable and its Meta hash differs from the
    current data (so concurrent readers are not disturbed by a needless wipe). Returns
    True when a loaded, current graph is available afterwards."""
    if not reachable():
        return False
    m = _probe_meta()
    if not m or m.get("data_hash") != build_property_graph().data_hash:
        load()
    return available(force=True)
