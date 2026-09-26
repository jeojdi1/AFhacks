from fastapi.testclient import TestClient

from engine.app import app

client = TestClient(app)


def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["service"] == "muster-engine"


def test_stub_returns_501():
    r = client.get("/programs/northgate/ledger")
    assert r.status_code == 501
    assert r.json() == {"detail": "not implemented", "task": "H2.5"}
