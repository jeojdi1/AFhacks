"""HTTP tests for engine/app.py (H2.8): the full demo flow plus error paths.

Every test uses a temporary SQLite file via MUSTER_DB, so data/muster.db is never
touched.
"""

import importlib
import json
import math
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import engine.app as app_module
from engine import state as st

REPO = Path(__file__).resolve().parents[2]
DEMO_CSV = REPO / "data" / "processed" / "parts_northgate.csv"
FIXTURES = REPO / "data" / "fixtures"

# ---- docs/api.md shapes (required keys) ------------------------------------------
PROGRAM_KEYS = {"id", "prime_name", "prime_label", "site", "contract_value_cad", "obligation_cad",
                "smb_target_pct", "rules_version", "rules_label"}
SHOP_KEYS = {"id", "name", "source", "label", "city", "lat", "lon", "naics", "employee_band", "is_sme",
             "processes", "machines", "materials", "max_envelope_mm", "tolerance_class",
             "capacity_hours_week", "lead_time_days", "website", "contact_role_email", "provenance"}
CERT_KEYS = {"shop_id", "type", "status", "source_url", "verified_at", "expires_at"}
JOB_KEYS = {"id", "program_id", "part_no", "description", "qty", "unit_price_cad", "est_value_cad",
            "ccv_pct", "hours_week", "material", "process_tags", "envelope_mm", "tolerance_class",
            "required_certs", "controlled", "tag_source", "status"}
ASSIGNMENT_KEYS = {"job_id", "part_no", "description", "shop_id", "shop_name", "shop_source",
                   "shop_city", "shop_lat", "shop_lon", "is_sme", "controlled", "hours_week",
                   "value_cad", "ccv_pct", "category", "multiplier", "credit_cad", "distance_km",
                   "score", "score_breakdown", "reasons", "status"}
BLOCKED_KEYS = {"job_id", "part_no", "description", "process_tags", "required_certs", "value_cad",
                "hours_week", "reason_code", "reason", "eligible_shop_count", "failing_filters",
                "suggestion_ids"}
TXN_KEYS = {"id", "program_id", "origin", "ref_id", "shop_id", "type", "category", "value_cad",
            "ccv_pct", "multiplier", "credit_cad", "flags"}
PACKAGE_KEYS = {"id", "program_id", "title", "blocked_job_ids", "shop_id", "shop_name", "shop_city",
                "shop_source", "gap", "category", "categories", "recipient_type", "recipient_example",
                "trainees", "est_cost_cad", "cost_basis", "multiplier", "est_credit_cad",
                "cert_unlock", "capacity_unlock", "unblocks_value_cad", "eligibility_note", "flags",
                "status"}
SNAPSHOT_KEYS = {"assigned", "blocked", "credit_total_cad", "obligation_met_pct", "direct_credit_cad",
                 "indirect_credit_cad", "smb_achieved_cad", "smb_progress_pct"}
FILTERS = {"process", "envelope", "certs", "controlled_cgp", "cpcsc", "capacity"}
CATEGORIES = ["regular", "sme_direct", "training", "indigenous_training"]
COUNTING = {"verified", "declared", "pending_training"}


def has(obj: dict, keys: set, where: str) -> None:
    assert isinstance(obj, dict), where
    missing = keys - set(obj)
    assert not missing, f"{where}: missing {sorted(missing)}"


def money(a: float, b: float) -> bool:
    return abs(a - b) <= 0.01 + 1e-12 * max(abs(a), abs(b))


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSTER_DB", str(tmp_path / "api_test.db"))
    with TestClient(app_module.app) as c:
        yield c


def upload_csv(client: TestClient, text: str | bytes, name: str = "parts.csv"):
    return client.post("/programs/northgate/parts", files={"file": (name, text, "text/csv")})


def upload_demo(client: TestClient):
    r = upload_csv(client, DEMO_CSV.read_bytes(), DEMO_CSV.name)
    assert r.status_code == 200, r.text
    return r.json()


def route(client: TestClient):
    r = client.post("/programs/northgate/route")
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------------
# The demo flow
# ---------------------------------------------------------------------------------
def test_full_demo_flow(client):
    # reset
    r = client.post("/demo/reset")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "program_id": "northgate", "shops": 30, "jobs": 0,
                        "message": "Demo reset: shops and program seeded; no parts uploaded."}

    r = client.get("/programs/northgate")
    assert r.status_code == 200
    prog = r.json()
    has(prog["program"], PROGRAM_KEYS, "program")
    assert prog["state"] == "empty"
    assert prog["counts"]["jobs"] == 0 and prog["counts"]["shops"] == 30

    # upload (multipart, real CSV)
    up = upload_demo(client)
    assert up["program_id"] == "northgate"
    assert up["count"] == 40 and len(up["jobs"]) == 40
    assert set(up["tagger"]) == {"llm", "cache", "rules"}
    assert sum(up["tagger"].values()) == 40
    for j in up["jobs"]:
        has(j, JOB_KEYS, f"job {j.get('id')}")
        assert j["status"] == "unrouted" and j["process_tags"]
        assert j["tag_source"] in {"llm", "cache", "rules"}
    jobs = {j["id"]: j for j in up["jobs"]}
    assert len(jobs) == 40
    assert client.get("/programs/northgate").json()["state"] == "uploaded"

    # route (36 / 4)
    rt = route(client)
    assert rt["program_id"] == "northgate"
    assert rt["solver"] in {"ortools", "greedy"}
    assert isinstance(rt["elapsed_ms"], int)
    stats = rt["stats"]
    assert stats["jobs"] == 40 and stats["assigned"] == 36 and stats["blocked"] == 4
    assert len(rt["assignments"]) == 36 and len(rt["blocked"]) == 4
    assert 0 <= stats["sme_share_pct"] <= 1
    assert money(stats["assigned_value_cad"], sum(a["value_cad"] for a in rt["assignments"]))

    shops = client.get("/shops").json()["shops"]
    cgp = {s["id"]: any(c["type"] == "CGP" and c["status"] in COUNTING for c in s["cert_summary"])
           for s in shops}
    for a in rt["assignments"]:
        has(a, ASSIGNMENT_KEYS, f"assignment {a['job_id']}")
        assert len(a["reasons"]) == 3
        assert a["controlled"] == jobs[a["job_id"]]["controlled"]
        if a["controlled"]:
            assert cgp[a["shop_id"]], f"controlled {a['job_id']} -> non-CGP {a['shop_id']}"
        assert money(a["credit_cad"], a["value_cad"] * a["ccv_pct"] * a["multiplier"])
    for b in rt["blocked"]:
        has(b, BLOCKED_KEYS, f"blocked {b['job_id']}")
        assert set(b["failing_filters"]) == FILTERS
        assert b["reason_code"] in FILTERS
    assert sorted(b["job_id"] for b in rt["blocked"]) == ["NG-031", "NG-032", "NG-033", "NG-034"]

    # assignments
    r = client.get("/programs/northgate/assignments")
    assert r.status_code == 200
    body = r.json()
    assert body["program_id"] == "northgate"
    assert sorted(a["job_id"] for a in body["assignments"]) == sorted(a["job_id"] for a in rt["assignments"])

    # ledger invariants
    r = client.get("/programs/northgate/ledger")
    assert r.status_code == 200
    led = r.json()
    for k in ("program_id", "rules_version", "rules_label", "obligation_cad", "credit_total_cad",
              "obligation_met_pct", "direct_credit_cad", "indirect_credit_cad", "smb",
              "multiplier_breakdown", "transactions", "flags"):
        assert k in led, k
    tx_sum = 0.0
    for t in led["transactions"]:
        has(t, TXN_KEYS, f"txn {t.get('id')}")
        assert money(t["credit_cad"], t["value_cad"] * t["ccv_pct"] * t["multiplier"])
        tx_sum += t["credit_cad"]
    assert len(led["transactions"]) == 36
    assert money(led["credit_total_cad"], tx_sum)
    assert money(led["credit_total_cad"], led["direct_credit_cad"] + led["indirect_credit_cad"])
    assert math.isclose(led["obligation_met_pct"], led["credit_total_cad"] / led["obligation_cad"], abs_tol=1e-6)
    smb = led["smb"]
    assert math.isclose(smb["progress_pct"], smb["achieved_cad"] / smb["target_cad"], abs_tol=1e-6)
    assert [m["category"] for m in led["multiplier_breakdown"]] == CATEGORIES
    assert 0.11 <= led["obligation_met_pct"] <= 0.16

    # gaps
    r = client.get("/programs/northgate/gaps")
    assert r.status_code == 200
    gaps = r.json()
    assert gaps["summary"]["blocked_jobs"] == 4
    sugg = {s["id"]: s for s in gaps["suggestions"]}
    assert {"TP-01", "TP-02"} <= set(sugg)
    for s in sugg.values():
        has(s, PACKAGE_KEYS, f"package {s['id']}")
        assert s["status"] == "suggested" and "assumption" in s["flags"]
        assert money(s["est_credit_cad"], s["est_cost_cad"] * s["multiplier"])
    for b in gaps["blocked"]:
        assert b["suggestion_ids"] and set(b["suggestion_ids"]) <= set(sugg)
    tp01 = sugg["TP-01"]
    assert tp01["shop_id"] == "syn-012"

    # shop view before funding
    r = client.get("/shops/syn-012")
    assert r.status_code == 200
    before_shop = r.json()
    assert any(t["package_id"] == "TP-01" and t["status"] == "suggested" for t in before_shop["training"])

    # fund TP-01
    r = client.post("/programs/northgate/training/TP-01/fund")
    assert r.status_code == 200, r.text
    fund = r.json()
    assert fund["program_id"] == "northgate" and fund["package_id"] == "TP-01"
    has(fund["package"], PACKAGE_KEYS, "fund.package")
    assert fund["package"]["status"] == "funded"
    has(fund["before"], SNAPSHOT_KEYS, "fund.before")
    has(fund["after"], SNAPSHOT_KEYS, "fund.after")
    has(fund["training_txn"], TXN_KEYS, "fund.training_txn")
    assert fund["training_txn"]["origin"] == "training"
    assert fund["training_txn"]["type"] == "indirect"
    assert sorted(u["job_id"] for u in fund["unblocked_jobs"]) == ["NG-031", "NG-032", "NG-033"]
    for u in fund["unblocked_jobs"]:
        has(u, ASSIGNMENT_KEYS, f"unblocked {u['job_id']}")
    assert fund["still_blocked"] == ["NG-034"]
    assert fund["credit_added"] > 0
    assert money(fund["credit_added"],
                 fund["after"]["credit_total_cad"] - fund["before"]["credit_total_cad"])
    bd = fund["credit_added_breakdown"]
    assert money(fund["credit_added"], bd["training_cad"] + bd["jobs_cad"])
    assert fund["after"]["blocked"] < fund["before"]["blocked"]
    assert isinstance(fund["headline"], str) and fund["headline"]

    # fund TP-01 again -> 409
    r = client.post("/programs/northgate/training/TP-01/fund")
    assert r.status_code == 409
    assert "already funded" in r.json()["detail"]

    # program + ledger after funding
    prog = client.get("/programs/northgate").json()
    assert prog["state"] == "funded"
    assert prog["counts"] == {"jobs": 40, "assigned": 39, "blocked": 1, "shops": 30}
    led2 = client.get("/programs/northgate/ledger").json()
    assert money(led2["credit_total_cad"], fund["after"]["credit_total_cad"])
    assert led2["indirect_credit_cad"] > 0
    assert len(client.get("/programs/northgate/assignments").json()["assignments"]) == 39

    # shop view after funding
    r = client.get("/shops/syn-012")
    assert r.status_code == 200
    shop = r.json()
    has(shop["shop"], SHOP_KEYS, "shop")
    assert shop["shop"]["id"] == "syn-012"
    for c in shop["certifications"]:
        has(c, CERT_KEYS, "certification")
    cwb = [c for c in shop["certifications"] if c["type"] == "CWB_W47.1"]
    assert cwb and cwb[0]["status"] == "pending_training"
    offer_ids = {o["job_id"] for o in shop["offers"]}
    assert {"NG-031", "NG-032", "NG-033"} & offer_ids
    assert isinstance(shop["readiness"], list)
    entry = next(t for t in shop["training"] if t["package_id"] == "TP-01")
    assert entry["status"] == "funded"

    # jobs (new endpoint)
    r = client.get("/programs/northgate/jobs")
    assert r.status_code == 200
    jb = r.json()
    assert jb["program_id"] == "northgate" and len(jb["jobs"]) == 40
    statuses = {j["id"]: j["status"] for j in jb["jobs"]}
    for j in jb["jobs"]:
        has(j, JOB_KEYS, f"job {j['id']}")
    assert statuses["NG-031"] == "assigned" and statuses["NG-034"] == "blocked"
    assert sum(1 for v in statuses.values() if v == "assigned") == 39


def test_flow_matches_fixtures(client):
    """The live engine reproduces the checked fixture numbers (scripts/build_fixtures.py)."""
    client.post("/demo/reset")
    upload_demo(client)
    rt = route(client)
    fx_route = fixture("route.json")
    assert rt["stats"]["assigned"] == fx_route["stats"]["assigned"]
    assert rt["stats"]["blocked"] == fx_route["stats"]["blocked"]
    assert money(rt["stats"]["assigned_value_cad"], fx_route["stats"]["assigned_value_cad"])
    led = client.get("/programs/northgate/ledger").json()
    assert money(led["credit_total_cad"], fixture("ledger.json")["credit_total_cad"])
    fund = client.post("/programs/northgate/training/TP-01/fund").json()
    fx_fund = fixture("fund_TP-01.json")
    assert money(fund["credit_added"], fx_fund["credit_added"])
    assert fund["headline"] == fx_fund["headline"]


def test_use_demo_query_upload(client):
    client.post("/demo/reset")
    r = client.post("/programs/northgate/parts?use_demo=true")
    assert r.status_code == 200, r.text
    assert r.json()["count"] == 40


def test_upload_clears_routing_and_funding(client):
    client.post("/demo/reset")
    upload_demo(client)
    route(client)
    assert client.post("/programs/northgate/training/TP-01/fund").status_code == 200
    upload_demo(client)
    s = st.load_state()
    assert s.stage == "uploaded"
    assert s.assignments == {} and s.blocked == [] and s.packages == {}
    assert s.txns == [] and s.funded == [] and s.cert_overrides == {} and s.capacity_bonus == {}
    assert all(j["status"] == "unrouted" for j in s.jobs)
    assert client.get("/programs/northgate/ledger").status_code == 400
    assert client.get("/programs/northgate/assignments").json()["assignments"] == []


def test_greedy_solver_query(client):
    client.post("/demo/reset")
    upload_demo(client)
    r = client.post("/programs/northgate/route?solver=greedy")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["solver"] == "greedy"
    assert body["stats"]["assigned"] + body["stats"]["blocked"] == 40


# ---------------------------------------------------------------------------------
# Error paths
# ---------------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/programs/nope"),
        ("post", "/programs/nope/parts?use_demo=true"),
        ("post", "/programs/nope/route"),
        ("get", "/programs/nope/assignments"),
        ("get", "/programs/nope/jobs"),
        ("get", "/programs/nope/ledger"),
        ("get", "/programs/nope/gaps"),
        ("post", "/programs/nope/training/TP-01/fund"),
        ("get", "/shops/does-not-exist"),
    ],
)
def test_404s(client, method, path):
    r = getattr(client, method)(path)
    assert r.status_code == 404
    assert isinstance(r.json()["detail"], str) and r.json()["detail"]


def test_fund_unknown_package_404(client):
    client.post("/demo/reset")
    upload_demo(client)
    route(client)
    r = client.post("/programs/northgate/training/TP-99/fund")
    assert r.status_code == 404
    assert "TP-99" in r.json()["detail"]


def test_route_before_upload_400(client):
    client.post("/demo/reset")
    r = client.post("/programs/northgate/route")
    assert r.status_code == 400
    assert r.json() == {"detail": "Upload a parts list first"}


def test_ledger_and_gaps_before_route_400(client):
    client.post("/demo/reset")
    for path in ("/programs/northgate/ledger", "/programs/northgate/gaps"):
        r = client.get(path)
        assert r.status_code == 400
        assert r.json() == {"detail": "Route the program first"}
    upload_demo(client)
    assert client.get("/programs/northgate/ledger").status_code == 400


def test_fund_before_route_400(client):
    client.post("/demo/reset")
    upload_demo(client)
    r = client.post("/programs/northgate/training/TP-01/fund")
    assert r.status_code == 400
    assert "Route" in r.json()["detail"]


def test_bad_csv_400(client):
    client.post("/demo/reset")
    r = upload_csv(client, "part_no,description\nA-1,Bracket\n")
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert "missing required column" in detail and "qty" in detail
    r = upload_csv(client, "part_no,description,qty,unit_price_cad\nA-1,Bracket,abc,10\n")
    assert r.status_code == 400
    assert "Row 2" in r.json()["detail"]
    r = upload_csv(client, b"\xff\xfe\x00bad")
    assert r.status_code == 400
    # A failed upload leaves the state untouched.
    assert client.get("/programs/northgate").json()["state"] == "empty"


def test_upload_without_file_or_demo_400(client):
    r = client.post("/programs/northgate/parts")
    assert r.status_code == 400
    assert "use_demo" in r.json()["detail"]


def test_bad_solver_and_source_400(client):
    assert client.post("/programs/northgate/route?solver=magic").status_code == 400
    assert client.get("/shops?source=secret").status_code == 400


# ---------------------------------------------------------------------------------
# Shops, CORS, persistence
# ---------------------------------------------------------------------------------
def test_shops_list_and_filter(client):
    client.post("/demo/reset")
    r = client.get("/shops")
    assert r.status_code == 200
    shops = r.json()["shops"]
    # 30 synthetic (routable) shops, then the discovered public shops (listed, never routed).
    assert [s["source"] for s in shops[:30]] == ["synthetic"] * 30
    assert all(s["source"] == "public" and s["onboarding"] == "discovered" for s in shops[30:])
    for s in shops:
        has(s, SHOP_KEYS | {"cert_summary"}, f"shop {s.get('id')}")
        for c in s["cert_summary"]:
            assert set(c) >= {"type", "status"}
    assert client.get("/shops?source=synthetic").json()["shops"] == shops[:30]
    assert client.get("/shops?source=public").json()["shops"] == shops[30:]


def test_shop_detail_before_routing(client):
    client.post("/demo/reset")
    r = client.get("/shops/syn-012")
    assert r.status_code == 200
    body = r.json()
    for k in ("shop", "certifications", "offers", "readiness", "training"):
        assert k in body
    assert body["offers"] == []


def test_cors_header_for_web_origin(client):
    r = client.get("/health", headers={"Origin": "http://localhost:3000"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"
    r = client.options(
        "/programs/northgate/route",
        headers={"Origin": "http://127.0.0.1:3000", "Access-Control-Request-Method": "POST"},
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "http://127.0.0.1:3000"
    r = client.get("/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in r.headers


def test_state_persists_across_app_instances(client, tmp_path):
    client.post("/demo/reset")
    upload_demo(client)
    route(client)
    assert client.post("/programs/northgate/training/TP-01/fund").status_code == 200
    ledger_before = client.get("/programs/northgate/ledger").json()

    fresh = importlib.reload(app_module)
    try:
        with TestClient(fresh.app) as c2:
            prog = c2.get("/programs/northgate").json()
            assert prog["state"] == "funded"
            assert prog["counts"]["assigned"] == 39
            assert c2.get("/programs/northgate/ledger").json() == ledger_before
            assert c2.post("/programs/northgate/training/TP-01/fund").status_code == 409
            jobs = c2.get("/programs/northgate/jobs").json()["jobs"]
            assert sum(1 for j in jobs if j["status"] == "assigned") == 39
    finally:
        importlib.reload(app_module)


def test_validation_errors_are_400_with_readable_detail(client):
    r = client.post("/programs/northgate/parts?use_demo=maybe")
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert isinstance(detail, str) and detail.startswith("use_demo: ")
    r = client.post("/programs/northgate/parts", data={"file": "not a file"})
    assert r.status_code == 400 and isinstance(r.json()["detail"], str)
