# LanTURN — AI-powered career and placement platform

Full-stack web app: Node.js + Express + SQLite backend, vanilla-JS.
## Windows one-click
Double-click **`launch.bat`**. It checks/installs Node 22.5+ (via winget), installs dependencies, creates `.env` with fresh random secrets, picks a free port, starts the server, opens your browser and prints a LAN URL for phones on the same Wi-Fi. `launch.bat reset` wipes local data first.

## Quick start
Requires **Node 22.5+** (uses the built-in `node:sqlite`).

```bash
npm install
cp .env.example .env     # optional, defaults work
npm start                # http://localhost:3000
npm test                 # 10 API tests, real HTTP, in-memory DB
```

Demo logins (seeded when `SEED_DEMO=true`):

| Role | Email | Password |
|---|---|---|
| Student | student.one@example.test | Demo@12345 |
| Employer (verified) | hr@examplecorp.test | Demo@12345 |
| Employer (pending) | new@pendingco.test | Demo@12345 |
| Admin | admin@lanturn.local | Admin@12345 |

Design system (live style guide): `/design-system.html`.

## AI
Runs on a deterministic rules engine by default (resume score, skill gap, job match, roadmaps). Set `ANTHROPIC_API_KEY` and `LLM_MODEL` in `.env` to let an LLM write the resume review and roadmap text; scores and gaps stay rule-based. Per-user daily quota: `AI_DAILY_QUOTA`.

## Deploy
See `docs/DEPLOY.md` (GitHub, Render, Railway).

## Notes
- Fonts (Space Grotesk, Inter, Noto Sans JP) load from Google Fonts.
- Data lives in `data/` (SQLite + private resume files). Deploy on a host with a persistent disk, or swap the DB/storage layer for Postgres + object storage.
- Change `JWT_*` secrets before any non-local use (enforced in production).

## AI providers, new features and PWA

See [docs/AI.md](docs/AI.md). In short: copy `.env.example` to `.env`, add any provider key(s)
(DeepSeek, Kimi, NVIDIA NIM, OpenCode Zen, Gemini, Groq, OpenRouter, OpenAI, Anthropic, or a custom OpenAI-compatible URL).
With no keys everything still works on the rules engine. Student pages: Career DNA, Skill Arena, Career Coach, Notifications.
Employer pages: AI Assistant, Company DNA, job-description writer, applicant Kanban board. The UI has English, Hindi and
Telugu for navigation and the new pages, and installs as a PWA (manifest + service worker; API calls are never cached).
