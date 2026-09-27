"""Blocked jobs, training suggestions (H2.6) and shop readiness (H2.9).

Functions take a routing context ``ctx`` (built by ``engine.pipeline.Context``) with:

- ``shops``: ``{shop_id: effective Shop dict (with "certifications")}`` in seed order
- ``jobs``: ``{job_id: Job}``; ``job_order``: job ids in upload order
- ``dist``: ``{shop_id: km from the program site}``
- ``remaining(shop_id)``: free hours/week given the current assignments
- ``failing(shop_id, job, with_capacity=True)``: failing filter codes (rules.FILTERS order)
- ``missing_certs(shop_id, job)``: required certs (not CPCSC_L1) that do not count
- ``counts(shop_id, cert_type)``: whether that cert counts at the shop
- ``cfg``: ``{"policy", "filters", "weights", "training_costs"}`` (data/rules/*.json)

Behaviour mirrors scripts/build_fixtures.py (the reference simulation).
"""

from __future__ import annotations

import math
import re
from collections import Counter

from engine.rules import (
    CERT_REASON_PRIORITY,
    CPCSC,
    FILTERS,
    cert_label,
    fits,
    process_label,
)

COST_BASIS = "data/rules/training_costs.json (assumption)"
PACKAGE_ID_RE = re.compile(r"^TP-(\d+)$")

DEFAULT_TRAINING_COSTS: dict = {
    "costs": {
        "personal_certification": {"cwb_w47_1_welder_cad": 24000},
        "apprentice_sponsorship": {"welding_apprentice_cad": 20000},
    },
    "capacity_per_trainee_hours_week": {"value": 20},
    "cert_package_trainees": {"value": 4},
    "recipient_by_gap": {
        "cert": {
            "category": "personal_certification",
            "categories": ["personal_certification", "apprentice_sponsorship"],
            "recipient_type": "college",
            "recipient_example": "Conestoga College (example, not affiliated)",
            "credit_category": "training",
            "multiplier": 5,
        },
        "capacity": {
            "category": "apprentice_sponsorship",
            "categories": ["apprentice_sponsorship"],
            "recipient_type": "indigenous_institution",
            "recipient_example": "Indigenous-governed training institute (example, not affiliated)",
            "credit_category": "indigenous_training",
            "multiplier": 10,
        },
    },
    "trainable_certs": ["CWB_W47.1"],
}

CERT_ELIGIBILITY = (
    "Personal certification counts only for Canadian citizens or permanent residents "
    "(ITB model terms §7.5.1)."
)
CAPACITY_ELIGIBILITY = (
    "The 10x Indigenous workforce development multiplier applies per the ITB overview; "
    "eligibility of this apprenticeship sponsorship would need to be confirmed with the Defence "
    "Investment Agency (assumption)."
)


# --------------------------------------------------------------------------- money text


def cents(x: float) -> float:
    return round(float(x), 2)


def sum_money(values) -> float:
    return round(sum(round(float(v) * 100) for v in values) / 100, 2)


def short_money(x: float) -> str:
    """$950 / $96K / $9.1M. Rounds before choosing the unit, so 999,600 is "$1.0M" (not
    "$1000K") and 999.6 is "$1K"."""
    x = float(x)
    k = round(x / 1000)
    if abs(k) >= 1000:
        return f"${x / 1_000_000:.1f}M"
    if abs(round(x)) >= 1000:
        return f"${k:.0f}K"
    return f"${x:.0f}"


def plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def _num(v, default):
    if isinstance(v, dict):
        v = v.get("value", default)
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else default


def training_costs(ctx) -> dict:
    tc = (getattr(ctx, "cfg", None) or {}).get("training_costs") or {}
    return tc or DEFAULT_TRAINING_COSTS


def _rule_for(tc: dict, kind: str) -> dict:
    rules = tc.get("recipient_by_gap") or DEFAULT_TRAINING_COSTS["recipient_by_gap"]
    return rules.get(kind) or DEFAULT_TRAINING_COSTS["recipient_by_gap"][kind]


def _per_trainee_cost(tc: dict, category: str) -> float:
    """First ``*_cad`` number under ``costs.<category>`` in training_costs.json."""
    for src in (tc.get("costs") or {}, DEFAULT_TRAINING_COSTS["costs"]):
        block = src.get(category) or {}
        for key, val in block.items():
            if key.endswith("_cad") and isinstance(val, (int, float)):
                return float(val)
    return 0.0


# --------------------------------------------------------------------------- blocked jobs


# Readable labels for filter codes (reason fallbacks and the gaps summary).
REASON_LABEL: dict[str, str] = {
    "process": "no shop offers the process",
    "envelope": "part too large for the work envelope",
    "certs": "missing certification",
    "controlled_cgp": "controlled goods need a CGP-registered shop",
    "cpcsc": "CPCSC Level 1 required",
    "capacity": "no free capacity",
}


def main_cert(job: dict) -> str | None:
    """The cert named in reasons and gap texts (most specific first; CPCSC excluded)."""
    needed = [x for x in job.get("required_certs") or () if x != CPCSC]
    found = next((x for x in CERT_REASON_PRIORITY if x in needed), None)
    return found if found is not None or not needed else needed[0]


def _top_code(counter: Counter) -> str:
    return min(counter.items(), key=lambda kv: (-kv[1], FILTERS.index(kv[0])))[0]


def _why_not(ctx, job: dict, shops: list[tuple[str, list[str]]], ignore: tuple[str, ...]) -> str:
    """Why none of ``shops`` (each passing the filters in ``ignore``) can take the job."""
    n = len(shops)
    c = Counter(f for _, fails in shops for f in fails if f not in ignore)
    if not c:
        return "none passes every filter" if n > 1 else "it does not pass every filter"
    top = _top_code(c)
    if c[top] < n:
        return f"none passes every filter (most often: {REASON_LABEL.get(top, top)})"
    need = _fmt_h(job["hours_week"])
    if top == "envelope":
        dims = "x".join(str(int(d)) for d in job.get("envelope_mm") or []) or "given"
        one = f"its work envelope is too small for the {dims} mm part"
        many = f"none has a work envelope large enough for the {dims} mm part"
    elif top == "controlled_cgp":
        one = "it is not CGP-registered (the job is controlled)"
        many = "none is CGP-registered (the job is controlled)"
    elif top == "cpcsc":
        one, many = "it lacks CPCSC Level 1", "none holds CPCSC Level 1"
    elif top == "capacity":
        free = sorted({_fmt_h(ctx.remaining(s)) for s, _ in shops}, key=float, reverse=True)
        one = f"it is at capacity ({free[0]} h/week free vs {need} needed)"
        many = f"all are at capacity ({' and '.join(free)} h/week free vs {need} needed)"
    else:
        label = REASON_LABEL.get(top, top)
        one, many = f"it fails: {label}", f"none passes: {label}"
    return one if n == 1 else many


def blocked_job(ctx, job_id: str, packages: list[dict]) -> dict:
    """BlockedJob dict (docs/api.md) for one job with no assignment.

    ``suggestion_ids`` lists only SUGGESTED packages covering the job: a funded package is
    no longer an action to take (funding it again would be a 409).
    """
    job = ctx.jobs[job_id]
    ff = {f: 0 for f in FILTERS}
    eligible = 0
    process_shops: list[tuple[str, list[str]]] = []
    for sid in ctx.shops:
        fails = ctx.failing(sid, job)
        for f in fails:
            ff[f] += 1
        if not [f for f in fails if f != "capacity"]:
            eligible += 1
        if "process" not in fails:
            process_shops.append((sid, fails))
    c = Counter(f for _, fails in process_shops for f in fails)
    reason_code = _top_code(c) if c else "process"

    cert = main_cert(job)
    tags = job.get("process_tags") or []
    proc = process_label(tags[0]) if tags else "capable"
    holder_fails = [(sid, fails) for sid, fails in process_shops if "certs" not in fails]
    holders = [sid for sid, _ in holder_fails]
    full = [sid for sid in holders if "capacity" in ctx.failing(sid, job)]
    lacking = [sid for sid, fails in process_shops if "certs" in fails]
    if not process_shops:
        procs = " + ".join(process_label(t) for t in tags) or "the required process"
        reason = f"No shop in the network offers {procs}"
    elif cert and full:
        # The cert holders really are capacity-bound: certified-capacity shortage.
        label = cert_label(cert)
        free = sorted({_fmt_h(ctx.remaining(s)) for s in full}, key=float, reverse=True)
        free_txt = " and ".join(free)
        if len(full) == len(holders) and len(full) == 2:
            head = (
                f"Both {label} {proc} shops are at capacity ({free_txt} h/week free vs "
                f"{_fmt_h(job['hours_week'])} needed)"
            )
        else:
            head = f"{len(full)} of {len(holders)} {label} {proc} shops are at capacity"
        other = (
            f"1 other {proc} shop lacks"
            if len(lacking) == 1
            else f"{len(lacking)} other {proc} shops lack"
        )
        reason = f"{head}; {other} {label} (certified-welder shortage)"
        if cert not in training_costs(ctx).get("trainable_certs", ["CWB_W47.1"]):
            reason = f"{head}; {other} {label}"
    elif cert and holders:
        # Cert holders exist and have room: name the filter they actually fail.
        label = cert_label(cert)
        verb = "offers" if len(holders) == 1 else "offer"
        why = _why_not(ctx, job, holder_fails, ("process", "certs"))
        reason = f"{plural(len(holders), 'shop')} {verb} {proc} with {label}, but {why}"
        if lacking:
            reason += (
                f"; 1 other {proc} shop lacks {label}"
                if len(lacking) == 1
                else f"; {len(lacking)} other {proc} shops lack {label}"
            )
    elif cert:
        label = cert_label(cert)
        reason = (
            f"No {proc} shop holds {label}; {plural(len(lacking), f'{proc} shop')} "
            f"offer the process without it"
        )
    else:
        verb = "offers" if len(process_shops) == 1 else "offer"
        why = _why_not(ctx, job, process_shops, ("process",))
        reason = f"{plural(len(process_shops), 'shop')} {verb} {proc}, but {why}"
    return {
        "job_id": job_id,
        "part_no": job["part_no"],
        "description": job["description"],
        "process_tags": list(tags),
        "required_certs": list(job.get("required_certs") or ()),
        "value_cad": cents(job["est_value_cad"]),
        "hours_week": job["hours_week"],
        "reason_code": reason_code,
        "reason": reason,
        "eligible_shop_count": eligible,
        "failing_filters": ff,
        "suggestion_ids": [
            p["id"]
            for p in packages
            if job_id in p["blocked_job_ids"] and p.get("status") != "funded"
        ],
    }


def _fmt_h(h: float) -> str:
    return f"{float(h):g}"


# --------------------------------------------------------------------------- suggestions


def _candidates(
    ctx, uncovered: list[str], tc: dict, funded: list[dict] | None = None
) -> list[tuple]:
    """Near-miss (kind, requirement, shop, trainees, unlock, jobs) candidates.

    A candidate with the same (shop, gap kind, requirement) as a funded package that would
    cover any of that package's jobs is a duplicate of training already paid for: skipped.
    """
    funded_jobs: dict[tuple, set[str]] = {}
    for p in funded or ():
        key = (p["shop_id"], p["gap"]["kind"], p["gap"]["requirement"])
        funded_jobs.setdefault(key, set()).update(p.get("blocked_job_ids") or ())
    per_trainee_hours = _num(tc.get("capacity_per_trainee_hours_week"), 20)
    cohort = _num(tc.get("cert_package_trainees"), 4)
    trainable = tc.get("trainable_certs") or DEFAULT_TRAINING_COSTS["trainable_certs"]
    cands = []
    for sid in ctx.shops:
        groups: dict[tuple, list[str]] = {}
        for jid in uncovered:
            job = ctx.jobs[jid]
            fails = ctx.failing(sid, job)
            if fails == ["certs"]:
                miss = ctx.missing_certs(sid, job)
                if len(miss) == 1 and miss[0] in trainable:
                    groups.setdefault(("cert", miss[0]), []).append(jid)
            elif fails == ["capacity"]:
                groups.setdefault(("capacity", job["process_tags"][0]), []).append(jid)
        for (kind, req), jids in groups.items():
            rem = ctx.remaining(sid)
            if kind == "cert":
                trainees = int(cohort)
            else:
                shortfall = ctx.jobs[jids[0]]["hours_week"] - rem
                trainees = max(1, math.ceil(shortfall / per_trainee_hours))
            unlock = trainees * per_trainee_hours
            budget, chosen = rem + unlock, []
            for jid in jids:
                if ctx.jobs[jid]["hours_week"] <= budget:
                    chosen.append(jid)
                    budget -= ctx.jobs[jid]["hours_week"]
            if chosen and not funded_jobs.get((sid, kind, req), set()) & set(chosen):
                cands.append((kind, req, sid, trainees, unlock, chosen))
    return cands


def make_package(ctx, pkg_id: str, kind: str, req: str, sid: str, trainees: int,
                 unlock: float, jids: list[str]) -> dict:
    """TrainingPackage dict (docs/api.md), status "suggested"."""
    shop = ctx.shops[sid]
    tc = training_costs(ctx)
    rule = _rule_for(tc, kind)
    order = {j: i for i, j in enumerate(ctx.job_order)}
    jids = sorted(jids, key=lambda j: (order.get(j, len(order)), j))
    program_id = getattr(ctx, "program_id", "northgate")
    rem = _fmt_h(ctx.remaining(sid))
    if kind == "cert":
        proc = (ctx.jobs[jids[0]].get("process_tags") or ["welding"])[0]
        title = f"Certify {trainees} welders to {cert_label(req)} at {shop['name']} ({shop['city']})"
        detail = (
            f"Has {process_label(proc)} cells and {rem} h/week free capacity, "
            f"but no {cert_label(req)} certification"
        )
        gap = {"kind": "cert", "requirement": req, "detail": detail}
        cert_unlock = req
        eligibility = CERT_ELIGIBILITY
    else:
        proc = req
        title = (
            f"Sponsor {trainees} {process_label(proc)} apprentices at {shop['name']} "
            f"({shop['city']}) through an Indigenous-governed training institute"
        )
        needed = max(ctx.jobs[j]["hours_week"] for j in jids)
        certs_held = [
            cert_label(c) for c in ctx.jobs[jids[0]].get("required_certs") or () if c != CPCSC
        ]
        held = " + ".join(certs_held) + " certified" if certs_held else "Qualified"
        detail = (
            f"{held} with a large enough envelope, but only {rem} h/week free for a "
            f"{_fmt_h(needed)} h/week job"
        )
        gap = {"kind": "capacity", "requirement": proc, "detail": detail}
        cert_unlock = None
        eligibility = CAPACITY_ELIGIBILITY
    per = _per_trainee_cost(tc, rule["category"])
    cost = round(per * trainees, 2)
    mult = rule["multiplier"]
    unlock_n = int(unlock) if float(unlock).is_integer() else unlock
    return {
        "id": pkg_id,
        "program_id": program_id,
        "title": title,
        "blocked_job_ids": jids,
        "shop_id": sid,
        "shop_name": shop["name"],
        "shop_city": shop["city"],
        "shop_source": shop["source"],
        "gap": gap,
        "category": rule["category"],
        "categories": list(rule.get("categories") or [rule["category"]]),
        "recipient_type": rule["recipient_type"],
        "recipient_example": rule["recipient_example"],
        "trainees": trainees,
        "est_cost_cad": cost,
        "cost_basis": COST_BASIS,
        "multiplier": mult,
        "est_credit_cad": round(cost * 1.0 * mult, 2),
        "cert_unlock": cert_unlock,
        "capacity_unlock": {proc: unlock_n},
        "unblocks_value_cad": sum_money(ctx.jobs[j]["est_value_cad"] for j in jids),
        "eligibility_note": eligibility,
        "flags": ["assumption"],
        "status": "suggested",
    }


def _pkg_num(pkg_id: str) -> int | None:
    m = PACKAGE_ID_RE.match(pkg_id or "")
    return int(m.group(1)) if m else None


def build_suggestions(ctx, blocked_ids: list[str], existing: dict[str, dict]) -> dict[str, dict]:
    """Near-miss shops -> training packages, merged with the funded ones in ``existing``.

    Near miss: the shop fails ONLY the certs filter (on one trainable cert) or ONLY the
    capacity filter. Greedy set cover: repeatedly take the candidate unlocking the most
    uncovered blocked jobs (tie: closest shop to the site, then shop id). Returns the new
    ``state.packages`` (funded packages kept as-is; suggestions rebuilt), ordered by id.
    A new suggestion reuses the id of an existing suggestion with the same shop and gap;
    otherwise it takes the lowest free TP-nn number.
    """
    tc = training_costs(ctx)
    funded = {pid: p for pid, p in existing.items() if p.get("status") == "funded"}
    old_suggested = [p for p in existing.values() if p.get("status") != "funded"]

    uncovered = sorted(blocked_ids, key=lambda j: (-ctx.jobs[j]["est_value_cad"], j))
    picks: list[tuple] = []
    while uncovered:
        cands = _candidates(ctx, uncovered, tc, list(funded.values()))
        if not cands:
            break
        cands.sort(key=lambda c: (-len(c[5]), ctx.dist[c[2]], c[2], c[0]))
        pick = cands[0]
        picks.append(pick)
        uncovered = [j for j in uncovered if j not in pick[5]]

    taken = {n for n in (_pkg_num(pid) for pid in funded) if n is not None}
    ids: list[str | None] = []
    for kind, req, sid, *_ in picks:
        match = next(
            (
                p["id"]
                for p in old_suggested
                if p["shop_id"] == sid
                and p["gap"]["kind"] == kind
                and p["gap"]["requirement"] == req
                and _pkg_num(p["id"]) is not None
                and _pkg_num(p["id"]) not in taken
            ),
            None,
        )
        if match:
            taken.add(_pkg_num(match))
        ids.append(match)
    n = 1
    for i, pid in enumerate(ids):
        if pid is None:
            while n in taken:
                n += 1
            taken.add(n)
            ids[i] = f"TP-{n:02d}"

    out = dict(funded)
    for pid, (kind, req, sid, trainees, unlock, chosen) in zip(ids, picks):
        out[pid] = make_package(ctx, pid, kind, req, sid, trainees, unlock, chosen)
    return dict(sorted(out.items(), key=lambda kv: (_pkg_num(kv[0]) or 10**9, kv[0])))


# --------------------------------------------------------------------------- summary


def top_reason(ctx, blocked_ids: list[str], blocked: list[dict]) -> str:
    """Summary line for GET /gaps.

    A cert shortage is reported only from jobs actually blocked on certs/capacity
    (reason_code ``certs`` or ``capacity``), counting each job's main cert. Otherwise the
    most common reason_code, as a readable label.
    """
    if not blocked_ids:
        return "None"
    by_id = {b["job_id"]: b for b in blocked}
    missing: Counter = Counter()
    for j in blocked_ids:
        b = by_id.get(j)
        cert = main_cert(ctx.jobs[j]) if j in ctx.jobs else None
        if b and cert and b.get("reason_code") in ("certs", "capacity"):
            missing[cert] += 1
    if missing:
        top_cert = min(missing.items(), key=lambda kv: (-kv[1], kv[0]))[0]
        if top_cert in training_costs(ctx).get("trainable_certs", ["CWB_W47.1"]):
            return f"{cert_label(top_cert)} welder shortage (certification + capacity)"
        return f"{cert_label(top_cert)} shortage (certification + capacity)"
    codes = Counter(b["reason_code"] for b in blocked if b.get("reason_code") in FILTERS)
    if not codes:
        return "None"
    code = _top_code(codes)
    return f"Most common failure: {REASON_LABEL.get(code, code)}"


# --------------------------------------------------------------------------- readiness


def requirements(ctx, sid: str, job: dict) -> tuple[set[tuple[str, str]], bool]:
    """Failing requirements for readiness: {(kind, requirement)} plus an envelope flag."""
    shop = ctx.shops[sid]
    reqs: set[tuple[str, str]] = set()
    for p in job.get("process_tags") or ():
        if p not in (shop.get("processes") or ()):
            reqs.add(("process", p))
    for c in ctx.missing_certs(sid, job):
        reqs.add(("cert", c))
    if job.get("controlled") and not ctx.counts(sid, "CGP"):
        reqs.add(("cert", "CGP"))
    if CPCSC in (job.get("required_certs") or ()) and not ctx.counts(sid, CPCSC):
        reqs.add(("cert", CPCSC))
    if ctx.remaining(sid) < job["hours_week"]:
        reqs.add(("capacity", (job.get("process_tags") or ["capacity"])[0]))
    envelope_fail = not fits(job.get("envelope_mm") or [], shop.get("max_envelope_mm") or [])
    return reqs, envelope_fail


def readiness(ctx, sid: str, assignments: dict[str, dict]) -> list[dict]:
    """Jobs NOT offered to this shop that it fails on exactly one requirement, grouped.

    Envelope failures cannot be trained away, so a job failing the envelope is never a
    readiness item.
    """
    offered = {j for j, a in assignments.items() if a["shop_id"] == sid}
    groups: dict[tuple[str, str], list[str]] = {}
    for jid in ctx.job_order:
        if jid in offered:
            continue
        reqs, env_fail = requirements(ctx, sid, ctx.jobs[jid])
        if env_fail or len(reqs) != 1:
            continue
        groups.setdefault(next(iter(reqs)), []).append(jid)
    kind_order = {"cert": 0, "capacity": 1, "process": 2}
    items = []
    for (kind, req), jids in groups.items():
        value = sum_money(ctx.jobs[j]["est_value_cad"] for j in jids)
        more = f"{len(jids)} more job" + ("" if len(jids) == 1 else "s")
        if kind == "cert":
            msg = f"Get {cert_label(req)} → qualify for {more} worth {short_money(value)}"
        elif kind == "capacity":
            msg = f"Add {process_label(req)} capacity → qualify for {more} worth {short_money(value)}"
        else:
            msg = f"Add {process_label(req)} → qualify for {more} worth {short_money(value)}"
        items.append(
            {"kind": kind, "requirement": req, "jobs_unlocked": jids, "value_cad": value,
             "message": msg}
        )
    items.sort(key=lambda it: (-it["value_cad"], kind_order[it["kind"]], it["requirement"]))
    return items


def training_entries(sid: str, packages: dict[str, dict]) -> list[dict]:
    """ShopDetail ``training`` entries for every package (suggested or funded) at this shop."""
    out = []
    for p in packages.values():
        if p["shop_id"] != sid:
            continue
        if p.get("cert_unlock"):
            what = f"{p['trainees']} welders"
            if p["status"] == "funded":
                msg = f"{what} in training for {cert_label(p['cert_unlock'])}"
            else:
                msg = f"Suggested: certify {what} to {cert_label(p['cert_unlock'])}"
        else:
            proc = next(iter(p["capacity_unlock"]))
            what = f"{p['trainees']} {process_label(proc)} apprentices"
            msg = f"{what} in training" if p["status"] == "funded" else f"Suggested: sponsor {what}"
        out.append(
            {
                "package_id": p["id"],
                "status": p["status"],
                "category": p["category"],
                "trainees": p["trainees"],
                "recipient_example": p["recipient_example"],
                "cert_unlock": p.get("cert_unlock"),
                "capacity_unlock": dict(p["capacity_unlock"]),
                "message": msg,
            }
        )
    return out
