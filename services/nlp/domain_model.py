"""Career-direction classifier: which of the Career AIsle domains does this resume read like?

Trained weakly-supervised from the domain definitions (topics, stage descriptions, projects): synthetic "resume-like"
documents are sampled from each domain (skills lists, project sentences, plus noise from other domains), then a TF-IDF
(1-2 grams) + logistic-regression pipeline is fitted. Models are versioned on disk and survive restarts/redeploys when
MODEL_DIR points at a volume; labeled extra documents sent to /v1/train are persisted and folded into every later retrain.
"""
from __future__ import annotations

import hashlib
import json
import os
import random
import threading
import time
from pathlib import Path

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

DATA = Path(__file__).parent / "data" / "domains.json"
MODEL_DIR = Path(os.environ.get("MODEL_DIR", Path(__file__).parent / "models"))
KEEP_VERSIONS = 3


def load_domains() -> list[dict]:
    return json.loads(DATA.read_text(encoding="utf-8"))


def corpus_hash(domains: list[dict], extra: list[dict]) -> str:
    h = hashlib.sha256(DATA.read_bytes())
    h.update(json.dumps(extra, sort_keys=True).encode())
    return h.hexdigest()[:16]


def synth_docs(domains: list[dict], per_domain: int, seed: int) -> tuple[list[str], list[str]]:
    rnd = random.Random(seed)
    all_topics = [t for d in domains for t in d["topics"]]
    texts, labels = [], []
    for d in domains:
        topics, projects = d["topics"], d["projects"] or [d["description"]]
        for _ in range(per_domain):
            mine = rnd.sample(topics, k=min(len(topics), rnd.randint(3, 12)))
            noise = rnd.sample(all_topics, k=rnd.randint(0, 3)) if rnd.random() < 0.6 else []
            parts = []
            style = rnd.random()
            if style < 0.5:
                skills = mine + noise
                rnd.shuffle(skills)
                parts.append("Skills: " + ", ".join(skills))
            else:
                parts.extend(f"Worked on {t.lower()}." for t in mine[: len(mine) // 2 + 1])
                parts.append("Skills: " + ", ".join(mine[len(mine) // 2 :] + noise))
            if rnd.random() < 0.7:
                parts.append(rnd.choice(projects))
            if rnd.random() < 0.3:
                parts.append(d["description"])
            if rnd.random() < 0.25:
                parts.append(rnd.choice(["B.Tech in Computer Science", "Final-year student", "Built projects and led a college club", "Internship experience"]))
            texts.append("\n".join(parts))
            labels.append(d["id"])
    return texts, labels


def build_pipeline() -> Pipeline:
    return Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=2, lowercase=True, token_pattern=r"(?u)\b[\w+#.]{2,}\b")),
        ("clf", LogisticRegression(C=12.0, max_iter=400, solver="lbfgs")),
    ])


def train(domains: list[dict], extra: list[dict], per_domain: int = 90, seed: int = 11) -> tuple[Pipeline, dict]:
    t0 = time.perf_counter()
    X, y = synth_docs(domains, per_domain, seed)
    Xv, yv = synth_docs(domains, 25, seed + 1000)          # held-out documents drawn with a different seed
    X += [e["text"] for e in extra]
    y += [e["label"] for e in extra]
    model = build_pipeline().fit(X, y)
    proba = model.predict_proba(Xv)
    classes = list(model.classes_)
    truth = np.array([classes.index(label) for label in yv])
    top1 = float((proba.argmax(1) == truth).mean())
    top3 = float(np.mean([t in np.argsort(-p)[:3] for p, t in zip(proba, truth)]))
    meta = {
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "train_seconds": round(time.perf_counter() - t0, 2),
        "samples": len(X), "extra_samples": len(extra), "labels": len(classes),
        "holdout_top1": round(top1, 4), "holdout_top3": round(top3, 4),
        "corpus_hash": corpus_hash(domains, extra),
    }
    return model, meta


class ModelStore:
    """Versioned on-disk models with an atomic CURRENT pointer. Safe if the process is killed mid-write."""

    def __init__(self, root: Path = MODEL_DIR):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        self.model: Pipeline | None = None
        self.meta: dict = {}

    # --- extra labeled documents (persisted, folded into every retrain)
    @property
    def extra_path(self) -> Path:
        return self.root / "extra.jsonl"

    def extra(self) -> list[dict]:
        if not self.extra_path.exists():
            return []
        out = []
        for line in self.extra_path.read_text(encoding="utf-8").splitlines():
            try:
                out.append(json.loads(line))
            except ValueError:
                continue
        return out

    def add_extra(self, docs: list[dict]) -> int:
        with self.extra_path.open("a", encoding="utf-8") as f:
            for d in docs:
                f.write(json.dumps({"text": d["text"], "label": d["label"]}) + "\n")
        return len(docs)

    # --- versions
    def current_version(self) -> int | None:
        p = self.root / "CURRENT"
        try:
            return int(p.read_text().strip())
        except (OSError, ValueError):
            return None

    def versions(self) -> list[int]:
        return sorted(int(p.stem.split("-v")[1]) for p in self.root.glob("domain-v*.joblib"))

    def save(self, model: Pipeline, meta: dict) -> int:
        v = (self.versions() or [0])[-1] + 1
        meta = {**meta, "version": v}
        tmp = self.root / f".tmp-{v}.joblib"
        joblib.dump(model, tmp)
        os.replace(tmp, self.root / f"domain-v{v}.joblib")
        (self.root / f"domain-v{v}.json").write_text(json.dumps(meta, indent=1))
        ptr = self.root / ".CURRENT.tmp"
        ptr.write_text(str(v))
        os.replace(ptr, self.root / "CURRENT")
        for old in self.versions()[:-KEEP_VERSIONS]:
            for ext in ("joblib", "json"):
                (self.root / f"domain-v{old}.{ext}").unlink(missing_ok=True)
        return v

    def load_current(self) -> bool:
        v = self.current_version()
        if v is None:
            return False
        try:
            model = joblib.load(self.root / f"domain-v{v}.joblib")
            meta = json.loads((self.root / f"domain-v{v}.json").read_text())
        except Exception:  # corrupt or partial: caller retrains
            return False
        with self.lock:
            self.model, self.meta = model, meta
        return True

    def ensure(self) -> str:
        """Load the saved model if it matches the current corpus; otherwise train and save. Returns what happened."""
        domains = load_domains()
        if self.load_current() and self.meta.get("corpus_hash") == corpus_hash(domains, self.extra()):
            return "loaded"
        return self.retrain()

    def retrain(self) -> str:
        domains = load_domains()
        model, meta = train(domains, self.extra())
        v = self.save(model, meta)
        with self.lock:
            self.model, self.meta = model, {**meta, "version": v}
        return "trained"

    def classify(self, text: str, top_k: int = 3) -> list[dict]:
        with self.lock:
            model = self.model
        if model is None:
            raise RuntimeError("model not ready")
        proba = model.predict_proba([text])[0]
        classes = model.classes_
        order = np.argsort(-proba)[:top_k]
        return [{"id": str(classes[i]), "prob": round(float(proba[i]), 4)} for i in order]
