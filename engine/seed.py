"""Builds SQLite from data/processed (H2.1).

``python -m engine.seed`` (``make seed``) resets the demo state and also writes
read-only reference tables ``shops`` and ``certifications`` for inspection. The API
never reads those tables; it uses the ``state`` table (engine/state.py).
"""

from __future__ import annotations

import json

from engine.state import connect, db_path, reset_state


def write_reference_tables(state) -> tuple[int, int]:
    conn = connect()
    n_shops = n_certs = 0
    try:
        with conn:
            conn.execute("DROP TABLE IF EXISTS shops")
            conn.execute("DROP TABLE IF EXISTS certifications")
            conn.execute(
                "CREATE TABLE shops (id TEXT PRIMARY KEY, name TEXT, source TEXT, city TEXT, "
                "lat REAL, lon REAL, is_sme INTEGER, json TEXT NOT NULL)"
            )
            conn.execute(
                "CREATE TABLE certifications (shop_id TEXT, type TEXT, status TEXT, "
                "source_url TEXT, verified_at TEXT, expires_at TEXT, "
                "PRIMARY KEY (shop_id, type))"
            )
            for s in state.shops.values():
                conn.execute(
                    "INSERT INTO shops VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (s["id"], s.get("name"), s.get("source"), s.get("city"), s.get("lat"),
                     s.get("lon"), int(bool(s.get("is_sme"))), json.dumps(s, ensure_ascii=False)),
                )
                n_shops += 1
                for c in s.get("certifications") or []:
                    conn.execute(
                        "INSERT OR REPLACE INTO certifications VALUES (?, ?, ?, ?, ?, ?)",
                        (s["id"], c.get("type"), c.get("status"), c.get("source_url"),
                         c.get("verified_at"), c.get("expires_at")),
                    )
                    n_certs += 1
    finally:
        conn.close()
    return n_shops, n_certs


def main() -> int:
    state = reset_state()
    n_shops, n_certs = write_reference_tables(state)
    print(
        f"seed: {db_path()} program={state.program['id']} shops={n_shops} "
        f"certifications={n_certs} jobs={len(state.jobs)} stage={state.stage}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
