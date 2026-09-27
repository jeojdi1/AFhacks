"""In-memory demo state + SQLite persistence (H2.1).

One ``State`` per program, serialized as JSON into ``data/muster.db`` (table
``state``). The API loads it, mutates it under ``STATE_LOCK`` and saves it back, so
the demo survives an engine restart. ``MUSTER_DB`` overrides the database path.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from dataclasses import asdict, dataclass, field, fields
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
    return json.dumps(asdict(state), ensure_ascii=False, separators=(",", ":"))


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
        "program_id TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT)"
    )
    return conn


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


def save_state(state: State) -> None:
    program_id = state.program.get("id") or DEFAULT_PROGRAM_ID
    now = datetime.now(UTC).isoformat(timespec="seconds")
    conn = connect()
    try:
        with conn:
            conn.execute(
                "INSERT INTO state(program_id, json, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(program_id) DO UPDATE SET json = excluded.json, "
                "updated_at = excluded.updated_at",
                (program_id, to_json(state), now),
            )
    finally:
        conn.close()


def reset_state(program_id: str = DEFAULT_PROGRAM_ID) -> State:
    state = load_seed()
    save_state(state)
    return state
