import pytest
from fastapi.testclient import TestClient

from engine.app import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSTER_DB", str(tmp_path / "health_test.db"))
    with TestClient(app) as c:
        yield c


def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["service"] == "muster-engine"


def test_ledger_before_routing_is_400(client):
    assert client.post("/demo/reset").status_code == 200
    r = client.get("/programs/northgate/ledger")
    assert r.status_code == 400
    assert "detail" in r.json()
