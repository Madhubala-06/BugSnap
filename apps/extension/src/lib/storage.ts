import type { RecordingState, RecordingSession } from "./types"

const STORAGE_KEYS = {
  STATE: "recordingState",
  SESSION: "currentSession",
  API_URL: "apiUrl",
  USER_ID: "userId",
  WORKSPACE_ID: "workspaceId",
} as const

export async function getState(): Promise<RecordingState> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.STATE)
  return result[STORAGE_KEYS.STATE] || { isRecording: false, session: null }
}

export async function setState(state: RecordingState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.STATE]: state })
}

export async function getSession(): Promise<RecordingSession | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SESSION)
  return result[STORAGE_KEYS.SESSION] || null
}

export async function setSession(session: RecordingSession | null): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SESSION]: session })
}

export async function getConfig(): Promise<{
  apiUrl: string
  userId: string | null
  workspaceId: string | null
}> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.API_URL,
    STORAGE_KEYS.USER_ID,
    STORAGE_KEYS.WORKSPACE_ID,
  ])
  return {
    apiUrl: result[STORAGE_KEYS.API_URL] || "http://localhost:3001",
    userId: result[STORAGE_KEYS.USER_ID] || null,
    workspaceId: result[STORAGE_KEYS.WORKSPACE_ID] || null,
  }
}

export async function setConfig(config: {
  apiUrl?: string
  userId?: string
  workspaceId?: string
}): Promise<void> {
  const updates: Record<string, string> = {}
  if (config.apiUrl) updates[STORAGE_KEYS.API_URL] = config.apiUrl
  if (config.userId) updates[STORAGE_KEYS.USER_ID] = config.userId
  if (config.workspaceId) updates[STORAGE_KEYS.WORKSPACE_ID] = config.workspaceId
  await chrome.storage.local.set(updates)
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove([STORAGE_KEYS.STATE, STORAGE_KEYS.SESSION])
}
