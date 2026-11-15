# LanTURN 3.0

> **AI-Powered Professional Networking, Job Discovery, Recruitment & Career Intelligence Platform**

LanTURN 3.0 is a balanced full-stack platform connecting students, colleges, and employers through skill-verified matchmaking, professional community networking, and AI-guided career roadmaps.

---

## 🏛️ Platform Architecture & The Three Pillars

```
                      ┌───────────────────────────────────────────────┐
                      │             React 18 + Vite SPA               │
                      │  (Tailwind, Framer Motion, TanStack Query,    │
                      │   Recharts, Dnd-Kit, Lucide, PWA, i18n)       │
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
git clone https://github.com/maytay-aravind/LanTURN.git
cd LanTURN

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
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

#### Option A: Unified Production Mode (Recommended)
Builds the React frontend and starts Express serving both API and the SPA on port 3000:
```bash
npm run build:frontend
npm start
```
Open **`http://localhost:3000`** in your browser.

#### Option B: Development Mode (Hot Reloading)
```bash
# Terminal 1: Start Express API server (port 3000)
npm run dev

# Terminal 2: Start Vite Dev Server (port 5173, proxies /api to 3000)
cd frontend
npm run dev
```
Open **`http://localhost:5173`** in your browser.

---

## 🔑 Demo Accounts

When seeded (`npm run seed`), the following accounts are ready to use:

| Role | Email | Password | Features Accessible |
|---|---|---|---|
| **Admin** | `admin@test.local` | `Admin@12345` | AI Provider Keys, Employer Verification, Platform Metrics |
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

### Complete Test Coverage Overview (39 Tests, 0 Failures):
1. **`test/api.test.js`**: Core authentication, JWT rotation, reuse detection, RBAC, ownership boundaries, upload validation, prompt-injection defense, quota limits, and professional networking.
2. **`test/ai.test.js`**: AI multi-provider fallback chain, JSON extraction, rules engine equivalence, and web UI encrypted key configuration.
3. **`test/spa.test.js`**: Express SPA static hosting, HTML5 history routing fallback, and API endpoint preservation.
4. **`test/phase3.test.js`**: Career AIsle 40+ domain catalog, enrollment, progress tracking, batch topic sync, candidate recruitment pipeline, and native SSE stream.
5. **`test/phase4.test.js`**: PWA service worker, web manifest validation, full demo seeding engine, and multilingual i18n translation coverage across English, Hindi, and Telugu.
6. **`test/phase6.test.js`**: Interactive Mock Interview Studio (system design, coding, behavioral questions), answer submission with STAR evaluation, candidate recommendations, and placement analytics.
7. **`test/phase7.test.js`**: Admin platform operations (summary KPIs, job moderation, job verification, user lifecycle management), campus leaderboard, and Skill Arena 2.0 with proctoring telemetry.
8. **`test/phase8.test.js`**: Student job bookmarks/saved jobs, resume ATS keyword scanner & tailoring assistant, and campus placement drives with student registrations.
9. **`test/phase9.test.js`**: 17-table demo seeder validation, public platform transparency metrics (`GET /api/platform/stats`), and admin AI diagnostics & model telemetry.

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

Proprietary — Developed for LanTURN.
