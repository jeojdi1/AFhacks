"""Supplier document vault: "paperwork once" (docs/api.md §6.2, additive).

Shop owners told us the paperwork for a first defence order is the slow part, and that
after the first time "it runs like any other project". The vault keeps the reusable part
of that paperwork on the shop's profile so the next award package reuses it:

- certificate of insurance, quality certificates (copies), a master mutual NDA with
  Northgate (fictional), a Canadian content (CCV) declaration template, and the vendor and
  banking set-up form.

**No file is stored.** An item records only that the document is on file, its type, the
date it was put on file and (optionally) its expiry. No banking details, no personal names.

Seeds: ``data/processed/vault_synthetic.json`` (illustrative records for a few synthetic
shops, labelled synthetic). ``State.vault`` holds what a shop marked since the last reset
(``{shop_id: {key: record}}``); a record there overrides the seed. Upload and route keep
the vault (it belongs to the shop, like capacity check-ins); a reset clears it.

Award reuse (engine/award.py): an award document whose vault item is on file and not
expired starts as done, "Reused from your profile". Numbers never change: the vault
touches no assignment, job, package or ledger value.

Routes: ``GET /shops/{shop_id}/vault``, ``POST /shops/{shop_id}/vault/{key}``.
"""

from __future__ import annotations

import copy
import json
import math
from datetime import UTC, date
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict

from engine import cache, shopside
from engine.state import (
    DEFAULT_PROGRAM_ID,
    PROCESSED_DIR,
    STATE_LOCK,
    State,
    load_state,
    save_state,
)

router = APIRouter()

SEED_FILE = PROCESSED_DIR / "vault_synthetic.json"

# The reusable documents, in display order. ``award_document`` is the award package
# document (engine/award.py) the item fills in; ``minutes_saved`` is the time one reuse
# saves (assumption: typical time to find, fill in and send the document, not measured).
VAULT_ITEMS: tuple[dict, ...] = (
    {
        "key": "insurance",
        "title": "Certificate of insurance",
        "why": "Proof of business liability insurance. Defence companies ask for it before a first order.",
        "award_document": "insurance",
        "has_expiry": True,
        "minutes_saved": 30,
    },
    {
        "key": "quality",
        "title": "Quality certificates (copies)",
        "why": "Copies of your quality certificates, such as ISO 9001 or AS9100, to attach to each award.",
        "award_document": "quality",
        "has_expiry": True,
        "minutes_saved": 20,
    },
    {
        "key": "nda",
        "title": "Master mutual NDA with Northgate",
        "why": "One two-way confidentiality agreement that covers every job with Northgate (fictional).",
        "award_document": "nda",
        "has_expiry": False,
        "minutes_saved": 45,
    },
    {
        "key": "ccv",
        "title": "Canadian content (CCV) declaration template",
        "why": "How much of your work is Canadian. Filled in with each job's numbers for Northgate's Canadian-content report.",
        "award_document": "ccv",
        "has_expiry": False,
        "minutes_saved": 60,
    },
    {
        "key": "vendor",
        "title": "Vendor and banking set-up form",
        "why": "How Northgate pays you. Set up once; Shieldworks stores no banking details.",
        "award_document": None,
        "has_expiry": False,
        "minutes_saved": 40,
    },
)
ITEM_BY_KEY: dict[str, dict] = {i["key"]: i for i in VAULT_ITEMS}
KEY_FOR_DOC: dict[str, str] = {i["award_document"]: i["key"] for i in VAULT_ITEMS if i["award_document"]}

STATUSES = ("on_file", "expiring_soon", "expired", "missing")
REUSABLE = ("on_file", "expiring_soon")
EXPIRING_DAYS = 60  # assumption: the same reminder window as data/rules/renewals.json defaults
REUSED_LABEL = "Reused from your profile"
NOTE = (
    "Shieldworks records only that a document is on file: its type and dates. No file is "
    "stored, and no banking details or personal names."
)
TIME_SAVED_BASIS = "Typical time to find, fill in and send each document again (assumption, not measured)."
SYNTHETIC_NOTE = "Synthetic shop: illustrative record (no file stored)"


# --------------------------------------------------------------------------- seeds

_seed_cache: dict[str, Any] = {}


def load_seeds(path: Path | None = None) -> dict[str, dict[str, dict]]:
    """``{shop_id: {key: record}}`` from the seed file (``{}`` if missing or unreadable).
    Cached per file path and modification time."""
    p = Path(path) if path is not None else SEED_FILE
    try:
        mtime = p.stat().st_mtime_ns
    except OSError:
        return {}
    hit = _seed_cache.get(str(p))
    if hit is not None and hit[0] == mtime:
        return hit[1]
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    out: dict[str, dict[str, dict]] = {}
    for sid, items in ((raw or {}).get("shops") or {}).items():
        for rec in items or []:
            key = rec.get("key")
            if key in ITEM_BY_KEY:
                out.setdefault(sid, {})[key] = {
                    "on_file": True,
                    "on_file_at": rec.get("on_file_at"),
                    "expires_at": rec.get("expires_at"),
                    "source": "synthetic",
                    "note": rec.get("note") or SYNTHETIC_NOTE,
                    "at": None,
                }
    _seed_cache[str(p)] = (mtime, out)
    return out


# --------------------------------------------------------------------------- views


def today() -> date:
    return shopside.clock().astimezone(UTC).date()


def _date(v: Any) -> date | None:
    if not isinstance(v, str) or not v:
        return None
    try:
        return date.fromisoformat(v[:10])
    except ValueError:
        return None


def _records(state: Any, shop_id: str) -> dict[str, dict]:
    """Seed records overlaid with this shop's own marks (a mark with on_file False hides a seed)."""
    merged = dict(load_seeds().get(shop_id) or {})
    for key, rec in ((getattr(state, "vault", None) or {}).get(shop_id) or {}).items():
        merged[key] = rec
    return merged


def item_view(item: dict, rec: dict | None, on: date) -> dict:
    """One VaultItem: the catalogue entry plus its status for this shop on ``on``."""
    on_file = bool(rec and rec.get("on_file"))
    expires = _date(rec.get("expires_at")) if on_file else None
    days_left = (expires - on).days if expires else None
    if not on_file:
        status = "missing"
    elif days_left is not None and days_left < 0:
        status = "expired"
    elif days_left is not None and days_left <= EXPIRING_DAYS:
        status = "expiring_soon"
    else:
        status = "on_file"
    return {
        "key": item["key"],
        "title": item["title"],
        "why": item["why"],
        "award_document": item["award_document"],
        "has_expiry": item["has_expiry"],
        "status": status,
        "on_file": on_file,
        "reusable": status in REUSABLE,
        "on_file_at": rec.get("on_file_at") if on_file else None,
        "expires_at": rec.get("expires_at") if on_file else None,
        "days_left": days_left,
        "source": rec.get("source") if on_file else None,
        "note": rec.get("note") if on_file else None,
        # When the shop marked it (ISO timestamp); None for seeded records.
        "marked_at": rec.get("at") if on_file else None,
        "minutes_saved": item["minutes_saved"],
    }


def items(state: Any, shop_id: str) -> list[dict]:
    recs = _records(state, shop_id)
    on = today()
    return [item_view(i, recs.get(i["key"]), on) for i in VAULT_ITEMS]


def by_award_document(state: Any, shop_id: str) -> dict[str, dict]:
    """``{award document key: VaultItem}`` (any status) for the items an award reuses."""
    return {r["award_document"]: r for r in items(state, shop_id) if r["award_document"]}


def vendor_item(state: Any, shop_id: str) -> dict:
    """The vendor and banking set-up form (no award document; it shortens payment set-up)."""
    return next(r for r in items(state, shop_id) if r["key"] == "vendor")


def time_saved(minutes: int) -> dict:
    """``{"minutes", "label", "flag", "basis"}``: "about 45 minutes" / "about 3.5 hours"
    (rounded to the nearest half hour from one hour up)."""
    minutes = int(minutes)
    if minutes <= 0:
        label = "no time saved yet"
    elif minutes < 60:
        label = f"about {minutes} minutes"
    else:
        half = math.floor(minutes / 30 + 0.5) / 2
        n = f"{half:g}"
        label = f"about {n} hour" + ("" if half == 1 else "s")
    return {"minutes": minutes, "label": label, "flag": "assumption", "basis": TIME_SAVED_BASIS}


def view(state: Any, shop_id: str) -> dict:
    """``GET /shops/{shop_id}/vault``."""
    shop = shopside._shop(state, shop_id)
    rows = items(state, shop_id)
    reusable = [r for r in rows if r["reusable"]]
    return {
        "shop_id": shop_id,
        "shop_name": shop.get("name"),
        "shop_source": shop.get("source"),
        "as_of": today().isoformat(),
        "items": rows,
        "on_file": len(reusable),
        "total": len(rows),
        "expired": sum(1 for r in rows if r["status"] == "expired"),
        "expiring_soon": sum(1 for r in rows if r["status"] == "expiring_soon"),
        "time_saved_per_award": time_saved(sum(r["minutes_saved"] for r in reusable)),
        "note": NOTE,
        "flags": ["assumption"],
    }


# --------------------------------------------------------------------------- actions


def put(state: Any, shop_id: str, key: str, *, on_file: bool = True, expires_at: str | None = None) -> None:
    """Record a shop's mark (no validation, no idempotency: callers check)."""
    vault = getattr(state, "vault", None)
    if vault is None:
        vault = {}
        state.vault = vault
    rec = {
        "on_file": bool(on_file),
        "on_file_at": today().isoformat() if on_file else None,
        "expires_at": expires_at if on_file else None,
        "source": "shop",
        "note": "Marked on file by the shop (no file stored)" if on_file else None,
        "at": shopside._now(),
    }
    vault.setdefault(shop_id, {})[key] = rec


def _expiry(body: dict) -> str | None:
    raw = body.get("expires_at")
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return None
    if not isinstance(raw, str) or not shopside._DATE_RE.match(raw.strip()):
        raise shopside.ActionError(400, "expires_at must be a date as YYYY-MM-DD")
    try:
        d = date.fromisoformat(raw.strip())
    except ValueError:
        raise shopside.ActionError(400, f"expires_at '{raw}' is not a valid date") from None
    if d < date(2000, 1, 1):
        raise shopside.ActionError(400, "expires_at is before 2000-01-01")
    now = today()
    try:
        latest = now.replace(year=now.year + shopside.EXPIRY_MAX_YEARS)
    except ValueError:  # 29 Feb
        latest = now.replace(year=now.year + shopside.EXPIRY_MAX_YEARS, day=28)
    if d > latest:
        raise shopside.ActionError(400, f"expires_at is more than {shopside.EXPIRY_MAX_YEARS} years from today")
    return d.isoformat()


def mark(state: Any, shop_id: str, key: str, body: dict) -> tuple[dict, bool]:
    """``POST /shops/{shop_id}/vault/{key}`` ``{on_file?: true, expires_at?: "YYYY-MM-DD",
    idempotency_key?}``: mark one document on file (or off file with ``on_file: false``).
    Idempotent: the same mark again changes nothing; a reused idempotency_key replays the
    stored response (409 if it was used for a different request)."""
    shopside._shop(state, shop_id)
    item = ITEM_BY_KEY.get(key)
    if item is None:
        raise shopside.ActionError(404, f"Unknown vault item '{key}' (one of: {', '.join(ITEM_BY_KEY)})")
    on_file = body.get("on_file", True)
    if on_file is None:
        on_file = True
    if not isinstance(on_file, bool):
        raise shopside.ActionError(400, "on_file must be true or false")
    # A date is optional on every item (a shop may date a document that usually has none).
    expires_at = _expiry(body) if on_file else None

    idem = shopside._idem_key(body)
    fp = shopside._fingerprint("vault", (shop_id, key), {"on_file": on_file, "expires_at": expires_at})
    stored = shopside._replay(state, idem, "vault", fp)
    if stored is not None:
        return stored, False

    current = _records(state, shop_id).get(key)
    same = (
        bool(current and current.get("on_file")) == on_file
        and (not on_file or (current or {}).get("expires_at") == expires_at)
    )
    if not same:
        put(state, shop_id, key, on_file=on_file, expires_at=expires_at)
    full = view(state, shop_id)
    resp = {"item": next(r for r in full["items"] if r["key"] == key), "vault": full, "changed": not same}
    shopside._remember(state, idem, "vault", fp, resp)
    return resp, (not same) or bool(idem)


# --------------------------------------------------------------------------- HTTP


class MarkBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    idempotency_key: str | None = None
    on_file: bool | None = None
    expires_at: str | None = None


def _http(fn):
    try:
        return fn()
    except shopside.ActionError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail) from None


@router.get("/shops/{shop_id}/vault")
def get_vault(shop_id: str) -> Response:
    # Expiry status follows the demo clock's date, so the cache key carries it.
    day = today().isoformat()
    with STATE_LOCK:
        body = cache.view(
            DEFAULT_PROGRAM_ID, ("vault", shop_id, day),
            lambda s: JSONResponse(_http(lambda: view(s, shop_id))).body,
        )
    return Response(content=body, media_type="application/json")


@router.post("/shops/{shop_id}/vault/{key}")
def post_vault(shop_id: str, key: str, body: MarkBody | None = None) -> dict:
    data = body.model_dump(exclude_unset=True) if body is not None else {}
    with STATE_LOCK:
        state: State = load_state(DEFAULT_PROGRAM_ID)
        result, changed = _http(lambda: mark(state, shop_id, key, data))
        if changed:
            save_state(state)
            cache.invalidate(DEFAULT_PROGRAM_ID)
        return copy.deepcopy(result)
