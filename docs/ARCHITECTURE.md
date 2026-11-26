# LanTURN architecture

## Layers
1. **Client** — the shipped UI is a vanilla ES-module SPA in `public/` (hash router, XSS-safe `h()` DOM helper, no build step). CSP allows no inline *script*; it does allow inline `style`, because motion code sets custom properties. `frontend/` is an optional React rewrite that is off by default.
2. **API** — Express (`src/app.js`, `src/routes/*`): helmet, rate limits, zod validation, JWT auth + RBAC, error envelope `{error:{code,message,details,requestId}}`.
3. **AI services** — `src/ai/*`: skill extraction, deterministic scoring, skill gap, job match, roadmaps; optional Anthropic adapter with schema validation and fallback to rules.
4. **Data** — SQLite (`node:sqlite`) + private file storage for resumes.

## Data flow
A. Client sends request (resume PDF, application). B. API authenticates, validates, routes. C. AI module analyses (rules first, LLM optional). D. Result stored and returned.

## Modules
Student (profile, jobs, applications, resume, career) · Employer (company, jobs, candidates, status pipeline) · AI guidance · Core backend (auth, admin approval).

## Security
Access JWT (15 min, memory) + rotating hashed refresh token in httpOnly cookie with reuse detection; employers PENDING until admin approval; ownership checks return 404; PDF magic-byte check, 4 MB cap, consent required; resume text treated as delimited data (prompt-injection guard).

## Scoring
Resume = 40 deterministic (sections 15, contact 5, length 10, quantified 10) + 60 rubric (clarity, skills, writing). Job match = 0.8 skill + 0.1 preference + 0.1 freshness.

## Design system
Tokens, the glass/motion base, components, layout and pages all live in the single file `public/css/lanturn.css` (there is no `tokens.css`/`components.css`/`app.css` split). Motion: drifting aurora orbs, scanline, ticker, pointer-follow highlight, reveal-on-scroll; everything honours reduced motion/transparency.

---

## Platform hardening (v3.1)

```mermaid
flowchart LR
  B[Browser SPA] -->|HTTPS, gzip| A[Express API]
  A --> MW[Security middleware<br/>helmet, rate limit, origin guard,<br/>lockout, no-store]
  A --> DB[(SQLite WAL<br/>+ change-counter triggers)]
  A -->|enqueue| Q[(tasks table)]
  W[Queue worker<br/>retry, backoff, dead letters] --> Q
  W --> DB
  A --> C[C++ core via N-API<br/>matchMany, Aho-Corasick scan]
  A <-->|line protocol, supervised| S[lanturn-search<br/>C++ executable, BM25 index]
  A -->|bounded, breaker| P[Python NLP sidecar<br/>TF-IDF relevance]
  A -->|breaker, task routing| L[LLM providers<br/>NVIDIA / OpenCode / ...]
  A --> O[/health/ready, /admin/metrics/]
```

### Design rules
1. **Everything optional degrades, nothing optional blocks.** The C++ core, the Python sidecar and each LLM provider are accelerators. If absent, slow or failing, the JS rules path answers. Each has a timeout, and a circuit breaker so a dead dependency costs nothing per request.
2. **Correct caches by construction.** SQLite triggers bump `data_versions` on any write to jobs, job skills, employer profiles or skills, so the open-jobs cache validates itself with one primary-key read, whoever wrote the data. The career map is memoised on a hash of its exact inputs.
3. **Slow work leaves the request path.** Posting a job returns immediately; match notifications to students run as a durable background task (`src/queue.js`) with retries, exponential backoff, dedupe keys, crash recovery and a dead-letter list (`/api/admin/tasks`).
4. **Same answer in every implementation.** The C++ kernels and their JS twins use integer round-half-up and are fuzz-tested for identical output (`test/native.test.js`).

### Security
Per-account lockout (5 failures / 15 min) and constant-time unknown-email path; weak-password policy; JWT pinned to HS256; same-origin guard on cookie endpoints; `Cache-Control: no-store` and Permissions-Policy on `/api`; server header and request timeouts; startup warnings for the default admin password and `SEED_DEMO`. An automated test enumerates every route and fails if any route outside a short public allowlist answers without a token.

### Operations
| Endpoint | Purpose |
|---|---|
| `GET /api/health/live` | process is up (never touches the database) |
| `GET /api/health/ready` | database, uploads dir, queue lag; 503 while draining. Used as the Railway healthcheck |
| `GET /api/admin/metrics` | per-route count, errors, avg/p50/p95; queue depth; breaker states; native/NLP status; `history` (below) |
| `GET /api/admin/metrics.prom` | the same in Prometheus text format |
| `GET /api/admin/tasks`, `POST /api/admin/tasks/:id/retry` | inspect and retry background tasks |

**Seven-day gauge history.** A number answers "how much", a trend answers "is it getting worse", and memory and queue
depth are the two gauges where the second question is the one that matters. `src/metricHistory.js` writes one row a
minute into `metric_samples` (rss, heap, in-flight, queue depth, dead letters), keeps seven days, prunes on every
write, and folds the rows into hourly buckets (average for memory, peak for the busy gauges) for the sparklines on
Admin → System. It survives deploys because it is a table, not a process variable. `/api/admin/metrics` also records a
sample when the newest one is older than the interval, so a freshly started process has a first point without waiting
a minute. While the history is younger than three hours it is returned as raw samples rather than one hourly bucket,
so a process deployed ten minutes ago already shows a real trend instead of a flat line. The sampler is skipped in
tests; the bucket, retention and endpoint behaviour have their own suite.

SIGTERM (every Railway deploy) stops accepting traffic, lets in-flight requests and tasks finish, checkpoints the WAL, then exits; a 10 s watchdog guarantees it never hangs a deploy. Requests log one JSON line each with a request id.

### Measured performance
Synthetic data (3000 students, 400 jobs), 24 concurrent connections, 2 vCPU shared with the load generator, `node scripts/bench.mjs`:

| Endpoint | Before (req/s) | After (req/s) | After p95 |
|---|---|---|---|
| `GET /api/jobs/recommended` | 137 | 408 | 79 ms |
| `GET /api/career/map` | 102 | 502 | 65 ms |
| `GET /api/jobs` (page 1) | 508 | 785 | 47 ms |
| `GET /api/platform/stats` | 1594 | 4608 | 13 ms |

Native kernels, `node scripts/microbench.mjs`: `matchMany` over 100k students 7.1 ms JS vs 0.95 ms C++ (7.5x); skill scan of a 21 KB resume 4.4 ms vs 0.45 ms (9.8x). gzip costs about 20% throughput on loopback but shrinks JSON roughly 8x on a real network.

### Deploying the optional parts
- **C++ core:** built automatically by the Dockerfile's first stage. Locally: `npm run build:native`. Opt out with `DISABLE_NATIVE=1`. `/api/admin/metrics` shows `matchBackend`.
- **Python sidecar:** deploy `services/nlp` as a second Railway service (root directory `services/nlp`, uses its Dockerfile). On the web service set `NLP_SERVICE_URL` (the sidecar's private URL) and the same `NLP_SERVICE_TOKEN` on both. Without these, recommendations use skill match only.
- **Load testing:** `DISABLE_RATE_LIMIT=1` exists only for `scripts/bench.mjs`; never set it in production.

### lanturn-search (C++ executable)
A standalone full-text engine (`native/search/lanturn_search.cpp`, no dependencies): BM25 with field weights (title 3, company 2, skills 2, body 1), prefix matching on every query token, exact words beating prefixes, AND semantics. The Node server runs it as one long-lived child process (`src/searchEngine.js`): pipelined requests with ids, a timeout on each, restart after a crash, a circuit breaker, and a re-index whenever the jobs data version changes. A bad query or a crash cannot take the API down; any miss falls back to the SQL `LIKE` search. On 50k synthetic jobs it ranks a two-word query in about 5 ms versus 22 ms for an unranked `LIKE` scan (`npm run bench:native`). At today's few hundred jobs both are instant: the visible gain is relevance ordering and typeahead-style prefix matching. `/api/admin/metrics` reports its status under `search`.

### Persistent ML (Python sidecar)
`services/nlp/domain_model.py` trains a career-direction classifier (TF-IDF 1-2 grams + logistic regression over the 28 Career AIsle paths). There is no labeled resume dataset, so training is weakly supervised: synthetic resume-like documents are sampled from each path's topics, projects and descriptions (skills lists, sentences, noise from other paths). Be careful reading the held-out numbers in `/v1/model` (about 100% top-1): that hold-out comes from the same generator, so it checks the model learned the corpus, not real-world accuracy. Real resumes will score lower, which is why the result is shown as a second opinion next to the rule-based direction and never replaces it.

Persistence: models are versioned files (`domain-vN.joblib` + metadata) behind an atomically-swapped `CURRENT` pointer in `MODEL_DIR` (mount a Railway Volume at `/models`); a restart loads the saved model in milliseconds and retrains only if the corpus changed or the file is corrupt. The last 3 versions are kept. `POST /v1/train` (service token) persists extra labeled documents to `extra.jsonl`, retrains on corpus + every extra ever added, saves a new version and hot-swaps it. Admin: `GET /api/admin/ml` (status, versions) and `POST /api/admin/ml/retrain`. After changing `src/data/careerRoadmaps.js` run `node scripts/export-domains.mjs` (a test fails if the exported corpus is stale).

### Fusion: rules + ML + LLM concluding together (`src/ai/fusion.js`)
```mermaid
flowchart LR
  R[Rules<br/>skill coverage, job matches, resume score] --> E[Evidence]
  M[Python ML<br/>path probabilities, text relevance, shared/missing terms] --> E
  E -->|instant| D[Deterministic verdict<br/>agree / partial / disagree]
  E -->|queued task| L[LLM provider<br/>reconciles, explains disagreements]
  L -->|validated| V[(Stored verdict)]
  D --> V
```
After a resume upload the student gets a deterministic verdict immediately (rules decide, ML corroborates or flags disagreement). If an AI provider is configured and the daily quota allows, a background task sends the whole evidence, including the ML output, to the provider, which concludes. The reply is schema-validated and may only pick a direction and jobs that appear in the evidence; anything else is rejected and the deterministic verdict stays (`llmSkipped` says why). The setup page shows the result with its sources ("rules + ML model + AI (nvidia)"); `POST /api/career/verdict` re-runs it. Unchanged evidence is not re-sent (hash), so it doesn't spend quota twice.


## The visual system ("Prism")

`public/css/lanturn.css` is one file in layers, each appended after the previous one and each allowed to override it:

1. tokens / glass base, 2. components, 3. app layout, 4. motion (`fx`), 5. roadmap, 6. the "studio" reskin,
7. a landing/spotlight pass, 8. **Prism** (the last ~1400 lines): deep-graphite canvas with an aurora wash, layered
   surfaces with a gradient hairline, indigo→violet accent for action and cyan for data, Space Grotesk display type,
   and a light theme built from its own token block.

Rules for extending it: add rules at the end of the file, never inline styles; take every colour from a token so the
light theme keeps working; keep motion behind `prefers-reduced-motion`; and never rename a class — the e2e suite in
`e2e/app.e2e.test.js` selects on `.lp-hero h1`, `.tabbar`, `.chart__col`, `.rm-drawer`, `.rating__star.is-on` and
friends. Interactions that need JavaScript live in `public/js/polish.js` (ripple, sticky header, magnetic CTAs, chart
tooltips, reveal stagger) and degrade to nothing without a fine pointer. `public/design-system.html` renders the same
components for a visual check.

## The engagement layer (inbox, alerts, reply time)

Both sides of a hiring pipeline previously met inside a single application page: a message existed only there, and a
student had to open every application to find out that an employer had written back. Three additions close that gap
without adding infrastructure:

- **One inbox over the existing threads** (`src/routes/engagement.js`, `public/js/views/messages.js`). No second
  messaging stack: `application_messages` stays the only message table, and `message_reads` adds one row per
  (user, application) holding the highest message id that person has seen. Unread is then a single indexed
  comparison, and "opening a thread" is what marks it read - including on the student's own application card, which
  uses the same component.
- **Saved searches with alerts** (`saved_searches`, task `alerts.saved_search`). A filter set plus a minimum match
  score; on every new job the task evaluates each subscription against the cached job bundle and notifies only the
  people whose threshold it clears. Idempotent through the `(type, link)` pair already in `notifications`, so a
  retried task never double-alerts.
- **Reply-time statistics** (`src/replyStats.js`). Median and p90 hours from a candidate's first message to the
  employer's first reply, computed from the threads that already exist. Students see it on their application
  ("Usually replies in about 3 h"); employers see it on the dashboard, because a number candidates can see belongs
  where it can be improved.

Interviews are part of the conversation: `GET /applications/:id/messages` interleaves scheduled and cancelled
interviews as `SYSTEM` entries, so "when was I invited, and did they cancel?" is answered in the thread.

The browser cannot open an `EventSource` with an `Authorization` header, and the refresh cookie is deliberately scoped
to `/api/auth`. So `POST /api/realtime/ticket` trades a bearer token for a **single-use, 60-second** ticket that opens
only `/api/realtime/stream`. The client re-tickets after any drop rather than reconnecting with a dead ticket, and a
45-second poll keeps the inbox honest if the stream is blocked entirely.

## Why there are two frontends

`public/` is the shipped client: vanilla ES modules, one CSS file, no build step, and the only client the
route-inventory test, the e2e suite and the deployment docs describe. `frontend/` is an unfinished React
rewrite (Tailwind, TanStack Query, i18n, PWA) that is **off by default**; `USE_REACT=true` makes Express serve
its `dist/` instead, and its dev server proxies `/api` to the Express app.

The split is real and worth knowing: Networking, Interview Studio and parts of the employer pipeline exist
only in React, while the roadmap, career map, admin system view and settings exist only in `public/`. Do not
assume a screen exists in the UI you are running. The plan is to finish React feature-by-feature and delete
the older screen each time, not to keep both forever. `src/routes/compat.js` exists because the React client
was written against a slightly different REST shape (signed uploads, `/auth/session`, provider-style job
search); it is the seam that keeps both clients working against one backend.
