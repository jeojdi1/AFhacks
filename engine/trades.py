"""Trade catalog: which trade a gap needs ("every trade, not just welders").

``data/rules/training_costs.json`` → ``trades``: each trade (welding, CNC machining,
electronics assembly, cable and harness assembly, coatings and plating, quality inspection)
lists the ``processes`` and ``certs`` it covers, the worker nouns ("CNC machinist" /
"CNC machinists"), an optional ``cost_cad`` per ITB training category, optional
``categories`` overrides per gap kind, and an optional ``recipient_example`` per gap kind.

A gap is ``(kind, requirement)``: ``("cert", "CWB_W47.1")`` maps through ``certs``,
``("capacity", "cnc_milling")`` through ``processes``. Welding carries no ``cost_cad`` and no
overrides, so the demo's welding packages (TP-01, TP-02) keep their original costs and wording.
Everything here is an assumption for the demo, labelled as such in the JSON.
"""

from __future__ import annotations

WELDING = "welding"

# Used when training_costs.json has no ``trades`` block (older rule files, tests).
DEFAULT_TRADES: dict[str, dict] = {
    WELDING: {
        "label": "Welding",
        "worker": "welder",
        "workers": "welders",
        "processes": ["welding"],
        "certs": ["CWB_W47.1"],
    },
}

GENERIC_WORKER = ("qualified worker", "qualified workers")


def catalog(tc: dict | None) -> dict[str, dict]:
    """``{trade_key: trade}`` from training_costs.json (``_``-prefixed keys skipped)."""
    raw = (tc or {}).get("trades")
    if not isinstance(raw, dict) or not raw:
        raw = DEFAULT_TRADES
    return {k: v for k, v in raw.items() if not k.startswith("_") and isinstance(v, dict)}


def for_process(tc: dict | None, process: str | None) -> tuple[str, dict] | None:
    for key, trade in catalog(tc).items():
        if process and process in (trade.get("processes") or ()):
            return key, trade
    return None


def for_cert(tc: dict | None, cert: str | None) -> tuple[str, dict] | None:
    for key, trade in catalog(tc).items():
        if cert and cert in (trade.get("certs") or ()):
            return key, trade
    return None


def for_gap(tc: dict | None, kind: str, requirement: str | None,
            process: str | None = None) -> tuple[str, dict] | None:
    """The trade for a gap. A cert gap maps through the trade's ``certs``, then (when the
    cert is in no trade) through the job's ``process``; a capacity gap through ``processes``."""
    if kind == "cert":
        return for_cert(tc, requirement) or for_process(tc, process)
    return for_process(tc, requirement)


def for_package(tc: dict | None, pkg: dict) -> tuple[str, dict] | None:
    """The trade of a TrainingPackage (from ``cert_unlock`` or the ``capacity_unlock`` key)."""
    if pkg.get("cert_unlock"):
        procs = list((pkg.get("capacity_unlock") or {}).keys())
        return for_gap(tc, "cert", pkg["cert_unlock"], procs[0] if procs else None)
    procs = list((pkg.get("capacity_unlock") or {}).keys())
    return for_process(tc, procs[0]) if procs else None


def workers(trade: dict | None, n: int | None = None) -> str:
    """"welders" / "CNC machinists" (plural), or "1 welder" / "4 welders" with ``n``."""
    one = (trade or {}).get("worker") or GENERIC_WORKER[0]
    many = (trade or {}).get("workers") or GENERIC_WORKER[1]
    if n is None:
        return many
    return f"{n} {one}" if n == 1 else f"{n} {many}"


def category(trade: dict | None, kind: str, default: str) -> str:
    """The ITB training category for this gap kind: the trade's override or the rule's."""
    override = ((trade or {}).get("categories") or {}).get(kind)
    return override if isinstance(override, str) and override else default


def cost(trade: dict | None, cat: str) -> float | None:
    """Per-trainee cost for a category from the trade's ``cost_cad``; None = use the rule file's
    ``costs`` block (welding)."""
    val = ((trade or {}).get("cost_cad") or {}).get(cat)
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return float(val)
    return None


def recipient_example(trade: dict | None, kind: str, default: str) -> str:
    override = ((trade or {}).get("recipient_example") or {})
    val = override.get(kind) if isinstance(override, dict) else None
    return val if isinstance(val, str) and val else default
