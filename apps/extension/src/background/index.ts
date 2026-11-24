import type { RecordingSession, RecordingState, SessionLog, MessageType, PageInfo } from "../lib/types"
import { getState, setState, setSession } from "../lib/storage"

const MAX_LOGS = 1000

let currentState: RecordingState = { isRecording: false, session: null }
const ready = getState().then((saved) => {
  currentState = saved
})

// Service workers sleep; batch storage writes instead of writing per log.
let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave() {
  if (saveTimer) return
  saveTimer = setTimeout(async () => {
    saveTimer = null
    await setState(currentState)
    await setSession(currentState.session)
  }, 500)
}

chrome.runtime.onMessage.addListener((message: MessageType, sender, sendResponse) => {
  ready.then(() => handleMessage(message, sender)).then(sendResponse)
  return true
})

async function handleMessage(message: MessageType, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case "START_RECORDING":
      return startRecording(message.targetTabId)
    case "STOP_RECORDING":
      return stopRecording()
    case "GET_STATUS":
      return { state: currentState }
    case "ADD_LOG":
      return addLog(message.log, sender)
    case "PAGE_INFO":
      return setPageInfo(message.info, sender)
    default:
      return { error: "Unknown message type" }
  }
}

async function pickTargetTab(targetTabId?: number): Promise<chrome.tabs.Tab | undefined> {
  if (targetTabId) {
    try {
      return await chrome.tabs.get(targetTabId)
    } catch {
      // tab closed
    }
  }
  // Fall back to the most recent normal web tab (not the recorder page).
  const tabs = await chrome.tabs.query({ lastFocusedWindow: true })
  return tabs
    .filter((t) => t.url && /^https?:/.test(t.url))
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0]
}

async function startRecording(targetTabId?: number) {
  try {
    const tab = await pickTargetTab(targetTabId)
    const session: RecordingSession = {
      status: "recording",
      startTime: Date.now(),
      targetTabId: tab?.id,
      logs: [],
      droppedLogs: 0,
      metadata: {
        url: tab?.url || "",
        title: tab?.title || "",
        userAgent: navigator.userAgent,
        viewport: { width: tab?.width ?? 0, height: tab?.height ?? 0 },
      },
    }
    currentState = { isRecording: true, session }
    await setState(currentState)
    await setSession(session)
    notifyAllTabs({ type: "RECORDING_STARTED", session })
    return { success: true, session }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Failed to start recording"
    currentState.error = errorMsg
    await setState(currentState)
    return { success: false, error: errorMsg }
  }
}

async function stopRecording() {
  // Safe to call twice (popup Stop and recorder Stop can both fire).
  if (!currentState.isRecording) {
    if (currentState.session?.endTime) return { success: true, session: currentState.session }
    return { success: false, error: "No recording in progress" }
  }
  const session: RecordingSession = { ...currentState.session!, status: "processing", endTime: Date.now() }
  currentState = { isRecording: false, session }
  await setState(currentState)
  await setSession(session)
  notifyAllTabs({ type: "RECORDING_STOPPED", session })
  return { success: true, session }
}

function addLog(log: SessionLog, sender: chrome.runtime.MessageSender) {
  const session = currentState.session
  if (!currentState.isRecording || !session) return { success: false }
  if (session.logs.length >= MAX_LOGS) {
    session.droppedLogs = (session.droppedLogs ?? 0) + 1
    return { success: false }
  }
  session.logs.push({ ...log, data: { ...log.data, tabId: sender.tab?.id } })
  scheduleSave()
  return { success: true }
}

function setPageInfo(info: PageInfo, sender: chrome.runtime.MessageSender) {
  const session = currentState.session
  if (!currentState.isRecording || !session) return { success: false }
  // Prefer the tab we are recording; otherwise take the first page that reports in.
  const isTarget = sender.tab?.id === session.targetTabId
  if (isTarget || !session.metadata.viewport.width || !session.targetTabId) {
    session.metadata = { ...session.metadata, ...info }
    if (!session.targetTabId && sender.tab?.id) session.targetTabId = sender.tab.id
    scheduleSave()
  }
  return { success: true }
}

function notifyAllTabs(message: MessageType): void {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id && tab.url && /^https?:|^file:/.test(tab.url)) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // no content script in this tab
        })
      }
    })
  })
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const session = currentState.session
  if (!currentState.isRecording || !session || changeInfo.status !== "complete" || !tab.url) return
  if (session.targetTabId && tabId !== session.targetTabId) return
  session.logs.push({
    type: "NAVIGATION",
    level: "INFO",
    message: `Opened ${tab.url}`,
    data: { url: tab.url, title: tab.title, tabId },
    timestamp: new Date().toISOString(),
  })
  scheduleSave()
})

export {}
