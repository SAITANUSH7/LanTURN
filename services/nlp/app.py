"""LanTURN NLP sidecar. Optional: the Node app works without it and falls back to skill-tag matching."""
from __future__ import annotations

import hmac
import os
import time
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from ranking import rank

TOKEN = os.environ.get("NLP_SERVICE_TOKEN", "")
MAX_JOBS = 1000
MAX_CHARS = 60_000

app = FastAPI(title="LanTURN NLP", version="1.0.0", docs_url=None, redoc_url=None)
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
    return {"status": "ok", "uptime_s": round(time.time() - _started), "served": _served}


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
