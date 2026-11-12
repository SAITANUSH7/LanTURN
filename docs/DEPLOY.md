# Deploying LanTURN (GitHub + Render or Railway)

LanTURN keeps a SQLite database and resume PDFs on disk, so it needs a host with a **persistent disk/volume**. Vercel's serverless functions cannot do that (use Render or Railway; to use Vercel you would first move to Postgres + blob storage).

## 1. Push to GitHub
```bash
cd lanturn-app
git init -b main            # skip if the folder already has .git
git add . && git commit -m "LanTURN v5"
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
- Production refuses to start without real JWT secrets (generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
- Set `SEED_DEMO=true` only for a demo deployment; demo accounts use a known password.
- Cookies are `Secure` in production, so use the HTTPS URL the host gives you.
- Back up the volume (`lanturn.db` and `uploads/`) before changing plans or regions.
