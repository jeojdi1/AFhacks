"""Muster Engine FastAPI app."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

VERSION = "0.1.0"

app = FastAPI(title="Muster Engine", version=VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _not_implemented(task: str) -> JSONResponse:
    return JSONResponse(status_code=501, content={"detail": "not implemented", "task": task})


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "muster-engine", "version": VERSION}


@app.post("/demo/reset")
def demo_reset() -> JSONResponse:
    return _not_implemented("H2.8")


@app.get("/programs/{program_id}")
def get_program(program_id: str) -> JSONResponse:
    return _not_implemented("H2.8")


@app.post("/programs/{program_id}/parts")
def upload_parts(program_id: str) -> JSONResponse:
    return _not_implemented("H2.2")


@app.post("/programs/{program_id}/route")
def route_program(program_id: str) -> JSONResponse:
    return _not_implemented("H2.4")


@app.get("/programs/{program_id}/assignments")
def get_assignments(program_id: str) -> JSONResponse:
    return _not_implemented("H2.4")


@app.get("/programs/{program_id}/ledger")
def get_ledger(program_id: str) -> JSONResponse:
    return _not_implemented("H2.5")


@app.get("/programs/{program_id}/gaps")
def get_gaps(program_id: str) -> JSONResponse:
    return _not_implemented("H2.6")


@app.post("/programs/{program_id}/training/{package_id}/fund")
def fund_training(program_id: str, package_id: str) -> JSONResponse:
    return _not_implemented("H2.7")


@app.get("/shops")
def list_shops() -> JSONResponse:
    return _not_implemented("H2.8")


@app.get("/shops/{shop_id}")
def get_shop(shop_id: str) -> JSONResponse:
    return _not_implemented("H2.9")
