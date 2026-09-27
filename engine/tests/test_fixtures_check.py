"""Runs the demo gate in offline fixtures mode (make fixtures-check).

Also checks that the gate catches broken fixtures: each mutation below edits a
copy of data/fixtures and must make `demo_check.py --fixtures` fail.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "data" / "fixtures"


def _run(fixtures_dir=None):
    cmd = [sys.executable, "scripts/demo_check.py", "--fixtures"]
    if fixtures_dir is not None:
        cmd.append(str(fixtures_dir))
    return subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True, timeout=60, check=False)


def test_fixtures_check_passes():
    proc = _run()
    output = proc.stdout + ("\n[stderr]\n" + proc.stderr if proc.stderr else "")
    assert proc.returncode == 0, f"demo_check --fixtures exited {proc.returncode}:\n{output}"
    assert "ALL 8 STEPS PASS" in proc.stdout, output


def _edit(d: Path, name: str, fn):
    p = d / name
    obj = json.loads(p.read_text(encoding="utf-8"))
    fn(obj)
    p.write_text(json.dumps(obj), encoding="utf-8")


def _shift_fund_after(f):
    f["after"]["credit_total_cad"] += 1e6
    f["credit_added"] += 1e6
    f["credit_added_breakdown"]["jobs_cad"] += 1e6


MUTATIONS = {
    "ledger_after_fund total": ("ledger_after_fund.json", lambda x: x.update(credit_total_cad=1.0)),
    "assignments empty": ("assignments.json", lambda x: x.update(assignments=[])),
    "assignments_after_fund empty": ("assignments_after_fund.json", lambda x: x.update(assignments=[])),
    "gaps_after_fund no suggestion": (
        "gaps_after_fund.json", lambda x: [b.update(suggestion_ids=[]) for b in x["blocked"]]),
    "program counts": ("program.json", lambda x: x["counts"].update(assigned=0)),
    "fund after shifted": ("fund_TP-01.json", _shift_fund_after),
    "fund_TP-02 negative": ("fund_TP-02.json", lambda x: x.update(credit_added=-5)),
    "ledger empty": ("ledger.json", lambda x: x.update(
        transactions=[], credit_total_cad=0, direct_credit_cad=0, obligation_met_pct=0)),
    "route credit": ("route.json", lambda x: x["assignments"][0].update(credit_cad=1.0)),
    "smb achieved": ("ledger.json", lambda x: x["smb"].update(achieved_cad=0, progress_pct=0)),
    "jobs_after_fund status": ("jobs_after_fund.json", lambda x: x["jobs"][0].update(status="unrouted")),
}


@pytest.mark.parametrize("name", sorted(MUTATIONS))
def test_fixtures_check_catches_mutation(tmp_path, name):
    d = tmp_path / "fixtures"
    shutil.copytree(FIXTURES, d)
    filename, fn = MUTATIONS[name]
    _edit(d, filename, fn)
    proc = _run(d)
    assert proc.returncode != 0, f"mutation '{name}' was not caught:\n{proc.stdout}"
    assert "FAIL" in proc.stdout, proc.stdout
