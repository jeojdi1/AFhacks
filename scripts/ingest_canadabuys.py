"""Filter the CanadaBuys open tender notices CSV down to defence-related rows.

Input:  data/raw/openTenderNotice.csv  (downloaded once from SOURCE_URL; gitignored)
Output: data/processed/tenders_defence.json          (counts + <=25-row sample)
        data/processed/tenders_defence_summary.json  (counts only)

Source: Government of Canada, CanadaBuys open data (Open Government Licence - Canada).
Personal contact fields in the CSV (contact name / email / phone) are never read into outputs.

Run: .venv/bin/python scripts/ingest_canadabuys.py
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "openTenderNotice.csv"
OUT = ROOT / "data" / "processed" / "tenders_defence.json"
OUT_SUMMARY = ROOT / "data" / "processed" / "tenders_defence_summary.json"

SOURCE_URL = "https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv"
RETRIEVED = "2026-09-26"
SAMPLE_SIZE = 25

# Column names (bilingual headers as published).
C_TITLE = "title-titre-eng"
C_REF = "referenceNumber-numeroReference"
C_SOL = "solicitationNumber-numeroSollicitation"
C_CLOSE = "tenderClosingDate-appelOffresDateCloture"
C_PUB = "publicationDate-datePublication"
C_STATUS = "tenderStatus-appelOffresStatut-eng"
C_GSIN = "gsin-nibs"
C_GSIN_D = "gsinDescription-nibsDescription-eng"
C_UNSPSC = "unspsc"
C_UNSPSC_D = "unspscDescription-eng"
C_CAT = "procurementCategory-categorieApprovisionnement"
C_NOTICE = "noticeType-avisType-eng"
C_BUYER = "contractingEntityName-nomEntitContractante-eng"
C_END_USER = "endUserEntitiesName-nomEntitesUtilisateurFinal-eng"
C_REGION_DELIV = "regionsOfDelivery-regionsLivraison-eng"
C_REGION_OPP = "regionsOfOpportunity-regionAppelOffres-eng"
C_URL = "noticeURL-URLavis-eng"

# PSPC solicitation numbers starting W + 4 digits carry the DND client code. Reported
# separately (not folded into defence_buyer) so the headline stays buyer-name based.
DND_CLIENT_SOL_RE = re.compile(r"^W\d{4}")

DEFENCE_BUYER_RE = re.compile(
    r"national defence|\(DND\)|\bDND\b|canadian forces|canadian armed forces|"
    r"defence construction canada|défense nationale|"
    r"canadian army|royal canadian navy|royal canadian air force",
    re.IGNORECASE,
)

# Category -> (UNSPSC prefixes, GSIN prefixes, keyword regex on title + code descriptions)
CATEGORIES: dict[str, tuple[tuple[str, ...], tuple[str, ...], re.Pattern[str] | None]] = {
    "weapons_ammunition_armour": (
        ("4610", "4611", "4612", "4613", "4614"),
        ("N10", "N11", "N13", "N14", "N84"),
        re.compile(
            r"\b(weapons?|ammunition|ammo|munitions?|armou?r(ed)?|ballistic|rifles?|"
            r"pistols?|explosives?|small arms|body armour)\b",
            re.IGNORECASE,
        ),
    ),
    "military_general": (
        ("U003",),
        ("U003",),
        re.compile(
            r"\b(military|militari[sz]ed|armed forces|army|navy|RCN|RCAF|CAF|CFB|"
            r"soldiers?|NORAD|warships?|frigates?|tactical)\b",
            re.IGNORECASE,
        ),
    ),
    "vehicles_vessels_aircraft": (
        ("2510", "2511", "2513", "2517", "2518", "2520"),
        ("N15", "N16", "N19", "N20", "N23", "N24", "N25", "N26", "N28", "N29"),
        re.compile(
            r"\b(vehicles?|trucks?|trailers?|vessels?|boats?|aircraft|helicopters?|"
            r"drones?|UAVs?|submarines?)\b",
            re.IGNORECASE,
        ),
    ),
    "machining_welding_fabrication": (
        ("2324", "2325", "2326", "2327", "2329", "3112", "3113", "3114", "3136",
         "7312", "7316", "7318"),
        ("N34", "N95"),
        re.compile(
            r"\b(machin(ing|ed)|CNC|weld(ing|ed|s)?|fabricat(ion|ed|e)|sheet metal|"
            r"forg(ing|ings)|castings?|heat treat(ment)?|brazing)\b",
            re.IGNORECASE,
        ),
    ),
    "electrical_harness": (
        ("2612",),
        ("N61",),
        re.compile(
            r"\b(wire harness(es)?|wiring harness(es)?|harness(es)?|cable assembl(y|ies))\b",
            re.IGNORECASE,
        ),
    ),
}

# Order used to pick a single "primary" category for sample rows.
PRIMARY_ORDER = [
    "weapons_ammunition_armour",
    "machining_welding_fabrication",
    "electrical_harness",
    "vehicles_vessels_aircraft",
    "military_general",
    "defence_buyer",
]
# Sample preference: manufacturing-relevant goods first.
MANUFACTURING = {
    "weapons_ammunition_armour",
    "machining_welding_fabrication",
    "electrical_harness",
    "vehicles_vessels_aircraft",
}


def split_codes(value: str) -> list[str]:
    return [p.strip().lstrip("*").strip() for p in value.split("\n") if p.strip().lstrip("*").strip()]


def clean(value: str) -> str | None:
    v = " / ".join(split_codes(value)) if value else ""
    return v or None


def categorise(row: dict[str, str]) -> set[str]:
    cats: set[str] = set()
    buyers = f"{row.get(C_BUYER, '')} {row.get(C_END_USER, '')}"
    if DEFENCE_BUYER_RE.search(buyers):
        cats.add("defence_buyer")
    unspsc = split_codes(row.get(C_UNSPSC, ""))
    gsin = split_codes(row.get(C_GSIN, ""))
    text = " ".join([row.get(C_TITLE, ""), row.get(C_UNSPSC_D, ""), row.get(C_GSIN_D, "")])
    for name, (u_pref, g_pref, kw) in CATEGORIES.items():
        code_hit = any(c.startswith(u_pref) for c in unspsc) or any(
            c.startswith(g_pref) for c in gsin
        )
        if code_hit or (kw is not None and kw.search(text)):
            cats.add(name)
    # Civilian false positives (Coast Guard refits, buses, toilet trailers, "procurement
    # vehicle"): vehicles/vessels/aircraft only counts when the buyer is defence.
    if "defence_buyer" not in cats:
        cats.discard("vehicles_vessels_aircraft")
    return cats


def is_goods(row: dict[str, str]) -> bool:
    return "GD" in split_codes(row.get(C_CAT, ""))


def primary(cats: set[str]) -> str:
    for name in PRIMARY_ORDER:
        if name in cats:
            return name
    return "other"


def main() -> None:
    with RAW.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        columns = list(reader.fieldnames or [])
        rows = list(reader)

    open_rows = [r for r in rows if r.get(C_STATUS, "").strip().lower() in ("open", "")]
    by_category: Counter[str] = Counter()
    by_region: Counter[str] = Counter()
    by_notice: Counter[str] = Counter()
    defence: list[tuple[dict[str, str], set[str]]] = []
    for r in open_rows:
        cats = categorise(r)
        if not cats:
            continue
        defence.append((r, cats))
        by_category.update(cats)
        for reg in split_codes(r.get(C_REGION_DELIV, "")) or ["(not stated)"]:
            by_region[reg] += 1
        by_notice[r.get(C_NOTICE, "").strip() or "(not stated)"] += 1

    def closing_live(r: dict[str, str]) -> bool:
        return r.get(C_CLOSE, "")[:10] >= RETRIEVED

    live = [(r, c) for r, c in defence if closing_live(r)]
    defence_buyer_rows = [(r, c) for r, c in defence if "defence_buyer" in c]
    db_goods = [(r, c) for r, c in defence_buyer_rows if is_goods(r)]
    db_goods_live = [(r, c) for r, c in db_goods if closing_live(r)]
    db_mfg_goods = [(r, c) for r, c in db_goods if c & MANUFACTURING]
    db_mfg_goods_live = [(r, c) for r, c in db_mfg_goods if closing_live(r)]
    dnd_client_code_only = [
        r for r in open_rows
        if DND_CLIENT_SOL_RE.match(r.get(C_SOL, "").strip())
        and not DEFENCE_BUYER_RE.search(f"{r.get(C_BUYER, '')} {r.get(C_END_USER, '')}")
    ]
    defence_buyer_mfg = [
        (r, c) for r, c in defence if "defence_buyer" in c and c & MANUFACTURING
    ]
    core_defence = [
        (r, c) for r, c in defence
        if c & {"defence_buyer", "weapons_ammunition_armour", "military_general"}
    ]

    # Sample: live tenders, manufacturing-relevant + defence buyer first, then soonest closing.
    def rank(item: tuple[dict[str, str], set[str]]) -> tuple[int, int, str]:
        r, c = item
        return (
            0 if (is_goods(r) and c & MANUFACTURING) else 1,
            0 if is_goods(r) else 1,
            0 if "defence_buyer" in c else 1,
            r.get(C_CLOSE, ""),
        )

    sample = []
    for r, c in sorted(live, key=rank)[:SAMPLE_SIZE]:
        buyer = clean(r.get(C_BUYER, ""))
        end_user = clean(r.get(C_END_USER, ""))
        sample.append({
            "title": r.get(C_TITLE, "").strip() or None,
            "reference_number": r.get(C_REF, "").strip() or None,
            "solicitation_number": r.get(C_SOL, "").strip() or None,
            "buyer": buyer,
            "end_user": end_user if end_user and end_user != buyer else None,
            "closing_date": r.get(C_CLOSE, "").strip() or None,
            "category": primary(c),
            "categories": sorted(c),
            "notice_type": r.get(C_NOTICE, "").strip() or None,
            "procurement_category": clean(r.get(C_CAT, "")),
            "unspsc": clean(r.get(C_UNSPSC_D, "")),
            "region": clean(r.get(C_REGION_DELIV, "")) or clean(r.get(C_REGION_OPP, "")),
            "url": r.get(C_URL, "").strip() or None,
        })

    counts = {
        "source_url": SOURCE_URL,
        "retrieved": RETRIEVED,
        "latest_publication_date_in_file": max((r.get(C_PUB, "") for r in rows), default=None),
        "total_rows_in_file": len(rows),
        "total_open_tenders": len(open_rows),
        "distinct_solicitations_in_file": len({r.get(C_SOL, "").strip() for r in rows if r.get(C_SOL, "").strip()}),
        "columns_count": len(columns),
        "defence_buyer_count": len(defence_buyer_rows),
        "defence_related_count": len(defence),
        "defence_related_closing_on_or_after_retrieved": len(live),
        "core_defence_count": len(core_defence),
        "defence_buyer_manufacturing_count": len(defence_buyer_mfg),
        "defence_buyer_goods_all": len(db_goods),
        "defence_buyer_goods_closing_on_or_after_retrieved": len(db_goods_live),
        "defence_buyer_mfg_goods_notices": len(db_mfg_goods),
        "defence_buyer_mfg_goods_distinct_solicitations": len({r.get(C_SOL, "").strip() for r, _ in db_mfg_goods}),
        "defence_buyer_mfg_goods_still_open_by_date": len(db_mfg_goods_live),
        "dnd_client_code_not_in_defence_buyer": len(dnd_client_code_only),
        "by_category": dict(by_category.most_common()),
        "by_region_of_delivery": dict(by_region.most_common()),
        "by_notice_type": dict(by_notice.most_common()),
        "definitions": {
            "defence_related": "any category hit: buyer or end user is DND / Canadian Forces / "
            "Canadian Army / RCN / RCAF / Defence Construction Canada, OR UNSPSC/GSIN code or title "
            "matches weapons/ammunition/armour, military, machining/welding/fabrication, or "
            "electrical harness; vehicles/vessels/aircraft counts only with a defence buyer. "
            "Keyword categories still include civilian matches; use defence_buyer_count for pitch.",
            "defence_buyer": "buyer or end user name matches DND / CAF / Canadian Army / RCN / RCAF "
            "/ Defence Construction Canada (the pitch figure)",
            "goods": "procurementCategory contains GD (SRV and CNST excluded)",
            "defence_buyer_mfg_goods": "defence buyer AND goods (GD) AND a manufacturing category; "
            "note many machining matches are DND buying machine tools, not machined parts",
            "dnd_client_code_not_in_defence_buyer": "open notices whose solicitation number starts "
            "W+4 digits (DND client code) but whose buyer/end user name is not defence; not counted",
            "core_defence": "defence_buyer OR weapons_ammunition_armour OR military_general",
            "defence_buyer_manufacturing": "defence buyer AND a goods category "
            "(weapons, machining/welding/fabrication, harness, vehicles/vessels/aircraft)",
            "categories_overlap": True,
        },
    }
    counts["pitch"] = {
        "pitch_1": (
            f"As of {RETRIEVED}, CanadaBuys lists {len(open_rows)} open federal tender notices, and "
            f"{len(defence_buyer_rows)} of them are issued by or for the Department of National "
            "Defence / Canadian Armed Forces (including the Canadian Army) or Defence Construction "
            f"Canada (source: CanadaBuys open tender notices open data, file retrieved {RETRIEVED})."
        ),
        "pitch_2": (
            f"Right now, {len(db_mfg_goods_live)} DND/CAF goods tender notices still before their "
            "closing date ask for vehicle, vessel and aircraft spares, electrical cables, trailers "
            "and similar hardware: live demand Canadian suppliers could bid on if someone matched "
            f"them to it ({len(db_mfg_goods)} notices / {len(db_mfg_goods)-len(db_mfg_goods_live)} "
            f"past closing / {len({r.get(C_SOL, '').strip() for r, _ in db_mfg_goods})} distinct "
            "solicitations; goods = procurementCategory GD; source: CanadaBuys open tender "
            f"notices CSV, retrieved {RETRIEVED})."
        ),
        "do_not_use": [
            "the old '451 defence-related' figure (inflated by civilian keyword matches)",
            "the old '81 manufactured goods' figure (included services/construction)",
        ],
        "caveat": "Many machining matches are DND buying machine tools (milling machines, lathe), "
        "not buying machined parts. Most rows have no noticeURL in the CSV; cite reference_number.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({**counts, "columns": columns, "sample": sample}, indent=2,
                              ensure_ascii=False) + "\n")
    OUT_SUMMARY.write_text(json.dumps(counts, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({k: v for k, v in counts.items() if k != "definitions"}, indent=2))


if __name__ == "__main__":
    main()
