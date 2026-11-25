// BugSnap "verify the fix": find BUG-<n> references in the pull request, download their
// regression tests, run them with Playwright, then report to BugSnap and comment on the PR.
import { execSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const env = process.env
const API = (env.BUGSNAP_API_URL || "https://bugsnap-api.vercel.app").replace(/\/$/, "")
const KEY = env.BUGSNAP_API_KEY
const FAIL = env.BUGSNAP_FAIL_ON_BUG !== "false"
const out = (k, v) => env.GITHUB_OUTPUT && fs.appendFileSync(env.GITHUB_OUTPUT, `${k}=${v}\n`)
const summary = (md) => env.GITHUB_STEP_SUMMARY && fs.appendFileSync(env.GITHUB_STEP_SUMMARY, md + "\n")

if (!KEY) {
  console.error("::error::BugSnap api-key is missing. Add a BUGSNAP_API_KEY secret.")
  process.exit(1)
}

const event = env.GITHUB_EVENT_PATH && fs.existsSync(env.GITHUB_EVENT_PATH) ? JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, "utf8")) : {}
const pr = event.pull_request
const repo = env.GITHUB_REPOSITORY

async function gh(p, init = {}) {
  if (!env.GITHUB_TOKEN) return null
  const r = await fetch(`https://api.github.com${p}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  })
  return r.ok ? r.json() : null
}

// 1) Which bugs does this PR mention? Title, body, branch name and commit messages.
let text = [pr?.title, pr?.body, pr?.head?.ref, event.head_commit?.message].filter(Boolean).join("\n")
if (pr && repo) {
  const commits = (await gh(`/repos/${repo}/pulls/${pr.number}/commits?per_page=100`)) || []
  text += "\n" + commits.map((c) => c.commit?.message ?? "").join("\n")
}
const refs = [...new Set([...text.matchAll(/\bBUG[-_ ]?(\d{1,7})\b/gi)].map((m) => Number(m[1])))]
if (!refs.length) {
  console.log('No BugSnap bugs mentioned (write "Fixes BUG-12" in the PR title or description). Nothing to verify.')
  out("result", "none")
  process.exit(0)
}
console.log(`Bugs mentioned: ${refs.map((n) => `BUG-${n}`).join(", ")}`)

// 2) Download their tests.
const api = (p, init = {}) =>
  fetch(`${API}${p}`, { ...init, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) } })
const res = await api(`/ci/tests?refs=${refs.map((n) => `BUG-${n}`).join(",")}`)
if (!res.ok) {
  console.error(`::error::BugSnap answered ${res.status}. Check the API key.`)
  process.exit(1)
}
const { tests } = await res.json()
if (!tests.length) {
  console.log("None of those bug numbers exist in this BugSnap workspace.")
  out("result", "none")
  process.exit(0)
}

// 3) Run them with Playwright in a scratch folder.
const dir = path.join(env.RUNNER_TEMP || "/tmp", "bugsnap-verify")
fs.mkdirSync(path.join(dir, "tests"), { recursive: true })
fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "bugsnap-verify", private: true, type: "commonjs" }))
fs.writeFileSync(
  path.join(dir, "playwright.config.js"),
  `module.exports = { testDir: "tests", timeout: 60000, retries: 1, reporter: [["json", { outputFile: "results.json" }], ["list"]], use: { headless: true, trace: "off" } }\n`,
)
for (const t of tests) fs.writeFileSync(path.join(dir, "tests", `bug-${t.number}.spec.ts`), t.test)
console.log("Installing Playwright (Chromium)…")
execSync("npm install --no-audit --no-fund --silent @playwright/test@1 && npx playwright install --with-deps chromium", { cwd: dir, stdio: "inherit" })
spawnSync("npx", ["playwright", "test"], { cwd: dir, stdio: "inherit", env: { ...env, BUGSNAP_BASE_URL: env.BUGSNAP_BASE_URL || "" } })

// 4) Read results per bug.
const report = fs.existsSync(path.join(dir, "results.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf8")) : { suites: [] }
const byFile = {}
const walk = (suite) => {
  for (const spec of suite.specs ?? []) {
    const file = path.basename(spec.file || suite.file || "")
    const last = spec.tests?.[0]?.results?.at(-1)
    const ok = spec.ok && last?.status === "passed"
    const msg = (last?.error?.message || last?.errors?.[0]?.message || "").replace(/\u001b\[[0-9;]*m/g, "").slice(0, 1500)
    byFile[file] = { status: ok ? "passed" : last ? "failed" : "error", details: msg }
  }
  for (const s of suite.suites ?? []) walk(s)
}
for (const s of report.suites ?? []) walk(s)
const results = tests.map((t) => ({
  number: t.number,
  title: t.title,
  url: t.url,
  ...(byFile[`bug-${t.number}.spec.ts`] ?? { status: "error", details: "The test did not run" }),
}))

// 5) Send to BugSnap.
const runUrl = env.GITHUB_SERVER_URL && repo && env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${repo}/actions/runs/${env.GITHUB_RUN_ID}` : undefined
await api("/ci/results", {
  method: "POST",
  body: JSON.stringify({
    repo,
    prNumber: pr?.number,
    prUrl: pr?.html_url,
    commitSha: pr?.head?.sha || env.GITHUB_SHA,
    runUrl,
    results: results.map(({ number, status, details }) => ({ number, status, details })),
  }),
}).catch(() => console.warn("Could not send results to BugSnap"))

// 6) Comment on the PR (one comment, updated on each run) and write the job summary.
const icon = { passed: "✅", failed: "❌", error: "⚠️" }
const word = { passed: "Fixed: the bug no longer reproduces", failed: "Still reproduces", error: "Could not run" }
const rows = results.map((r) => `| [BUG-${r.number}](${r.url}) | ${r.title.replace(/\|/g, "\\|").slice(0, 80)} | ${icon[r.status]} ${word[r.status]} |`)
const failed = results.filter((r) => r.status !== "passed")
const body = [
  "<!-- bugsnap-verify -->",
  `### BugSnap: ${
    results.length === 1
      ? `BUG-${results[0].number} ${failed.length ? "still reproduces" : "verified fixed"}`
      : failed.length
        ? `${failed.length} of ${results.length} bugs still reproduce`
        : `all ${results.length} bugs verified fixed`
  }`,
  "",
  "| Bug | Title | Result |",
  "| --- | --- | --- |",
  ...rows,
  ...(failed.length
    ? [
        "",
        "<details><summary>Why it failed</summary>",
        "",
        ...failed.map((r) => `**BUG-${r.number}**\n\n\`\`\`\n${r.details || "no details"}\n\`\`\``),
        "</details>",
      ]
    : []),
  "",
  `<sub>Each bug's test replays the steps recorded in BugSnap${env.BUGSNAP_BASE_URL ? ` against ${env.BUGSNAP_BASE_URL}` : ""}.${runUrl ? ` [Run log](${runUrl})` : ""}</sub>`,
].join("\n")
summary(body)
if (pr && repo) {
  const comments = (await gh(`/repos/${repo}/issues/${pr.number}/comments?per_page=100`)) || []
  const mine = comments.find((c) => c.body?.includes("<!-- bugsnap-verify -->"))
  if (mine) await gh(`/repos/${repo}/issues/comments/${mine.id}`, { method: "PATCH", body: JSON.stringify({ body }) })
  else await gh(`/repos/${repo}/issues/${pr.number}/comments`, { method: "POST", body: JSON.stringify({ body }) })
}

out("result", failed.length ? "failed" : "passed")
if (failed.length && FAIL) {
  console.error(`::error::${failed.map((r) => `BUG-${r.number}`).join(", ")} still reproduce.`)
  process.exit(1)
}
console.log("All mentioned bugs are verified fixed.")
