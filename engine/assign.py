"""OR-Tools assignment + greedy fallback (H2.4).

Pure functions over plain dicts. Inputs:

- ``jobs``: Job dicts (docs/api.md) with at least ``id``, ``hours_week``, ``est_value_cad``.
- ``candidates``: ``{(job_id, shop_id): score in [0, 1]}`` for every pair that passes all
  hard filters except capacity.
- ``remaining_hours``: ``{shop_id: free hours/week}`` BEFORE fixed assignments; ``solve``
  deducts the hours of ``fixed`` jobs itself.
- ``fixed``: ``{job_id: shop_id}`` kept as-is in the output.

Output shape (both solvers)::

    {"assignment": {job_id: shop_id},  # includes fixed
     "unassigned": [job_id, ...],      # sorted
     "solver": "ortools" | "greedy",
     "elapsed_ms": int,
     "objective": float}               # total candidate score of the non-fixed assignments

CP-SAT objective is lexicographic: first maximize the number of assigned jobs, then the total
score (weight per pair = BIG + round(score * 1000), BIG > 1000 * number of jobs).
Hours are scaled to integer thousandths (conservatively: loads rounded up, capacity down).
As a safety net, ``solve`` also runs greedy and returns greedy's answer (``solver``
"greedy") whenever it assigns more jobs, or the same number with a higher total score.
"""

from __future__ import annotations

import math
import time
from typing import Any

HOURS_SCALE = 1000  # hours are scaled to integer thousandths for CP-SAT
SCORE_SCALE = 1000
_EPS = 1e-9


def _scaled(x: float, *, up: bool) -> int:
    """Scale hours to integer units; values within 1e-6 of an integer unit snap to it,
    otherwise round up (job loads) or down (capacities) so real capacity is never exceeded."""
    v = float(x) * HOURS_SCALE
    r = round(v)
    if abs(v - r) < 1e-6:
        return max(0, r)
    return max(0, math.ceil(v) if up else math.floor(v))


def _load_cp_model() -> Any:
    """Import OR-Tools CP-SAT lazily (monkeypatchable in tests)."""
    from ortools.sat.python import cp_model

    return cp_model


# --------------------------------------------------------------------------- helpers


def _prepare(
    jobs: list[dict],
    candidates: dict[tuple[str, str], float],
    remaining_hours: dict[str, float],
    fixed: dict[str, str] | None,
) -> tuple[list[dict], dict[str, str], dict[str, float], dict[str, list[tuple[str, float]]]]:
    """Apply fixed assignments and return (free_jobs, fixed_kept, remaining, cands_by_job).

    ``cands_by_job[job_id]`` is a list of (shop_id, score) sorted by shop id, restricted to
    shops present in ``remaining_hours`` whose remaining capacity can hold the job at all.
    """
    job_ids = {str(j["id"]) for j in jobs}
    hours_by_job = {str(j["id"]): float(j.get("hours_week") or 0.0) for j in jobs}
    remaining = {str(s): float(h) for s, h in remaining_hours.items()}

    fixed_kept: dict[str, str] = {}
    for job_id, shop_id in sorted((fixed or {}).items()):
        fixed_kept[job_id] = shop_id
        if job_id in hours_by_job and shop_id in remaining:
            remaining[shop_id] -= hours_by_job[job_id]

    free_jobs = sorted(
        (j for j in jobs if str(j["id"]) not in fixed_kept), key=lambda j: str(j["id"])
    )

    cands_by_job: dict[str, list[tuple[str, float]]] = {str(j["id"]): [] for j in free_jobs}
    for (job_id, shop_id), score in candidates.items():
        if job_id not in cands_by_job or job_id not in job_ids or shop_id not in remaining:
            continue
        if hours_by_job[job_id] > remaining[shop_id] + _EPS:
            continue
        cands_by_job[job_id].append((shop_id, float(score)))
    for lst in cands_by_job.values():
        lst.sort(key=lambda t: t[0])
    return free_jobs, fixed_kept, remaining, cands_by_job


def _result(
    all_job_ids: list[str],
    assignment: dict[str, str],
    solver: str,
    t0: float,
    objective: float,
) -> dict:
    unassigned = sorted(j for j in all_job_ids if j not in assignment)
    return {
        "assignment": dict(sorted(assignment.items())),
        "unassigned": unassigned,
        "solver": solver,
        "elapsed_ms": round((time.perf_counter() - t0) * 1000),
        "objective": round(objective, 6),
    }


def _all_ids(jobs: list[dict], fixed: dict[str, str] | None) -> list[str]:
    ids = {str(j["id"]) for j in jobs}
    ids.update((fixed or {}).keys())
    return sorted(ids)


def _greedy_core(
    free_jobs: list[dict],
    remaining: dict[str, float],
    cands_by_job: dict[str, list[tuple[str, float]]],
) -> tuple[dict[str, str], float]:
    remaining = dict(remaining)
    order = sorted(
        free_jobs,
        key=lambda j: (
            len(cands_by_job[str(j["id"])]),
            -float(j.get("est_value_cad") or 0.0),
            str(j["id"]),
        ),
    )
    chosen: dict[str, str] = {}
    total = 0.0
    for job in order:
        job_id = str(job["id"])
        hours = float(job.get("hours_week") or 0.0)
        for shop_id, score in sorted(cands_by_job[job_id], key=lambda t: (-t[1], t[0])):
            if hours <= remaining[shop_id] + _EPS:
                chosen[job_id] = shop_id
                remaining[shop_id] -= hours
                total += score
                break
    return chosen, total


# --------------------------------------------------------------------------- public API


def greedy(
    jobs: list[dict],
    candidates: dict[tuple[str, str], float],
    remaining_hours: dict[str, float],
    *,
    fixed: dict[str, str] | None = None,
    solver: str = "greedy",
    time_limit_s: float = 1.5,
) -> dict:
    """Greedy assignment: hardest job first (fewest candidate shops, then higher
    est_value_cad, then job id); each goes to the highest-score candidate shop with enough
    remaining hours (tie -> shop id). ``solver``/``time_limit_s`` are accepted for signature
    parity and ignored."""
    del solver, time_limit_s
    t0 = time.perf_counter()
    free_jobs, fixed_kept, remaining, cands_by_job = _prepare(
        jobs, candidates, remaining_hours, fixed
    )
    chosen, total = _greedy_core(free_jobs, remaining, cands_by_job)
    assignment = {**fixed_kept, **chosen}
    return _result(_all_ids(jobs, fixed), assignment, "greedy", t0, total)


def _solve_cpsat(
    cp_model: Any,
    free_jobs: list[dict],
    remaining: dict[str, float],
    cands_by_job: dict[str, list[tuple[str, float]]],
    time_limit_s: float,
    hint: dict[str, str] | None,
) -> tuple[dict[str, str], float] | None:
    """Return (chosen, total_score) or None if no feasible solution was found."""
    model = cp_model.CpModel()
    hours_by_job = {str(j["id"]): float(j.get("hours_week") or 0.0) for j in free_jobs}
    n_jobs = len(free_jobs)
    big = SCORE_SCALE * (n_jobs + 1) + 1

    x: dict[tuple[str, str], Any] = {}
    score_of: dict[tuple[str, str], float] = {}
    by_shop: dict[str, list[tuple[str, Any]]] = {}
    terms = []
    for job in free_jobs:  # stable order: job id, then shop id
        job_id = str(job["id"])
        job_vars = []
        for shop_id, score in cands_by_job[job_id]:
            var = model.NewBoolVar(f"x[{job_id},{shop_id}]")
            x[(job_id, shop_id)] = var
            score_of[(job_id, shop_id)] = score
            job_vars.append(var)
            by_shop.setdefault(shop_id, []).append((job_id, var))
            weight = big + round(max(0.0, min(1.0, score)) * SCORE_SCALE)
            terms.append(weight * var)
        if len(job_vars) > 1:
            model.Add(sum(job_vars) <= 1)

    for shop_id in sorted(by_shop):
        # Hours rounded up, capacity rounded down: never exceed real (float) capacity.
        cap = _scaled(remaining[shop_id], up=False)
        loads = [(_scaled(hours_by_job[j], up=True), v) for j, v in by_shop[shop_id]]
        if sum(h for h, _ in loads) > cap:
            model.Add(sum(h * v for h, v in loads) <= cap)

    if terms:
        model.Maximize(sum(terms))

    if hint:
        for key in sorted(x):
            model.AddHint(x[key], 1 if hint.get(key[0]) == key[1] else 0)

    solver = cp_model.CpSolver()
    solver.parameters.num_workers = 1
    solver.parameters.random_seed = 0
    # Deterministic-time budget stops the search reproducibly (on this hardware ~0.5x wall
    # seconds); the wall-clock limit is only a safety net for slow machines.
    solver.parameters.max_deterministic_time = float(time_limit_s)
    solver.parameters.max_time_in_seconds = float(time_limit_s)
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None

    chosen: dict[str, str] = {}
    total = 0.0
    for key in sorted(x):
        if solver.Value(x[key]):
            chosen[key[0]] = key[1]
            total += score_of[key]
    return chosen, total


def _valid(
    chosen: dict[str, str],
    free_jobs: list[dict],
    remaining: dict[str, float],
    cands_by_job: dict[str, list[tuple[str, float]]],
) -> bool:
    hours_by_job = {str(j["id"]): float(j.get("hours_week") or 0.0) for j in free_jobs}
    load: dict[str, float] = {}
    for job_id, shop_id in chosen.items():
        if shop_id not in {s for s, _ in cands_by_job.get(job_id, [])}:
            return False
        load[shop_id] = load.get(shop_id, 0.0) + hours_by_job[job_id]
    return all(h <= remaining[s] + 1e-6 for s, h in load.items())


def solve(
    jobs: list[dict],
    candidates: dict[tuple[str, str], float],
    remaining_hours: dict[str, float],
    *,
    fixed: dict[str, str] | None = None,
    solver: str = "auto",
    time_limit_s: float = 1.5,
) -> dict:
    """Assign jobs to shops. ``solver``: "auto" (CP-SAT, greedy fallback), "ortools"
    (CP-SAT, raises if unavailable/infeasible) or "greedy"."""
    if solver not in ("auto", "ortools", "greedy"):
        raise ValueError(f"unknown solver {solver!r}")
    if solver == "greedy":
        return greedy(jobs, candidates, remaining_hours, fixed=fixed)

    t0 = time.perf_counter()
    free_jobs, fixed_kept, remaining, cands_by_job = _prepare(
        jobs, candidates, remaining_hours, fixed
    )
    try:
        cp_model = _load_cp_model()
        hint, hint_total = _greedy_core(free_jobs, remaining, cands_by_job)
        out = _solve_cpsat(cp_model, free_jobs, remaining, cands_by_job, time_limit_s, hint)
        if out is None:
            raise RuntimeError("CP-SAT found no feasible solution within the time limit")
        if not _valid(out[0], free_jobs, remaining, cands_by_job):
            raise RuntimeError("CP-SAT solution failed validation")
    except Exception:
        if solver == "ortools":
            raise
        res = greedy(jobs, candidates, remaining_hours, fixed=fixed)
        res["elapsed_ms"] = round((time.perf_counter() - t0) * 1000)
        return res

    chosen, total = out
    label = "ortools"
    # Safety net: never return fewer jobs (or a lower score at equal count) than greedy.
    if (len(hint), round(hint_total, 6)) > (len(chosen), round(total, 6)):
        chosen, total, label = hint, hint_total, "greedy"
    assignment = {**fixed_kept, **chosen}
    return _result(_all_ids(jobs, fixed), assignment, label, t0, total)
