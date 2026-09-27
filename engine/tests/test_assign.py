"""Tests for engine/assign.py (H2.4 solver core)."""

from __future__ import annotations

import random
import time

import pytest

from engine import assign
from engine.assign import greedy, solve


def job(jid: str, hours: float, value: float = 1000.0) -> dict:
    return {"id": jid, "hours_week": hours, "est_value_cad": value}


def check_feasible(res: dict, jobs: list[dict], cands: dict, remaining: dict, fixed=None):
    fixed = fixed or {}
    hours = {j["id"]: j["hours_week"] for j in jobs}
    load: dict[str, float] = {}
    for jid, sid in res["assignment"].items():
        if jid not in fixed:
            assert (jid, sid) in cands, f"{jid}->{sid} is not a candidate"
        load[sid] = load.get(sid, 0.0) + hours[jid]
    for sid, h in load.items():
        assert h <= remaining[sid] + 1e-9, f"shop {sid} over capacity: {h} > {remaining[sid]}"
    # each job at most once, and assigned/unassigned partition the job set
    all_ids = {j["id"] for j in jobs} | set(fixed)
    assert set(res["assignment"]).isdisjoint(res["unassigned"])
    assert set(res["assignment"]) | set(res["unassigned"]) == all_ids
    assert res["unassigned"] == sorted(res["unassigned"])


def random_instance(seed: int, n_jobs: int = 40, n_shops: int = 30, density: float = 0.4):
    rng = random.Random(seed)
    jobs = [
        job(f"J{i:02d}", round(rng.uniform(4, 40), 1), rng.uniform(1e5, 3e6))
        for i in range(n_jobs)
    ]
    shops = [f"S{k:02d}" for k in range(n_shops)]
    remaining = {s: round(rng.uniform(20, 120), 1) for s in shops}
    cands = {
        (j["id"], s): round(rng.random(), 3)
        for j in jobs
        for s in shops
        if rng.random() < density
    }
    return jobs, cands, remaining


@pytest.mark.parametrize("which", ["auto", "ortools", "greedy"])
def test_capacity_never_exceeded_and_one_shop_per_job(which):
    for seed in range(5):
        jobs, cands, remaining = random_instance(seed, n_jobs=30, n_shops=10, density=0.5)
        res = solve(jobs, cands, remaining, solver=which)
        check_feasible(res, jobs, cands, remaining)
        assert res["solver"] == ("greedy" if which == "greedy" else "ortools")


def test_float_hours_do_not_overflow_capacity():
    # 3 x 3.34 = 10.02 > 10.0 -> at most 2 fit, even though 33 tenths x 3 = 99 <= 100.
    jobs = [job("A", 3.34), job("B", 3.34), job("C", 3.34)]
    cands = {(j["id"], "S1"): 0.5 for j in jobs}
    res = solve(jobs, cands, {"S1": 10.0}, solver="ortools")
    check_feasible(res, jobs, cands, {"S1": 10.0})
    assert len(res["assignment"]) == 2


@pytest.mark.parametrize("which", ["ortools", "greedy"])
def test_fixed_kept_and_hours_deducted(which):
    jobs = [job("F", 30), job("A", 20), job("B", 20)]
    cands = {("A", "S1"): 0.9, ("B", "S1"): 0.8, ("F", "S2"): 0.1}
    remaining = {"S1": 50.0}
    # F is pinned to S1 (even though it is not a candidate there): 50 - 30 = 20 left.
    res = solve(jobs, cands, remaining, fixed={"F": "S1"}, solver=which)
    assert res["assignment"]["F"] == "S1"
    assert res["assignment"].get("A") == "S1"
    assert "B" in res["unassigned"]
    check_feasible(res, jobs, cands, remaining, fixed={"F": "S1"})


def test_greedy_suboptimal_cpsat_assigns_more():
    # One shop, 10 h. Greedy picks J1 (6 h, highest value) first and then nothing fits;
    # CP-SAT packs J2 + J3 (5 h + 5 h).
    jobs = [job("J1", 6, 9e6), job("J2", 5, 1e6), job("J3", 5, 1e6)]
    cands = {("J1", "S1"): 1.0, ("J2", "S1"): 0.2, ("J3", "S1"): 0.2}
    remaining = {"S1": 10.0}
    g = greedy(jobs, cands, remaining)
    c = solve(jobs, cands, remaining, solver="ortools")
    assert g["solver"] == "greedy" and c["solver"] == "ortools"
    assert len(g["assignment"]) == 1
    assert len(c["assignment"]) == 2
    assert c["assignment"] == {"J2": "S1", "J3": "S1"}
    assert c["unassigned"] == ["J1"]


def test_both_assign_all_cpsat_higher_score():
    jobs = [job("J1", 10, 2e6), job("J2", 10, 1e6)]
    cands = {("J1", "S1"): 0.9, ("J1", "S2"): 0.8, ("J2", "S1"): 0.85, ("J2", "S2"): 0.1}
    remaining = {"S1": 10.0, "S2": 10.0}
    g = greedy(jobs, cands, remaining)
    c = solve(jobs, cands, remaining, solver="ortools")
    assert len(g["assignment"]) == len(c["assignment"]) == 2
    assert g["assignment"] == {"J1": "S1", "J2": "S2"}
    assert c["assignment"] == {"J1": "S2", "J2": "S1"}
    assert g["objective"] == pytest.approx(1.0)
    assert c["objective"] == pytest.approx(1.65)
    assert c["objective"] > g["objective"]


def test_count_beats_score():
    # Lexicographic: 2 low-score jobs beat 1 perfect-score job.
    jobs = [job("A", 10), job("B", 5), job("C", 5)]
    cands = {("A", "S1"): 1.0, ("B", "S1"): 0.01, ("C", "S1"): 0.01}
    res = solve(jobs, cands, {"S1": 10.0}, solver="ortools")
    assert sorted(res["assignment"]) == ["B", "C"]


def test_greedy_ordering_rules():
    # H has 1 candidate -> goes first and takes S1 though E has the higher value.
    jobs = [job("E", 10, 9e6), job("H", 10, 1e3)]
    cands = {("E", "S1"): 0.9, ("E", "S2"): 0.5, ("H", "S1"): 0.3}
    res = greedy(jobs, cands, {"S1": 10.0, "S2": 10.0})
    assert res["assignment"] == {"E": "S2", "H": "S1"}
    # Score tie -> lower shop id.
    res2 = greedy([job("X", 1)], {("X", "S9"): 0.5, ("X", "S2"): 0.5}, {"S2": 5, "S9": 5})
    assert res2["assignment"] == {"X": "S2"}


@pytest.mark.parametrize(
    "which,inst",
    [("auto", (7,)), ("greedy", (7,)), ("auto", (2, 30, 10, 0.5))],  # last one hits the limit
)
def test_determinism(which, inst):
    jobs, cands, remaining = random_instance(*inst)
    runs = [solve(jobs, cands, remaining, solver=which) for _ in range(3)]
    for r in runs[1:]:
        assert r["assignment"] == runs[0]["assignment"]
        assert r["unassigned"] == runs[0]["unassigned"]
        assert r["objective"] == runs[0]["objective"]
        assert r["solver"] == runs[0]["solver"]


def test_performance_40x30():
    jobs, cands, remaining = random_instance(42, n_jobs=40, n_shops=30, density=0.4)
    t0 = time.perf_counter()
    res = solve(jobs, cands, remaining)
    elapsed = time.perf_counter() - t0
    assert elapsed < 2.0
    assert res["elapsed_ms"] < 2000
    assert res["solver"] == "ortools"
    check_feasible(res, jobs, cands, remaining)
    g = greedy(jobs, cands, remaining)
    assert len(res["assignment"]) >= len(g["assignment"])


@pytest.mark.parametrize("which", ["auto", "ortools", "greedy"])
def test_empty_inputs(which):
    res = solve([], {}, {}, solver=which)
    assert res["assignment"] == {}
    assert res["unassigned"] == []
    assert res["objective"] == 0.0
    assert isinstance(res["elapsed_ms"], int)


@pytest.mark.parametrize("which", ["auto", "greedy"])
def test_zero_candidate_job_unassigned(which):
    jobs = [job("A", 5), job("Z", 5)]
    cands = {("A", "S1"): 0.7}
    res = solve(jobs, cands, {"S1": 40.0}, solver=which)
    assert res["assignment"] == {"A": "S1"}
    assert res["unassigned"] == ["Z"]


def test_candidate_for_unknown_shop_ignored():
    jobs = [job("A", 5)]
    res = solve(jobs, {("A", "GHOST"): 0.9}, {"S1": 40.0})
    assert res["unassigned"] == ["A"]


def test_auto_falls_back_to_greedy_when_ortools_raises(monkeypatch):
    def boom():
        raise ImportError("no ortools")

    monkeypatch.setattr(assign, "_load_cp_model", boom)
    jobs = [job("J1", 6, 9e6), job("J2", 5, 1e6), job("J3", 5, 1e6)]
    cands = {("J1", "S1"): 1.0, ("J2", "S1"): 0.2, ("J3", "S1"): 0.2}
    res = solve(jobs, cands, {"S1": 10.0})
    assert res["solver"] == "greedy"
    assert res["assignment"] == {"J1": "S1"}
    with pytest.raises(ImportError):
        solve(jobs, cands, {"S1": 10.0}, solver="ortools")


def test_auto_falls_back_when_solve_raises(monkeypatch):
    def broken(*a, **k):
        raise RuntimeError("solver crashed")

    monkeypatch.setattr(assign, "_solve_cpsat", broken)
    res = solve([job("A", 1)], {("A", "S1"): 0.5}, {"S1": 2.0})
    assert res["solver"] == "greedy"
    assert res["assignment"] == {"A": "S1"}


def test_unknown_solver_rejected():
    with pytest.raises(ValueError):
        solve([], {}, {}, solver="magic")


# --------------------------------------------------------------------------- regressions


@pytest.mark.parametrize("which", ["auto", "ortools", "greedy"])
def test_non_tenth_hours_fit_exactly(which):
    # Reviewer repro: 3.34h + 1h into 4.34h capacity. Scale-by-10 rounding (3.34 -> 3.4)
    # made CP-SAT drop a job that greedy fits.
    jobs = [job("A", 3.34), job("B", 1.0)]
    cands = {("A", "S1"): 0.5, ("B", "S1"): 0.5}
    remaining = {"S1": 4.34}
    res = solve(jobs, cands, remaining, solver=which)
    check_feasible(res, jobs, cands, remaining)
    assert res["assignment"] == {"A": "S1", "B": "S1"}
    assert res["unassigned"] == []


def test_greedy_answer_returned_when_cpsat_is_worse(monkeypatch):
    jobs = [job("A", 2.0), job("B", 2.0)]
    cands = {("A", "S1"): 0.9, ("B", "S2"): 0.8}
    remaining = {"S1": 5.0, "S2": 5.0}

    def weak(cp_model, free_jobs, remaining, cands_by_job, time_limit_s, hint):
        return {"A": "S1"}, 0.9  # feasible but assigns fewer jobs than greedy

    monkeypatch.setattr(assign, "_solve_cpsat", weak)
    res = solve(jobs, cands, remaining, solver="auto")
    assert res["assignment"] == {"A": "S1", "B": "S2"}
    assert res["solver"] == "greedy"
    assert res["objective"] == pytest.approx(1.7)


def test_cpsat_label_kept_when_at_least_as_good():
    jobs = [job("A", 2.0)]
    cands = {("A", "S1"): 0.9}
    res = solve(jobs, cands, {"S1": 5.0}, solver="ortools")
    assert res["solver"] == "ortools" and res["assignment"] == {"A": "S1"}
