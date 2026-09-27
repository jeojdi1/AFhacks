#!/usr/bin/env python3
"""Build the shop-actions contract examples in data/fixtures/app/ (docs/api.md §6).

Runs the real engine in-process (FastAPI TestClient on a temporary MUSTER_DB, never
data/muster.db) through the phone-app demo flow and writes each response:

    reset → upload → route → ask about NG-021 → accept NG-021 → decline NG-022 (no capacity)
    → ask Northgate to fund CWB W47.1 → capacity check-in → declare the CPCSC L1 expiry
    → fund TP-01 → trainee seat 3 → shop actions / program actions / events

Deterministic: a fixed clock (one time per step, starting 2026-09-26 21:30:00 UTC) and fixed
idempotency keys, JSON with indent 2 and a trailing newline. Re-running gives byte-identical
files. ``data/fixtures/index.json`` and every other existing fixture are never touched; the
web's fixture mode does not read these files (they are contract examples and test goldens).

    .venv/bin/python scripts/build_app_fixtures.py          # write
    .venv/bin/python scripts/build_app_fixtures.py --check  # exit 1 if any file differs
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

OUT = ROOT / "data" / "fixtures" / "app"
PROGRAM = "northgate"
SHOP = "syn-012"
PACKAGE = "TP-01"

# (file, method, path, step time) in run order; bodies are in _flow below.
TIMES = {
    "route": "21:30:00",
    "question": "21:38:12",
    "accept": "21:41:07",
    "decline": "21:42:30",
    "request": "21:44:00",
    "capacity": "21:47:15",
    "cert": "21:50:00",
    "fund": "21:52:40",
}


def dumps(obj) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def build() -> dict[str, object]:
    """Run the flow and return {file name: JSON object} (index.json included)."""
    from fastapi.testclient import TestClient

    import engine.app as app_module
    from engine import cache, shopside

    now = {"t": datetime(2026, 9, 26, 21, 0, tzinfo=UTC)}

    def at(step: str) -> None:
        h, m, s = (int(x) for x in TIMES[step].split(":"))
        now["t"] = datetime(2026, 9, 26, h, m, s, tzinfo=UTC)

    old_db = os.environ.get("MUSTER_DB")
    old_clock = shopside.clock
    out: dict[str, object] = {}
    endpoints: dict[str, str] = {}

    def call(client, method: str, path: str, file: str, body: dict | None = None) -> dict:
        r = client.request(method, path, json=body)
        if r.status_code != 200:
            raise SystemExit(f"{method} {path} -> {r.status_code}: {r.text}")
        data = r.json()
        out[file] = data
        endpoints[f"{method} {path}"] = file
        return data

    with tempfile.TemporaryDirectory(prefix="muster-app-fixtures-") as tmp:
        os.environ["MUSTER_DB"] = str(Path(tmp) / "app_fixtures.db")
        shopside.clock = lambda: now["t"]
        try:
            with TestClient(app_module.app) as c:
                for method, path in (("POST", "/demo/reset"), ("POST", f"/programs/{PROGRAM}/parts?use_demo=true")):
                    r = c.request(method, path)
                    if r.status_code != 200:
                        raise SystemExit(f"{method} {path} -> {r.status_code}: {r.text}")
                at("route")
                r = c.post(f"/programs/{PROGRAM}/route")
                if r.status_code != 200:
                    raise SystemExit(f"route -> {r.status_code}: {r.text}")

                dec = f"/shops/{SHOP}/offers/{{job}}/decision"
                at("question")
                call(c, "POST", dec.format(job="NG-021"), "decision_question_NG-021.json",
                     {"decision": "question", "question_code": "lead_time", "reason_code": None,
                      "note": None, "idempotency_key": "fixture-question-NG-021"})
                at("accept")
                call(c, "POST", dec.format(job="NG-021"), "decision_accept_NG-021.json",
                     {"decision": "accepted", "reason_code": None, "question_code": None,
                      "note": None, "idempotency_key": "fixture-accept-NG-021"})
                at("decline")
                call(c, "POST", dec.format(job="NG-022"), "decision_decline_NG-022.json",
                     {"decision": "declined", "reason_code": "capacity", "question_code": None,
                      "note": None, "idempotency_key": "fixture-decline-NG-022"})
                at("request")
                call(c, "POST", f"/shops/{SHOP}/funding-requests", f"funding_request_{PACKAGE}.json",
                     {"requirement": "CWB_W47.1", "idempotency_key": "fixture-request-TP-01"})
                at("capacity")
                call(c, "POST", f"/shops/{SHOP}/capacity", f"capacity_{SHOP}.json",
                     {"hours_week": 40, "by_process": {"welding": 40, "sheet_metal": 0, "painting": 0},
                      "horizon_weeks": 4, "idempotency_key": "fixture-capacity-syn-012"})
                at("cert")
                call(c, "POST", f"/shops/{SHOP}/certifications/CPCSC_L1", f"cert_declare_{SHOP}_CPCSC_L1.json",
                     {"expires_at": "2027-04-30", "cert_number": None,
                      "idempotency_key": "fixture-cert-syn-012-CPCSC_L1"})
                at("fund")
                r = c.post(f"/programs/{PROGRAM}/training/{PACKAGE}/fund")
                if r.status_code != 200:
                    raise SystemExit(f"fund -> {r.status_code}: {r.text}")

                call(c, "GET", f"/programs/{PROGRAM}/training/{PACKAGE}/seats/3", f"trainee_seat_{PACKAGE}_3.json")
                call(c, "GET", f"/shops/{SHOP}/actions", f"shop_actions_{SHOP}.json")
                call(c, "GET", f"/programs/{PROGRAM}/actions", "program_actions.json")
                call(c, "GET", f"/programs/{PROGRAM}/events?since=0&limit=100", "events.json")
        finally:
            shopside.clock = old_clock
            if old_db is None:
                os.environ.pop("MUSTER_DB", None)
            else:
                os.environ["MUSTER_DB"] = old_db
            cache.clear()

    out["index.json"] = {
        "program_id": PROGRAM,
        "demo_shop_id": SHOP,
        "demo_package_id": PACKAGE,
        "generated_by": "scripts/build_app_fixtures.py",
        "flow": ("reset → upload → route → question NG-021 (lead time) → accept NG-021 → "
                 "decline NG-022 (capacity) → request funding CWB_W47.1 → capacity check-in → "
                 "declare CPCSC_L1 expiry → fund TP-01 → reads"),
        "note": ("Contract examples for docs/api.md §6 (additive v0.2). Reads are taken after "
                 "funding TP-01. Timestamps come from a fixed demo clock."),
        "endpoints": endpoints,
    }
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="compare instead of writing")
    args = ap.parse_args()
    files = build()
    if args.check:
        stale = [n for n, obj in files.items()
                 if not (OUT / n).exists() or (OUT / n).read_text(encoding="utf-8") != dumps(obj)]
        extra = sorted(p.name for p in OUT.glob("*.json") if p.name not in files) if OUT.exists() else []
        for n in stale:
            print(f"stale: data/fixtures/app/{n}")
        for n in extra:
            print(f"unexpected: data/fixtures/app/{n}")
        if stale or extra:
            print("run: .venv/bin/python scripts/build_app_fixtures.py")
            return 1
        print(f"data/fixtures/app: {len(files)} files up to date")
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    for n, obj in files.items():
        with open(OUT / n, "w", encoding="utf-8", newline="\n") as f:
            f.write(dumps(obj))
    print(f"wrote {len(files)} files to data/fixtures/app/: {', '.join(sorted(files))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
