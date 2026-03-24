import type { RecordingSession, RecordingState, SessionLog, MessageType } from "../lib/types"
import { getState, setState, setSession, clearSession } from "../lib/storage"

// Current recording state
let currentState: RecordingState = {
  isRecording: false,
  session: null,
}

// Initialize state from storage
chrome.runtime.onInstalled.addListener(async () => {
  currentState = await getState()
  console.log("BugSnap installed")
})

// Load state on startup
chrome.runtime.onStartup.addListener(async () => {
  currentState = await getState()
})

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message: MessageType, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse)
  return true // Keep channel open for async response
})

async function handleMessage(
  message: MessageType,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (message.type) {
    case "START_RECORDING":
      return startRecording()

    case "STOP_RECORDING":
      return stopRecording()

    case "GET_STATUS":
      return { state: currentState }

    case "ADD_LOG":
      return addLog(message.log)

    default:
      return { error: "Unknown message type" }
  }
}

async function startRecording(): Promise<{ success: boolean; session?: RecordingSession; error?: string }> {
  try {
    // Get current tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !tab.url) {
      return { success: false, error: "No active tab" }
    }

    // Create new session
    const session: RecordingSession = {
      status: "recording",
      startTime: Date.now(),
      logs: [],
      metadata: {
        url: tab.url,
        title: tab.title || "",
        userAgent: navigator.userAgent,
        viewport: { width: 0, height: 0 },
      },
    }

    currentState = {
      isRecording: true,
      session,
    }

    await setState(currentState)
    await setSession(session)

    // Notify content scripts about recording start
    // Content script is already injected via manifest, just send message
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "RECORDING_STARTED", session })
    } catch {
      // Content script might not be ready yet, that's ok
      console.log("Content script not ready, it will check status on load")
    }

    return { success: true, session }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Failed to start recording"
    currentState.error = errorMsg
    await setState(currentState)
    return { success: false, error: errorMsg }
  }
}

async function stopRecording(): Promise<{ success: boolean; session?: RecordingSession; error?: string }> {
  try {
    if (!currentState.isRecording || !currentState.session) {
      return { success: false, error: "No recording in progress" }
    }

    const session: RecordingSession = {
      ...currentState.session,
      status: "processing",
      endTime: Date.now(),
    }

    currentState = {
      isRecording: false,
      session,
    }

    await setState(currentState)
    await setSession(session)

    // Notify all tabs about recording stop
    notifyAllTabs({ type: "RECORDING_STOPPED", session })

    return { success: true, session }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Failed to stop recording"
    return { success: false, error: errorMsg }
  }
}

async function addLog(log: SessionLog): Promise<{ success: boolean }> {
  if (!currentState.isRecording || !currentState.session) {
    return { success: false }
  }

  currentState.session.logs.push(log)
  await setSession(currentState.session)

  return { success: true }
}

function notifyAllTabs(message: MessageType): void {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // Tab might not have content script loaded
        })
      }
    })
  })
}

// Listen for tab updates to track navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (currentState.isRecording && changeInfo.status === "complete" && tab.url) {
    addLog({
      type: "NAVIGATION",
      level: "INFO",
      message: `Navigated to ${tab.url}`,
      data: { url: tab.url, title: tab.title },
      timestamp: new Date().toISOString(),
    })
  }
})

export {}
