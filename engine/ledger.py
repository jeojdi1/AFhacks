"""ITB credit calculations (H2.5).

Every credit number is ``value_cad x ccv_pct x multiplier`` (CLAUDE.md §3.5).
Pure functions over plain dicts shaped like docs/api.md objects. Money is
rounded to cents; every ``*_pct`` field is a fraction.

Totals are accumulated in integer cents so that
``credit_total_cad == round(sum(credit_cad), 2) == round(direct + indirect, 2)``
holds exactly, not just within float tolerance.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DEFAULT_MULTIPLIERS: dict[str, float] = {
    "regular": 1,
    "sme_direct": 2,
    "training": 5,
    "indigenous_training": 10,
}

CATEGORY_LABELS: dict[str, str] = {
    "regular": "Regular work",
    "sme_direct": "SME direct work",
    "training": "Skills and training",
    "indigenous_training": "Indigenous workforce development",
}

CATEGORY_ORDER: tuple[str, ...] = ("regular", "sme_direct", "training", "indigenous_training")

DEFAULT_RULES_LABEL = "Simplified ITB rules for demo"
SMB_BASIS = "CCV of SME work before multipliers (assumption)"

DEFAULT_POLICY_PATH = Path(__file__).resolve().parent.parent / "data" / "rules" / "policy.json"

# Tolerated alternative key spellings in policy.json -> canonical category.
_ALIASES: dict[str, str] = {
    "regular": "regular",
    "regular_work": "regular",
    "sme_direct": "sme_direct",
    "sme": "sme_direct",
    "sme_direct_work": "sme_direct",
    "training": "training",
    "skills_training": "training",
    "skills_and_training": "training",
    "indigenous_training": "indigenous_training",
    "indigenous": "indigenous_training",
    "indigenous_workforce_development": "indigenous_training",
}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _cents(x: float) -> int:
    return round(float(x) * 100)


def _money(cents: int) -> float:
    return round(cents / 100, 2)


def _num(v: Any) -> float | None:
    """Return a number from ``n`` or ``{"value": n, ...}`` / ``{"multiplier": n}``."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, dict):
        for key in ("value", "multiplier", "x"):
            if key in v:
                return _num(v[key])
    return None


def _find_multipliers(obj: Any) -> Any:
    """Depth-first search for a ``"multipliers"`` key anywhere in the policy."""
    if isinstance(obj, dict):
        if "multipliers" in obj:
            return obj["multipliers"]
        for v in obj.values():
            found = _find_multipliers(v)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = _find_multipliers(v)
            if found is not None:
                return found
    return None


def _mults(multipliers: dict | None) -> dict:
    out = dict(DEFAULT_MULTIPLIERS)
    if multipliers:
        out.update(multipliers)
    return out


def _pct(num: float, den: float) -> float:
    return num / den if den else 0.0


# ---------------------------------------------------------------------------
# public API
# ---------------------------------------------------------------------------


def load_multipliers(policy_path: str | Path | None = None) -> dict:
    """Read multipliers from ``data/rules/policy.json`` (or ``policy_path``).

    Tolerates ``{"multipliers": {"regular": 1, ...}}`` and
    ``{"multipliers": {"regular": {"value": 1, "source": "..."}, ...}}``, a
    ``"multipliers"`` key nested anywhere, or a list of
    ``{"category": ..., "value"|"multiplier": n}``. Missing file, bad JSON or
    unknown shape -> ``DEFAULT_MULTIPLIERS``. Unknown categories are ignored.
    """
    result = dict(DEFAULT_MULTIPLIERS)
    path = Path(policy_path) if policy_path is not None else DEFAULT_POLICY_PATH
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return result

    raw = _find_multipliers(data)
    items: list[tuple[str, Any]] = []
    if isinstance(raw, dict):
        items = list(raw.items())
    elif isinstance(raw, list):
        for entry in raw:
            if isinstance(entry, dict):
                key = entry.get("category") or entry.get("id") or entry.get("name")
                if isinstance(key, str):
                    items.append((key, entry))

    for key, val in items:
        cat = _ALIASES.get(str(key).strip().lower())
        n = _num(val)
        if cat is not None and n is not None:
            result[cat] = int(n) if float(n).is_integer() else float(n)
    return result


def credit(value_cad: float, ccv_pct: float, multiplier: float) -> float:
    """``value_cad x ccv_pct x multiplier`` rounded to cents."""
    return round(float(value_cad) * float(ccv_pct) * float(multiplier), 2)


def assignment_txn(
    program_id: str, assignment: dict, seq: int, multipliers: dict | None = None
) -> dict:
    """Direct CreditTxn for an Assignment. ``multipliers`` None -> defaults."""
    m = _mults(multipliers)
    category = "sme_direct" if assignment.get("is_sme") else "regular"
    value = round(float(assignment.get("value_cad", 0.0)), 2)
    ccv = float(assignment.get("ccv_pct", 0.0))
    mult = m[category]
    return {
        "id": f"TX-{seq:04d}",
        "program_id": program_id,
        "origin": "assignment",
        "ref_id": assignment.get("job_id"),
        "shop_id": assignment.get("shop_id"),
        "type": "direct",
        "category": category,
        "value_cad": value,
        "ccv_pct": ccv,
        "multiplier": mult,
        "credit_cad": credit(value, ccv, mult),
        "flags": ["simplified-demo"],
    }


def training_txn(
    program_id: str, package: dict, seq: int, multipliers: dict | None = None
) -> dict:
    """Indirect CreditTxn for a funded TrainingPackage (ccv_pct 1.0)."""
    m = _mults(multipliers)
    pkg_mult = _num(package.get("multiplier"))
    indigenous = (
        pkg_mult is not None and pkg_mult == _num(m["indigenous_training"])
    ) or package.get("recipient_type") == "indigenous_institution"
    category = "indigenous_training" if indigenous else "training"
    value = round(float(package.get("est_cost_cad", 0.0)), 2)
    mult = m[category]
    return {
        "id": f"TX-{seq:04d}",
        "program_id": program_id,
        "origin": "training",
        "ref_id": package.get("id"),
        "shop_id": package.get("shop_id"),
        "type": "indirect",
        "category": category,
        "value_cad": value,
        "ccv_pct": 1.0,
        "multiplier": mult,
        "credit_cad": credit(value, 1.0, mult),
        "flags": ["assumption", "simplified-demo"],
    }


def build_ledger(program: dict, txns: list[dict], multipliers: dict | None = None) -> dict:
    """LedgerResponse per docs/api.md.

    ``program`` is a Program dict (``id``, ``obligation_cad``,
    ``contract_value_cad``, ``smb_target_pct``, ``rules_version``,
    ``rules_label``). ``multipliers`` (None -> defaults) only sets the
    ``multiplier`` shown for categories in ``multiplier_breakdown``; a
    category that has transactions shows the multiplier those txns used.
    """
    m = _mults(multipliers)
    program_id = program.get("id") or program.get("program_id") or ""
    obligation = round(float(program.get("obligation_cad") or 0.0), 2)
    contract_value = float(program.get("contract_value_cad") or obligation)
    target_pct = float(program.get("smb_target_pct") or 0.0)

    direct_c = 0
    indirect_c = 0
    smb_c = 0
    breakdown = {
        cat: {"multiplier": m[cat], "count": 0, "value_c": 0, "credit_c": 0} for cat in CATEGORY_ORDER
    }

    for t in txns:
        c = _cents(t.get("credit_cad", 0.0))
        if t.get("type") == "indirect":
            indirect_c += c
        else:
            direct_c += c
        cat = t.get("category")
        if cat == "sme_direct":
            smb_c += _cents(float(t.get("value_cad", 0.0)) * float(t.get("ccv_pct", 0.0)))
        if cat in breakdown:
            b = breakdown[cat]
            b["count"] += 1
            b["value_c"] += _cents(t.get("value_cad", 0.0))
            b["credit_c"] += c
            if "multiplier" in t:
                b["multiplier"] = t["multiplier"]

    total = _money(direct_c + indirect_c)
    flags = ["simplified-demo"]
    if any("assumption" in (t.get("flags") or ()) for t in txns):
        flags.append("assumption")
    target_cad = round(contract_value * target_pct, 2)
    achieved = _money(smb_c)

    return {
        "program_id": program_id,
        "rules_version": program.get("rules_version", ""),
        "rules_label": program.get("rules_label") or DEFAULT_RULES_LABEL,
        "obligation_cad": obligation,
        "credit_total_cad": total,
        "obligation_met_pct": _pct(total, obligation),
        "direct_credit_cad": _money(direct_c),
        "indirect_credit_cad": _money(indirect_c),
        "smb": {
            "target_pct": target_pct,
            "target_cad": target_cad,
            "achieved_cad": achieved,
            "progress_pct": _pct(achieved, target_cad),
            "basis": SMB_BASIS,
        },
        "multiplier_breakdown": [
            {
                "category": cat,
                "label": CATEGORY_LABELS[cat],
                "multiplier": breakdown[cat]["multiplier"],
                "count": breakdown[cat]["count"],
                "value_cad": _money(breakdown[cat]["value_c"]),
                "credit_cad": _money(breakdown[cat]["credit_c"]),
            }
            for cat in CATEGORY_ORDER
        ],
        "transactions": list(txns),
        "flags": flags,
    }


def snapshot(ledger: dict, assigned: int, blocked: int) -> dict:
    """Snapshot per docs/api.md (used by the fund before/after diff)."""
    smb = ledger.get("smb", {})
    return {
        "assigned": int(assigned),
        "blocked": int(blocked),
        "credit_total_cad": ledger["credit_total_cad"],
        "obligation_met_pct": ledger["obligation_met_pct"],
        "direct_credit_cad": ledger["direct_credit_cad"],
        "indirect_credit_cad": ledger["indirect_credit_cad"],
        "smb_achieved_cad": smb.get("achieved_cad", 0.0),
        "smb_progress_pct": smb.get("progress_pct", 0.0),
    }
