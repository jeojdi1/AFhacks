"""N1: national map of defence-relevant manufacturers from StatCan ODBus v1.

Source
------
Statistics Canada, Open Database of Businesses (ODBus) v1, released 2023-11-28,
Open Government Licence - Canada.

  Landing page: https://www150.statcan.gc.ca/n1/pub/21-26-0003/212600032023001-eng.htm
  Direct zip:   https://www150.statcan.gc.ca/n1/pub/21-26-0003/2023001/ODBus_2023.zip

Industry titles: NAICS Canada 2017 Version 3.0 (Statistics Canada),
https://www23.statcan.gc.ca/imdb/p3VD.pl?Function=getVD&TVD=1181553

Input: data/raw/ODBus_v1/ODBus_v1.csv (see scripts/ingest_odbus.py for the
manual download steps). data/raw/ is gitignored; never commit the raw file.

What it does
------------
Streams every ODBus row (all provinces and territories) and keeps a row only
when its *source* NAICS code (primary, else secondary) falls in subsectors
331-336 (primary metals, fabricated metal products, machinery, computer and
electronic products, electrical equipment, transportation equipment), i.e.
4-digit groups 3311-3369, or is the bare 3-digit subsector code 331-336 (one
provider publishes only 3 digits). No keyword matching: a row without a NAICS
code in that range is never kept.

337 (furniture) and 339 (miscellaneous: signs, jewellery, sporting goods,
medical supplies) are within the numeric range 3311-3399 but are excluded as
off-target; their counts are reported in the summary. The 2-digit
`derived_NAICS` field is ignored (too coarse).

Rows whose business name looks like a person's name (e.g. "SMITH, JOHN",
"John Smith", "J. Smith") are dropped and counted; business names that merely
contain a surname ("Nelson's Custom Welding") are kept.

City: `city` as published, except provider "City of Kitchener", whose `city`
field is wrong in ODBus v1 (always "Cambridge"); CSDNAME is used for it. The
`municipality` column is CSDNAME (StatCan census subdivision) when present,
else the city.

Dedup: rows are merged on normalized name + municipality + civic number, so
the same site published by two providers (e.g. Region of Peel and City of
Mississauga) or repeated across survey years (Kitchener) appears once.

Outputs (ODBus business fields only; no street address, no contact data):
  data/processed/national/odbus_manufacturers.csv
  data/processed/national/odbus_summary.json

Run:  .venv/bin/python scripts/ingest_odbus_national.py
"""

from __future__ import annotations

import argparse
import codecs
import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = ROOT / "data" / "raw" / "ODBus_v1" / "ODBus_v1.csv"
OUT_DIR = ROOT / "data" / "processed" / "national"
OUT_CSV = OUT_DIR / "odbus_manufacturers.csv"
OUT_SUMMARY = OUT_DIR / "odbus_summary.json"

SOURCE_URL = "https://www150.statcan.gc.ca/n1/pub/21-26-0003/2023001/ODBus_2023.zip"
LANDING_URL = "https://www150.statcan.gc.ca/n1/pub/21-26-0003/212600032023001-eng.htm"
NAICS_URL = "https://www23.statcan.gc.ca/imdb/p3VD.pl?Function=getVD&TVD=1181553"
LICENCE = "Open Government Licence – Canada"
RETRIEVED = "2026-09-26"
AS_OF = "2023-11-28 (ODBus v1 release; underlying municipal extracts vary by provider)"
SOURCE_LABEL = "StatCan ODBus v1 (OGL)"
MISSING = ".."
MAX_BYTES = 10 * 1024 * 1024

KEEP_SUBSECTORS = ("331", "332", "333", "334", "335", "336")
EXCLUDED_SUBSECTORS = ("337", "339")

# Industry groups the task flagged as most relevant to defence supply chains.
PRIORITY_GROUPS = {
    "3321", "3323", "3327", "3328", "3329", "3332", "3333", "3336", "3339",
    "3344", "3345", "3353", "3359", "3363", "3364", "3365", "3366", "3369",
}

# NAICS Canada 2017 V3.0 titles, copied from the StatCan page in NAICS_URL.
NAICS4_TITLES = {
    "3311": "Iron and steel mills and ferro-alloy manufacturing",
    "3312": "Steel product manufacturing from purchased steel",
    "3313": "Alumina and aluminum production and processing",
    "3314": "Non-ferrous metal (except aluminum) production and processing",
    "3315": "Foundries",
    "3321": "Forging and stamping",
    "3322": "Cutlery and hand tool manufacturing",
    "3323": "Architectural and structural metals manufacturing",
    "3324": "Boiler, tank and shipping container manufacturing",
    "3325": "Hardware manufacturing",
    "3326": "Spring and wire product manufacturing",
    "3327": "Machine shops, turned product, and screw, nut and bolt manufacturing",
    "3328": "Coating, engraving, cold and heat treating and allied activities",
    "3329": "Other fabricated metal product manufacturing",
    "3331": "Agricultural, construction and mining machinery manufacturing",
    "3332": "Industrial machinery manufacturing",
    "3333": "Commercial and service industry machinery manufacturing",
    "3334": (
        "Ventilation, heating, air-conditioning and commercial refrigeration "
        "equipment manufacturing"
    ),
    "3335": "Metalworking machinery manufacturing",
    "3336": "Engine, turbine and power transmission equipment manufacturing",
    "3339": "Other general-purpose machinery manufacturing",
    "3341": "Computer and peripheral equipment manufacturing",
    "3342": "Communications equipment manufacturing",
    "3343": "Audio and video equipment manufacturing",
    "3344": "Semiconductor and other electronic component manufacturing",
    "3345": "Navigational, measuring, medical and control instruments manufacturing",
    "3346": "Manufacturing and reproducing magnetic and optical media",
    "3351": "Electric lighting equipment manufacturing",
    "3352": "Household appliance manufacturing",
    "3353": "Electrical equipment manufacturing",
    "3359": "Other electrical equipment and component manufacturing",
    "3361": "Motor vehicle manufacturing",
    "3362": "Motor vehicle body and trailer manufacturing",
    "3363": "Motor vehicle parts manufacturing",
    "3364": "Aerospace product and parts manufacturing",
    "3365": "Railroad rolling stock manufacturing",
    "3366": "Ship and boat building",
    "3369": "Other transportation equipment manufacturing",
}
NAICS3_TITLES = {
    "331": "Primary metal manufacturing",
    "332": "Fabricated metal product manufacturing",
    "333": "Machinery manufacturing",
    "334": "Computer and electronic product manufacturing",
    "335": "Electrical equipment, appliance and component manufacturing",
    "336": "Transportation equipment manufacturing",
}

PROVINCES = {
    "NL": "Newfoundland and Labrador", "PE": "Prince Edward Island",
    "NS": "Nova Scotia", "NB": "New Brunswick", "QC": "Quebec", "ON": "Ontario",
    "MB": "Manitoba", "SK": "Saskatchewan", "AB": "Alberta",
    "BC": "British Columbia", "YT": "Yukon", "NT": "Northwest Territories",
    "NU": "Nunavut",
}

# Providers whose `city` field is known to be wrong; use CSDNAME instead.
CITY_FIELD_UNRELIABLE = {"City of Kitchener"}

OUT_FIELDS = [
    "id", "name", "city", "municipality", "province", "lat", "lon", "naics",
    "naics4", "naics_descr", "priority", "employees_band", "provider", "source",
]

# ---------------------------------------------------------------- person names

BUSINESS_WORD_RE = re.compile(
    r"\b(inc|incorporated|ltd|ltee|limited|corp|corporation|co|company|llc|ulc|lp|"
    r"llp|group|enterprises?|industries|industrial|ind|mfg|manufactur\w*|machin\w*|"
    r"metal\w*|steel|weld\w*|fab\w*|tool\w*|tech\w*|systems?|solutions?|products?|"
    r"services?|precision|engineering|equipment|electric\w*|electronics?|automation|"
    r"aerospace|aviation|marine|motors?|parts|design\w*|works|shop|canada|"
    r"construction|trailers?|laser|turning|catalytic|castings?|coatings?|"
    r"international|global|north|america\w*|holdings|division|the)\b",
    re.IGNORECASE,
)

# Common given names (English, French, South Asian, East Asian, and others seen
# in Canadian licence data). Used only together with the short-name rule below.
FIRST_NAMES_TEXT = """
aaron adam adrian arthur bernard domenico francesco gino giuseppe harold
leonard luigi manuel rocco salvatore vito ahmed ajay alan albert alex alexander ali alice allan amanda
amit amir amy andre andrea andrew angela anil ann anna anne anthony antonio arun
ashok barbara barry ben benjamin bill bob brad brandon brenda brian bruce carl
carlos carol catherine charles chen cheng chris christian christine christopher
claude colin craig dan daniel danny darren dave david dean deepak denis dennis
derek diane don donald doug douglas duncan earl ed edward eric erik frank fred
gary gaurav geoff george gerald gilles glen glenn gordon graham greg gregory
guy harjit harpreet harry helen henry hong howard hugh ian jack jacques james
jamie jan jason jean jeff jeffrey jennifer jeremy jerry jim jin joe joel john
johnny jon jonathan jose joseph juan julie jun justin karen keith kelly ken
kevin kim kulwant kumar kyle larry laura lee li linda lisa louis luc lucas luis
manoj marc marco maria mario mark martin mary matt matthew michael michel mike
ming mohamed mohammad mohammed nancy neil nick nicholas nicole norman pam
patrick paul peter philip pierre raj rajesh ralph ramesh randy ray raymond rick
richard rob robert robin rod roger ron ronald ross roy russell ryan sam samuel
sandeep sanjay sarah scott sean sergio shawn simon stephen steve steven stuart
sukhwinder sunil susan suresh tariq ted terry thomas tim timothy todd tom tony
trevor vijay vincent walter wayne wei william yan yang yves zhang
"""
FIRST_NAMES = set(FIRST_NAMES_TEXT.split())

NAME_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z'\-]*\.?")


def looks_like_person(name: str) -> bool:
    """Heuristic: True for 'LAST, FIRST', 'First Last', 'F. Last' style names."""
    if not name or BUSINESS_WORD_RE.search(name) or re.search(r"[0-9&/@]", name):
        return False
    if "," in name:
        left, _, right = name.partition(",")
        lt, rt = NAME_TOKEN_RE.findall(left), NAME_TOKEN_RE.findall(right)
        # "SMITH, JOHN", "SMITH, JOHN A."
        return 1 <= len(lt) <= 2 and 1 <= len(rt) <= 3
    tokens = NAME_TOKEN_RE.findall(name)
    if len(tokens) != len(name.split()) or not 2 <= len(tokens) <= 3:
        return False
    words = [t.rstrip(".").lower() for t in tokens]
    if len(tokens) == 2 and len(words[0]) == 1 and tokens[0].endswith("."):
        return True  # "J. Smith" (bare initials like "R D Turning" are kept)
    return words[0] in FIRST_NAMES or words[-1] in FIRST_NAMES


# ---------------------------------------------------------------- helpers


def clean(value: str | None) -> str:
    """Strip whitespace and turn the ODBus missing marker '..' into ''."""
    if value is None:
        return ""
    value = value.strip()
    return "" if value in (MISSING, "NOT AVAILABLE") else value


def detect_encoding(path: Path) -> str:
    for enc in ("utf-8-sig", "cp1252"):
        decoder = codecs.getincrementaldecoder(enc)()
        try:
            with path.open("rb") as fh:
                while chunk := fh.read(1 << 20):
                    decoder.decode(chunk)
                decoder.decode(b"", final=True)
            return enc
        except UnicodeDecodeError:
            continue
    return "latin-1"


def naics_code(value: str | None) -> str:
    value = clean(value)
    code = value.split(".")[0] if value else ""
    return code if code.isdigit() else ""


def pick_naics(row: dict[str, str]) -> tuple[str, str]:
    """Return (code, status) where status is keep / excluded / none."""
    status = "none"
    for field in ("source_NAICS_primary", "source_NAICS_secondary"):
        code = naics_code(row.get(field))
        if len(code) < 3:
            continue
        if code.startswith(KEEP_SUBSECTORS) and (len(code) == 3 or code[:4] in NAICS4_TITLES):
            return code, "keep"
        if code.startswith(EXCLUDED_SUBSECTORS):
            status = "excluded"
    return "", status


def tidy_place(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    if value.isupper() or value.islower():
        value = value.title()
    return re.sub(r"^(Township|City|Town) Of ", "", value)


def resolve_places(row: dict[str, str]) -> tuple[str, str]:
    city = clean(row.get("city"))
    csd = clean(row.get("CSDNAME"))
    if row.get("provider", "").strip() in CITY_FIELD_UNRELIABLE:
        city = csd or city
    city, csd = tidy_place(city), tidy_place(csd)
    if not city and not csd:
        # Some City of Nanaimo rows have no city/CSD; the provider is the city.
        provider = row.get("provider", "").strip()
        if provider.startswith(("City of ", "Town of ")):
            city = csd = provider.split(" of ", 1)[1]
    return city or csd, csd or city


def employees_band(value: str) -> str:
    raw = clean(value).lower()
    if not raw:
        return ""
    if raw.isdigit():
        n = int(raw)
        for hi, band in ((4, "1-4"), (9, "5-9"), (19, "10-19"), (49, "20-49"),
                         (99, "50-99"), (499, "100-499")):
            if n <= hi:
                return band if n > 0 else ""
        return "500+"
    nums = [int(x) for x in re.findall(r"\d+", raw)]
    if not nums:
        return ""
    lo = nums[0]
    if lo >= 500:
        return "500+"
    if lo >= 100:
        return "100-499"  # sources mix 100-299 / 300-499 / 100-499
    return employees_band(str(lo))


NAME_SUFFIX_RE = re.compile(
    r"\b(inc|incorporated|ltd|limited|ltee|corp|corporation|co|company|llc|ulc|lp|the)\b"
)


def norm_name(value: str) -> str:
    value = re.sub(r"[^a-z0-9 ]+", " ", value.lower())
    value = NAME_SUFFIX_RE.sub(" ", value)
    return re.sub(r"\s+", "", value)


def civic_number(row: dict[str, str]) -> str:
    num = clean(row.get("street_no"))
    if not num:
        m = re.search(r"\b(\d+)[A-Za-z]?\s+[A-Za-z]", clean(row.get("full_address")))
        num = m.group(1) if m else ""
    return re.sub(r"\D", "", num)


def fmt_coord(value: str) -> str:
    try:
        f = float(value)
    except ValueError:
        return ""
    return f"{f:.5f}" if f else ""


def band_rank(band: str) -> int:
    order = ["", "1-4", "5-9", "10-19", "20-49", "50-99", "100-499", "500+"]
    return order.index(band) if band in order else 0


# ---------------------------------------------------------------- main


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    ap.add_argument("--out", type=Path, default=OUT_CSV)
    ap.add_argument("--summary", type=Path, default=OUT_SUMMARY)
    args = ap.parse_args(argv)

    if not args.input.exists():
        print(f"ERROR: {args.input} not found; see scripts/ingest_odbus.py for download steps.",
              file=sys.stderr)
        return 1

    encoding = detect_encoding(args.input)
    input_rows = 0
    rows_by_prov: Counter[str] = Counter()
    naics_coded_by_prov: Counter[str] = Counter()
    excluded_337_339 = 0
    matched = 0
    dropped_person = 0
    dropped_no_name = 0
    kept: dict[tuple[str, str, str], dict[str, str]] = {}

    with args.input.open(encoding=encoding, newline="") as fh:
        reader = csv.DictReader(fh)
        reader.fieldnames = [f.strip() for f in (reader.fieldnames or [])]
        for row in reader:
            input_rows += 1
            prov = clean(row.get("prov_terr")).upper()
            rows_by_prov[prov or "unknown"] += 1
            if naics_code(row.get("source_NAICS_primary")) or naics_code(
                row.get("source_NAICS_secondary")
            ):
                naics_coded_by_prov[prov or "unknown"] += 1
            code, status = pick_naics(row)
            if status == "excluded":
                excluded_337_339 += 1
            if status != "keep":
                continue
            matched += 1
            name = clean(row.get("business_name")) or clean(row.get("alt_business_name"))
            name = re.sub(r"\s+", " ", name).strip(" ,")
            if not name:
                dropped_no_name += 1
                continue
            if looks_like_person(name):
                dropped_person += 1
                continue
            city, muni = resolve_places(row)
            naics4 = code[:4] if len(code) >= 4 else ""
            descr = clean(row.get("NAICS_descr"))
            if "/" in descr:  # Langley-style path: keep the most specific segment
                descr = descr.rsplit("/", 1)[-1].strip()
            if descr.isupper():
                descr = descr.capitalize()
            if not descr or len(code) == 3:
                descr = NAICS4_TITLES.get(naics4) or NAICS3_TITLES.get(code[:3], "")
            record = {
                "id": clean(row.get("idx")),
                "name": name,
                "city": city,
                "municipality": muni,
                "province": prov,
                "lat": fmt_coord(clean(row.get("latitude"))),
                "lon": fmt_coord(clean(row.get("longitude"))),
                "naics": code,
                "naics4": naics4,
                "naics_descr": descr,
                "priority": "1" if naics4 in PRIORITY_GROUPS else "0",
                "employees_band": employees_band(row.get("total_no_employees", "")),
                "provider": clean(row.get("provider")),
                "source": SOURCE_LABEL,
            }
            key = (norm_name(name), muni.lower(), civic_number(row))
            prev = kept.get(key)
            if prev is None:
                kept[key] = record
                continue
            # Keep the richer record: coordinates, then 4+ digit NAICS, then headcount.
            def score(r: dict[str, str]) -> tuple[int, int, int]:
                return (bool(r["lat"]), len(r["naics"]), band_rank(r["employees_band"]))

            if score(record) > score(prev):
                kept[key] = record

    rows = sorted(kept.values(), key=lambda r: (r["province"], r["municipality"], r["name"].lower()))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=OUT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    size = args.out.stat().st_size
    if size > MAX_BYTES:
        print(f"WARNING: {args.out} is {size} bytes (> 10 MB); trim before committing.")

    by_prov = Counter(r["province"] for r in rows)
    by_muni = Counter(f'{r["municipality"]}, {r["province"]}' for r in rows)
    by_naics4 = Counter(r["naics4"] or f'{r["naics"]} (3-digit only)' for r in rows)
    by_provider = Counter(r["provider"] for r in rows)
    by_band = Counter(r["employees_band"] or "unknown" for r in rows)
    with_coords = sum(1 for r in rows if r["lat"] and r["lon"])
    priority = sum(1 for r in rows if r["priority"] == "1")
    no_mfg = sorted(p for p in PROVINCES if by_prov.get(p, 0) == 0)

    summary = {
        "source_urls": [LANDING_URL, SOURCE_URL, NAICS_URL],
        "licence": LICENCE,
        "retrieved": RETRIEVED,
        "as_of": AS_OF,
        "source": "Statistics Canada, Open Database of Businesses (ODBus) v1",
        "script": "scripts/ingest_odbus_national.py",
        "output_file": "data/processed/national/odbus_manufacturers.csv",
        "output_bytes": size,
        "filter": {
            "naics_kept": "source NAICS (primary, else secondary) in 3311-3369 "
                          "(subsectors 331-336), or bare 3-digit 331-336",
            "naics_excluded_in_range": "337 furniture, 339 miscellaneous (off-target)",
            "keyword_matching": False,
            "priority_groups": sorted(PRIORITY_GROUPS),
        },
        "counts": {
            "input_rows": input_rows,
            "input_rows_by_province": dict(sorted(rows_by_prov.items())),
            "input_rows_with_source_naics_by_province": dict(sorted(naics_coded_by_prov.items())),
            "naics_matched_rows": matched,
            "rows_337_339_excluded": excluded_337_339,
            "dropped_person_name": dropped_person,
            "dropped_no_name": dropped_no_name,
            "duplicates_merged": matched - dropped_person - dropped_no_name - len(rows),
            "distinct_names": len({norm_name(r["name"]) for r in rows}),
            "total": len(rows),
            "priority_group_rows": priority,
            "rows_with_coordinates": with_coords,
            "rows_without_coordinates": len(rows) - with_coords,
        },
        "by_province": {p: by_prov[p] for p in sorted(by_prov, key=lambda p: -by_prov[p])},
        "provinces_territories_with_zero": no_mfg,
        "by_municipality_top40": dict(by_muni.most_common(40)),
        "by_naics4": {
            k: {"count": v, "title": NAICS4_TITLES.get(k, NAICS3_TITLES.get(k[:3], ""))}
            for k, v in sorted(by_naics4.items())
        },
        "by_provider": dict(by_provider.most_common()),
        "by_employees_band": {b: by_band[b] for b in sorted(by_band, key=band_rank)},
        "notes": [
            (
                "COVERAGE CAVEAT: ODBus only contains businesses from municipalities and "
                "regions that publish business licence/directory open data. In v1 the "
                "only rows with a source NAICS code in 331-336 come from Ontario (York, "
                "Peel, Mississauga, Brampton, Durham, Kitchener), British Columbia "
                "(Langley Township, Squamish, Nanaimo, New Westminster) and Alberta "
                "(Strathcona County). Quebec, Manitoba, Saskatchewan and Atlantic Canada "
                "have zero rows here; this is a data-availability gap, not an absence "
                "of manufacturers. Toronto, Hamilton, Montreal, Winnipeg etc. are absent "
                "or lack NAICS codes."
            ),
            (
                "Counts are establishments/licences as published, not firms; one firm "
                "may hold several sites (same name at different civic numbers is kept "
                "as separate rows; see counts.distinct_names)."
            ),
            (
                "NAICS codes are as supplied by each municipality (self-declared or "
                "clerk-assigned), not verified by Statistics Canada."
            ),
            (
                "Rows without coordinates (mostly Regional Municipality of York, which "
                "publishes no lat/lon) are kept with blank lat/lon; map them by "
                "municipality centroid if needed."
            ),
            (
                "Employee bands are normalized across providers; providers using "
                "100-299 and 300-499 are both mapped to 100-499."
            ),
            (
                "Provider 'City of Kitchener' rows carry city='Cambridge' in ODBus v1; "
                "CSDNAME (Kitchener) is used instead."
            ),
            (
                f"{dropped_person} rows dropped because the business name looks like a "
                "person's name (heuristic: 'LAST, FIRST', 'F. Last', or a 2-3 word name "
                "starting or ending with a common given name and no business word)."
            ),
            (
                "No street addresses, phone numbers, emails or personal names are "
                "included. Public data — unverified — not affiliated."
            ),
        ],
    }
    args.summary.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
                            encoding="utf-8")

    print(f"input rows: {input_rows} (encoding {encoding})")
    print(f"NAICS 331-336 matches: {matched}; 337/339 excluded: {excluded_337_339}")
    print(f"dropped person-name: {dropped_person}; no name: {dropped_no_name}")
    print(f"total after dedupe: {len(rows)} ({size} bytes) -> {args.out}")
    print(f"by province: {dict(by_prov)}")
    print(f"with coordinates: {with_coords}; priority groups: {priority}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
