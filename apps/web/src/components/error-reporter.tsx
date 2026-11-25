"use client"

import { useEffect } from "react"
import { API_URL } from "@/lib/auth"

/** Sends browser crashes to BugSnap's own error log (once per message per visit). */
export function ErrorReporter() {
  useEffect(() => {
    const sent = new Set<string>()
    const report = (message: string, stack?: string) => {
      if (!message || sent.size > 20 || sent.has(message)) return
      // Ignore noise from browser extensions and cancelled requests.
      if (/chrome-extension:|ResizeObserver loop|AbortError|Load failed|NetworkError/i.test(message + (stack ?? ""))) return
      sent.add(message)
      const body = JSON.stringify({ source: "web", message: message.slice(0, 1000), stack: stack?.slice(0, 6000), url: window.location.href })
      fetch(`${API_URL}/ops/client-errors`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined)
    }
    const onError = (e: ErrorEvent) => report(e.error ? `${e.error.name}: ${e.error.message}` : e.message, e.error?.stack)
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason
      report(r instanceof Error ? `${r.name}: ${r.message}` : `Unhandled rejection: ${String(r).slice(0, 300)}`, r instanceof Error ? r.stack : undefined)
    }
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])
  return null
}
