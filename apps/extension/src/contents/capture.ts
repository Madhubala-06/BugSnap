import type { PlasmoCSConfig } from "plasmo"
import type { SessionLog, MessageType } from "../lib/types"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_start",
}

let isCapturing = false

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message: MessageType) => {
  if (message.type === "RECORDING_STARTED") {
    startCapturing()
  } else if (message.type === "RECORDING_STOPPED") {
    stopCapturing()
  }
})

// Check if we should be capturing on load
chrome.runtime.sendMessage({ type: "GET_STATUS" }).then((response) => {
  if (response?.state?.isRecording) {
    startCapturing()
  }
})

function startCapturing() {
  if (isCapturing) return
  isCapturing = true

  // Send viewport info
  sendLog({
    type: "INFO",
    level: "INFO",
    message: "Recording started",
    data: {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      url: window.location.href,
      title: document.title,
    },
    timestamp: new Date().toISOString(),
  })

  // Capture console logs
  interceptConsole()

  // Capture clicks
  document.addEventListener("click", handleClick, true)

  // Capture errors
  window.addEventListener("error", handleError, true)
  window.addEventListener("unhandledrejection", handleUnhandledRejection, true)

  // Capture network requests
  interceptFetch()
  interceptXHR()
}

function stopCapturing() {
  isCapturing = false
  document.removeEventListener("click", handleClick, true)
  window.removeEventListener("error", handleError, true)
  window.removeEventListener("unhandledrejection", handleUnhandledRejection, true)
}

function sendLog(log: SessionLog) {
  if (!isCapturing) return
  chrome.runtime.sendMessage({ type: "ADD_LOG", log }).catch(() => {
    // Extension might be reloading
  })
}

// Intercept console methods
function interceptConsole() {
  const methods = ["log", "warn", "error", "info", "debug"] as const

  methods.forEach((method) => {
    const original = console[method]
    console[method] = (...args: unknown[]) => {
      original.apply(console, args)

      const level = method === "log" || method === "info" || method === "debug"
        ? "INFO"
        : method === "warn"
        ? "WARN"
        : "ERROR"

      sendLog({
        type: "CONSOLE",
        level,
        message: args.map((arg) => formatArg(arg)).join(" "),
        data: { method, args: args.map(serializeArg) },
        timestamp: new Date().toISOString(),
      })
    }
  })
}

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`
  try {
    return JSON.stringify(arg, null, 2)
  } catch {
    return String(arg)
  }
}

function serializeArg(arg: unknown): unknown {
  if (arg instanceof Error) {
    return { name: arg.name, message: arg.message, stack: arg.stack }
  }
  try {
    JSON.stringify(arg)
    return arg
  } catch {
    return String(arg)
  }
}

// Handle click events
function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target) return

  const elementInfo = {
    tagName: target.tagName,
    id: target.id || undefined,
    className: target.className || undefined,
    textContent: target.textContent?.slice(0, 100),
    href: (target as HTMLAnchorElement).href || undefined,
    type: (target as HTMLInputElement).type || undefined,
    name: (target as HTMLInputElement).name || undefined,
  }

  sendLog({
    type: "CLICK",
    level: "INFO",
    message: `Clicked on ${target.tagName}${target.id ? `#${target.id}` : ""}${target.className ? `.${target.className.split(" ")[0]}` : ""}`,
    data: {
      element: elementInfo,
      position: { x: event.clientX, y: event.clientY },
      path: getElementPath(target),
    },
    timestamp: new Date().toISOString(),
  })
}

function getElementPath(element: HTMLElement): string {
  const path: string[] = []
  let current: HTMLElement | null = element

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase()
    if (current.id) {
      selector += `#${current.id}`
    } else if (current.className) {
      selector += `.${current.className.split(" ")[0]}`
    }
    path.unshift(selector)
    current = current.parentElement
  }

  return path.join(" > ")
}

// Handle JavaScript errors
function handleError(event: ErrorEvent) {
  sendLog({
    type: "ERROR",
    level: "ERROR",
    message: event.message,
    data: {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error ? {
        name: event.error.name,
        message: event.error.message,
        stack: event.error.stack,
      } : undefined,
    },
    timestamp: new Date().toISOString(),
  })
}

// Handle unhandled promise rejections
function handleUnhandledRejection(event: PromiseRejectionEvent) {
  const reason = event.reason
  sendLog({
    type: "ERROR",
    level: "ERROR",
    message: `Unhandled Promise Rejection: ${reason?.message || reason}`,
    data: {
      reason: reason instanceof Error
        ? { name: reason.name, message: reason.message, stack: reason.stack }
        : reason,
    },
    timestamp: new Date().toISOString(),
  })
}

// Intercept fetch requests
function interceptFetch() {
  const originalFetch = window.fetch
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const method = init?.method || "GET"
    const startTime = Date.now()

    try {
      const response = await originalFetch(input, init)
      const duration = Date.now() - startTime

      sendLog({
        type: "NETWORK",
        level: response.ok ? "INFO" : "ERROR",
        message: `${method} ${url} - ${response.status}`,
        data: {
          url,
          method,
          status: response.status,
          statusText: response.statusText,
          duration,
          requestHeaders: init?.headers ? Object.fromEntries(new Headers(init.headers)) : undefined,
        },
        timestamp: new Date().toISOString(),
      })

      return response
    } catch (error) {
      const duration = Date.now() - startTime

      sendLog({
        type: "NETWORK",
        level: "ERROR",
        message: `${method} ${url} - Failed`,
        data: {
          url,
          method,
          error: error instanceof Error ? error.message : String(error),
          duration,
        },
        timestamp: new Date().toISOString(),
      })

      throw error
    }
  }
}

// Intercept XMLHttpRequest
function interceptXHR() {
  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL) {
    this._bugRecorderMethod = method
    this._bugRecorderUrl = typeof url === "string" ? url : url.href
    return originalOpen.apply(this, arguments as unknown as Parameters<typeof originalOpen>)
  }

  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const xhr = this
    const startTime = Date.now()

    xhr.addEventListener("loadend", function () {
      const duration = Date.now() - startTime

      sendLog({
        type: "NETWORK",
        level: xhr.status >= 400 ? "ERROR" : "INFO",
        message: `${xhr._bugRecorderMethod} ${xhr._bugRecorderUrl} - ${xhr.status}`,
        data: {
          url: xhr._bugRecorderUrl,
          method: xhr._bugRecorderMethod,
          status: xhr.status,
          statusText: xhr.statusText,
          duration,
        },
        timestamp: new Date().toISOString(),
      })
    })

    return originalSend.apply(this, arguments as unknown as Parameters<typeof originalSend>)
  }
}

// Type augmentation for XMLHttpRequest
declare global {
  interface XMLHttpRequest {
    _bugRecorderMethod?: string
    _bugRecorderUrl?: string
  }
}

export {}
