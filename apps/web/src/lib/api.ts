import { API_URL, authFetch, type Role } from "./auth"

export interface Recording {
  filename: string
  url: string
  size: number
  createdAt: string
  reportId?: string
  reportTitle?: string
}

export interface Thumbnail {
  filename: string
  url: string
  size: number
  createdAt: string
  reportId?: string
  reportTitle?: string
}

export async function getRecordings(): Promise<Recording[]> {
  const response = await authFetch(`${API_URL}/upload/recordings`, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch recordings")
  }
  return response.json()
}

export async function getThumbnails(): Promise<Thumbnail[]> {
  const response = await authFetch(`${API_URL}/upload/thumbnails`, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch thumbnails")
  }
  return response.json()
}

export async function getHealthStatus(): Promise<{ status: string; database: string }> {
  const response = await authFetch(`${API_URL}/`, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch health status")
  }
  return response.json()
}

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
export type ReportStatus = "OPEN" | "IN_PROGRESS" | "FIX_READY" | "RESOLVED" | "CLOSED" | "WONT_FIX"

export interface SessionLog {
  id?: string
  type: string
  level: string
  message: string
  timestamp: string
  data?: Record<string, unknown>
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
    mediaPending?: boolean
    mediaPendingSince?: number
    mediaError?: string
    screenshotUrls?: string[]
    duration?: number
    affectedArea?: string
    aiError?: string
    droppedLogs?: number
    logs?: SessionLog[]
    logSummary?: { total: number; errors: number; warnings: number; failedRequests: number; clicks: number }
    startedAt?: number
    source?: "extension" | "widget"
    reporter?: { email?: string; name?: string }
    userNote?: string
    page?: {
      url?: string
      title?: string
      userAgent?: string
      language?: string
      viewport?: { width: number; height: number }
      screen?: { width: number; height: number; pixelRatio: number }
    }
  } | null
  number?: number | null
  priority?: string
  labels?: string[]
  assignee?: { id: string; name: string; email: string } | null
  assigneeId?: string | null
  project?: { id: string; name: string; color: string } | null
  projectId?: string | null
  links?: ReportLink[]
  verifications?: Verification[]
  shareToken?: string | null
  errorSignature?: string | null
  aiStatus?: string | null
  duplicateCount?: number
  duplicates?: { id: string; title: string; status: ReportStatus; createdAt: string }[]
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

  const response = await authFetch(`${API_URL}/reports?${params}`, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch bug reports")
  }
  return response.json()
}

export async function getRecentBugReports(limit: number = 5): Promise<BugReport[]> {
  const response = await authFetch(`${API_URL}/reports/recent?limit=${limit}`, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch recent bug reports")
  }
  return response.json()
}

export async function getGlobalStats(): Promise<GlobalStats> {
  const response = await authFetch(`${API_URL}/reports/global-stats`, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch global stats")
  }
  return response.json()
}

export async function getBugReport(id: string): Promise<BugReport> {
  const response = await authFetch(`${API_URL}/reports/${id}`, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch bug report")
  }
  return response.json()
}

export async function updateBugReportStatus(id: string, status: ReportStatus): Promise<BugReport> {
  const response = await authFetch(`${API_URL}/reports/${id}/status`, {
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
  screenshotUrls?: string[]
  status?: ReportStatus
  priority?: string
  labels?: string[]
  assigneeId?: string | null
  projectId?: string | null
}): Promise<BugReport> {
  const response = await authFetch(`${API_URL}/reports/${id}`, {
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
  const response = await authFetch(`${API_URL}/reports/${id}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    throw new Error("Failed to delete bug report")
  }
}

/** Stores an edited screenshot and returns its new URL. */
export async function uploadImage(dataUrl: string): Promise<string> {
  const response = await authFetch(`${API_URL}/upload/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  })
  if (!response.ok) throw new Error("Failed to save image")
  return (await response.json()).url
}

async function json<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(typeof body.message === "string" ? body.message : fallback)
  }
  return response.json()
}

export async function analyzeReport(id: string): Promise<{ ok: boolean; pending?: boolean; error?: string }> {
  return json(await authFetch(`${API_URL}/reports/${id}/analyze`, { method: "POST" }), "AI write-up failed")
}

export async function setReportShared(id: string, shared: boolean): Promise<{ shareToken: string | null }> {
  return json(await authFetch(`${API_URL}/reports/${id}/share`, { method: shared ? "POST" : "DELETE" }), "Could not change sharing")
}

export async function getReportText(id: string, kind: "playwright" | "fix-prompt"): Promise<string> {
  const response = await authFetch(`${API_URL}/reports/${id}/${kind}`)
  if (!response.ok) throw new Error("Could not load")
  return response.text()
}

/** Shared report, no sign-in needed. */
export async function getSharedReport(token: string): Promise<BugReport> {
  const response = await fetch(`${API_URL}/public/reports/${encodeURIComponent(token)}`)
  return json(response, "This link is no longer shared")
}

export interface AiStatus {
  key?: string
  usingServerKey: boolean
  sharedUsed: number
  sharedLimit: number
  githubRepo: string | null
}

export interface Onboarding {
  recordedFirstBug: boolean
  gotAiWriteUp: boolean
  sharedReport: boolean
  connectedAgent: boolean
  reports: number
  ai: AiStatus
}

export async function getOnboarding(): Promise<Onboarding> {
  return json(await authFetch(`${API_URL}/settings/onboarding`), "Could not load")
}

export async function getAiStatus(): Promise<AiStatus> {
  return json(await authFetch(`${API_URL}/settings/gemini-key`), "Could not load")
}

export async function saveGithubRepo(repo: string): Promise<{ githubRepo: string | null }> {
  return json(
    await authFetch(`${API_URL}/settings/github`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo }),
    }),
    "Could not save the repository"
  )
}

export interface ApiKey {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  createdAt: string
  key?: string
}

export async function listApiKeys(): Promise<ApiKey[]> {
  return json(await authFetch(`${API_URL}/api-keys`), "Could not load keys")
}

export async function createApiKey(name: string): Promise<ApiKey> {
  return json(
    await authFetch(`${API_URL}/api-keys`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }),
    "Could not create a key"
  )
}

export async function revokeApiKey(id: string): Promise<void> {
  await authFetch(`${API_URL}/api-keys/${id}`, { method: "DELETE" })
}

export { API_URL }

export interface Member {
  id: string
  name: string
  email: string
}

export interface WidgetConfig {
  label: string
  position: "bottom-right" | "bottom-left"
  color: string
}

export interface Project {
  id: string
  name: string
  color: string
  hosts: string[]
  openCount?: number
  widgetKey?: string | null
  widgetEnabled?: boolean
  widgetConfig?: WidgetConfig | null
}

export interface ActivityItem {
  type: "activity" | "comment"
  id: string
  kind?: string
  body?: string
  data?: Record<string, unknown> | null
  actor?: { id: string; name: string; email: string } | null
  createdAt: string
}

export const listMembers = async (): Promise<Member[]> => json(await authFetch(`${API_URL}/workspace/members`), "Could not load members")
export const listLabels = async (): Promise<{ label: string; count: number }[]> => json(await authFetch(`${API_URL}/workspace/labels`), "Could not load labels")
export const listProjects = async (): Promise<Project[]> => json(await authFetch(`${API_URL}/projects`), "Could not load projects")

export async function createProject(name: string, hosts: string[]): Promise<Project> {
  return json(
    await authFetch(`${API_URL}/projects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, hosts }) }),
    "Could not create the project"
  )
}

export const getActivity = async (id: string): Promise<ActivityItem[]> => json(await authFetch(`${API_URL}/reports/${id}/activity`), "Could not load activity")

export async function addComment(id: string, body: string) {
  return json<{ id: string; body: string; createdAt: string; author: Member }>(
    await authFetch(`${API_URL}/reports/${id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) }),
    "Could not post the comment"
  )
}

export async function bulkUpdate(ids: string[], changes: Record<string, unknown>): Promise<{ updated: number }> {
  return json(
    await authFetch(`${API_URL}/reports/bulk`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, changes }) }),
    "Could not update the reports"
  )
}

// ---------- teams ----------

export interface TeamMember { id: string; name: string; email: string; role: Role; joinedAt: string }
export interface PendingInvite { id: string; email: string; role: Role; invitedBy: string; createdAt: string; expiresAt: string }

export const getTeam = async (): Promise<{ you: { id: string; role: Role }; members: TeamMember[]; invites: PendingInvite[] }> =>
  json(await authFetch(`${API_URL}/workspace/team`), "Could not load the team")

export async function inviteMembers(emails: string, role: Role) {
  return json<{ results: { email: string; status: "invited" | "already_member"; url?: string }[] }>(
    await authFetch(`${API_URL}/workspace/invites`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails, role }) }),
    "Could not send the invites"
  )
}

export const revokeInvite = async (id: string) => json(await authFetch(`${API_URL}/workspace/invites/${id}`, { method: "DELETE" }), "Could not revoke")

export const setMemberRole = async (userId: string, role: Role) =>
  json(await authFetch(`${API_URL}/workspace/members/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) }), "Could not change the role")

export const removeMember = async (userId: string) => json(await authFetch(`${API_URL}/workspace/members/${userId}`, { method: "DELETE" }), "Could not remove")

export const createWorkspace = async (name: string): Promise<{ id: string; name: string }> =>
  json(await authFetch(`${API_URL}/workspaces`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }), "Could not create the workspace")

export const switchWorkspace = async (id: string) => json(await authFetch(`${API_URL}/workspaces/${id}/switch`, { method: "POST" }), "Could not switch")

export const renameWorkspace = async (name: string) =>
  json(await authFetch(`${API_URL}/workspace`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }), "Could not rename")

export const updateProfile = async (body: { name?: string; notifyEmail?: boolean }) =>
  json(await authFetch(`${API_URL}/auth/profile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), "Could not save")

export async function previewInvite(token: string): Promise<{ workspace: string; email: string; role: Role; invitedBy: string }> {
  return json(await fetch(`${API_URL}/invites/${encodeURIComponent(token)}`), "This invite is not valid")
}

export const acceptInvite = async (token: string): Promise<{ ok: boolean; workspace: { id: string; name: string } }> =>
  json(await authFetch(`${API_URL}/invites/${encodeURIComponent(token)}/accept`, { method: "POST" }), "Could not accept the invite")

export async function updateProject(id: string, body: { name?: string; hosts?: string[]; color?: string }): Promise<Project> {
  return json(
    await authFetch(`${API_URL}/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    "Could not save the project"
  )
}

export async function deleteProject(id: string) {
  return json(await authFetch(`${API_URL}/projects/${id}`, { method: "DELETE" }), "Could not delete the project")
}

export async function configureWidget(id: string, body: { enabled?: boolean; config?: Partial<WidgetConfig>; rotateKey?: boolean }) {
  return json<{ id: string; widgetKey: string; widgetEnabled: boolean; widgetConfig: WidgetConfig; hosts: string[] }>(
    await authFetch(`${API_URL}/projects/${id}/widget`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    "Could not update the widget"
  )
}

// ---------- integrations ----------
export type Provider = "github" | "linear" | "jira" | "slack"

export interface Verification {
  id: string
  status: "passed" | "failed" | "error"
  repo?: string | null
  prNumber?: number | null
  prUrl?: string | null
  runUrl?: string | null
  details?: string | null
  createdAt: string
}

export interface ReportLink {
  id: string
  provider: Provider
  key: string
  url: string
  state?: string | null
  createdAt: string
}

export interface IntegrationsState {
  available: Record<Provider, boolean>
  githubInstallUrl: string | null
  connected: Partial<Record<Provider, { config: Record<string, unknown>; connectedAt: string }>>
}

export const getIntegrations = async (): Promise<IntegrationsState> => json(await authFetch(`${API_URL}/integrations`), "Could not load integrations")

export const githubInstallUrl = async (): Promise<{ url: string }> => json(await authFetch(`${API_URL}/integrations/github/install`), "GitHub is not available")

export const githubRepos = async (): Promise<{ fullName: string; private: boolean }[]> => json(await authFetch(`${API_URL}/integrations/github/repos`), "Could not load repositories")

export async function connectIntegration(provider: Provider, body: Record<string, unknown>): Promise<IntegrationsState> {
  return json(
    await authFetch(`${API_URL}/integrations/${provider}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    `Could not connect ${provider}`
  )
}

export async function updateIntegration(provider: Provider, body: Record<string, unknown>) {
  return json(
    await authFetch(`${API_URL}/integrations/${provider}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    "Could not save"
  )
}

export const disconnectIntegration = async (provider: Provider) =>
  json(await authFetch(`${API_URL}/integrations/${provider}`, { method: "DELETE" }), "Could not disconnect")

export async function createExternalIssue(reportId: string, provider: Provider, target?: string): Promise<ReportLink> {
  return json(
    await authFetch(`${API_URL}/reports/${reportId}/issues`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, target }) }),
    `Could not create the ${provider} issue`
  )
}

export const refreshExternalIssues = async (reportId: string): Promise<ReportLink[]> =>
  json(await authFetch(`${API_URL}/reports/${reportId}/issues/refresh`, { method: "POST" }), "Could not refresh")
