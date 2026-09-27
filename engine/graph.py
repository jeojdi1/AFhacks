"""In-memory capability graph over one routing context (performance layer).

Nodes are shops, processes, cert types and jobs. Edges are "shop offers process" and
"shop holds a cert that COUNTS" (status in ``counting``: verified / declared /
pending_training by default, funding overrides already applied by
``engine.pipeline.effective_shop``). From them the graph keeps inverted indexes:

- ``process -> {shop_id}``
- ``cert_type -> {shop_id whose cert counts}`` (CGP and CPCSC_L1 are just cert types)

A job's candidate shops are the intersection of its process sets, its required-cert sets,
the CGP set (controlled jobs) and the CPCSC set (CPCSC jobs); only that small set then
gets the envelope check (and capacity, which depends on the current assignments and is
always asked of the caller's ``remaining``). Near misses (shops failing exactly one
requirement) are set differences of the same indexes.

Every answer is exactly what ``engine.rules.evaluate`` would give on the same effective
shop (same filter codes, FILTERS order); engine/tests/test_graph.py checks this against a
brute-force scan on the demo scenario and on a 10x scaled one. The readable reason strings
still come from ``engine.rules`` / ``engine.gaps``; the graph only answers "which shops"
and "which filters fail".
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass

from engine.rules import CGP, COUNTING_STATUSES, CPCSC, FILTERS

UNKNOWN = "unknown"


@dataclass(frozen=True)
class JobReq:
    """A job's requirements, normalised once (mirrors the reads in rules.evaluate)."""

    tags: tuple[str, ...]  # process_tags in order (may repeat)
    tag_set: frozenset[str]
    certs: tuple[str, ...]  # required certs other than CPCSC_L1, in order
    controlled: bool
    cpcsc: bool
    env: tuple[float, ...]  # sorted envelope_mm
    hours: float  # float(hours_week or 0)

    @classmethod
    def of(cls, job: dict) -> JobReq:
        tags = tuple(job.get("process_tags") or ())
        required = tuple(job.get("required_certs") or ())
        return cls(
            tags=tags,
            tag_set=frozenset(tags),
            certs=tuple(c for c in required if c != CPCSC),
            controlled=bool(job.get("controlled")),
            cpcsc=CPCSC in required,
            env=tuple(sorted(job.get("envelope_mm") or [])),
            hours=float(job.get("hours_week") or 0),
        )


def _fits(job_env: tuple, shop_env: tuple) -> bool:
    """rules.fits on pre-sorted envelopes (zip truncates, exactly like rules.fits)."""
    return all(j <= s for j, s in zip(job_env, shop_env))


class CapabilityGraph:
    """Shops x processes x certs, indexed for set-algebra candidate lookups.

    ``shops`` is ``{shop_id: effective Shop dict with "certifications"}`` in seed order
    (``engine.pipeline.Context.shops``). The graph is immutable once built: capacity is
    never stored, callers pass ``remaining`` (a number, or a ``shop_id -> hours`` callable).
    """

    def __init__(self, shops: dict[str, dict], counting: Iterable[str] = COUNTING_STATUSES):
        self.counting = frozenset(counting)
        self.order: list[str] = list(shops)
        self.pos: dict[str, int] = {sid: i for i, sid in enumerate(self.order)}
        self.all: frozenset[str] = frozenset(self.order)
        self.procs: dict[str, frozenset[str]] = {}
        self.env: dict[str, tuple[float, ...]] = {}
        # First certification entry per type wins, as in rules.cert_status.
        self.status: dict[str, dict[str, str]] = {}
        process_index: dict[str, set[str]] = {}
        cert_types: set[str] = set()
        for sid, shop in shops.items():
            procs = frozenset(shop.get("processes") or ())
            self.procs[sid] = procs
            for p in procs:
                process_index.setdefault(p, set()).add(sid)
            self.env[sid] = tuple(sorted(shop.get("max_envelope_mm") or []))
            st: dict[str, str] = {}
            for c in shop.get("certifications") or ():
                ctype = c.get("type")
                if ctype not in st:
                    st[ctype] = c.get("status") or UNKNOWN
            self.status[sid] = st
            cert_types.update(st)
        self.process_index: dict[str, frozenset[str]] = {
            p: frozenset(s) for p, s in process_index.items()
        }
        self._holders: dict[str, frozenset[str]] = {}
        for ctype in cert_types | {CGP, CPCSC}:
            self.holders(ctype)
        self._req: dict[str, tuple[dict, JobReq]] = {}
        self._sets: dict[str, tuple] = {}

    # ------------------------------------------------------------------ indexes

    def holders(self, ctype: str) -> frozenset[str]:
        """Shops where ``ctype`` counts (a shop without the cert has status "unknown")."""
        got = self._holders.get(ctype)
        if got is None:
            got = frozenset(
                sid for sid in self.order if self.status[sid].get(ctype, UNKNOWN) in self.counting
            )
            self._holders[ctype] = got
        return got

    def counts(self, sid: str, ctype: str) -> bool:
        return self.status[sid].get(ctype, UNKNOWN) in self.counting

    def cert_status(self, sid: str, ctype: str) -> str:
        return self.status[sid].get(ctype, UNKNOWN)

    def req(self, job: dict) -> JobReq:
        """JobReq for ``job``, memoised by job id (recomputed if a different dict shows up)."""
        jid = job.get("id")
        hit = self._req.get(jid)
        if hit is not None and hit[0] is job:
            return hit[1]
        r = JobReq.of(job)
        self._req[jid] = (job, r)
        self._sets.pop(jid, None)
        return r

    def _job_sets(self, job: dict) -> tuple:
        """(process_pass, cert_pass, cgp_pass, cpcsc_pass, candidates-in-seed-order)."""
        r = self.req(job)
        jid = job.get("id")
        hit = self._sets.get(jid)
        if hit is not None:
            return hit
        proc = self.all
        for t in r.tag_set:
            proc = proc & self.process_index.get(t, frozenset())
        cert = self.all
        for c in r.certs:
            cert = cert & self.holders(c)
        cgp = self.holders(CGP) if r.controlled else self.all
        cpcsc = self.holders(CPCSC) if r.cpcsc else self.all
        pool = proc & cert & cgp & cpcsc
        cands = sorted((s for s in pool if _fits(r.env, self.env[s])), key=self.pos.__getitem__)
        out = (proc, cert, cgp, cpcsc, tuple(cands))
        self._sets[jid] = out
        return out

    # ------------------------------------------------------------------ queries

    def process_pass(self, job: dict) -> frozenset[str]:
        return self._job_sets(job)[0]

    def cert_pass(self, job: dict) -> frozenset[str]:
        return self._job_sets(job)[1]

    def candidates(self, job: dict) -> tuple[str, ...]:
        """Shops passing every filter except capacity, in seed order."""
        return self._job_sets(job)[4]

    def ordered(self, sids: Iterable[str]) -> list[str]:
        return sorted(sids, key=self.pos.__getitem__)

    def fits(self, sid: str, job: dict) -> bool:
        return _fits(self.req(job).env, self.env[sid])

    def missing_certs(self, sid: str, job: dict) -> list[str]:
        """rules.missing_certs: required certs (not CPCSC_L1) that do not count, in order."""
        st = self.status[sid]
        return [c for c in self.req(job).certs if st.get(c, UNKNOWN) not in self.counting]

    def failing(self, sid: str, job: dict, remaining: float | None = None) -> list[str]:
        """Failing filter codes in FILTERS order: same as rules.evaluate(...)["failing"]."""
        r = self.req(job)
        st = self.status[sid]
        cnt = self.counting
        out = []
        if not r.tag_set <= self.procs[sid]:
            out.append("process")
        if not _fits(r.env, self.env[sid]):
            out.append("envelope")
        for c in r.certs:
            if st.get(c, UNKNOWN) not in cnt:
                out.append("certs")
                break
        if r.controlled and st.get(CGP, UNKNOWN) not in cnt:
            out.append("controlled_cgp")
        if r.cpcsc and st.get(CPCSC, UNKNOWN) not in cnt:
            out.append("cpcsc")
        if remaining is not None and float(remaining) < r.hours:
            out.append("capacity")
        return out

    def filter_counts(self, job: dict, remaining: Callable[[str], float]) -> dict[str, int]:
        """How many shops fail each filter (capacity against ``remaining``): the
        BlockedJob ``failing_filters`` counts, from index sizes plus two cheap scans."""
        r = self.req(job)
        proc, cert, cgp, cpcsc, _ = self._job_sets(job)
        n = len(self.order)
        env_fail = sum(1 for sid in self.order if not _fits(r.env, self.env[sid]))
        cap_fail = sum(1 for sid in self.order if float(remaining(sid)) < r.hours)
        counts = {
            "process": n - len(proc),
            "envelope": env_fail,
            "certs": n - len(cert),
            "controlled_cgp": n - len(cgp),
            "cpcsc": n - len(cpcsc),
            "capacity": cap_fail,
        }
        return {f: counts[f] for f in FILTERS}

    def near_miss_cert(self, job: dict, remaining: Callable[[str], float]) -> list[str]:
        """Shops failing ONLY the certs filter (capacity included), in seed order."""
        r = self.req(job)
        proc, cert, cgp, cpcsc, _ = self._job_sets(job)
        pool = (proc & cgp & cpcsc) - cert
        return self.ordered(
            s for s in pool if _fits(r.env, self.env[s]) and not float(remaining(s)) < r.hours
        )

    def near_miss_capacity(self, job: dict, remaining: Callable[[str], float]) -> list[str]:
        """Shops failing ONLY the capacity filter, in seed order."""
        r = self.req(job)
        return [s for s in self.candidates(job) if float(remaining(s)) < r.hours]

    def requirements(
        self, sid: str, job: dict, remaining: float
    ) -> tuple[set[tuple[str, str]], bool]:
        """gaps.requirements: failing (kind, requirement) pairs plus the envelope flag."""
        r = self.req(job)
        procs = self.procs[sid]
        st = self.status[sid]
        cnt = self.counting
        reqs: set[tuple[str, str]] = set()
        for p in r.tags:
            if p not in procs:
                reqs.add(("process", p))
        for c in r.certs:
            if st.get(c, UNKNOWN) not in cnt:
                reqs.add(("cert", c))
        if r.controlled and st.get(CGP, UNKNOWN) not in cnt:
            reqs.add(("cert", CGP))
        if r.cpcsc and st.get(CPCSC, UNKNOWN) not in cnt:
            reqs.add(("cert", CPCSC))
        if remaining < job["hours_week"]:
            reqs.add(("capacity", (job.get("process_tags") or ["capacity"])[0]))
        return reqs, not _fits(r.env, self.env[sid])
