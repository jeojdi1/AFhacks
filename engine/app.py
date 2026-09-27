"""Muster Engine FastAPI app (H2.8).

Thin HTTP layer over ``engine.pipeline``. Every request runs under ``STATE_LOCK``.
Mutating requests load the program State from SQLite, delegate to the pipeline and save
it back (a new revision). Read requests are memoized per revision (``engine.cache``):
the rendered JSON of each view is computed once per State revision and served again
until the next upload / route / fund / reset / shop action. Response shapes are
docs/api.md; errors are ``{"detail": "<readable message>"}``.

Shop-side actions and the activity log (docs/api.md §6) live in ``engine.shopside``; this
module only wires their routes, plus the ``routed`` / ``package_funded`` event hooks.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Annotated, Any

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict

from engine import cache, graphdb, pipeline, search, shopside, simulate, tagger
from engine.state import (
    DEFAULT_PROGRAM_ID,
    DEMO_PARTS_CSV,
    STATE_LOCK,
    State,
    load_state,
    reset_state,
    save_state,
)

VERSION = "0.1.0"
PROGRAM_IDS = {DEFAULT_PROGRAM_ID}
SOLVERS = {"auto", "ortools", "greedy"}
SHOP_SOURCES = {"public", "synthetic"}

log = logging.getLogger(__name__)

app = FastAPI(title="Muster Engine", version=VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    # Any local port, so testers can run the web app (or several) next to the demo one,
    # plus private LAN hosts (192.168.*, 10.*, 172.16-31.*) so a real phone on the same
    # network can reach the engine during a demo. Never "*". (Starlette uses fullmatch.)
    allow_origin_regex=(
        r"https?://(localhost|127\.0\.0\.1"
        r"|192\.168\.\d{1,3}\.\d{1,3}"
        r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
        r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _validation_message(exc: RequestValidationError) -> str:
    """Readable one-line summary of FastAPI request-validation errors."""
    parts = []
    for err in exc.errors():
        loc = [str(x) for x in err.get("loc", ()) if x not in ("query", "body", "path", "header")]
        msg = str(err.get("msg") or "invalid value")
        parts.append(f"{'.'.join(loc)}: {msg}" if loc else msg)
    return "; ".join(parts) or "Invalid request"


@app.exception_handler(RequestValidationError)
async def _invalid_request(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Contract: bad input is 400 {"detail": "<readable message>"}, never 422 with a list."""
    return JSONResponse(status_code=400, content={"detail": _validation_message(exc)})


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": f"Internal error: {type(exc).__name__}: {exc}"})


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _check_program(program_id: str) -> None:
    if program_id not in PROGRAM_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown program '{program_id}'")


def _render(content: Any) -> bytes:
    """The exact bytes FastAPI would send for ``content`` returned from an endpoint.

    The views return plain JSON types, for which ``jsonable_encoder`` is the identity, so
    they are dumped directly (it is the slow part on large payloads); anything else goes
    through ``jsonable_encoder`` as FastAPI would."""
    try:
        return JSONResponse(content).body
    except TypeError:
        return JSONResponse(jsonable_encoder(content)).body


def _read(program_id: str, key: tuple, fn: Callable[[State], Any]) -> Response:
    """Run a read-only view under the lock (nothing is saved), memoized per State
    revision under ``key``. HTTPExceptions raised by ``fn`` are not cached."""
    with STATE_LOCK:
        body = cache.view(program_id, key, lambda state: _render(fn(state)))
    return Response(content=body, media_type="application/json")


def _write(program_id: str, fn: Callable[[State], Any]) -> Any:
    """Run a mutating operation under the lock and persist the State on success (a new
    revision, which invalidates every memoized view of the program)."""
    with STATE_LOCK:
        state = load_state(program_id)
        result = fn(state)
        save_state(state)
        cache.invalidate(program_id)
        return result


def _action(program_id: str, fn: Callable[[State], tuple[Any, bool]]) -> Any:
    """Run a shop action (engine.shopside) under the lock. It returns ``(response,
    changed)``; the State is saved (a new revision, invalidating the cached views) only
    when something changed, so an idempotent replay writes nothing."""
    with STATE_LOCK:
        state = load_state(program_id)
        try:
            result, changed = fn(state)
        except shopside.ActionError as exc:
            raise HTTPException(status_code=exc.status, detail=exc.detail) from None
        if changed:
            save_state(state)
            cache.invalidate(program_id)
        return result


def _read_action(program_id: str, key: tuple, fn: Callable[[State], Any]) -> Response:
    """``_read`` for shopside views: ActionError becomes an HTTP error (not cached)."""

    def view(state: State) -> Any:
        try:
            return fn(state)
        except shopside.ActionError as exc:
            raise HTTPException(status_code=exc.status, detail=exc.detail) from None

    return _read(program_id, key, view)


def _is_routed(state: State) -> bool:
    return state.stage in ("routed", "funded")


def _require_routed(state: State) -> None:
    if not _is_routed(state):
        raise HTTPException(status_code=400, detail="Route the program first")


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #
@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "muster-engine", "version": VERSION}


@app.post("/demo/reset")
def demo_reset() -> dict:
    with STATE_LOCK:
        state = reset_state(DEFAULT_PROGRAM_ID)
        cache.invalidate(DEFAULT_PROGRAM_ID)
    return {
        "ok": True,
        "program_id": state.program["id"],
        "shops": len(state.shops),
        "jobs": len(state.jobs),
        "message": "Demo reset: shops and program seeded; no parts uploaded.",
    }


app.include_router(simulate.router)  # /demo/seed, /demo/simulate/* (engine/simulate.py)


@app.get("/programs/{program_id}")
def get_program(program_id: str) -> Response:
    _check_program(program_id)
    return _read(program_id, ("program",), pipeline.program_view)


@app.post("/programs/{program_id}/parts")
def upload_parts(
    program_id: str,
    file: Annotated[UploadFile | None, File()] = None,
    use_demo: Annotated[bool, Query()] = False,
) -> dict:
    _check_program(program_id)
    if file is not None:
        raw = file.file.read()
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="CSV must be UTF-8 text") from None
    elif use_demo:
        text = DEMO_PARTS_CSV.read_text(encoding="utf-8")
    else:
        raise HTTPException(
            status_code=400,
            detail="Send a CSV as multipart field 'file', or use ?use_demo=true",
        )
    try:
        rows = tagger.parse_csv(text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None

    def op(state: State) -> dict:
        jobs, counts = tagger.tag_rows(rows, program_id=program_id)
        state.jobs = jobs
        state.assignments = {}
        state.blocked = []
        state.packages = {}
        state.txns = []
        state.funded = []
        state.cert_overrides = {}
        state.capacity_bonus = {}
        state.solver = None
        state.elapsed_ms = 0
        state.tagger_counts = dict(counts)
        state.stage = "uploaded"
        shopside.on_uploaded(state)
        return {"program_id": program_id, "count": len(jobs), "tagger": dict(counts), "jobs": jobs}

    return _write(program_id, op)


@app.post("/programs/{program_id}/route")
def route_program(program_id: str, solver: str = Query("auto")) -> dict:
    _check_program(program_id)
    if solver not in SOLVERS:
        raise HTTPException(status_code=400, detail=f"solver must be one of: {', '.join(sorted(SOLVERS))}")

    def op(state: State) -> dict:
        if not state.jobs:
            raise HTTPException(status_code=400, detail="Upload a parts list first")
        try:
            result = pipeline.route(state, solver=solver)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from None
        shopside.on_routed(state, result)
        return result

    return _write(program_id, op)


@app.get("/programs/{program_id}/assignments")
def get_assignments(program_id: str) -> Response:
    _check_program(program_id)
    return _read(program_id, ("assignments",), pipeline.assignments_view)


@app.get("/programs/{program_id}/jobs")
def get_jobs(program_id: str) -> Response:
    _check_program(program_id)
    return _read(program_id, ("jobs",), pipeline.jobs_view)


@app.get("/programs/{program_id}/ledger")
def get_ledger(program_id: str) -> Response:
    _check_program(program_id)

    def view(state: State) -> dict:
        _require_routed(state)
        return pipeline.ledger(state)

    return _read(program_id, ("ledger",), view)


@app.get("/programs/{program_id}/gaps")
def get_gaps(program_id: str) -> Response:
    _check_program(program_id)

    def view(state: State) -> dict:
        _require_routed(state)
        return pipeline.gaps(state)

    return _read(program_id, ("gaps",), view)


@app.post("/programs/{program_id}/training/{package_id}/fund")
def fund_training(program_id: str, package_id: str) -> dict:
    _check_program(program_id)

    def op(state: State) -> dict:
        if not _is_routed(state):
            raise HTTPException(status_code=400, detail="Route the program first")
        if package_id not in state.packages:
            raise HTTPException(status_code=404, detail=f"Unknown training package '{package_id}'")
        try:
            result = pipeline.fund(state, package_id)
        except ValueError as exc:
            msg = str(exc)
            if "already funded" in msg:
                raise HTTPException(status_code=409, detail=f"Training package '{package_id}' is already funded") from None
            if "not routed" in msg:
                raise HTTPException(status_code=400, detail="Route the program first") from None
            raise HTTPException(status_code=400, detail=msg) from None
        shopside.on_funded(state, result)
        return result

    return _write(program_id, op)


@app.get("/shops")
def list_shops(source: str | None = Query(None)) -> Response:
    if source is not None and source not in SHOP_SOURCES:
        raise HTTPException(status_code=400, detail="source must be 'public' or 'synthetic'")
    return _read(DEFAULT_PROGRAM_ID, ("shops", source), lambda s: pipeline.shops_list(s, source))


@app.get("/shops/{shop_id}")
def get_shop(shop_id: str) -> Response:
    def view(state: State) -> dict:
        if shop_id not in state.shops and not shop_id.startswith("pub-"):
            raise HTTPException(status_code=404, detail=f"Unknown shop '{shop_id}'")
        try:
            return pipeline.shop_detail(state, shop_id)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"Unknown shop '{shop_id}'") from None

    return _read(DEFAULT_PROGRAM_ID, ("shop", shop_id), view)


# --------------------------------------------------------------------------- #
# Shop actions and events (docs/api.md §6, additive v0.2)
# --------------------------------------------------------------------------- #
class _Body(BaseModel):
    model_config = ConfigDict(extra="ignore")
    idempotency_key: str | None = None


class DecisionBody(_Body):
    decision: str
    reason_code: str | None = None
    question_code: str | None = None
    note: str | None = None


class FundingRequestBody(_Body):
    requirement: str


class CapacityBody(_Body):
    hours_week: float | None = None
    by_process: dict[str, float] | None = None
    horizon_weeks: int | None = 4


class CertDeclarationBody(_Body):
    expires_at: str
    cert_number: str | None = None


@app.post("/shops/{shop_id}/offers/{job_id}/decision")
def decide_offer(shop_id: str, job_id: str, body: DecisionBody) -> dict:
    data = body.model_dump()
    return _action(DEFAULT_PROGRAM_ID, lambda s: shopside.decide(s, shop_id, job_id, data))


@app.post("/shops/{shop_id}/funding-requests")
def request_funding(shop_id: str, body: FundingRequestBody) -> dict:
    data = body.model_dump()
    return _action(DEFAULT_PROGRAM_ID, lambda s: shopside.request_funding(s, shop_id, data))


@app.post("/shops/{shop_id}/capacity")
def confirm_capacity(shop_id: str, body: CapacityBody) -> dict:
    data = body.model_dump(exclude_unset=True)
    return _action(DEFAULT_PROGRAM_ID, lambda s: shopside.confirm_capacity(s, shop_id, data))


@app.post("/shops/{shop_id}/certifications/{cert_type}")
def declare_certification(shop_id: str, cert_type: str, body: CertDeclarationBody) -> dict:
    data = body.model_dump()
    return _action(DEFAULT_PROGRAM_ID, lambda s: shopside.declare_cert(s, shop_id, cert_type, data))


@app.get("/shops/{shop_id}/actions")
def get_shop_actions(shop_id: str) -> Response:
    return _read_action(DEFAULT_PROGRAM_ID, ("shop_actions", shop_id), lambda s: shopside.shop_actions(s, shop_id))


@app.get("/programs/{program_id}/actions")
def get_program_actions(program_id: str) -> Response:
    _check_program(program_id)
    return _read(program_id, ("program_actions",), shopside.program_actions)


@app.get("/programs/{program_id}/events")
def get_events(
    program_id: str,
    since: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> Response:
    _check_program(program_id)
    return _read(program_id, ("events", since, limit), lambda s: shopside.events_view(s, since, limit))


@app.get("/programs/{program_id}/training/{package_id}/seats/{seat}")
def get_trainee_seat(program_id: str, package_id: str, seat: int) -> Response:
    _check_program(program_id)
    return _read_action(
        program_id, ("seat", package_id, seat), lambda s: shopside.trainee_seat(s, package_id, seat)
    )


# --------------------------------------------------------------------------- #
# Search + graph (docs/api.md §7, additive): Neo4j when available, memory otherwise
# --------------------------------------------------------------------------- #
def _search_call(fn: Callable[[], Any]) -> Any:
    try:
        return fn()
    except search.SearchError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail) from None


@app.get("/search/shops")
def search_shops(
    q: str | None = None,
    process: Annotated[list[str] | None, Query()] = None,
    cert: Annotated[list[str] | None, Query()] = None,
    near: str | None = None,
    radius_km: float | None = None,
    source: str = "all",
    dnd_history: bool | None = None,
    match: str = "all",
    limit: Annotated[int, Query(ge=1, le=200)] = 25,
) -> Response:
    sq = _search_call(lambda: search.ShopQuery(q, process, cert, near, radius_km, source, dnd_history,
                                               match, limit))
    engine = search.engine_name()
    key = ("search_shops", engine, graphdb.marker(), sq.key())
    return _read(DEFAULT_PROGRAM_ID, key, lambda s: search.search_shops(s, sq, engine))


@app.get("/search/jobs")
def search_jobs(
    shop_id: str,
    q: str | None = None,
    process: Annotated[list[str] | None, Query()] = None,
    include_near_miss: bool = True,
) -> Response:
    procs = tuple(process or ())
    key = ("search_jobs", shop_id, q, procs, include_near_miss)
    return _read(
        DEFAULT_PROGRAM_ID, key,
        lambda s: _search_call(lambda: search.search_jobs(s, shop_id, q, list(procs), include_near_miss)),
    )


@app.get("/graph/summary")
def graph_summary() -> dict:
    return search.graph_summary()


@app.get("/graph/ego")
def graph_ego(
    node_id: Annotated[str, Query(alias="id")],
    depth: Annotated[int, Query(ge=1, le=2)] = 1,
    limit: Annotated[int, Query(ge=1, le=500)] = 150,
) -> dict:
    return _search_call(lambda: search.graph_ego(node_id, depth, limit))
