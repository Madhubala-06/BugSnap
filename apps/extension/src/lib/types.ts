export type RecordingStatus = "idle" | "recording" | "processing" | "uploading" | "done" | "error"

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
