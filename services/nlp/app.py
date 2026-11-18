"""LanTURN NLP sidecar. Optional: the Node app works without it and falls back to skill-tag matching."""
from __future__ import annotations

import hmac
import os
import time
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from contextlib import asynccontextmanager
import threading

from domain_model import ModelStore, load_domains
from ranking import rank

TOKEN = os.environ.get("NLP_SERVICE_TOKEN", "")
MAX_JOBS = 1000
MAX_CHARS = 60_000

store = ModelStore()
train_lock = threading.Lock()
boot = {"action": None}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Load the persisted model (instant) or train one (a few seconds) before taking traffic.
    boot["action"] = store.ensure()
    yield


app = FastAPI(title="LanTURN NLP", version="1.1.0", docs_url=None, redoc_url=None, lifespan=lifespan)
_started = time.time()
_served = 0


def auth(x_service_token: str | None = Header(default=None)) -> None:
    """Shared-secret check. With no token configured the service is open (local development only)."""
    if TOKEN and not (x_service_token and hmac.compare_digest(x_service_token, TOKEN)):
        raise HTTPException(status_code=401, detail="bad service token")


class Job(BaseModel):
    id: Any
    text: str = Field(max_length=MAX_CHARS)


class RankIn(BaseModel):
    resume: str = Field(max_length=MAX_CHARS)
    jobs: list[Job] = Field(max_length=MAX_JOBS)
    top_terms: int = Field(default=5, ge=1, le=10)


@app.get("/health")
def health() -> dict:
    return {"status": "ok" if store.model is not None else "starting", "uptime_s": round(time.time() - _started), "served": _served, "model_version": store.meta.get("version")}


class ClassifyIn(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_CHARS)
    top_k: int = Field(default=3, ge=1, le=10)


class Labeled(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)
    label: str = Field(max_length=64)


class TrainIn(BaseModel):
    extra: list[Labeled] = Field(default_factory=list, max_length=5000)


@app.post("/v1/classify", dependencies=[Depends(auth)])
def v1_classify(body: ClassifyIn) -> dict:
    if store.model is None:
        raise HTTPException(status_code=503, detail="model not ready")
    return {"results": store.classify(body.text, body.top_k), "model_version": store.meta.get("version")}


@app.get("/v1/model", dependencies=[Depends(auth)])
def v1_model() -> dict:
    return {"meta": store.meta, "versions": store.versions(), "extra_samples": len(store.extra()), "boot": boot["action"]}


@app.post("/v1/train", dependencies=[Depends(auth)])
def v1_train(body: TrainIn) -> dict:
    """Persist any extra labeled documents, retrain on corpus + all extras, save a new version, hot-swap it in."""
    valid = {d["id"] for d in load_domains()}
    bad = sorted({e.label for e in body.extra} - valid)
    if bad:
        raise HTTPException(status_code=422, detail=f"unknown labels: {bad[:5]}")
    if not train_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="a training run is already in progress")
    try:
        added = store.add_extra([e.model_dump() for e in body.extra]) if body.extra else 0
        store.retrain()
        return {"added": added, "meta": store.meta}
    finally:
        train_lock.release()


@app.post("/v1/rank", dependencies=[Depends(auth)])
def v1_rank(body: RankIn) -> dict:
    global _served
    _served += 1
    t0 = time.perf_counter()
    results = rank(body.resume, [j.model_dump() for j in body.jobs], body.top_terms)
    return {
        "results": [{"id": r.id, "score": r.score, "cosine": r.cosine, "shared": r.shared, "missing": r.missing} for r in results],
        "ms": round((time.perf_counter() - t0) * 1000, 2),
    }
