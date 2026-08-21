# Tasks Hub — ChatGPT Live redeploy

**How to use:** copy everything below the line into ChatGPT Live. This is **not** a product QA pass. The coding agent already pushed the fixes. Production did not update because that environment cannot dispatch GitHub Actions and has no Netlify token. You have the logged-in browser. Merge, deploy, and prove the live hosts are on the new build.

---

# Prompt — ship the Tasks Hub QA fixes to production

You are a release operator with a real browser. Finish the production redeploy that the cloud coding agent could not run.

**Do not invent tokens. Do not paste secrets into chat, screenshots, or the report.** If you create a Netlify personal access token, put it only in GitHub Secrets, then close that tab.

Work until the success checks in §6 all pass, or until a specific login/permission wall stops you. Then return the report template.

## 1. Why this is blocked

The fixes live on GitHub, not on the live hosts.

| Fact | Detail |
|---|---|
| Branch | `cursor/fix-live-qa-defects-8b55` |
| PR | https://github.com/adamrussell91-hash/Tasks-Hub/pull/22 |
| Base | `main` |
| Pages app | `https://tasks-hub.adam-russell.com` — deploys from **`main` only** |
| API + should-be SPA | `https://tasks-api.adam-russell.com` — Netlify site **artasks-hub**, site id `c6696619-f478-4ac1-b0cd-1e4cfd3101df` |
| What live API shows **now** | HTML stub: “Tasks Hub API — Functions only. Static app is on GitHub Pages.” |
| What it must show after deploy | The real Tasks Hub sign-in / Board (same SPA as Pages) |
| Preview already built | https://deploy-preview-22--artasks-hub.netlify.app — Netlify preview of this PR. Use it to confirm the build, **then** promote production. |
| Cloud agent failure | `gh workflow run` → HTTP 403; no `NETLIFY_AUTH_TOKEN` in that VM |

GitHub Actions on `main`:

- **Deploy to GitHub Pages** — builds `dist` and publishes Pages.
- **Deploy Netlify Functions** — builds the same SPA and `netlify deploy --prod`, but **exits 0 without deploying** if GitHub secret `NETLIFY_AUTH_TOKEN` is missing. Do **not** trust a green Actions tick for Netlify until you read the log.

`netlify.toml` on this branch: build `npx vite build && node scripts/copy-spa-fallback.mjs`, publish `dist`, functions `netlify/functions`, SPA redirect `/* → /index.html`. Older README text that says the Netlify build is a no-op is **stale**.

## 2. Safety

- Merge **only** PR 22 (`Fix live-site QA defects from the 2026-08-21 pass`) into `main`.
- Do not force-push, do not delete `main`, do not change DNS.
- Do not rotate Corey’s share link.
- Do not change the passphrase hash unless a screen tells you auth is broken **and** you stop to report that first.
- Never write a Netlify token or GitHub secret value into the report. Say “set” or “not set”.

## 3. Step A — confirm the preview is the new app

1. Open https://deploy-preview-22--artasks-hub.netlify.app
2. You must see the Tasks Hub **Sign in** card (brand Tasks Hub, field Passphrase, button Sign in), **not** “Functions only.”
3. Sign in with `tasks-hub-local` (Enter).
4. You should land on Board (`#/board`).
5. Click **Maps**. URL `#/maps`, heading Maps / Pathways — **not** Board columns.
6. Open DevTools → Network. Reload Clare (`#/clare`). `GET /api/clare` or templates/session should be 200 JSON `{ ok: true, … }`, not a no-CORS HTML 404.

If the preview is still the stub or Maps is Board, **stop** and report: the branch build is wrong; do not merge.

## 4. Step B — merge PR 22

1. Open https://github.com/adamrussell91-hash/Tasks-Hub/pull/22
2. Confirm base `main`, head `cursor/fix-live-qa-defects-8b55`, mergeable.
3. If it is still **Draft**, click **Ready for review** (or the equivalent), then merge.
4. Merge with **Squash and merge** or **Create a merge commit** — either is fine. Confirm.
5. Wait until GitHub shows the PR **Merged**.
6. Open https://github.com/adamrussell91-hash/Tasks-Hub/actions
7. Wait for **Deploy to GitHub Pages** on `main` to go green. If it fails, open the log, copy the failing step name + last 30 lines.

Pages can take 1–2 minutes after the green job. Then:

8. Hard-reload `https://tasks-hub.adam-russell.com`
9. Sign in if needed. Click **Maps**. Must be Maps, not Board.

If Pages is green but Maps is still Board, the old Pages artifact is cached — wait one minute, hard-reload, try a private window. Still Board → report the Pages job URL and the live hash.

## 5. Step C — production Netlify (this is the real blocker)

The API host is what failed last time (`Failed to fetch` on Clare; Network/Corey hung; stub homepage).

### C1. Netlify UI (do this first — most reliable)

1. Open https://app.netlify.com/projects/artasks-hub  
   If that 404s, use https://app.netlify.com/sites/artasks-hub or search sites for **artasks-hub**.
2. Confirm the production domain includes `tasks-api.adam-russell.com`.
3. **Deploys** → trigger a **production** deploy of branch **`main`** (not the PR preview).  
   Typical path: Deploys → Trigger deploy → Deploy site, or open the latest `main` deploy → **Publish deploy** / **Retry**.
4. Open that deploy log. Build command must be `npx vite build && node scripts/copy-spa-fallback.mjs` (or the Netlify UI equivalent of the repo `netlify.toml`). Publish dir must be **`dist`**, **not** `netlify/public`.
5. Wait until status is **Published** (green).
6. If the build fails:
   - Copy the first error and the last 40 log lines.
   - If it failed because of `tsc` / `npm run build`, the new `netlify.toml` already uses Vite-only. Make sure the deploy used **`main` after the merge**, not an old commit.

### C2. GitHub Actions backup (only if C1 is impossible)

1. Repo → **Settings** → **Secrets and variables** → **Actions**.
2. If `NETLIFY_AUTH_TOKEN` is **missing**:
   - New tab: Netlify → User settings (avatar) → Applications → Personal access tokens → New access token. Name `tasks-hub-github-actions`. Copy once.
   - GitHub → New repository secret → name exactly `NETLIFY_AUTH_TOKEN` → paste → save.
   - Close the Netlify token page. **Do not** put the value in the report.
3. Optional: secret `NETLIFY_SITE_ID` = `c6696619-f478-4ac1-b0cd-1e4cfd3101df` if you want it explicit. The workflow already defaults this id.
4. **Actions** → **Deploy Netlify Functions** → **Run workflow** → branch **`main`** → Run.
5. Open the run. The “Deploy to Netlify” step must **not** say `NETLIFY_AUTH_TOKEN secret missing — skip Functions deploy`. If it skipped, C1 was not optional — go back to the Netlify UI.

## 6. Success checks (all required)

Do these on a hard-reloaded tab. Record HTTP status for each.

| Check | URL | Pass |
|---|---|---|
| API is the SPA | `https://tasks-api.adam-russell.com` | Sign-in or Board. **Fail** if body contains `Functions only` |
| Pages still the SPA | `https://tasks-hub.adam-russell.com` | Sign-in or Board |
| Maps live | both hosts `#/maps` | Pathways / Maps, not Board |
| Session | `https://tasks-api.adam-russell.com/api/session` (while signed in) | JSON `ok: true` |
| Clare | signed in, `#/clare`, Ask Clare on `[LIVE-TEST] deploy check` | Proposal, not `Failed to fetch`. Network `POST /api/clare` 200 `{ ok: true` |
| Stress | `#/stress` | Leaves “Scanning…”. Data or Retry, not infinite spinner |
| Corey | `#/corey` | Leaves “Loading capacity…” |
| Unknown hash | `#/definitely-missing` | Not-found page, not Board |

Discard the Clare confirm after you see a proposal (no need to create a task). If you did create `[LIVE-TEST] deploy check`, Delete it on the Board confirm card.

## 7. If you are blocked

Say which wall:

- Not logged into GitHub or Netlify (Adam must sign in)
- No permission to merge PR 22
- No permission to trigger Netlify production
- Cannot create a Netlify PAT / GitHub secret
- Build failed (paste log excerpt)

Do not try a second product. Do not “fix” code. This task is merge + deploy + verify only.

## 8. Report template (return exactly this)

```md
# Tasks Hub redeploy report

- Date:
- Operator: ChatGPT Live
- PR 22 merged? yes/no (merge commit SHA if yes)
- Pages workflow: URL + green/red
- Netlify production deploy: URL + published yes/no + publish dir observed
- NETLIFY_AUTH_TOKEN GitHub secret: already present / I set it / not set (no value)
- Actions Netlify job: ran and deployed / ran and skipped (no token) / not run

## Live checks
| Check | Result | Evidence (status / screenshot note) |
|---|---|---|
| tasks-api is SPA not stub | | |
| tasks-hub Board | | |
| Maps on API host | | |
| Maps on Pages | | |
| POST /api/clare | | |
| #/stress left loading | | |
| #/corey left loading | | |
| #/definitely-missing not-found | | |

## Blockers
- none, or numbered list

## What I did not do
- short list
```
