export type RecordingStatus = "idle" | "recording" | "processing" | "uploading" | "done" | "error"

export interface SessionLog {
  type: "CONSOLE" | "NETWORK" | "CLICK" | "ERROR" | "NAVIGATION"
  level: "DEBUG" | "INFO" | "WARN" | "ERROR"
  message: string
  data?: Record<string, unknown>
  timestamp: string
}

export interface RecordingSession {
  id?: string
  status: RecordingStatus
  startTime?: number
  endTime?: number
  logs: SessionLog[]
  metadata: {
    url: string
    title: string
    userAgent: string
    viewport: { width: number; height: number }
  }
}

export interface RecordingState {
  isRecording: boolean
  session: RecordingSession | null
  error?: string
}

export type MessageType =
  | { type: "START_RECORDING" }
  | { type: "STOP_RECORDING" }
  | { type: "GET_STATUS" }
  | { type: "ADD_LOG"; log: SessionLog }
  | { type: "RECORDING_STARTED"; session: RecordingSession }
  | { type: "RECORDING_STOPPED"; session: RecordingSession }
  | { type: "STATUS_UPDATE"; state: RecordingState }
  | { type: "ERROR"; error: string }
