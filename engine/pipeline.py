"""Engine pipeline over ``engine.state.State``: rules -> scoring -> assignment -> ledger ->
gaps -> training -> views (H2.3, H2.4, H2.6, H2.7, H2.9).

Every public function takes a State and returns a docs/api.md-shaped dict. ``route`` and
``fund`` mutate the State; the views do not. Behaviour mirrors scripts/build_fixtures.py
(the reference simulation), except that assignment uses ``engine.assign.solve`` (CP-SAT
primary, lexicographic max-count-then-score; greedy fallback).

The State is duck-typed (see engine/state.py): ``program, shops, jobs, assignments,
blocked, packages, txns, funded, cert_overrides, capacity_bonus, stage, solver,
elapsed_ms, tagger_counts, config``.
"""

from __future__ import annotations

import copy
import time
from typing import Any

from engine import assign as assign_mod
from engine import gaps as gaps_mod
from engine import graph as graph_mod
from engine import ledger as ledger_mod
from engine import public as public_mod
from engine import rules as rules_mod
from engine import scoring as scoring_mod
from engine import shopside as shopside_mod

PENDING = "pending_training"


# --------------------------------------------------------------------------- config


def config(state: Any) -> dict[str, dict]:
    """``state.config`` with any missing rules file loaded from data/rules."""
    cfg = dict(getattr(state, "config", None) or {})
    missing = [k for k in rules_mod.RULE_FILES if not cfg.get(k)]
    if missing:
        disk = rules_mod.load_rules()
        for k in missing:
            cfg[k] = disk.get(k) or {}
    return cfg


def multipliers(cfg: dict) -> dict:
    """Category multipliers from policy.json (``multipliers``), defaults otherwise."""
    out = dict(ledger_mod.DEFAULT_MULTIPLIERS)
    raw = (cfg.get("policy") or {}).get("multipliers") or {}
    for cat in out:
        v = raw.get(cat)
        if isinstance(v, dict):
            v = v.get("value")
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            out[cat] = v
    return out


# --------------------------------------------------------------------------- shops


def _funded_note(state: Any, shop_id: str, cert_type: str) -> str:
    for pid in reversed(list(getattr(state, "funded", []) or [])):
        p = state.packages.get(pid)
        if p and p.get("shop_id") == shop_id and p.get("cert_unlock") == cert_type:
            return f"Pending training: {pid} funded ({p['trainees']} trainees; demo simulation)"
    return "Pending training: training package funded (demo simulation)"


def effective_shop(state: Any, shop_id: str) -> dict:
    """Shop dict with funding applied: ``cert_overrides`` (pending_training certs) and
    ``capacity_bonus`` (extra hours/week). Keeps ``"certifications"``. KeyError if unknown."""
    shop = copy.deepcopy(state.shops[shop_id])
    overrides = (getattr(state, "cert_overrides", None) or {}).get(shop_id) or {}
    certs = shop.get("certifications") or []
    seen = set()
    for c in certs:
        seen.add(c.get("type"))
        status = overrides.get(c.get("type"))
        if status and c.get("status") not in ("verified", "declared"):
            c.update(
                {
                    "status": status,
                    "source_url": None,
                    "verified_at": None,
                    "expires_at": None,
                    "note": _funded_note(state, shop_id, c["type"]),
                }
            )
    for ctype, status in overrides.items():
        if ctype not in seen:
            certs.append(
                {
                    "shop_id": shop_id,
                    "type": ctype,
                    "status": status,
                    "source_url": None,
                    "verified_at": None,
                    "expires_at": None,
                    "note": _funded_note(state, shop_id, ctype),
                }
            )
    shop["certifications"] = certs
    bonus = (getattr(state, "capacity_bonus", None) or {}).get(shop_id) or 0
    if bonus:
        cap = float(shop.get("capacity_hours_week") or 0) + float(bonus)
        shop["capacity_hours_week"] = int(cap) if cap.is_integer() else cap
    return shop


def _public_shop(shop: dict) -> dict:
    out = {k: v for k, v in shop.items() if k != "certifications"}
    out["cert_summary"] = [
        {"type": c["type"], "status": c["status"]} for c in shop.get("certifications") or []
    ]
    return out


# --------------------------------------------------------------------------- context


class Context:
    """Routing context: effective shops, distances, used hours, filters and scores."""

    def __init__(
        self,
        state: Any,
        assignments: dict[str, dict] | None = None,
        shop_ids: Any = None,
    ):
        """``shop_ids`` limits the context to those shops (seed order kept): a read-only
        view about one shop (shop_detail) or none (the gaps summary) then skips building
        every other effective shop. Routing always uses the full network."""
        self.state = state
        self.cfg = config(state)
        self.counting = rules_mod.counting_statuses(self.cfg.get("filters"))
        self.program = state.program
        self.program_id = state.program.get("id", "northgate")
        only = None if shop_ids is None else set(shop_ids)
        self.shops: dict[str, dict] = {
            sid: effective_shop(state, sid) for sid in state.shops if only is None or sid in only
        }
        self.jobs: dict[str, dict] = {j["id"]: j for j in state.jobs}
        self.job_order: list[str] = [j["id"] for j in state.jobs]
        self.dist = {sid: scoring_mod.distance_km(self.program, s) for sid, s in self.shops.items()}
        self.mults = multipliers(self.cfg)
        self.set_assignments(state.assignments if assignments is None else assignments)

    def set_assignments(self, assignments: dict[str, dict] | dict[str, str]) -> None:
        self.used = {sid: 0.0 for sid in self.shops}
        for jid, a in assignments.items():
            sid = a if isinstance(a, str) else a["shop_id"]
            if sid in self.used and jid in self.jobs:
                self.used[sid] += float(self.jobs[jid]["hours_week"])

    def capacity(self, sid: str) -> float:
        return float(self.shops[sid].get("capacity_hours_week") or 0)

    def remaining(self, sid: str) -> float:
        rem = self.capacity(sid) - self.used[sid]
        return int(rem) if float(rem).is_integer() else rem

    @property
    def graph(self) -> graph_mod.CapabilityGraph:
        """Capability graph over the effective shops, built on first use (engine/graph.py).
        The shops never change within a Context, so it stays valid for its lifetime."""
        g = self.__dict__.get("_graph")
        if g is None:
            g = self._graph = graph_mod.CapabilityGraph(self.shops, self.counting)
        return g

    def evaluate(self, sid: str, job: dict, with_capacity: bool = True) -> dict:
        """Full rules.evaluate result, readable reasons included."""
        rem = self.remaining(sid) if with_capacity else None
        return rules_mod.evaluate(job, self.shops[sid], rem, counting=self.counting)

    def failing(self, sid: str, job: dict, with_capacity: bool = True) -> list[str]:
        """Failing filter codes (== evaluate()["failing"], without building reason text)."""
        return self.graph.failing(sid, job, self.remaining(sid) if with_capacity else None)

    def missing_certs(self, sid: str, job: dict) -> list[str]:
        return self.graph.missing_certs(sid, job)

    def counts(self, sid: str, ctype: str) -> bool:
        return self.graph.counts(sid, ctype)

    def eligible_ignoring_capacity(self, job: dict) -> list[str]:
        """Shops passing every filter but capacity, in seed order (graph index lookup)."""
        return list(self.graph.candidates(job))

    def score(self, sid: str, job: dict) -> tuple[float, dict]:
        return scoring_mod.score(job, self.shops[sid], self.dist[sid], self.cfg.get("weights"))

    def make_assignment(self, sid: str, job: dict, n_eligible: int) -> dict:
        shop = self.shops[sid]
        category = "sme_direct" if shop.get("is_sme") else "regular"
        mult = self.mults[category]
        value = round(float(job["est_value_cad"]), 2)
        s, breakdown = self.score(sid, job)
        return {
            "job_id": job["id"],
            "part_no": job["part_no"],
            "description": job["description"],
            "shop_id": sid,
            "shop_name": shop["name"],
            "shop_source": shop["source"],
            "shop_city": shop["city"],
            "shop_lat": shop["lat"],
            "shop_lon": shop["lon"],
            "is_sme": bool(shop.get("is_sme")),
            "controlled": bool(job.get("controlled")),
            "hours_week": job["hours_week"],
            "value_cad": value,
            "ccv_pct": job["ccv_pct"],
            "category": category,
            "multiplier": mult,
            "credit_cad": ledger_mod.credit(value, job["ccv_pct"], mult),
            "distance_km": round(self.dist[sid], 1),
            "score": s,
            "score_breakdown": breakdown,
            "reasons": scoring_mod.reasons(job, shop, self.dist[sid], n_eligible, self.program),
            "status": "offered",
        }


# --------------------------------------------------------------------------- core steps


def assign_jobs(
    ctx: Context, job_ids: list[str], fixed: dict[str, str], solver: str = "auto"
) -> tuple[dict[str, dict], dict]:
    """Assign ``job_ids`` (others in ``fixed`` stay put). Returns (new Assignment dicts by
    job id, raw solver result)."""
    todo = set(job_ids)
    candidates: dict[tuple[str, str], float] = {}
    n_eligible: dict[str, int] = {}
    for jid in ctx.job_order:
        if jid not in todo:
            continue
        job = ctx.jobs[jid]
        elig = ctx.eligible_ignoring_capacity(job)
        n_eligible[jid] = len(elig)
        for sid in elig:
            candidates[(jid, sid)] = ctx.score(sid, job)[0]
    jobs = [ctx.jobs[j] for j in ctx.job_order if j in todo or j in fixed]
    remaining = {sid: ctx.capacity(sid) for sid in ctx.shops}
    res = assign_mod.solve(jobs, candidates, remaining, fixed=dict(fixed), solver=solver)
    new: dict[str, dict] = {}
    for jid in ctx.job_order:
        if jid in todo and jid in res["assignment"]:
            new[jid] = ctx.make_assignment(res["assignment"][jid], ctx.jobs[jid], n_eligible[jid])
    return new, res


def place_package_jobs(
    ctx: Context, packages: list[dict], fixed: dict[str, str], todo: set[str] | None = None
) -> dict[str, str]:
    """Pin funded packages' jobs to the shop that was trained for them.

    For each package in order, each of its ``blocked_job_ids`` (restricted to ``todo`` when
    given, and not already in ``fixed``) that now passes every filter at the package shop,
    capacity included given ``fixed`` and earlier placements, is added to the returned
    ``{job_id: shop_id}``. ``ctx.used`` is updated as jobs are placed. Without this the
    solver may hand the unlocked hours to a different, higher-scoring job and leave the
    package's own job blocked (then re-suggesting the package just funded).
    """
    ctx.set_assignments(fixed)
    placed: dict[str, str] = {}
    for pkg in packages:
        sid = pkg.get("shop_id")
        if sid not in ctx.shops:
            continue
        for jid in pkg.get("blocked_job_ids") or ():
            if jid in fixed or jid in placed or jid not in ctx.jobs:
                continue
            if todo is not None and jid not in todo:
                continue
            job = ctx.jobs[jid]
            if not ctx.failing(sid, job):
                placed[jid] = sid
                ctx.used[sid] += float(job["hours_week"])
    return placed


def _funded_packages(state: Any) -> list[dict]:
    return [state.packages[p] for p in getattr(state, "funded", []) or [] if p in state.packages]


def _refresh_gaps(state: Any, ctx: Context) -> None:
    """Recompute job statuses, blocked jobs and suggestions from ``state.assignments``."""
    ctx.set_assignments(state.assignments)
    blocked_ids = [j for j in ctx.job_order if j not in state.assignments]
    for job in state.jobs:
        job["status"] = "assigned" if job["id"] in state.assignments else "blocked"
    state.packages = gaps_mod.build_suggestions(ctx, blocked_ids, state.packages)
    pkgs = list(state.packages.values())
    state.blocked = [gaps_mod.blocked_job(ctx, j, pkgs) for j in blocked_ids]


def _assignments_list(state: Any) -> list[dict]:
    return [copy.deepcopy(state.assignments[j["id"]]) for j in state.jobs if j["id"] in state.assignments]


def _renumber(txns: list[dict]) -> list[dict]:
    for i, t in enumerate(txns, start=1):
        t["id"] = f"TX-{i:04d}"
    return txns


def _assignment_txns(state: Any, ctx: Context, job_ids: list[str], start_seq: int) -> list[dict]:
    order = {j: i for i, j in enumerate(ctx.job_order)}
    out = []
    for k, jid in enumerate(sorted(job_ids, key=lambda j: order[j])):
        out.append(
            ledger_mod.assignment_txn(ctx.program_id, state.assignments[jid], start_seq + k, ctx.mults)
        )
    return out


def _stats(state: Any) -> dict:
    vals = [round(a["value_cad"] * 100) for a in state.assignments.values()]
    sme = [round(a["value_cad"] * 100) for a in state.assignments.values() if a["is_sme"]]
    assigned_value = sum(vals) / 100
    return {
        "jobs": len(state.jobs),
        "assigned": len(state.assignments),
        "blocked": len(state.blocked),
        "assigned_value_cad": round(assigned_value, 2),
        "sme_share_pct": (sum(sme) / 100) / assigned_value if assigned_value else 0.0,
    }


# --------------------------------------------------------------------------- public API


def route(state: Any, *, solver: str = "auto") -> dict:
    """RouteResponse. Full re-route of every job (funding effects included).

    Sets assignments, blocked, packages (funded kept, suggestions rebuilt), txns (assignment
    txns rebuilt in job order, then training txns in funding order), stage. ValueError if
    no parts are uploaded.
    """
    if not state.jobs:
        raise ValueError("No parts uploaded: upload a parts list before routing")
    t0 = time.perf_counter()
    ctx = Context(state, assignments={})
    new, res = assign_jobs(ctx, ctx.job_order, {}, solver)
    funded = _funded_packages(state)
    if funded:
        # Prefer the routing that keeps funded packages' jobs on their trained shops, as
        # long as it assigns at least as many jobs as the unconstrained optimum.
        pinned = place_package_jobs(ctx, funded, {})
        if any(new.get(j, {}).get("shop_id") != sid for j, sid in pinned.items()):
            new2, res2 = assign_jobs(ctx, ctx.job_order, pinned, solver)
            if len(new2) >= len(new):
                new, res = new2, res2
    state.assignments = new
    training = [t for t in state.txns if t.get("origin") == "training"]
    state.txns = _renumber(_assignment_txns(state, ctx, list(new), 1) + training)
    _refresh_gaps(state, ctx)
    state.stage = "funded" if state.funded else "routed"
    state.solver = res["solver"]
    state.elapsed_ms = round((time.perf_counter() - t0) * 1000)
    return {
        "program_id": ctx.program_id,
        "solver": state.solver,
        "elapsed_ms": state.elapsed_ms,
        "stats": _stats(state),
        "assignments": _assignments_list(state),
        "blocked": copy.deepcopy(state.blocked),
    }


def assignments_view(state: Any) -> dict:
    return {"program_id": state.program.get("id"), "assignments": _assignments_list(state)}


def ledger(state: Any) -> dict:
    """LedgerResponse (engine.ledger.build_ledger over state.txns)."""
    return ledger_mod.build_ledger(state.program, list(state.txns), multipliers(config(state)))


def snapshot(state: Any) -> dict:
    return ledger_mod.snapshot(ledger(state), len(state.assignments), len(state.blocked))


def gaps(state: Any) -> dict:
    """GapsResponse."""
    ctx = Context(state, shop_ids=())  # the summary only reads jobs + config
    blocked_ids = [b["job_id"] for b in state.blocked]
    return {
        "program_id": ctx.program_id,
        "summary": {
            "blocked_jobs": len(state.blocked),
            "blocked_value_cad": gaps_mod.sum_money(b["value_cad"] for b in state.blocked),
            "top_reason": gaps_mod.top_reason(ctx, blocked_ids, state.blocked),
        },
        "blocked": copy.deepcopy(state.blocked),
        "suggestions": copy.deepcopy(list(state.packages.values())),
    }


def fund(state: Any, package_id: str) -> dict:
    """FundResponse (see engine.training.fund)."""
    from engine import training

    return training.fund(state, package_id)


def shops_list(state: Any, source: str | None = None) -> dict:
    """ShopsResponse: every shop (optionally one source) with cert_summary.

    The routable (State) shops come first, unchanged; the discovered public shops
    (engine.public, ``onboarding: "discovered"``) are appended after them. Those are
    listed only: they are not in State.shops, so they are never routed."""
    out = []
    for sid in state.shops:
        shop = effective_shop(state, sid)
        if source and shop.get("source") != source:
            continue
        out.append(_public_shop(shop))
    if source in (None, "public"):
        seen = set(state.shops)
        out.extend(s for s in public_mod.shops() if s["id"] not in seen)
    return {"shops": out}


def shop_detail(state: Any, shop_id: str) -> dict:
    """ShopDetailResponse. KeyError if the shop is unknown.

    A discovered public shop (``pub-XXX``) gets its certifications (with source URLs),
    provenance and notes, and empty offers / readiness / training: it is never routed."""
    if shop_id not in state.shops and public_mod.is_public_id(shop_id):
        return public_mod.detail(shop_id)
    if shop_id not in state.shops:
        raise KeyError(shop_id)
    ctx = Context(state, shop_ids=(shop_id,))  # readiness only looks at this shop
    shop = ctx.shops[shop_id]
    # Declined jobs Northgate re-offered to this shop (demo, docs/api.md §6): offered here
    # too, with the credit counted when the job was placed; the assignment never moves.
    moved_here = {
        jid: ev for jid, ev in shopside_mod.reoffers(state).items() if ev.get("shop_id") == shop_id
    }
    full: Context | None = None
    offers = []
    for jid in ctx.job_order:
        a = state.assignments.get(jid)
        if not a:
            continue
        if a["shop_id"] == shop_id:
            reasons, status, extra = list(a["reasons"]), a["status"], {}
        elif jid in moved_here:
            full = full or Context(state)
            job = ctx.jobs[jid]
            n = len(full.graph.candidates(job))
            reasons = scoring_mod.reasons(job, shop, ctx.dist[shop_id], n, ctx.program)
            rec = (state.offer_decisions or {}).get(f"{shop_id}:{jid}")
            status = shopside_mod.decision_status(rec)
            extra = {"reoffered_from": (moved_here[jid].get("payload") or {}).get("from_shop_id")}
        else:
            continue
        offers.append(
            {
                "job_id": jid,
                "part_no": a["part_no"],
                "description": a["description"],
                "program_id": ctx.program_id,
                "prime_name": state.program.get("prime_name"),
                "value_cad": a["value_cad"],
                "hours_week": a["hours_week"],
                "multiplier": a["multiplier"],
                "credit_cad": a["credit_cad"],
                "reasons": reasons,
                "status": status,
                **extra,
            }
        )
    return {
        "shop": _public_shop(shop),
        "certifications": copy.deepcopy(shop.get("certifications") or []),
        "offers": offers,
        "readiness": gaps_mod.readiness(ctx, shop_id, state.assignments) if state.jobs else [],
        "training": gaps_mod.training_entries(shop_id, state.packages),
    }


def program_view(state: Any) -> dict:
    """ProgramResponse."""
    return {
        "program": copy.deepcopy(state.program),
        "counts": {
            "jobs": len(state.jobs),
            "assigned": len(state.assignments),
            "blocked": len(state.blocked),
            "shops": len(state.shops),
        },
        "state": state.stage,
    }


def jobs_view(state: Any) -> dict:
    """``GET /programs/{id}/jobs``: every job with its current status."""
    return {"program_id": state.program.get("id"), "jobs": copy.deepcopy(list(state.jobs))}
