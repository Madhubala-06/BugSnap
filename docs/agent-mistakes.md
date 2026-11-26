# Agent mistakes and the rule I added

BugSnap is built mostly by AI coding agents, with me reviewing and testing. When an agent gets something wrong,
I don't just fix the code: I add a rule, hook or check so the same mistake can't happen quietly again.
Each entry says what happened, how it was caught, and where the guard now lives.
CI (`scripts/check-agent-setup.mjs`) fails if an entry has no rule or points to a file that doesn't exist.

---

## 1. Slack alerts and GitHub reopen "worked" locally but never happened in production

**What happened:** Sync and Slack alerts ran as fire-and-forget background promises. Locally they finished. On Vercel
the function froze right after the HTTP response, so reopening a bug never reopened its GitHub issue and
"new bug" alerts often never reached Slack. Tests passed because they never ran on serverless.
**Caught by:** live end-to-end test (reopen in BugSnap, then check the issue state with `gh`).
**Rule added:** user-visible side effects are awaited with a short timeout before the response; only long AI jobs use
`waitUntil`. Failures are written to the bug's activity, so they're visible instead of silent.
**Where:** `AGENTS.md` (Serverless side effects), `apps/api/src/integrations/integrations.service.ts`, `.claude/agents/code-reviewer.md`

## 2. A missing env var made the Linear webhook point at localhost

**What happened:** The code fell back to `http://localhost:3001` when `BASE_URL` was unset. Production never had it,
so the Linear webhook was registered at a localhost URL, Linear rejected it, and status sync was silently off.
**Caught by:** the UI showed no "status sync on" label; creating the webhook by hand worked, which pointed at the URL.
**Rule added:** every env var the code reads must be listed in `.env.example`. CI compares the code with the example.
On its first run this check found 7 more undocumented settings, which were added.
**Where:** `scripts/check-agent-setup.mjs`, `apps/api/.env.example`, `AGENTS.md` (Hard rule 3)

## 3. Jira sync compared against a stale cached state

**What happened:** When BugSnap closed a Jira ticket, it didn't save the ticket's new status. Later the ticket was
moved back to "To Do" in Jira, which matched the stale cached value, so the refresh decided nothing had changed.
**Caught by:** a round-trip test: resolve in BugSnap, reopen in Jira, reload the bug.
**Rule added:** sync is idempotent and compares with the source of truth, not our cache. Outbound syncs store the
real resulting state.
**Where:** `AGENTS.md` (External sync is idempotent), `apps/api/src/integrations/integrations.service.ts`

## 4. A new migration sorted before an existing one

**What happened:** `prisma migrate dev` named a migration with the current timestamp, which sorted *before* a migration
named by hand with a later date. Fresh databases would apply them in the wrong order.
**Caught by:** reviewing `ls prisma/migrations` after generating.
**Rule added:** new migration folders must sort after every existing one (checked in CI on pull requests); committed
migrations can't be edited (blocked by a hook); a migration-checker sub-agent reviews schema changes.
**Where:** `scripts/check-agent-setup.mjs`, `.claude/hooks/config.json`, `.claude/agents/migration-checker.md`

## 5. A storage library pulled Node-only code into the Chrome extension

**What happened:** The upload library imports a login helper that uses `node:path` and `node:fs`. The extension build
failed, and the first fix attempts (bundler settings) didn't work.
**Caught by:** the extension build error.
**Rule added:** the extension is browser-only. The unused import is aliased to a stub, and CI builds the extension and
fails if the bundle mentions Node built-ins.
**Where:** `apps/extension/src/lib/oidc-stub.ts`, `.github/workflows/ci.yml`, `AGENTS.md` (Extension)

## 6. A package-manager command offered to delete node_modules

**What happened:** To refresh the lockfile, the agent ran `pnpm install --lockfile-only` with a different store folder.
pnpm prompted to remove and reinstall every `node_modules` folder. Nothing was lost, but it was close.
**Caught by:** checking the folders right after the prompt.
**Rule added:** installs and lockfile changes need the owner's OK (the bash hook asks first); the lockfile can't be
edited by hand.
**Where:** `.claude/hooks/config.json`, `AGENTS.md` (Hard rule 5)

## 7. Commits and deploys happened before a clear go-ahead

**What happened:** In a long session, work was committed and deployed because earlier approvals were read as covering
new work. The owner wants to approve each push and deploy.
**Caught by:** the owner.
**Rule added:** commits, pushes, merges, deploys and production env changes always ask first; force pushes and hard
resets are refused.
**Where:** `.claude/hooks/guard-bash.mjs`, `.claude/hooks/config.json`, `AGENTS.md` (Hard rule 1)

## 8. A stale sign-in error logged out a fresh sign-in

**What happened:** An old expired token's 401 response arrived after the user signed in again, and the code cleared
whatever token was saved, which was now the new one. Users bounced back to the login page.
**Caught by:** live test of the email sign-in.
**Rule added:** on 401, clear the saved token only if it is the same token the failed request used.
**Where:** `apps/web/src/lib/auth.ts`

## 9. The bug's title would have become an internal note

**What happened:** Instant replay passed a note ("Saved with instant replay ...") to the report API. The API builds the
title from the user's note when there is one, so every replayed bug would have had the same useless title.
**Caught by:** reading the API code path before testing.
**Rule added:** read the receiving code path end to end before passing a field; reviewer checks how new inputs are used.
**Where:** `.claude/agents/code-reviewer.md`, `apps/extension/src/background/index.ts`

## 10. Browser error reports were sent in a way Chrome blocks

**What happened:** The web app's crash reporter used `navigator.sendBeacon` with a JSON body. Chrome refuses
cross-origin beacons with that content type, so no browser errors would have reached the API.
**Caught by:** review before testing.
**Rule added:** client error reports use `fetch(..., { keepalive: true })`.
**Where:** `apps/web/src/components/error-reporter.tsx`

## 11. The extension only built because of a stale cache

**What happened:** To fix an icon import, the agent moved the extension icon from `assets/` to `src/assets/`. Local
builds kept passing, but only because icons generated before the move were still cached. Plasmo reads the icon from
both folders (`src/assets` for imports in code, root `assets` for the toolbar icons), so a clean build failed.
**Caught by:** the first CI run (a clean machine, no cache).
**Rule added:** keep the icon in both folders (with a note explaining why); CI builds the extension from scratch and
checks the two icon files are identical. Build checks should run on a clean checkout, not a warm cache.
**Where:** `apps/extension/assets/README.md`, `.github/workflows/ci.yml`
