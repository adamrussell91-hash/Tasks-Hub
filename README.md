# Tasks Hub

Personal task and project manager (Clare DeMind), sibling to Teaching Hub, Life Hub, and Knowledge Hub.

**Spec:** [`docs/specs/task-project-manager-hub-spec.md`](docs/specs/task-project-manager-hub-spec.md)  
**Decisions:** [`docs/DECISIONS.md`](docs/DECISIONS.md)  
**Design kit:** [`design-kit/AGENTS.md`](design-kit/AGENTS.md) + [`design-kit/TASKS.md`](design-kit/TASKS.md) — canonical kit on `main`, Board home, Graph rail.  
**Cloud agent notes:** [`AGENTS.md`](AGENTS.md)  
**Claude Code UX/UI audit:** prompt [`docs/claude-code-ux-ui-design-test.md`](docs/claude-code-ux-ui-design-test.md) · filled 2026-08-22 report [`docs/claude-code-ux-ui-design-report.md`](docs/claude-code-ux-ui-design-report.md). Functional live regression is still [`docs/chatgpt-live-regression-test.md`](docs/chatgpt-live-regression-test.md).

## Stack

- Vite + TypeScript (vanilla DOM, no React)
- GitHub Pages — static shell (`dist/`)
- Netlify Functions + Blobs — auth + `tasks-hub-content` store (site `artasks-hub`)
- Cotton Glass tokens via vendored `design-kit/` (Teaching density group)

| Surface | Hostname |
|---------|----------|
| App | `https://tasks-hub.adam-russell.com` (GitHub Pages) |
| App + API | `https://tasks-api.adam-russell.com` (Netlify — same-origin, prefer this in Safari) |

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5175](http://localhost:5175).

| | |
|---|---|
| Local + production passphrase | `tasks-hub-local` (not `teaching-hub-local`) |
| Seed | `fixtures/seed.json` (frameworks, Ethics Olympiad / Da Vinci templates, MindWorks + demo tasks) |

Mock API seeds automatically. Production Blobs seed on first authenticated Functions request (`meta/seeded`), via `POST /api/seed`, or:

```bash
NETLIFY_SITE_ID=… NETLIFY_AUTH_TOKEN=… npm run seed:blobs
# FORCE_SEED=1 … to clear the marker and re-apply seed indexes
```

### Production deploy note

GitHub Pages deploys from `main` automatically (SPA is live). **Netlify Functions** (`artasks-hub` / `tasks-api`, site id `c6696619-f478-4ac1-b0cd-1e4cfd3101df`) need a fresh production deploy of `main`.

Netlify’s build command is intentionally a no-op (API-only publish dir); a bad `npm run build` / `tsc` in `seed.mts` was what made earlier UI deploys fail with exit code 2 — that is fixed on `main`.

To redeploy:

1. **Netlify UI** — trigger a production deploy of `main` for `artasks-hub`, then sign in and `POST /api/seed` (or wait for auto-seed on first store touch), or  
2. **GitHub Actions** — add repo secret `NETLIFY_AUTH_TOKEN` (Netlify → User settings → Applications → Personal access tokens) and re-run **Deploy Netlify Functions**. Site id is already defaulted in the workflow.

Until Functions redeploy, new routes (`/api/clare`, `/api/stall`, …) 404 and the Blobs store stays empty.

## Build sequence status

| Step | Status |
|------|--------|
| 1–3 Data model, CRUD, Board/Graph + calendar views | on `main` |
| 4 Gantt + Board project filter | integrated |
| 5–6 Excursion engine + admin scheduling | integrated |
| 7 Clare negotiation + frameworks | integrated |
| 8 Pinch / shrink / due-soon | integrated |
| 9 Stalled revive / Frankenstein / bury | integrated |
| 10 StressFlag routing | integrated |
| 11–12 Corey capacity + closure loop | integrated |
| Stretch Orbit / Branch / Constellation | integrated |

## Auth secrets

```bash
npm run generate:auth
```

Netlify already has SHA-256 of `tasks-hub-local` (Knowledge convention). The API accepts that or Teaching-style scrypt. `SITE_ORIGIN` may be a comma-separated list; Pages and the Functions host are always allowed.

Safari: if `tasks-hub.adam-russell.com` still shows “Not Secure” (cached GitHub Pages cert), sign in at `https://tasks-api.adam-russell.com` instead. Session cookie is `SameSite=Lax` (same-site under `adam-russell.com`).
