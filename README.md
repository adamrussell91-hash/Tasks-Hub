# Tasks Hub

Personal task and project manager (Clare DeMind), sibling to Teaching Hub, Life Hub, and Knowledge Hub.

**Spec:** [`docs/specs/task-project-manager-hub-spec.md`](docs/specs/task-project-manager-hub-spec.md)  
**Decisions:** [`docs/DECISIONS.md`](docs/DECISIONS.md)  
**Design kit:** [`design-kit/AGENTS.md`](design-kit/AGENTS.md) + [`design-kit/TASKS.md`](design-kit/TASKS.md) — canonical kit on `main`, Board home, Graph rail.

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
| Seed | `fixtures/seed.json` (frameworks, Ethics Olympiad / Da Vinci templates, MindWorks demo) |

> Infra note: ChatGPT looked at empty `main`. The scaffold lives on branch `cursor/tasks-hub-foundation-77da` / PR #1 — merge (or deploy that branch) before Netlify Blob seeding.

## Build sequence status

1. Data model + Blobs scaffolding — done
2. Shared CRUD service (UI + future Clare) — done
3. Board home + Graph + day/week/month/list/search/templates — done (first cut)
4–10. Gantt through StressFlags — see open PRs
11. Corey-facing capacity view — done
12. Review + closure loop (baseline vs current) — done

Stretch: orbit / branch / constellation — later

## Auth secrets

```bash
npm run generate:auth
```

Netlify already has SHA-256 of `tasks-hub-local` (Knowledge convention). The API accepts that or Teaching-style scrypt. Also set `SITE_ORIGIN=https://tasks-hub.adam-russell.com`.
