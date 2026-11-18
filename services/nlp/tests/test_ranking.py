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
    assert c.get("/health").json()["status"] in ("ok", "starting")
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


# ---- domain classifier (persistent) ----
import pytest  # noqa: E402
from domain_model import ModelStore  # noqa: E402


@pytest.fixture()
def client(tmp_path, monkeypatch):
    store = ModelStore(tmp_path / "models")
    monkeypatch.setattr(service, "store", store)
    store.ensure()
    return TestClient(service.app)


def test_classifies_obvious_resumes(client):
    cases = {
        "Skills: React, Next.js, CSS Grid, Flexbox, responsive design, TypeScript": "frontend",
        "PyTorch, transformers, fine-tuning LLMs, embeddings, model evaluation, RAG": "aiml",
        "Docker, Kubernetes, Terraform, CI/CD pipelines, AWS, Prometheus monitoring": "devops",
    }
    for text, want in cases.items():
        got = client.post("/v1/classify", json={"text": text, "top_k": 3}).json()["results"]
        assert got[0]["id"] == want or want in [r["id"] for r in got], (text, got)
        assert abs(sum(r["prob"] for r in got)) <= 1.0 + 1e-6


def test_model_persists_and_reloads_without_retraining(tmp_path):
    a = ModelStore(tmp_path / "m")
    assert a.ensure() == "trained"
    v = a.current_version()
    b = ModelStore(tmp_path / "m")
    assert b.ensure() == "loaded"
    assert b.current_version() == v
    assert b.classify("Docker Kubernetes Terraform", 1)[0]["id"] in {"devops", "cloud"}


def test_retrain_with_extra_docs_persists_and_versions(client):
    before = client.get("/v1/model").json()
    ok = client.post("/v1/train", json={"extra": [{"text": "Skills: ladle, spatula, sous vide", "label": "devops"}]})
    assert ok.status_code == 200 and ok.json()["added"] == 1
    after = client.get("/v1/model").json()
    assert after["meta"]["version"] == before["meta"]["version"] + 1
    assert after["extra_samples"] == 1
    assert client.post("/v1/train", json={"extra": [{"text": "x", "label": "not-a-domain"}]}).status_code == 422


def test_corrupt_current_model_triggers_retrain(tmp_path):
    a = ModelStore(tmp_path / "m")
    a.ensure()
    (tmp_path / "m" / f"domain-v{a.current_version()}.joblib").write_bytes(b"garbage")
    assert ModelStore(tmp_path / "m").ensure() == "trained"


def test_old_versions_are_pruned(tmp_path):
    s = ModelStore(tmp_path / "m")
    s.ensure()
    for _ in range(4):
        s.retrain()
    assert len(s.versions()) == 3
