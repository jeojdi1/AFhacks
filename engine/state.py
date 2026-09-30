"""In-memory demo state + SQLite persistence (H2.1).

One ``State`` per program, serialized as JSON into ``data/muster.db`` (table
``state``). The API loads it, mutates it under ``STATE_LOCK`` and saves it back, so
the demo survives an engine restart. ``MUSTER_DB`` overrides the database path.

Every save is a new ``revision`` (monotonically increasing per program row, persisted in
the JSON and in the ``revision`` column; a reset continues the count). Together with the
row's random ``epoch`` (fixed when the row is first written) it identifies one immutable
State, which is what ``engine.cache`` keys its memoized views on: ``state_key`` reads just
those two columns, so a cached read never parses the JSON again.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from dataclasses import dataclass, field, fields
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
PROCESSED_DIR = DATA_DIR / "processed"
RULES_DIR = DATA_DIR / "rules"
DEFAULT_DB = DATA_DIR / "muster.db"

PROGRAM_FILE = PROCESSED_DIR / "program_northgate.json"
SHOPS_FILE = PROCESSED_DIR / "shops_synthetic.json"
DEMO_PARTS_CSV = PROCESSED_DIR / "parts_northgate.csv"
RULE_FILES = ("policy", "filters", "weights", "training_costs")

DEFAULT_PROGRAM_ID = "northgate"
SYNTHETIC_LABEL = "Synthetic"
PUBLIC_LABEL = "Public data — unverified — not affiliated"

STATE_LOCK = threading.Lock()


@dataclass
class State:
    program: dict
    shops: dict[str, dict]
    jobs: list[dict] = field(default_factory=list)
    assignments: dict[str, dict] = field(default_factory=dict)
    blocked: list[dict] = field(default_factory=list)
    packages: dict[str, dict] = field(default_factory=dict)
    txns: list[dict] = field(default_factory=list)
    funded: list[str] = field(default_factory=list)
    cert_overrides: dict[str, dict[str, str]] = field(default_factory=dict)
    capacity_bonus: dict[str, float] = field(default_factory=dict)
    stage: str = "empty"
    solver: str | None = None
    elapsed_ms: int = 0
    tagger_counts: dict = field(default_factory=dict)
    config: dict = field(default_factory=dict)
    revision: int = 0
    # Shop-side actions and the activity log (engine/shopside.py, docs/api.md §6). Additive:
    # older databases load with these empty (from_json ignores unknown keys, and missing
    # ones take these defaults).
    offer_decisions: dict[str, dict] = field(default_factory=dict)  # "shop:job" → OfferDecision
    funding_requests: dict[str, dict] = field(default_factory=dict)  # package_id → FundingRequest
    capacity_checkins: dict[str, dict] = field(default_factory=dict)  # shop_id → CapacityCheckin
    cert_declarations: dict[str, dict[str, dict]] = field(default_factory=dict)  # shop → type → decl
    events: list[dict] = field(default_factory=list)  # Event, oldest first
    event_seq: int = 0  # last Event seq issued (kept across upload clears; a reset restarts it)
    idempotency: dict[str, dict] = field(default_factory=dict)  # idempotency_key → stored response
    # Award onboarding progress after an accept (engine/award.py, docs/api.md §6.1). Additive.
    awards: dict[str, dict] = field(default_factory=dict)  # "shop:job" → paperwork + kickoff call
    # Supplier document vault marks (engine/vault.py, docs/api.md §6.2). Additive; seeds live in
    # data/processed/vault_synthetic.json, so an older database simply has no shop marks.
    vault: dict[str, dict[str, dict]] = field(default_factory=dict)  # shop → item key → record
    # Right-sized work (engine/rightsize.py, docs/api.md §9). Additive; belongs to the shop, so
    # upload and routing keep it (a reset clears it).
    shop_preferences: dict[str, dict] = field(default_factory=dict)  # shop_id → work preferences


def db_path() -> Path:
    return Path(os.environ.get("MUSTER_DB") or DEFAULT_DB)


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_config() -> dict:
    return {name: _read_json(RULES_DIR / f"{name}.json") for name in RULE_FILES}


def load_shops() -> dict[str, dict]:
    raw = _read_json(SHOPS_FILE)
    items = raw["shops"] if isinstance(raw, dict) else raw
    shops: dict[str, dict] = {}
    for s in items:
        shop = dict(s)
        if not shop.get("label"):
            shop["label"] = PUBLIC_LABEL if shop.get("source") == "public" else SYNTHETIC_LABEL
        shop["certifications"] = [dict(c) for c in shop.get("certifications") or []]
        shops[shop["id"]] = shop
    return shops


def load_seed() -> State:
    """A fresh State from data/processed + data/rules (stage "empty")."""
    return State(program=_read_json(PROGRAM_FILE), shops=load_shops(), config=load_config())


def to_json(state: State) -> str:
    # Same JSON as json.dumps(asdict(state)), without asdict's recursive deep copy.
    data = {f.name: getattr(state, f.name) for f in fields(State)}
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def from_json(text: str) -> State:
    data = json.loads(text)
    known = {f.name for f in fields(State)}
    return State(**{k: v for k, v in data.items() if k in known})


def connect(path: Path | None = None) -> sqlite3.Connection:
    p = path or db_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(p)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS state ("
        "program_id TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT, "
        "revision INTEGER, epoch TEXT)"
    )
    cols = {row[1] for row in conn.execute("PRAGMA table_info(state)")}
    for col, kind in (("revision", "INTEGER"), ("epoch", "TEXT")):
        if col not in cols:  # a database written before revisions existed
            conn.execute(f"ALTER TABLE state ADD COLUMN {col} {kind}")
            conn.commit()
    return conn


def state_key(program_id: str = DEFAULT_PROGRAM_ID) -> tuple[str, str, int] | None:
    """``(db path, epoch, revision)`` of the stored State, or None if there is none (or it
    predates revisions). Cheap: two small columns, no JSON."""
    path = db_path()
    if not path.exists():
        return None
    conn = connect(path)
    try:
        row = conn.execute(
            "SELECT epoch, revision FROM state WHERE program_id = ?", (program_id,)
        ).fetchone()
    finally:
        conn.close()
    if row is None or row[0] is None or row[1] is None:
        return None
    return (str(path), row[0], int(row[1]))


def load_state(program_id: str = DEFAULT_PROGRAM_ID) -> State:
    """The saved State for ``program_id``, or a fresh seed if none is stored."""
    conn = connect()
    try:
        row = conn.execute("SELECT json FROM state WHERE program_id = ?", (program_id,)).fetchone()
    finally:
        conn.close()
    if row is None:
        return load_seed()
    try:
        return from_json(row[0])
    except (ValueError, TypeError):
        return load_seed()


def load_state_keyed(program_id: str = DEFAULT_PROGRAM_ID) -> tuple[State, tuple | None]:
    """``(State, state_key)`` read in ONE query, so the key describes exactly that State.
    The key is None when nothing is stored (a fresh seed comes back) or the row predates
    revisions."""
    path = db_path()
    conn = connect(path)
    try:
        row = conn.execute(
            "SELECT json, epoch, revision FROM state WHERE program_id = ?", (program_id,)
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return load_seed(), None
    try:
        state = from_json(row[0])
    except (ValueError, TypeError):
        return load_seed(), None
    if row[1] is None or row[2] is None:
        return state, None
    return state, (str(path), row[1], int(row[2]))


def save_state(state: State) -> None:
    """Persist ``state`` as a new revision: ``state.revision`` becomes one more than both
    its own value and the stored row's (so it only ever grows, resets included)."""
    program_id = state.program.get("id") or DEFAULT_PROGRAM_ID
    now = datetime.now(UTC).isoformat(timespec="seconds")
    conn = connect()
    try:
        with conn:
            row = conn.execute(
                "SELECT revision, epoch FROM state WHERE program_id = ?", (program_id,)
            ).fetchone()
            stored = int(row[0]) if row and row[0] is not None else 0
            epoch = row[1] if row and row[1] else uuid.uuid4().hex
            state.revision = max(int(state.revision or 0), stored) + 1
            conn.execute(
                "INSERT INTO state(program_id, json, updated_at, revision, epoch) "
                "VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(program_id) DO UPDATE SET json = excluded.json, "
                "updated_at = excluded.updated_at, revision = excluded.revision, "
                "epoch = excluded.epoch",
                (program_id, to_json(state), now, state.revision, epoch),
            )
    finally:
        conn.close()


def reset_state(program_id: str = DEFAULT_PROGRAM_ID) -> State:
    state = load_seed()
    save_state(state)
    return state
