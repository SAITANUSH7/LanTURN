# LanTURN 3.0

> **AI-Powered Professional Networking, Job Discovery, Recruitment & Career Intelligence Platform**

LanTURN 3.0 is a balanced full-stack platform connecting students, colleges, and employers through skill-verified matchmaking, professional community networking, and AI-guided career roadmaps.

---

## 🏛️ Platform Architecture & The Three Pillars

```
                      ┌───────────────────────────────────────────────┐
                      │        Shipped SPA — public/ (no build)        │
                      │  vanilla ES modules, hash router, one CSS      │
                      │  design system, PWA, i18n (EN/HI/TE)           │
                      │  optional: frontend/ React app behind          │
                      │  USE_REACT=true (experimental, needs a build)  │
                      └──────────────────────┬────────────────────────┘
                                             │
                       HTTP / Cookies / SSE  │  Vite Dev Proxy (:5173 -> :3000)
                                             │  or Static SPA Serving in Prod
                                             ▼
                      ┌───────────────────────────────────────────────┐
                      │             Express API Gateway               │
                      │  (Helmet CSP, Rate Limiting, Error Envelope)  │
                      └──────┬──────────────────────┬───────────┬─────┘
                             │                      │           │
       ┌─────────────────────┴──────┐ ┌─────────────┴─────┐ ┌───┴─────────────────┐
       │   Authentication & Core    │ │   AI Intelligence │ │   Pillars & Realtime    │
       ├────────────────────────────┤ ├───────────────────┤ ├─────────────────────┤
       │ • JWT + Rotating Cookies   │ │ • Provider Failover│ │ • Networking (Feed, │
       │ • Role-Based Access Control│ │   (Gemini, Groq,  │ │   Connections, DMs) │
       │ • PDF Resume Parsing       │ │    NVIDIA, OpenAI)│ │ • Career AIsle      │
       │ • Deterministic Matching   │ │ • Career DNA Radar│ │   (40+ Domains)     │
       │ • SQLite (node:sqlite)     │ │ • Skill Arena     │ │ • Recruitment Kanban│
       │ • Strict Ownership Control │ │ • Deterministic   │ │ • Native SSE Stream │
       │                            │ │   Rules Fallback  │ │   (Heartbeat Bus)   │
       └────────────────────────────┘ └───────────────────┘ └─────────────────────┘
```

### 1. Professional Networking
- **Community Feed:** Public posts, achievement milestones, project showcases, comments, and likes.
- **Connection Graph:** Bi-directional connection requests, friend graph, pending request approvals.
- **Instant Messaging:** 1-on-1 direct message conversations with read receipts.
- **Skill Endorsements:** Peer and recruiter endorsements linked directly to verified taxonomy skills.

### 2. Job Discovery & Recruitment Pipeline
- **Verified Job Postings:** Requirement specification with skill weights (1–3), location, compensation, and deadlines.
- **Applicant Pipeline & Kanban:** Visual drag-and-drop applicant tracking across stages: `APPLIED`, `SHORTLISTED`, `INTERVIEW`, `OFFERED`, `REJECTED`.
- **Candidate Match Scoring:** Deterministic percentage matching comparing job skill requirements against student profile and resume.
- **Public Profile Inspector:** Detailed candidate profile viewing (personal, education, verified skills, medals, and Career DNA).

### 3. AI Career Intelligence & Learning Ecosystem
- **Career AIsle:** 40+ curated industry career domains (Frontend, Backend, AI/ML, DevOps, Cloud Security, etc.) with 5 progressive stages, topics, resources, and hands-on stage projects.
- **AI Resume Gap Analyzer:** Upload resume PDF to automatically detect covered vs. missing topics for any career domain and batch-sync progress.
- **Career DNA:** Multi-dimensional skill radar visualizing Technical Depth, System Design, Execution Speed, and Collaboration with archetype analysis.
- **Skill Arena:** Adaptive skill assessments earning Gold, Silver, and Bronze verification badges.
- **Career Coach:** Conversational assistant for interview preparation, elevator pitches, and custom cover letter generation.
- **Multi-Provider AI Gateway:** Automatic failover across DeepSeek, Kimi, NVIDIA NIM, Gemini, Groq, OpenRouter, OpenAI, and Anthropic with **100% deterministic rules engine fallback**.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 22.5+** or **24.x** (uses native `node:sqlite`)
- Modern web browser

### 1. Installation
```bash
# Clone repository
git clone https://github.com/SAITANUSH7/LanTURN.git
cd LanTURN

# Install dependencies (one command — the shipped UI needs no build)
npm install

# Optional, only for the experimental React frontend: cd frontend && npm ci
```

### 2. Environment Setup
```bash
cp .env.example .env
```
*(Optional)* Add any AI provider API keys in `.env` to enable LLM-generated text. Leave empty to use the built-in rules engine.

### 3. Seed Demo Data
Populates the database with realistic sample users, jobs, roadmaps, networking posts, and messages:
```bash
npm run seed
```

### 4. Running the Application

#### Option A: one process (the normal way)
Express serves the API and the shipped SPA (`public/`) from the same origin — there is no build step:
```bash
npm start          # or: npm run dev  (same, with --watch)
```
Open **`http://localhost:3000`**. Sign in with the admin account from `.env`, or with a demo account if `SEED_DEMO=true`.

#### Option B: the experimental React frontend (`frontend/`, off by default)
It is a partly finished rewrite: several screens exist only there, several only in `public/`. To look at it:
```bash
cd frontend && npm ci && npm run dev     # http://localhost:5173, proxies /api to :3000
```
To *serve* it instead of the shipped UI, build it and set `USE_REACT=true` (see `docs/ARCHITECTURE.md`).
Open **`http://localhost:5173`** in your browser.

---

## 🔑 Demo Accounts

When seeded (`npm run seed`), the following accounts are ready to use:

| Role | Email | Password | Features Accessible |
|---|---|---|---|
| **Admin** | `admin@lanturn.local` | `Admin@12345` | AI Provider Keys, Employer Verification, Platform Metrics |
| **Verified Employer** | `hr@examplecorp.test` | `Demo@12345` | Job Postings, Applicant Kanban, Candidate Inspection, AI Hiring Assistant |
| **Verified Student** | `student.one@example.test` | `Demo@12345` | Career DNA, Career AIsle, Skill Arena, Networking, Job Search |
| **Verified Student** | `student.two@example.test` | `Demo@12345` | AI/ML Specialist Profile, Enrolled Roadmaps |
| **Verified Student** | `student.three@example.test` | `Demo@12345` | Frontend Developer Profile, Feed Posts |

---

## 🐳 Docker Deployment

LanTURN 3.0 includes a multi-stage Docker build producing a lean, production-ready container:

```bash
# Build and run with Docker Compose
docker compose up -d
```

Access the app at `http://localhost:3000`. SQLite data and uploaded resumes persist in the `lanturn_data` Docker volume.

---

## 🧪 Testing & Verification

LanTURN 3.0 includes a comprehensive automated test suite executed with Node's native test runner (`node:test`):

```bash
npm test
```

### Complete Test Coverage Overview (138 tests: 131 pass, 7 skipped without the optional C++ engine):
1. **`test/api.test.js`**: Core authentication, JWT rotation, reuse detection, RBAC, ownership boundaries, upload validation, prompt-injection defense, quota limits, and professional networking.
2. **`test/ai.test.js`**: AI multi-provider fallback chain, JSON extraction, rules engine equivalence, and web UI encrypted key configuration.
3. **`test/spa.test.js`**: Express SPA static hosting, HTML5 history routing fallback, and API endpoint preservation.
4. **`test/phase3.test.js`**: Career AIsle 40+ domain catalog, enrollment, progress tracking, batch topic sync, candidate recruitment pipeline, and native SSE stream.
5. **`test/phase4.test.js`**: PWA service worker, web manifest validation, full demo seeding engine, and multilingual i18n translation coverage across English, Hindi, and Telugu.
6. **`test/phase6.test.js`**: Interactive Mock Interview Studio (system design, coding, behavioral questions), answer submission with STAR evaluation, candidate recommendations, and placement analytics.
7. **`test/phase7.test.js`**: Admin platform operations (summary KPIs, job moderation, job verification, user lifecycle management), campus leaderboard, and Skill Arena 2.0 with proctoring telemetry.
8. **`test/phase8.test.js`**: Student job bookmarks/saved jobs, resume ATS keyword scanner & tailoring assistant, and campus placement drives with student registrations.
9. **`test/phase9.test.js`**: 17-table demo seeder validation, public platform transparency metrics (`GET /api/platform/stats`), and admin AI diagnostics & model telemetry.
10. **`test/hardening.test.js`**: the security contract — a disabled account is really locked out, lockout cannot be used to freeze someone out, reset/export/delete work, role changes leave a usable account, uploads belong to their owner, feeds carry no email addresses, drives have a lifecycle.
11. **`test/security.test.js`**: every API route is enumerated and must answer 401/403 without a token (404 no longer counts as "protected").
12. **`test/config.test.js`**: production boot fails on a default admin password or `SEED_DEMO=true`.
13. **`e2e/app.e2e.test.js`**: Playwright journeys (landing, sign-in, student, roadmap, employer, RBAC, phone layout, axe accessibility). Run with `npm run e2e` after `npx playwright install chromium`.

---

## 🌍 Multilingual (i18n) & PWA

- **Languages:** English (`en`), Hindi (`hi` — हिन्दी), and Telugu (`te` — తెలుగు). Change language seamlessly anytime from the profile/navbar menu.
- **PWA Installation:** Installable on desktop and mobile as a standalone Progressive Web App with offline service worker precaching (105 assets precached).

---

## 🏛️ LanTURN 3.0 Architectural Summary

```
                       LanTURN 3.0 Full-Stack Architecture
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                             Frontend Layer                                  │
 │   React 18 + Vite SPA  •  TailwindCSS Design System  •  Lucide Icons        │
 │   TanStack Query Cache •  PWA Service Worker        •  i18n (EN/HI/TE)      │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │ (HTTP / JSON / SSE)
 ┌──────────────────────────────────────▼──────────────────────────────────────┐
 │                             Express Backend                                 │
 │   JWT + Cookie Auth    •  Helmet CSP Headers        •  Express Rate Limit   │
 │   Realtime SSE Stream  •  Zod Schema Validation     •  Single SPA Fallback  │
 ├─────────────────────────────────────────────────────────────────────────────┤
 │                               Core Routers                                  │
 │   • /api/auth          : JWT login, register, token rotation, sessions     │
 │   • /api/students      : Profiles, public portfolios, resume management     │
 │   • /api/jobs          : Search, recommended, bookmarks, applications       │
 │   • /api/drives        : Campus placement drives & student registrations    │
 │   • /api/networking    : Feed posts, comments, likes, connections, DMs      │
 │   • /api/roadmaps      : Career AIsle 40+ domains & progress tracking       │
 │   • /api/arena         : Skill assessments, medals, campus leaderboard      │
 │   • /api/interviews    : Mock Interview Studio & STAR answer scoring        │
 │   • /api/employer      : Job management, candidate recommendations, DNA     │
 │   • /api/admin         : Platform KPIs, job verification, user moderation   │
 │   • /api/platform/stats: Public campus metrics & transparency data          │
 ├─────────────────────────────────────────────────────────────────────────────┤
 │                               Service Engine                                │
 │   • AI Gateway (Multi-provider LLM + Deterministic Scoring Fallback)        │
 │   • ATS Keyword Resume Scanner & Tailor                                     │
 │   • Placement Drive Scheduler & Event Manager                               │
 ├─────────────────────────────────────────────────────────────────────────────┤
 │                               Storage Layer                                 │
 │   • SQLite 3 (node:sqlite) in WAL mode across 17 structured tables          │
 │   • Local secure file store for parsed PDF resumes                          │
 └─────────────────────────────────────────────────────────────────────────────┘
```

## 📄 License

Proprietary — see [`LICENSE`](LICENSE). (If the project is meant to be open source, replace that file with the
licence you want; nothing in the code depends on it.)

## 🔐 Security

Found a vulnerability? Please read [`SECURITY.md`](SECURITY.md) — report it privately, not in a public issue.

## 🤝 Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the local workflow, the coding rules this codebase follows and what a PR
needs to pass (`npm run lint`, `npm test`).

## 🎨 Design system

One CSS file, no build step: `public/css/lanturn.css`. The last layer ("Prism") defines the product look — deep
graphite canvas, layered glass surfaces, an indigo→violet action accent, a full light theme, and motion that honours
`prefers-reduced-motion`. Interactions live in `public/js/polish.js`. Open `/design-system.html` on a running instance
to see every component in one page; `docs/ARCHITECTURE.md` explains how to extend it without breaking the e2e suite.

## Platform notes
- Shipped UI: `public/` (vanilla, no build). Optional React rewrite: `frontend/` behind `USE_REACT=true`.
- `npm run lint` — ESLint (flat config, `eslint.config.js`); `npm run lint:fix` to apply.
- Optional **C++ core** (`npm run build:native`) and **Python NLP sidecar** (`services/nlp`) speed up and enrich matching; the app works without both. See `docs/ARCHITECTURE.md`.
- Health: `/api/health/ready`. Metrics (admin): `/api/admin/metrics`. Load test: `npm run bench`. Tests: `npm test`.
- In production set `ADMIN_PASSWORD` (the default is public) and keep `SEED_DEMO` off for real users. Both are reported as loud `SECURITY WARNING` banners at boot; set `STRICT_BOOT=1` to make them fatal.
