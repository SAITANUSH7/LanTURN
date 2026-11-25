# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Instead, use GitHub's private
["Report a vulnerability"](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
advisory form on this repository, or email the maintainer listed on the GitHub profile.

Include: what you did, what happened, what you expected, and the smallest reproduction you have
(URL, request, account role). We aim to reply within 5 working days.

## Supported versions

Only the current `main` branch is supported. There are no maintained release branches.

## What the app already does (so you can aim past it)

- **Auth**: short-lived HS256 access tokens (15 min) carrying a `token_version`, refresh tokens in
  an `HttpOnly`/`SameSite=Strict` cookie, rotation with replay detection (a 60 s grace window for
  doubled requests), per-account and per-IP login throttling, password reset with single-use hashed
  tokens, and forced sign-out on disable / password change / role change.
- **Authorization**: role guards plus ownership checks on every row-scoped route
  (`test/security.test.js` enumerates every route and fails if one answers 2xx/404 without a token).
  Admin actions are audited to `audit_log` and readable at `GET /api/admin/audit`.
- **Uploads**: every stored file has an owner and a kind; resumes and certificates are private
  (owner session or a short-lived HMAC-signed URL), images are sniffed against their signed MIME
  type, and orphaned files are swept daily.
- **Input**: Zod schemas with `.strict()` everywhere, parameterised SQL only, XSS-safe DOM helper
  in the client, CSP without inline *script*.
- **Secrets**: AI vendor keys are encrypted at rest (AES-256-GCM, scrypt-derived key, optional
  dedicated `AI_VAULT_SECRET`); JWT secrets are generated and persisted with `0600` when absent in
  production; a default admin password or `SEED_DEMO=true` prints a large warning banner at boot, and
  `STRICT_BOOT=1` turns those warnings into a refused start (our upgrade path never crash-loops a live host).
- **Abuse**: layered rate limits, a per-feature AI quota that is only spent when a model actually
  runs, and `TRUST_PROXY` configured explicitly so `X-Forwarded-For` cannot be spoofed.

## Known limitations (please do not report these as new)

- SQLite is single-writer: a determined attacker can still slow the app, not just break it.
- The optional Python NLP sidecar and C++ addon are not fuzzed.
- The React frontend in `frontend/` is unfinished and not the shipped UI; it is not covered by the
  route-inventory test.
- Rate limits are in-process, so they are per instance, not global across a cluster.

## Deployment hardening checklist

1. `ADMIN_PASSWORD` set to something long and unique; `SEED_DEMO=false`.
2. `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `AI_VAULT_SECRET` set, each 48+ random characters.
3. `TRUST_PROXY` equal to the real number of proxy hops (or `false` when directly exposed).
4. HTTPS everywhere (cookies are `Secure` in production).
5. Backups copied off the volume, and a restore actually tested once.
