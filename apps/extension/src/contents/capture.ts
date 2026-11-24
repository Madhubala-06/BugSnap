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

chrome.runtime.onMessage.addListener((message: MessageType) => {
  if (message.type === "RECORDING_STARTED") startCapturing()
  else if (message.type === "RECORDING_STOPPED") stopCapturing()
})

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
  if (!isCapturing && message.type === "ADD_LOG") return
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
  window.postMessage({ source: "bugsnap-relay", command: "start" }, "*")
  const sendInfo = () => send({ type: "PAGE_INFO", info: pageInfo() })
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sendInfo, { once: true })
  else sendInfo()
  document.addEventListener("click", handleClick, true)
  document.addEventListener("change", handleChange, true)
}

function stopCapturing() {
  isCapturing = false
  window.postMessage({ source: "bugsnap-relay", command: "stop" }, "*")
  document.removeEventListener("click", handleClick, true)
  document.removeEventListener("change", handleChange, true)
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
