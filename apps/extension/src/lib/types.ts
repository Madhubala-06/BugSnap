export type RecordingStatus = "idle" | "countdown" | "recording" | "paused" | "processing" | "uploading" | "done" | "error"

export interface SessionLog {
  type: "CONSOLE" | "NETWORK" | "CLICK" | "ERROR" | "NAVIGATION" | "INPUT"
  level: "DEBUG" | "INFO" | "WARN" | "ERROR"
  message: string
  data?: Record<string, unknown>
  timestamp: string
}

export interface PageInfo {
  url: string
  title: string
  userAgent: string
  language?: string
  viewport: { width: number; height: number }
  screen?: { width: number; height: number; pixelRatio: number }
}

export interface RecordingSession {
  id?: string
  status: RecordingStatus
  startTime?: number
  endTime?: number
  targetTabId?: number
  logs: SessionLog[]
  droppedLogs?: number
  metadata: PageInfo
  /** When the current pause began (ms), if paused. */
  pausedAt?: number
  /** Total paused time so far (ms). Paused parts are not in the video. */
  pausedMs?: number
}

export interface RecordingState {
  isRecording: boolean
  session: RecordingSession | null
  error?: string
}

export type MessageType =
  | { type: "START_RECORDING"; targetTabId?: number }
  | { type: "STOP_RECORDING" }
  | { type: "GET_STATUS" }
  | { type: "ADD_LOG"; log: SessionLog }
  | { type: "PAGE_INFO"; info: PageInfo }
  | { type: "RECORDING_STARTED"; session: RecordingSession }
  | { type: "RECORDING_STOPPED"; session: RecordingSession }
  | { type: "STATUS_UPDATE"; state: RecordingState }
  | { type: "ERROR"; error: string }
  | { type: "AUTH_SIGN_IN"; token: string; email: string; name?: string; workspaceName?: string }
  | { type: "AUTH_SIGN_OUT" }
  | { type: "OPEN_SIGN_IN"; returnTabId?: number }
  | { type: "BEGIN_RECORDING"; tabId?: number }
  | { type: "PAUSE_RECORDING" }
  | { type: "RESUME_RECORDING" }
  | { type: "FINISH_RECORDING" }
  | { type: "DISCARD_RECORDING" }
  | { type: "SHOW_COUNTDOWN" }
  | { type: "REPLAY_LOG"; log: SessionLog }
  | { type: "REPLAY_PAGE"; info: PageInfo }
  | { type: "GET_REPLAY"; tabId?: number }
  | { type: "SAVE_REPLAY"; tabId?: number }
  | { type: "OFFSCREEN_EVENT"; event: "tick" | "track-ended" | "done" | "error"; error?: string }
