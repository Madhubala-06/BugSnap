// Talks to the BugSnap Chrome extension through its small helper script, which only runs
// on BugSnap's own pages. Messages never leave this window and are only sent to our own origin.
const FROM_WEB = "bugsnap-web"
const FROM_EXTENSION = "bugsnap-extension"

export function extensionInstalled() {
  return typeof document !== "undefined" && document.documentElement.dataset.bugsnapExtension !== undefined
}

/** Send a message to the extension and wait for its reply (or give up after `timeoutMs`). */
export function askExtension<T = { ok: boolean; error?: string }>(type: string, payload: Record<string, unknown> = {}, timeoutMs = 4000): Promise<T | null> {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2)
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return
      const data = event.data as { source?: string; replyTo?: string } | null
      if (data?.source !== FROM_EXTENSION || data.replyTo !== id) return
      window.removeEventListener("message", onMessage)
      clearTimeout(timer)
      resolve(data as T)
    }
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage)
      resolve(null)
    }, timeoutMs)
    window.addEventListener("message", onMessage)
    window.postMessage({ source: FROM_WEB, type, id, ...payload }, window.location.origin)
  })
}
