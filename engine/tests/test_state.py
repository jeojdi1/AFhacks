"""engine/state.py + engine/seed.py: seed shape, SQLite round trip, reset (H2.1)."""

import sqlite3

import pytest

from engine import seed
from engine import state as st


@pytest.fixture
def tmp_db(tmp_path, monkeypatch):
    path = tmp_path / "muster_test.db"
    monkeypatch.setenv("MUSTER_DB", str(path))
    return path


def test_load_seed_shape():
    s = st.load_seed()
    assert s.stage == "empty"
    assert s.program["id"] == "northgate"
    for key in ("prime_name", "prime_label", "site", "contract_value_cad", "obligation_cad",
                "smb_target_pct", "rules_version", "rules_label"):
        assert key in s.program
    assert len(s.shops) == 30
    for sid, shop in s.shops.items():
        assert shop["id"] == sid
        assert shop["label"] == ("Synthetic" if shop["source"] == "synthetic"
                                 else "Public data — unverified — not affiliated")
        assert shop["certifications"], sid
        assert all(c["shop_id"] == sid for c in shop["certifications"])
    assert set(s.config) == {"policy", "filters", "weights", "training_costs"}
    assert s.jobs == [] and s.assignments == {} and s.funded == [] and s.txns == []


def test_label_added_when_missing(monkeypatch, tmp_path):
    shops = tmp_path / "shops.json"
    shops.write_text(
        '{"shops": [{"id": "p-1", "source": "public", "certifications": []},'
        ' {"id": "s-1", "source": "synthetic"}]}',
        encoding="utf-8",
    )
    monkeypatch.setattr(st, "SHOPS_FILE", shops)
    out = st.load_shops()
    assert out["p-1"]["label"] == "Public data — unverified — not affiliated"
    assert out["s-1"]["label"] == "Synthetic"
    assert out["s-1"]["certifications"] == []


def test_db_path_env_override(tmp_db):
    assert st.db_path() == tmp_db


def test_load_state_without_db_returns_seed(tmp_db):
    assert not tmp_db.exists() or tmp_db.stat().st_size == 0
    s = st.load_state()
    assert s.stage == "empty" and len(s.shops) == 30


def test_save_load_round_trip(tmp_db):
    s = st.load_seed()
    s.stage = "funded"
    s.jobs = [{"id": "NG-001", "status": "assigned"}]
    s.assignments = {"NG-001": {"job_id": "NG-001", "shop_id": "syn-001"}}
    s.funded = ["TP-01"]
    s.cert_overrides = {"syn-012": {"CWB_W47.1": "pending_training"}}
    s.capacity_bonus = {"syn-012": 80.0}
    s.solver = "ortools"
    s.elapsed_ms = 12
    s.tagger_counts = {"llm": 0, "cache": 40, "rules": 0}
    st.save_state(s)
    back = st.load_state("northgate")
    assert back == s
    # Overwrite, not append.
    s.stage = "routed"
    st.save_state(s)
    assert st.load_state().stage == "routed"
    with sqlite3.connect(tmp_db) as conn:
        rows = conn.execute("SELECT program_id, updated_at FROM state").fetchall()
    assert len(rows) == 1 and rows[0][0] == "northgate" and rows[0][1]


def test_reset_state_overwrites(tmp_db):
    s = st.load_seed()
    s.stage = "routed"
    s.jobs = [{"id": "NG-001"}]
    st.save_state(s)
    fresh = st.reset_state()
    assert fresh.stage == "empty" and fresh.jobs == []
    assert st.load_state().stage == "empty"


def test_unknown_keys_in_stored_json_are_ignored(tmp_db):
    s = st.load_seed()
    text = st.to_json(s)[:-1] + ',"future_field":1}'
    assert st.from_json(text) == s


def test_seed_main_writes_reference_tables(tmp_db, capsys):
    assert seed.main() == 0
    out = capsys.readouterr().out
    assert "shops=30" in out
    with sqlite3.connect(tmp_db) as conn:
        n_shops = conn.execute("SELECT COUNT(*) FROM shops").fetchone()[0]
        n_certs = conn.execute("SELECT COUNT(*) FROM certifications").fetchone()[0]
        cgp = conn.execute(
            "SELECT status FROM certifications WHERE shop_id = 'syn-001' AND type = 'CGP'"
        ).fetchone()
        stored = conn.execute("SELECT COUNT(*) FROM state").fetchone()[0]
    assert n_shops == 30
    assert n_certs >= 30
    assert cgp is not None
    assert stored == 1
    # Re-running is idempotent.
    assert seed.main() == 0
    with sqlite3.connect(tmp_db) as conn:
        assert conn.execute("SELECT COUNT(*) FROM shops").fetchone()[0] == 30
