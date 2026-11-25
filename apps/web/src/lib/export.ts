import type { BugReport, SessionLog } from "./api"

const strip = (html?: string | null) =>
  (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim()

/** A report as Markdown, ready to paste into GitHub, Jira, Linear or Slack. */
export function reportToMarkdown(report: BugReport, appUrl?: string): string {
  const info = report.browserInfo ?? {}
  const page = info.page
  const logs: SessionLog[] = report.session?.logs?.length ? report.session.logs : (info.logs ?? [])
  const errors = logs.filter((l) => l.level.toUpperCase() === "ERROR").slice(0, 10)
  const lines: string[] = [`## ${report.title}`, ""]
  lines.push(`**Severity:** ${report.severity.toLowerCase()} · **Status:** ${report.status.replace("_", " ").toLowerCase()}`)
  if (page?.url || report.url) lines.push(`**Page:** ${page?.url || report.url}`)
  if (page?.viewport?.width) lines.push(`**Viewport:** ${page.viewport.width}×${page.viewport.height}${page.userAgent ? ` · ${shortUa(page.userAgent)}` : ""}`)
  const description = strip(report.description) || report.aiSummary
  if (description) lines.push("", description)
  if (report.stepsToReproduce?.length) {
    lines.push("", "### Steps to reproduce")
    report.stepsToReproduce.forEach((s, i) => lines.push(`${i + 1}. ${s.replace(/^Step \d+:\s*/i, "")}`))
  }
  if (report.expectedResult) lines.push("", `**Expected:** ${report.expectedResult}`)
  if (report.actualResult) lines.push(`**Actual:** ${report.actualResult}`)
  if (report.aiRootCause) lines.push("", `**Likely cause:** ${report.aiRootCause}`)
  if (errors.length) {
    lines.push("", "### Errors", "```")
    errors.forEach((e) => lines.push(e.message))
    lines.push("```")
  }
  const media: string[] = []
  if (info.recordingUrl) media.push(`[Video](${info.recordingUrl})`)
  ;(info.screenshotUrls ?? []).slice(0, 5).forEach((u, i) => media.push(`[Screenshot ${i + 1}](${u})`))
  if (media.length) lines.push("", media.join(" · "))
  if (appUrl) lines.push("", `_Reported with BugSnap: ${appUrl}/dashboard/reports/${report.id}_`)
  return lines.join("\n")
}

function shortUa(ua: string) {
  const chrome = ua.match(/Chrome\/(\d+)/)
  return chrome ? `Chrome ${chrome[1]}` : ua.slice(0, 40)
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "")
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function reportsToCsv(reports: BugReport[]): string {
  const header = ["id", "title", "severity", "status", "page", "reporter", "created_at", "errors", "summary"]
  const rows = reports.map((r) => [
    r.id,
    r.title,
    r.severity,
    r.status,
    r.browserInfo?.page?.url || r.url || "",
    r.reporter?.email || r.reporter?.name || "",
    r.createdAt,
    r.browserInfo?.logSummary?.errors ?? "",
    strip(r.description) || r.aiSummary || "",
  ])
  return "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
