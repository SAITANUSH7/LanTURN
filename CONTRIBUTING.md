# Contributing to LanTURN

Small, focused pull requests. One concern per PR, with a test that fails before your change.

## Setup

```bash
git clone https://github.com/SAITANUSH7/LanTURN.git
cd LanTURN
npm install                 # the shipped UI in public/ needs no build
cp .env.example .env
npm run seed                # demo data (SEED_DEMO=true), or leave it off for an empty DB
npm run dev                 # http://localhost:3000
```

Optional extras: `npm run build:native` (C++ matcher/search core), `services/nlp` (Python sidecar),
`e2e/` (needs `npx playwright install chromium`).

## Before you open a PR

```bash
npm run lint                # ESLint, flat config
npm test                    # must be green: 138 tests, 7 skipped without the native engine
npm run e2e                 # if you touched public/ — every selector in e2e/ is a contract
```

## House rules this codebase actually follows

- **ESM only, Node 22.5+**, `node:sqlite` (synchronous). No TypeScript, no bundler for `public/`.
- **Validate at the edge** with a `.strict()` Zod schema in the route, then use the parsed object.
- **Every route is guarded**: `authenticate` / `requireRole` / ownership check, and it must appear in
  `test/security.test.js`'s inventory with a 401/403 when anonymous.
- **SQL is parameterised**, always. New tables/columns go in a numbered migration in `src/db.js`
  (`schema_migrations`), not a bare `CREATE TABLE`.
- **Show your work in the response envelope**: `{ items }` lists, `{ error: { code, message } }`
  failures, no stack traces, no internal ids — and never another user's email.
- **The rules engine is the floor, not the fallback**: any AI feature must work with zero API keys,
  and must not spend a quota ticket when a model was not actually called.
- **Motion is optional**: every animation respects `prefers-reduced-motion`, and no layout may
  depend on JavaScript-only styling.
- **Comments explain *why***. If a line is surprising, say what breaks without it.

## UI work

The shipped client is `public/` (vanilla ES modules, one `css/lanturn.css`). Keep the existing
structure: `views/*.js` export a `render()`; shared pieces live in `js/ui.js`; the router and shell
live in `js/main.js`. Do not add a bundler step.

## Reporting bugs

Open an issue with: what you did, what you expected, what happened, browser/Node version, and
whether AI keys were configured (it changes the code path). Security issues: see `SECURITY.md`.
