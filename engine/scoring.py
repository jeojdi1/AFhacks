"""Match scoring (H2.4): score, breakdown and the 3 reasons shown on an Assignment.

``score = w_fit*fit + w_distance*(1 - d/d_max) + w_lead_time*(1 - lead/lead_max)
+ w_itb_value*itb_norm`` (CLAUDE.md §3.3). Weights and constants come from
``data/rules/weights.json``; every term is clamped to [0, 1], so the score is in [0, 1].
"""

from __future__ import annotations

import math

from engine.rules import CERT_REASON_PRIORITY, cert_label, process_label

TOLERANCE: tuple[str, ...] = ("standard", "precision", "ultra")

DEFAULT_WEIGHTS: dict = {
    "weights": {"fit": 0.35, "distance": 0.25, "lead_time": 0.15, "itb_value": 0.25},
    "d_max_km": 200,
    "lead_max_days": 60,
    "itb_norm": {"sme": 1.0, "non_sme": 0.5},
    "fit": {
        "components": {"tolerance": 0.40, "material": 0.35, "envelope": 0.25},
        "tolerance": {
            "shop_equals_job": 1.0,
            "shop_better_than_job": 0.85,
            "shop_worse_than_job": 0.3,
        },
        "material": {"in_shop_materials": 1.0, "not_listed": 0.4},
    },
}
# envelope term: 0.6 + 0.4 * min(1, margin / 0.5)   (weights.json "fit.envelope.formula")
_ENV_BASE, _ENV_SPAN, _ENV_FULL_MARGIN = 0.6, 0.4, 0.5


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def _get(cfg: dict | None, *path, default):
    cur = cfg if cfg is not None else {}
    for key in path:
        if not isinstance(cur, dict) or key not in cur:
            return default
        cur = cur[key]
    return cur


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def distance_km(program: dict, shop: dict) -> float:
    site = program.get("site") or {}
    return haversine_km(float(site["lat"]), float(site["lon"]), float(shop["lat"]), float(shop["lon"]))


def _tol_index(t: str | None) -> int:
    return TOLERANCE.index(t) if t in TOLERANCE else 0


def fit_score(job: dict, shop: dict, weights_cfg: dict | None = None) -> float:
    """fit = 0.40*tolerance + 0.35*material + 0.25*envelope, in [0, 1]."""
    d = DEFAULT_WEIGHTS["fit"]
    comp = _get(weights_cfg, "fit", "components", default=d["components"])
    tol_cfg = _get(weights_cfg, "fit", "tolerance", default=d["tolerance"])
    mat_cfg = _get(weights_cfg, "fit", "material", default=d["material"])

    diff = _tol_index(shop.get("tolerance_class")) - _tol_index(job.get("tolerance_class"))
    if diff == 0:
        tol = tol_cfg.get("shop_equals_job", 1.0)
    elif diff > 0:
        tol = tol_cfg.get("shop_better_than_job", 0.85)
    else:
        tol = tol_cfg.get("shop_worse_than_job", 0.3)

    in_mats = job.get("material") in (shop.get("materials") or ())
    mat = mat_cfg.get("in_shop_materials", 1.0) if in_mats else mat_cfg.get("not_listed", 0.4)

    job_env = sorted(job.get("envelope_mm") or [])
    shop_env = sorted(shop.get("max_envelope_mm") or [])
    margins = [(s - j) / s for j, s in zip(job_env, shop_env) if s]
    margin = min(margins) if margins else 0.0
    env = _ENV_BASE + _ENV_SPAN * min(1.0, max(0.0, margin) / _ENV_FULL_MARGIN)

    return _clamp(
        comp.get("tolerance", 0.40) * _clamp(tol)
        + comp.get("material", 0.35) * _clamp(mat)
        + comp.get("envelope", 0.25) * _clamp(env)
    )


def score(
    job: dict, shop: dict, dist_km: float, weights_cfg: dict | None = None
) -> tuple[float, dict]:
    """Return ``(score, breakdown)``; score rounded to 4 places, breakdown terms to 3."""
    w = _get(weights_cfg, "weights", default=DEFAULT_WEIGHTS["weights"])
    d_max = float(_get(weights_cfg, "d_max_km", default=DEFAULT_WEIGHTS["d_max_km"]))
    lead_max = float(_get(weights_cfg, "lead_max_days", default=DEFAULT_WEIGHTS["lead_max_days"]))
    itb_cfg = _get(weights_cfg, "itb_norm", default=DEFAULT_WEIGHTS["itb_norm"])

    fit = fit_score(job, shop, weights_cfg)
    dist = _clamp(1 - float(dist_km) / d_max) if d_max else 0.0
    lead = _clamp(1 - float(shop.get("lead_time_days") or 0) / lead_max) if lead_max else 0.0
    itb = _clamp(itb_cfg.get("sme", 1.0) if shop.get("is_sme") else itb_cfg.get("non_sme", 0.5))
    total = (
        w.get("fit", 0) * fit
        + w.get("distance", 0) * dist
        + w.get("lead_time", 0) * lead
        + w.get("itb_value", 0) * itb
    )
    breakdown = {
        "fit": round(fit, 3),
        "distance": round(dist, 3),
        "lead_time": round(lead, 3),
        "itb_value": round(itb, 3),
    }
    return round(_clamp(total), 4), breakdown


def site_phrase(program: dict) -> str:
    """"Northgate's London site" from the Program dict."""
    prime = (program.get("prime_name") or "the prime").split()[0]
    city = (program.get("site") or {}).get("city") or "program"
    return f"{prime}'s {city} site"


def reasons(job: dict, shop: dict, dist_km: float, n_eligible: int, program: dict) -> list[str]:
    """Exactly 3 short reasons: capability, compliance/distance, credit."""
    procs = [process_label(p) for p in job.get("process_tags") or ()][:2]
    cap = " + ".join(procs) or "Capability match"
    cert = next((c for c in CERT_REASON_PRIORITY if c in (job.get("required_certs") or ())), None)
    if cert:
        cap = f"{cap} + {cert_label(cert)}"
    cap = cap[0].upper() + cap[1:]
    if job.get("controlled"):
        second = "CGP-registered (controlled job)"
    else:
        second = f"{dist_km:.0f} km from {site_phrase(program)}"
    if shop.get("is_sme"):
        third = "SME: 2x direct credit"
    elif n_eligible == 1:
        third = "Only qualified shop in range (1x credit)"
    else:
        third = "Large firm: 1x direct credit"
    return [cap, second, third]
