"""Search + graph views (docs/api.md §7): Neo4j when available, in-memory otherwise.

- ``search_shops``: shops that have the requested processes and certifications (statuses
  that count: verified / declared / pending_training), optionally near a city, by source
  and by DND contract history. On Neo4j it is one Cypher query over the loaded graph
  (``engine.graphdb``) with the current funding overrides passed as a parameter; in memory
  it is set algebra on ``engine.graph.CapabilityGraph`` over the State's effective shops
  plus the discovered public shops. Both paths feed the same Python finisher (match lists,
  score, order), so they return the same shops in the same order.
- ``search_jobs``: which jobs one shop can do right now, from the current State through
  ``engine.pipeline`` / ``engine.gaps`` (not Neo4j: offers change with every action),
  plus near misses and a sample of open defence tenders (CanadaBuys, OGL).
- ``graph_summary`` / ``graph_ego``: node / edge counts and a node's neighbourhood, from
  Neo4j or from the same property graph in memory (identical shapes and content).

Public shops are listed but always ``onboarding: "discovered"``, ``routable: false``.
Nothing here changes the State.
"""

from __future__ import annotations

import json
import logging
import math
import re
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from engine import gaps as gaps_mod
from engine import graphdb, pipeline, shopside
from engine import ledger as ledger_mod
from engine import public as public_mod
from engine import rules as rules_mod
from engine import scoring as scoring_mod
from engine.graph import CapabilityGraph
from engine.rules import (
    CERT_LABEL,
    OPERATOR_CERT_LABEL,
    PROCESS_LABEL,
    cert_label,
    process_label,
)

log = logging.getLogger(__name__)

SOURCES = ("synthetic", "public")
DEFAULT_RADIUS_KM = 100.0
NEO4J_EARTH_M = 6378140.0  # point.distance() on WGS-84 is haversine with this radius
PY_EARTH_M = 6371000.0  # engine.scoring.haversine_km
PROCESS_ORDER = {p: i for i, p in enumerate(PROCESS_LABEL)}
CERT_ORDER = {c: i for i, c in enumerate(CERT_LABEL)}
CONFIDENCE_RANK = {"high": 0, "medium": 1, "low": 2}
KIND_ORDER = {k: i for i, k in enumerate(
    ("Prime", "Program", "Job", "Shop", "Process", "Cert", "Region", "Occupation", "DNDVendor",
     "Manufacturer"))}
TENDERS_FILE = graphdb.PROCESSED / "tenders_defence.json"
TENDER_SOURCE = ("CanadaBuys open tender notices (Open Government Licence); sample retrieved 2026-09-26. "
                 "Matched by category and title; notices that buy equipment or off-the-shelf hardware, "
                 "and notices past their closing time, are left out.")
DND_SOURCE = ("DND contracts over $10K (proactive disclosure, Open Government Licence); "
              "name match, unverified")
PROCESS_ALIASES = {
    "cnc": "cnc_milling", "milling": "cnc_milling", "machining": "cnc_milling",
    "turning": "cnc_turning", "lathe": "cnc_turning", "5_axis": "five_axis_milling",
    "5axis": "five_axis_milling", "5_axis_milling": "five_axis_milling", "weld": "welding",
    "fabrication": "welding", "heat_treating": "heat_treat", "paint": "painting",
    "harness": "wire_harness", "electronics": "electronics_assembly",
    "cnc_machining": "cnc_milling", "machinist": "cnc_milling",
    "cable_harness": "wire_harness", "cable_assembly": "wire_harness", "cabling": "wire_harness",
    "wiring": "wire_harness", "box_build": "electronics_assembly", "pcba": "electronics_assembly",
    "electronics_subassembly": "electronics_assembly", "electronic_subassembly": "electronics_assembly",
    "electronics_subassemblies": "electronics_assembly",
}
CERT_ALIASES = {
    "CWB": "CWB_W47.1", "W47.1": "CWB_W47.1", "CWBW47.1": "CWB_W47.1", "CSAW47.1": "CWB_W47.1",
    "CPCSC": "CPCSC_L1", "CPCSCL1": "CPCSC_L1", "ISO": "ISO9001", "ISO9001": "ISO9001",
    "AS9100D": "AS9100", "IPC610": "IPC_A_610", "IPCA610": "IPC_A_610", "A610": "IPC_A_610",
    "JSTD001": "IPC_J_STD_001", "IPCJSTD001": "IPC_J_STD_001", "IPC/WHMAA620": "IPC_WHMA_A_620",
    "WHMAA620": "IPC_WHMA_A_620", "IPCA620": "IPC_WHMA_A_620", "IPC620": "IPC_WHMA_A_620",
}
# Tender categories that fit a shop's processes (sample categories in tenders_defence.json).
TENDER_CATEGORY = {
    "electrical_harness": {"wire_harness", "electronics_assembly"},
    "machining_welding_fabrication": {
        "cnc_milling", "five_axis_milling", "cnc_turning", "sheet_metal", "welding", "heat_treat",
        "anodizing", "plating", "painting", "fasteners",
    },
}


class SearchError(Exception):
    """A client error: ``status`` (400 / 404) and a readable ``detail``."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


# =========================================================================== helpers
def engine_name() -> str:
    """"neo4j" when the graph database is reachable and loaded, else "memory"."""
    return "neo4j" if graphdb.available() else "memory"


def _norm(text: str) -> str:
    return "_".join(text.strip().lower().replace("-", " ").replace("/", " ").split())


def normalize_process(raw: str) -> str:
    key = _norm(raw)
    if key in PROCESS_LABEL:
        return key
    for tag, label in PROCESS_LABEL.items():
        if _norm(label) == key:
            return tag
    if key in PROCESS_ALIASES:
        return PROCESS_ALIASES[key]
    raise SearchError(400, f"Unknown process '{raw}'; one of: {', '.join(PROCESS_LABEL)}")


def normalize_cert(raw: str) -> str:
    key = raw.strip()
    upper = key.upper()
    labels = {**CERT_LABEL, **OPERATOR_CERT_LABEL}
    for ctype in labels:
        if upper == ctype.upper():
            return ctype
    squashed = upper.replace(" ", "").replace("-", "").replace("_", "")
    for ctype, label in labels.items():
        if squashed in (
            ctype.upper().replace("_", ""),
            label.upper().replace(" ", "").replace("-", ""),
        ):
            return ctype
    if squashed in CERT_ALIASES:
        return CERT_ALIASES[squashed]
    if upper.startswith("NADCAP"):
        tail = squashed.removeprefix("NADCAP").lstrip(":")
        for ctype in CERT_LABEL:
            if ctype.startswith("NADCAP:") and ctype.split(":", 1)[1].replace("_", "") == tail:
                return ctype
    raise SearchError(400, f"Unknown certification '{raw}'; one of: {', '.join(CERT_LABEL)}")


def _ordered_unique(values, order: dict[str, int]) -> list[str]:
    return sorted(dict.fromkeys(values), key=lambda v: (order.get(v, len(order)), v))


def _haversine(lat1, lon1, lat2, lon2) -> float:
    return scoring_mod.haversine_km(float(lat1), float(lon1), float(lat2), float(lon2))


@lru_cache(maxsize=4)
def _city_table(hash_key: str) -> dict[str, tuple[float, float, str]]:
    """lower-case city -> (lat, lon, display name): the program site, then the mean of
    every synthetic / public shop in that city (deterministic, from the property graph)."""
    g = graphdb.build_property_graph()
    acc: dict[str, list] = {}
    for n in g.nodes.values():
        p = n["props"]
        if n["kind"] != "Shop" or p.get("lat") is None or not p.get("city"):
            continue
        a = acc.setdefault(p["city"].strip().lower(), [0.0, 0.0, 0, p["city"].strip()])
        a[0] += float(p["lat"])
        a[1] += float(p["lon"])
        a[2] += 1
    out = {k: (round(a[0] / a[2], 5), round(a[1] / a[2], 5), a[3]) for k, a in sorted(acc.items())}
    prog = g.nodes.get("program:northgate")
    if prog and prog["props"].get("site_city") and prog["props"].get("lat") is not None:
        p = prog["props"]
        out[p["site_city"].strip().lower()] = (float(p["lat"]), float(p["lon"]), p["site_city"])
    return out


def resolve_near(near: str) -> tuple[float, float, str]:
    """A city name (from the program site / shop cities) or ``"lat,lon"``."""
    text = near.strip()
    parts = [x.strip() for x in text.split(",")]
    if len(parts) == 2:
        try:
            lat, lon = float(parts[0]), float(parts[1])
        except ValueError:
            pass
        else:
            if -90 <= lat <= 90 and -180 <= lon <= 180:
                return lat, lon, f"{lat:g},{lon:g}"
            raise SearchError(400, "near: latitude/longitude out of range")
    table = _city_table(graphdb.build_property_graph().data_hash)
    hit = table.get(text.lower()) or table.get(text.lower().split(",")[0].strip())
    if hit is None:
        names = ", ".join(sorted(v[2] for v in table.values()))
        raise SearchError(400, f"Unknown city '{near}'; known cities: {names} (or pass 'lat,lon')")
    return hit


# =========================================================================== shop search
class ShopQuery:
    """Validated, normalized /search/shops parameters (hashable ``key`` for the cache)."""

    def __init__(
        self,
        q: str | None = None,
        processes: list[str] | None = None,
        certs: list[str] | None = None,
        near: str | None = None,
        radius_km: float | None = None,
        source: str = "all",
        dnd_history: bool | None = None,
        match: str = "all",
        limit: int = 25,
    ):
        self.q = (q or "").strip() or None
        self.processes = list(dict.fromkeys(normalize_process(p) for p in processes or [] if p.strip()))
        self.certs = list(dict.fromkeys(normalize_cert(c) for c in certs or [] if c.strip()))
        src = (source or "all").strip().lower()
        if src not in ("all", *SOURCES):
            raise SearchError(400, "source must be one of: all, synthetic, public")
        self.source = src
        self.sources = list(SOURCES) if src == "all" else [src]
        m = (match or "all").strip().lower()
        if m not in ("all", "any"):
            raise SearchError(400, "match must be 'all' or 'any'")
        self.match = m
        self.dnd_history = dnd_history
        if not isinstance(limit, int) or not 1 <= limit <= 200:
            raise SearchError(400, "limit must be between 1 and 200")
        self.limit = limit
        self.center: tuple[float, float, str] | None = None
        self.radius_km: float | None = None
        if near and near.strip():
            self.center = resolve_near(near)
            self.radius_km = float(radius_km) if radius_km is not None else DEFAULT_RADIUS_KM
            if not 0 < self.radius_km <= 5000:
                raise SearchError(400, "radius_km must be between 0 and 5000")
        elif radius_km is not None:
            raise SearchError(400, "radius_km needs near=<city>")

    @property
    def need(self) -> int:
        return len(self.processes) + len(self.certs)

    def key(self) -> tuple:
        return (self.q and self.q.lower(), tuple(self.processes), tuple(self.certs), self.center,
                self.radius_km, self.source, self.dnd_history, self.match, self.limit)

    def echo(self) -> dict:
        return {
            "q": self.q,
            "process": self.processes,
            "cert": self.certs,
            "near": self.center[2] if self.center else None,
            "near_lat": self.center[0] if self.center else None,
            "near_lon": self.center[1] if self.center else None,
            "radius_km": self.radius_km,
            "source": self.source,
            "dnd_history": self.dnd_history,
            "match": self.match,
            "limit": self.limit,
        }


def _counting(state: Any) -> tuple[str, ...]:
    return rules_mod.counting_statuses(pipeline.config(state).get("filters"))


def _overrides(state: Any) -> dict[str, dict]:
    """``{shop_id: {cert_type: {"status", "source_url"}}}`` for the certs funding changed
    (State.cert_overrides applied as engine.pipeline.effective_shop does)."""
    out: dict[str, dict] = {}
    for sid, by_type in (getattr(state, "cert_overrides", None) or {}).items():
        if sid not in state.shops or not by_type:
            continue
        eff = pipeline.effective_shop(state, sid)
        certs: dict[str, dict] = {}
        for c in eff.get("certifications") or []:
            if c.get("type") in by_type and c["type"] not in certs:
                certs[c["type"]] = {"status": c.get("status") or "unknown", "source_url": c.get("source_url")}
        out[sid] = certs
    return out


def _memory_records(state: Any) -> list[dict]:
    """Every searchable shop: State shops (funding applied), then the public shops."""
    g = graphdb.build_property_graph()
    dnd: dict[str, list[dict]] = {}
    for e in g.edges:
        if e["type"] == "MATCHES_DND_VENDOR" and e["source"].startswith("shop:"):
            dnd.setdefault(e["source"][5:], []).append(dict(e["props"]))
    region = {e["source"][5:]: e["target"] for e in g.edges
              if e["type"] == "IN_REGION" and e["source"].startswith("shop:")}
    out = []
    for sid in state.shops:
        s = pipeline.effective_shop(state, sid)
        out.append(_record(s, s.get("source") or "synthetic", s.get("certifications") or [], dnd, region))
    seen = set(state.shops)
    for s in public_mod.shops():
        if s["id"] not in seen:
            out.append(_record(s, "public", s.get("cert_summary") or [], dnd, region))
    return out


def _record(s: dict, source: str, certs: list[dict], dnd: dict, region: dict) -> dict:
    held: dict[str, dict] = {}
    for c in certs:
        ctype = c.get("type")
        if ctype and ctype not in held:
            held[ctype] = {"status": c.get("status") or "unknown", "source_url": c.get("source_url")}
    return {
        "shop_id": s["id"],
        "name": s.get("name"),
        "source": source,
        "city": s.get("city"),
        "lat": s.get("lat"),
        "lon": s.get("lon"),
        "is_sme": bool(s.get("is_sme")),
        "processes": list(s.get("processes") or []),
        "certs": held,
        "dnd": dnd.get(s["id"], []),
        "max_envelope_mm": s.get("max_envelope_mm"),
    }


def _memory_search(state: Any, sq: ShopQuery) -> list[dict]:
    counting = _counting(state)
    records = [r for r in _memory_records(state) if r["source"] in sq.sources]
    cg = CapabilityGraph(
        {r["shop_id"]: {"processes": r["processes"], "max_envelope_mm": r["max_envelope_mm"],
                        "certifications": [{"type": t, "status": v["status"]} for t, v in r["certs"].items()]}
         for r in records},
        counting,
    )
    q = sq.q.lower() if sq.q else None
    out = []
    for r in records:
        sid = r["shop_id"]
        if q and q not in (r["name"] or "").lower() and q not in (r["city"] or "").lower():
            continue
        if sq.center is not None:
            if r["lat"] is None or r["lon"] is None:
                continue
            if _haversine(sq.center[0], sq.center[1], r["lat"], r["lon"]) > sq.radius_km:
                continue
        if sq.dnd_history is not None and bool(r["dnd"]) != sq.dnd_history:
            continue
        ok = sum(1 for p in sq.processes if sid in cg.process_index.get(p, ()))
        ok += sum(1 for c in sq.certs if sid in cg.holders(c))
        if sq.match == "all" and ok != sq.need:
            continue
        if sq.match == "any" and sq.need and not ok:
            continue
        out.append(r)
    return out


SHOP_CYPHER = """
MATCH (s:Shop)
WHERE s.source IN $sources
  AND ($q IS NULL OR toLower(s.name) CONTAINS $q OR toLower(s.city) CONTAINS $q)
  AND ($center IS NULL OR (s.location IS NOT NULL
       AND point.distance(s.location, $center) <= $radius_m))
  AND ($dnd IS NULL OR EXISTS { (s)-[:MATCHES_DND_VENDOR]->(:DNDVendor) } = $dnd)
WITH s,
  size([p IN $processes WHERE EXISTS { (s)-[:HAS_PROCESS]->(:Process {name: p}) }]) +
  size([c IN $certs WHERE
        CASE WHEN $ov[s.shop_id + '|' + c] IS NOT NULL
             THEN $ov[s.shop_id + '|' + c] IN $counting
             ELSE EXISTS { (s)-[h:HOLDS_CERT]->(:Cert {type: c}) WHERE h.status IN $counting }
        END]) AS ok
WHERE ($mode = 'all' AND ok = $need) OR ($mode = 'any' AND ($need = 0 OR ok > 0))
RETURN s.shop_id AS shop_id, s.name AS name, s.source AS source, s.city AS city,
       s.lat AS lat, s.lon AS lon, s.is_sme AS is_sme,
       [(s)-[:HAS_PROCESS]->(p:Process) | p.name] AS processes,
       [(s)-[h:HOLDS_CERT]->(c:Cert) | {type: c.type, status: h.status, source_url: h.source_url}] AS certs,
       [(s)-[m:MATCHES_DND_VENDOR]->(:DNDVendor) | m {.confidence, .method, .contracts, .value_cad,
                                                     .last_date}] AS dnd
"""


def _neo4j_search(state: Any, sq: ShopQuery) -> list[dict]:
    ov = _overrides(state)
    params = {
        "sources": sq.sources,
        "q": sq.q.lower() if sq.q else None,
        "center": None,
        "radius_m": None,
        "dnd": sq.dnd_history,
        "processes": sq.processes,
        "certs": sq.certs,
        "counting": list(_counting(state)),
        "ov": {f"{sid}|{t}": v["status"] for sid, by in ov.items() for t, v in by.items()},
        "mode": sq.match,
        "need": sq.need,
    }
    query = SHOP_CYPHER
    if sq.center is not None:
        from neo4j.spatial import WGS84Point

        params["center"] = WGS84Point((sq.center[1], sq.center[0]))
        params["radius_m"] = sq.radius_km * 1000.0 * NEO4J_EARTH_M / PY_EARTH_M
    out = []
    for row in graphdb.run(query, params):
        held: dict[str, dict] = {}
        for c in row["certs"] or []:
            if c.get("type") and c["type"] not in held:
                held[c["type"]] = {"status": c.get("status") or "unknown", "source_url": c.get("source_url")}
        for t, v in ov.get(row["shop_id"], {}).items():
            held[t] = dict(v)
        out.append({
            "shop_id": row["shop_id"], "name": row["name"], "source": row["source"],
            "city": row["city"], "lat": row["lat"], "lon": row["lon"], "is_sme": bool(row["is_sme"]),
            "processes": list(row["processes"] or []), "certs": held,
            "dnd": [dict(d) for d in row["dnd"] or []],
        })
    return out


def _dnd_history(links: list[dict]) -> dict | None:
    """Best-confidence DND vendor match(es) summed; null without any match."""
    if not links:
        return None
    best = min(CONFIDENCE_RANK.get(d.get("confidence"), 9) for d in links)
    top = [d for d in links if CONFIDENCE_RANK.get(d.get("confidence"), 9) == best]
    return {
        "contracts": sum(int(d.get("contracts") or 0) for d in top),
        "value_cad": round(sum(float(d.get("value_cad") or 0) for d in top), 2),
        "last_date": max((d.get("last_date") or "" for d in top), default="") or None,
        "confidence": top[0].get("confidence"),
        "links": len(links),
        "source": DND_SOURCE,
    }


def _finish(records: list[dict], sq: ShopQuery, counting: tuple[str, ...]) -> list[dict]:
    rows = []
    for r in records:
        certs = [
            {"type": t, "status": r["certs"][t]["status"], "source_url": r["certs"][t]["source_url"]}
            for t in _ordered_unique([t for t, v in r["certs"].items() if v["status"] != "unknown"], CERT_ORDER)
        ]
        matched, missing = [], []
        procs = set(r["processes"])
        for p in sq.processes:
            (matched if p in procs else missing).append(process_label(p))
        for c in sq.certs:
            v = r["certs"].get(c)
            if v and v["status"] in counting:
                matched.append(f"{cert_label(c)} ({v['status'].replace('_', ' ')})")
            else:
                missing.append(cert_label(c))
        dist = None
        prox = 0.0
        if sq.center is not None and r["lat"] is not None:
            d = _haversine(sq.center[0], sq.center[1], r["lat"], r["lon"])
            dist = round(d, 1)
            prox = max(0.0, 1.0 - d / sq.radius_km)
        fit = len(matched) / sq.need if sq.need else 1.0
        public = r["source"] == "public"
        score = round(0.7 * fit + 0.2 * prox + (0.0 if public else 0.1), 4)
        rows.append({
            "shop_id": r["shop_id"],
            "name": r["name"],
            "source": r["source"],
            "label": public_mod.LABEL if public else "Synthetic",
            "onboarding": "discovered" if public else "onboarded",
            "routable": not public,
            "city": r["city"],
            "lat": r["lat"],
            "lon": r["lon"],
            "distance_km": dist,
            "is_sme": r["is_sme"],
            "processes": _ordered_unique(r["processes"], PROCESS_ORDER),
            "certs": certs,
            "dnd_history": _dnd_history(r["dnd"]),
            "match": {"matched": matched, "missing": missing},
            "score": score,
        })
    rows.sort(key=lambda x: (
        -x["score"],
        x["distance_km"] if x["distance_km"] is not None else math.inf,
        0 if x["source"] == "synthetic" else 1,
        (x["name"] or "").lower(),
        x["shop_id"],
    ))
    return rows


def search_shops(state: Any, sq: ShopQuery, engine: str | None = None) -> dict:
    """``GET /search/shops``: see docs/api.md §7."""
    engine = engine or engine_name()
    records = None
    if engine == "neo4j":
        try:
            records = _neo4j_search(state, sq)
        except Exception as exc:  # noqa: BLE001 - never fail a search because Neo4j did
            log.warning("neo4j shop search failed (%s); using memory", type(exc).__name__)
            graphdb.mark_down()
            engine = "memory"
    if records is None:
        records = _memory_search(state, sq)
    rows = _finish(records, sq, _counting(state))
    return {
        "engine": engine,
        "query": sq.echo(),
        "counts": {
            "total": len(rows),
            "synthetic": sum(1 for r in rows if r["source"] == "synthetic"),
            "public": sum(1 for r in rows if r["source"] == "public"),
        },
        "results": rows[: sq.limit],
        "notes": [
            "Synthetic shops are Shieldworks' fictional demo shops.",
            ("Public shops: Public data — unverified — not affiliated. Discovered, not onboarded: "
             "never offered work."),
            ("Certifications count when verified, declared or pending training "
             "(Simplified ITB rules for demo)."),
        ],
    }


def shop_ids(result: dict) -> list[str]:
    return [r["shop_id"] for r in result["results"]]


# =========================================================================== job search
@lru_cache(maxsize=2)
def _tenders(path: str) -> tuple[dict, ...]:
    try:
        doc = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return ()
    return tuple(doc.get("sample") or [])


# Same patterns as web/components/search/work-tenders.ts: a notice a small shop could make or
# supply parts for, versus one that buys a machine or off-the-shelf hardware.
TENDER_PARTS = re.compile(
    r"\b(spare parts?|repair parts?|spares?|components?|assembl(y|ies)|weldments?|fabricat\w*|brackets?|"
    r"enclosures?|frames?|harness(es)?|cables?)\b", re.IGNORECASE)
TENDER_EQUIPMENT = re.compile(
    r"\b(lathes?|milling machines?|engravers?|machines?|machinery|equipment|drones?|quadcopters?|trucks?|"
    r"cranes?|trailers?|pump units?|treatment cent(er|re)s?|power supply|ups)\b", re.IGNORECASE)
TENDER_STOCK = re.compile(r"\b(washers?|o-rings?|gaskets?|tires?|tyres?|batter(y|ies))\b", re.IGNORECASE)
TENDER_STOCK_MADE = re.compile(r"\b(weldments?|fabricat\w*|brackets?|frames?)\b", re.IGNORECASE)
TENDER_SPARES = re.compile(r"\b(spare parts?|spares?|repair parts?)\b", re.IGNORECASE)


def tender_kind(title: str | None) -> str:
    """``fits`` (parts a shop could make or supply), ``equipment`` or ``stock``."""
    title = title or ""
    if TENDER_EQUIPMENT.search(title) and not TENDER_PARTS.search(title):
        return "equipment"
    if TENDER_STOCK.search(title) and not TENDER_STOCK_MADE.search(title):
        return "stock"
    return "fits"


# Ontario delivery regions in the sample are sometimes a city, not the province.
TENDER_ONTARIO = re.compile(
    r"\b(ontario|belleville|london|toronto|hamilton|barrie|kingston|petawawa|north bay|thunder bay|"
    r"ottawa|kitchener|waterloo|woolwich)\b", re.IGNORECASE)
TENDER_MIN_OPEN = 3  # fewer open notices than this: also list the most recently closed ones


def tender_now() -> datetime:
    """Now as a naive local datetime (the notices' closing times are local, with no zone).
    scripts/build_search_fixtures.py pins it so the saved demo answer is deterministic."""
    return datetime.now(UTC).astimezone().replace(tzinfo=None)


def tender_closes_at(value: str | None) -> datetime | None:
    """A notice's closing time as a naive local datetime (the sample has no time zone). A
    date-only value is open through 23:59 that day. None when missing or unreadable."""
    if not value:
        return None
    text = str(value).strip()
    try:
        if len(text) == 10:
            return datetime.fromisoformat(text).replace(hour=23, minute=59, second=59)
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt.astimezone().replace(tzinfo=None) if dt.tzinfo else dt


def tender_in_ontario(region: str | None) -> bool:
    return bool(TENDER_ONTARIO.search(region or ""))


def tender_epoch(now: datetime | None = None) -> int:
    """How many sample notices have closed by ``now``: part of the /search/jobs cache key, so
    a memoized answer never keeps listing a notice as open after it closes."""
    now = now or tender_now()
    return sum(1 for t in _tenders(str(TENDERS_FILE))
               if (c := tender_closes_at(t.get("closing_date"))) is not None and c < now)


def tenders_for(processes: list[str], q: str | None, limit: int = 5,
                now: datetime | None = None) -> list[dict]:
    """Open defence tenders (CanadaBuys sample) for parts a shop with these processes could make
    or supply: in a fitting category (for machining/welding/fabrication, also vehicle and vessel
    "spare parts" notices), or, when ``q`` is set, whose title contains ``q``. Equipment purchases
    and off-the-shelf hardware are left out, and so are notices past their closing time
    (``now``, local). Ontario first (a province or an Ontario city), then soonest closing.

    When fewer than ``TENDER_MIN_OPEN`` are still open, the most recently closed matches follow,
    marked ``closed: true`` (at most enough to make ``TENDER_MIN_OPEN`` rows)."""
    procs = set(processes)
    cats = {cat for cat, fits in TENDER_CATEGORY.items() if procs & fits}
    ql = (q or "").strip().lower()
    now = now or tender_now()
    open_, closed = [], []
    for t in _tenders(str(TENDERS_FILE)):
        title = t.get("title") or ""
        if tender_kind(title) != "fits":
            continue
        if ql:
            if ql not in title.lower():
                continue
        else:
            tcats = set(t.get("categories") or []) | {t.get("category")}
            spares = ("machining_welding_fabrication" in cats and "vehicles_vessels_aircraft" in tcats
                      and bool(TENDER_SPARES.search(title)))
            if not (tcats & cats) and not spares:
                continue
        closes = tender_closes_at(t.get("closing_date"))
        is_closed = closes is not None and closes < now
        row = {
            "title": t.get("title"),
            "reference": t.get("reference_number") or t.get("solicitation_number"),
            "solicitation_number": t.get("solicitation_number"),
            "closing_date": t.get("closing_date"),
            "buyer": t.get("buyer"),
            "category": t.get("category"),
            "notice_type": t.get("notice_type"),
            "region": t.get("region"),
            "url": t.get("url"),
            "closed": is_closed,
        }
        (closed if is_closed else open_).append(row)
    open_.sort(key=lambda t: (0 if tender_in_ontario(t["region"]) else 1,
                              t["closing_date"] or "", t["reference"] or ""))
    out = open_[:limit]
    if len(out) < TENDER_MIN_OPEN:
        closed.sort(key=lambda t: (t["closing_date"] or "", t["reference"] or ""), reverse=True)
        out += closed[:TENDER_MIN_OPEN - len(out)]
    return out


def _job_matches(job: dict, q: str | None, processes: list[str]) -> bool:
    if processes and not set(processes) & set(job.get("process_tags") or []):
        return False
    if q:
        ql = q.lower()
        hay = " ".join(str(job.get(k) or "") for k in ("id", "part_no", "description", "material")).lower()
        if ql not in hay:
            return False
    return True


def _missing_message(kind: str, req: str, status: str | None) -> str:
    if kind == "cert":
        now = f" (now: {status.replace('_', ' ')})" if status else ""
        return f"Get {cert_label(req)}{now}"
    if kind == "process":
        return f"Add {process_label(req)}"
    return f"Add {process_label(req)} capacity"


def search_jobs(
    state: Any,
    shop_id: str,
    q: str | None = None,
    processes: list[str] | None = None,
    include_near_miss: bool = True,
    max_missing: int = 2,
) -> dict:
    """``GET /search/jobs``: see docs/api.md §7. SearchError 404 for an unknown shop."""
    procs = list(dict.fromkeys(normalize_process(p) for p in processes or [] if p.strip()))
    q = (q or "").strip() or None
    base = {"engine": "memory", "shop_id": shop_id, "query": {"q": q, "process": procs,
                                                              "include_near_miss": include_near_miss}}
    if shop_id not in state.shops:
        if public_mod.is_public_id(shop_id) and shop_id in public_mod.ids():
            shop = next(s for s in public_mod.shops() if s["id"] == shop_id)
            return {**base, "routable": False, "notice": public_mod.NOTICE, "eligible": [],
                    "near_miss": [], "tenders": tenders_for(shop.get("processes") or [], q),
                    "tenders_source": TENDER_SOURCE}
        raise SearchError(404, f"Unknown shop '{shop_id}'")

    eligible, near = [], []
    if state.jobs:
        ctx = pipeline.Context(state)
        reoffered = shopside.reoffers(state)
        shop = ctx.shops[shop_id]
        category = "sme_direct" if shop.get("is_sme") else "regular"
        mult = ctx.mults[category]
        for jid in ctx.job_order:
            job = ctx.jobs[jid]
            if not _job_matches(job, q, procs):
                continue
            value = round(float(job["est_value_cad"]), 2)
            cands = ctx.graph.candidates(job)
            if shop_id in cands:
                a = state.assignments.get(jid)
                moved = reoffered.get(jid)
                row = {"job_id": jid, "part_no": job["part_no"], "description": job["description"],
                       "value_cad": value, "hours_week": job["hours_week"],
                       "process_tags": list(job.get("process_tags") or []),
                       "controlled": bool(job.get("controlled"))}
                if a and moved and moved["shop_id"] == shop_id:
                    # Re-offered to this shop after another declined it (demo): the credit
                    # stays the one counted when the job was placed.
                    rec = (state.offer_decisions or {}).get(f"{shop_id}:{jid}")
                    row.update(credit_cad=a["credit_cad"], multiplier=a["multiplier"],
                               reasons=scoring_mod.reasons(job, shop, ctx.dist[shop_id], len(cands), ctx.program),
                               status="offered_to_you", offer_status=shopside.decision_status(rec),
                               reoffered_from=(moved.get("payload") or {}).get("from_shop_id"))
                elif a and a["shop_id"] == shop_id:
                    row.update(credit_cad=a["credit_cad"], multiplier=a["multiplier"],
                               reasons=list(a["reasons"]), status="offered_to_you",
                               offer_status=a.get("status"))
                else:
                    row.update(
                        credit_cad=ledger_mod.credit(value, job["ccv_pct"], mult),
                        multiplier=mult,
                        reasons=scoring_mod.reasons(job, shop, ctx.dist[shop_id], len(cands), ctx.program),
                        status="assigned_elsewhere" if a else "open",
                        offer_status=None,
                    )
                eligible.append(row)
            elif include_near_miss:
                reqs, env_fail = gaps_mod.requirements(ctx, shop_id, job)
                reqs = {r for r in reqs if r[0] != "capacity"}  # eligibility ignores capacity
                if env_fail or not reqs or len(reqs) > max_missing:
                    continue
                order = {"cert": 0, "process": 1}
                missing = [
                    {"kind": kind, "requirement": req,
                     "message": _missing_message(kind, req, ctx.graph.cert_status(shop_id, req)
                                                 if kind == "cert" else None)}
                    for kind, req in sorted(reqs, key=lambda r: (order.get(r[0], 9), r[1]))
                ]
                near.append({"job_id": jid, "part_no": job["part_no"], "description": job["description"],
                             "value_cad": value, "hours_week": job["hours_week"],
                             "status": "assigned_elsewhere" if jid in state.assignments else "open",
                             "missing": missing})
        pos = {j: i for i, j in enumerate(ctx.job_order)}
        near.sort(key=lambda n: (len(n["missing"]), -n["value_cad"], pos[n["job_id"]]))
        shop_procs = list(shop.get("processes") or [])
    else:
        shop_procs = list(state.shops[shop_id].get("processes") or [])
    status_order = {"offered_to_you": 0, "open": 1, "assigned_elsewhere": 2}
    eligible.sort(key=lambda r: status_order[r["status"]])  # stable: job order within a status
    return {
        **base,
        "routable": True,
        "stage": state.stage,
        "counts": {
            "eligible": len(eligible),
            "offered_to_you": sum(1 for r in eligible if r["status"] == "offered_to_you"),
            "open": sum(1 for r in eligible if r["status"] == "open"),
            "assigned_elsewhere": sum(1 for r in eligible if r["status"] == "assigned_elsewhere"),
            "near_miss": len(near),
        },
        "eligible": eligible,
        "near_miss": near,
        "tenders": tenders_for(shop_procs, q),
        "tenders_source": TENDER_SOURCE,
    }


# =========================================================================== graph views
def _display(kind: str, props: dict) -> str:
    if kind == "Job":
        return f"{props.get('job_id')} · {props.get('description')}"
    if kind in ("Process", "Cert"):
        return props.get("label") or props.get("name") or props.get("type") or props["id"]
    return props.get("name") or props.get("type") or props["id"]


def _node_out(nid: str, kind: str, props: dict) -> dict:
    clean = {k: v for k, v in sorted(props.items()) if k not in ("id", "kind", "location")}
    return {"id": nid, "type": kind, "label": _display(kind, {**props, "id": nid}), "props": clean}


def graph_summary(engine: str | None = None) -> dict:
    """``GET /graph/summary``: node counts by kind, edge counts by type."""
    engine = engine or engine_name()
    if engine == "neo4j":
        try:
            c = graphdb.counts_neo4j()
            nodes, edges = c["nodes"], c["edges"]
        except Exception as exc:  # noqa: BLE001
            log.warning("neo4j summary failed (%s); using memory", type(exc).__name__)
            graphdb.mark_down()
            engine = "memory"
    if engine == "memory":
        nodes, edges = graphdb.build_property_graph().summary()
    return {
        "engine": engine,
        "nodes": nodes,
        "edges": edges,
        "totals": {"nodes": sum(nodes.values()), "edges": sum(edges.values())},
    }


class _MemoryAccess:
    def __init__(self):
        self.g = graphdb.build_property_graph()

    def resolve(self, node_id: str) -> str | None:
        return graphdb.resolve_id(self.g, node_id)

    def kinds(self, ids: list[str]) -> dict[str, str]:
        return {i: self.g.nodes[i]["kind"] for i in ids if i in self.g.nodes}

    def edges_of(self, ids: list[str]) -> dict[str, list[dict]]:
        adj = self.g.adjacency()
        out = {}
        for nid in ids:
            rows = []
            for i in adj.get(nid, []):
                e = self.g.edges[i]
                other = e["target"] if e["source"] == nid else e["source"]
                rows.append({"s": e["source"], "t": e["target"], "type": e["type"], "props": e["props"],
                             "other": other, "okind": self.g.nodes[other]["kind"]})
            out[nid] = rows
        return out

    def nodes(self, ids: list[str]) -> dict[str, dict]:
        return {i: _node_out(i, self.g.nodes[i]["kind"], self.g.nodes[i]["props"]) for i in ids}


class _Neo4jAccess:
    def resolve(self, node_id: str) -> str | None:
        cands = [node_id] + [p + node_id for p in graphdb.ID_PREFIXES]
        rows = graphdb.run("UNWIND $ids AS i MATCH (n:Node {id: i}) RETURN n.id AS id", {"ids": cands})
        found = {r["id"] for r in rows}
        return next((c for c in cands if c in found), None)

    def edges_of(self, ids: list[str]) -> dict[str, list[dict]]:
        rows = graphdb.run(
            "UNWIND $ids AS nid MATCH (n:Node {id: nid})-[r]-(m:Node) "
            "RETURN nid, startNode(r).id AS s, endNode(r).id AS t, type(r) AS type, "
            "properties(r) AS props, m.id AS other, m.kind AS okind",
            {"ids": ids},
        )
        out: dict[str, list[dict]] = {i: [] for i in ids}
        for r in rows:
            out[r["nid"]].append({k: r[k] for k in ("s", "t", "type", "props", "other", "okind")})
        return out

    def nodes(self, ids: list[str]) -> dict[str, dict]:
        rows = graphdb.run(
            "UNWIND $ids AS nid MATCH (n:Node {id: nid}) RETURN n.id AS id, n.kind AS kind, "
            "properties(n) AS props",
            {"ids": ids},
        )
        return {r["id"]: _node_out(r["id"], r["kind"], dict(r["props"])) for r in rows}


def _ego(acc: Any, root: str, depth: int, limit: int) -> tuple[list[dict], list[dict], bool]:
    """Breadth-first neighbourhood: at each hop, a node's neighbours in (kind, id) order
    until ``limit`` nodes; edges are those seen from explored nodes between kept nodes."""
    kept = [root]
    seen = {root}
    edges: dict[tuple, dict] = {}
    truncated = False
    frontier = [root]
    for _hop in range(depth):
        if not frontier:
            break
        by_node = acc.edges_of(frontier)
        nxt = []
        for nid in frontier:
            rows = sorted(by_node.get(nid, []), key=lambda r: (
                KIND_ORDER.get(r["okind"], 99), r["other"], r["type"], r["s"]))
            for r in rows:
                other = r["other"]
                if other not in seen:
                    if len(kept) >= limit:
                        truncated = True
                        continue
                    seen.add(other)
                    kept.append(other)
                    nxt.append(other)
                key = (r["s"], r["type"], r["t"])
                if key not in edges:
                    edges[key] = {"source": r["s"], "target": r["t"], "type": r["type"],
                                  "props": dict(sorted((r["props"] or {}).items()))}
        frontier = nxt
    nodes_by_id = acc.nodes(kept)
    nodes = [nodes_by_id[i] for i in kept if i in nodes_by_id]
    out_edges = [e for k, e in sorted(edges.items()) if e["source"] in seen and e["target"] in seen]
    return nodes, out_edges, truncated


def graph_ego(node_id: str, depth: int = 1, limit: int = 150, engine: str | None = None) -> dict:
    """``GET /graph/ego``: the neighbourhood of one node (bare ids like ``syn-012`` work).
    SearchError 404 if the node does not exist, 400 for bad depth / limit."""
    if depth not in (1, 2):
        raise SearchError(400, "depth must be 1 or 2")
    if not 1 <= limit <= 500:
        raise SearchError(400, "limit must be between 1 and 500")
    engine = engine or engine_name()
    acc: Any = None
    if engine == "neo4j":
        try:
            acc = _Neo4jAccess()
            root = acc.resolve(node_id)
            result = None if root is None else _ego(acc, root, depth, limit)
        except Exception as exc:  # noqa: BLE001 - never fail because Neo4j did
            log.warning("neo4j ego failed (%s); using memory", type(exc).__name__)
            graphdb.mark_down()
            engine, acc = "memory", None
    if acc is None:
        acc = _MemoryAccess()
        root = acc.resolve(node_id)
        result = None if root is None else _ego(acc, root, depth, limit)
    if result is None:
        raise SearchError(404, f"Unknown graph node '{node_id}'")
    nodes, edges, truncated = result
    return {
        "engine": engine,
        "root": nodes[0]["id"] if nodes else None,
        "depth": depth,
        "limit": limit,
        "truncated": truncated,
        "nodes": nodes,
        "edges": edges,
    }
