"""Shieldworks demo gate (CLAUDE.md section 6.4).

Runs the 8 demo steps against the live API (default) or against the offline
fixtures in data/fixtures (``--fixtures``). The assertions are identical in both
modes; only the source of the responses differs.

Besides each step's own response, the steps cross-check the read endpoints
against each other: assignments / program / jobs agree with route (step 4); the
ledger's transactions are exactly the routed assignments and its totals, SMB and
multiplier breakdown are recomputed from them (5); fund.before / fund.after equal
the ledger + assignments + gaps before and after funding (7). In fixtures mode,
step 7 also checks every other fund fixture in index.json (e.g. fund_TP-02),
which assumes the demo package was funded first.

Standard library only: it must run under both .venv/bin/python and system python3.

    python scripts/demo_check.py --api http://localhost:8000
    python scripts/demo_check.py --fixtures [DIR]

Exit code 0 only if all 8 steps pass.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import math
import os
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_FIXTURES = REPO_ROOT / "data" / "fixtures"
DEMO_CSV = REPO_ROOT / "data" / "processed" / "parts_northgate.csv"
DEFAULT_PROGRAM = "northgate"

STEPS = ["health", "reset", "upload", "route", "ledger", "gaps", "fund", "shop"]
EXPECTED_JOBS = 40
MIN_ASSIGNMENTS = 25
MIN_BLOCKED = 3
TAG_SOURCES = {"llm", "cache", "rules"}
COUNTING_STATUSES = {"verified", "declared", "pending_training"}
CREDIT_CATEGORIES = ["regular", "sme_direct", "training", "indigenous_training"]
DIRECT_MULTIPLIER = {"regular": 1, "sme_direct": 2}
MONEY_TOL = 0.01
PCT_TOL = 1e-6


class StepFail(Exception):
    """A step assertion failed; the message is the reason printed after FAIL."""


# --------------------------------------------------------------------------- #
# Response sources
# --------------------------------------------------------------------------- #


class LiveSource:
    def __init__(self, base_url: str, timeout: float):
        self.base = base_url.rstrip("/")
        self.timeout = timeout
        self.program_id = DEFAULT_PROGRAM

    def describe(self) -> str:
        return f"mode: live ({self.base})"

    def _send(self, method: str, path: str, data: bytes | None = None,
              headers: dict | None = None):
        url = self.base + path
        req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
        req.add_header("Accept", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                body = json.loads(e.read().decode("utf-8") or "{}")
                if isinstance(body, dict):
                    detail = str(body.get("detail", ""))
                    if body.get("task"):
                        detail += f" (task {body['task']})"
            except (ValueError, OSError):
                detail = ""
            raise StepFail(f"{method} {path} -> HTTP {e.code}" + (f": {detail}" if detail else ""))
        except (urllib.error.URLError, ConnectionError, TimeoutError, OSError) as e:
            reason = getattr(e, "reason", e)
            raise StepFail(
                f"API not reachable at {self.base} — is `make dev` running? ({reason})"
            )
        try:
            return json.loads(raw.decode("utf-8"))
        except ValueError:
            raise StepFail(f"{method} {path} -> response is not valid JSON")

    def get(self, path: str, after_fund: bool = False):
        return self._send("GET", path)

    def post(self, path: str, after_fund: bool = False):
        return self._send("POST", path, data=b"")

    def upload(self, path: str):
        if DEMO_CSV.is_file():
            boundary = "----muster" + uuid.uuid4().hex
            body = b"".join([
                f"--{boundary}\r\n".encode(),
                (f'Content-Disposition: form-data; name="file"; '
                 f'filename="{DEMO_CSV.name}"\r\n').encode(),
                b"Content-Type: text/csv\r\n\r\n",
                DEMO_CSV.read_bytes(),
                f"\r\n--{boundary}--\r\n".encode(),
            ])
            return self._send("POST", path, data=body,
                              headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        return self._send("POST", path + "?use_demo=true", data=b"")


class FixtureSource:
    def __init__(self, directory: Path):
        self.dir = directory
        index_path = directory / "index.json"
        if not index_path.is_file():
            raise StepFail(f"fixtures index not found: {index_path}")
        try:
            self.index = json.loads(index_path.read_text(encoding="utf-8"))
        except ValueError as e:
            raise StepFail(f"fixtures index is not valid JSON: {e}")
        self.endpoints = self.index.get("endpoints") or {}
        after = self.index.get("after_fund") or {}
        if isinstance(after, dict) and isinstance(after.get("endpoints"), dict):
            after = after["endpoints"]
        self.after_fund = after if isinstance(after, dict) else {}
        self.program_id = self.index.get("program_id") or DEFAULT_PROGRAM
        self.demo_package_id = self.index.get("demo_package_id")
        self.demo_shop_id = self.index.get("demo_shop_id")

    def describe(self) -> str:
        return f"mode: fixtures ({self.dir})"

    def _load(self, filename: str, key: str):
        p = self.dir / filename
        if not p.is_file():
            raise StepFail(f"fixture file for '{key}' not found: {p}")
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except ValueError as e:
            raise StepFail(f"fixture {filename} is not valid JSON: {e}")

    def _resolve(self, method: str, path: str, after_fund: bool):
        key = f"{method} {path}"
        if after_fund:
            if key in self.after_fund:
                return self._load(self.after_fund[key], key + " (after_fund)")
            # Tolerate other after_fund layouts: find a file naming the resource.
            stem = path.rstrip("/").split("/")[-1]
            for v in self.after_fund.values():
                if isinstance(v, str) and stem in v:
                    return self._load(v, key + " (after_fund)")
            if path.startswith("/shops/"):
                guess = f"shop_{stem}_after_fund.json"
                if (self.dir / guess).is_file():
                    return self._load(guess, key + " (after_fund)")
            raise StepFail(f"no after_fund fixture for '{key}' in index.json")
        if key in self.endpoints:
            return self._load(self.endpoints[key], key)
        # Conventional fallbacks from docs/api.md section 4.
        if path == "/shops" and (self.dir / "shops.json").is_file():
            return self._load("shops.json", key)
        if "/training/" in path and path.endswith("/fund"):
            pkg = path.split("/training/")[1].split("/")[0]
            if (self.dir / f"fund_{pkg}.json").is_file():
                return self._load(f"fund_{pkg}.json", key)
        raise StepFail(f"no fixture mapped for '{key}' in index.json endpoints")

    def get(self, path: str, after_fund: bool = False):
        return self._resolve("GET", path, after_fund)

    def post(self, path: str, after_fund: bool = False):
        return self._resolve("POST", path, after_fund)

    def upload(self, path: str):
        return self._resolve("POST", path, False)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _num(obj, key, where):
    if not isinstance(obj, dict) or key not in obj:
        raise StepFail(f"{where}: missing field '{key}'")
    v = obj[key]
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise StepFail(f"{where}: '{key}' is not a finite number ({v!r})")
    return float(v)


def _list(obj, key, where):
    if not isinstance(obj, dict) or not isinstance(obj.get(key), list):
        raise StepFail(f"{where}: '{key}' is missing or not a list")
    return obj[key]


def _dict(obj, key, where):
    if not isinstance(obj, dict) or not isinstance(obj.get(key), dict):
        raise StepFail(f"{where}: '{key}' is missing or not an object")
    return obj[key]


def _close(a, b, tol):
    return abs(a - b) <= tol + 1e-12 * max(abs(a), abs(b))


def _money(a, b):
    return _close(a, b, MONEY_TOL)


def _ids(ids, limit=6) -> str:
    """Sorted ids for a message, shortened after `limit`."""
    ids = sorted(ids)
    return str(ids) if len(ids) <= limit else f"{ids[:limit]} ... ({len(ids)} in all)"


# --------------------------------------------------------------------------- #
# Checker
# --------------------------------------------------------------------------- #


class Checker:
    def __init__(self, src):
        self.src = src
        self.fixtures = isinstance(src, FixtureSource)
        self.pid = src.program_id
        self.jobs: dict[str, dict] = {}
        self.route: dict = {}
        self.assigned: dict[str, dict] = {}
        self.blocked_ids: set = set()
        self.ledger: dict = {}
        self.gaps: dict = {}
        self.package: dict = {}
        self.fund: dict = {}

    # 1
    def step_health(self):
        r = self.src.get("/health")
        if not isinstance(r, dict) or r.get("status") != "ok":
            got = r.get("status") if isinstance(r, dict) else r
            raise StepFail(f"status is {got!r}, expected 'ok'")

    # 2
    def step_reset(self):
        r = self.src.post("/demo/reset")
        if not isinstance(r, dict) or r.get("ok") is not True:
            raise StepFail(f"ok is {r.get('ok') if isinstance(r, dict) else r!r}, expected true")

    # 3
    def step_upload(self):
        r = self.src.upload(f"/programs/{self.pid}/parts")
        count = r.get("count") if isinstance(r, dict) else None
        if count != EXPECTED_JOBS:
            raise StepFail(f"count is {count!r}, expected {EXPECTED_JOBS}")
        jobs = _list(r, "jobs", "upload")
        if len(jobs) != EXPECTED_JOBS:
            raise StepFail(f"len(jobs) is {len(jobs)}, expected {EXPECTED_JOBS}")
        for j in jobs:
            jid = j.get("id", "?") if isinstance(j, dict) else "?"
            if not isinstance(j, dict):
                raise StepFail("a job is not an object")
            tags = j.get("process_tags")
            if not isinstance(tags, list) or not tags:
                raise StepFail(f"job {jid} has empty process_tags")
            if j.get("tag_source") not in TAG_SOURCES:
                raise StepFail(f"job {jid} has tag_source {j.get('tag_source')!r}, expected llm|cache|rules")
            self.jobs[jid] = j
        if len(self.jobs) != EXPECTED_JOBS:
            raise StepFail(f"job ids are not unique ({len(self.jobs)} distinct of {EXPECTED_JOBS})")

    def _shop_cgp_counts(self) -> dict[str, bool]:
        r = self.src.get("/shops")
        shops = _list(r, "shops", "GET /shops")
        out = {}
        for s in shops:
            if not isinstance(s, dict) or "id" not in s:
                continue
            ok = any(
                isinstance(c, dict) and c.get("type") == "CGP" and c.get("status") in COUNTING_STATUSES
                for c in (s.get("cert_summary") or [])
            )
            out[s["id"]] = ok
        return out

    # --- shared validators ------------------------------------------------------------------

    def _check_assignment(self, a, where):
        """One Assignment: known job, category/multiplier/is_sme agree, credit = value x ccv x mult."""
        if not isinstance(a, dict):
            raise StepFail(f"{where}: an assignment is not an object")
        jid = a.get("job_id")
        if jid not in self.jobs:
            raise StepFail(f"{where}: assignment job {jid!r} is not among the uploaded jobs")
        w = f"{where} {jid}"
        cat = a.get("category")
        if cat not in DIRECT_MULTIPLIER:
            raise StepFail(f"{w}: category {cat!r}, expected regular|sme_direct")
        mult = _num(a, "multiplier", w)
        if mult != DIRECT_MULTIPLIER[cat]:
            raise StepFail(f"{w}: multiplier {mult:g} does not match category {cat} ({DIRECT_MULTIPLIER[cat]}x)")
        if bool(a.get("is_sme")) != (cat == "sme_direct"):
            raise StepFail(f"{w}: is_sme={a.get('is_sme')!r} but category {cat}")
        value = _num(a, "value_cad", w)
        job_value = _num(self.jobs[jid], "est_value_cad", f"job {jid}")
        if not _money(value, job_value):
            raise StepFail(f"{w}: value_cad {value:.2f} != job est_value_cad {job_value:.2f}")
        credit = _num(a, "credit_cad", w)
        expect = value * _num(a, "ccv_pct", w) * mult
        if not _money(credit, expect):
            raise StepFail(f"{w}: credit_cad {credit:.2f} != value x ccv x multiplier {expect:.2f}")
        return jid

    def _check_assignment_list(self, assignments, where) -> dict[str, dict]:
        out: dict[str, dict] = {}
        for a in assignments:
            jid = self._check_assignment(a, where)
            if jid in out:
                raise StepFail(f"{where}: job {jid} assigned twice")
            out[jid] = a
        return out

    def _check_ledger(self, r, where, assigned: dict[str, dict], package_ids: set[str]):
        """Ledger invariants (docs/api.md §3) and its tie to the current assignments and funded packages."""
        total = _num(r, "credit_total_cad", where)
        direct = _num(r, "direct_credit_cad", where)
        indirect = _num(r, "indirect_credit_cad", where)
        obligation = _num(r, "obligation_cad", where)
        met = _num(r, "obligation_met_pct", where)
        txns = _list(r, "transactions", where)
        tx_sum = direct_sum = indirect_sum = smb_sum = 0.0
        per_cat = {c: [0, 0.0, 0.0] for c in CREDIT_CATEGORIES}  # count, value, credit
        asg_refs: dict[str, dict] = {}
        trn_refs: set[str] = set()
        for t in txns:
            tid = t.get("id", "?") if isinstance(t, dict) else "?"
            w = f"{where} transaction {tid}"
            c = _num(t, "credit_cad", w)
            value = _num(t, "value_cad", w)
            ccv = _num(t, "ccv_pct", w)
            mult = _num(t, "multiplier", w)
            if not _money(c, value * ccv * mult):
                raise StepFail(f"{w}: credit_cad {c:.2f} != value x ccv x multiplier {value * ccv * mult:.2f}")
            tx_sum += c
            if t.get("type") == "direct":
                direct_sum += c
            elif t.get("type") == "indirect":
                indirect_sum += c
            else:
                raise StepFail(f"{w}: type {t.get('type')!r}, expected direct|indirect")
            cat = t.get("category")
            if cat not in per_cat:
                raise StepFail(f"{w}: category {cat!r} is not a credit category")
            per_cat[cat][0] += 1
            per_cat[cat][1] += value
            per_cat[cat][2] += c
            if cat == "sme_direct":
                smb_sum += value * ccv
            origin, ref = t.get("origin"), t.get("ref_id")
            if origin == "assignment":
                if ref in asg_refs:
                    raise StepFail(f"{w}: second assignment transaction for job {ref}")
                asg_refs[ref] = t
            elif origin == "training":
                trn_refs.add(ref)
            else:
                raise StepFail(f"{w}: origin {origin!r}, expected assignment|training")
        n = max(len(txns), 1)
        tol = MONEY_TOL * n
        if not _money(total, tx_sum):
            raise StepFail(f"{where}: credit_total_cad {total:.2f} != sum of transactions {tx_sum:.2f}")
        if not _money(total, direct + indirect):
            raise StepFail(f"{where}: credit_total_cad {total:.2f} != direct + indirect {direct + indirect:.2f}")
        if not _close(direct, direct_sum, tol) or not _close(indirect, indirect_sum, tol):
            raise StepFail(f"{where}: direct/indirect {direct:.2f}/{indirect:.2f} != sums of direct/indirect "
                           f"transactions {direct_sum:.2f}/{indirect_sum:.2f}")
        if obligation <= 0:
            raise StepFail(f"{where}: obligation_cad is {obligation}")
        if not _close(met, total / obligation, PCT_TOL):
            raise StepFail(f"{where}: obligation_met_pct {met} != credit_total / obligation {total / obligation:.8f}")
        smb = _dict(r, "smb", where)
        prog = _num(smb, "progress_pct", f"{where}.smb")
        achieved = _num(smb, "achieved_cad", f"{where}.smb")
        target = _num(smb, "target_cad", f"{where}.smb")
        if target <= 0:
            raise StepFail(f"{where}: smb.target_cad is {target}")
        if not _close(prog, achieved / target, PCT_TOL):
            raise StepFail(f"{where}: smb.progress_pct {prog} != achieved / target {achieved / target:.8f}")
        if not _close(achieved, smb_sum, tol):
            raise StepFail(f"{where}: smb.achieved_cad {achieved:.2f} != sum of value x ccv over sme_direct "
                           f"transactions {smb_sum:.2f}")
        mb = _list(r, "multiplier_breakdown", where)
        rows = {m.get("category"): m for m in mb if isinstance(m, dict)}
        missing = [c for c in CREDIT_CATEGORIES if c not in rows]
        if missing:
            raise StepFail(f"{where}: multiplier_breakdown missing categories: {', '.join(missing)}")
        mb_sum = 0.0
        for cat in CREDIT_CATEGORIES:
            row, (cnt, val, cred) = rows[cat], per_cat[cat]
            w = f"{where}.multiplier_breakdown[{cat}]"
            rc, rv, rcr = _num(row, "count", w), _num(row, "value_cad", w), _num(row, "credit_cad", w)
            if rc != cnt or not _close(rv, val, tol) or not _close(rcr, cred, tol):
                raise StepFail(f"{w}: count/value/credit {rc:g}/{rv:.2f}/{rcr:.2f} != transactions "
                               f"{cnt}/{val:.2f}/{cred:.2f}")
            mb_sum += rcr
        if not _close(mb_sum, total, tol):
            raise StepFail(f"{where}: sum of multiplier_breakdown credit {mb_sum:.2f} != credit_total_cad {total:.2f}")
        if set(asg_refs) != set(assigned):
            extra = sorted(set(asg_refs) - set(assigned))
            lost = sorted(set(assigned) - set(asg_refs))
            raise StepFail(f"{where}: assignment transactions do not match the assignments "
                           f"(no assignment for {_ids(extra)}; no transaction for {_ids(lost)})")
        for jid, t in asg_refs.items():
            a = assigned[jid]
            if t.get("category") != a.get("category") or not _money(_num(t, "credit_cad", where),
                                                                       _num(a, "credit_cad", where)):
                raise StepFail(f"{where}: transaction for {jid} ({t.get('category')}, {t.get('credit_cad')}) "
                               f"!= assignment ({a.get('category')}, {a.get('credit_cad')})")
        if trn_refs != package_ids:
            raise StepFail(f"{where}: training transactions for {sorted(trn_refs)}, expected {sorted(package_ids)}")

    @staticmethod
    def _snapshot(ledger, assigned: int, blocked: int) -> dict:
        smb = ledger["smb"]
        return {"assigned": assigned, "blocked": blocked,
                "credit_total_cad": ledger["credit_total_cad"], "obligation_met_pct": ledger["obligation_met_pct"],
                "direct_credit_cad": ledger["direct_credit_cad"], "indirect_credit_cad": ledger["indirect_credit_cad"],
                "smb_achieved_cad": smb["achieved_cad"], "smb_progress_pct": smb["progress_pct"]}

    @staticmethod
    def _compare_snapshot(got, expect, where):
        for k, v in expect.items():
            g = _num(got, k, where)
            tol = PCT_TOL if k.endswith("_pct") else MONEY_TOL
            if not _close(g, float(v), tol):
                raise StepFail(f"{where}.{k} = {g:g}, but the ledger/assignments say {float(v):g}")

    def _check_program(self, assigned: int, blocked: int, state: str, after_fund: bool):
        where = f"GET /programs/{self.pid}" + (" (after fund)" if after_fund else "")
        r = self.src.get(f"/programs/{self.pid}", after_fund=after_fund)
        counts = _dict(r, "counts", where)
        got = (_num(counts, "jobs", where), _num(counts, "assigned", where), _num(counts, "blocked", where))
        if got != (EXPECTED_JOBS, assigned, blocked):
            raise StepFail(f"{where}: counts jobs/assigned/blocked = {got[0]:g}/{got[1]:g}/{got[2]:g}, "
                           f"expected {EXPECTED_JOBS}/{assigned}/{blocked}")
        if r.get("state") != state:
            raise StepFail(f"{where}: state {r.get('state')!r}, expected {state!r}")

    def _check_jobs(self, assigned_ids: set, blocked_ids: set, after_fund: bool):
        where = f"GET /programs/{self.pid}/jobs" + (" (after fund)" if after_fund else "")
        r = self.src.get(f"/programs/{self.pid}/jobs", after_fund=after_fund)
        jobs = _list(r, "jobs", where)
        status = {j.get("id"): j.get("status") for j in jobs if isinstance(j, dict)}
        if set(status) != set(self.jobs) or len(jobs) != EXPECTED_JOBS:
            raise StepFail(f"{where}: {len(jobs)} jobs, expected the {EXPECTED_JOBS} uploaded jobs")
        for jid, s in status.items():
            expect = "assigned" if jid in assigned_ids else "blocked" if jid in blocked_ids else "unrouted"
            if s != expect:
                raise StepFail(f"{where}: job {jid} status {s!r}, expected {expect!r}")

    def _check_assignments_endpoint(self, expect: dict[str, dict], after_fund: bool):
        where = f"GET /programs/{self.pid}/assignments" + (" (after fund)" if after_fund else "")
        r = self.src.get(f"/programs/{self.pid}/assignments", after_fund=after_fund)
        got = self._check_assignment_list(_list(r, "assignments", where), where)
        if set(got) != set(expect):
            raise StepFail(f"{where}: jobs {_ids(set(got) ^ set(expect))} differ from the routed assignments")
        for jid, a in got.items():
            e = expect[jid]
            if a.get("shop_id") != e.get("shop_id") or not _money(a["credit_cad"], e["credit_cad"]):
                raise StepFail(f"{where}: {jid} -> {a.get('shop_id')} ({a['credit_cad']}), "
                               f"expected {e.get('shop_id')} ({e['credit_cad']})")
        return got

    # 4
    def step_route(self):
        r = self.src.post(f"/programs/{self.pid}/route")
        assignments = _list(r, "assignments", "route")
        blocked_list = _list(r, "blocked", "route")
        stats = _dict(r, "stats", "route")
        assigned = _num(stats, "assigned", "route.stats")
        blocked = _num(stats, "blocked", "route.stats")
        if len(assignments) < MIN_ASSIGNMENTS:
            raise StepFail(f"only {len(assignments)} assignments, expected >= {MIN_ASSIGNMENTS}")
        if assigned + blocked != EXPECTED_JOBS:
            raise StepFail(f"stats.assigned + stats.blocked = {assigned:g} + {blocked:g}, expected {EXPECTED_JOBS}")
        if len(assignments) != assigned:
            raise StepFail(f"len(assignments) = {len(assignments)} but stats.assigned = {assigned:g}")
        if len(blocked_list) != blocked:
            raise StepFail(f"len(blocked) = {len(blocked_list)} but stats.blocked = {blocked:g}")
        by_job = self._check_assignment_list(assignments, "route")
        blocked_ids = {b.get("job_id") for b in blocked_list if isinstance(b, dict)}
        if blocked_ids & set(by_job) or (blocked_ids | set(by_job)) != set(self.jobs):
            raise StepFail("route: assigned and blocked jobs do not partition the uploaded jobs")
        value_sum = sum(a["value_cad"] for a in assignments)
        if not _close(_num(stats, "assigned_value_cad", "route.stats"), value_sum, MONEY_TOL * len(assignments)):
            raise StepFail(f"stats.assigned_value_cad {stats['assigned_value_cad']:.2f} != sum of assignment "
                           f"value_cad {value_sum:.2f}")
        cgp = self._shop_cgp_counts()
        for a in assignments:
            jid, sid = a.get("job_id"), a.get("shop_id")
            a_ctrl = a.get("controlled")
            j_ctrl = self.jobs[jid].get("controlled")
            if bool(a_ctrl) != bool(j_ctrl):
                raise StepFail(
                    f"job {jid}: assignment.controlled={a_ctrl!r} but uploaded job controlled={j_ctrl!r}"
                )
            if a_ctrl or j_ctrl:
                if sid not in cgp:
                    raise StepFail(f"controlled job {jid} assigned to shop {sid!r}, which is not in GET /shops")
                if not cgp[sid]:
                    raise StepFail(f"controlled job {jid} assigned to non-CGP shop {sid}")
        # The read endpoints must agree with the route response.
        self._check_assignments_endpoint(by_job, after_fund=False)
        self._check_program(len(by_job), len(blocked_ids), "routed", after_fund=False)
        self._check_jobs(set(by_job), blocked_ids, after_fund=False)
        self.route = r
        self.assigned = by_job
        self.blocked_ids = blocked_ids

    # 5
    def step_ledger(self):
        r = self.src.get(f"/programs/{self.pid}/ledger")
        self._check_ledger(r, "ledger", self.assigned, set())
        self.ledger = r

    # 6
    def step_gaps(self):
        r = self.src.get(f"/programs/{self.pid}/gaps")
        blocked = _list(r, "blocked", "gaps")
        if len(blocked) < MIN_BLOCKED:
            raise StepFail(f"only {len(blocked)} blocked jobs, expected >= {MIN_BLOCKED}")
        ids = {b.get("job_id") for b in blocked if isinstance(b, dict)}
        if ids != self.blocked_ids:
            raise StepFail(f"gaps blocked jobs {sorted(ids)} != route blocked jobs {sorted(self.blocked_ids)}")
        self._check_gaps(r, "gaps")
        self.gaps = r

    def _check_gaps(self, r, where) -> dict[str, dict]:
        blocked = _list(r, "blocked", where)
        suggestions = _list(r, "suggestions", where)
        by_id = {}
        for s in suggestions:
            if not isinstance(s, dict) or not s.get("id"):
                raise StepFail(f"{where}: a suggestion has no id")
            sid = s["id"]
            w = f"{where} suggestion {sid}"
            for f in ("category", "recipient_type"):
                if not s.get(f):
                    raise StepFail(f"{w}: missing {f}")
            cost = _num(s, "est_cost_cad", w)
            if cost <= 0:
                raise StepFail(f"{w}: est_cost_cad must be > 0")
            mult = _num(s, "multiplier", w)
            if not _money(_num(s, "est_credit_cad", w), cost * mult):
                raise StepFail(f"{w}: est_credit_cad {s['est_credit_cad']} != est_cost x 1.0 x multiplier")
            if not isinstance(s.get("capacity_unlock"), dict):
                raise StepFail(f"{w}: capacity_unlock missing or not an object")
            if "assumption" not in (s.get("flags") or []):
                raise StepFail(f"{w}: flags do not include 'assumption'")
            by_id[sid] = s
        for b in blocked:
            jid = b.get("job_id", "?") if isinstance(b, dict) else "?"
            ids = b.get("suggestion_ids") if isinstance(b, dict) else None
            if not isinstance(ids, list) or not ids:
                raise StepFail(f"{where}: blocked job {jid} has no suggestion_ids")
            unknown = [i for i in ids if i not in by_id]
            if unknown:
                raise StepFail(f"{where}: blocked job {jid}: suggestion_ids {unknown} not in suggestions")
        return by_id

    def _choose_package(self) -> dict:
        suggestions = {s["id"]: s for s in self.gaps["suggestions"]}
        if self.fixtures:
            pid = self.src.demo_package_id
            if not pid:
                raise StepFail("index.json has no demo_package_id")
            if pid not in suggestions:
                raise StepFail(f"demo_package_id {pid} is not among gaps suggestions")
            return suggestions[pid]
        best = None
        for s in self.gaps["suggestions"]:
            n = len(s.get("blocked_job_ids") or [])
            if best is None or n > best[0]:
                best = (n, s)
        if best is None:
            raise StepFail("no suggestions to fund")
        return best[1]

    def _check_fund_response(self, r, pkg_id, where, blocked_before: set) -> set:
        """Internal invariants of one fund response. Returns the still-blocked job ids."""
        unblocked = _list(r, "unblocked_jobs", where)
        if len(unblocked) < 1:
            raise StepFail(f"{where}: funding {pkg_id} unblocked no jobs")
        un = self._check_assignment_list(unblocked, f"{where} unblocked_jobs")
        if not set(un) <= blocked_before:
            raise StepFail(f"{where}: unblocked jobs {sorted(set(un) - blocked_before)} were not blocked before")
        added = _num(r, "credit_added", where)
        if added <= 0:
            raise StepFail(f"{where}: credit_added is {added}, expected > 0")
        before = _dict(r, "before", where)
        after = _dict(r, "after", where)
        delta = _num(after, "credit_total_cad", f"{where}.after") - _num(before, "credit_total_cad", f"{where}.before")
        if not _money(added, delta):
            raise StepFail(f"{where}: credit_added {added:.2f} != after - before credit_total {delta:.2f}")
        bd = _dict(r, "credit_added_breakdown", where)
        training_cad = _num(bd, "training_cad", f"{where}.credit_added_breakdown")
        jobs_cad = _num(bd, "jobs_cad", f"{where}.credit_added_breakdown")
        if not _money(added, training_cad + jobs_cad):
            raise StepFail(f"{where}: credit_added {added:.2f} != training_cad + jobs_cad {training_cad + jobs_cad:.2f}")
        un_sum = sum(a["credit_cad"] for a in un.values())
        if not _close(jobs_cad, un_sum, MONEY_TOL * len(un)):
            raise StepFail(f"{where}: jobs_cad {jobs_cad:.2f} != sum of unblocked_jobs credit_cad {un_sum:.2f}")
        txn = _dict(r, "training_txn", where)
        tw = f"{where}.training_txn"
        t_credit = _num(txn, "credit_cad", tw)
        if not _money(t_credit, _num(txn, "value_cad", tw) * _num(txn, "ccv_pct", tw) * _num(txn, "multiplier", tw)):
            raise StepFail(f"{tw}: credit_cad {t_credit:.2f} != value x ccv x multiplier")
        if txn.get("origin") != "training" or txn.get("type") != "indirect" or txn.get("ref_id") != pkg_id:
            raise StepFail(f"{tw}: expected origin training, type indirect, ref_id {pkg_id} "
                           f"(got {txn.get('origin')}, {txn.get('type')}, {txn.get('ref_id')})")
        if not _money(training_cad, t_credit):
            raise StepFail(f"{where}: training_cad {training_cad:.2f} != training_txn.credit_cad {t_credit:.2f}")
        pkg = _dict(r, "package", where)
        if pkg.get("id") != pkg_id or pkg.get("status") != "funded":
            raise StepFail(f"{where}: package is {pkg.get('id')!r} with status {pkg.get('status')!r}, "
                           f"expected {pkg_id} funded")
        still = _list(r, "still_blocked", where)
        if set(still) != blocked_before - set(un):
            raise StepFail(f"{where}: still_blocked {sorted(still)} != previously blocked minus unblocked "
                           f"{sorted(blocked_before - set(un))}")
        b_before = _num(before, "blocked", f"{where}.before")
        b_after = _num(after, "blocked", f"{where}.after")
        if not b_after < b_before:
            raise StepFail(f"{where}: blocked did not drop ({b_before:g} -> {b_after:g})")
        if b_before != len(blocked_before) or b_after != len(still):
            raise StepFail(f"{where}: before/after blocked {b_before:g}/{b_after:g} != "
                           f"{len(blocked_before)}/{len(still)} blocked jobs")
        a_before = _num(before, "assigned", f"{where}.before")
        if _num(after, "assigned", f"{where}.after") != a_before + len(un):
            raise StepFail(f"{where}: after.assigned {after['assigned']:g} != before.assigned {a_before:g} "
                           f"+ {len(un)} unblocked")
        return set(still)

    # 7
    def step_fund(self):
        pkg = self._choose_package()
        self.package = pkg
        r = self.src.post(f"/programs/{self.pid}/training/{pkg['id']}/fund")
        where = f"fund {pkg['id']}"
        still = self._check_fund_response(r, pkg["id"], where, set(self.blocked_ids))
        # before = the routed state (ledger + route)
        self._compare_snapshot(r["before"], self._snapshot(self.ledger, len(self.assigned), len(self.blocked_ids)),
                               f"{where}.before")
        # after = the state every read endpoint now reports
        expect_assigned = set(self.jobs) - still
        where_a = f"GET /programs/{self.pid}/assignments (after fund)"
        ra = self.src.get(f"/programs/{self.pid}/assignments", after_fund=True)
        after_asg = self._check_assignment_list(_list(ra, "assignments", where_a), where_a)
        if set(after_asg) != expect_assigned:
            raise StepFail(f"{where_a}: jobs {_ids(set(after_asg) ^ expect_assigned)} disagree with "
                           f"{where} still_blocked")
        for jid, u in ((u["job_id"], u) for u in r["unblocked_jobs"]):
            if after_asg[jid].get("shop_id") != u.get("shop_id"):
                raise StepFail(f"{where_a}: {jid} on {after_asg[jid].get('shop_id')}, fund says {u.get('shop_id')}")
        lg = self.src.get(f"/programs/{self.pid}/ledger", after_fund=True)
        self._check_ledger(lg, "ledger (after fund)", after_asg, {pkg["id"]})
        rg = self.src.get(f"/programs/{self.pid}/gaps", after_fund=True)
        sugg = self._check_gaps(rg, "gaps (after fund)")
        g_ids = {b.get("job_id") for b in _list(rg, "blocked", "gaps (after fund)") if isinstance(b, dict)}
        if g_ids != still:
            raise StepFail(f"gaps (after fund): blocked {sorted(g_ids)} != {where} still_blocked {sorted(still)}")
        if sugg.get(pkg["id"], {}).get("status") != "funded":
            raise StepFail(f"gaps (after fund): package {pkg['id']} is not listed as funded")
        self._compare_snapshot(r["after"], self._snapshot(lg, len(after_asg), len(g_ids)), f"{where}.after")
        self._check_program(len(after_asg), len(g_ids), "funded", after_fund=True)
        self._check_jobs(set(after_asg), g_ids, after_fund=True)
        if self.fixtures:
            self._check_second_fund(r, still, after_asg, sugg)
        self.fund = r

    def _check_second_fund(self, first, still: set, after_asg: dict, sugg: dict):
        """Fixtures only: every other fund fixture in index.json assumes the demo package was funded first."""
        for key in sorted(self.src.endpoints):
            method, _, path = key.partition(" ")
            if method != "POST" or not path.endswith("/fund") or "/training/" not in path:
                continue
            pkg_id = path.split("/training/")[1].split("/")[0]
            if pkg_id == self.package["id"]:
                continue
            where = f"fund {pkg_id}"
            if pkg_id not in sugg:
                raise StepFail(f"{where}: package is not among the gaps suggestions")
            r = self.src.post(path)
            self._check_fund_response(r, pkg_id, where, set(still))
            first_after = first["after"]
            self._compare_snapshot(_dict(r, "before", where), first_after, f"{where}.before")
            if r.get("package", {}).get("est_credit_cad") != sugg[pkg_id].get("est_credit_cad"):
                raise StepFail(f"{where}: package est_credit_cad differs from the gaps suggestion")
            if not _money(r["credit_added_breakdown"]["training_cad"], sugg[pkg_id]["est_credit_cad"]):
                raise StepFail(f"{where}: training_cad != package est_credit_cad")

    # 8
    def step_shop(self):
        shop_id = self.package.get("shop_id")
        if not shop_id:
            raise StepFail(f"package {self.package.get('id')} has no shop_id")
        r = self.src.get(f"/shops/{shop_id}", after_fund=True)
        shop = r.get("shop") if isinstance(r, dict) else None
        if isinstance(shop, dict) and shop.get("id") not in (None, shop_id):
            raise StepFail(f"shop view is for {shop.get('id')}, expected {shop_id}")
        offers = _list(r, "offers", f"shop {shop_id}")
        if not offers:
            raise StepFail(f"shop {shop_id} has no offers")
        unblocked_ids = {u.get("job_id") for u in self.fund["unblocked_jobs"] if isinstance(u, dict)}
        offer_ids = {o.get("job_id") for o in offers if isinstance(o, dict)}
        if not unblocked_ids & offer_ids:
            raise StepFail(
                f"shop {shop_id} offers {sorted(offer_ids)} include none of the unblocked jobs {sorted(unblocked_ids)}"
            )
        _list(r, "readiness", f"shop {shop_id}")
        training = _list(r, "training", f"shop {shop_id}")
        entry = next((t for t in training if isinstance(t, dict) and t.get("package_id") == self.package["id"]), None)
        if entry is None:
            raise StepFail(f"shop {shop_id} training does not list package {self.package['id']}")
        if entry.get("status") != "funded":
            raise StepFail(f"training {self.package['id']} status is {entry.get('status')!r}, expected 'funded'")


# --------------------------------------------------------------------------- #
# Runner
# --------------------------------------------------------------------------- #


def _line(n: int, name: str, result: str) -> str:
    return f"  {n} {name} {'.' * (12 - len(name))} {result}"


def run(src) -> int:
    print(src.describe())
    checker = Checker(src)
    passed = 0
    failed = False
    for n, name in enumerate(STEPS, start=1):
        if failed:
            print(_line(n, name, "SKIP (previous step failed)"))
            continue
        try:
            getattr(checker, f"step_{name}")()
        except StepFail as e:
            print(_line(n, name, f"FAIL — {e}"))
            failed = True
            continue
        except Exception as e:  # noqa: BLE001 - malformed payloads should report, not crash
            print(_line(n, name, f"FAIL — unexpected {type(e).__name__}: {e}"))
            failed = True
            continue
        print(_line(n, name, "PASS"))
        passed += 1
    reached = STEPS[passed - 1] if passed else "none"
    print(f"demo-check reached: step {passed}/{len(STEPS)} ({reached})")
    if passed == len(STEPS):
        print(f"ALL {len(STEPS)} STEPS PASS")
        return 0
    return 1


def main(argv=None) -> int:
    with contextlib.suppress(AttributeError, ValueError):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Shieldworks demo gate: 8 steps, live API or offline fixtures.")
    ap.add_argument("--api", default=os.environ.get("API_URL") or "http://localhost:8000",
                    help="API base URL for live mode (default: $API_URL or http://localhost:8000)")
    ap.add_argument("--fixtures", nargs="?", const=str(DEFAULT_FIXTURES), default=None, metavar="DIR",
                    help=f"offline mode: check fixtures in DIR (default: {DEFAULT_FIXTURES})")
    ap.add_argument("--timeout", type=float, default=15.0, help="HTTP timeout in seconds (default 15)")
    args = ap.parse_args(argv)

    if args.fixtures is not None:
        d = Path(args.fixtures)
        if not d.is_absolute():
            d = (Path.cwd() / d).resolve()
        try:
            src = FixtureSource(d)
        except StepFail as e:
            print(f"mode: fixtures ({d})")
            print(_line(1, STEPS[0], f"FAIL — {e}"))
            for n, name in enumerate(STEPS[1:], start=2):
                print(_line(n, name, "SKIP (previous step failed)"))
            print(f"demo-check reached: step 0/{len(STEPS)} (none)")
            return 1
    else:
        src = LiveSource(args.api, args.timeout)
    return run(src)


if __name__ == "__main__":
    sys.exit(main())
