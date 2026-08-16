# Tasks Hub — locked decisions (from sibling hubs + build brief)

Answers to Open Questions in `docs/specs/task-project-manager-hub-spec.md`.

## Persistence

**Netlify Blobs JSON store** named `tasks-hub-content`, same pattern as Teaching Hub (`teaching-hub-content`).

- Life Hub’s GitHub Markdown commits are too slow/conflict-prone for high-write task trees.
- Knowledge Hub’s GitHub/R2 store is read-mostly archive, not a task DB.
- Optional later: scheduled GitHub backup snapshots (Teaching pattern), not write-through GitHub.

## Cross-hub communication

**Server-side HTTP + shared-secret headers** (Knowledge ↔ Teaching pattern). No webhooks exist in the sibling family today.

- Browser never holds cross-hub secrets.
- Session cookies stay hub-local (`tasks_hub_session`).
- Planned secret: `TASKS_HUB_SHARED_SECRET` for machine callers (Teaching/Life/Clare tools) once those call sites exist.
- StressFlag routing (step 10) will write Blobs records and optionally POST to Life Hub when that API exists — not invented here.

## Hosting

| Surface | Host | Hostname |
|---------|------|----------|
| Static SPA | GitHub Pages | `tasks-hub.adam-russell.com` |
| API | Netlify Functions | `tasks-api.adam-russell.com` (site `artasks-hub`, temp `https://artasks-hub.netlify.app`) |

Netlify env (already bootstrapped): `TASKS_HUB_PASSPHRASE_HASH` (SHA-256 of `tasks-hub-local`, Knowledge convention), `SESSION_SECRET`, `SITE_ORIGIN=https://tasks-hub.adam-russell.com`. Auth verifier accepts **both** SHA-256 hex and Teaching-style `scrypt$v1$…`. Blob seed still pending first Functions deploy of this branch.

AI chat: Anthropic via Netlify Functions (Teaching pattern). Spec’s `jade-melomakarona` openai-proxy is **not** present in sibling repos; do not hard-depend on it. Optional OpenAI key only if a later feature needs embeddings/completions.

## Chrome (design-kit)

Canonical copy on `main` (`3d8668f`). Load: Inter → `css/tokens.css` → `overlays.css` → `chrome.css` → `sign-in.css` → hub CSS.

- `html[data-hub="tasks"]` — Teaching clone. See `design-kit/TASKS.md`.
- Board home; Graph rail (blockers / workstreams).
- Page header: eyebrow → title → supporting → actions.
- Sign-in from `snippets/sign-in.html`.

## Framework Library seed

Ship seed JSON in `fixtures/seed.json` (Eat the Frog, timeboxing, Eisenhower). Editable via Templates UI later.

## StressFlag routing timing

**Write-on-create** into Blobs (`stress_flags/:id` + inbox). Hammond/Penelope/Vera consumers poll or fetch later — no sync fan-out until Life Hub exposes an authenticated inbox.

## Reminders

**In-app first** (due-soon strip on Day/Week views). Push/email deferred.
