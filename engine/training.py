"""Fund-training simulation (H2.7).

Funding a package (docs/api.md ``POST /programs/{id}/training/{package_id}/fund``):

1. records the training CreditTxn (indirect, ccv 1.0, 5x or 10x, flagged assumption);
2. adds a ``pending_training`` certification (``cert_unlock``) and/or extra capacity
   (``capacity_unlock``) to the package's shop via ``state.cert_overrides`` /
   ``state.capacity_bonus``;
3. routes ONLY the still-blocked jobs, with every existing assignment fixed: first the
   package's own blocked jobs are placed on the package shop (the hours were bought for
   them), then the solver routes the rest;
4. rebuilds blocked jobs and suggestions for what remains (funded packages stay "funded");
5. returns before/after Snapshots, the unblocked jobs, the credit added and a headline.
"""

from __future__ import annotations

import copy
from typing import Any

from engine import ledger as ledger_mod
from engine.gaps import plural, short_money


def headline(package: dict, n_unblocked: int, jobs_cad: float) -> str:
    """e.g. "$96K training → $480K credit (5x) + 3 jobs unblocked (+$9.1M credit)"."""
    return (
        f"{short_money(package['est_cost_cad'])} training → "
        f"{short_money(package['est_credit_cad'])} credit ({package['multiplier']}x) + "
        f"{plural(n_unblocked, 'job')} unblocked (+{short_money(jobs_cad)} credit)"
    )


def apply_funding(state: Any, package: dict) -> None:
    """Record the package's cert/capacity unlocks on the State."""
    sid = package["shop_id"]
    if package.get("cert_unlock"):
        state.cert_overrides.setdefault(sid, {})[package["cert_unlock"]] = "pending_training"
    extra = sum(float(v) for v in (package.get("capacity_unlock") or {}).values())
    if extra:
        total = float(state.capacity_bonus.get(sid, 0)) + extra
        state.capacity_bonus[sid] = int(total) if total.is_integer() else total


def fund(state: Any, package_id: str, *, solver: str = "auto") -> dict:
    """FundResponse. Raises ValueError("not routed") before any routing, KeyError for an
    unknown package, ValueError("already funded") for a funded one."""
    from engine import pipeline

    if state.stage not in ("routed", "funded"):
        raise ValueError("not routed")
    if package_id not in state.packages:
        raise KeyError(package_id)
    pkg = state.packages[package_id]
    if pkg.get("status") == "funded":
        raise ValueError("already funded")

    before = pipeline.snapshot(state)
    before_c = round(before["credit_total_cad"] * 100)

    pkg["status"] = "funded"
    state.funded.append(package_id)
    apply_funding(state, pkg)

    ctx = pipeline.Context(state)
    txn = ledger_mod.training_txn(ctx.program_id, pkg, len(state.txns) + 1, ctx.mults)
    state.txns.append(txn)

    prev_blocked = [b["job_id"] for b in state.blocked]
    fixed = {jid: a["shop_id"] for jid, a in state.assignments.items()}
    fixed.update(pipeline.place_package_jobs(ctx, [pkg], fixed, set(prev_blocked)))
    new, res = pipeline.assign_jobs(ctx, prev_blocked, fixed, solver)
    state.assignments.update(new)
    state.txns.extend(pipeline._assignment_txns(state, ctx, list(new), len(state.txns) + 1))
    pipeline._refresh_gaps(state, ctx)
    state.stage = "funded"
    state.solver = res["solver"]

    after = pipeline.snapshot(state)
    unblocked = [copy.deepcopy(state.assignments[j]) for j in ctx.job_order if j in new]
    jobs_c = sum(round(a["credit_cad"] * 100) for a in unblocked)
    training_c = round(txn["credit_cad"] * 100)
    added_c = round(after["credit_total_cad"] * 100) - before_c
    return {
        "program_id": ctx.program_id,
        "package_id": package_id,
        "package": copy.deepcopy(pkg),
        "before": before,
        "after": after,
        "unblocked_jobs": unblocked,
        "still_blocked": [b["job_id"] for b in state.blocked],
        "training_txn": copy.deepcopy(txn),
        "credit_added": added_c / 100,
        "credit_added_breakdown": {"training_cad": training_c / 100, "jobs_cad": jobs_c / 100},
        "headline": headline(pkg, len(unblocked), jobs_c / 100),
    }
