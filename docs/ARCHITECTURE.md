# LanTURN architecture

## Layers
1. **Client** — vanilla ES-module SPA (`public/`), hash router, XSS-safe `h()` DOM helper, strict CSP (no inline script/style).
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
Tokens in `public/css/tokens.css` (void/obsidian black, black #050609, white, one ice blue #6EA8FF (palette E, Bleach mono); red reserved for errors; glass, gradients, glow). Components in `components.css`, layout/pages in `app.css`. Motion: drifting blue/violet aurora orbs, scanline, ticker, morphing liquid blobs, pointer-follow glass highlight; honours reduced motion/transparency.
