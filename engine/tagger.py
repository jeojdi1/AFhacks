"""Parts-list tagging: explicit CSV columns > cache > LLM > keyword rules (H2.2).

Pure functions over plain dicts shaped like docs/api.md objects. The only I/O is
reading ``data/cache/*.json`` and appending new LLM results to
``data/cache/tags_llm.json`` (atomic write). Every function that touches disk takes
an optional ``cache_dir`` so tests can point it at a temp directory.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import math
import os
import re
import tempfile
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = REPO_ROOT / "data" / "cache"
LLM_CACHE_FILE = "tags_llm.json"

REQUIRED_COLUMNS = ("part_no", "description", "qty", "unit_price_cad")
TAG_FIELDS = (
    "process_tags",
    "material",
    "envelope_mm",
    "tolerance_class",
    "required_certs",
    "controlled",
)

# --- docs/api.md §1 vocabularies -------------------------------------------------
PROCESS_TAGS = (
    "cnc_milling",
    "five_axis_milling",
    "cnc_turning",
    "sheet_metal",
    "welding",
    "heat_treat",
    "anodizing",
    "plating",
    "painting",
    "wire_harness",
    "electronics_assembly",
    "fasteners",
)
MATERIALS = ("steel", "armour_steel", "stainless", "aluminum", "titanium", "copper", "polymer")
TOLERANCE_CLASSES = ("standard", "precision", "ultra")
CERT_TYPES = (
    "CGP",
    "CPCSC_L1",
    "ISO9001",
    "AS9100",
    "NADCAP:HEAT_TREAT",
    "NADCAP:CHEM_PROCESSING",
    "NADCAP:COATINGS",
    "CWB_W47.1",
)

DEFAULT_CCV_PCT = 0.85
HOURS_VALUE_DIVISOR = 45_000.0  # CAD of lifetime value per weekly shop-hour (assumption)
HOURS_MIN, HOURS_MAX = 4, 60
LLM_TIMEOUT_S = 20.0
DEFAULT_MODEL = "claude-sonnet-5"

# Default envelope by item type (first matching process wins), mm [x, y, z].
_ENVELOPE_DEFAULTS: tuple[tuple[str, list[int]], ...] = (
    ("fasteners", [60, 25, 25]),
    ("wire_harness", [1500, 300, 100]),
    ("electronics_assembly", [450, 350, 200]),
    ("welding", [1200, 800, 600]),
    ("sheet_metal", [800, 600, 300]),
    ("five_axis_milling", [600, 500, 400]),
    ("cnc_turning", [400, 120, 120]),
    ("cnc_milling", [400, 300, 200]),
)
_ENVELOPE_FALLBACK = [500, 400, 300]


# ---------------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------------
def cache_key(part_no: str, description: str) -> str:
    """sha256 of ``part_no|description`` (hex)."""
    return hashlib.sha256((part_no + "|" + description).encode()).hexdigest()


def _squash(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


_PROCESS_LOOKUP = {_squash(p): p for p in PROCESS_TAGS} | {
    "5axismilling": "five_axis_milling",
    "5axis": "five_axis_milling",
    "fiveaxis": "five_axis_milling",
    "milling": "cnc_milling",
    "turning": "cnc_turning",
    "heattreatment": "heat_treat",
    "heattreating": "heat_treat",
    "harness": "wire_harness",
    "wireharnesses": "wire_harness",
    "electronics": "electronics_assembly",
}
_MATERIAL_LOOKUP = {_squash(m): m for m in MATERIALS} | {
    "armorsteel": "armour_steel",
    "armour": "armour_steel",
    "armor": "armour_steel",
    "aluminium": "aluminum",
    "stainlesssteel": "stainless",
    "brass": "copper",
    "plastic": "polymer",
    "nylon": "polymer",
    "composite": "polymer",
}
_TOLERANCE_LOOKUP = {t: t for t in TOLERANCE_CLASSES}
_CERT_LOOKUP = {_squash(c): c for c in CERT_TYPES} | {
    "cpcsc": "CPCSC_L1",
    "cpcsclevel1": "CPCSC_L1",
    "iso9001": "ISO9001",
    "cwb": "CWB_W47.1",
    "w471": "CWB_W47.1",
    "cwbw471": "CWB_W47.1",
    "nadcapheattreat": "NADCAP:HEAT_TREAT",
    "nadcapheattreating": "NADCAP:HEAT_TREAT",
    "nadcapchemicalprocessing": "NADCAP:CHEM_PROCESSING",
    "nadcapchemprocessing": "NADCAP:CHEM_PROCESSING",
    "nadcapcoating": "NADCAP:COATINGS",
    "controlledgoods": "CGP",
}


# Common free-text spellings of certifications (checked when the squashed lookup misses).
_CERT_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"^\s*ISO\s*[-_ ]?\s*9001\b", re.IGNORECASE), "ISO9001"),
    (re.compile(r"^\s*(?:SAE\s*)?AS\s*[-_ ]?\s*9100(?:[A-D])?\b", re.IGNORECASE), "AS9100"),
    (re.compile(r"^\s*(?:CSA\s*)?(?:CWB\b.*|W\s*47(?:\.1)?\b.*)$", re.IGNORECASE), "CWB_W47.1"),
    (re.compile(r"^\s*(?:CGP|controlled\s+goods(?:\s+program)?)\s*$", re.IGNORECASE), "CGP"),
    (re.compile(r"^\s*CPCSC(?:\s*[-_ ]?\s*(?:L|level)\s*[-_ ]?\s*1)?\s*$", re.IGNORECASE), "CPCSC_L1"),
    (re.compile(r"^\s*nadcap\b.*heat", re.IGNORECASE), "NADCAP:HEAT_TREAT"),
    (re.compile(r"^\s*nadcap\b.*chem", re.IGNORECASE), "NADCAP:CHEM_PROCESSING"),
    (re.compile(r"^\s*nadcap\b.*coat", re.IGNORECASE), "NADCAP:COATINGS"),
)


def _split_list(values: Any) -> list[Any]:
    if values is None:
        return []
    if isinstance(values, str):
        return re.split(r"[;|,]", values)
    if isinstance(values, (list, tuple)):
        return list(values)
    return []


def _norm_value(v: Any, lookup: dict[str, str]) -> str | None:
    if not isinstance(v, str):
        return None
    hit = lookup.get(_squash(v))
    if hit is None and lookup is _CERT_LOOKUP:
        hit = next((c for rx, c in _CERT_PATTERNS if rx.search(v)), None)
    return hit


def _norm_list_ex(values: Any, lookup: dict[str, str]) -> tuple[list[str], list[str]]:
    """Map values onto a vocabulary. Returns (normalised values, unrecognised raw values);
    duplicates dropped, order kept."""
    out: list[str] = []
    bad: list[str] = []
    for v in _split_list(values):
        if isinstance(v, str) and not v.strip():
            continue
        hit = _norm_value(v, lookup)
        if hit is None:
            bad.append(str(v).strip())
        elif hit not in out:
            out.append(hit)
    return out, bad


def _norm_list(values: Any, lookup: dict[str, str]) -> list[str]:
    """Map values onto a vocabulary, dropping unknowns and duplicates (order kept)."""
    return _norm_list_ex(values, lookup)[0]


def _norm_one(value: Any, lookup: dict[str, str]) -> str | None:
    if not isinstance(value, str):
        return None
    return lookup.get(_squash(value))


def _norm_envelope(value: Any) -> list[int] | None:
    if value is None:
        return None
    if isinstance(value, str):
        parts = re.findall(r"\d+(?:\.\d+)?", value)
        if len(parts) != 3 or not re.fullmatch(
            r"\s*\d+(?:\.\d+)?\s*(?:mm)?\s*[x×X*]\s*\d+(?:\.\d+)?\s*(?:mm)?\s*[x×X*]"
            r"\s*\d+(?:\.\d+)?\s*(?:mm)?\s*",
            value,
        ):
            return None
        value = parts
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        return None
    try:
        dims = [round(float(v)) for v in value]
    except (TypeError, ValueError):
        return None
    if any(d <= 0 for d in dims):
        return None
    return dims


def _norm_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        v = value.strip().lower()
        if v in ("true", "yes", "y", "1", "t"):
            return True
        if v in ("false", "no", "n", "0", "f"):
            return False
    return None


def _validate_tags(raw: Any) -> dict[str, Any]:
    """Keep only valid, vocabulary-conforming tag fields from an untrusted dict.

    Missing or invalid fields are omitted so a lower-precedence source can fill them.
    An empty ``process_tags`` list is treated as missing.
    """
    if not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    if "process_tags" in raw:
        tags = _norm_list(raw["process_tags"], _PROCESS_LOOKUP)
        if tags:
            out["process_tags"] = tags
    if (m := _norm_one(raw.get("material"), _MATERIAL_LOOKUP)) is not None:
        out["material"] = m
    if (e := _norm_envelope(raw.get("envelope_mm"))) is not None:
        out["envelope_mm"] = e
    if (t := _norm_one(raw.get("tolerance_class"), _TOLERANCE_LOOKUP)) is not None:
        out["tolerance_class"] = t
    if isinstance(raw.get("required_certs"), (list, tuple, str)):
        certs, bad = _norm_list_ex(raw["required_certs"], _CERT_LOOKUP)
        # A non-empty value with nothing recognisable is treated as missing, not as
        # "no certs required", so a lower-precedence source can fill it.
        if certs or not bad:
            out["required_certs"] = certs
    if (c := _norm_bool(raw.get("controlled"))) is not None:
        out["controlled"] = c
    return out


def _is_tag_dict(v: Any) -> bool:
    return isinstance(v, dict) and "process_tags" in v


def _num(v: float) -> int | float:
    return int(v) if float(v).is_integer() else v


def _derive_hours(est_value_cad: float) -> int:
    return max(HOURS_MIN, min(HOURS_MAX, round(est_value_cad / HOURS_VALUE_DIVISOR)))


# ---------------------------------------------------------------------------------
# CSV
# ---------------------------------------------------------------------------------
def parse_csv(text: str) -> list[dict]:
    """Parse and validate a parts-list CSV.

    Returns one dict per data row with the required columns plus any optional
    columns that were given a non-blank value (explicit values beat every tag
    source). ``ccv_pct`` and ``hours_week`` are always filled (defaults applied).
    Raises ``ValueError`` with a readable message naming missing columns or the
    bad row (row numbers are CSV line numbers; the header is line 1).
    """
    text = text.removeprefix("\ufeff")
    reader = csv.reader(io.StringIO(text), strict=True)
    rows_iter = _safe_rows(reader)
    header: list[str] | None = None
    for values in rows_iter:
        if any(v.strip() for v in values):
            header = [h.strip().lstrip("\ufeff").lower() for h in values]
            break
    if header is None:
        raise ValueError("CSV is empty: expected a header row with " + ", ".join(REQUIRED_COLUMNS))
    percent_header = False
    for i, h in enumerate(header):
        base = re.sub(r"\s*\(\s*%\s*\)\s*$|\s*%\s*$", "", h)
        if base != h and base == "ccv_pct":
            header[i] = base
            percent_header = True
    seen: set[str] = set()
    for h in header:
        if h and h in seen:
            raise ValueError(f"CSV has duplicate column {h!r}")
        seen.add(h)
    missing = [c for c in REQUIRED_COLUMNS if c not in header]
    if missing:
        raise ValueError(
            "CSV is missing required column(s): "
            + ", ".join(missing)
            + ". Required: "
            + ", ".join(REQUIRED_COLUMNS)
        )

    rows: list[dict] = []
    for values in rows_iter:
        rownum = reader.line_num
        if not any(v.strip() for v in values):
            continue
        if len(values) > len(header) and any(v.strip() for v in values[len(header):]):
            raise ValueError(
                f"Row {rownum}: has {len(values)} values but the header has {len(header)} columns"
            )
        rec = {h: (values[i].strip() if i < len(values) else "") for i, h in enumerate(header)}
        rows.append(_parse_row(rec, rownum, percent_header=percent_header))
    if not rows:
        raise ValueError("CSV has a header but no data rows")
    return rows


_THOUSANDS_RE = re.compile(r"[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?")


def _safe_rows(reader: Any) -> Any:
    """Iterate a csv.reader, turning csv.Error (e.g. an unclosed quote) into ValueError."""
    while True:
        try:
            values = next(reader)
        except StopIteration:
            return
        except csv.Error as exc:
            raise ValueError(f"malformed CSV near row {reader.line_num}: {exc}") from None
        yield values


def _parse_number(rec: dict, col: str, rownum: int, *, positive: bool = True) -> float:
    raw = rec.get(col, "")
    if raw == "":
        raise ValueError(f"Row {rownum}: {col} is blank")
    cleaned = raw.replace("$", "").strip()
    if "," in cleaned and not _THOUSANDS_RE.fullmatch(cleaned):
        raise ValueError(
            f"Row {rownum}: {col} {raw!r} is ambiguous (comma is not a thousands separator); "
            "use 1250.00 style numbers, not 1.250,00"
        )
    try:
        val = float(cleaned.replace(",", ""))
    except ValueError:
        raise ValueError(f"Row {rownum}: {col} {raw!r} is not a number") from None
    if math.isnan(val) or math.isinf(val) or (positive and val <= 0):
        raise ValueError(f"Row {rownum}: {col} must be greater than 0 (got {raw!r})")
    return val


def _parse_row(rec: dict, rownum: int, *, percent_header: bool = False) -> dict:
    part_no = rec.get("part_no", "")
    description = rec.get("description", "")
    if not part_no:
        raise ValueError(f"Row {rownum}: part_no is blank")
    if not description:
        raise ValueError(f"Row {rownum}: description is blank")
    qty = _parse_number(rec, "qty", rownum)
    price = _parse_number(rec, "unit_price_cad", rownum)
    row: dict[str, Any] = {
        "part_no": part_no,
        "description": description,
        "qty": _num(qty),
        "unit_price_cad": float(price),
    }

    if v := rec.get("material"):
        m = _norm_one(v, _MATERIAL_LOOKUP)
        if m:
            row["material"] = m
    warnings: list[str] = []
    if v := rec.get("process_tags"):
        tags, bad = _norm_list_ex(v, _PROCESS_LOOKUP)
        if tags:
            row["process_tags"] = tags
        if bad:
            warnings.append(
                f"process_tags: ignored unrecognised value(s) {', '.join(map(repr, bad))}"
                + ("" if tags else "; tags inferred instead")
            )
    if v := rec.get("envelope_mm"):
        env = _norm_envelope(v)
        if env is None:
            raise ValueError(f"Row {rownum}: envelope_mm {v!r} is not LxWxH in mm (e.g. 900x600x450)")
        row["envelope_mm"] = env
    if v := rec.get("tolerance_class"):
        t = _norm_one(v, _TOLERANCE_LOOKUP)
        if t:
            row["tolerance_class"] = t
    if v := rec.get("required_certs"):
        certs, bad = _norm_list_ex(v, _CERT_LOOKUP)
        if certs:
            row["required_certs"] = certs
        if bad:
            warnings.append(
                f"required_certs: ignored unrecognised value(s) {', '.join(map(repr, bad))}"
                + ("" if certs else "; certs inferred instead")
            )
    if v := rec.get("controlled"):
        b = _norm_bool(v)
        if b is None:
            raise ValueError(f"Row {rownum}: controlled {v!r} must be true/false/yes/no/1/0")
        row["controlled"] = b

    if raw_ccv := rec.get("ccv_pct"):
        # "%" in the value (or a "ccv_pct (%)" header) -> always a percentage.
        # Otherwise 0..1 is a fraction and (1, 100] is a percentage ("85" -> 0.85,
        # "1.5" -> 0.015). Anything < 0 or > 100 is rejected.
        is_pct = percent_header or "%" in raw_ccv
        ccv = _parse_number(
            {"ccv_pct": raw_ccv.replace("%", "")}, "ccv_pct", rownum, positive=False
        )
        if ccv < 0 or ccv > 100:
            raise ValueError(
                f"Row {rownum}: ccv_pct {raw_ccv!r} is out of range "
                "(use a fraction 0-1 or a percentage 0-100)"
            )
        if is_pct or ccv > 1:
            ccv = ccv / 100.0
        row["ccv_pct"] = ccv
    else:
        row["ccv_pct"] = DEFAULT_CCV_PCT
    if rec.get("hours_week"):
        hw = _parse_number(rec, "hours_week", rownum)
        row["hours_week"] = _num(hw)
    else:
        row["hours_week"] = _derive_hours(qty * price)
    if warnings:
        row["tag_warning"] = "; ".join(warnings)
    return row


# ---------------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------------
def load_cache(cache_dir: Path | str | None = None) -> dict[str, dict]:
    """Merge every ``*.json`` in the cache dir whose values look like tag dicts.

    Keys starting with ``_`` are metadata and skipped. One level of nesting
    (e.g. ``{"entries": {key: tags}}``) is also accepted. ``tags_llm.json`` is
    loaded first so curated caches win on conflicts.
    """
    d = Path(cache_dir) if cache_dir is not None else CACHE_DIR
    if not d.is_dir():
        return {}
    files = sorted(d.glob("*.json"), key=lambda p: (p.name != LLM_CACHE_FILE, p.name))
    merged: dict[str, dict] = {}
    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            log.warning("tagger: skipping unreadable cache file %s: %s", f, exc)
            continue
        if not isinstance(data, dict):
            continue
        for k, v in data.items():
            if k.startswith("_"):
                continue
            if _is_tag_dict(v):
                merged[k] = v
            elif isinstance(v, dict):
                for k2, v2 in v.items():
                    if not str(k2).startswith("_") and _is_tag_dict(v2):
                        merged[str(k2)] = v2
    return merged


def _cache_lookup(cache: dict[str, dict], part_no: str, description: str) -> dict | None:
    hit = cache.get(cache_key(part_no, description))
    if hit is None:
        hit = cache.get(part_no)
    return hit


def _append_llm_cache(new: dict[str, dict], cache_dir: Path | str | None = None) -> None:
    if not new:
        return
    d = Path(cache_dir) if cache_dir is not None else CACHE_DIR
    d.mkdir(parents=True, exist_ok=True)
    path = d / LLM_CACHE_FILE
    data: dict[str, Any] = {}
    if path.exists():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data = loaded
        except (OSError, ValueError):
            data = {}
    data.setdefault("_note", "LLM tag cache written by engine/tagger.py; key = sha256(part_no|description)")
    data.update(new)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".tags_llm.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, sort_keys=True)
            fh.write("\n")
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


# ---------------------------------------------------------------------------------
# Keyword rules
# ---------------------------------------------------------------------------------
_I = re.IGNORECASE
# (tag, strong pattern, weak pattern). Strong matches always count. Weak matches
# (generic item nouns such as "bracket", "enclosure", "chassis") count only when no
# strong process keyword matched anywhere in the line.
_PROCESS_RULES: tuple[tuple[str, re.Pattern[str], re.Pattern[str] | None], ...] = (
    ("five_axis_milling", re.compile(r"\b(?:5|five)[\s-]?axis", _I), None),
    ("welding", re.compile(r"weld|\bCWB\b", _I), None),
    ("wire_harness", re.compile(r"harness|wiring|cable\s+assembl", _I), None),
    ("anodizing", re.compile(r"anodi[sz]", _I), None),
    ("plating", re.compile(r"\bplat(?:ed|ing)\b|zinc|nickel|cadmium", _I), None),
    ("heat_treat", re.compile(r"heat[\s-]?treat|harden|carburi[sz]|\bquench", _I), None),
    ("painting", re.compile(r"paint|powder[\s-]?coat|\bCARC\b|coating", _I), None),
    (
        "cnc_turning",
        re.compile(r"\bturn(?:ed|ing)?\b|lathe", _I),
        re.compile(r"\bshafts?\b|\bbushings?\b|\bpins?\b", _I),
    ),
    (
        "sheet_metal",
        re.compile(r"sheet|\bbrake\b|laser[\s-]?cut", _I),
        re.compile(r"enclosure|\bpanels?\b", _I),
    ),
    ("fasteners", re.compile(r"fastener|\bbolts?\b|\bscrews?\b|\bstuds?\b|\bnuts?\b|rivet", _I), None),
    (
        "electronics_assembly",
        re.compile(r"\bpcbs?\b|circuit|electronic", _I),
        re.compile(r"chassis|computer|display", _I),
    ),
    (
        "cnc_milling",
        re.compile(r"\bmill(?:ed|ing)?\b|machin", _I),
        re.compile(r"housing|bracket|\bblocks?\b|manifold", _I),
    ),
)
_FINISHING = ("heat_treat", "anodizing", "plating", "painting")
# "temper"/"tempered"/"tempering" only means heat treatment in a steel/quench context
# ("Temperature sensor" or "tempered glass" must not become heat_treat).
_TEMPER_RE = re.compile(r"\btemper(?:ed|ing)?\b", _I)
_HEAT_CONTEXT_RE = re.compile(
    r"steel|quench|\b(?:41[34]0|43[34]0|10[4-9]5|52100|4150|8620)\b|spring|austenit|martensit", _I
)
_SERVICE_RE = re.compile(r"\bservices?\b", _I)
_MATERIAL_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("armour_steel", re.compile(r"armou?r", _I)),
    ("stainless", re.compile(r"stainless", _I)),
    ("titanium", re.compile(r"titanium", _I)),
    ("aluminum", re.compile(r"alumin(?:i)?um|\b6061\b|\b7075\b", _I)),
    ("copper", re.compile(r"copper|brass", _I)),
    ("polymer", re.compile(r"polymer|nylon|plastic|composite", _I)),
)
_CERT_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("CWB_W47.1", re.compile(r"\bCWB\b|W47\.1", _I)),
    ("AS9100", re.compile(r"AS\s?9100", _I)),
    ("ISO9001", re.compile(r"ISO\s?9001", _I)),
    ("CPCSC_L1", re.compile(r"CPCSC", _I)),
)
_NADCAP_RE = re.compile(r"nadcap", _I)
_NADCAP_BY_PROCESS = (
    ("heat_treat", "NADCAP:HEAT_TREAT"),
    ("anodizing", "NADCAP:CHEM_PROCESSING"),
    ("plating", "NADCAP:CHEM_PROCESSING"),
    ("painting", "NADCAP:COATINGS"),
)
_CONTROLLED_RE = re.compile(r"controlled\s+goods|controlled\s+technical\s+data|\bCGP\b", _I)
_ULTRA_RE = re.compile(r"ultra|(?:±|\+/-|\+-)\s?0\.00", _I)
_PRECISION_RE = re.compile(r"(?:±|\+/-|\+-)\s?0\.0[0-2]|precision|tight", _I)
_ENVELOPE_RE = re.compile(r"(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)\s*mm", _I)


def _default_envelope(process_tags: list[str]) -> list[int]:
    for proc, dims in _ENVELOPE_DEFAULTS:
        if proc in process_tags:
            return list(dims)
    return list(_ENVELOPE_FALLBACK)


def _rule_process_tags(description: str) -> list[str]:
    """Process tags ordered by where they first appear in the description."""
    strong: dict[str, int] = {}
    weak: dict[str, int] = {}
    for tag, strong_rx, weak_rx in _PROCESS_RULES:
        m = strong_rx.search(description)
        w = weak_rx.search(description) if weak_rx is not None else None
        if m:
            strong[tag] = min(m.start(), w.start()) if w else m.start()
        elif w:
            weak[tag] = w.start()
    t = _TEMPER_RE.search(description)
    if t and "heat_treat" not in strong and _HEAT_CONTEXT_RE.search(description):
        strong["heat_treat"] = t.start()
    found = strong or weak
    # A finishing "service" line (heat treat / anodize / plate / paint) only needs the
    # finishing process; the parts it names are supplied by the prime.
    if _SERVICE_RE.search(description) and any(t in found for t in _FINISHING):
        found = {t: pos for t, pos in found.items() if t in _FINISHING}
    # Purchased hardware: a zinc/nickel finish is part of the fastener spec.
    elif "fasteners" in found:
        found.pop("plating", None)
    # 5-axis work subsumes 3-axis milling.
    if "five_axis_milling" in found:
        found.pop("cnc_milling", None)
    return sorted(found, key=lambda t: found[t])


def rule_tags(description: str) -> dict:
    """Keyword fallback tagger. Always returns all six tag fields.

    If no process keyword matches, ``process_tags`` falls back to
    ``["cnc_milling"]`` and a ``tag_warning`` key is added.
    """
    desc = description or ""
    tags = _rule_process_tags(desc)
    warning = None
    if not tags:
        tags = ["cnc_milling"]
        warning = "No process keyword matched; defaulted to cnc_milling"

    material = next((m for m, rx in _MATERIAL_RULES if rx.search(desc)), "steel")

    certs = [c for c, rx in _CERT_RULES if rx.search(desc)]
    if _NADCAP_RE.search(desc):
        for proc, cert in _NADCAP_BY_PROCESS:
            if proc in tags and cert not in certs:
                certs.append(cert)

    if _ULTRA_RE.search(desc):
        tolerance = "ultra"
    elif _PRECISION_RE.search(desc):
        tolerance = "precision"
    else:
        tolerance = "standard"

    m = _ENVELOPE_RE.search(desc)
    envelope = [int(m.group(i)) for i in (1, 2, 3)] if m else _default_envelope(tags)

    out: dict[str, Any] = {
        "process_tags": tags,
        "material": material,
        "envelope_mm": envelope,
        "tolerance_class": tolerance,
        "required_certs": certs,
        "controlled": bool(_CONTROLLED_RE.search(desc)),
    }
    if warning:
        out["tag_warning"] = warning
    return out


# ---------------------------------------------------------------------------------
# LLM
# ---------------------------------------------------------------------------------
_LLM_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "process_tags": {"type": "array", "items": {"type": "string", "enum": list(PROCESS_TAGS)}},
        "material": {"type": "string", "enum": list(MATERIALS)},
        "envelope_mm": {
            "type": "array",
            "items": {"type": "integer"},
            "description": "Bounding box [x, y, z] in millimetres; estimate if not stated.",
        },
        "tolerance_class": {"type": "string", "enum": list(TOLERANCE_CLASSES)},
        "required_certs": {"type": "array", "items": {"type": "string", "enum": list(CERT_TYPES)}},
        "controlled": {"type": "boolean"},
    },
    "required": list(TAG_FIELDS),
    "additionalProperties": False,
}

_LLM_SYSTEM = (
    "You tag lines from a Canadian defence prime's parts list so they can be routed to "
    "machine shops. Return the manufacturing processes a supplier must perform, the main "
    "material, an estimated bounding box in mm, the tolerance class, the certifications "
    "the supplier must hold, and whether the part involves controlled goods or controlled "
    "technical data (Canada's Controlled Goods Program). Use only the allowed enum values. "
    "Include a certification only if the description asks for it or it is implied by a "
    "named standard (e.g. CWB W47.1 structural welding, Nadcap heat treat); CGP is "
    "represented by controlled=true, not in required_certs. Tolerance: 'precision' for "
    "tight / ±0.01-0.02 mm work, 'ultra' for ±0.00x mm, otherwise 'standard'."
)


def _make_client() -> Any:
    import anthropic

    return anthropic.Anthropic(timeout=LLM_TIMEOUT_S, max_retries=0)


def llm_tags(part_no: str, description: str, *, client: Any = None) -> dict | None:
    """Tag one line with Claude using structured JSON output.

    Returns a validated tag dict (fields may be missing if the model returned an
    invalid value) or ``None`` on ANY error, on refusal/truncation, on unparseable
    output, or when ``ANTHROPIC_API_KEY`` is unset and no client is injected.
    """
    try:
        if client is None:
            if not os.environ.get("ANTHROPIC_API_KEY"):
                return None
            client = _make_client()
        model = os.environ.get("MUSTER_LLM_MODEL", DEFAULT_MODEL)
        output_config: dict[str, Any] = {"format": {"type": "json_schema", "schema": _LLM_SCHEMA}}
        if "haiku" not in model:
            output_config["effort"] = "low"
        response = client.messages.create(
            model=model,
            max_tokens=2048,
            system=_LLM_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": f"part_no: {part_no}\ndescription: {description}",
                }
            ],
            output_config=output_config,
            timeout=LLM_TIMEOUT_S,
        )
        if getattr(response, "stop_reason", None) in ("refusal", "max_tokens"):
            return None
        text = next(
            (b.text for b in response.content if getattr(b, "type", None) == "text"),
            None,
        )
        if not text:
            return None
        tags = _validate_tags(json.loads(text))
        if "process_tags" not in tags:
            return None
        return tags
    except Exception as exc:  # noqa: BLE001 - contract: any failure falls back to rules
        log.info("tagger: LLM tagging failed for %s: %s", part_no, exc)
        return None


# ---------------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------------
def _id_prefix(program_id: str) -> str:
    if program_id == "northgate":
        return "NG"
    letters = re.sub(r"[^A-Za-z]", "", program_id)
    return (letters[:2] or "JB").upper()


def tag_rows(
    rows: list[dict],
    *,
    use_llm: bool | None = None,
    program_id: str = "northgate",
    cache_dir: Path | str | None = None,
    client: Any = None,
) -> tuple[list[dict], dict]:
    """Tag parsed rows into full Job dicts (docs/api.md) and count tag sources.

    Per-field precedence: explicit row value > cache > LLM (if ``use_llm``) > rules.
    ``use_llm`` defaults to whether ``ANTHROPIC_API_KEY`` is set (or a client is
    injected). New LLM results are appended to ``tags_llm.json``.
    """
    if use_llm is None:
        use_llm = client is not None or bool(os.environ.get("ANTHROPIC_API_KEY"))
    cache = load_cache(cache_dir)
    counts = {"llm": 0, "cache": 0, "rules": 0}
    new_llm: dict[str, dict] = {}
    prefix = _id_prefix(program_id)
    width = max(3, len(str(len(rows))))
    jobs: list[dict] = []

    for i, row in enumerate(rows, start=1):
        part_no = str(row["part_no"]).strip()
        description = str(row["description"]).strip()
        qty = float(row["qty"])
        price = float(row["unit_price_cad"])
        est_value = round(qty * price, 2)

        explicit = _validate_tags({f: row[f] for f in TAG_FIELDS if f in row})
        rules = rule_tags(description)
        source = "rules"
        found: dict[str, Any] = {}

        key = cache_key(part_no, description)
        cached = _cache_lookup(cache, part_no, description)
        if cached is not None:
            found = _validate_tags(cached)
            if found:
                source = "cache"
        if source == "rules" and use_llm and any(f not in explicit for f in TAG_FIELDS):
            llm = llm_tags(part_no, description, client=client)
            if llm:
                found = llm
                source = "llm"
                new_llm[key] = {**llm, "part_no": part_no, "description": description}
                cache[key] = llm

        tags: dict[str, Any] = {}
        for f in TAG_FIELDS:
            if f in explicit:
                tags[f] = explicit[f]
            elif f in found:
                tags[f] = found[f]
            else:
                tags[f] = rules[f]
        warning = None
        if not tags["process_tags"]:
            tags["process_tags"] = ["cnc_milling"]
            warning = "No process identified; defaulted to cnc_milling"
        elif tags["process_tags"] is rules["process_tags"] and "tag_warning" in rules:
            warning = rules["tag_warning"]
        if row.get("tag_warning"):
            warning = f"{row['tag_warning']}; {warning}" if warning else str(row["tag_warning"])
        if "envelope_mm" not in explicit and "envelope_mm" not in found:
            m = _ENVELOPE_RE.search(description)
            if not m:
                tags["envelope_mm"] = _default_envelope(tags["process_tags"])

        ccv = row.get("ccv_pct")
        ccv = float(ccv) if ccv not in (None, "") else DEFAULT_CCV_PCT
        hours = row.get("hours_week")
        hours = _num(float(hours)) if hours not in (None, "") else _derive_hours(est_value)

        job: dict[str, Any] = {
            "id": f"{prefix}-{i:0{width}d}",
            "program_id": program_id,
            "part_no": part_no,
            "description": description,
            "qty": _num(qty),
            "unit_price_cad": price,
            "est_value_cad": est_value,
            "ccv_pct": ccv,
            "hours_week": hours,
            "material": tags["material"],
            "process_tags": list(tags["process_tags"]),
            "envelope_mm": list(tags["envelope_mm"]),
            "tolerance_class": tags["tolerance_class"],
            "required_certs": list(tags["required_certs"]),
            "controlled": bool(tags["controlled"]),
            "tag_source": source,
            "status": "unrouted",
        }
        if warning:
            job["tag_warning"] = warning
        jobs.append(job)
        counts[source] += 1

    if new_llm:
        try:
            _append_llm_cache(new_llm, cache_dir)
        except OSError as exc:
            log.warning("tagger: could not write LLM cache: %s", exc)
    return jobs, counts
