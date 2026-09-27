"""Muster Engine FastAPI app (H2.8).

Thin HTTP layer over ``engine.pipeline``. Every request runs under ``STATE_LOCK``.
Mutating requests load the program State from SQLite, delegate to the pipeline and save
it back (a new revision). Read requests are memoized per revision (``engine.cache``):
the rendered JSON of each view is computed once per State revision and served again
until the next upload / route / fund / reset. Response shapes are docs/api.md; errors
are ``{"detail": "<readable message>"}``.
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

from engine import cache, pipeline, tagger
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
    # Any local port, so testers can run the web app (or several) next to the demo one.
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
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
            return pipeline.route(state, solver=solver)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from None

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
            return pipeline.fund(state, package_id)
        except ValueError as exc:
            msg = str(exc)
            if "already funded" in msg:
                raise HTTPException(status_code=409, detail=f"Training package '{package_id}' is already funded") from None
            if "not routed" in msg:
                raise HTTPException(status_code=400, detail="Route the program first") from None
            raise HTTPException(status_code=400, detail=msg) from None

    return _write(program_id, op)


@app.get("/shops")
def list_shops(source: str | None = Query(None)) -> Response:
    if source is not None and source not in SHOP_SOURCES:
        raise HTTPException(status_code=400, detail="source must be 'public' or 'synthetic'")
    return _read(DEFAULT_PROGRAM_ID, ("shops", source), lambda s: pipeline.shops_list(s, source))


@app.get("/shops/{shop_id}")
def get_shop(shop_id: str) -> Response:
    def view(state: State) -> dict:
        if shop_id not in state.shops:
            raise HTTPException(status_code=404, detail=f"Unknown shop '{shop_id}'")
        return pipeline.shop_detail(state, shop_id)

    return _read(DEFAULT_PROGRAM_ID, ("shop", shop_id), view)
