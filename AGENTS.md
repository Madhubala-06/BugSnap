# AGENTS.md

Instructions for AI coding agents (Claude Code, Cursor, Codex, Copilot) working in this repo.
Humans: this is also the shortest accurate description of how the codebase works.

**BugSnap** records a bug once (screen, clicks, console, network), writes the report with AI, sends it to
GitHub, Linear, Jira or Slack, can open an AI fix PR, and verifies the fix in CI.

Before similar work, read [`docs/agent-mistakes.md`](docs/agent-mistakes.md): every entry is a real mistake and the rule it produced.

## Layout

| Path | What |
|---|---|
| `apps/api` | NestJS + Prisma (Postgres). One Vercel function (`api/index.js` → `src/server.ts`). |
| `apps/api/src/<area>` | One folder per area: `auth`, `reports`, `integrations`, `ai`, `ai-fix`, `ci`, `ops`, `plans`, `account`, `teams`, `triage`, `widget`, `mcp`. |
| `apps/api/test/*.test.cjs` | `node:test` tests. They import from `dist/`, so `npm test` builds first. |
| `apps/web` | Next.js 15 dashboard and landing page (App Router, Tailwind, Radix). |
| `apps/extension` | Chrome extension (Plasmo, MV3): popup, background, offscreen recorder, content scripts. |
| `action/` | GitHub Action "verify the fix" (`verify.mjs`, plain Node, no dependencies). |
| `apps/python-api` | Retired. Do not touch. |

## Commands

```bash
pnpm install                                   # owner runs this; agents ask first (changes the lockfile)
pnpm --filter @bugsnap/api dev                 # API on :3001 (needs apps/api/.env and local Postgres)
pnpm --filter @bugsnap/web dev                 # web on :3002
pnpm --filter @bugsnap/extension dev           # extension, load build/chrome-mv3-dev

cd apps/api && npx tsc --noEmit -p . && npm test           # API typecheck + tests (31+ tests)
cd apps/web && npx tsc --noEmit -p .                       # web typecheck
cd apps/extension && npx tsc --noEmit -p .                 # extension typecheck
npx prettier@3.3.3 --write <file>                          # formatting (hooks do this for you)
node scripts/check-agent-setup.mjs                         # rules, hooks and docs are consistent
node .claude/hooks/test-hooks.mjs                          # the safety hooks behave as expected

cd apps/api && npx prisma migrate dev --name <what_changed> # new migration (local DB only)
```

## Hard rules

1. **No commits, pushes, merges or deploys without the owner's explicit go-ahead.** Ask every time. Never force push. (Hook: `guard-bash`.)
2. **No paid actions or sign-ups** (hosting, AI providers, stores, domains) without asking.
3. **Never read or print secrets.** Real `.env` files are off limits. New settings go in `apps/api/.env.example` in the same change, and you tell the owner which Vercel env var to add. (Hook: `protect-files`; CI: env check.)
4. **Never edit a committed migration.** Add a new one. Its folder name must sort after every existing one. (Hook + CI.)
5. **Do not install packages** or touch `pnpm-lock.yaml` without asking.
6. **Say what you verified and what you did not.** "Typecheck passed, not tested in the browser" is a good answer.

## How the code works (conventions)

- **Every API route needs a sign-in** (`AuthGuard`) unless marked `@Public()`. Roles: guest < member < admin < owner via `@MinRole()`. Checks live in the API, not only the UI.
- **Workspace isolation:** every query filters by `auth.workspaceId`. Another workspace's report returns **404**, not 403. New endpoints get a test for this.
- **Rate limits:** anything that sends email, calls AI, uploads or creates data gets `@RateLimit(...)` (`src/ops/rate-limit.ts`). Counters live in Postgres because serverless instances share nothing.
- **Plan limits** live in one place: `src/plans/plans.ts`. Do not hard-code limits elsewhere.
- **Serverless side effects:** on Vercel the function can freeze right after the response. Anything the user expects to happen (Slack alert, issue sync, GitHub update) must be **awaited** with a short timeout before responding; only long AI jobs go to `waitUntil`. See mistake #1.
- **External sync is idempotent:** compare with the source of truth (the tool's real state), never with our cached copy. See mistake #3.
- **Webhooks** verify signatures over the raw body, return 200 fast, and never echo a change back to the tool that sent it.
- **Uploads:** only files under `w/<workspaceId>/` are accepted (`isOwnUpload`). The AI never fetches arbitrary URLs.
- **Secrets at rest:** user keys are encrypted with `APP_SECRET` (`src/auth/crypto.ts`). Tokens are stored as SHA-256 hashes.
- **Errors:** unexpected 5xx are recorded by `ErrorsFilter` and alert the team. Do not swallow errors silently; log with context.
- **Extension:** browser-only code. Never import packages that pull in Node built-ins (`node:fs`, `node:path`); CI checks the bundle. Background (service worker) has no DOM; the recorder lives in `tabs/offscreen.tsx`.
- **Web:** dark theme, blue `#3B82F6`, Geist. Use the kit in `src/components/kit` and `src/components/ui`. Loading, empty and error states for every screen.
- Keep functions small and typed. No dead code, no commented-out code, no `any` without a reason in a comment.

## Tests

- New logic in the API gets a `node:test` test in `apps/api/test/` (pure functions are easiest: put logic in a small module and test that).
- Security-sensitive code (signatures, tokens, permissions, limits) always gets a test.
- UI changes: check in a real browser at desktop and mobile widths before saying done.

## Sub-agents (Claude Code: `.claude/agents/`)

| Agent | Use it when |
|---|---|
| `code-reviewer` | Before asking the owner to commit. Reviews the diff against these rules. |
| `test-writer` | After adding or changing API logic. Writes `node:test` tests and runs them. |
| `migration-checker` | Any change to `apps/api/prisma/schema.prisma` or a new migration. |

## Definition of done

- [ ] Typecheck and tests pass for every app you touched (the Stop hook runs them)
- [ ] New endpoints: auth, role, rate limit and cross-workspace test considered
- [ ] New env vars in `.env.example`, and the owner told which Vercel env to set
- [ ] Docs and this file updated if a rule changed
- [ ] If an agent (you included) made a mistake worth remembering, add it to `docs/agent-mistakes.md` with the rule that prevents it
- [ ] Nothing committed or pushed without approval
