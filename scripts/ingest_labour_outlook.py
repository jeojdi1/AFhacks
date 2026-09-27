"""Extract Job Bank 3-year employment outlooks for metal-fabrication trades.

Input:  data/raw/outlook_2025_2027_en.xlsx  (ESDC Job Bank, 2025-2027, NOC 2021)
        data/raw/outlook_2024_2026_en.xlsx  (previous edition, for year-over-year change)
        Both downloaded once from the open.canada.ca dataset below (gitignored).
Output: data/processed/national/labour_outlook.json          (one row per NOC x region)
        data/processed/national/labour_outlook_summary.json  (shortage vs limited signals)

Source: Employment and Social Development Canada, "3-Year Employment Outlooks",
Open Government Portal, Open Government Licence - Canada.
The workbook has no personal data; the narrative column is trimmed to a short excerpt.

The xlsx is parsed with the standard library only (zipfile + xml.etree iterparse);
the sheet uses inline strings, so no sharedStrings table is needed.

Run: .venv/bin/python scripts/ingest_labour_outlook.py
"""

from __future__ import annotations

import csv
import html
import json
import re
import zipfile
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
from xml.etree.ElementTree import iterparse

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
RAW_CURRENT = RAW_DIR / "outlook_2025_2027_en.xlsx"
RAW_PREVIOUS = RAW_DIR / "outlook_2024_2026_en.xlsx"
RAW_WAGES = RAW_DIR / "jobbank_wages_2025.csv"
OUT_DIR = ROOT / "data" / "processed" / "national"
OUT = OUT_DIR / "labour_outlook.json"
OUT_SUMMARY = OUT_DIR / "labour_outlook_summary.json"

DATASET_URL = (
    "https://open.canada.ca/data/en/dataset/b0e112e9-cf53-4e79-8838-23cd98debe5b"
)
URL_CURRENT = (
    "https://open.canada.ca/data/dataset/b0e112e9-cf53-4e79-8838-23cd98debe5b/resource/"
    "cb52e1d0-ab62-4357-91cc-d8f5a2114e02/download/20252027_outlook_n21_en_251208.xlsx"
)
URL_PREVIOUS = (
    "https://open.canada.ca/data/dataset/b0e112e9-cf53-4e79-8838-23cd98debe5b/resource/"
    "8f7922d2-6f40-4346-93a4-2bed1eac72b8/download/20242026_outlook_n21_en_250117.xlsx"
)
WAGES_DATASET_URL = (
    "https://open.canada.ca/data/en/dataset/adad580f-76b0-4502-bd05-20c125de9116"
)
URL_WAGES = (
    "https://open.canada.ca/data/dataset/adad580f-76b0-4502-bd05-20c125de9116/resource/"
    "9da94d63-b178-4a64-aeb3-b6a3bd721ad2/download/"
    "2a71-das-wage2025opendata-esdc-all-19nov2025-vf.csv"
)
METHODOLOGY_URL = (
    "https://www.jobbank.gc.ca/trend-analysis/search-job-outlooks/outlooks-methodology"
)
LICENCE = "Open Government Licence - Canada (https://open.canada.ca/en/open-government-licence-canada)"
RETRIEVED = "2026-09-26"

# NOC 2021 unit groups relevant to defence metal fabrication.
NOCS = {
    "72106": "Welders and related machine operators",
    "72100": "Machinists and machining and tooling inspectors",
    "72101": "Tool and die makers",
    "72102": "Sheet metal workers",
    "72103": "Boilermakers",
    "72104": "Structural metal and platework fabricators and fitters",
    "72400": "Construction millwrights and industrial mechanics",
    "94100": "Machine operators, mineral and metal processing",
    "94105": "Metalworking and forging machine operators",
    "94106": "Machining tool operators",
    "94107": "Machine operators of other metal products",
    "95101": "Labourers in metal fabrication",
}
PRIMARY_NOC = "72106"

# Ordinal score for sorting only. Job Bank publishes labels; this mapping is ours.
SCORE = {"Very good": 5, "Good": 4, "Moderate": 3, "Limited": 2, "Very limited": 1}
SHORTAGE_LABELS = {"Very good", "Good"}
SURPLUS_LABELS = {"Limited", "Very limited"}

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
COL_RE = re.compile(r"[A-Z]+")
TAG_RE = re.compile(r"<[^>]+>")
EXCERPT_CHARS = 280


def excel_date(serial: str) -> str:
    try:
        return (date(1899, 12, 30) + timedelta(days=int(float(serial)))).isoformat()
    except ValueError:
        return serial


def iter_rows(path: Path):
    """Yield dicts keyed by header for every data row of sheet1."""
    header: dict[str, str] = {}
    with zipfile.ZipFile(path) as zf, zf.open("xl/worksheets/sheet1.xml") as fh:
        for _event, el in iterparse(fh, events=("end",)):
            if el.tag != NS + "row":
                continue
            cells: dict[str, str] = {}
            for c in el.findall(NS + "c"):
                col = COL_RE.match(c.get("r", "")).group(0)
                if c.get("t") == "inlineStr":
                    val = "".join(t.text or "" for t in c.iter(NS + "t"))
                else:
                    v = c.find(NS + "v")
                    val = v.text if v is not None and v.text else ""
                cells[col] = val
            el.clear()
            if not header:
                header = cells
                continue
            yield {header[k]: v for k, v in cells.items() if k in header}


def excerpt(raw_html: str) -> str:
    text = html.unescape(TAG_RE.sub(" ", html.unescape(raw_html)))
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= EXCERPT_CHARS:
        return text
    cut = text[:EXCERPT_CHARS]
    end = cut.rfind(". ")
    return (cut[: end + 1] if end > 80 else cut.rstrip() + "...").strip()


def load(path: Path) -> list[dict]:
    rows = []
    for r in iter_rows(path):
        noc = r.get("NOC_Code", "").replace("NOC_", "")
        if noc not in NOCS:
            continue
        rows.append(r | {"_noc": noc})
    return rows


def num(row: dict, col: str) -> float | None:
    try:
        return float(row[col])
    except (KeyError, ValueError):
        return None


def load_wages(path: Path) -> dict[tuple[str, str], dict]:
    """Job Bank 2025 wages keyed by (noc, outlook-style region code).

    Wage file codes: ER00 = Canada, ER35 = Ontario, ER3530 = Toronto. Outlook file codes:
    3500 = Ontario, 3530 = Toronto. National rows are keyed 'CA'.
    """
    out: dict[tuple[str, str], dict] = {}
    if not path.exists():
        return out
    with path.open(encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            noc = r["NOC_CNP"].replace("NOC_", "")
            if noc not in NOCS:
                continue
            code = r["ER_Code_Code_RE"].replace("ER", "")
            code = "CA" if code == "00" else (code + "00" if len(code) == 2 else code)

            median = num(r, "Median_Wage_Salaire_Median")
            if median is None:
                continue
            out[(noc, code)] = {
                "wage_low": num(r, "Low_Wage_Salaire_Minium"),
                "wage_median": median,
                "wage_high": num(r, "High_Wage_Salaire_Maximal"),
                "wage_unit": "annual"
                if r["Annual_Wage_Flag_Salaire_annuel"] == "1"
                else "hourly",
                "wage_source": r["Data_Source_E"],
                "wage_reference_period": r["Reference_Period"],
                "region": r["ER_Name"],
                "province": r["prov"],
            }
    return out


def region_level(er_code: str) -> str:
    # Province/territory-wide rows use codes ending in 00 (1000 NL, 3500 ON, ...).
    return "province" if er_code.endswith("00") else "economic_region"


def main() -> None:
    current = load(RAW_CURRENT)
    previous = (
        {
            (r["_noc"], r.get("Economic Region Code", "")): r.get("Outlook", "")
            .strip()
            .capitalize()
            for r in load(RAW_PREVIOUS)
        }
        if RAW_PREVIOUS.exists()
        else {}
    )

    wages = load_wages(RAW_WAGES)
    out_rows = []
    for r in current:
        noc = r["_noc"]
        label = r.get("Outlook", "").strip()
        er_code = r.get("Economic Region Code", "").strip()
        er_name = r.get("Economic Region Name", "").strip()
        prov = r.get("Province", "").strip()
        prior = previous.get((noc, er_code))
        out_rows.append(
            {
                "occupation": NOCS[noc],
                "noc": noc,
                "region": er_name,
                "region_code": er_code,
                "region_level": region_level(er_code),
                "province": prov,
                "outlook": label,
                "outlook_score": SCORE.get(label),
                "prior_outlook_2024_2026": prior,
                "period": "2025-2027",
                "date": excel_date(r.get("Release Date", "")),
                "trend_excerpt": excerpt(r.get("Employment Trends", "")),
                "wage": {
                    k: v
                    for k, v in wages.get((noc, er_code), {}).items()
                    if k not in ("region", "province")
                }
                or None,
            }
        )
    out_rows.sort(key=lambda x: (x["noc"], x["province"], x["region_code"]))

    # ---- summary ----
    by_noc_label: dict[str, Counter] = defaultdict(Counter)
    for x in out_rows:
        if x["region_level"] == "economic_region":
            by_noc_label[x["noc"]][x["outlook"]] += 1

    def pick(noc: str, labels: set[str]) -> list[dict]:
        return [
            {
                "region": x["region"],
                "province": x["province"],
                "outlook": x["outlook"],
                "prior_outlook_2024_2026": x["prior_outlook_2024_2026"],
            }
            for x in out_rows
            if x["noc"] == noc and x["outlook"] in labels
        ]

    provincial = {
        noc: {
            x["province"]: x["outlook"]
            for x in out_rows
            if x["noc"] == noc and x["region_level"] == "province"
        }
        for noc in NOCS
    }
    ontario = {
        noc: [
            {
                "region": x["region"],
                "outlook": x["outlook"],
                "prior_outlook_2024_2026": x["prior_outlook_2024_2026"],
            }
            for x in out_rows
            if x["noc"] == noc and x["province"] == "ON"
        ]
        for noc in NOCS
    }
    changed = Counter(
        (x["prior_outlook_2024_2026"], x["outlook"])
        for x in out_rows
        if x["noc"] == PRIMARY_NOC
        and x["prior_outlook_2024_2026"]
        and x["prior_outlook_2024_2026"] != x["outlook"]
    )

    as_of = max((x["date"] for x in out_rows), default="")
    meta = {
        "source_urls": [
            DATASET_URL,
            URL_CURRENT,
            URL_PREVIOUS,
            METHODOLOGY_URL,
            WAGES_DATASET_URL,
            URL_WAGES,
        ],
        "licence": LICENCE,
        "retrieved": RETRIEVED,
        "as_of": as_of,
        "notes": (
            "ESDC Job Bank 3-year employment outlooks, 2025-2027 edition (NOC 2021), with the "
            "2024-2026 label for the same NOC and region for comparison. region_level='province' "
            "rows are province/territory-wide. outlook_score is our ordinal mapping for sorting "
            "(Very good=5 ... Very limited=1; Undetermined=null), not a Job Bank field. "
            "trend_excerpt is the first ~280 characters of Job Bank's narrative. "
            "'Good'/'Very good' = more job openings than job seekers expected (shortage signal); "
            "'Limited'/'Very limited' = more job seekers than openings. "
            "wage = Job Bank 2025 wages open data (hourly unless wage_unit says annual; "
            "low/high are roughly the 10th/90th percentiles per Job Bank), null where suppressed."
        ),
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            meta | {"count": len(out_rows), "rows": out_rows},
            indent=1,
            ensure_ascii=False,
        )
        + "\n"
    )

    summary = meta | {
        "nocs": NOCS,
        "economic_region_label_counts": {
            n: dict(c) for n, c in sorted(by_noc_label.items())
        },
        "provincial_outlooks": provincial,
        "ontario": ontario,
        "welder_shortage_regions": pick(PRIMARY_NOC, SHORTAGE_LABELS),
        "welder_limited_regions": pick(PRIMARY_NOC, SURPLUS_LABELS),
        "national_wages_2025": {
            noc: wages.get((noc, "CA")) for noc in NOCS if (noc, "CA") in wages
        },
        "welder_changes_vs_2024_2026": [
            {"from": a, "to": b, "regions": n} for (a, b), n in changed.most_common()
        ],
    }
    OUT_SUMMARY.write_text(json.dumps(summary, indent=1, ensure_ascii=False) + "\n")
    print(f"rows={len(out_rows)} as_of={as_of}")
    for n, c in sorted(by_noc_label.items()):
        print(n, NOCS[n], dict(c))
    print("ON welders:", ontario[PRIMARY_NOC])


if __name__ == "__main__":
    main()
