import type { RecordingSession, RecordingState, SessionLog, MessageType, PageInfo } from "../lib/types"
import { DEFAULT_API_URL, DEFAULT_APP_URL, getState, setState, setSession } from "../lib/storage"
import { apiFetch, getAuth, setAuth, signOut } from "../lib/auth"
import { uploadFile } from "../lib/upload"

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
    case "BEGIN_RECORDING":
      return beginRecording(message.tabId)
    case "PAUSE_RECORDING":
      return pause()
    case "RESUME_RECORDING":
      return resume()
    case "FINISH_RECORDING":
      return finish()
    case "DISCARD_RECORDING":
      return discard()
    case "REPLAY_LOG":
      return replayLog(message.log, sender)
    case "REPLAY_PAGE":
      return replayPage(message.info, sender)
    case "GET_REPLAY":
      return replayStatus(message.tabId)
    case "SAVE_REPLAY":
      return saveReplay(message.tabId)
    case "OFFSCREEN_EVENT":
      return onOffscreenEvent(message.event, message.error)
    case "OPEN_SIGN_IN":
      return openSignIn(message.returnTabId)
    case "AUTH_SIGN_IN":
      return signInFromWeb(message, sender)
    case "AUTH_SIGN_OUT":
      if (!fromOurSite(sender)) return { ok: false, error: "Not allowed" }
      await signOut()
      return { ok: true }
    default:
      return { error: "Unknown message type" }
  }
}

// ---------- sign-in through the website ----------

const SITE_ORIGINS = [new URL(DEFAULT_APP_URL).origin, "http://localhost:3002"]
let returnTabId: number | undefined

function fromOurSite(sender: chrome.runtime.MessageSender) {
  try {
    return !!sender.url && SITE_ORIGINS.includes(new URL(sender.url).origin)
  } catch {
    return false
  }
}

/** The popup's Sign in button: open the website, which signs the extension in. */
async function openSignIn(fromTabId?: number) {
  returnTabId = fromTabId
  await chrome.tabs.create({ url: `${DEFAULT_APP_URL}/extension/connect` })
  return { ok: true }
}

async function signInFromWeb(message: Extract<MessageType, { type: "AUTH_SIGN_IN" }>, sender: chrome.runtime.MessageSender) {
  if (!fromOurSite(sender)) return { ok: false, error: "Not allowed" }
  if (typeof message.token !== "string" || message.token.length > 200) return { ok: false, error: "Bad sign-in" }
  // Check the token really works before saving it.
  const res = await fetch(`${DEFAULT_API_URL}/auth/me`, { headers: { Authorization: `Bearer ${message.token}` } }).catch(() => null)
  if (!res?.ok) return { ok: false, error: "That sign-in did not work. Please try again." }
  const me = (await res.json()) as { email: string; name: string; workspace?: { name: string } }
  const old = await getAuth()
  if (old && old.token !== message.token) await signOut() // end the previous extension sign-in
  await setAuth({ token: message.token, email: me.email, name: me.name, workspaceName: me.workspace?.name })
  // Take the user back to the page they were on.
  const connectTab = sender.tab?.id
  const back = returnTabId
  returnTabId = undefined
  setTimeout(async () => {
    if (back) await chrome.tabs.update(back, { active: true }).catch(() => undefined)
    if (back && connectTab) await chrome.tabs.remove(connectTab).catch(() => undefined)
  }, 1800)
  return { ok: true }
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
  if (session.pausedAt) return { success: false } // paused: not in the video, so not in the report
  session.logs.push({ ...shiftForPauses(log, session), data: { ...log.data, tabId: sender.tab?.id } })
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
  if (session.pausedAt) return
  session.logs.push({
    type: "NAVIGATION",
    level: "INFO",
    message: `Opened ${tab.url}`,
    data: { url: tab.url, title: tab.title, tabId },
    timestamp: new Date(Date.now() - (session.pausedMs ?? 0)).toISOString(),
  })
  scheduleSave()
})



// ---------- recording: countdown, pause/resume, finish, discard ----------

const OFFSCREEN_URL = "tabs/offscreen.html"
const RESTRICTED = /^(chrome|chrome-extension|edge|about|devtools|view-source):|^https:\/\/chromewebstore\.google\.com|^https:\/\/chrome\.google\.com\/webstore/
let finishing = false

/** Log times shifted back by the paused time, so they match the (shorter) video. */
function shiftForPauses(log: SessionLog, session: RecordingSession): SessionLog {
  const paused = session.pausedMs ?? 0
  if (!paused) return log
  const t = Date.parse(log.timestamp)
  return Number.isFinite(t) ? { ...log, timestamp: new Date(t - paused).toISOString() } : log
}

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType] })
  if (contexts.length) return
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["USER_MEDIA" as chrome.offscreen.Reason],
    justification: "Record the tab the user is reporting a bug on",
  })
}

async function closeOffscreen() {
  await chrome.offscreen.closeDocument().catch(() => undefined)
}

const toOffscreen = (msg: Record<string, unknown>) =>
  chrome.runtime.sendMessage({ target: "offscreen", ...msg }) as Promise<{ ok: boolean; error?: string } | undefined>

function elapsedMs(session: RecordingSession) {
  if (!session.startTime) return 0
  const pausedNow = session.pausedAt ? Date.now() - session.pausedAt : 0
  return Math.max(0, Date.now() - session.startTime - (session.pausedMs ?? 0) - pausedNow)
}

function badgeText(ms: number) {
  const s = Math.floor(ms / 1000)
  return s < 600 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}m`
}

async function setBadge(text: string, color = "#EF4444") {
  await chrome.action.setBadgeBackgroundColor({ color })
  await chrome.action.setBadgeText({ text })
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: "#FFFFFF" })
}

async function updateBadge() {
  const session = currentState.session
  if (!currentState.isRecording || !session) return
  if (session.pausedAt) await setBadge("❚❚", "#F59E0B")
  else await setBadge(badgeText(elapsedMs(session)))
}

async function beginRecording(tabId?: number) {
  if (currentState.isRecording || finishing) return { ok: false, error: "Already recording" }
  if (!(await getAuth())) return { ok: false, error: "Please sign in first." }
  const tab = tabId ? await chrome.tabs.get(tabId).catch(() => undefined) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
  if (!tab?.id || !tab.url || RESTRICTED.test(tab.url)) return { ok: false, error: "This page can't be recorded. Open the website with the bug first." }
  try {
    // Tab capture: records just this tab, no "choose what to share" picker.
    const streamId = await new Promise<string>((resolve, reject) =>
      chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => (chrome.runtime.lastError || !id ? reject(new Error(chrome.runtime.lastError?.message || "Tab capture failed")) : resolve(id)))
    )
    await ensureOffscreen()
    const ready = await toOffscreen({ type: "PREPARE", streamId })
    if (!ready?.ok) throw new Error(ready?.error || "Could not start the tab recording")
  } catch (e) {
    await closeOffscreen()
    return { ok: false, error: e instanceof Error ? e.message : "Could not start recording" }
  }
  currentState = { isRecording: false, session: null }
  // 3-2-1 on the page (and on the badge, in case the page can't show it).
  void runCountdown(tab.id)
  return { ok: true }
}

async function runCountdown(tabId: number) {
  const shown = chrome.tabs.sendMessage(tabId, { type: "SHOW_COUNTDOWN" }).catch(() => null)
  for (const n of ["3", "2", "1"]) {
    await setBadge(n, "#3B82F6")
    await new Promise((r) => setTimeout(r, 800))
  }
  await Promise.race([shown, new Promise((r) => setTimeout(r, 400))])
  const go = await toOffscreen({ type: "GO" }).catch(() => undefined)
  if (!go?.ok) {
    await setBadge("")
    await closeOffscreen()
    return
  }
  await startRecording(tabId)
  await updateBadge()
}

async function pause() {
  const session = currentState.session
  if (!currentState.isRecording || !session || session.pausedAt) return { ok: false }
  await toOffscreen({ type: "PAUSE" })
  session.pausedAt = Date.now()
  session.status = "paused"
  await setState(currentState)
  await updateBadge()
  return { ok: true, state: currentState }
}

async function resume() {
  const session = currentState.session
  if (!currentState.isRecording || !session?.pausedAt) return { ok: false }
  await toOffscreen({ type: "RESUME" })
  session.pausedMs = (session.pausedMs ?? 0) + (Date.now() - session.pausedAt)
  session.pausedAt = undefined
  session.status = "recording"
  await setState(currentState)
  await updateBadge()
  return { ok: true, state: currentState }
}

async function discard() {
  await toOffscreen({ type: "CANCEL" }).catch(() => undefined)
  if (currentState.isRecording) await stopRecording()
  currentState = { isRecording: false, session: null }
  await setState(currentState)
  await setSession(null)
  await closeOffscreen()
  await setBadge("")
  return { ok: true }
}

/** Stop, create the report straight away, open it in BugSnap, and let the hidden page upload the video. */
async function finish() {
  if (finishing) return { ok: true }
  if (!currentState.isRecording || !currentState.session) return { ok: false, error: "No recording in progress" }
  finishing = true
  const live = currentState.session
  if (live.pausedAt) {
    live.pausedMs = (live.pausedMs ?? 0) + (Date.now() - live.pausedAt)
    live.pausedAt = undefined
  }
  const durationSec = Math.round(elapsedMs(live) / 1000)
  const stopped = await stopRecording()
  const session = (stopped as { session?: RecordingSession }).session ?? live
  await setBadge("…", "#3B82F6")
  try {
    const res = await apiFetch("/reports/quick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page: session.metadata,
        logs: session.logs,
        droppedLogs: session.droppedLogs ?? 0,
        startedAt: session.startTime,
        duration: durationSec,
        analyze: true,
        mediaPending: true,
      }),
    })
    if (!res.ok) throw new Error(`Saving the report failed (${res.status})`)
    const report = (await res.json()) as { id: string }
    const auth = await getAuth()
    // Open the report next to the page with the bug, right away.
    const target = session.targetTabId ? await chrome.tabs.get(session.targetTabId).catch(() => undefined) : undefined
    await chrome.tabs.create({ url: `${DEFAULT_APP_URL}/dashboard/reports/${report.id}`, active: true, ...(target ? { index: target.index + 1, windowId: target.windowId } : {}) })
    await toOffscreen({ type: "STOP", apiUrl: DEFAULT_API_URL, token: auth?.token ?? "", reportId: report.id, durationSec })
    return { ok: true, reportId: report.id }
  } catch (e) {
    await toOffscreen({ type: "CANCEL" }).catch(() => undefined)
    await closeOffscreen()
    finishing = false
    currentState = { isRecording: false, session, error: e instanceof Error ? e.message : "Could not save the report" }
    await setState(currentState)
    await setBadge("!", "#EF4444")
    return { ok: false, error: currentState.error }
  }
}

async function onOffscreenEvent(event: "tick" | "track-ended" | "done" | "error", error?: string) {
  if (event === "tick") return updateBadge()
  if (event === "track-ended") return currentState.isRecording ? finish() : undefined
  // Upload finished (or failed): tidy up.
  finishing = false
  await closeOffscreen()
  currentState = { isRecording: false, session: null, ...(event === "error" ? { error: error || "The video upload failed" } : {}) }
  await setState(currentState)
  await setSession(null)
  await setBadge(event === "error" ? "!" : "")
}

// Keyboard shortcuts (set in the manifest).
chrome.commands.onCommand.addListener(async (command, tab) => {
  await ready
  if (command === "toggle-recording") {
    if (currentState.isRecording) await finish()
    else await beginRecording(tab?.id)
  } else if (command === "pause-recording" && currentState.isRecording) {
    if (currentState.session?.pausedAt) await resume()
    else await pause()
  }
})

// If the browser restarted mid-recording, the capture is gone: clear the stale state.
ready.then(async () => {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType] }).catch(() => [])
  if (currentState.isRecording && !contexts.length) {
    currentState = { isRecording: false, session: null }
    await setState(currentState)
    await setBadge("")
  }
})


// ---------- instant replay: the last 2 minutes, even when you were not recording ----------

const REPLAY_MS = 2 * 60 * 1000
const REPLAY_MAX_LOGS = 600
const REPLAY_MAX_SHOTS = 6
type Replay = { logs: SessionLog[]; page?: PageInfo; shots: { at: number; dataUrl: string }[]; lastShot: number }
const replays = new Map<number, Replay>()
let replayLoaded: Promise<void> | null = null
let replaySaveTimer: ReturnType<typeof setTimeout> | null = null

// Session storage survives the service worker sleeping, and is wiped when the browser closes.
function loadReplays() {
  replayLoaded ??= chrome.storage.session
    .get("replays")
    .then((r) => {
      for (const [k, v] of Object.entries((r.replays ?? {}) as Record<string, Replay>)) replays.set(Number(k), v)
    })
    .catch(() => undefined)
  return replayLoaded
}
function persistReplays() {
  if (replaySaveTimer) return
  replaySaveTimer = setTimeout(() => {
    replaySaveTimer = null
    chrome.storage.session.set({ replays: Object.fromEntries(replays) }).catch(() => undefined)
  }, 1000)
}

function bufferFor(tabId: number) {
  let r = replays.get(tabId)
  if (!r) replays.set(tabId, (r = { logs: [], shots: [], lastShot: 0 }))
  return r
}

function prune(r: Replay) {
  const cutoff = Date.now() - REPLAY_MS
  r.logs = r.logs.filter((l) => Date.parse(l.timestamp) >= cutoff).slice(-REPLAY_MAX_LOGS)
  r.shots = r.shots.filter((s) => s.at >= cutoff).slice(-REPLAY_MAX_SHOTS)
}

async function snap(tab: chrome.tabs.Tab, r: Replay) {
  if (!tab.active || !tab.windowId || Date.now() - r.lastShot < 4000) return
  r.lastShot = Date.now()
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 70 }).catch(() => null)
  if (dataUrl) r.shots.push({ at: Date.now(), dataUrl })
}

async function replayLog(log: SessionLog, sender: chrome.runtime.MessageSender) {
  const tab = sender.tab
  if (!tab?.id || currentState.isRecording) return { ok: false }
  await loadReplays()
  const r = bufferFor(tab.id)
  r.logs.push({ ...log, data: { ...log.data, tabId: tab.id } })
  prune(r)
  // A screenshot of the moment something broke.
  if (log.level === "ERROR") await snap(tab, r)
  persistReplays()
  return { ok: true }
}

async function replayPage(info: PageInfo, sender: chrome.runtime.MessageSender) {
  if (!sender.tab?.id) return { ok: false }
  await loadReplays()
  const r = bufferFor(sender.tab.id)
  r.page = info
  r.logs.push({ type: "NAVIGATION", level: "INFO", message: `Opened ${info.url}`, data: { url: info.url, title: info.title }, timestamp: new Date().toISOString() })
  prune(r)
  persistReplays()
  return { ok: true }
}

async function replayStatus(tabId?: number) {
  await loadReplays()
  const { instantReplay } = await chrome.storage.local.get("instantReplay")
  const r = tabId ? replays.get(tabId) : undefined
  if (r) prune(r)
  return {
    ok: true,
    enabled: Boolean(instantReplay),
    events: r?.logs.length ?? 0,
    errors: r?.logs.filter((l) => l.level === "ERROR").length ?? 0,
    since: r?.logs[0]?.timestamp ?? null,
  }
}

async function saveReplay(tabId?: number) {
  await loadReplays()
  const tab = tabId ? await chrome.tabs.get(tabId).catch(() => undefined) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
  if (!tab?.id) return { ok: false, error: "No tab" }
  const r = replays.get(tab.id)
  if (!r || !r.logs.length) return { ok: false, error: "Nothing captured on this tab in the last 2 minutes yet." }
  prune(r)
  r.lastShot = 0
  await snap(tab, r) // and one of how it looks right now
  const logs = r.logs
  const startedAt = Date.parse(logs[0].timestamp)
  const page = r.page ?? { url: tab.url ?? "", title: tab.title ?? "", userAgent: navigator.userAgent, viewport: { width: tab.width ?? 0, height: tab.height ?? 0 } }
  try {
    const res = await apiFetch("/reports/quick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page,
        logs,
        startedAt,
        duration: Math.round((Date.now() - startedAt) / 1000),
        analyze: true,
        mediaPending: true,
      }),
    })
    if (!res.ok) throw new Error(`Saving the report failed (${res.status})`)
    const report = (await res.json()) as { id: string }
    const shots = [...r.shots]
    replays.delete(tab.id)
    persistReplays()
    await chrome.tabs.create({ url: `${DEFAULT_APP_URL}/dashboard/reports/${report.id}`, active: true, index: tab.index + 1, windowId: tab.windowId })
    // Upload the screenshots after the report is open; the page shows them when they arrive.
    void (async () => {
      const urls: string[] = []
      for (const [i, s] of shots.entries()) {
        try {
          const blob = await (await fetch(s.dataUrl)).blob()
          urls.push(await uploadFile("screenshot", blob, `replay-${i}.jpg`))
        } catch {
          // skip
        }
      }
      await apiFetch(`/reports/${report.id}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenshotUrls: urls }),
      }).catch(() => undefined)
    })()
    return { ok: true, reportId: report.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save" }
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (replays.delete(tabId)) persistReplays()
})

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "save-replay") await saveReplay(tab?.id)
})

export {}
