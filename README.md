# Tasks Hub

Personal task and project manager (Clare DeMind), sibling to Teaching Hub, Life Hub, and Knowledge Hub.

**Spec:** [`docs/specs/task-project-manager-hub-spec.md`](docs/specs/task-project-manager-hub-spec.md)  
**Decisions:** [`docs/DECISIONS.md`](docs/DECISIONS.md)  
**Design kit:** [`design-kit/AGENTS.md`](design-kit/AGENTS.md) — `html[data-hub="tasks"]`, start from `design-kit/snippets/shell.html`

## Stack

- Vite + TypeScript (vanilla DOM, no React)
- GitHub Pages — static shell (`dist/`)
- Netlify Functions + Blobs — auth + `tasks-hub-content` store
- Cotton Glass tokens via vendored `design-kit/`

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
| Seed | `fixtures/seed.json` (frameworks, Ethics Olympiad / Da Vinci templates, MindWorks demo) |

## Build sequence status

1. Data model + Blobs scaffolding — done
2. Shared CRUD service (UI + future Clare) — done
3. Day / week / month / list / search + templates — done (first cut)
4. Dependencies + Kanban / Gantt — next
5. Excursion engine — next
6–12. Clare negotiation, pinch points, stalled projects, StressFlags, Corey view, review loop — later

## Auth secrets

```bash
npm run generate:auth
```

Set `TASKS_HUB_PASSPHRASE_HASH`, `SESSION_SECRET`, and `SITE_ORIGIN=https://tasks-hub.adam-russell.com` on the Netlify site.
