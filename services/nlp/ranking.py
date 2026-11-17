"""Text relevance for LanTURN: TF-IDF cosine between a resume and job descriptions.

Pure standard library (no numpy/scikit-learn) so the service stays small and starts instantly on a free tier.
The skill-tag matcher in the Node app answers "do you have the listed skills"; this answers "does your actual
experience read like this job", which catches roles whose description matters more than its tags.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass

TOKEN = re.compile(r"[a-z][a-z0-9+#.\-]*[a-z0-9+#]|[a-z]")
STOP = frozenset("""a an and are as at be by for from has have in is it its of on or that the this to was were will with you your
we our us they their them he she his her i me my not but if then than so such can may must should would could about into over
under per via etc including include includes using use used work working works role roles job jobs candidate candidates
looking responsibilities requirements required preferred strong good great excellent ability able experience years year team teams
company join build building develop developing development""".split())
# keep short technical tokens that look like stop words or noise
KEEP = frozenset({"c", "c++", "c#", "go", "r", "ml", "ai", "ui", "ux", "qa", "sql", "aws", "gcp", "css", "git", "api"})


def stem(t: str) -> str:
    if any(ch in t for ch in ".+#"):  # node.js, c++, c# are names, not plurals
        return t
    if len(t) > 4 and t.endswith("ies"):
        return t[:-3] + "y"
    if len(t) > 4 and t.endswith("es") and not t.endswith(("ses", "xes")):
        return t[:-2]
    if len(t) > 3 and t.endswith("s") and not t.endswith("ss"):
        return t[:-1]
    return t


def tokenize(text: str, shown: dict[str, str] | None = None) -> list[str]:
    """Stemmed tokens. `shown` (optional) collects stem -> original word so results can display readable terms."""
    out = []
    for raw in TOKEN.findall(text.lower()):
        raw = raw.strip(".-")
        if not raw or (raw in STOP):
            continue
        t = stem(raw)
        if len(t) < 2 and t not in KEEP:
            continue
        if shown is not None:
            shown.setdefault(t, raw)
        out.append(t)
    return out


@dataclass
class Ranked:
    id: object
    cosine: float
    score: int
    shared: list[str]
    missing: list[str]


def _vec(tf: Counter, idf: dict[str, float]) -> dict[str, float]:
    return {t: (1.0 + math.log(c)) * idf.get(t, 0.0) for t, c in tf.items()}


def _norm(v: dict[str, float]) -> float:
    return math.sqrt(sum(x * x for x in v.values()))


def rank(resume: str, jobs: list[dict], top_terms: int = 5) -> list[Ranked]:
    """Rank jobs against a resume. Each job is {"id", "text"}. Returns results in input order."""
    shown: dict[str, str] = {}
    r_tf = Counter(tokenize(resume, shown))
    j_tf = [Counter(tokenize(j.get("text", ""), shown)) for j in jobs]
    n_docs = len(jobs) + 1
    df: Counter = Counter()
    for tf in [r_tf, *j_tf]:
        df.update(tf.keys())
    idf = {t: math.log((1 + n_docs) / (1 + d)) + 1.0 for t, d in df.items()}  # smoothed, always > 0
    rv = _vec(r_tf, idf)
    rn = _norm(rv)
    out: list[Ranked] = []
    for job, tf in zip(jobs, j_tf):
        jv = _vec(tf, idf)
        jn = _norm(jv)
        if not rn or not jn:
            out.append(Ranked(job.get("id"), 0.0, 0, [], []))
            continue
        shared_w = {t: rv[t] * jv[t] for t in jv if t in rv}
        cos = sum(shared_w.values()) / (rn * jn)
        shared = [shown.get(t, t) for t, _ in sorted(shared_w.items(), key=lambda kv: -kv[1])[:top_terms]]
        missing = [shown.get(t, t) for t, _ in sorted(((t, w) for t, w in jv.items() if t not in rv), key=lambda kv: -kv[1])[:top_terms]]
        # Raw cosine between a resume and a posting is rarely above ~0.35 even for a great fit, so map [0, 0.35] -> [0, 100].
        out.append(Ranked(job.get("id"), round(cos, 4), min(100, round(100 * cos / 0.35)), shared, missing))
    return out
