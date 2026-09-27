"""Who already does defence work: National Defence contracts over $10,000, by vendor.

Input (downloaded once into data/raw/, gitignored; run with --download to fetch):
  data/raw/contracts.csv             Proactive Publication - Contracts over $10,000
  data/raw/nibs-gsin.csv             GSIN code list (descriptions)
  data/raw/nibsunspsc-gsinunspsc.csv GSIN-UNSPSC mapping (UNSPSC descriptions)

Output:
  data/processed/national/dnd_contract_vendors.json   per-vendor aggregates
  data/processed/national/dnd_contracts_summary.json  totals and top lists

Method
  * Stream the government-wide CSV, keep owner_org == "dnd-mdn", instrument_type C
    (contract / call-up) or A (amendment), contract_date 2021-01-01 .. RETRIEVED.
    SOSA rows (standing offers / supply arrangements) are agreements, not commitments,
    and are excluded.
  * De-duplicate: one contract = (procurement_id, normalized vendor). Amendment rows
    carry the amended total in contract_value (TBS guide), so the value of a contract
    is contract_value of its most recently reported row.
  * Vendors whose name looks like an individual (e.g. "SMITH, JOHN", "Dr. Jane Doe",
    "John Smith Consulting") are dropped before aggregation and only counted.
  * Personal fields in the source (buyer_name, which holds DND staff names, emails and
    phones) are never read. Free-text comments are used for keyword flags only and
    never written out.

Values are reported contract values (hard commitments incl. taxes, options and
amendments), not payments. Source: Government of Canada, Open Government Licence -
Canada.

Run: .venv/bin/python scripts/ingest_dnd_contracts.py [--download]
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
RAW = RAW_DIR / "contracts.csv"
RAW_GSIN = RAW_DIR / "nibs-gsin.csv"
RAW_UNSPSC = RAW_DIR / "nibsunspsc-gsinunspsc.csv"
OUT_DIR = ROOT / "data" / "processed" / "national"
OUT_VENDORS = OUT_DIR / "dnd_contract_vendors.json"
OUT_SUMMARY = OUT_DIR / "dnd_contracts_summary.json"

DATASET_URL = (
    "https://open.canada.ca/data/en/dataset/d8f85d91-7dec-4fd1-8055-483b77225d8b"
)
CSV_URL = (
    "https://open.canada.ca/data/dataset/d8f85d91-7dec-4fd1-8055-483b77225d8b/"
    "resource/fac950c0-00d5-4ec1-a4d3-9cbebf98a305/download/contracts.csv"
)
SCHEMA_URL = "https://open.canada.ca/data/recombinant-published-schema/contracts.json"
GSIN_URL = "https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/aev-bas/nibs-gsin.csv"
UNSPSC_URL = (
    "https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/aev-bas/nibsunspsc-gsinunspsc.csv"
)
GUIDE_URL = "https://www.tbs-sct.canada.ca/pol/doc-eng.aspx?id=32763"
LICENCE = "Open Government Licence - Canada (https://open.canada.ca/en/open-government-licence-canada)"
RETRIEVED = "2026-09-26"
START_DATE = "2021-01-01"
OWNER = "dnd-mdn"
TOP_N_BY_VALUE = 3000
TOP_MFG_SUMMARY = 25

PROVINCE_BY_FSA_LETTER = {
    "A": "NL",
    "B": "NS",
    "C": "PE",
    "E": "NB",
    "G": "QC",
    "H": "QC",
    "J": "QC",
    "K": "ON",
    "L": "ON",
    "M": "ON",
    "N": "ON",
    "P": "ON",
    "R": "MB",
    "S": "SK",
    "T": "AB",
    "V": "BC",
    "X": "NT/NU",
    "Y": "YT",
}
FSA_RE = re.compile(r"^[ABCEGHJKLMNPRSTVXY]\d[A-Z]$")

# --------------------------------------------------------------------------------------
# Manufacturing-relevant commodity flags.
# Each flag: GSIN prefixes, UNSPSC prefixes, keyword regex (matched against the DND
# economic-object description, GSIN/UNSPSC description and the free-text comment).
# A flag marks what DND bought from the vendor, not a verified shop capability.
# --------------------------------------------------------------------------------------
MFG_FLAGS: dict[str, tuple[tuple[str, ...], tuple[str, ...], re.Pattern[str]]] = {
    "machining": (
        (),
        ("3123", "3127", "3129", "3130", "3139", "731810"),
        re.compile(
            r"\bmachin(ing|ed)\b|\bcnc\b|machine shop|screw machine", re.IGNORECASE
        ),
    ),
    "fabrication": (
        ("N9535", "N9540", "N5340", "N5680"),
        ("3110", "3128", "3131", "3132", "3133", "3134", "3135", "3136"),
        re.compile(
            r"(?<!pre)fabricat|sheet metal|weldment|metal stamping|forgings?\b|"
            r"\bcastings\b|metal (parts|components|structures?)",
            re.IGNORECASE,
        ),
    ),
    "welding": (
        ("N3431", "N3432", "N3433", "N3436", "N3438", "N3439"),
        ("2327", "731819", "3128170"),
        re.compile(r"\bweld|\bbrazing\b|\bsoldering\b", re.IGNORECASE),
    ),
    "vehicle_parts": (
        (
            "N25",
            "N2610",
            "N2805",
            "N2815",
            "N2910",
            "N2920",
            "N2930",
            "N2940",
            "N2990",
            "N3010",
            "N3020",
            "N4720",
        ),
        ("2517", "2618"),
        re.compile(
            r"(road motor |military )?vehicles? parts|vehicular (component|equipment)|"
            r"vehicle components?|vehicles parts|truck parts|automotive parts",
            re.IGNORECASE,
        ),
    ),
    "cables_harnesses": (
        ("N6145", "N6150", "N5995", "N6015", "N6020", "N6060", "N5935"),
        ("2612",),
        re.compile(
            r"wir(e|ing) harness|cable assembl|\bharness(es)?\b|"
            r"electrical (wire|cable)|wire and cable, electrical",
            re.IGNORECASE,
        ),
    ),
    "coatings": (
        ("N8010", "N8030", "N8040"),
        ("3121", "731811", "731813", "3120"),
        re.compile(
            r"\bcoating|\bpaints?\b|powder coat|\bplating\b|anodi[sz]|galvani[sz]|"
            r"sandblast|abrasive blast|corrosion protection",
            re.IGNORECASE,
        ),
    ),
    "fasteners": (
        ("N5305", "N5306", "N5307", "N5310", "N5315", "N5320", "N5325"),
        ("311615", "311616", "311617", "311618", "311619", "311620"),
        re.compile(
            r"fasteners?|\bbolts?\b|\bnuts?\b|\bscrews?\b|\brivets?\b|washers?",
            re.IGNORECASE,
        ),
    ),
}
# Keyword matches on the free-text comment alone are noisy ("cables" in IT orders,
# "paint" in building work); these economic objects veto keyword-only matches.
NON_MFG_OBJECT_RE = re.compile(
    r"information technology|computer|software|telecommunic|communications/network|"
    r"buildings?|construction|engineering consult|professional services|"
    r"business services|rental|tuition|training|cleaning|fuel|food|travel",
    re.IGNORECASE,
)

# --------------------------------------------------------------------------------------
# Person-name detection (vendors that are individuals are dropped, never written out).
# --------------------------------------------------------------------------------------
_GIVEN_NAMES_TEXT = """
    aaron abdul abdullah adam adrian adrien ahmed aidan alain alan albert alex
    alexander alexandra alexandre alexis alfred ali alice alicia alison allan
    allison amanda amber amelie amy andre andrea andreas andrew andy angela angelo
    anita ann anna anne annie anthony antoine antonio april arnaud arthur ashley
    audrey barbara barry ben benjamin benoit bernard beth betty bill blair bob
    bonnie brad bradley brandon brenda brendan brent brian bridget brigitte bruce
    bruno bryan caitlin caleb cameron camille carl carla carlos carmen carol
    caroline carolyn carrie catherine cathy cedric celine chad chantal charlene
    charles charlotte chelsea cheryl chris christian christina christine christopher
    claire claude claudia clement colin connor craig cynthia dale damien dan dana
    daniel danielle danny darcy darren dave david dawn dean debbie deborah denis
    denise dennis derek diana diane dominic dominique don donald donna doug douglas
    dustin dylan earl ed eddie edward eileen elaine eleanor elena elizabeth ellen
    emily emma eric erica erik erin eugene eva evan fatima felix fernand florence
    francine francis francois frank fred frederic frederick gabriel gail gary gavin
    genevieve geoff geoffrey george gerald gerard gilbert gilles gina glen glenn
    gordon grace graham greg gregory guillaume guy hannah harold harry heather helen
    helene henri henry holly howard hugh hugo ian isabelle jack jackie jacob
    jacqueline jacques jake james jamie jan jane janet janice jason jean jeanne
    jeannie jeff jeffrey jennifer jenny jeremy jerome jerry jesse jessica jill jim
    jimmy joan joanne jocelyn jodi jody joe joel johanne john johnny jon jonathan
    jordan jose josee joseph josh joshua joyce judith judy julia julian julie julien
    justin karen karine karl kate katherine kathleen kathy katie keith kelly ken
    kenneth kevin kim kimberly kirk kristen kurt kyle lana lance larry laura lauren
    laurent lawrence leah lee leo leonard lesley leslie liam linda lindsay lisa
    logan lois lorraine louis louise luc lucas lucie luke lynn lynne madeleine
    maggie manon marc marcel marco margaret maria marie marilyn mario marion mark
    martha martin mary mathieu matt matthew maureen max maxime megan melanie melissa
    michael michel michele michelle mike mohamed mohammad mohammed monica monique
    morgan nancy natalie nathalie nathan neil nicholas nick nicolas nicole noah norm
    norman olivia olivier omar pamela pascal pat patricia patrick paul paula pauline
    peggy peter philip philippe phillip pierre rachel ralph randy raymond rebecca
    regis rene renee richard rick rob robert roberta robin rod roger roland ron
    ronald rose ross roy russell ruth ryan sabrina sally sam samantha samuel sandra
    sandy sara sarah scott sean sebastien serge shane shannon sharon shawn sheila
    shelley sherry simon sonia sophie stacey stacy stephane stephanie stephen steve
    steven stuart susan suzanne sylvain sylvie tammy tanya tara ted terry theresa
    thomas tim timothy tina todd tom tommy tony tracy travis trevor troy tyler
    valerie vanessa victor victoria vincent virginie vladimir walter wanda wayne
    wendy william yan yannick yves zachary
"""
GIVEN_NAMES = set(_GIVEN_NAMES_TEXT.split())
HONORIFIC_RE = re.compile(
    r"^(mr|mrs|ms|miss|dr|prof|professor|mme|mlle|m)\.?\s+", re.IGNORECASE
)
# Words that make a name a business even if it contains a given name.
BUSINESS_RE = re.compile(
    r"\b(inc|incorporated|ltd|ltee|limited|limitee|llc|llp|lp|gp|ulc|corp|corporation|"
    r"co|company|compagnie|cie|group|groupe|gmbh|ag|sa|sas|srl|bv|ab|plc|pty|oy|kg|nv|"
    r"canada|canadian|international|global|industries|industrial|enterprises?|"
    r"entreprises?|holdings|partners|partnership|associates|university|universite|"
    r"college|institute|institut|society|societe|association|centre|center|foundation|"
    r"fondation|agency|government|department|ministry|city|town|county|first nation|"
    r"hospital|hotel|inn|club|school|academy|press|shipbuilding|shipyards?|aerospace|"
    r"defence|defense|dynamics|technologies|technology|systems|solutions|services|"
    r"oil|fuels?|energy|power|motors|electric|metals|steel|marine|aviation|airlines?|"
    r"airways|transport|logistics|equipment|machinery|supply|supplies|distribution|"
    r"software|labs?|laboratories|research|media|studios?|network|communications?|"
    r"health|medical|pharma|foods?|catering|rentals?|leasing|trucking|bros|brothers|"
    r"sons|fils|freres|and|et|of|the|de|du|des|la|le|tech|tec|technologie|"
    r"instruments?|chemicals?|airport|sanitation|enclosures?|drilling|enterprizes|"
    r"cordages|nettoyeur|nettoyage|garage|pneus|meubles|boutique|atelier|usinage|"
    r"soudure|look|fitness|matting|homestore|containers?|business|foodservice|dealership|ford|chevrolet|toyota|honda|gm|"
    r"chrysler|dodge|nissan|hyundai|kia|mazda|subaru|volkswagen|manufacturing|manufacturier|mfg|constructors?|fabricators?|machine)\b",
    re.IGNORECASE,
)
# Trade words typical of sole proprietors trading under their own name.
SOLE_PROP_RE = re.compile(
    r"\b(consulting|consultant|consultants|contracting|contractor|construction|painting|"
    r"plumbing|electrical|welding|machining|trucking|landscaping|renovations?|"
    r"carpentry|cleaning|photography|design|translation|training|coaching|counselling|"
    r"advisory|fencing|developments?|roofing|excavation|refrigeration|enr|enrg|reg|"
    r"registered)\b",
    re.IGNORECASE,
)
# Real companies whose names parse like a person's.
NOT_PERSON = {
    "LOCKHEED MARTIN",
    "PITNEY BOWES",
    "BOOZ ALLEN HAMILTON",
    "ERNST YOUNG",
    "ELI LILLY",
    "JOHN DEERE",
    "MARY KAY",
    "IRVING",
    "JAMES RIVER",
    "HARRIS",
    "PETER KIEWIT",
    "DOUGLAS LAKE",
    "WALTER SURFACE",
    "ALLAN CANDY",
    "HENRY SCHEIN",
    "GEORGE BROWN",
    "KEITH ELECTRIC",
    "LEON",
    "LEONS",
    "MARTIN BAKER",
    "ROLLS ROYCE",
    "DONNA CON",
    "RUSSELL HENDRIX",
}


def _ascii(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


LEGAL_RE = re.compile(
    r"\b(inc|incorporated|ltd|ltee|limited|limitee|llc|llp|ulc|corp|corporation|co|"
    r"company|gmbh|ag|sa|sas|srl|bv|ab|plc|pty|oy|kg|nv)\b\.?",
    re.IGNORECASE,
)


def looks_like_person(raw: str) -> bool:
    name = _ascii(raw).strip()
    if not name:
        return False
    up = " ".join(re.sub(r"[^A-Z ]", " ", name.upper()).split())
    if any(up.startswith(k) for k in NOT_PERSON):
        return False
    has_biz = bool(BUSINESS_RE.search(name))
    tokens = [t.strip(".").lower() for t in re.split(r"[\s,]+", name) if t.strip(".")]
    # Honorifics: "Mr Tom Smith", "Dr. Jane Doe", "Dr. Doe, University of X".
    # Bare "MS"/"MRS"/"M" (often initials of a company) need a given name after them.
    hm = HONORIFIC_RE.match(name)
    if hm and len(tokens) >= 2:
        title = hm.group(1).lower()
        nxt = tokens[1]
        if nxt in GIVEN_NAMES:
            return True
        if title in ("dr", "prof", "professor") and not LEGAL_RE.search(name):
            return True
        if (
            title in ("mr", "mrs", "ms")
            and not has_biz
            and name[1:2].islower()
            and len(tokens) >= 3
        ):
            return True
    # "Gregory Kerr Limited", "Charles Lindsay 2017": a person's name plus only a
    # legal suffix or year is still a person's name
    core = re.sub(r"\b(19|20)\d\d\b", " ", LEGAL_RE.sub(" ", name))
    core = " ".join(re.sub(r"[.,&]", " ", core).split())
    if core != " ".join(name.replace(".", " ").replace(",", " ").split()):
        ct = core.lower().split()
        if (
            2 <= len(ct) <= 3
            and all(re.fullmatch(r"[a-z'\-]+", t) for t in ct)
            and ct[0].split("-")[0] in GIVEN_NAMES
            and not BUSINESS_RE.search(core)
            and not SOLE_PROP_RE.search(core)
            and all(len(t) == 1 or t in GIVEN_NAMES for t in ct[1:-1])
        ):
            return True
    if re.search(r"\d", name):
        return False  # numbered companies, contract numbers
    # Acronym token inside a mixed-case name ("Raymond EMC Enclosures") = business
    if not name.isupper() and any(re.fullmatch(r"[A-Z]{2,5}", t) for t in name.split()):
        return False
    # "SMITH, JOHN" / "Smith, John A."
    if "," in name and not has_biz:
        left, right = (x.strip() for x in name.split(",", 1))
        rt = right.replace(".", " ").split()
        if (
            re.fullmatch(r"[A-Za-z'\- ]+", left)
            and rt
            and len(left.split()) <= 2
            and (
                rt[0].lower() in GIVEN_NAMES
                or (len(rt[0]) == 1 and rt[0].lower() != "a")
            )
        ):
            return True
    words = [t for t in tokens if re.fullmatch(r"[a-z'\-]+", t)]
    if len(words) != len(tokens) or not 2 <= len(tokens) <= 4:
        return False
    first = tokens[0].split("-")[0]
    initial = len(tokens[0]) == 1 and tokens[0] != "a"
    sole = bool(SOLE_PROP_RE.search(name))
    if has_biz:
        return False
    if not sole:
        # "John Smith", "John A. Smith", "J. Smith", "J A Larue", "Jean-Pierre Tremblay"
        if first in GIVEN_NAMES or initial:
            return len(tokens) <= 3 and all(
                len(t) == 1 or t in GIVEN_NAMES for t in tokens[1:-1]
            )
        # "SMITH JOHN" (all caps, surname first) as used in some financial systems
        return name.isupper() and len(tokens) == 2 and tokens[1] in GIVEN_NAMES
    # "John Smith Consulting" (given name + surname + trade word, nothing else)
    return (first in GIVEN_NAMES or initial) and 3 <= len(tokens) <= 4


# --------------------------------------------------------------------------------------
# Vendor normalization
# --------------------------------------------------------------------------------------
LEGAL_SUFFIXES = {
    "INC",
    "INCORPORATED",
    "INCORPOREE",
    "LTD",
    "LTEE",
    "LIMITED",
    "LIMITEE",
    "CORP",
    "CORPORATION",
    "CO",
    "COMPANY",
    "ULC",
    "LLC",
    "LP",
    "LLP",
    "GP",
    "PLC",
    "GMBH",
    "AG",
    "SA",
    "SAS",
    "BV",
    "AB",
    "AS",
    "OY",
    "SRL",
    "SPA",
    "PTY",
    "KG",
    "NV",
    "LTD.",
    "CIE",
}


def normalize_vendor(raw: str) -> str:
    s = _ascii(raw).upper().replace("&", " AND ")
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    toks = s.split()
    if toks and toks[0] == "THE":
        toks = toks[1:]
    while len(toks) > 1 and toks[-1] in LEGAL_SUFFIXES:
        toks.pop()
    return " ".join(toks)


# --------------------------------------------------------------------------------------
# Commodity descriptions
# --------------------------------------------------------------------------------------
def load_code_maps() -> tuple[dict[str, str], dict[str, str]]:
    gsin: dict[str, str] = {}
    with RAW_GSIN.open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            gsin[r["nibs-gsin"].strip().upper()] = r["gsin-description_en"].strip()
    unspsc: dict[str, str] = {}
    with RAW_UNSPSC.open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            unspsc[r["UNSPSC-Code"].strip()] = r["UNSPSC-Description-eng"].strip()
            g = r["GSINCode-NIBSCode"].strip().upper()
            if g and g not in gsin:
                gsin[g] = r["GSINDescription-NIBSDescription-eng"].strip()
    return gsin, unspsc


def describe_code(code: str, gsin: dict[str, str], unspsc: dict[str, str]) -> str:
    code = code.strip().upper()
    if not code or code in {"0", "NA", "#"}:
        return ""
    if code.isdigit() and len(code) >= 6:
        padded = code[:8].ljust(8, "0")
        for n in (8, 6, 4, 2):
            key = padded[:n].ljust(8, "0")
            if key in unspsc:
                return unspsc[key]
        return ""
    for n in range(len(code), 1, -1):
        if code[:n] in gsin:
            return gsin[code[:n]]
    return ""


def is_unspsc(code: str) -> bool:
    return code.isdigit() and len(code) >= 6


def flags_for(
    code: str, obj_desc: str, code_desc: str, comment: str, ctype: str
) -> set[str]:
    code = code.strip().upper()
    out: set[str] = set()
    controlled = f"{obj_desc} | {code_desc}"
    veto = bool(NON_MFG_OBJECT_RE.search(obj_desc))
    for flag, (gsin_p, unspsc_p, kw) in MFG_FLAGS.items():
        if is_unspsc(code):
            if code.startswith(unspsc_p):
                out.add(flag)
                continue
        elif gsin_p and code.startswith(gsin_p):
            out.add(flag)
            continue
        if veto:
            continue
        # free-text comments only count on goods contracts ("limited fabrication"
        # inside an engineering-services scope is not a fabrication purchase)
        if kw.search(controlled) or (ctype == "G" and kw.search(comment)):
            out.add(flag)
    return out


# --------------------------------------------------------------------------------------
def fnum(v: str) -> float:
    try:
        return float(v.replace(",", "").replace("$", "")) if v else 0.0
    except ValueError:
        return 0.0


def download() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for url, dest in ((CSV_URL, RAW), (GSIN_URL, RAW_GSIN), (UNSPSC_URL, RAW_UNSPSC)):
        if dest.exists():
            print(f"exists: {dest.relative_to(ROOT)}")
            continue
        print(f"downloading {url}")
        urllib.request.urlretrieve(url, dest)


def read_contracts() -> tuple[dict[tuple[str, str], dict], dict]:
    """Return {(procurement_id, vendor_norm): latest row (trimmed)} and scan stats."""
    keep = (
        "procurement_id",
        "reference_number",
        "vendor_name",
        "vendor_postal_code",
        "contract_date",
        "description_en",
        "contract_value",
        "commodity_type",
        "commodity_code",
        "country_of_vendor",
        "reporting_period",
        "instrument_type",
        "additional_comments_en",
        "solicitation_procedure",
    )
    latest: dict[tuple[str, str], dict] = {}
    stats: Counter = Counter()
    max_rp = ""
    with RAW.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            stats["rows_all"] += 1
            if row["owner_org"] != OWNER:
                continue
            stats["rows_dnd"] += 1
            max_rp = max(max_rp, row["reporting_period"])
            if row["instrument_type"] not in ("C", "A"):
                stats["rows_dnd_sosa_skipped"] += 1
                continue
            d = row["contract_date"][:10]
            if not (START_DATE <= d <= RETRIEVED):
                continue
            stats["rows_dnd_kept"] += 1
            r = {k: (row.get(k) or "").strip() for k in keep}
            vnorm = normalize_vendor(r["vendor_name"])
            pid = r["procurement_id"] or r["reference_number"]
            key = (pid, vnorm)
            order = (
                r["reporting_period"],
                r["instrument_type"] == "A",
                r["reference_number"],
            )
            cur = latest.get(key)
            if cur is None or order >= cur["_order"]:
                r["_order"] = order
                r["_rows"] = (cur["_rows"] + 1) if cur else 1
                latest[key] = r
            else:
                cur["_rows"] += 1
    stats["max_reporting_period"] = max_rp  # type: ignore[assignment]
    return latest, stats


def province_of(fsa: str, country: str) -> str:
    fsa = fsa.upper().replace(" ", "")[:3]
    if FSA_RE.match(fsa):
        return PROVINCE_BY_FSA_LETTER[fsa[0]]
    if fsa == "NA" or (country and country.upper() != "CA"):
        return "outside Canada"
    return "unknown"


_STOP_TEXT = """
    and or of the for to in on with not elsewhere specified including includes all
    related parts other misc miscellaneous etc excluding nes services service
"""
STOP = set(_STOP_TEXT.split())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true", help="fetch missing raw files")
    args = ap.parse_args()
    if args.download:
        download()
    for p in (RAW, RAW_GSIN, RAW_UNSPSC):
        if not p.exists():
            sys.exit(f"missing {p.relative_to(ROOT)}; run with --download")

    gsin, unspsc = load_code_maps()
    contracts, stats = read_contracts()

    # ---- person filter ------------------------------------------------------------
    person_cache: dict[str, bool] = {}
    dropped_vendors: set[str] = set()
    dropped_value = 0.0
    dropped_contracts = 0
    kept: list[dict] = []
    for (_pid, vnorm), r in contracts.items():
        raw = r["vendor_name"]
        if raw not in person_cache:
            person_cache[raw] = looks_like_person(raw)
        if person_cache[raw] or not vnorm:
            dropped_vendors.add(vnorm or "<blank>")
            dropped_contracts += 1
            dropped_value += fnum(r["contract_value"])
            continue
        r["_vnorm"] = vnorm
        kept.append(r)

    # ---- aggregate ------------------------------------------------------------------
    vendors: dict[str, dict] = {}
    by_year: dict[str, list[float]] = defaultdict(lambda: [0.0, 0])
    by_prov: dict[str, dict] = defaultdict(
        lambda: {"value": 0.0, "contracts": 0, "vendors": set()}
    )
    by_family: dict[str, list[float]] = defaultdict(lambda: [0.0, 0])
    by_type: dict[str, list[float]] = defaultdict(lambda: [0.0, 0])
    by_flag: dict[str, dict] = defaultdict(
        lambda: {"value": 0.0, "contracts": 0, "vendors": set()}
    )
    type_names = {"G": "Goods", "S": "Services", "C": "Construction"}
    total_value = 0.0
    min_date, max_date = "9999", "0000"

    for r in kept:
        v = fnum(r["contract_value"])
        d = r["contract_date"][:10]
        code = r["commodity_code"].upper()
        code_desc = describe_code(code, gsin, unspsc)
        obj = r["description_en"]
        flags = flags_for(
            code, obj, code_desc, r["additional_comments_en"], r["commodity_type"]
        )
        fsa = r["vendor_postal_code"].upper().replace(" ", "")[:3]
        prov = province_of(fsa, r["country_of_vendor"])

        total_value += v
        min_date, max_date = min(min_date, d), max(max_date, d)
        by_year[d[:4]][0] += v
        by_year[d[:4]][1] += 1
        by_family[obj or "(blank)"][0] += v
        by_family[obj or "(blank)"][1] += 1
        t = type_names.get(r["commodity_type"], "unknown")
        by_type[t][0] += v
        by_type[t][1] += 1

        a = vendors.get(r["_vnorm"])
        if a is None:
            a = vendors[r["_vnorm"]] = {
                "names": Counter(),
                "value": 0.0,
                "contracts": 0,
                "first": d,
                "last": d,
                "fsa": Counter(),
                "prov": Counter(),
                "country": Counter(),
                "codes": Counter(),
                "objs": Counter(),
                "kw": Counter(),
                "flags": defaultdict(lambda: [0.0, 0]),
                "years": Counter(),
                "sole_source": 0,
            }
        a["names"][r["vendor_name"]] += max(v, 1.0)
        a["value"] += v
        a["contracts"] += 1
        a["first"], a["last"] = min(a["first"], d), max(a["last"], d)
        if FSA_RE.match(fsa):
            a["fsa"][fsa] += 1
        a["prov"][prov] += 1
        if r["country_of_vendor"]:
            a["country"][r["country_of_vendor"].upper()] += 1
        if code and code not in {"0", "NA", "#"}:
            a["codes"][(code, code_desc)] += v
        if obj:
            a["objs"][obj] += v
        for w in re.findall(r"[a-z]{4,}", f"{obj} {code_desc}".lower()):
            if w not in STOP:
                a["kw"][w] += 1
        for fl in flags:
            a["flags"][fl][0] += v
            a["flags"][fl][1] += 1
        a["years"][d[:4]] += v
        if r["solicitation_procedure"] in ("TN", "AC"):  # non-competitive / ACAN
            a["sole_source"] += 1

    # vendor-level province = most common across its contracts
    records = []
    for vnorm, a in vendors.items():
        prov = a["prov"].most_common(1)[0][0]
        fsa = a["fsa"].most_common(1)[0][0] if a["fsa"] else None
        flags = {
            k: {"value": round(x[0], 2), "contracts": x[1]}
            for k, x in sorted(a["flags"].items())
        }
        rec = {
            "vendor": a["names"].most_common(1)[0][0],
            "vendor_key": vnorm,
            "name_variants": len(a["names"]),
            "total_value": round(a["value"], 2),
            "contracts": a["contracts"],
            "first_date": a["first"],
            "last_date": a["last"],
            "province": prov,
            "fsa": fsa,
            "country": a["country"].most_common(1)[0][0] if a["country"] else None,
            "value_by_year": {y: round(x, 2) for y, x in sorted(a["years"].items())},
            "top_commodities": [
                {"code": c, "description": desc or None, "value": round(x, 2)}
                for (c, desc), x in a["codes"].most_common(5)
            ],
            "top_categories": [o for o, _ in a["objs"].most_common(3)],
            "keywords": [w for w, _ in a["kw"].most_common(8)],
            "mfg_flags": flags,
            "mfg_relevant": bool(flags),
            "mfg_value": round(
                max((x[0] for x in a["flags"].values()), default=0.0), 2
            ),
            "non_competitive_contracts": a["sole_source"],
        }
        records.append(rec)
        by_prov[prov]["value"] += a["value"]
        by_prov[prov]["contracts"] += a["contracts"]
        by_prov[prov]["vendors"].add(vnorm)
        for k, x in a["flags"].items():
            by_flag[k]["value"] += x[0]
            by_flag[k]["contracts"] += x[1]
            by_flag[k]["vendors"].add(vnorm)

    records.sort(key=lambda x: -x["total_value"])
    for i, rec in enumerate(records, 1):
        rec["rank_by_value"] = i
    top = records[:TOP_N_BY_VALUE]
    extra_mfg = [x for x in records[TOP_N_BY_VALUE:] if x["mfg_relevant"]]
    out_vendors = top + extra_mfg
    mfg_all = [x for x in records if x["mfg_relevant"]]
    mfg_sorted = sorted(mfg_all, key=lambda x: -x["mfg_value"])

    as_of = (
        f"Contracts dated {min_date} to {max_date}; latest reporting period in "
        f"file {stats['max_reporting_period']}; resource last modified "
        f"2026-09-26 (open.canada.ca)"
    )
    meta = {
        "source_urls": [
            DATASET_URL,
            CSV_URL,
            SCHEMA_URL,
            GUIDE_URL,
            GSIN_URL,
            UNSPSC_URL,
        ],
        "licence": LICENCE,
        "retrieved": RETRIEVED,
        "as_of": as_of,
    }
    common_notes = [
        (
            "Source: Government of Canada, Proactive Publication - Contracts over $10,000 "
            "(owner_org dnd-mdn = National Defence). Contains information licensed under "
            "the Open Government Licence - Canada."
        ),
        (
            f"Filter: contract_date {START_DATE} to {RETRIEVED}; instrument types C "
            "(contract/call-up) and A (amendment). Standing offer / supply arrangement "
            "agreements (SOSA) excluded because they are not commitments."
        ),
        (
            "One contract = procurement_id + normalized vendor; value = contract_value of "
            "the most recently reported row (amendments carry the amended total). Values "
            "are reported commitments incl. taxes and exercised options, not payments."
        ),
        (
            "Vendor names normalized (case, accents, punctuation, legal suffixes). "
            "Spelling variants such as typos are not merged, so some vendors appear twice."
        ),
        (
            f"Vendors that look like individuals were dropped before aggregation: "
            f"{len(dropped_vendors)} vendor names, {dropped_contracts} contracts, "
            f"${dropped_value:,.0f}. No personal names, emails or phones are included; "
            "the source buyer_name field (DND staff) is never read."
        ),
        (
            "Province from vendor_postal_code (first 3 characters, FSA) as published by "
            "DND; 'outside Canada' where postal code is NA or vendor country is not CA. "
            "Postal code is the vendor's address in DND's system, not where work is done."
        ),
        (
            "mfg_flags mark what DND bought (GSIN/UNSPSC commodity code or description "
            "keywords), not a verified shop capability. Welding flags include purchases of "
            "welding equipment/supplies. Keyword-only matches are vetoed for IT, "
            "construction, professional-service and fuel categories."
        ),
        "Real companies: Public data - unverified - not affiliated.",
    ]

    def fam(d: dict[str, list[float]]) -> list[dict]:
        return [
            {
                "name": k,
                "value": round(x[0], 2),
                "contracts": int(x[1]),
                "share_of_value": round(x[0] / total_value, 4) if total_value else 0,
            }
            for k, x in sorted(d.items(), key=lambda kv: -kv[1][0])
        ]

    on_value = by_prov.get("ON", {"value": 0.0})["value"]
    on_vendors = len(by_prov.get("ON", {"vendors": set()})["vendors"])
    canada_value = sum(
        x["value"] for k, x in by_prov.items() if k not in ("outside Canada", "unknown")
    )
    summary = {
        **meta,
        "headline": {
            "contracts": len(kept),
            "total_value": round(total_value, 2),
            "distinct_vendors": len(records),
            "ontario_share_of_value": round(on_value / total_value, 4),
            "ontario_share_of_value_canadian_vendors": round(on_value / canada_value, 4)
            if canada_value
            else None,
            "ontario_vendors": on_vendors,
            "ontario_share_of_vendors": round(on_vendors / len(records), 4),
            "mfg_relevant_vendors": len(mfg_all),
            "mfg_relevant_value_upper_bound": round(
                sum(x["value"] for x in by_flag.values()), 2
            ),
            "dropped_person_like_vendors": len(dropped_vendors),
            "dropped_person_like_contracts": dropped_contracts,
            "top10_vendor_share_of_value": round(
                sum(x["total_value"] for x in records[:10]) / total_value, 4
            ),
        },
        "scan": {
            "rows_in_file": stats["rows_all"],
            "rows_national_defence": stats["rows_dnd"],
            "rows_sosa_excluded": stats["rows_dnd_sosa_skipped"],
            "rows_in_window": stats["rows_dnd_kept"],
            "contracts_after_dedup": len(contracts),
        },
        "by_year": [
            {"year": y, "value": round(x[0], 2), "contracts": int(x[1])}
            for y, x in sorted(by_year.items())
        ],
        "by_province": [
            {
                "province": k,
                "value": round(x["value"], 2),
                "contracts": x["contracts"],
                "vendors": len(x["vendors"]),
                "share_of_value": round(x["value"] / total_value, 4),
            }
            for k, x in sorted(by_prov.items(), key=lambda kv: -kv[1]["value"])
        ],
        "by_commodity_type": fam(by_type),
        "by_commodity_family": fam(by_family)[:60],
        "by_commodity_family_note": "Family = DND economic-object description "
        "(description_en); top 60 by value.",
        "by_mfg_flag": [
            {
                "flag": k,
                "value": round(x["value"], 2),
                "contracts": x["contracts"],
                "vendors": len(x["vendors"]),
            }
            for k, x in sorted(by_flag.items(), key=lambda kv: -kv[1]["value"])
        ],
        "top25_vendors_by_value": [
            {
                "rank": x["rank_by_value"],
                "vendor": x["vendor"],
                "total_value": x["total_value"],
                "contracts": x["contracts"],
                "province": x["province"],
                "top_categories": x["top_categories"][:2],
            }
            for x in records[:25]
        ],
        "top25_mfg_relevant_vendors": [
            {
                "vendor": x["vendor"],
                "mfg_value": x["mfg_value"],
                "total_value": x["total_value"],
                "contracts": x["contracts"],
                "province": x["province"],
                "fsa": x["fsa"],
                "flags": sorted(x["mfg_flags"]),
                "first_date": x["first_date"],
                "last_date": x["last_date"],
            }
            for x in mfg_sorted[:TOP_MFG_SUMMARY]
        ],
        "notes": common_notes
        + [
            (
                "mfg_value = value of the vendor's contracts in its largest manufacturing "
                "flag; mfg_relevant_value_upper_bound sums flags and can double count a "
                "contract carrying several flags."
            ),
            (
                "Ontario share uses vendor postal codes; a head-office address in Ottawa "
                "or Toronto can stand in for work done elsewhere."
            ),
        ],
    }
    vendors_doc = {
        **meta,
        "count": len(out_vendors),
        "count_top_by_value": len(top),
        "count_extra_mfg_relevant": len(extra_mfg),
        "notes": common_notes
        + [
            (
                f"Contains the top {TOP_N_BY_VALUE} vendors by value plus every other "
                "vendor with at least one manufacturing-relevant flag."
            ),
        ],
        "vendors": out_vendors,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_VENDORS.write_text(
        json.dumps(vendors_doc, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    OUT_SUMMARY.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    h = summary["headline"]
    print(json.dumps(h, indent=2))
    print(
        f"wrote {OUT_VENDORS.relative_to(ROOT)} "
        f"({OUT_VENDORS.stat().st_size / 1e6:.2f} MB, {len(out_vendors)} vendors)"
    )
    print(f"wrote {OUT_SUMMARY.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
