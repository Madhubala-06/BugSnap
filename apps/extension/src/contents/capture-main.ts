// Runs inside the page itself (MAIN world) so it sees the page's real
// console, fetch, XHR and errors. It cannot talk to the extension directly,
// so it posts each log to the isolated relay script (capture.ts).
import type { PlasmoCSConfig } from "plasmo"
import type { SessionLog } from "../lib/types"
import { clip, redactText, redactUrl } from "../lib/redact"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_start",
  world: "MAIN",
  all_frames: false,
}

const SOURCE = "bugsnap-main"
const RING_SIZE = 30 // errors kept from before recording started

let active = false
const ring: SessionLog[] = []

function emit(log: SessionLog) {
  if (active) {
    window.postMessage({ source: SOURCE, log }, "*")
  } else if (log.level === "ERROR" || log.level === "WARN") {
    ring.push({ ...log, data: { ...log.data, beforeRecording: true } })
    if (ring.length > RING_SIZE) ring.shift()
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== "bugsnap-relay") return
  if (event.data.command === "start") {
    if (active) return
    active = true
    // Hand over recent errors so bugs that happened just before Record are not lost.
    ring.splice(0).forEach(emit)
  } else if (event.data.command === "stop") {
    active = false
  }
})

const now = () => new Date().toISOString()

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

// Console
;(["log", "info", "debug", "warn", "error"] as const).forEach((method) => {
  const original = console[method]
  console[method] = function (...args: unknown[]) {
    original.apply(console, args)
    try {
      const level = method === "warn" ? "WARN" : method === "error" ? "ERROR" : method === "debug" ? "DEBUG" : "INFO"
      const errorArg = args.find((a) => a instanceof Error) as Error | undefined
      emit({
        type: "CONSOLE",
        level,
        message: clip(redactText(args.map(formatArg).join(" "))),
        data: { method, stack: errorArg?.stack ? clip(redactText(errorArg.stack)) : undefined },
        timestamp: now(),
      })
    } catch {
      // never break the page
    }
  }
})

// Uncaught errors
window.addEventListener(
  "error",
  (event: Event) => {
    if (!(event instanceof ErrorEvent)) {
      // Resource failed to load (img, script, css)
      const el = event.target as HTMLElement & { src?: string; href?: string }
      if (el && el !== (window as unknown)) {
        emit({
          type: "ERROR",
          level: "ERROR",
          message: `Failed to load ${el.tagName?.toLowerCase()}: ${redactUrl(el.src || el.href || "")}`,
          timestamp: now(),
        })
      }
      return
    }
    emit({
      type: "ERROR",
      level: "ERROR",
      message: clip(redactText((event as ErrorEvent).message)),
      data: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack ? clip(redactText(event.error.stack)) : undefined,
      },
      timestamp: now(),
    })
  },
  true
)

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason
  emit({
    type: "ERROR",
    level: "ERROR",
    message: clip(redactText(`Unhandled promise rejection: ${reason?.message ?? formatArg(reason)}`)),
    data: { stack: reason?.stack ? clip(redactText(reason.stack)) : undefined },
    timestamp: now(),
  })
})

// fetch
const originalFetch = window.fetch
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase()
  const url = redactUrl(rawUrl)
  const started = performance.now()
  try {
    const response = await originalFetch.call(this, input, init)
    let body: string | undefined
    if (!response.ok) {
      try {
        body = clip(redactText(await response.clone().text()), 800)
      } catch {
        body = undefined
      }
    }
    emit({
      type: "NETWORK",
      level: response.ok ? "INFO" : "ERROR",
      message: `${method} ${url} → ${response.status}`,
      data: { url, method, status: response.status, statusText: response.statusText, duration: Math.round(performance.now() - started), responseBody: body },
      timestamp: now(),
    })
    return response
  } catch (error) {
    emit({
      type: "NETWORK",
      level: "ERROR",
      message: `${method} ${url} → failed`,
      data: { url, method, error: error instanceof Error ? error.message : String(error), duration: Math.round(performance.now() - started) },
      timestamp: now(),
    })
    throw error
  }
}

// XMLHttpRequest
const xhrMeta = new WeakMap<XMLHttpRequest, { method: string; url: string; started: number }>()
const originalOpen = XMLHttpRequest.prototype.open
const originalSend = XMLHttpRequest.prototype.send

XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
  xhrMeta.set(this, { method: String(method).toUpperCase(), url: redactUrl(String(url)), started: 0 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (originalOpen as any).call(this, method, url, ...rest)
} as typeof XMLHttpRequest.prototype.open

XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
  const meta = xhrMeta.get(this)
  if (meta) {
    meta.started = performance.now()
    this.addEventListener("loadend", () => {
      const failed = this.status === 0 || this.status >= 400
      emit({
        type: "NETWORK",
        level: failed ? "ERROR" : "INFO",
        message: `${meta.method} ${meta.url} → ${this.status || "failed"}`,
        data: { url: meta.url, method: meta.method, status: this.status, statusText: this.statusText, duration: Math.round(performance.now() - meta.started) },
        timestamp: now(),
      })
    })
  }
  return originalSend.call(this, body)
}

export {}
