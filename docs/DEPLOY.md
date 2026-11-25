# Deploying LanTURN (GitHub + Render or Railway)

LanTURN keeps a SQLite database and resume PDFs on disk, so it needs a host with a **persistent disk/volume**. Vercel's serverless functions cannot do that (use Render or Railway; to use Vercel you would first move to Postgres + blob storage).

## 1. Push to GitHub
If the folder already has a `.git` and an `origin`, skip to step 2 — this repository is already initialised.
```bash
git remote -v               # check what is already configured
git add . && git commit -m "your change"
# create an empty repo on github.com (no README), then:
git remote add origin https://github.com/<you>/lanturn.git
git push -u origin main
```
`.env` and `data/` are git-ignored, so no secrets or databases are uploaded.

## 2a. Render (Blueprint)
1. render.com > New > **Blueprint** > select the repo (it reads `render.yaml`).
2. Enter `ADMIN_PASSWORD` when asked (choose a strong one). Optionally `ANTHROPIC_API_KEY` + `LLM_MODEL`.
3. Deploy. The persistent disk requires the **Starter** plan; on Free the data resets on each deploy.
4. Open the `.onrender.com` URL and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## 2b. Railway
1. railway.app > New Project > Deploy from GitHub repo (uses the `Dockerfile`).
2. Service > **Volumes** > add a volume mounted at `/data`.
3. Variables: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (long random strings), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SEED_DEMO=false`. Optional: `ANTHROPIC_API_KEY`, `LLM_MODEL`.
4. Settings > Networking > **Generate Domain**.

## Quick test deployment (free, throw-away data)
To try everything online first: in `render.yaml` change `plan: starter` to `plan: free` and delete the `disk:` block plus the
`DB_FILE` and `UPLOAD_DIR` entries, set `SEED_DEMO` to `"true"`, deploy, then add `NVIDIA_API_KEY` under Environment.
Data resets on every deploy and the service sleeps when idle. Switch back to Starter + disk for real use.

## Notes
- If the JWT secrets are not set in production, the app generates strong ones and saves them next to the database (warning in the log). Setting them yourself is still better; generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
- Set `SEED_DEMO=true` only for a demo deployment; demo accounts use a known password.
- Cookies are `Secure` in production, so use the HTTPS URL the host gives you.
- `GET /api/health` reports the deployed commit (`build`) when the host exposes `RAILWAY_GIT_COMMIT_SHA` / `RENDER_GIT_COMMIT` / `GIT_COMMIT` — the fastest way to answer "is the thing I am looking at the thing I pushed?".
- CSS and JS are served `max-age=0, must-revalidate`: a deploy is visible on the next page load, and unchanged files still cost only a 304. Never "fix" this with a long max-age — the filenames carry no content hash, so browsers would keep the previous design for as long as it lasts.
- Security warnings are **warnings, not crashes**: a default `ADMIN_PASSWORD` or `SEED_DEMO=true` prints a large banner at boot and the server keeps serving. That is deliberate — an upgrade must not crash-loop a running host. Set `STRICT_BOOT=1` once the environment is clean (or in CI) to make them fatal.
- `TRUST_PROXY` defaults to `1` in production. Set it to the number of proxy hops in front of the app (Render/Railway = 1, Cloudflare in front = 2) or to `false` when nothing sits in front, otherwise `X-Forwarded-For` can be spoofed to dodge rate limits.
- The shipped UI is `public/` and needs no build step. Only if you set `USE_REACT=true` do you need `cd frontend && npm ci && npm run build` first — and the Dockerfile does not do that for you.
- Back up the volume (`lanturn.db` and `uploads/`) before changing plans or regions.

## Railway: demo logins not working?
The demo student and employer accounts (`student.one@example.test`, `hr@examplecorp.test`, password `Demo@12345`) only exist when the variable `SEED_DEMO=true` is set. Without it only the admin account exists and those logins return "incorrect". Add `SEED_DEMO=true` under Variables, let Railway redeploy, then sign in. Remove it again (or set `false`) before real users arrive, because the demo password is public. Real users can always create accounts with Create an account.

## Live jobs (optional)

The student Jobs page can also show real postings from a job board. Add these Railway variables (get free keys from adzuna.com/developer or jooble.org/api/about):

| Variable | Value |
|---|---|
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | Adzuna credentials |
| `ADZUNA_COUNTRY` | `in` (default) |
| `JOOBLE_API_KEY` | Jooble key |

Without them, the live search falls back to jobs posted by employers on LanTURN. Jobs posted by a verified HR account appear for every student straight away.

## Auto-setup

After a student uploads a resume, LanTURN fills the profile, adds skills, picks a direction, builds the roadmap and matches jobs. No AI quota is used. `student.three@example.test` is seeded blank on purpose (needs `SEED_DEMO=true`).

## Email (optional)
Set `EMAIL_API_KEY`, `EMAIL_FROM` (a sender you have verified with the provider) and `PUBLIC_URL` (your site address, used in email links).
The default API is Resend-compatible; override with `EMAIL_API_URL`. Without these, nothing is sent and the settings toggle is hidden.
Emails go through the durable queue (retries with backoff), cover status changes, new applications, strong matches, job closures and job alerts (max 3 a day per student), and include an unsubscribe link. Not tested against a live provider.

## Monitoring and backups (all optional)
- `SENTRY_DSN`: server errors (5xx, unhandled rejections) are sent to Sentry through its HTTP envelope API. Written without the SDK and only unit-tested against a fake endpoint, so confirm one real event arrives after you set it.
- `ALERT_WEBHOOK_URL`: Slack or Discord compatible webhook. Alerts on server errors, tasks that failed permanently, a queue more than 5 minutes behind, an open provider circuit and failed backups. Each kind is rate-limited so an outage is one message.
- `UPTIME_PING_URL`: a healthchecks.io style URL pinged every 5 minutes while the app is healthy. Set the service to alert you when pings stop; that catches a crashed or frozen process that cannot alert for itself.
- Backups: a consistent SQLite snapshot daily into `BACKUP_DIR` (default `backups/` next to the database, so it lands on your `/data` volume), newest `BACKUP_KEEP` (default 7) kept. Admin, System page: list and "Back up now". Copy one off-site regularly; a backup on the same volume does not survive losing the volume.
- Database: still SQLite. Moving to Postgres is a rewrite, not a switch, because every query uses the synchronous `node:sqlite` API. If you outgrow one instance, the path is: put queries behind an async repository layer, port the schema, then migrate data.

## Railway variables
**Web service (required):** `NODE_ENV=production`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (each 48+ random characters), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (strong), `PUBLIC_URL` (your Railway URL). Attach a Volume at `/data` and set `DB_FILE=/data/lanturn.db`, `UPLOAD_DIR=/data/uploads`.
**Web service (recommended):** `SEED_DEMO=false`, `ALLOWED_STUDENT_EMAIL_DOMAINS` (if students must use college email), `COLLEGE_NAME`.
**AI (any one is enough, add more for fallback):** `NVIDIA_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `MISTRAL_API_KEY`, `GITHUB_MODELS_TOKEN`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`; optional `AI_PRIORITY` (comma list, e.g. `nvidia,groq,cerebras`), `AI_DAILY_QUOTA`.
**ML service:** deploy `services/nlp` as a second service with a Volume at `/models`, set `NLP_SERVICE_TOKEN` there and on the web service, and `NLP_SERVICE_URL` on the web service (use the private `*.railway.internal` address).
**Optional:** `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `ADZUNA_COUNTRY`, `JOOBLE_API_KEY` (job feeds); `EMAIL_API_KEY`, `EMAIL_FROM`; `SENTRY_DSN`, `ALERT_WEBHOOK_URL`, `UPTIME_PING_URL`; `BACKUP_KEEP`.
Never set `DISABLE_RATE_LIMIT` in production.
