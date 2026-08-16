# Tasks Hub

Personal task and project manager (Clare DeMind), sibling to Teaching Hub, Life Hub, and Knowledge Hub.

**Spec:** [`docs/specs/task-project-manager-hub-spec.md`](docs/specs/task-project-manager-hub-spec.md)  
**Decisions:** [`docs/DECISIONS.md`](docs/DECISIONS.md)  
**Design kit:** [`design-kit/AGENTS.md`](design-kit/AGENTS.md) + [`design-kit/TASKS.md`](design-kit/TASKS.md) — canonical kit on `main`, Board home, Graph rail.  
**Cloud agent notes:** [`AGENTS.md`](AGENTS.md)

## Stack

- Vite + TypeScript (vanilla DOM, no React)
- GitHub Pages — static shell (`dist/`)
- Netlify Functions + Blobs — auth + `tasks-hub-content` store (site `artasks-hub`)
- Cotton Glass tokens via vendored `design-kit/` (Teaching density group)

| Surface | Hostname |
|---------|----------|
| App | `https://tasks-hub.adam-russell.com` |
| API | `https://tasks-api.adam-russell.com` |

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5175](http://localhost:5175).

| | |
|---|---|
| Local passphrase | `tasks-hub-local` |
| Seed | `fixtures/seed.json` (frameworks, Ethics Olympiad / Da Vinci templates, MindWorks + demo tasks) |

Mock API seeds automatically. Production Blobs seed on first authenticated Functions request (`meta/seeded`), or manually:

```bash
NETLIFY_SITE_ID=… NETLIFY_AUTH_TOKEN=… npm run seed:blobs
# FORCE_SEED=1 … to clear the marker and re-apply seed indexes
```

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

Netlify already has SHA-256 of `tasks-hub-local` (Knowledge convention). The API accepts that or Teaching-style scrypt. Also set `SITE_ORIGIN=https://tasks-hub.adam-russell.com`.
