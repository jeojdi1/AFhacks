"""Job vacancies and offered wages for metal-fabrication trades (StatCan JVWS).

Source table: Statistics Canada, Table 14-10-0444-01, "Job vacancies and average offered
hourly wage by occupation (unit group), quarterly, unadjusted for seasonality"
(Job Vacancy and Wage Survey). Statistics Canada Open Licence.

Fetched with the StatCan Web Data Service (WDS), a few batched POSTs, not the 100 MB full
table. Raw responses are cached in data/raw/ (gitignored); rerun with --refresh to refetch.
Output: data/processed/national/job_vacancies.json

Run: .venv/bin/python scripts/ingest_jvws.py [--refresh]
"""

from __future__ import annotations

import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_META = ROOT / "data" / "raw" / "jvws_14100444_meta.json"
RAW_DATA = ROOT / "data" / "raw" / "jvws_14100444_data.json"
OUT = ROOT / "data" / "processed" / "national" / "job_vacancies.json"

PID = 14100444
TABLE_ID = "14-10-0444-01"
TABLE_URL = "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410044401"
WDS = "https://www150.statcan.gc.ca/t1/wds/rest/"
LICENCE = "Statistics Canada Open Licence (https://www.statcan.gc.ca/en/terms-conditions/open-licence)"
RETRIEVED = "2026-09-26"
LATEST_N = 8
BATCH = 250

# NOC 2021 unit group code -> WDS member id in this table (from getCubeMetadata).
NOC_MEMBERS = {
    "72106": 656,  # Welders and related machine operators
    "72100": 650,  # Machinists and machining and tooling inspectors
    "72102": 652,  # Sheet metal workers
    "72104": 654,  # Structural metal and platework fabricators and fitters
    "72400": 670,  # Construction millwrights and industrial mechanics
    "94105": 781,  # Metalworking and forging machine operators
    "94106": 782,  # Machining tool operators
    "00000": 1,  # Total, all occupations (context)
}
STATS = {1: "job_vacancies", 5: "avg_offered_hourly_wage"}
# StatCan status codes (getCodeSets): 3-8 are quality grades A-F.
STATUS = {
    0: None,
    1: "..",
    2: "0s",
    3: "A",
    4: "B",
    5: "C",
    6: "D",
    7: "E",
    8: "F",
    9: "...",
}


def post(method: str, body: list) -> list:
    req = urllib.request.Request(
        WDS + method,
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Shieldworks-research/0.1",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def fetch(refresh: bool) -> tuple[dict, list]:
    if refresh or not RAW_META.exists():
        RAW_META.write_text(json.dumps(post("getCubeMetadata", [{"productId": PID}])))
    meta = json.loads(RAW_META.read_text())[0]["object"]
    geos = [(m["memberId"], m["memberNameEn"]) for m in meta["dimension"][0]["member"]]
    if refresh or not RAW_DATA.exists():
        coords = [
            f"{g}.{n}.{s}.0.0.0.0.0.0.0"
            for g, _ in geos
            for n in NOC_MEMBERS.values()
            for s in STATS
        ]
        data: list = []
        for i in range(0, len(coords), BATCH):
            body = [
                {"productId": PID, "coordinate": c, "latestN": LATEST_N}
                for c in coords[i : i + BATCH]
            ]
            data.extend(post("getDataFromCubePidCoordAndLatestNPeriods", body))
            time.sleep(1)
        RAW_DATA.write_text(json.dumps(data))
    return meta, json.loads(RAW_DATA.read_text())


def main() -> None:
    meta, data = fetch("--refresh" in sys.argv)
    geo_dim = meta["dimension"][0]["member"]
    geo_name = {m["memberId"]: m["memberNameEn"] for m in geo_dim}
    geo_parent = {m["memberId"]: m.get("parentMemberId") for m in geo_dim}
    noc_by_member = {v: k for k, v in NOC_MEMBERS.items()}
    noc_name = {
        m["memberId"]: m["memberNameEn"] for m in meta["dimension"][1]["member"]
    }

    series: dict[tuple, dict] = {}
    for item in data:
        if item.get("status") != "SUCCESS":
            continue
        obj = item["object"]
        g, n, s = (int(x) for x in obj["coordinate"].split(".")[:3])
        key = (g, n)
        rec = series.setdefault(
            key,
            {
                "geo": geo_name[g],
                "geo_level": "canada"
                if g == 1
                else ("province" if geo_parent.get(g) == 1 else "economic_region"),
                "noc": noc_by_member[n],
                "occupation": noc_name[n],
                "quarters": {},
            },
        )
        for p in obj.get("vectorDataPoint", []):
            q = rec["quarters"].setdefault(p["refPer"], {})
            q[STATS[s]] = p["value"]
            q[STATS[s] + "_quality"] = STATUS.get(p["statusCode"], str(p["statusCode"]))

    rows = []
    for rec in series.values():
        quarters = [{"ref_period": k} | v for k, v in sorted(rec["quarters"].items())]
        vac = [q for q in quarters if q.get("job_vacancies") is not None]
        rec = {k: v for k, v in rec.items() if k != "quarters"}
        rec["quarters"] = quarters
        rec["latest_vacancies"] = vac[-1]["job_vacancies"] if vac else None
        rec["latest_period"] = vac[-1]["ref_period"] if vac else None
        rows.append(rec)
    rows.sort(key=lambda r: (r["noc"], r["geo_level"] != "canada", r["geo"]))
    rows = [
        r
        for r in rows
        if r["latest_vacancies"] is not None or r["geo_level"] != "economic_region"
    ]

    welders_on = [
        r
        for r in rows
        if r["noc"] == "72106"
        and (r["geo"] == "Ontario" or r["geo"].endswith(", Ontario"))
    ]
    as_of = max((r["latest_period"] or "" for r in rows), default="")
    out = {
        "source_urls": [TABLE_URL, WDS + "getDataFromCubePidCoordAndLatestNPeriods"],
        "table_id": TABLE_ID,
        "licence": LICENCE,
        "retrieved": RETRIEVED,
        "as_of": as_of,
        "notes": (
            f"Latest {LATEST_N} quarters (unadjusted) for Canada, provinces/territories and "
            "economic regions. Economic-region series with no published vacancy value in the "
            "window are dropped. *_quality is the StatCan data-quality grade (A excellent ... "
            "E use with caution; F / '..' not published). Values are StatCan's, rounded as "
            "published. ref_period is the first day of the quarter."
        ),
        "nocs": {k: noc_name[v] for k, v in NOC_MEMBERS.items()},
        "welders_ontario": [
            {
                "geo": r["geo"],
                "latest_period": r["latest_period"],
                "latest_vacancies": r["latest_vacancies"],
            }
            for r in welders_on
        ],
        "count": len(rows),
        "rows": rows,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"series={len(rows)} as_of={as_of}")
    for r in rows:
        if (
            r["noc"] in ("72106", "00000")
            and r["geo_level"] != "economic_region"
            or r in welders_on
        ):
            last = r["quarters"][-1] if r["quarters"] else {}
            print(
                r["noc"],
                r["geo"],
                r["latest_period"],
                r["latest_vacancies"],
                last.get("avg_offered_hourly_wage"),
            )


if __name__ == "__main__":
    main()
