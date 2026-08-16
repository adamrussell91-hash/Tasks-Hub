# Tasks Hub — chrome & surfaces brief

Read `AGENTS.md` first. This file is **chrome + surfaces only**, not the data model (see `docs/specs/task-project-manager-hub-spec.md`).

## Hub identity

- Set `html[data-hub="tasks"]`.
- **Teaching clone** for glass, tiles, and the labeled navy rail (not Life’s icon rail, not Knowledge’s narrow rail).
- `overlays.css` must group `teaching` and `tasks` on the same density tokens so they cannot drift.
- No new palette. No viz package lives in the kit — borrow from siblings in app code.

## Primary surfaces

| Surface | Role |
|---------|------|
| **Board** | Home. Status columns over the shared Task store. |
| **Graph** | Rail page. Two modes: **blockers** (`depends_on`) and **workstreams** (project / parent links). |
| Day / Week / Month / List / Search / Templates | Supporting views over the same data. |

## Borrow, don’t reinvent

- **Knowledge Hub** — force graph interaction: search, select, preview (`src/archive/forceGraph.ts` pattern).
- **Life Hub** — `chart-kit` first cuts only when a board/project surface needs ring, columns, or area-line. Do not vendor a new chart library into the kit.

## Out of scope for the kit

- Icon-only rail
- New colour tokens
- Orbit / constellation stretch visuals (app phase later)
- Embedding d3 or chart code inside `design-kit/`
