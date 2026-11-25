import type { SessionLog } from "./types"
import { getConfig } from "./storage"

export async function createSession(userId: string, metadata: Record<string, unknown>): Promise<{ id: string }> {
  const { apiUrl } = await getConfig()
  const response = await fetch(`${apiUrl}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, metadata }),
  })
  if (!response.ok) throw new Error("Failed to create session")
  return response.json()
}

export async function uploadLogs(sessionId: string, logs: SessionLog[]): Promise<void> {
  const { apiUrl } = await getConfig()
  const response = await fetch(`${apiUrl}/sessions/${sessionId}/logs/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logs }),
  })
  if (!response.ok) throw new Error("Failed to upload logs")
}

export async function uploadRecording(sessionId: string, blob: Blob): Promise<{ url: string }> {
  const { apiUrl } = await getConfig()

  // First upload the file
  const formData = new FormData()
  formData.append("file", blob, "recording.webm")

  const uploadResponse = await fetch(`${apiUrl}/upload/recording`, {
    method: "POST",
    body: formData,
  })
  if (!uploadResponse.ok) throw new Error("Failed to upload recording")
  const { url, filename } = await uploadResponse.json()

  // Then link it to the session
  const linkResponse = await fetch(`${apiUrl}/sessions/${sessionId}/recording`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      filename,
      size: blob.size,
      duration: 0, // Will be updated later
    }),
  })
  if (!linkResponse.ok) throw new Error("Failed to link recording")

  return { url }
}

export async function updateSessionStatus(sessionId: string, status: "RECORDING" | "PROCESSING" | "COMPLETED" | "FAILED"): Promise<void> {
  const { apiUrl } = await getConfig()
  const response = await fetch(`${apiUrl}/sessions/${sessionId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  })
  if (!response.ok) throw new Error("Failed to update session status")
}

export async function createBugReport(data: {
  sessionId: string
  workspaceId: string
  reporterId: string
  title: string
  description?: string
  stepsToReproduce: string[]
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  url?: string
  browserInfo?: Record<string, unknown>
}): Promise<{ id: string }> {
  const { apiUrl } = await getConfig()
  const response = await fetch(`${apiUrl}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error("Failed to create bug report")
  return response.json()
}
