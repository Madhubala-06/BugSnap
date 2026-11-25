// Isolated-world relay. Talks to the extension, forwards logs from the page
// hook (capture-main.ts), and records clicks, inputs and page info.
import type { PlasmoCSConfig } from "plasmo"
import type { MessageType, PageInfo, SessionLog } from "../lib/types"
import { clip } from "../lib/redact"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_start",
}

let isCapturing = false
// Instant replay: when on, keep sending events to the extension's 2-minute buffer even when not recording.
let replayOn = false

chrome.storage.local
  .get("instantReplay")
  .then((r) => setReplay(Boolean(r.instantReplay)))
  .catch(() => undefined)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "instantReplay" in changes) setReplay(Boolean(changes.instantReplay.newValue))
})

function setReplay(on: boolean) {
  replayOn = on
  if (isCapturing) return
  if (on) {
    window.postMessage({ source: "bugsnap-relay", command: "start" }, "*")
    listen(true)
    const sendInfo = () => chrome.runtime.sendMessage({ type: "REPLAY_PAGE", info: pageInfo() }).catch(() => undefined)
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sendInfo, { once: true })
    else sendInfo()
  } else {
    window.postMessage({ source: "bugsnap-relay", command: "stop" }, "*")
    listen(false)
  }
}

function listen(on: boolean) {
  if (on) {
    document.addEventListener("click", handleClick, true)
    document.addEventListener("change", handleChange, true)
  } else {
    document.removeEventListener("click", handleClick, true)
    document.removeEventListener("change", handleChange, true)
  }
}

chrome.runtime.onMessage.addListener((message: MessageType, _sender, sendResponse) => {
  if (message.type === "RECORDING_STARTED") startCapturing()
  else if (message.type === "RECORDING_STOPPED") stopCapturing()
  else if (message.type === "SHOW_COUNTDOWN") {
    showCountdown().then(() => sendResponse({ ok: true }))
    return true
  }
})

/** Big 3-2-1 in the middle of the page. Removed before the video starts. */
function showCountdown(): Promise<void> {
  return new Promise((resolve) => {
    const host = document.createElement("div")
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none"
    const root = host.attachShadow({ mode: "closed" })
    root.innerHTML = `
      <style>
        .wrap{position:fixed;inset:0;display:grid;place-items:center;background:rgba(10,10,11,.35);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
        .card{display:flex;flex-direction:column;align-items:center;gap:10px}
        .num{width:120px;height:120px;border-radius:999px;display:grid;place-items:center;background:rgba(17,17,19,.92);color:#fff;font-size:56px;font-weight:600;box-shadow:0 0 0 6px rgba(59,130,246,.35),0 20px 60px rgba(0,0,0,.5);animation:pop .8s ease-out}
        .hint{color:#fff;font-size:14px;background:rgba(17,17,19,.85);padding:6px 12px;border-radius:999px}
        @keyframes pop{0%{transform:scale(.6);opacity:0}30%{transform:scale(1.05);opacity:1}100%{transform:scale(1)}}
        @media (prefers-reduced-motion: reduce){.num{animation:none}}
      </style>
      <div class="wrap"><div class="card"><div class="num">3</div><div class="hint">BugSnap is about to record this tab</div></div></div>`
    document.documentElement.appendChild(host)
    const num = root.querySelector(".num") as HTMLElement
    let n = 3
    const timer = setInterval(() => {
      n -= 1
      if (n > 0) {
        num.textContent = String(n)
        num.style.animation = "none"
        void num.offsetWidth
        num.style.animation = ""
        return
      }
      clearInterval(timer)
      host.remove()
      // Let the page repaint without the overlay before recording starts.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }, 800)
  })
}

chrome.runtime
  .sendMessage({ type: "GET_STATUS" })
  .then((response) => {
    if (response?.state?.isRecording) startCapturing()
  })
  .catch(() => {
    // extension reloading
  })

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== "bugsnap-main") return
  const log = event.data.log as SessionLog
  if (log && typeof log.message === "string") send({ type: "ADD_LOG", log })
})

function send(message: MessageType) {
  if (!isCapturing && message.type === "ADD_LOG") {
    if (!replayOn) return
    chrome.runtime.sendMessage({ type: "REPLAY_LOG", log: message.log }).catch(() => undefined)
    return
  }
  chrome.runtime.sendMessage(message).catch(() => {
    // extension reloading
  })
}

function pageInfo(): PageInfo {
  return {
    url: location.href,
    title: document.title,
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    screen: { width: screen.width, height: screen.height, pixelRatio: window.devicePixelRatio },
  }
}

function startCapturing() {
  if (isCapturing) return
  isCapturing = true
  listen(false) // re-added below; avoids double listeners when replay was on
  window.postMessage({ source: "bugsnap-relay", command: "start" }, "*")
  const sendInfo = () => send({ type: "PAGE_INFO", info: pageInfo() })
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sendInfo, { once: true })
  else sendInfo()
  listen(true)
}

function stopCapturing() {
  isCapturing = false
  // With instant replay on, keep the page hooks running for the buffer.
  if (replayOn) return
  window.postMessage({ source: "bugsnap-relay", command: "stop" }, "*")
  listen(false)
}

function describe(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const field = el as HTMLInputElement
  const label =
    el.getAttribute("aria-label") ||
    field.labels?.[0]?.textContent?.trim().replace(/\s+/g, " ").slice(0, 60) ||
    field.placeholder ||
    field.name ||
    (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60)
  return label ? `${tag} "${label}"` : tag
}

function cssPath(element: Element): string {
  const parts: string[] = []
  let current: Element | null = element
  while (current && current !== document.body && parts.length < 6) {
    let part = current.tagName.toLowerCase()
    if (current.id) {
      parts.unshift(`${part}#${CSS.escape(current.id)}`)
      break
    }
    const testId = current.getAttribute("data-testid")
    if (testId) part += `[data-testid="${testId}"]`
    else if (typeof current.className === "string" && current.className.trim()) {
      part += `.${CSS.escape(current.className.trim().split(/\s+/)[0])}`
    }
    parts.unshift(part)
    current = current.parentElement
  }
  return parts.join(" > ")
}

function handleClick(event: MouseEvent) {
  const raw = event.target as Element | null
  if (!raw) return
  const target = raw.closest("button, a, [role=button], input, select, textarea, label, summary") || raw
  send({
    type: "ADD_LOG",
    log: {
      type: "CLICK",
      level: "INFO",
      message: `Clicked ${describe(target)}`,
      data: {
        selector: cssPath(target),
        href: (target as HTMLAnchorElement).href || undefined,
        position: { x: event.clientX, y: event.clientY },
        url: location.href,
      },
      timestamp: new Date().toISOString(),
    },
  })
}

function handleChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  if (!target || !("value" in target)) return
  const sensitive = target.type === "password" || /pass|card|cvv|otp|ssn|secret|token/i.test(target.name + target.id)
  send({
    type: "ADD_LOG",
    log: {
      type: "INPUT",
      level: "INFO",
      // Never record what the user typed, only that a field changed.
      message: `Changed ${describe(target)}${sensitive ? " (sensitive)" : ""}`,
      data: { selector: cssPath(target), inputType: target.type, length: clip(String(target.value ?? "")).length },
      timestamp: new Date().toISOString(),
    },
  })
}

export {}
