"""Hard filters (H2.3): process, envelope, certs, controlled_cgp, cpcsc, capacity.

Pure functions over plain dicts shaped like docs/api.md objects. A ``shop`` here is a Shop
dict that also carries ``"certifications"`` (a list of Certification dicts, already with any
funding overrides applied: see ``engine.pipeline.effective_shop``).

Every failing filter returns a readable reason. Which cert statuses count comes from
``data/rules/filters.json`` (``counting_cert_statuses``); the defaults match docs/api.md §1.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

RULES_DIR = Path(__file__).resolve().parent.parent / "data" / "rules"
RULE_FILES = ("policy", "filters", "weights", "training_costs")

FILTERS: tuple[str, ...] = ("process", "envelope", "certs", "controlled_cgp", "cpcsc", "capacity")
COUNTING_STATUSES: tuple[str, ...] = ("verified", "declared", "pending_training")
CPCSC = "CPCSC_L1"
CGP = "CGP"

PROCESS_LABEL: dict[str, str] = {
    "cnc_milling": "CNC milling",
    "five_axis_milling": "5-axis milling",
    "cnc_turning": "CNC turning",
    "sheet_metal": "sheet metal",
    "welding": "welding",
    "heat_treat": "heat treating",
    "anodizing": "anodizing",
    "plating": "plating",
    "painting": "painting",
    "wire_harness": "wire harness",
    "electronics_assembly": "electronics assembly",
    "fasteners": "fasteners",
}
CERT_LABEL: dict[str, str] = {
    "CGP": "CGP registration",
    "CPCSC_L1": "CPCSC Level 1",
    "ISO9001": "ISO 9001",
    "AS9100": "AS9100",
    "NADCAP:HEAT_TREAT": "Nadcap heat treating",
    "NADCAP:CHEM_PROCESSING": "Nadcap chemical processing",
    "NADCAP:COATINGS": "Nadcap coatings",
    "CWB_W47.1": "CWB W47.1",
}
# Most specific first: the cert named in reasons and gap texts.
CERT_REASON_PRIORITY: tuple[str, ...] = (
    "CWB_W47.1",
    "NADCAP:HEAT_TREAT",
    "NADCAP:CHEM_PROCESSING",
    "NADCAP:COATINGS",
    "AS9100",
    "CPCSC_L1",
    "ISO9001",
)


def process_label(tag: str) -> str:
    return PROCESS_LABEL.get(tag, tag.replace("_", " "))


def cert_label(ctype: str) -> str:
    return CERT_LABEL.get(ctype, ctype)


# --------------------------------------------------------------------------- config


def load_rules(rules_dir: str | Path | None = None) -> dict[str, dict]:
    """Read ``data/rules/{policy,filters,weights,training_costs}.json`` into one dict.

    Missing or unreadable files come back as ``{}``.
    """
    base = Path(rules_dir) if rules_dir is not None else RULES_DIR
    out: dict[str, dict] = {}
    for name in RULE_FILES:
        try:
            out[name] = json.loads((base / f"{name}.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            out[name] = {}
    return out


def counting_statuses(filters_cfg: dict | None = None) -> tuple[str, ...]:
    vals = (filters_cfg or {}).get("counting_cert_statuses")
    return tuple(vals) if vals else COUNTING_STATUSES


# --------------------------------------------------------------------------- helpers


def cert_status(shop: dict, ctype: str) -> str:
    for c in shop.get("certifications") or ():
        if c.get("type") == ctype:
            return c.get("status") or "unknown"
    return "unknown"


def cert_counts(shop: dict, ctype: str, counting: tuple[str, ...] = COUNTING_STATUSES) -> bool:
    return cert_status(shop, ctype) in counting


def fits(job_env: list, shop_env: list) -> bool:
    """A job fits if its sorted dimensions are each <= the shop's sorted dimensions."""
    return all(j <= s for j, s in zip(sorted(job_env), sorted(shop_env)))


def _dims(env: list) -> str:
    return "x".join(f"{d:g}" for d in env)


def _hours(h: float) -> str:
    return f"{h:g}"


def missing_processes(job: dict, shop: dict) -> list[str]:
    offered = set(shop.get("processes") or ())
    return [p for p in job.get("process_tags") or () if p not in offered]


def missing_certs(
    job: dict, shop: dict, counting: tuple[str, ...] = COUNTING_STATUSES
) -> list[str]:
    """Required certs (other than CPCSC_L1, which the cpcsc filter checks) that do not count."""
    return [
        c
        for c in job.get("required_certs") or ()
        if c != CPCSC and not cert_counts(shop, c, counting)
    ]


def requires_cpcsc(job: dict) -> bool:
    return CPCSC in (job.get("required_certs") or ())


# --------------------------------------------------------------------------- filters


def evaluate(
    job: dict,
    shop: dict,
    remaining_hours: float | None = None,
    *,
    counting: tuple[str, ...] = COUNTING_STATUSES,
) -> dict[str, Any]:
    """Run every hard filter for one (job, shop) pair.

    ``remaining_hours`` None skips the capacity filter (used to build candidates: pairs
    passing every filter except capacity). Returns::

        {"eligible": bool,
         "failing": [filter codes, in FILTERS order],
         "reasons": {code: readable reason}}
    """
    reasons: dict[str, str] = {}

    miss_p = missing_processes(job, shop)
    if miss_p:
        reasons["process"] = "Does not offer " + " + ".join(process_label(p) for p in miss_p)

    job_env = job.get("envelope_mm") or []
    shop_env = shop.get("max_envelope_mm") or []
    if not fits(job_env, shop_env):
        reasons["envelope"] = (
            f"Part {_dims(job_env)} mm does not fit the {_dims(shop_env)} mm work envelope"
        )

    miss_c = missing_certs(job, shop, counting)
    if miss_c:
        reasons["certs"] = "Missing " + ", ".join(
            f"{cert_label(c)} (status {cert_status(shop, c)})" for c in miss_c
        )

    if job.get("controlled") and not cert_counts(shop, CGP, counting):
        reasons["controlled_cgp"] = (
            "Controlled job (controlled technical data) needs a CGP-registered shop; "
            f"CGP status is {cert_status(shop, CGP)}"
        )

    if requires_cpcsc(job) and not cert_counts(shop, CPCSC, counting):
        reasons["cpcsc"] = (
            f"Job requires CPCSC Level 1; shop status is {cert_status(shop, CPCSC)}"
        )

    if remaining_hours is not None:
        need = float(job.get("hours_week") or 0)
        if float(remaining_hours) < need:
            reasons["capacity"] = (
                f"Only {_hours(max(0.0, float(remaining_hours)))} h/week free; "
                f"job needs {_hours(need)}"
            )

    failing = [f for f in FILTERS if f in reasons]
    return {"eligible": not failing, "failing": failing, "reasons": reasons}


def failing_filters(
    job: dict,
    shop: dict,
    remaining_hours: float | None = None,
    *,
    counting: tuple[str, ...] = COUNTING_STATUSES,
) -> list[str]:
    """Just the failing filter codes (FILTERS order)."""
    return evaluate(job, shop, remaining_hours, counting=counting)["failing"]


def is_eligible(
    job: dict,
    shop: dict,
    remaining_hours: float | None = None,
    *,
    counting: tuple[str, ...] = COUNTING_STATUSES,
) -> bool:
    return not failing_filters(job, shop, remaining_hours, counting=counting)
