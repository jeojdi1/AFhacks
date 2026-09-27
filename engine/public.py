"""Discovered public shops (read-only): real companies from public data, never routed.

``data/processed/shops_public.json`` lists real southwestern Ontario manufacturers found
in public data (Statistics Canada ODBus, OGL, and each company's own website). They are
labelled "Public data — unverified — not affiliated", have ``onboarding: "discovered"``
and carry only self-reported facts with a source URL per field (CLAUDE.md §5).

They are **listed, never routed**: they are not in ``State.shops``, so rules, scoring,
assignment, gaps, readiness and the ledger never see them. ``engine.pipeline`` appends
them to ``GET /shops`` (after the synthetic shops) and serves ``GET /shops/pub-XXX``
from here with empty offers / readiness / training.

No contact data is ever served: ``contact_role_email`` is always null and provenance
rows about contact fields are dropped. The file is loaded once and cached (it is static);
callers get deep copies.
"""

from __future__ import annotations

import copy
import json
import os
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PATH = REPO_ROOT / "data" / "processed" / "shops_public.json"
PREFIX = "pub-"
LABEL = "Public data — unverified — not affiliated"
ONBOARDING = "discovered"
NOTICE = (
    "Discovered from public data (Statistics Canada ODBus, OGL, and the company's own website). "
    "Unverified, not affiliated, not onboarded: this shop is not offered work until it claims "
    "and verifies its profile."
)

# docs/api.md §2 Shop, in contract order.
SHOP_FIELDS = (
    "id", "name", "source", "label", "city", "lat", "lon", "naics", "employee_band", "is_sme",
    "processes", "machines", "materials", "max_envelope_mm", "tolerance_class",
    "capacity_hours_week", "lead_time_days", "website", "contact_role_email", "provenance",
)
CONTACT_FIELDS = {"contact_role_email", "phone", "email", "contact"}


def data_path() -> Path:
    """``MUSTER_PUBLIC_SHOPS`` (tests) or data/processed/shops_public.json."""
    return Path(os.environ.get("MUSTER_PUBLIC_SHOPS") or DEFAULT_PATH)


def is_public_id(shop_id: str) -> bool:
    return isinstance(shop_id, str) and shop_id.startswith(PREFIX)


def _certifications(raw: dict) -> list[dict]:
    out = []
    for c in raw.get("certifications") or []:
        out.append(
            {
                "shop_id": raw["id"],
                "type": c["type"],
                "status": c.get("status") or "unknown",
                "source_url": c.get("source_url"),
                "verified_at": c.get("verified_at"),
                "expires_at": c.get("expires_at"),
                "note": c.get("note"),
            }
        )
    return out


def _entry(raw: dict) -> dict:
    """The Shop object served for a public shop (list and detail), cert_summary included.

    Public cert_summary items also carry ``source_url``, ``verified_at`` (the date the
    source was read), ``expires_at`` and ``note`` (additive), so a list view can show
    where a self-reported certification was read and the detail can be rebuilt from it."""
    shop = {k: copy.deepcopy(raw.get(k)) for k in SHOP_FIELDS}
    shop["source"] = "public"
    shop["label"] = LABEL
    shop["contact_role_email"] = None
    shop["provenance"] = [
        dict(p) for p in raw.get("provenance") or [] if p.get("field") not in CONTACT_FIELDS
    ]
    shop["onboarding"] = ONBOARDING
    shop["notes"] = raw.get("notes")
    shop["cert_summary"] = [
        {k: v for k, v in c.items() if k != "shop_id"} for c in _certifications(raw)
    ]
    return shop


@lru_cache(maxsize=4)
def _load(path: str) -> tuple[tuple[dict, dict], ...]:
    """((shop entry, detail response), ...) in file order. Missing file -> ()."""
    p = Path(path)
    if not p.is_file():
        return ()
    doc = json.loads(p.read_text(encoding="utf-8"))
    raws = doc.get("shops") if isinstance(doc, dict) else doc
    out = []
    for raw in raws or []:
        if not isinstance(raw, dict) or not is_public_id(raw.get("id")):
            continue
        entry = _entry(raw)
        detail = {
            "shop": entry,
            "certifications": _certifications(raw),
            "offers": [],
            "readiness": [],
            "training": [],
            "notice": NOTICE,
        }
        out.append((entry, detail))
    return tuple(out)


def _rows() -> tuple[tuple[dict, dict], ...]:
    return _load(str(data_path()))


def clear_cache() -> None:
    _load.cache_clear()


def shops() -> list[dict]:
    """Every public shop entry (GET /shops, source=public), in file order."""
    return [copy.deepcopy(e) for e, _ in _rows()]


def ids() -> list[str]:
    return [e["id"] for e, _ in _rows()]


def detail(shop_id: str) -> dict:
    """ShopDetailResponse for a public shop: certifications with source URLs, provenance
    and notes on the shop, empty offers / readiness / training. KeyError if unknown."""
    for entry, d in _rows():
        if entry["id"] == shop_id:
            return copy.deepcopy(d)
    raise KeyError(shop_id)


def list_response() -> dict:
    """``GET /shops?source=public``."""
    return {"shops": shops()}
