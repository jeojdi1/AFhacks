"""H1.1: filter the StatCan Open Database of Businesses (ODBus) to candidate shops.

Source
------
Statistics Canada, Open Database of Businesses (ODBus) v1, released 2023-11-28,
Open Government Licence - Canada.

  Landing page: https://www150.statcan.gc.ca/n1/pub/21-26-0003/212600032023001-eng.htm
  Direct zip:   https://www150.statcan.gc.ca/n1/pub/21-26-0003/2023001/ODBus_2023.zip

Manual download (if the automatic one is not possible)
------------------------------------------------------
  1. Open the landing page above and click the "ODBus_2023.zip" link
     (about 21 MB), or run:
         curl -L -o data/raw/ODBus_2023.zip \\
           https://www150.statcan.gc.ca/n1/pub/21-26-0003/2023001/ODBus_2023.zip
  2. Unzip it in data/raw/:  (cd data/raw && unzip ODBus_2023.zip)
     This produces data/raw/ODBus_v1/ODBus_v1.csv (about 112 MB, ~446k rows).
  3. Run:  .venv/bin/python scripts/ingest_odbus.py
     or point at another copy:  --input /path/to/ODBus_v1.csv

data/raw/ is gitignored; never commit the raw file.

What it does
------------
Streams the CSV with the csv module, keeps Ontario rows in Kitchener, Waterloo,
Cambridge, Woolwich (Elmira, St. Jacobs, Breslau...), London and Hamilton
(including the amalgamated Hamilton communities), then keeps rows whose source
NAICS (primary or secondary) starts with one of the target prefixes, or,
failing that, whose business name / description contains a metalworking
keyword. Rows are deduplicated on normalized name + address.

City resolution: the `city` field wins when populated, `CSDNAME` (imputed by
StatCan from coordinates) is the fallback. Exception: every row from provider
"City of Kitchener" has city="Cambridge" (a parsing artefact in ODBus v1) while
its CSDNAME and addresses are Kitchener, so CSDNAME is used for that provider.

Keyword-only matches are dropped as noise (and counted in the summary) when the
2-digit sector is clearly non-industrial (retail, food service, finance, real
estate, health, education...), or when the keyword appears only in the free-text
description of a business outside manufacturing (31-33) and repair (81).

Outputs (only ODBus fields; no personal contact data):
  data/processed/candidates.csv
  data/processed/candidates_summary.json
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
OUT_CSV = ROOT / "data" / "processed" / "candidates.csv"
OUT_SUMMARY = ROOT / "data" / "processed" / "candidates_summary.json"

SOURCE_URL = "https://www150.statcan.gc.ca/n1/pub/21-26-0003/2023001/ODBus_2023.zip"
LANDING_URL = "https://www150.statcan.gc.ca/n1/pub/21-26-0003/212600032023001-eng.htm"
LICENCE = "Open Government Licence – Canada"
DOWNLOAD_DATE = "2026-09-26"
SOURCE_LABEL = "StatCan ODBus (OGL)"
MISSING = ".."

NAICS_PREFIXES = (
    "3327", "3323", "3321", "3328", "3329",
    "3344", "3353", "3359", "3363", "3364", "3366",
)

# Keyword fallback, matched at word starts so "fab" does not hit "fabulous".
KEYWORD_RE = re.compile(
    r"\b(machining|machine|machin|tool|precision|fabricat|fab|weld|metal)",
    re.IGNORECASE,
)
KEYWORD_TAIL = {"machin": "machine"}  # report "machinery" etc. as machine
KEYWORD_EXACT_ONLY = {"fab"}  # "fab" must be a whole word

# 2-digit NAICS sectors where a keyword-only hit is almost certainly noise.
NON_INDUSTRIAL_SECTORS = {
    "44", "45", "51", "52", "53", "55", "61", "62", "71", "72", "91", "92",
}

# A keyword found only in the free-text description (not the name) counts only
# for manufacturing (31-33) or repair/maintenance (81) businesses; descriptions
# like "sells office machines" or "tools for leaders" are otherwise noise.
DESCRIPTION_OK_SECTORS = {"31", "32", "33", "81"}

# Normalized locality -> municipality used in the output `city` column.
LOCALITY_TO_CITY = {
    "kitchener": "Kitchener",
    "waterloo": "Waterloo",
    "cambridge": "Cambridge",
    "woolwich": "Woolwich",
    "elmira": "Woolwich",
    "st jacobs": "Woolwich",
    "saint jacobs": "Woolwich",
    "breslau": "Woolwich",
    "conestogo": "Woolwich",
    "maryhill": "Woolwich",
    "london": "London",
    "hamilton": "Hamilton",
    "stoney creek": "Hamilton",
    "ancaster": "Hamilton",
    "dundas": "Hamilton",
    "flamborough": "Hamilton",
    "waterdown": "Hamilton",
    "glanbrook": "Hamilton",
    "binbrook": "Hamilton",
    "mount hope": "Hamilton",
}
TARGET_CITIES = ["Kitchener", "Waterloo", "Cambridge", "Woolwich", "London", "Hamilton"]

# Providers whose `city` field is known to be wrong; use CSDNAME instead.
CITY_FIELD_UNRELIABLE = {"City of Kitchener"}

OUT_FIELDS = [
    "odbus_idx", "name", "city", "province", "lat", "lon", "naics",
    "naics_descr", "employees", "address", "match_reason", "source",
]

NOTES = [
    (
        "ODBus coverage depends on which municipalities publish business "
        "licence/directory open data; Waterloo, Cambridge, Woolwich and London "
        "have no municipal feed in ODBus v1, so they appear only via other "
        "providers' records (e.g. City of Toronto contractor licences)."
    ),
    (
        "Provider 'City of Kitchener' rows carry city='Cambridge' in ODBus v1; "
        "CSDNAME (Kitchener) is used instead."
    ),
    (
        "Coordinates are as published; some City of Hamilton rows are geocoded "
        "outside Hamilton by the source."
    ),
]

NAME_SUFFIX_RE = re.compile(
    r"\b(inc|incorporated|ltd|limited|corp|corporation|co|company|llc|ulc)\b"
)


def clean(value: str | None) -> str:
    """Strip whitespace and turn the ODBus missing marker '..' into ''."""
    if value is None:
        return ""
    value = value.strip()
    return "" if value == MISSING else value


def detect_encoding(path: Path) -> str:
    """Return 'utf-8-sig' if the whole file decodes as UTF-8, else 'cp1252'/'latin-1'."""
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


def norm_locality(value: str) -> str:
    value = value.lower().replace(".", " ").replace("-", " ")
    return re.sub(r"\s+", " ", value).strip()


def resolve_city(row: dict[str, str]) -> str | None:
    city = clean(row.get("city"))
    csd = clean(row.get("CSDNAME"))
    if row.get("provider", "").strip() in CITY_FIELD_UNRELIABLE:
        primary = csd
    else:
        primary = city or csd
    return LOCALITY_TO_CITY.get(norm_locality(primary)) if primary else None


def naics_code(value: str) -> str:
    value = clean(value)
    if not value:
        return ""
    return value.split(".")[0]


def match_naics(row: dict[str, str]) -> str | None:
    for field in ("source_NAICS_primary", "source_NAICS_secondary", "derived_NAICS"):
        code = naics_code(row.get(field, ""))
        if code.startswith(NAICS_PREFIXES):
            return code
    return None


def find_keyword(text: str) -> str | None:
    for m in KEYWORD_RE.finditer(text):
        word = m.group(1).lower()
        if word in KEYWORD_EXACT_ONLY:
            end = m.end(1)
            if end < len(text) and text[end].isalnum():
                continue
        return KEYWORD_TAIL.get(word, word)
    return None


def match_keyword(row: dict[str, str]) -> tuple[str, bool] | None:
    """Return (keyword, found_in_name) or None."""
    name = " ".join(clean(row.get(f)) for f in ("business_name", "alt_business_name"))
    word = find_keyword(name)
    if word:
        return word, True
    word = find_keyword(clean(row.get("business_description")))
    return (word, False) if word else None


def norm_name(value: str) -> str:
    value = re.sub(r"[^a-z0-9 ]+", " ", value.lower())
    value = NAME_SUFFIX_RE.sub(" ", value)
    return re.sub(r"\s+", " ", value).strip()


def norm_address(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def to_int(value: str) -> int | None:
    try:
        return int(float(value))
    except ValueError:
        return None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="path to ODBus_v1.csv")
    ap.add_argument("--out", type=Path, default=OUT_CSV)
    ap.add_argument("--summary", type=Path, default=OUT_SUMMARY)
    args = ap.parse_args(argv)

    if not args.input.exists():
        print(f"ERROR: {args.input} not found. See the docstring for manual download steps.",
              file=sys.stderr)
        return 1

    encoding = detect_encoding(args.input)
    print(f"input: {args.input} (encoding {encoding})")

    input_rows = 0
    ontario_rows = 0
    area_rows: Counter[str] = Counter()
    dropped_noise = 0
    kept: dict[tuple[str, str], dict[str, str]] = {}

    with args.input.open(encoding=encoding, newline="") as fh:
        reader = csv.DictReader(fh)
        reader.fieldnames = [f.strip() for f in (reader.fieldnames or [])]
        print(f"columns ({len(reader.fieldnames)}): {', '.join(reader.fieldnames)}")
        for row in reader:
            input_rows += 1
            if clean(row.get("prov_terr")).upper() != "ON":
                continue
            ontario_rows += 1
            city = resolve_city(row)
            if city is None:
                continue
            area_rows[city] += 1

            code = match_naics(row)
            if code:
                reason = f"naics:{code}"
            else:
                hit = match_keyword(row)
                if not hit:
                    continue
                word, in_name = hit
                sector = naics_code(row.get("derived_NAICS", ""))[:2]
                if sector in NON_INDUSTRIAL_SECTORS or (
                    not in_name and sector not in DESCRIPTION_OK_SECTORS
                ):
                    dropped_noise += 1
                    continue
                reason = f"keyword:{word}"

            name = clean(row.get("business_name")) or clean(row.get("alt_business_name"))
            address = clean(row.get("full_address"))
            primary = naics_code(row.get("source_NAICS_primary", ""))
            record = {
                "odbus_idx": clean(row.get("idx")),
                "name": name,
                "city": city,
                "province": "ON",
                "lat": clean(row.get("latitude")),
                "lon": clean(row.get("longitude")),
                "naics": code or primary or naics_code(row.get("derived_NAICS", "")),
                "naics_descr": clean(row.get("NAICS_descr")),
                "employees": clean(row.get("total_no_employees")),
                "address": address,
                "match_reason": reason,
                "source": SOURCE_LABEL,
            }
            key = (norm_name(name), norm_address(address))
            prev = kept.get(key)
            if prev is None:
                kept[key] = record
                continue
            # Prefer a NAICS match over a keyword match, then the larger headcount
            # (ODBus v1 repeats some Kitchener businesses across survey years).
            better_reason = reason.startswith("naics") and not prev["match_reason"].startswith("naics")
            emp_new = to_int(record["employees"]) or -1
            emp_old = to_int(prev["employees"]) or -1
            same_family = reason.split(":")[0] == prev["match_reason"].split(":")[0]
            if better_reason or (same_family and emp_new > emp_old):
                kept[key] = record

    rows = sorted(kept.values(), key=lambda r: (TARGET_CITIES.index(r["city"]), r["name"].lower()))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=OUT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    per_city = {c: sum(1 for r in rows if r["city"] == c) for c in TARGET_CITIES}
    per_family = Counter(r["match_reason"].split(":")[0] for r in rows)
    per_reason = Counter(r["match_reason"] for r in rows)
    missing = [c for c, n in per_city.items() if n == 0]
    summary = {
        "source": "Statistics Canada, Open Database of Businesses (ODBus) v1",
        "source_url": SOURCE_URL,
        "landing_page": LANDING_URL,
        "licence": LICENCE,
        "download_date": DOWNLOAD_DATE,
        "input_file": args.input.name,
        "input_encoding": encoding,
        "input_row_count": input_rows,
        "ontario_row_count": ontario_rows,
        "target_area_rows_before_filter": {c: area_rows.get(c, 0) for c in TARGET_CITIES},
        "keyword_hits_dropped_as_noise": dropped_noise,
        "rows_per_city": per_city,
        "rows_per_match_reason_family": dict(per_family),
        "rows_per_match_reason": dict(sorted(per_reason.items(), key=lambda kv: -kv[1])),
        "cities_missing": missing,
        "total": len(rows),
        "notes": NOTES,
    }
    args.summary.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"input rows: {input_rows}  ontario: {ontario_rows}")
    print("target-area rows before industry filter: "
          + ", ".join(f"{c}={area_rows.get(c, 0)}" for c in TARGET_CITIES))
    print(f"keyword hits dropped as noise (sector rules): {dropped_noise}")
    print("candidates per city:")
    for c in TARGET_CITIES:
        print(f"  {c:<10} {per_city[c]}")
    print(f"match families: {dict(per_family)}")
    print(f"total: {len(rows)} -> {args.out}")
    if missing:
        print(f"WARNING: no candidates for {', '.join(missing)} (ODBus coverage gap)")
    if len(rows) < 100:
        print("WARNING: fewer than 100 candidates (AC H1.1 not met)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
