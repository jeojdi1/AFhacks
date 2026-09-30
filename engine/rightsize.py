"""Right-sized work: offer size, shop preferences, work packages and decline insights
(docs/api.md §9, additive v0.6).

Why (feedback from Ontario shop owners, anonymized): small shops skip anything under
about $100K a year (more for a one-and-done job), and quotes below their minimum run get a
setup charge, a minimum quantity, or a decline. So:

- every offer shows its annual value (value ÷ program years) and how long the work runs;
- a shop's offers from one program are grouped into one work package with a total annual
  value, flagged against the shop's own minimum ("meets your minimum" / "below");
- the prime sees why shops said no (decline reasons and counter-offer terms), each with a
  plain suggestion ("bundle small jobs into one package").

Display and data only: nothing here changes routing, assignments, credit or the ledger.
Program years come from the program (``program_years`` / ``duration_years``) when present,
else 8 years (the fleet lifetime, labelled ``assumption``). Pure functions over a
duck-typed State; errors are ``shopside.ActionError`` in the callers.
"""

from __future__ import annotations

import copy
import math
from typing import Any

from engine.gaps import short_money

DEFAULT_PROGRAM_YEARS = 8  # fleet lifetime for the demo program (assumption)
PROGRAM_YEARS_KEYS = ("program_years", "duration_years")
PREF_FIELDS = ("min_annual_value_cad", "prefers_ongoing")
PREF_BASES = ("illustrative", "shop-declared")

# Plain suggestions for the prime (docs/api.md §9). Keys are decline reason codes
# (engine.shopside.REASON_LABEL) and counter-offer terms.
DECLINE_SUGGESTION = {
    "too_small": "Bundle small jobs into one package, so each shop sees one bigger, steadier order.",
    "min_quantity": "Order at least the shop's minimum run, or combine deliveries into fewer, larger lots.",
    "paperwork": "Cut the paperwork: one standard subcontract, and reuse the certificates the shop already has on file.",
    "price": "Check the unit price against the market: short runs cost more per part.",
    "capacity": "Give more lead time, or split the work between two shops.",
    "schedule": "Move the start date or stagger the deliveries.",
    "tooling": "Offer to pay for the tooling, or send the job to a shop that already has it.",
    "not_our_process": "Check the job's process: it may have been matched to the wrong kind of shop.",
    "other": "Ask the shop what would change its answer.",
}
COUNTER_LABEL = {
    "setup_charge": "asked for a setup charge",
    "min_quantity": "asked for a minimum run",
}
COUNTER_SUGGESTION = {
    "setup_charge": "Budget a one-time setup fee for small runs; it is often cheaper than finding another shop.",
    "min_quantity": "Order at least the shop's minimum run, or combine deliveries into fewer, larger lots.",
}
BELOW_MINIMUM_SUGGESTION = (
    "Bundle these into bigger packages: each is below what the shop says is worth its time."
)


def _num(x: float) -> int | float:
    x = round(float(x), 2)
    return int(x) if x.is_integer() else x


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and not math.isnan(v)


# --------------------------------------------------------------------------- program years


def program_years(program: dict | None) -> tuple[int | float, str]:
    """``(years, flag)``: the program's own duration when it has one (flag ``"program"``),
    else ``DEFAULT_PROGRAM_YEARS`` (flag ``"assumption"``)."""
    for key in PROGRAM_YEARS_KEYS:
        v = (program or {}).get(key)
        if _is_number(v) and v > 0:
            return _num(v), "program"
    return DEFAULT_PROGRAM_YEARS, "assumption"


def annual_value(value_cad: float, years: float) -> int | float:
    return _num(float(value_cad or 0) / float(years))


# --------------------------------------------------------------------------- preferences


def declared_preferences(state: Any, shop_id: str) -> dict | None:
    """What the shop set itself (``POST /shops/{id}/preferences``), or None."""
    return (getattr(state, "shop_preferences", None) or {}).get(shop_id)


def preferences(state: Any, shop_id: str) -> dict:
    """Effective preferences of a routable shop: the shop's own (``shop-declared``) over
    the seed data (``illustrative`` for synthetic shops), else no preference (all None)."""
    rec = declared_preferences(state, shop_id)
    if rec is not None:
        return {
            "min_annual_value_cad": rec.get("min_annual_value_cad"),
            "prefers_ongoing": rec.get("prefers_ongoing"),
            "basis": "shop-declared",
        }
    shop = (getattr(state, "shops", None) or {}).get(shop_id) or {}
    if any(shop.get(k) is not None for k in PREF_FIELDS):
        return {
            "min_annual_value_cad": shop.get("min_annual_value_cad"),
            "prefers_ongoing": shop.get("prefers_ongoing"),
            "basis": shop.get("preferences_basis") or "illustrative",
        }
    return {"min_annual_value_cad": None, "prefers_ongoing": None, "basis": None}


def apply_preferences(state: Any, shop_view: dict) -> dict:
    """Overlay the shop's own preferences on a shop view dict (in place; returns it).
    Seed values are already on the dict; nothing is added for a shop without any."""
    rec = declared_preferences(state, shop_view.get("id"))
    if rec is not None:
        shop_view["min_annual_value_cad"] = rec.get("min_annual_value_cad")
        shop_view["prefers_ongoing"] = rec.get("prefers_ongoing")
        shop_view["preferences_basis"] = "shop-declared"
    return shop_view


# --------------------------------------------------------------------------- offers + packages


def offer_size(value_cad: float, years: float, flag: str, min_annual: float | None) -> dict:
    """The size fields added to every offer in ``GET /shops/{id}``."""
    annual = annual_value(value_cad, years)
    return {
        "annual_value_cad": annual,
        "duration_years": years,
        "duration_flag": flag,
        "ongoing": float(years) > 1,
        "meets_minimum": None if min_annual is None else annual >= float(min_annual),
    }


def _years_text(years: float) -> str:
    y = _num(years)
    return "1 year" if y == 1 else f"{y} years"


def package_message(prime: str, n: int, annual: float, years: float, min_annual: float | None,
                    meets: bool | None) -> str:
    """"Northgate work package: 2 jobs · $212K a year for about 8 years · meets your
    $100K-a-year minimum"."""
    jobs = "1 job" if n == 1 else f"{n} jobs"
    msg = f"{prime} work package: {jobs} · {short_money(annual)} a year for about {_years_text(years)}"
    if min_annual is not None:
        verdict = "meets" if meets else "below"
        msg += f" · {verdict} your {short_money(min_annual)}-a-year minimum"
    return msg


def work_packages(offers: list[dict], prefs: dict, years: float, flag: str,
                  prime_name: str | None = None) -> list[dict]:
    """A shop's offers grouped per program (one work package each). Declined offers are
    off the table: they are counted in ``declined`` but not in the totals."""
    min_annual = prefs.get("min_annual_value_cad")
    groups: dict[str, list[dict]] = {}
    for o in offers:
        groups.setdefault(o.get("program_id") or "", []).append(o)
    out = []
    for program_id, group in groups.items():
        live = [o for o in group if o.get("status") != "declined"]
        total = _num(sum(round(float(o["value_cad"]) * 100) for o in live) / 100)
        annual = annual_value(total, years)
        meets = None if min_annual is None else annual >= float(min_annual)
        prime = next((o.get("prime_name") for o in group if o.get("prime_name")), None) or prime_name or "The prime"
        out.append(
            {
                "program_id": program_id,
                "prime_name": prime,
                "job_ids": [o["job_id"] for o in live],
                "offers": len(live),
                "declined": len(group) - len(live),
                "total_value_cad": total,
                "annual_value_cad": annual,
                "duration_years": years,
                "duration_flag": flag,
                "ongoing": float(years) > 1,
                "min_annual_value_cad": min_annual,
                "prefers_ongoing": prefs.get("prefers_ongoing"),
                "meets_minimum": meets,
                "below_minimum_job_ids": [o["job_id"] for o in live if o.get("meets_minimum") is False],
                "message": package_message(prime.split()[0], len(live), annual, years, min_annual, meets),
            }
        )
    return out


# --------------------------------------------------------------------------- decline insights


def decline_insights(state: Any, reason_labels: dict[str, str]) -> dict:
    """``GET /programs/{id}/decline-insights``: why shops said no (decline reasons), what
    they asked for instead (counter-offer terms), and which placed offers are below the
    shop's own minimum, each with a plain suggestion for the prime. Reads the current
    decisions (one per shop and job) and the assignments; never changes anything."""
    decisions = list((getattr(state, "offer_decisions", None) or {}).values())
    assignments = getattr(state, "assignments", None) or {}
    order = {code: i for i, code in enumerate(reason_labels)}

    def value_of(job_id: str) -> float:
        return float((assignments.get(job_id) or {}).get("value_cad") or 0)

    by_reason: dict[str, dict] = {}
    by_term: dict[str, dict] = {}
    for d in decisions:
        if d.get("decision") == "declined":
            code = d.get("reason_code") if d.get("reason_code") in reason_labels else "other"
            row = by_reason.setdefault(code, {
                "kind": "decline", "code": code, "label": reason_labels[code], "count": 0,
                "job_ids": [], "shop_ids": [], "value_cad": 0.0,
                "suggestion": DECLINE_SUGGESTION.get(code, DECLINE_SUGGESTION["other"]),
            })
            row["count"] += 1
            row["job_ids"].append(d["job_id"])
            row["shop_ids"].append(d["shop_id"])
            row["value_cad"] += value_of(d["job_id"])
        counter = d.get("counter") or None
        if counter:
            for term, key in (("setup_charge", "setup_charge_cad"), ("min_quantity", "min_quantity")):
                if counter.get(key) is None:
                    continue
                row = by_term.setdefault(term, {
                    "kind": "counter", "code": term, "label": COUNTER_LABEL[term], "count": 0,
                    "job_ids": [], "shop_ids": [], "value_cad": 0.0,
                    "suggestion": COUNTER_SUGGESTION[term],
                })
                row["count"] += 1
                row["job_ids"].append(d["job_id"])
                row["shop_ids"].append(d["shop_id"])
                row["value_cad"] += value_of(d["job_id"])
                if term == "setup_charge":
                    row["total_setup_cad"] = _num(row.get("total_setup_cad", 0) + float(counter[key]))

    def finish(rows: list[dict]) -> list[dict]:
        for r in rows:
            r["job_ids"] = sorted(r["job_ids"])
            r["shop_ids"] = sorted(set(r["shop_ids"]))
            r["value_cad"] = _num(r["value_cad"])
        return rows

    reasons = finish(sorted(by_reason.values(), key=lambda r: (-r["count"], order.get(r["code"], 99))))
    counters = finish(sorted(by_term.values(), key=lambda r: (-r["count"], r["code"])))

    years, flag = program_years(getattr(state, "program", None))
    below_jobs: list[str] = []
    below_shops: set[str] = set()
    for job_id, a in assignments.items():
        min_annual = preferences(state, a.get("shop_id")).get("min_annual_value_cad")
        if min_annual is not None and annual_value(a.get("value_cad") or 0, years) < float(min_annual):
            below_jobs.append(job_id)
            below_shops.add(a.get("shop_id"))
    below = {
        "count": len(below_jobs),
        "job_ids": sorted(below_jobs),
        "shop_ids": sorted(below_shops),
        "duration_years": years,
        "duration_flag": flag,
        "suggestion": BELOW_MINIMUM_SUGGESTION if below_jobs else None,
    }
    return {
        "program_id": (getattr(state, "program", None) or {}).get("id"),
        "declined": sum(r["count"] for r in reasons),
        "countered": sum(1 for d in decisions if d.get("counter")),
        "reasons": copy.deepcopy(reasons),
        "counters": copy.deepcopy(counters),
        "below_minimum": below,
        "flags": ["assumption"],
    }
