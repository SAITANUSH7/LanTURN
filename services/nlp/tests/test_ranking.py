import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as service  # noqa: E402
from ranking import rank, tokenize  # noqa: E402

RESUME = "Built REST APIs in Node.js and Express with PostgreSQL. Deployed Docker containers, wrote React dashboards."
JOBS = [
    {"id": 1, "text": "Backend engineer: design REST APIs with Node.js and PostgreSQL, deploy with Docker."},
    {"id": 2, "text": "Graphic designer: Photoshop, Illustrator, brand identity and typography."},
    {"id": "x", "text": ""},
]


def test_tokenize_keeps_technical_tokens():
    t = tokenize("C++ and Node.js, CI/CD, c# apis")
    assert "c++" in t and "node.js" in t and "c#" in t and "api" in t


def test_relevant_job_outranks_irrelevant():
    r = {x.id: x for x in rank(RESUME, JOBS)}
    assert r[1].score > r[2].score
    assert r[1].score > 30
    assert r[2].score < 10
    assert "node.js" in r[1].shared or "docker" in r[1].shared


def test_empty_text_scores_zero_without_crashing():
    r = {x.id: x for x in rank(RESUME, JOBS)}
    assert r["x"].score == 0
    assert rank("", JOBS)[0].score == 0


def test_missing_terms_reported():
    r = rank("Python only", [{"id": 1, "text": "Kubernetes Terraform Helm Python"}])[0]
    assert {"kubernetes", "terraform", "helm"} <= set(r.missing)


def test_api_contract_and_auth(monkeypatch):
    c = TestClient(service.app)
    assert c.get("/health").json()["status"] == "ok"
    monkeypatch.setattr(service, "TOKEN", "s3cret")
    body = {"resume": RESUME, "jobs": JOBS}
    assert c.post("/v1/rank", json=body).status_code == 401
    assert c.post("/v1/rank", json=body, headers={"X-Service-Token": "nope"}).status_code == 401
    ok = c.post("/v1/rank", json=body, headers={"X-Service-Token": "s3cret"})
    assert ok.status_code == 200
    assert [r["id"] for r in ok.json()["results"]] == [1, 2, "x"]


def test_input_limits():
    c = TestClient(service.app)
    too_many = {"resume": "a", "jobs": [{"id": i, "text": "x"} for i in range(1001)]}
    assert c.post("/v1/rank", json=too_many).status_code == 422
