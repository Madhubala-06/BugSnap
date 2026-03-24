const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export interface Recording {
  filename: string
  url: string
  size: number
  createdAt: string
}

export interface Thumbnail {
  filename: string
  url: string
  size: number
  createdAt: string
}

export async function getRecordings(): Promise<Recording[]> {
  const response = await fetch(`${API_URL}/upload/recordings`, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch recordings")
  }
  return response.json()
}

export async function getThumbnails(): Promise<Thumbnail[]> {
  const response = await fetch(`${API_URL}/upload/thumbnails`, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch thumbnails")
  }
  return response.json()
}

export async function getHealthStatus(): Promise<{ status: string; database: string }> {
  const response = await fetch(`${API_URL}/`, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch health status")
  }
  return response.json()
}

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
export type ReportStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "WONT_FIX"

export interface SessionLog {
  id: string
  type: string
  level: string
  message: string
  timestamp: string
  metadata?: Record<string, unknown>
}

export interface BugReport {
  id: string
  title: string
  description: string | null
  severity: Severity
  status: ReportStatus
  stepsToReproduce: string[]
  expectedResult: string | null
  actualResult: string | null
  url: string | null
  aiSummary: string | null
  aiRootCause: string | null
  aiSuggestions: string[]
  browserInfo?: {
    recordingUrl?: string
    screenshotUrls?: string[]
  } | null
  createdAt: string
  updatedAt: string
  reporter?: {
    id: string
    name: string
    email: string
  } | null
  session?: {
    id: string
    recording?: {
      id: string
      url: string
    } | null
    logs?: SessionLog[]
  } | null
}

export interface GlobalStats {
  total: number
  critical: number
  pending: number
  bySeverity: Record<string, number>
  byStatus: Record<string, number>
}

export async function getBugReports(filters?: {
  status?: ReportStatus
  severity?: Severity
  limit?: number
}): Promise<BugReport[]> {
  const params = new URLSearchParams()
  if (filters?.status) params.append("status", filters.status)
  if (filters?.severity) params.append("severity", filters.severity)
  if (filters?.limit) params.append("limit", filters.limit.toString())

  const response = await fetch(`${API_URL}/reports?${params}`, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch bug reports")
  }
  return response.json()
}

export async function getRecentBugReports(limit: number = 5): Promise<BugReport[]> {
  const response = await fetch(`${API_URL}/reports/recent?limit=${limit}`, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch recent bug reports")
  }
  return response.json()
}

export async function getGlobalStats(): Promise<GlobalStats> {
  const response = await fetch(`${API_URL}/reports/global-stats`, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch global stats")
  }
  return response.json()
}

export async function getBugReport(id: string): Promise<BugReport> {
  const response = await fetch(`${API_URL}/reports/${id}`, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch bug report")
  }
  return response.json()
}

export async function updateBugReportStatus(id: string, status: ReportStatus): Promise<BugReport> {
  const response = await fetch(`${API_URL}/reports/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  })
  if (!response.ok) {
    throw new Error("Failed to update bug report status")
  }
  return response.json()
}

export async function updateBugReport(id: string, data: {
  title?: string
  description?: string
  stepsToReproduce?: string[]
  expectedResult?: string
  actualResult?: string
  severity?: Severity
}): Promise<BugReport> {
  const response = await fetch(`${API_URL}/reports/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error("Failed to update bug report")
  }
  return response.json()
}

export async function deleteBugReport(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/reports/${id}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    throw new Error("Failed to delete bug report")
  }
}
