"""Paperwork once + lapsed certificates (engine/vault.py, engine/award.py, docs/api.md §6.2).

- the supplier document vault: seeded synthetic records, statuses by expiry, marks
  (idempotent, idempotency keys, validation), lifecycle (route/upload keep, reset clears);
- award packages reuse vault items ("Reused from your profile", N of M done automatically,
  time saved as an assumption) and ``save_to_profile`` keeps a document for the next award;
- certification status ``expired``: never counts for routing, reads "lapsed" in reasons,
  shows as a renewal in readiness ("Renew Controlled Goods registration → …"), no graph edge;
- the Northgate headline numbers do not move.
"""

from __future__ import annotations

import copy
import os
import shutil
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

import engine.app as app_module
from engine import cache, graphdb, pipeline, rules, search, shopside, vault
from engine import state as st
from engine.tests.test_pipeline import build_state

FIXED_NOW = datetime(2026, 9, 26, 21, 30, tzinfo=UTC)
DEMO_SHOP = "syn-012"  # nothing on file: its first award shows the full paperwork
FULL_SHOP = "syn-021"  # every vault item on file (synthetic seed)
EXPIRED_SHOP = "syn-008"  # insurance on file but expired
EXPIRING_SHOP = "syn-016"  # insurance expiring within 60 days
LAPSED_SHOP = "syn-028"  # CGP registration lapsed (status "expired")


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch):
    monkeypatch.setattr(shopside, "clock", lambda: FIXED_NOW)


def _prepare(path) -> None:
    old = os.environ.get("MUSTER_DB")
    old_clock = shopside.clock
    os.environ["MUSTER_DB"] = str(path)
    shopside.clock = lambda: FIXED_NOW
    try:
        with TestClient(app_module.app) as c:
            assert c.post("/demo/reset").status_code == 200
            assert c.post("/programs/northgate/parts?use_demo=true").status_code == 200
            assert c.post("/programs/northgate/route").status_code == 200
    finally:
        shopside.clock = old_clock
        if old is None:
            os.environ.pop("MUSTER_DB", None)
        else:
            os.environ["MUSTER_DB"] = old
        cache.clear()


@pytest.fixture(scope="module")
def routed_db(tmp_path_factory):
    path = tmp_path_factory.mktemp("vault") / "routed.db"
    _prepare(path)
    return path


@pytest.fixture
def client(routed_db, tmp_path, monkeypatch):
    db = tmp_path / "vault.db"
    shutil.copyfile(routed_db, db)
    monkeypatch.setenv("MUSTER_DB", str(db))
    cache.clear()
    with TestClient(app_module.app) as c:
        yield c


def ok(r) -> dict:
    assert r.status_code == 200, r.text
    return r.json()


def err(r, status: int) -> str:
    assert r.status_code == status, r.text
    return r.json()["detail"]


def get_vault(c, shop) -> dict:
    return ok(c.get(f"/shops/{shop}/vault"))


def mark(c, shop, key, **body):
    return c.post(f"/shops/{shop}/vault/{key}", json=body)


def items(v: dict) -> dict[str, dict]:
    return {i["key"]: i for i in v["items"]}


def job_of(c, shop) -> str:
    rows = ok(c.get("/programs/northgate/assignments"))["assignments"]
    return next(a["job_id"] for a in rows if a["shop_id"] == shop)


def accept(c, shop, job) -> None:
    ok(c.post(f"/shops/{shop}/offers/{job}/decision", json={"decision": "accepted"}))


def award(c, shop, job) -> dict:
    return ok(c.get(f"/shops/{shop}/offers/{job}/award"))


def docs(a: dict) -> dict[str, dict]:
    return {d["key"]: d for d in a["documents"]}


# --------------------------------------------------------------------------- vault


def test_vault_shape_and_seeded_statuses(client):
    v = get_vault(client, FULL_SHOP)
    assert v["shop_id"] == FULL_SHOP and v["shop_source"] == "synthetic"
    assert [i["key"] for i in v["items"]] == ["insurance", "quality", "nda", "ccv", "vendor"]
    assert v["on_file"] == 5 and v["total"] == 5 and v["expired"] == 0
    assert all(i["status"] == "on_file" and i["reusable"] and i["source"] == "synthetic" for i in v["items"])
    assert "no file is stored" in v["note"].lower() and v["flags"] == ["assumption"]
    ts = v["time_saved_per_award"]
    assert ts["minutes"] == 195 and ts["label"] == "about 3.5 hours" and ts["flag"] == "assumption"
    assert items(v)["vendor"]["award_document"] is None
    assert items(v)["nda"]["award_document"] == "nda"

    exp = items(get_vault(client, EXPIRED_SHOP))
    assert exp["insurance"]["status"] == "expired" and exp["insurance"]["reusable"] is False
    assert exp["insurance"]["days_left"] == -42
    assert exp["nda"]["status"] == "missing" and exp["nda"]["on_file_at"] is None

    soon = items(get_vault(client, EXPIRING_SHOP))
    assert soon["insurance"]["status"] == "expiring_soon" and soon["insurance"]["reusable"] is True

    empty = get_vault(client, DEMO_SHOP)
    assert empty["on_file"] == 0 and {i["status"] for i in empty["items"]} == {"missing"}
    assert empty["time_saved_per_award"]["minutes"] == 0

    err(client.get("/shops/syn-999/vault"), 404)


def test_mark_on_file_is_idempotent_and_validated(client):
    rev = st.state_key()[2]
    r = ok(mark(client, DEMO_SHOP, "insurance", expires_at="2027-06-30"))
    assert r["changed"] is True and r["item"]["status"] == "on_file" and r["item"]["source"] == "shop"
    assert r["item"]["expires_at"] == "2027-06-30" and r["item"]["on_file_at"] == "2026-09-26"
    assert r["vault"]["on_file"] == 1
    assert st.state_key()[2] == rev + 1
    again = ok(mark(client, DEMO_SHOP, "insurance", expires_at="2027-06-30"))
    assert again["changed"] is False and st.state_key()[2] == rev + 1  # nothing written
    # A new expiry is a change.
    assert ok(mark(client, DEMO_SHOP, "insurance", expires_at="2027-07-31"))["changed"] is True
    # Idempotency key: replay returns the stored response; reuse for another body is a 409.
    first = ok(mark(client, DEMO_SHOP, "vendor", idempotency_key="k-1"))
    assert ok(mark(client, DEMO_SHOP, "vendor", idempotency_key="k-1")) == first
    assert "already used" in err(mark(client, DEMO_SHOP, "nda", idempotency_key="k-1"), 409)
    # Validation.
    assert "Unknown vault item" in err(mark(client, DEMO_SHOP, "passport"), 404)
    err(mark(client, "syn-999", "nda"), 404)
    assert "YYYY-MM-DD" in err(mark(client, DEMO_SHOP, "nda", expires_at="next year"), 400)
    err(mark(client, DEMO_SHOP, "nda", expires_at="2045-01-01"), 400)
    # A past expiry is accepted and reads expired.
    assert ok(mark(client, DEMO_SHOP, "ccv", expires_at="2026-01-31"))["item"]["status"] == "expired"


def test_mark_off_file_hides_a_seed_and_reset_restores_it(client):
    assert items(get_vault(client, FULL_SHOP))["nda"]["on_file"] is True
    r = ok(mark(client, FULL_SHOP, "nda", on_file=False))
    assert r["item"]["status"] == "missing" and r["vault"]["on_file"] == 4
    # The shop's own marks survive a new route and a new upload (the vault belongs to the shop).
    ok(mark(client, DEMO_SHOP, "insurance"))
    ok(client.post("/programs/northgate/route"))
    ok(client.post("/programs/northgate/parts?use_demo=true"))
    assert items(get_vault(client, DEMO_SHOP))["insurance"]["on_file"] is True
    assert items(get_vault(client, FULL_SHOP))["nda"]["on_file"] is False
    ok(client.post("/demo/reset"))
    assert st.load_state().vault == {}
    assert items(get_vault(client, FULL_SHOP))["nda"]["on_file"] is True
    assert items(get_vault(client, DEMO_SHOP))["insurance"]["on_file"] is False


def test_time_saved_labels():
    assert vault.time_saved(0)["label"] == "no time saved yet"
    assert vault.time_saved(45)["label"] == "about 45 minutes"
    assert vault.time_saved(60)["label"] == "about 1 hour"
    assert vault.time_saved(100)["label"] == "about 1.5 hours"
    assert vault.time_saved(195)["label"] == "about 3.5 hours"


# --------------------------------------------------------------------------- award reuse


def test_award_reuses_vault_items(client):
    job = job_of(client, FULL_SHOP)
    accept(client, FULL_SHOP, job)
    a = award(client, FULL_SHOP, job)
    d = docs(a)
    assert list(d) == ["subcontract", "nda", "quality", "fai", "ccv", "insurance"]
    for key in ("nda", "ccv", "insurance"):
        assert d[key]["status"] == "done" and d[key]["reused"] is True
        assert d[key]["reused_label"] == "Reused from your profile" and d[key]["vault_status"] == "on_file"
        assert d[key]["done_at"] == a["accepted_at"]
    # Quality copies are attached automatically anyway; on file, they read "reused" too.
    assert d["quality"]["status"] == "done" and d["quality"]["kind"] == "auto" and d["quality"]["reused"] is True
    assert d["subcontract"]["status"] == "todo" and d["subcontract"]["reused"] is False
    assert d["subcontract"]["vault_key"] is None and d["insurance"]["vault_key"] == "insurance"
    assert a["done"] == 4 and a["total"] == 6
    assert a["done_automatically"] == 4 and a["reused"] == 4
    assert a["automatic_summary"] == "4 of 6 done automatically"
    assert a["status"] == "not_started"  # reused documents do not start the package
    assert a["time_saved"]["minutes"] == 195 and a["time_saved"]["flag"] == "assumption"
    assert any("vendor and banking form is on file" in s for s in a["next_steps"])
    # A reused document is already done: marking it writes nothing.
    rev = st.state_key()[2]
    n = len(ok(client.get("/programs/northgate/events", params={"limit": 500}))["events"])
    assert ok(client.post(f"/shops/{FULL_SHOP}/offers/{job}/award/documents/nda", json={})) == a
    assert st.state_key()[2] == rev
    assert len(ok(client.get("/programs/northgate/events", params={"limit": 500}))["events"]) == n


def test_expired_vault_item_is_not_reused(client):
    job = job_of(client, EXPIRED_SHOP)
    accept(client, EXPIRED_SHOP, job)
    a = award(client, EXPIRED_SHOP, job)
    ins = docs(a)["insurance"]
    assert ins["status"] == "todo" and ins["reused"] is False
    assert ins["vault_status"] == "expired" and ins["vault_expires_at"] == "2026-08-15"
    assert a["done_automatically"] == 1 and a["automatic_summary"] == "1 of 6 done automatically"
    # quality copies (20) + vendor form (40) on file
    assert a["time_saved"]["minutes"] == 60


def test_demo_shop_award_unchanged_without_vault(client):
    """syn-012 has nothing on file: the award is exactly as before (done 1 of 6)."""
    accept(client, DEMO_SHOP, "NG-021")
    a = award(client, DEMO_SHOP, "NG-021")
    assert a["done"] == 1 and a["total"] == 6 and a["status"] == "not_started"
    assert a["done_automatically"] == 1 and a["reused"] == 0
    assert a["time_saved"] == vault.time_saved(0)
    assert all(d["reused"] is False for d in a["documents"])
    assert any("send Northgate your vendor and banking form once" in s for s in a["next_steps"])


def test_save_to_profile_keeps_paperwork_for_the_next_award(client):
    accept(client, DEMO_SHOP, "NG-021")
    # Without save_to_profile nothing reaches the vault.
    ok(client.post(f"/shops/{DEMO_SHOP}/offers/NG-021/award/documents/fai", json={}))
    assert get_vault(client, DEMO_SHOP)["on_file"] == 0
    a = ok(client.post(f"/shops/{DEMO_SHOP}/offers/NG-021/award/documents/nda", json={"save_to_profile": True}))
    assert docs(a)["nda"]["status"] == "done" and docs(a)["nda"]["reused"] is False  # signed here
    ev = ok(client.get("/programs/northgate/events", params={"limit": 500}))["events"][-1]
    assert ev["kind"] == "paperwork_done" and ev["payload"]["saved_to_profile"] is True
    assert "kept on file for next time" in ev["message"]
    v = items(get_vault(client, DEMO_SHOP))
    assert v["nda"]["status"] == "on_file" and v["nda"]["source"] == "shop"
    # The next award at the same shop reuses the NDA.
    accept(client, DEMO_SHOP, "NG-022")
    b = award(client, DEMO_SHOP, "NG-022")
    assert docs(b)["nda"]["reused"] is True and docs(b)["nda"]["status"] == "done"
    assert b["done_automatically"] == 2 and b["time_saved"]["minutes"] == 45
    # Saving a document that is already done only adds it to the vault.
    c = ok(client.post(f"/shops/{DEMO_SHOP}/offers/NG-021/award/documents/fai", json={"save_to_profile": True}))
    assert c == award(client, DEMO_SHOP, "NG-021")  # fai has no vault item: nothing changes


def test_vault_never_moves_numbers(client):
    ledger = ok(client.get("/programs/northgate/ledger"))
    rows = ok(client.get("/programs/northgate/assignments"))
    ok(mark(client, DEMO_SHOP, "insurance"))
    ok(mark(client, FULL_SHOP, "ccv", on_file=False))
    job = job_of(client, FULL_SHOP)
    accept(client, FULL_SHOP, job)
    award(client, FULL_SHOP, job)
    assert ok(client.get("/programs/northgate/ledger")) == ledger
    rows_after = ok(client.get("/programs/northgate/assignments"))
    for a in rows_after["assignments"]:
        a["status"] = "offered"
    assert rows_after == rows


# --------------------------------------------------------------------------- expired status


def test_expired_is_a_status_that_never_counts():
    assert "expired" in rules.CERT_STATUSES and rules.LAPSED == "expired"
    assert rules.COUNTING_STATUSES == ("verified", "declared", "pending_training")
    assert "expired" not in rules.counting_statuses(rules.load_rules()["filters"])
    shop = {
        "processes": ["cnc_milling"], "max_envelope_mm": [2000, 2000, 1000],
        "capacity_hours_week": 80,
        "certifications": [{"type": "CGP", "status": "expired", "expires_at": "2026-08-31"},
                           {"type": "ISO9001", "status": "expired"}],
    }
    job = {"process_tags": ["cnc_milling"], "envelope_mm": [100, 100, 100], "hours_week": 10,
           "required_certs": ["ISO9001"], "controlled": True}
    res = rules.evaluate(job, shop, 80)
    assert res["failing"] == ["certs", "controlled_cgp"]
    assert "(status lapsed)" in res["reasons"]["certs"]
    assert "CGP status is lapsed" in res["reasons"]["controlled_cgp"]
    assert rules.is_lapsed(shop, "CGP") and not rules.is_lapsed(shop, "AS9100")
    assert rules.renew_label("CGP") == "Controlled Goods registration"
    assert rules.renew_label("NADCAP:COATINGS") == "Nadcap coatings accreditation"


def test_lapsed_cgp_shop_is_routing_neutral_and_gets_a_renewal():
    st_now = build_state()
    assert rules.cert_status({"certifications": st_now.shops[LAPSED_SHOP]["certifications"]}, "CGP") == "expired"
    res = pipeline.route(st_now)
    # Same routing as when the lapsed CGP was simply unknown (neither counts).
    before = build_state()
    for c in before.shops[LAPSED_SHOP]["certifications"]:
        if c["type"] == "CGP":
            c.update(status="unknown", expires_at=None, verified_at=None)
    ref = pipeline.route(before)
    assert res["stats"] == ref["stats"] and res["assignments"] == ref["assignments"]
    assert res["blocked"] == ref["blocked"]
    assert (res["stats"]["assigned"], res["stats"]["blocked"]) == (36, 4)
    detail = pipeline.shop_detail(st_now, LAPSED_SHOP)
    cgp = detail["readiness"][0]  # renewals come first
    assert cgp["requirement"] == "CGP" and cgp["kind"] == "cert"
    assert cgp["renewal"] is True and cgp["lapsed_on"] == "2026-08-31"
    assert all("renewal" not in r for r in detail["readiness"][1:])
    assert cgp["message"] == "Renew Controlled Goods registration → qualify for 1 more job worth $1.5M"
    assert cgp["jobs_unlocked"] == ["NG-006"]
    old = next(r for r in pipeline.shop_detail(before, LAPSED_SHOP)["readiness"] if r["requirement"] == "CGP")
    assert old["message"].startswith("Get CGP registration") and "renewal" not in old
    # Items that are not renewals keep their exact shape (no new keys).
    demo = pipeline.shop_detail(st_now, DEMO_SHOP)
    assert all(set(r) == {"kind", "requirement", "jobs_unlocked", "value_cad", "message"}
               for r in demo["readiness"])


def test_headline_numbers_unchanged():
    s = build_state()
    res = pipeline.route(s)
    assert (res["stats"]["assigned"], res["stats"]["blocked"]) == (36, 4)
    assert round(pipeline.ledger(s)["obligation_met_pct"] * 100, 1) == 11.5
    f = pipeline.fund(s, "TP-01")
    assert f["headline"].startswith("$96K training → $480K credit (5x) + 3 jobs unblocked")
    assert len(f["unblocked_jobs"]) == 3
    assert round(pipeline.ledger(s)["obligation_met_pct"] * 100, 1) == 13.4


def test_readiness_renewal_for_any_lapsed_cert():
    """A lapsed ISO 9001 at the demo shop reads "Renew ISO 9001 certificate"."""
    s = build_state()
    for c in s.shops[DEMO_SHOP]["certifications"]:
        if c["type"] == "ISO9001":
            c.update(status="expired", expires_at="2026-06-30")
    pipeline.route(s)
    cwb = next(r for r in pipeline.shop_detail(s, DEMO_SHOP)["readiness"] if r["requirement"] == "CWB_W47.1")
    assert cwb["message"].startswith("Get CWB W47.1") and "renewal" not in cwb
    pipeline.fund(s, "TP-01")  # after funding, the ISO 9001 jobs are one requirement away
    iso = next(r for r in pipeline.shop_detail(s, DEMO_SHOP)["readiness"] if r["requirement"] == "ISO9001")
    assert iso["message"].startswith("Renew ISO 9001 certificate → qualify for")
    assert iso["renewal"] is True and iso["lapsed_on"] == "2026-06-30"


def test_lapsed_cert_has_no_graph_edge_and_search_says_renew():
    g = graphdb.build_property_graph()
    held = {(e["source"], e["target"]) for e in g.edges if e["type"] == "HOLDS_CERT"}
    assert (f"shop:{LAPSED_SHOP}", "cert:CGP") not in held
    assert (f"shop:{LAPSED_SHOP}", "cert:ISO9001") in held
    assert search._missing_message("cert", "CGP", "expired") == "Renew Controlled Goods registration (lapsed)"
    assert search._missing_message("cert", "CGP", "unknown") == "Get CGP registration (now: unknown)"


def test_award_quality_detail_mentions_a_lapsed_cert():
    s = build_state()
    pipeline.route(s)
    shop_id = next(iter(copy.deepcopy(s.assignments).values()))["shop_id"]
    for c in s.shops[shop_id]["certifications"]:
        if c["type"] == "ISO9001":
            c["status"] = "expired"
    from engine import award

    job = {"required_certs": ["ISO9001"]}
    assert "lapsed on the shop's profile" in award._quality_detail(s, shop_id, job)
