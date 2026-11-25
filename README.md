# BugSnap

Record a bug once. BugSnap captures the screen, clicks, console errors and failed network calls, then writes the bug report for you.

**Live:** https://bugsnap-web.vercel.app · **Demo report (no sign-up):** https://bugsnap-web.vercel.app/r/demo · API https://bugsnap-api.vercel.app

## Features

- **Record once, get a full report.** Video, screenshots, console errors with stacks, failed requests with response bodies, clicks, field changes, page and browser details.
- **AI write-up** (Google Gemini): title, steps, expected vs actual, severity and likely cause. Runs in the background, falls back across models when one is busy. 20 free write-ups per workspace per month on the shared key, unlimited with your own free key.
- **Works without AI too:** a plain description and steps are built from the timeline.
- **Fix with AI:** one click copies a prompt for Cursor, Claude Code or Copilot with the exact errors, timeline and a regression test.
- **Regression test:** a Playwright test generated from the recorded steps. It fails while the bug exists and passes once it is fixed.
- **MCP server for coding agents:** `https://bugsnap-api.vercel.app/mcp`. Tools: `list_bug_reports`, `get_bug_report`, `get_playwright_test`, `get_fix_prompt`, `update_bug_status`, `add_comment`, `report_test_result`, `get_verification_status`, `open_fix_pull_request`. IDs like `BUG-12` work. Create a key in Settings, then:
  `claude mcp add --transport http bugsnap https://bugsnap-api.vercel.app/mcp --header "Authorization: Bearer bsk_..."`
- **Duplicates:** reports with the same error on the same page are grouped ("seen 3 times").
- **Share:** read-only public links (`/r/<token>`), one-click GitHub issues (pre-filled, nothing is posted for you), Copy as Markdown, CSV export.
- **Self-serve:** email-code sign-in, private workspaces, getting-started checklist, privacy and terms pages.

## How it works

```
Chrome extension ──▶ API (NestJS) ──▶ Dashboard (Next.js)
 records screen,      saves report,      timeline, video,
 clicks, console,     runs Gemini on     screenshots, AI
 network, page info   screenshots+logs   write-up
```

1. Click the BugSnap icon, sign in with your email (6-digit code), press **Start Recording**.
2. Reproduce the bug in your tab. Stop from the recorder tab, the popup, or Chrome's "Stop sharing" bar.
3. The report opens in the dashboard with a filterable "What happened" timeline, the video, screenshots, page and browser details, and an AI write-up (title, steps, expected vs actual, likely cause).

### What is captured, and what is not

- Captured: console logs and errors (with stack), uncaught errors, failed `fetch`/XHR calls (status and error body), clicks, field changes, page changes, viewport, screen, browser.
- Never captured: what you type into fields, password fields, request headers. Tokens in URLs (`token`, `key`, `code`, ...), bearer tokens, JWTs and API keys in log text are replaced with `[hidden]`.

## Project layout

| Folder | What |
|-|-|
| `apps/extension` | Chrome extension (Plasmo, Manifest V3). `contents/capture-main.ts` runs inside the page; `contents/capture.ts` relays to the extension. |
| `apps/api` | NestJS + Prisma (Postgres). Email-code login, workspaces, reports, uploads, Gemini. Runs as one Vercel function (`api/index.js`). |
| `apps/web` | Next.js 15 dashboard and landing page. |
| `apps/python-api` | Old unused backend. Not deployed. |

## Run locally

Needs Node 20+, pnpm 9 and Postgres.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # set DATABASE_URL / DIRECT_URL
pnpm --filter @bugsnap/api exec prisma migrate deploy
pnpm --filter @bugsnap/api dev               # http://localhost:3001
PORT=3002 pnpm --filter @bugsnap/web dev     # http://localhost:3002
pnpm --filter @bugsnap/extension dev         # load apps/extension/build/chrome-mv3-dev
```

Locally, no email is sent: the sign-in code is shown on the login screen. Add a Gemini key in **Settings** to get AI write-ups (free key at https://aistudio.google.com/apikey).

### Load the extension

1. `pnpm --filter @bugsnap/extension build` (uses `.env.production`, so it talks to the live API). Use `dev` for localhost.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, pick `apps/extension/build/chrome-mv3-prod` (or `chrome-mv3-dev`).

## Built with AI agents

Most of this code is written by AI coding agents and reviewed and tested by me. The repo is set up so agents work safely:

- [`AGENTS.md`](AGENTS.md): rules, conventions and commands every agent reads (Claude Code via `CLAUDE.md`, Cursor via `.cursor/rules`).
- [`.claude/settings.json`](.claude/settings.json) hooks: block edits to secrets, lockfiles and committed migrations; ask before commits, pushes, deploys and installs; format after edits; run the checks for whatever changed before the agent can finish. Tested by `node .claude/hooks/test-hooks.mjs`.
- [`.claude/agents/`](.claude/agents): `code-reviewer`, `test-writer` and `migration-checker` sub-agents.
- CI guardrails: secret scan, env settings documented, migrations ordered and in sync with the schema, extension bundle free of Node-only code, formatting, and the hook tests.
- [`docs/agent-mistakes.md`](docs/agent-mistakes.md): every real agent mistake and the rule that now prevents it.

## Tests

```bash
pnpm --filter @bugsnap/api test   # builds, then runs node:test (auth, upload checks, log digest, prompt helpers)
```

## Deploy (Vercel)

- API: `cd apps/api && vercel deploy --prod`. The build runs `prisma migrate deploy`. Env: `DATABASE_URL` (pooled, with `pgbouncer=true`), `DIRECT_URL`, `APP_SECRET`, `FRONTEND_URL`, `BLOB_READ_WRITE_TOKEN`, `NODE_ENV=production`, SMTP settings, optional `GEMINI_API_KEY`, `SHARED_AI_MONTHLY_LIMIT` (default 20), `GEMINI_MODELS` (comma list, tried in order). The function runs in `sin1` next to the database; AI jobs continue after the response with `waitUntil` (max 300 s).
- Web: `cd apps/web && vercel deploy --prod`. Env: `NEXT_PUBLIC_API_URL`, optional `NEXT_PUBLIC_EXTENSION_URL` (Chrome Web Store link).
- Files: Vercel Blob. The extension asks the API for a short-lived upload token that only allows one path inside the user's workspace (`w/<workspaceId>/...`) and uploads straight to storage.

## Security notes

- Every API route needs a sign-in token except health and the two login routes. Reports from other workspaces return 404.
- Login codes and sign-in tokens are stored only as SHA-256 hashes. Codes expire after 10 minutes, allow 5 tries, and max 5 codes per 15 minutes per email.
- Saved Gemini keys are encrypted with AES-256-GCM (`APP_SECRET`) and are sent to Google in a header, never in a URL.
- The AI only reads screenshots that this workspace uploaded. It never fetches arbitrary URLs.
