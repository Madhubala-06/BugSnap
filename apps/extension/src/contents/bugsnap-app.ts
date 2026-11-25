import type { PlasmoCSConfig } from "plasmo"

// Runs only on BugSnap's own website. It lets the signed-in web app hand the extension its
// own sign-in (and sign it out), so nobody has to type a code into the popup.
export const config: PlasmoCSConfig = {
  matches: ["https://bugsnap-web.vercel.app/*", "http://localhost:3002/*"],
  run_at: "document_start",
}

// Lets the web app see that the extension is installed.
document.documentElement.dataset.bugsnapExtension = chrome.runtime.getManifest().version

const HANDLED: Record<string, string> = { BUGSNAP_SIGN_IN: "AUTH_SIGN_IN", BUGSNAP_SIGN_OUT: "AUTH_SIGN_OUT" }

window.addEventListener("message", async (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return
  const data = event.data as { source?: string; type?: string; id?: string; [k: string]: unknown } | null
  if (data?.source !== "bugsnap-web" || !data.id || !data.type || !HANDLED[data.type]) return
  const { source: _s, type, id, ...payload } = data
  const reply = await chrome.runtime
    .sendMessage({ type: HANDLED[type], ...payload })
    .catch(() => ({ ok: false, error: "The extension did not answer. Reload this page and try again." }))
  window.postMessage({ source: "bugsnap-extension", replyTo: id, ...reply }, window.location.origin)
})
