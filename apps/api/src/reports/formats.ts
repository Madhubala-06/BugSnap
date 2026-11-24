// Turns a stored report into text for developers and AI coding agents.
import { buildLogDigest, type CapturedLog, type PageContext } from "../ai/context"

export interface ReportLike {
  id: string
  title: string
  description?: string | null
  stepsToReproduce?: string[]
  expectedResult?: string | null
  actualResult?: string | null
  severity: string
  status: string
  aiRootCause?: string | null
  aiSuggestions?: string[]
  url?: string | null
  createdAt: Date | string
  browserInfo?: unknown
}

interface Info {
  logs?: CapturedLog[]
  page?: PageContext
  recordingUrl?: string
  screenshotUrls?: string[]
}

const info = (r: ReportLike) => (r.browserInfo ?? {}) as Info
const strip = (html?: string | null) =>
  (html ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()
const q = (s: string) => JSON.stringify(s)

/** Map `Clicked button "Pay now"` to a Playwright locator. */
function locatorFor(log: CapturedLog): string | null {
  const selector = typeof log.data?.selector === "string" ? log.data.selector : ""
  const m = log.message.match(/^(?:Clicked|Changed)\s+([a-z0-9-]+)(?:\s+"(.+)")?/i)
  const tag = m?.[1]?.toLowerCase()
  const label = m?.[2]?.replace(/\s*\(sensitive\)$/, "")
  if (label && label.length <= 60) {
    if (tag === "button" || tag === "summary") return `page.getByRole("button", { name: ${q(label)} })`
    if (tag === "a") return `page.getByRole("link", { name: ${q(label)} })`
    if (tag === "input" || tag === "textarea" || tag === "select") return `page.getByLabel(${q(label)})`
    if (!selector) return `page.getByText(${q(label)}, { exact: true })`
  }
  return selector ? `page.locator(${q(selector)})` : null
}

/**
 * A Playwright test that replays the recorded steps and fails while the bug is
 * still there (it asserts no page errors and no failed requests).
 */
export function toPlaywrightTest(report: ReportLike): string {
  const { logs = [], page } = info(report)
  const startUrl = page?.url || report.url || "https://example.com"
  const lines: string[] = []
  const during = logs.filter((l) => !l.data?.beforeRecording)
  let lastUrl = startUrl
  for (const log of during) {
    if (log.type === "CLICK") {
      const loc = locatorFor(log)
      lines.push(loc ? `  await ${loc}.click()` : `  // ${log.message} (no stable selector recorded)`)
    } else if (log.type === "INPUT") {
      const loc = locatorFor(log)
      const sensitive = /\(sensitive\)/.test(log.message)
      const value = sensitive ? "TODO: test value (not recorded)" : "TODO: value (BugSnap does not record what was typed)"
      lines.push(loc ? `  await ${loc}.fill(${q(value)})` : `  // ${log.message}`)
    } else if (log.type === "NAVIGATION") {
      const url = String(log.data?.url ?? "")
      if (url && url !== lastUrl && url !== startUrl) {
        lines.push(`  await page.waitForURL(${q(url.split("?")[0] + "**")})`)
        lastUrl = url
      }
    } else if (log.level === "ERROR") {
      lines.push(`  // Recorded: ${log.message.replace(/\s+/g, " ").slice(0, 160)}`)
    }
  }
  const vp = page?.viewport?.width ? `  await page.setViewportSize({ width: ${page.viewport.width}, height: ${page.viewport.height} })\n` : ""
  return `import { test, expect } from "@playwright/test"

// Reproduces: ${report.title.replace(/\n/g, " ")}
// Recorded with BugSnap on ${new Date(report.createdAt).toISOString().slice(0, 10)}. This test fails while the bug exists.
test(${q(report.title.slice(0, 100))}, async ({ page }) => {
  const pageErrors: string[] = []
  const failedRequests: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push(msg.text())
  })
  page.on("response", (response) => {
    if (response.status() >= 400) failedRequests.push(\`\${response.request().method()} \${response.url()} -> \${response.status()}\`)
  })

${vp}  await page.goto(${q(startUrl)})
${lines.join("\n") || "  // No clicks were recorded. Add the steps from the video here."}
  await page.waitForLoadState("networkidle")

  expect(failedRequests, "requests that failed").toEqual([])
  expect(pageErrors, "errors in the page").toEqual([])
})
`
}

/** Everything an AI coding agent needs to find and fix the bug. */
export function toFixPrompt(report: ReportLike, appUrl?: string): string {
  const { logs = [], page } = info(report)
  const errors = logs.filter((l) => l.level === "ERROR").slice(0, 8)
  const parts = [
    `Fix this bug in the codebase. It was recorded in a real browser with BugSnap${appUrl ? ` (${appUrl}/dashboard/reports/${report.id})` : ""}.`,
    "",
    `## Bug: ${report.title}`,
    `Severity: ${report.severity.toLowerCase()}. Page: ${page?.url || report.url || "unknown"}.`,
  ]
  const description = strip(report.description)
  if (description) parts.push("", description)
  if (report.stepsToReproduce?.length) parts.push("", "## Steps to reproduce", ...report.stepsToReproduce.map((s, i) => `${i + 1}. ${s}`))
  if (report.expectedResult) parts.push("", `Expected: ${report.expectedResult}`)
  if (report.actualResult) parts.push(`Actual: ${report.actualResult}`)
  if (errors.length) {
    parts.push("", "## Errors captured (exact)")
    for (const e of errors) {
      parts.push(`- ${e.message}`)
      const stack = typeof e.data?.stack === "string" ? e.data.stack : ""
      const body = typeof e.data?.responseBody === "string" ? e.data.responseBody : ""
      if (stack) parts.push("```", stack.slice(0, 800), "```")
      if (body) parts.push(`  Response body: ${body.slice(0, 300)}`)
    }
  }
  parts.push("", "## Full timeline", "```", buildLogDigest(logs, undefined, 60), "```")
  if (report.aiRootCause) parts.push("", `A first guess at the cause (verify it, do not trust it blindly): ${report.aiRootCause}`)
  parts.push(
    "",
    "## What to do",
    "1. Find the code behind the failing request and the error above. Explain the root cause in two or three sentences.",
    "2. Fix it with the smallest safe change. Handle the error case so the UI does not crash or hang.",
    "3. Add or update a test that fails before the fix and passes after. A Playwright test that replays the steps is below.",
    "",
    "```ts",
    toPlaywrightTest(report).trim(),
    "```"
  )
  return parts.join("\n")
}

/** Plain-text details for agents (MCP get_report). */
export function toAgentText(report: ReportLike): string {
  const { page, recordingUrl, screenshotUrls = [] } = info(report)
  return [
    toFixPrompt(report).replace(/^Fix this bug in the codebase\.[^\n]*\n\n/, ""),
    "",
    `Status: ${report.status.toLowerCase()}. Created: ${new Date(report.createdAt).toISOString()}.`,
    page?.viewport?.width ? `Viewport: ${page.viewport.width}x${page.viewport.height}. Browser: ${page.userAgent ?? "unknown"}.` : "",
    recordingUrl ? `Video: ${recordingUrl}` : "",
    screenshotUrls.length ? `Screenshots: ${screenshotUrls.join(" ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}
