import { createHash } from "crypto"
// Pure helpers for building the AI prompt. No Nest or network here, so they are easy to test.
import * as path from "path"

export interface CapturedLog {
  type: string
  level: string
  message: string
  data?: Record<string, unknown>
  timestamp: string
}

export interface PageContext {
  url?: string
  title?: string
  userAgent?: string
  language?: string
  viewport?: { width: number; height: number }
  screen?: { width: number; height: number; pixelRatio: number }
}

const ALLOWED_FOLDERS = new Set(["thumbnails", "screenshots"])

/**
 * Turns an uploaded file URL into a local path inside uploads/.
 * Returns null for anything else, so the server never fetches arbitrary URLs.
 */
export function resolveUploadPath(url: string, uploadDir: string): string | null {
  let pathname: string
  try {
    pathname = new URL(url, "http://local").pathname
  } catch {
    return null
  }
  const match = pathname.match(/^\/uploads\/([a-z]+)\/([A-Za-z0-9-]+\.(png|jpe?g|webp))$/i)
  if (!match || !ALLOWED_FOLDERS.has(match[1])) return null
  const full = path.resolve(uploadDir, match[1], match[2])
  if (!full.startsWith(path.resolve(uploadDir) + path.sep)) return null
  return full
}

const BLOB_HOST = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/i

/**
 * Keeps only links to files we stored: local /uploads/<folder>/ files, or
 * Vercel Blob files inside this workspace's own folder (w/<workspaceId>/<folder>/).
 */
export function isOwnUpload(url: unknown, folder: "thumbnails" | "recordings", workspaceId?: string): url is string {
  if (typeof url !== "string" || url.length > 500) return false
  let parsed: URL
  try {
    parsed = new URL(url, "http://local")
  } catch {
    return false
  }
  const file = "[A-Za-z0-9-]+\\.[a-z0-9]{2,5}"
  if (BLOB_HOST.test(parsed.hostname)) {
    if (parsed.protocol !== "https:" || !workspaceId) return false
    return new RegExp(`^/w/${workspaceId.replace(/[^A-Za-z0-9_-]/g, "")}/${folder}/${file}$`, "i").test(parsed.pathname)
  }
  if (!/^https?:$/.test(parsed.protocol)) return false
  return new RegExp(`^/uploads/${folder}/${file}$`, "i").test(parsed.pathname)
}

export function isBlobUrl(url: string) {
  try {
    const u = new URL(url)
    return u.protocol === "https:" && BLOB_HOST.test(u.hostname)
  } catch {
    return false
  }
}

export function mimeFor(file: string): string {
  const ext = path.extname(file).toLowerCase()
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  if (ext === ".webp") return "image/webp"
  return "image/png"
}

function short(text: string, max: number) {
  const one = text.replace(/\s+/g, " ").trim()
  return one.length > max ? `${one.slice(0, max)}…` : one
}

/** Compact, time-ordered digest of what happened. Errors are kept first when trimming. */
export function buildLogDigest(logs: CapturedLog[], startedAt?: string, maxLines = 80): string {
  if (!logs.length) return "No logs were captured."
  const start = Date.parse(startedAt ?? logs[0].timestamp) || Date.parse(logs[0].timestamp)
  const important = (l: CapturedLog) => l.level === "ERROR" || l.level === "WARN" || l.type === "CLICK" || l.type === "NAVIGATION" || l.type === "INPUT"

  // Drop noisy successful requests and plain console.log first.
  let picked = logs.filter(important)
  const rest = logs.filter((l) => !important(l))
  picked = picked.concat(rest.slice(-Math.max(0, maxLines - picked.length)))
  if (picked.length > maxLines) {
    const errors = picked.filter((l) => l.level === "ERROR")
    const others = picked.filter((l) => l.level !== "ERROR")
    picked = errors.slice(-Math.ceil(maxLines / 2)).concat(others.slice(-Math.floor(maxLines / 2)))
  }
  picked.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))

  return picked
    .map((l) => {
      const t = ((Date.parse(l.timestamp) - start) / 1000).toFixed(1)
      const before = l.data?.beforeRecording ? " (before recording)" : ""
      const stack = typeof l.data?.stack === "string" ? `\n      ${short(l.data.stack as string, 300)}` : ""
      const body = typeof l.data?.responseBody === "string" ? `\n      response: ${short(l.data.responseBody as string, 200)}` : ""
      return `[+${t}s] ${l.type} ${l.level}${before}: ${short(l.message, 300)}${stack}${body}`
    })
    .join("\n")
}

export function summarizeLogs(logs: CapturedLog[]) {
  return {
    total: logs.length,
    errors: logs.filter((l) => l.level === "ERROR").length,
    warnings: logs.filter((l) => l.level === "WARN").length,
    failedRequests: logs.filter((l) => l.type === "NETWORK" && l.level === "ERROR").length,
    clicks: logs.filter((l) => l.type === "CLICK").length,
  }
}

export function buildPageBlock(page?: PageContext): string {
  if (!page) return "Unknown page."
  const lines = [
    page.url && `URL: ${page.url}`,
    page.title && `Title: ${page.title}`,
    page.viewport?.width ? `Viewport: ${page.viewport.width}x${page.viewport.height}` : undefined,
    page.screen ? `Screen: ${page.screen.width}x${page.screen.height} @${page.screen.pixelRatio}x` : undefined,
    page.userAgent && `Browser: ${page.userAgent}`,
    page.language && `Language: ${page.language}`,
  ].filter(Boolean)
  return lines.join("\n")
}

/** Fallback title when there is no AI: the first real error, written short. */
export function fallbackTitle(logs: CapturedLog[], page?: PageContext): string {
  const during = logs.filter((l) => l.level === "ERROR" && !l.data?.beforeRecording)
  const pool = during.length ? during : logs.filter((l) => l.level === "ERROR")
  const where = (() => {
    try {
      return page?.url ? new URL(page.url).pathname : ""
    } catch {
      return ""
    }
  })()
  const onPage = where && where !== "/" ? ` on ${where}` : ""
  // A JavaScript error says more than the request that caused it.
  const jsError = pool.find((l) => l.type !== "NETWORK")
  if (jsError) {
    const msg = jsError.message.replace(/^(Unhandled promise rejection:|Payment UI crashed|Uncaught)\s*/i, "").replace(/\s+/g, " ")
    const core = msg.match(/\b(\w*Error: .+)/)?.[1] ?? msg
    return short(`${core}${onPage}`, 100)
  }
  const net = pool.find((l) => l.type === "NETWORK")
  if (net) {
    const m = net.message.match(/^(\w+)\s+(\S+)\s+→\s+(\S+)/)
    if (m) {
      let path = m[2]
      try {
        path = new URL(m[2], "http://x").pathname
      } catch {
        // keep as is
      }
      return short(`${m[1]} ${path} failed (${m[3]})${onPage}`, 100)
    }
    return short(net.message, 100)
  }
  if (page?.title) return `Issue on "${short(page.title, 60)}"`
  return `Bug report ${new Date().toISOString().slice(0, 16).replace("T", " ")}`
}

/**
 * A useful report without AI: steps from clicks/pages/inputs, and a short
 * description of what went wrong from the errors and failed requests.
 */
export function fallbackSummary(logs: CapturedLog[], page?: PageContext): { description: string; steps: string[] } {
  const during = logs.filter((l) => !l.data?.beforeRecording)
  const steps: string[] = []
  if (page?.url) steps.push(`Open ${page.url}`)
  for (const l of during) {
    let step: string | null = null
    if (l.type === "CLICK") step = l.message.replace(/^Clicked /, "Click ")
    else if (l.type === "INPUT") step = l.message.replace(/^Changed /, "Fill in ")
    else if (l.type === "NAVIGATION") {
      const url = String(l.data?.url ?? l.message.replace(/^Opened /, ""))
      if (url && url !== page?.url) step = `Go to ${url}`
    }
    if (step && steps[steps.length - 1] !== step) steps.push(short(step, 140))
    if (steps.length >= 12) break
  }

  const failed = during.filter((l) => l.type === "NETWORK" && l.level === "ERROR")
  const errors = during.filter((l) => l.level === "ERROR" && l.type !== "NETWORK")
  const parts: string[] = []
  if (page?.title || page?.url) parts.push(`Recorded on ${page?.title ? `"${page.title}"` : page?.url}.`)
  if (!failed.length && !errors.length) parts.push("No errors or failed requests were captured. Watch the video for what went wrong.")
  if (failed.length) parts.push(`${failed.length} request${failed.length > 1 ? "s" : ""} failed, first: ${short(failed[0].message, 160)}.`)
  if (errors.length) parts.push(`${errors.length} error${errors.length > 1 ? "s" : ""} in the console, first: ${short(errors[0].message, 200)}.`)
  return { description: parts.join(" "), steps }
}

/**
 * Same bug, same signature: the first real error, with ids, numbers and
 * query strings removed, plus the page path. Used to group duplicates.
 */
export function errorSignature(logs: CapturedLog[], page?: PageContext): string | null {
  const first =
    logs.find((l) => l.level === "ERROR" && l.type !== "NETWORK" && !l.data?.beforeRecording) ||
    logs.find((l) => l.level === "ERROR" && !l.data?.beforeRecording)
  if (!first) return null
  const clean = (text: string) =>
    text
      .toLowerCase()
      .replace(/https?:\/\/[^\s/]+/g, "")
      .replace(/\?[^\s]*/g, "")
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>")
      .replace(/\b[0-9a-z]{20,}\b/g, "<id>")
      .replace(/\d+/g, "#")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300)
  let path = ""
  try {
    path = page?.url ? clean(new URL(page.url).pathname) : ""
  } catch {
    path = ""
  }
  return createHash("sha1")
    .update(`${first.type}|${clean(first.message)}|${path}`)
    .digest("hex")
    .slice(0, 16)
}
