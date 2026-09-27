"""N4: link the Muster datasets (entity resolution) and emit a Neo4j graph seed.

Inputs (all already produced by other scripts; nothing is downloaded here)
-------------------------------------------------------------------------
  data/processed/shops_public.json                 78 researched public shops
  data/processed/shops_synthetic.json              30 synthetic demo shops
  data/processed/candidates.csv                    ODBus candidates (Kitchener, Hamilton)
  data/processed/national/odbus_manufacturers.csv  2,946 ODBus manufacturer sites (N1)
  data/processed/national/dnd_contract_vendors.json  DND vendor aggregates (N2)
  data/processed/national/labour_outlook.json      Job Bank outlooks (N3)
  data/processed/national/job_vacancies.json       StatCan JVWS vacancies (N3)
  data/processed/itb_obligations.json              ISED ITB obligations
  data/processed/program_northgate.json            fictional demo program
  data/raw/ODBus_v1/ODBus_v1.csv   (gitignored) for FSA / CSD of ODBus ids and for
                                   shop-city ODBus rows that carry no NAICS code
  data/raw/contracts.csv           (gitignored) full DND contract list, so that small
                                   vendors outside the N2 top-3,000 can still be matched

Method
------
Names are normalized (ASCII fold, lowercase, "&" -> "and", punctuation removed,
runs of single letters joined so "A.R.D." == "A R D" == "ard", leading "the"
and trailing legal suffixes inc/ltd/limited/corp/corporation/co/company/ltee/...
removed, "mfg" -> "manufacturing"). Shop names also yield variants: the part
before a parenthesis, the parenthetical alias, and the part before " - ".

Confidence:
  high    exact normalized name AND city agreement
          (same census subdivision, or the DND vendor's postal FSA falls in the
          shop's / site's city FSA set)
  medium  exact name + same province, or difflib token-set ratio >= 0.90 + same
          province. Fuzzy matches must also share a distinctive (non-generic)
          token, and leftover tokens must be generic words (or the plain
          SequenceMatcher ratio >= 0.90), so "Total Coatings" cannot match
          "Total Energies" just because one name is a subset of the other.
  (drop)  anything else.

DND vendors whose names look like a person (N2's rule) are never matched or
written. ODBus raw rows that look like a person (N1's rule) are skipped.

Outputs
-------
  data/processed/national/entity_links.json
  data/processed/national/graph_seed.json   (Neo4j-ready nodes + typed edges)

Run:  .venv/bin/python scripts/link_entities.py
"""

from __future__ import annotations

import csv
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

import ingest_dnd_contracts as dnd
import ingest_odbus_national as odb

PROC = ROOT / "data" / "processed"
NAT = PROC / "national"
RAW_ODBUS = ROOT / "data" / "raw" / "ODBus_v1" / "ODBus_v1.csv"
OUT_LINKS = NAT / "entity_links.json"
OUT_GRAPH = NAT / "graph_seed.json"
RETRIEVED = "2026-09-26"
MAX_BYTES = 10 * 1024 * 1024
FUZZY_MIN = 0.90

OGL = "Open Government Licence - Canada (https://open.canada.ca/en/open-government-licence-canada)"
SGC_ER_URL = "https://www.statcan.gc.ca/en/subjects/standard/sgc/2021/er-additionalinfo"
SGC_ER_TORONTO_URL = (
    "https://www23.statcan.gc.ca/imdb/p3VD.pl?Function=getVD&TVD=131938&CVD=138863"
    "&CPV=3530&CST=01012006&CLV=2&MLV=4"
)
ODBUS_URL = "https://www150.statcan.gc.ca/n1/pub/21-26-0003/212600032023001-eng.htm"

# --------------------------------------------------------------------------------------
# Geography
# --------------------------------------------------------------------------------------
# Localities -> census subdivision (CSD) name, lowercase.
CITY_TO_CSD = {
    "stoney creek": "hamilton",
    "ancaster": "hamilton",
    "dundas": "hamilton",
    "waterdown": "hamilton",
    "binbrook": "hamilton",
    "elmira": "woolwich",
    "breslau": "woolwich",
    "st. jacobs": "woolwich",
    "st jacobs": "woolwich",
    "dorchester": "thames centre",
    "strathcona": "strathcona county",
    "sherwood park": "strathcona county",
}

# CSD -> Job Bank / StatCan economic region code. Hand-built from the SGC 2021
# variant for economic regions (ER = grouping of census divisions): ER 3530 Toronto
# = CDs Durham, York, Toronto, Peel, Halton except Burlington (-> 3550);
# 3540 = Dufferin, Wellington, Waterloo, Simcoe; 3550 = Hamilton, Niagara,
# Haldimand-Norfolk, Brant + Burlington; 3560 = Oxford, Elgin, Middlesex;
# 5920 Lower Mainland-Southwest; 5910 Vancouver Island and Coast; 4860 Edmonton.
CSD_TO_ER = {
    # Toronto ER
    **dict.fromkeys(
        [
            "toronto",
            "mississauga",
            "brampton",
            "caledon",
            "vaughan",
            "markham",
            "newmarket",
            "richmond hill",
            "aurora",
            "whitchurch-stouffville",
            "east gwillimbury",
            "king",
            "georgina",
            "pickering",
            "ajax",
            "oshawa",
            "whitby",
            "clarington",
            "uxbridge",
            "scugog",
            "brock",
            "halton hills",
            "oakville",
            "milton",
        ],
        "3530",
    ),
    # Kitchener - Waterloo - Barrie ER
    **dict.fromkeys(
        [
            "kitchener",
            "waterloo",
            "cambridge",
            "woolwich",
            "wilmot",
            "wellesley",
            "north dumfries",
            "guelph",
            "barrie",
            "orangeville",
            "puslinch",
        ],
        "3540",
    ),
    # Hamilton - Niagara Peninsula ER
    **dict.fromkeys(
        [
            "hamilton",
            "burlington",
            "st. catharines",
            "niagara falls",
            "welland",
            "brantford",
            "brant",
        ],
        "3550",
    ),
    # London ER
    **dict.fromkeys(
        [
            "london",
            "thames centre",
            "woodstock",
            "st. thomas",
            "ingersoll",
            "zorra",
            "east zorra-tavistock",
            "blandford-blenheim",
        ],
        "3560",
    ),
    # BC
    **dict.fromkeys(
        [
            "langley",
            "surrey",
            "new westminster",
            "squamish",
            "vancouver",
            "burnaby",
            "richmond",
            "coquitlam",
            "delta",
            "abbotsford",
        ],
        "5920",
    ),
    **dict.fromkeys(["nanaimo", "victoria"], "5910"),
    # AB
    **dict.fromkeys(["strathcona county", "edmonton"], "4860"),
    "calgary": "4830",
}
PROVINCE_ER = {
    "NL": "1000",
    "PE": "1100",
    "NS": "1200",
    "NB": "1300",
    "QC": "2400",
    "ON": "3500",
    "MB": "4600",
    "SK": "4700",
    "AB": "4800",
    "BC": "5900",
    "YT": "6000",
    "YK": "6000",
    "NT": "6100",
    "NU": "6200",
}
PROVINCE_NAME = {
    "NL": "Newfoundland and Labrador",
    "PE": "Prince Edward Island",
    "NS": "Nova Scotia",
    "NB": "New Brunswick",
    "QC": "Quebec",
    "ON": "Ontario",
    "MB": "Manitoba",
    "SK": "Saskatchewan",
    "AB": "Alberta",
    "BC": "British Columbia",
    "YT": "Yukon",
    "YK": "Yukon",
    "NT": "Northwest Territories",
    "NU": "Nunavut",
}

# Postal FSAs per shop-city CSD (assumption: hand-built from Canada Post FSA
# geography; unioned below with FSAs seen >= 3 times and on >= 0.5% of ODBus rows in that CSD).
CSD_FSAS_HAND = {
    "kitchener": "N2A N2B N2C N2E N2G N2H N2K N2M N2N N2P N2R",
    "waterloo": "N2J N2K N2L N2T N2V",
    "cambridge": "N1P N1R N1S N1T N3C N3E N3H",
    "woolwich": "N3B N0B",
    "london": "N5V N5W N5X N5Y N5Z N6A N6B N6C N6E N6G N6H N6J N6K N6L N6M N6N N6P",
    "thames centre": "N0L",
    "woodstock": "N4S N4T N4V",
    "hamilton": (
        "L8E L8G L8H L8J L8K L8L L8M L8N L8P L8R L8S L8T L8V L8W L9A L9B L9C L9G "
        "L9H L9K L8B L0R"
    ),
}


def csd_of(city: str) -> str:
    c = " ".join((city or "").lower().split())
    return CITY_TO_CSD.get(c, c)


# --------------------------------------------------------------------------------------
# Names
# --------------------------------------------------------------------------------------
LEGAL = {
    "inc",
    "incorporated",
    "incorporee",
    "ltd",
    "limited",
    "ltee",
    "limitee",
    "corp",
    "corporation",
    "co",
    "company",
    "llc",
    "lp",
    "llp",
    "ulc",
    "plc",
    "gp",
    "cie",
    "gmbh",
    "ag",
    "sa",
    "sas",
    "bv",
    "srl",
    "spa",
    "pty",
}
ABBREV = {
    "mfg": "manufacturing",
    "intl": "international",
    "cdn": "canadian",
    "cda": "canada",
    "mfrs": "manufacturers",
    "eng": "engineering",
    "tech": "technologies",
}
GENERIC = set(
    [
        "and",
        "of",
        "the",
        "a",
        "machining",
        "machine",
        "machines",
        "machinery",
        "tool",
        "tools",
        "tooling",
        "manufacturing",
        "manufacturers",
        "industries",
        "industrial",
        "industry",
        "metal",
        "metals",
        "products",
        "product",
        "fabrication",
        "fabricating",
        "fabricators",
        "fabricator",
        "welding",
        "welders",
        "precision",
        "engineering",
        "engineered",
        "services",
        "service",
        "systems",
        "system",
        "technologies",
        "technology",
        "group",
        "canada",
        "canadian",
        "enterprises",
        "enterprise",
        "solutions",
        "international",
        "coatings",
        "coating",
        "steel",
        "works",
        "custom",
        "plating",
        "finishing",
        "heat",
        "treating",
        "treat",
        "powder",
        "shop",
        "holdings",
        "design",
        "parts",
        "equipment",
        "supply",
        "supplies",
        "sales",
        "north",
        "ontario",
        "division",
        "plant",
        "facility",
        "sheet",
        "wire",
        "mould",
        "moulds",
        "mold",
        "molds",
        "automation",
        "assembly",
        "assemblies",
        "components",
        "global",
        "america",
        "americas",
        "north",
        "american",
        "defence",
        "defense",
        "aerospace",
        "usa",
        "inc",
        "ltd",
        "corp",
        "co",
        "limited",
        "company",
        "specialty",
        "specialized",
        "general",
        "mechanical",
        "electric",
        "electrical",
        "electronics",
        "controls",
        "hydraulics",
        "repair",
        "repairs",
    ]
)
ALIAS_DROP = re.compile(r"^(formerly|incl\.?|including|also|dba|o/a)\s+", re.IGNORECASE)


def _ascii(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def norm(name: str) -> str:
    s = _ascii(name or "").lower().replace("&", " and ").replace("+", " and ")
    s = re.sub(r"['.]", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    toks = s.split()
    # join runs of single letters: "a r d industries" -> "ard industries"
    out: list[str] = []
    run = ""
    for t in toks:
        if len(t) == 1 and t.isalpha():
            run += t
            continue
        if run:
            out.append(run)
            run = ""
        out.append(t)
    if run:
        out.append(run)
    toks = [ABBREV.get(t, t) for t in out]
    if toks and toks[0] == "the":
        toks = toks[1:]
    while len(toks) > 1 and toks[-1] in LEGAL:
        toks.pop()
    return " ".join(toks)


def name_variants(name: str) -> list[str]:
    raw = [name]
    base = re.sub(r"\([^)]*\)", " ", name)
    raw.append(base)
    raw.append(base.split(" - ")[0])
    for alias in re.findall(r"\(([^)]*)\)", name):
        alias = ALIAS_DROP.sub("", alias.strip())
        raw.append(alias)
    out: list[str] = []
    for r in raw:
        n = norm(r)
        toks = n.split()
        # an alias made only of generic words / places ("kitchener plant") is not a name
        if not n or all(t in GENERIC or t in CSD_TO_ER for t in toks):
            continue
        if n not in out:
            out.append(n)
    return out


def distinctive(tokens: set[str]) -> set[str]:
    return {t for t in tokens if t not in GENERIC and len(t) >= 3 and not t.isdigit()}


def token_set_ratio(a: str, b: str) -> float:
    ta, tb = set(a.split()), set(b.split())
    inter = " ".join(sorted(ta & tb))
    s1 = (inter + " " + " ".join(sorted(ta - tb))).strip()
    s2 = (inter + " " + " ".join(sorted(tb - ta))).strip()
    if not inter:
        return SequenceMatcher(None, s1, s2).ratio()
    return max(
        SequenceMatcher(None, inter, s1).ratio(),
        SequenceMatcher(None, inter, s2).ratio(),
        SequenceMatcher(None, s1, s2).ratio(),
    )


def _close(tok: str, others: set[str]) -> bool:
    return any(SequenceMatcher(None, tok, o).ratio() >= 0.8 for o in others)


def fuzzy_ok(a: str, b: str) -> tuple[float, bool]:
    """Return (token-set ratio, weak) if the pair passes the guards, else (0, False).

    Guards on top of token-set ratio >= 0.90:
      * the names share a distinctive (non-generic) token;
      * when both names have leftover non-generic tokens, each must have a close
        spelling counterpart on the other side ("cf" vs "cbi" fails, "mounatin" vs
        "mountain" passes);
      * when only one side has leftovers (subset), they must be generic words or
        the whole strings must be >= 0.90 similar ("total" vs "total energies" fails).
    weak = the shorter name is a single token ("MES", "Felix"); callers require
    city agreement for weak matches.
    """
    ta, tb = set(a.split()), set(b.split())
    if not distinctive(ta & tb):
        return 0.0, False
    r = token_set_ratio(a, b)
    if r < FUZZY_MIN:
        return 0.0, False
    la = {t for t in ta - tb if t not in GENERIC and not t.isdigit()}
    lb = {t for t in tb - ta if t not in GENERIC and not t.isdigit()}
    if la and lb:
        if not (all(_close(t, lb) for t in la) and all(_close(t, la) for t in lb)):
            return 0.0, False
    elif (la or lb) and SequenceMatcher(None, a, b).ratio() < FUZZY_MIN:
        return 0.0, False
    weak = min(len(ta), len(tb)) == 1
    return round(r, 3), weak


class NameIndex:
    """Exact-key and distinctive-token index over records with a `keys` list."""

    def __init__(self, records: list[dict]):
        self.records = records
        self.exact: dict[str, list[int]] = defaultdict(list)
        self.tok: dict[str, set[int]] = defaultdict(set)
        for i, r in enumerate(records):
            for k in r["keys"]:
                self.exact[k].append(i)
                for t in distinctive(set(k.split())):
                    self.tok[t].add(i)

    def candidates(self, keys: list[str]) -> list[tuple[int, str, float]]:
        """[(record index, method, score)] best per record."""
        best: dict[int, tuple[str, float]] = {}
        for k in keys:
            for i in self.exact.get(k, []):
                best[i] = ("exact", 1.0)
        pool: set[int] = set()
        for k in keys:
            for t in distinctive(set(k.split())):
                pool |= self.tok.get(t, set())
        for i in pool:
            if i in best:
                continue
            s, weak = max(
                (fuzzy_ok(k, rk) for k in keys for rk in self.records[i]["keys"]),
                default=(0.0, False),
            )
            if s:
                best[i] = ("fuzzy_weak" if weak else "fuzzy", s)
        return [(i, m, s) for i, (m, s) in best.items()]


# --------------------------------------------------------------------------------------
# Loaders
# --------------------------------------------------------------------------------------
def load_json(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def fsa_of(postal: str) -> str:
    f = (postal or "").upper().replace(" ", "")[:3]
    return f if dnd.FSA_RE.match(f) else ""


def scan_odbus_raw(
    want_ids: set[str], shop_csds: set[str]
) -> tuple[dict, list, dict, Counter]:
    """One pass over raw ODBus: FSA/CSD for wanted ids, shop-city rows, CSD->FSA sets."""
    by_id: dict[str, dict] = {}
    city_rows: list[dict] = []
    csd_fsa: dict[str, Counter] = defaultdict(Counter)
    stats: Counter = Counter()
    enc = odb.detect_encoding(RAW_ODBUS)
    with RAW_ODBUS.open(encoding=enc, newline="") as fh:
        rd = csv.DictReader(fh)
        rd.fieldnames = [f.strip() for f in (rd.fieldnames or [])]
        for row in rd:
            prov = odb.clean(row.get("prov_terr")).upper()
            csd = odb.clean(row.get("CSDNAME")).lower()
            fsa = fsa_of(odb.clean(row.get("postal_code")))
            if csd and fsa:
                csd_fsa[(prov, csd)][fsa] += 1
            idx = odb.clean(row.get("idx"))
            if idx in want_ids:
                by_id[idx] = {
                    "fsa": fsa,
                    "csd": csd,
                    "csduid": odb.clean(row.get("CSDUID")),
                }
            city = csd_of(odb.clean(row.get("city")))
            if prov == "ON" and (csd in shop_csds or city in shop_csds):
                name = odb.clean(row.get("business_name")) or odb.clean(
                    row.get("alt_business_name")
                )
                if not name:
                    continue
                if odb.looks_like_person(name):
                    stats["shop_city_rows_person_skipped"] += 1
                    continue
                stats["shop_city_rows"] += 1
                alt = odb.clean(row.get("alt_business_name"))
                keys = [norm(name)] + (
                    [norm(alt)] if alt and norm(alt) != norm(name) else []
                )
                city_rows.append(
                    {
                        "id": idx,
                        "name": name,
                        "places": {csd, city} - {""},
                        "fsa": fsa,
                        "keys": [k for k in keys if k],
                    }
                )
    fsa_sets = {
        k: {f for f, n in c.items() if n >= 3 and n >= 0.005 * sum(c.values())}
        for k, c in csd_fsa.items()
    }
    return by_id, city_rows, fsa_sets, stats


def load_dnd_universe() -> tuple[list[dict], dict]:
    """All DND vendors 2021+ (N2 method), person-like names dropped."""
    contracts, _ = dnd.read_contracts()
    agg: dict[str, dict] = {}
    person_cache: dict[str, bool] = {}
    dropped: set[str] = set()
    for (_pid, vkey), r in contracts.items():
        raw = r["vendor_name"]
        if raw not in person_cache:
            person_cache[raw] = dnd.looks_like_person(raw)
        if person_cache[raw]:
            dropped.add(vkey)
            continue
        a = agg.setdefault(
            vkey,
            {
                "names": Counter(),
                "value": 0.0,
                "count": 0,
                "first": "9999",
                "last": "",
                "fsa": Counter(),
                "prov": Counter(),
            },
        )
        a["names"][raw] += 1
        a["value"] += dnd.fnum(r["contract_value"])
        a["count"] += 1
        d = r["contract_date"][:10]
        a["first"] = min(a["first"], d)
        a["last"] = max(a["last"], d)
        fsa = r["vendor_postal_code"].upper().replace(" ", "")[:3]
        if dnd.FSA_RE.match(fsa):
            a["fsa"][fsa] += 1
        a["prov"][dnd.province_of(fsa, r["country_of_vendor"])] += 1
    out = []
    for vkey, a in agg.items():
        if vkey in dropped and not a["count"]:
            continue
        name = a["names"].most_common(1)[0][0]
        out.append(
            {
                "vendor": name,
                "vendor_key": vkey,
                "total_value": round(a["value"], 2),
                "contracts": a["count"],
                "first_date": a["first"],
                "last_date": a["last"],
                "province": a["prov"].most_common(1)[0][0],
                "provinces": sorted(a["prov"]),
                "fsa": a["fsa"].most_common(1)[0][0] if a["fsa"] else None,
                "fsas": sorted(a["fsa"]),
                "keys": sorted({norm(n) for n in a["names"]} - {""}),
            }
        )
    stats = {
        "vendors_matchable": len(out),
        "person_like_vendor_keys_dropped": len(dropped),
    }
    return out, stats


# --------------------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------------------
def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", _ascii(s).lower()).strip("-")[:60]


def main() -> int:
    for p in (RAW_ODBUS, dnd.RAW):
        if not p.exists():
            print(
                f"ERROR: missing {p.relative_to(ROOT)} (gitignored raw input)",
                file=sys.stderr,
            )
            return 1

    pub = load_json(PROC / "shops_public.json")["shops"]
    syn = load_json(PROC / "shops_synthetic.json")["shops"]
    cands = list(csv.DictReader((PROC / "candidates.csv").open(encoding="utf-8")))
    odbus = list(
        csv.DictReader((NAT / "odbus_manufacturers.csv").open(encoding="utf-8"))
    )
    dnd_proc = load_json(NAT / "dnd_contract_vendors.json")
    labour = load_json(NAT / "labour_outlook.json")
    jvws = load_json(NAT / "job_vacancies.json")
    itb = load_json(PROC / "itb_obligations.json")
    program = load_json(PROC / "program_northgate.json")

    shop_csds = {csd_of(s["city"]) for s in pub}
    want_ids = {r["id"] for r in odbus} | {c["odbus_idx"] for c in cands}
    want_ids |= {s["odbus_idx"] for s in pub if s.get("odbus_idx")}
    print("scanning raw ODBus ...")
    odbus_raw, city_rows, fsa_sets, odbus_stats = scan_odbus_raw(want_ids, shop_csds)
    print("reading DND contracts ...")
    universe, dnd_stats = load_dnd_universe()
    proc_by_key = {v["vendor_key"]: v for v in dnd_proc["vendors"]}

    def city_fsas(prov: str, csd: str) -> set[str]:
        return set(CSD_FSAS_HAND.get(csd, "").split()) | fsa_sets.get(
            (prov, csd), set()
        )

    # ---- labour: region -> outlooks ------------------------------------------------
    outlook_by_region: dict[str, list[dict]] = defaultdict(list)
    region_meta: dict[str, dict] = {}
    for r in labour["rows"]:
        outlook_by_region[r["region_code"]].append(r)
        region_meta[r["region_code"]] = {
            "code": r["region_code"],
            "name": r["region"],
            "level": r["region_level"],
            "province": r["province"],
        }

    def jv_geo(region: dict) -> str:
        if region["level"] == "province":
            return region["name"]
        return (
            f"{region['name'].replace(' - ', '-')}, {PROVINCE_NAME[region['province']]}"
        )

    jv_by_geo: dict[tuple[str, str], dict] = {}
    for r in jvws["rows"]:
        jv_by_geo[(r["geo"], r["noc"])] = r

    def region_for(csd: str, prov: str) -> dict | None:
        code = CSD_TO_ER.get(csd) or PROVINCE_ER.get(prov)
        return region_meta.get(code) if code else None

    def labour_block(region: dict | None) -> dict | None:
        if not region:
            return None
        rows = sorted(outlook_by_region[region["code"]], key=lambda r: r["noc"])
        jv = jv_by_geo.get((jv_geo(region), "72106"))
        return {
            "region_code": region["code"],
            "region": region["name"],
            "region_level": region["level"],
            "outlooks_2025_2027": [
                {
                    "noc": r["noc"],
                    "occupation": r["occupation"],
                    "outlook": r["outlook"],
                    "prior_2024_2026": r["prior_outlook_2024_2026"],
                }
                for r in rows
            ],
            "welder_vacancies_latest": (
                {"value": jv["latest_vacancies"], "quarter_start": jv["latest_period"]}
                if jv and jv.get("latest_vacancies") is not None
                else None
            ),
        }

    # ---- indexes ----------------------------------------------------------------------
    dnd_index = NameIndex(universe)
    odbus_nat_records = [
        {
            **r,
            "keys": [norm(r["name"])],
            "fsa": odbus_raw.get(r["id"], {}).get("fsa", ""),
            "places": {csd_of(r["municipality"]), csd_of(r["city"])} - {""},
            "src": "odbus_manufacturers.csv",
        }
        for r in odbus
    ]
    cand_records = [
        {
            "id": c["odbus_idx"],
            "name": c["name"],
            "keys": [norm(c["name"])],
            "places": {csd_of(c["city"])},
            "src": "candidates.csv",
        }
        for c in cands
    ]
    city_records = [{**r, "src": "ODBus_v1 (raw, shop city)"} for r in city_rows]
    odbus_shop_pool = odbus_nat_records + cand_records + city_records
    odbus_shop_index = NameIndex(odbus_shop_pool)
    odbus_name_by_id = {r["id"]: r["name"] for r in odbus_shop_pool}

    def dnd_link(i: int, method: str, score: float, city_ok: bool) -> dict:
        v = universe[i]
        p = proc_by_key.get(v["vendor_key"])
        return {
            "vendor": v["vendor"],
            "vendor_key": v["vendor_key"],
            "confidence": "high" if (method == "exact" and city_ok) else "medium",
            "method": method,
            "score": score,
            "location_agreement": "city_fsa" if city_ok else "province",
            "contracts": v["contracts"],
            "total_value": v["total_value"],
            "first_date": v["first_date"],
            "last_date": v["last_date"],
            "province": v["province"],
            "fsa": v["fsa"],
            "mfg_relevant": bool(p and p.get("mfg_relevant")),
            "mfg_flags": sorted((p or {}).get("mfg_flags", {})),
            "in_n2_vendor_file": p is not None,
        }

    def match_dnd(keys: list[str], prov: str, fsas: set[str]) -> list[dict]:
        out = []
        for i, method, score in dnd_index.candidates(keys):
            v = universe[i]
            if prov not in v["provinces"]:
                continue  # different province (or outside Canada) -> drop
            city_ok = bool(fsas & set(v["fsas"]))
            if method == "fuzzy_weak" and not city_ok:
                continue  # single-token name ("MES") needs the same city FSA
            out.append(dnd_link(i, method, score, city_ok))
        out.sort(
            key=lambda x: (x["confidence"] != "high", -x["score"], -x["total_value"])
        )
        return out

    # ---- shops (public 78 + synthetic 30) ---------------------------------------------
    shop_links = []
    shop_region: dict[str, dict | None] = {}
    for s in pub + syn:
        csd = csd_of(s["city"])
        region = region_for(csd, "ON")
        shop_region[s["id"]] = region
        if s["source"] != "public":
            continue
        keys = name_variants(s["name"])
        odbus_hits: dict[str, dict] = {}
        if s.get("odbus_idx"):
            odbus_hits[s["odbus_idx"]] = {
                "id": s["odbus_idx"],
                "name": odbus_name_by_id.get(s["odbus_idx"]),
                "source": "shops_public.json odbus_idx (ingest_odbus.py)",
                "confidence": "high",
                "method": "prior_link",
                "score": 1.0,
            }
        for i, method, score in odbus_shop_index.candidates(keys):
            r = odbus_shop_pool[i]
            same_city = csd in r["places"]
            if method == "fuzzy_weak" and not same_city:
                continue
            if method == "exact" and same_city:
                conf = "high"
            else:
                conf = "medium"  # all pools are Ontario, so province always agrees
            prev = odbus_hits.get(r["id"])
            if prev and prev["method"] == "prior_link":
                prev["name"] = prev["name"] or r["name"]
                continue
            rank = {"high": 2, "medium": 1}
            if prev and (rank[prev["confidence"]], prev["score"]) >= (
                rank[conf],
                score,
            ):
                continue
            odbus_hits[r["id"]] = {
                "id": r["id"],
                "name": r["name"],
                "source": r["src"],
                "confidence": conf,
                "method": method,
                "score": score,
                "same_city": same_city,
            }
        dnd_hits = match_dnd(keys, "ON", city_fsas("ON", csd))
        shop_links.append(
            {
                "shop_id": s["id"],
                "name": s["name"],
                "city": s["city"],
                "csd": csd,
                "name_keys": keys,
                "odbus": sorted(
                    odbus_hits.values(),
                    key=lambda x: (x["confidence"] != "high", -x["score"]),
                ),
                "dnd_vendor": dnd_hits,
                "labour": labour_block(region),
            }
        )

    # ---- ODBus national manufacturers -> DND ------------------------------------------
    odbus_dnd = []
    for r in odbus_nat_records:
        fsas = ({r["fsa"]} if r["fsa"] else set()) | city_fsas(
            r["province"], csd_of(r["municipality"])
        )
        for h in match_dnd(r["keys"], r["province"], fsas):
            odbus_dnd.append(
                {
                    "odbus_id": r["id"],
                    "name": r["name"],
                    "municipality": r["municipality"],
                    "province": r["province"],
                    "naics4": r["naics4"],
                    **h,
                }
            )

    # ---- ITB primes -> DND (name only; ITB rows carry no location) --------------------
    primes = sorted({r["contractor"] for r in itb["rows"]})
    prime_dnd = []
    for p in primes:
        for i in dnd_index.exact.get(norm(p), []):
            v = universe[i]
            prime_dnd.append(
                {
                    "prime": p,
                    "vendor": v["vendor"],
                    "vendor_key": v["vendor_key"],
                    "confidence": "medium",
                    "method": "exact_name_only",
                    "contracts": v["contracts"],
                    "total_value": v["total_value"],
                    "last_date": v["last_date"],
                    "province": v["province"],
                }
            )

    # ---- stats ------------------------------------------------------------------------
    def shops_with(field: str, confs: tuple[str, ...]) -> int:
        return sum(
            1 for s in shop_links if any(h["confidence"] in confs for h in s[field])
        )

    on_ids = {r["id"] for r in odbus_nat_records if r["province"] == "ON"}
    odbus_conf: dict[str, str] = {}
    for x in odbus_dnd:
        if odbus_conf.get(x["odbus_id"]) != "high":
            odbus_conf[x["odbus_id"]] = x["confidence"]
    on_conf = Counter(c for i, c in odbus_conf.items() if i in on_ids)
    all_conf = Counter(odbus_conf.values())
    stats = {
        "public_shops": len(shop_links),
        "public_shops_with_odbus_link": {
            "any": shops_with("odbus", ("high", "medium")),
            "high": shops_with("odbus", ("high",)),
        },
        "public_shops_holding_dnd_contracts": {
            "high": shops_with("dnd_vendor", ("high",)),
            "medium_only": shops_with("dnd_vendor", ("high", "medium"))
            - shops_with("dnd_vendor", ("high",)),
            "any": shops_with("dnd_vendor", ("high", "medium")),
            "names": sorted({s["name"] for s in shop_links if s["dnd_vendor"]}),
        },
        "public_shops_with_labour_region": sum(1 for s in shop_links if s["labour"]),
        "odbus_manufacturers_ontario": len(on_ids),
        "odbus_ontario_matching_dnd_vendor": {
            "high": on_conf["high"],
            "medium": on_conf["medium"],
            "any": sum(on_conf.values()),
        },
        "odbus_all_provinces_matching_dnd_vendor": {
            "high": all_conf["high"],
            "medium": all_conf["medium"],
            "any": sum(all_conf.values()),
            "of_total": len(odbus_nat_records),
        },
        "odbus_dnd_link_rows": len(odbus_dnd),
        "itb_primes": len(primes),
        "itb_primes_matching_dnd_vendor": len({x["prime"] for x in prime_dnd}),
        "dnd_vendor_universe": dnd_stats,
        "odbus_raw_scan": dict(odbus_stats),
    }
    matched_keys = {x["vendor_key"] for x in odbus_dnd}
    stats["odbus_dnd_value_matched_cad"] = round(
        sum(v["total_value"] for v in universe if v["vendor_key"] in matched_keys), 2
    )
    stats["odbus_dnd_distinct_vendors"] = len(matched_keys)

    caveats = [
        "Precision: 'high' links (exact normalized name + same census subdivision or same postal FSA "
        "set) are expected to be right in the large majority of cases but are not verified; "
        "'medium' links (exact name elsewhere in the province, or fuzzy >= 0.90) need a human check "
        "before being shown as fact. Nothing here is verified by the companies.",
        "Recall: DND lists the vendor's billing / head-office postal code, not the plant, so a "
        "multi-site company matches only one site or none; DND vendor names are free text (e.g. "
        "'GD OTS C'), so abbreviations are missed. A shop with no DND match may still hold DND "
        "subcontracts: subcontracts under primes are not in the proactive-disclosure data at all.",
        "The shop-to-ODBus pool covers only Kitchener and Hamilton raw rows plus ODBus manufacturer "
        "sites; ODBus v1 has no Cambridge, Waterloo, Woolwich, London or Woodstock licence data, so "
        "shops there cannot get an ODBus id except by chance (Toronto-issued licences).",
        "City FSA sets for shop cities are hand-built (assumption) and unioned with FSAs seen >= 3 "
        "times (and on >= 0.5% of rows) on ODBus rows in the same census subdivision. A DND vendor "
        "agrees on city if any of its reported FSAs is in the set.",
        "Economic-region mapping of cities is hand-built from the StatCan SGC 2021 economic-region "
        "variant (Toronto ER = Durham, York, Toronto, Peel, Halton minus Burlington).",
        "Person-like DND vendor names (N2 rule) are excluded from matching and never written; "
        "ODBus raw rows that look like a person (N1 rule) are skipped.",
    ]
    as_of = {
        "shops_public": pub and "2026-09-26",
        "odbus": "ODBus v1, released 2023-11-28",
        "dnd_contracts": dnd_proc.get("as_of"),
        "labour_outlook": labour.get("as_of"),
        "job_vacancies": jvws.get("as_of"),
        "itb_obligations": itb.get("as_of"),
    }
    source_urls = sorted(
        set(
            list(dnd_proc["source_urls"][:2])
            + list(labour["source_urls"][:1])
            + list(jvws["source_urls"][:1])
            + list(itb["source_urls"][:1])
            + [ODBUS_URL, SGC_ER_URL, SGC_ER_TORONTO_URL]
        )
    )
    licence = (
        f"{OGL} for ODBus, DND contracts, Job Bank and ISED data; Statistics Canada Open "
        "Licence for JVWS; shops_public.json facts are from company websites (facts only, "
        "labelled 'Public data - unverified - not affiliated'); synthetic shops are Muster's own."
    )

    links = {
        "source_urls": source_urls,
        "licence": licence,
        "retrieved": RETRIEVED,
        "as_of": as_of,
        "notes": [
            "Entity resolution across Muster datasets (script: scripts/link_entities.py).",
            "Confidence: high = exact normalized name + city agreement; medium = exact name + same "
            "province, or difflib token-set ratio >= 0.90 + same province with guards; else dropped.",
            *caveats,
        ],
        "stats": stats,
        "shops": shop_links,
        "odbus_dnd_links": sorted(
            odbus_dnd, key=lambda x: (x["confidence"] != "high", -x["total_value"])
        ),
        "prime_dnd_links": prime_dnd,
    }
    OUT_LINKS.write_text(
        json.dumps(links, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    # ---- graph seed -------------------------------------------------------------------
    nodes: dict[str, dict] = {}
    edges: list[dict] = []

    def node(nid: str, label: str, **props) -> str:
        if nid not in nodes:
            nodes[nid] = {
                "id": nid,
                "label": label,
                "props": {k: v for k, v in props.items() if v is not None},
            }
        return nid

    def edge(typ: str, src: str, dst: str, **props) -> None:
        edges.append(
            {
                "type": typ,
                "source": src,
                "target": dst,
                "props": {k: v for k, v in props.items() if v is not None},
            }
        )

    for code, meta in region_meta.items():
        rid = node(
            f"region:{code}",
            "Region",
            code=code,
            name=meta["name"],
            level=meta["level"],
            province=meta["province"],
        )
        jv = jv_by_geo.get((jv_geo(meta), "72106"))
        if jv and jv.get("latest_vacancies") is not None:
            nodes[rid]["props"]["welder_vacancies_latest"] = jv["latest_vacancies"]
            nodes[rid]["props"]["welder_vacancies_quarter"] = jv["latest_period"]
        if meta["level"] != "province":
            pcode = PROVINCE_ER[meta["province"]]
            node(
                f"region:{pcode}",
                "Region",
                code=pcode,
                name=PROVINCE_NAME[meta["province"]],
                level="province",
                province=meta["province"],
            )
            edge("REGION_PART_OF", rid, f"region:{pcode}")
    for r in labour["rows"]:
        oid = node(
            f"occupation:{r['noc']}", "Occupation", noc=r["noc"], name=r["occupation"]
        )
        edge(
            "REGION_OUTLOOK",
            f"region:{r['region_code']}",
            oid,
            noc=r["noc"],
            label=r["outlook"],
            score=r["outlook_score"],
            prior_label=r["prior_outlook_2024_2026"],
            period=r["period"],
            wage_median=(r.get("wage") or {}).get("wage_median"),
        )

    # ODBus aggregates onto regions
    agg = Counter()
    for r in odbus_nat_records:
        reg = region_for(csd_of(r["municipality"]), r["province"])
        if reg:
            agg[reg["code"]] += 1
    for code, n in agg.items():
        nodes[f"region:{code}"]["props"]["odbus_manufacturer_sites"] = n

    for s in pub + syn:
        sid = node(
            f"shop:{s['id']}",
            "Shop",
            shop_id=s["id"],
            name=s["name"],
            source=s["source"],
            label_text=s.get("label"),
            city=s["city"],
            lat=s.get("lat"),
            lon=s.get("lon"),
            naics=s.get("naics"),
            is_sme=s.get("is_sme"),
            website=s.get("website"),
        )
        for p in s.get("processes", []):
            edge("SHOP_HAS_PROCESS", sid, node(f"process:{p}", "Process", name=p))
        for c in s.get("certifications", []):
            if c["status"] == "unknown":
                continue
            edge(
                "SHOP_HOLDS_CERT",
                sid,
                node(f"cert:{c['type']}", "Certification", type=c["type"]),
                status=c["status"],
                source=c.get("source_url") or s["source"],
                verified_at=c.get("verified_at"),
            )
        reg = shop_region.get(s["id"])
        if reg:
            edge("SHOP_IN_REGION", sid, f"region:{reg['code']}")
    for c in ["CGP", "CPCSC_L1", "ISO9001", "AS9100", "CWB_W47.1"]:
        node(f"cert:{c}", "Certification", type=c)

    for r in odbus_nat_records:
        sid = node(
            f"shop:odbus:{r['id']}",
            "Shop",
            shop_id=f"odbus:{r['id']}",
            name=r["name"],
            source="odbus",
            label_text="Public data — unverified — not affiliated",
            city=r["municipality"],
            province=r["province"],
            lat=float(r["lat"]) if r["lat"] else None,
            lon=float(r["lon"]) if r["lon"] else None,
            naics=r["naics"],
            naics4=r["naics4"] or None,
            employees_band=r["employees_band"] or None,
        )
        reg = region_for(csd_of(r["municipality"]), r["province"])
        if reg:
            edge("SHOP_IN_REGION", sid, f"region:{reg['code']}")

    def dnd_node(vkey: str) -> str:
        v = next(u for u in universe_by_key[vkey])
        p = proc_by_key.get(vkey) or {}
        return node(
            f"dnd:{slug(vkey)}",
            "DNDVendorRecord",
            vendor=v["vendor"],
            vendor_key=vkey,
            province=v["province"],
            fsa=v["fsa"],
            total_value=v["total_value"],
            contracts=v["contracts"],
            first_date=v["first_date"],
            last_date=v["last_date"],
            mfg_relevant=bool(p.get("mfg_relevant")),
            mfg_value=p.get("mfg_value"),
            mfg_flags=sorted(p.get("mfg_flags", {})) or None,
            top_commodity=(p.get("top_commodities") or [{}])[0].get("description"),
        )

    universe_by_key: dict[str, list[dict]] = defaultdict(list)
    for v in universe:
        universe_by_key[v["vendor_key"]].append(v)
    # manufacturing-relevant DND vendors (N2 flags), person-filtered, aggregated per vendor
    for vkey, p in proc_by_key.items():
        if p.get("mfg_relevant") and vkey in universe_by_key:
            did = dnd_node(vkey)
            prov = universe_by_key[vkey][0]["province"]
            if prov in PROVINCE_ER:
                edge("DND_VENDOR_IN_REGION", did, f"region:{PROVINCE_ER[prov]}")
    for s in shop_links:
        for h in s["dnd_vendor"]:
            edge(
                "SHOP_MATCHES_DND_VENDOR",
                f"shop:{s['shop_id']}",
                dnd_node(h["vendor_key"]),
                confidence=h["confidence"],
                method=h["method"],
                score=h["score"],
                value=h["total_value"],
                count=h["contracts"],
                last_date=h["last_date"],
            )
    for x in odbus_dnd:
        edge(
            "SHOP_MATCHES_DND_VENDOR",
            f"shop:odbus:{x['odbus_id']}",
            dnd_node(x["vendor_key"]),
            confidence=x["confidence"],
            method=x["method"],
            score=x["score"],
            value=x["total_value"],
            count=x["contracts"],
            last_date=x["last_date"],
        )

    # Programs and primes
    pr_id = node(
        "prime:northgate",
        "Prime",
        name=program["prime_name"],
        fictional=True,
        label_text=program.get("prime_label"),
    )
    pg_id = node(
        f"program:{program['id']}",
        "Program",
        name="Northgate demo program",
        fictional=True,
        contract_value_cad=program["contract_value_cad"],
        smb_target_pct=program["smb_target_pct"],
        rules_label=program.get("rules_label"),
        site_city=program["site"]["city"],
    )
    edge(
        "PRIME_HAS_ITB_OBLIGATION",
        pr_id,
        pg_id,
        value=program["obligation_cad"],
        achieved=None,
        currency="CAD",
        status="demo",
    )
    reg = region_for(csd_of(program["site"]["city"]), "ON")
    if reg:
        edge("PROGRAM_SITE_IN_REGION", pg_id, f"region:{reg['code']}")
    for n, r in enumerate(itb["rows"], 1):
        pid = node(
            f"prime:{slug(r['contractor'])}",
            "Prime",
            name=r["contractor"],
            fictional=False,
        )
        gid = node(
            f"program:itb-{n:03d}",
            "Program",
            name=r["project"],
            fictional=False,
            status=r["status"],
            contract_award_year=r.get("contract_award_year"),
            estimated_timeframe=r.get("estimated_timeframe"),
            source_url=r.get("source_url"),
        )
        edge(
            "PRIME_HAS_ITB_OBLIGATION",
            pid,
            gid,
            value=r["obligation"],
            achieved=r["completed_to_date"],
            in_progress=r.get("in_progress"),
            to_be_identified=r.get("to_be_identified"),
            progress_pct=r.get("progress_pct"),
            currency=r["currency"],
            status=r["status"],
        )
    for x in prime_dnd:
        edge(
            "PRIME_MATCHES_DND_VENDOR",
            f"prime:{slug(x['prime'])}",
            dnd_node(x["vendor_key"]),
            confidence=x["confidence"],
            method=x["method"],
            value=x["total_value"],
            count=x["contracts"],
            last_date=x["last_date"],
        )

    edge_types = Counter(e["type"] for e in edges)
    node_labels = Counter(n["label"] for n in nodes.values())
    graph = {
        "source_urls": source_urls,
        "licence": licence,
        "retrieved": RETRIEVED,
        "as_of": as_of,
        "notes": [
            "Neo4j seed. Every node has a unique `id` and one `label`; all property values are "
            "primitives or arrays of primitives. Load e.g.: CALL apoc.load.json('file:///graph_seed.json') "
            "YIELD value UNWIND value.nodes AS n CALL apoc.merge.node([n.label], {id: n.id}, n.props) "
            "YIELD node RETURN count(node); then UNWIND value.edges AS e MATCH (a {id: e.source}), "
            "(b {id: e.target}) CALL apoc.create.relationship(a, e.type, e.props, b) YIELD rel "
            "RETURN count(rel). Create an index on :Shop(id), :Region(id), etc. first.",
            "Shop.source: public (78 researched), synthetic (30, Muster-made, label 'Synthetic'), "
            "odbus (national ODBus manufacturer sites, no street address). Real companies are "
            "'Public data - unverified - not affiliated'.",
            "SHOP_HOLDS_CERT edges are written only for status != unknown (unknown = no edge).",
            "DNDVendorRecord: N2 manufacturing-relevant vendors plus any vendor matched to a shop "
            "or prime; values are total committed DND contract value 2021-01-01 onward (not payments).",
            "Prime/Program: ISED ITB rows (real; values in the row currency, not converted) plus the "
            "fictional Northgate demo prime/program. PRIME_MATCHES_DND_VENDOR is name-only.",
            "Region: Job Bank economic regions and provinces; REGION_OUTLOOK label is the 2025-2027 "
            "Job Bank outlook; odbus_manufacturer_sites is an aggregate count.",
            *caveats,
        ],
        "counts": {"nodes": dict(node_labels), "edges": dict(edge_types)},
        "nodes": list(nodes.values()),
        "edges": edges,
    }
    OUT_GRAPH.write_text(
        json.dumps(graph, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    for p in (OUT_LINKS, OUT_GRAPH):
        size = p.stat().st_size
        flag = "  WARNING > 10 MB" if size > MAX_BYTES else ""
        print(f"wrote {p.relative_to(ROOT)} ({size:,} bytes){flag}")
    print(json.dumps(stats, indent=1))
    print(json.dumps(graph["counts"], indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
