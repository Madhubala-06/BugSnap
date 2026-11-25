import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { Severity, ReportStatus, Prisma } from "@prisma/client"
import { AIService, type BugAnalysis } from "../ai/ai.service"
import { randomToken } from "../auth/crypto"
import { cleanLabels, hostOf, logActivity, PRIORITIES } from "../triage/activity"
import { Mailer } from "../auth/mailer"
import { notifyAssigned } from "../teams/notify"
import { IntegrationsService } from "../integrations/integrations.service"
import { del } from "@vercel/blob"
import { waitUntil } from "@vercel/functions"
import { errorSignature, fallbackSummary, fallbackTitle, isBlobUrl, isOwnUpload, summarizeLogs, type CapturedLog, type PageContext } from "../ai/context"

export interface QuickReportInput {
  title?: string
  description?: string
  stepsToReproduce?: string[]
  severity?: Severity
  aiSummary?: string
  aiSuggestions?: string[]
  recordingUrl?: string
  screenshotUrls?: string[]
  duration?: number
  page?: PageContext
  logs?: CapturedLog[]
  droppedLogs?: number
  analyze?: boolean
  /** The extension creates the report first and attaches the video a moment later (POST /reports/:id/media). */
  mediaPending?: boolean
  /** When screen recording started (ms since epoch), to line the video up with the logs. */
  startedAt?: number
  /** What the person reporting wrote in their own words (website widget). */
  userNote?: string
}

const LOG_TYPES = new Set(["CONSOLE", "NETWORK", "CLICK", "ERROR", "NAVIGATION", "INPUT"])
const LOG_LEVELS = new Set(["DEBUG", "INFO", "WARN", "ERROR"])
const MAX_LOGS = 1000

/** Keeps only well-formed log entries and caps their size. */
export function sanitizeLogs(input: unknown): CapturedLog[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((l) => l && typeof l === "object" && typeof l.message === "string")
    .slice(0, MAX_LOGS)
    .map((l) => ({
      type: LOG_TYPES.has(l.type) ? l.type : "CONSOLE",
      level: LOG_LEVELS.has(l.level) ? l.level : "INFO",
      message: String(l.message).slice(0, 4000),
      data: l.data && typeof l.data === "object" ? l.data : undefined,
      timestamp: typeof l.timestamp === "string" && !Number.isNaN(Date.parse(l.timestamp)) ? l.timestamp : new Date().toISOString(),
    }))
}


interface UpdateReportDto {
  title?: string
  description?: string
  stepsToReproduce?: string[]
  expectedResult?: string
  actualResult?: string
  severity?: Severity
  status?: ReportStatus
  aiSummary?: string
  aiRootCause?: string
  aiSuggestions?: string[]
  screenshotUrls?: string[]
  priority?: string
  labels?: string[]
  assigneeId?: string | null
  projectId?: string | null
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIService,
    private readonly mailer: Mailer,
    private readonly integrations: IntegrationsService
  ) {}

  async createQuick(
    auth: { workspaceId: string; userId: string | null; projectId?: string; source?: "extension" | "widget"; reporter?: { email?: string; name?: string } },
    data: QuickReportInput
  ) {
    const logs = sanitizeLogs(data.logs)
    const page = data.page
    const screenshotUrls = (Array.isArray(data.screenshotUrls) ? data.screenshotUrls : [])
      .filter((u) => isOwnUpload(u, "thumbnails", auth.workspaceId))
      .slice(0, 30)
    const recordingUrl = isOwnUpload(data.recordingUrl, "recordings", auth.workspaceId) ? data.recordingUrl : undefined
    // AI runs in the background so the extension is not kept waiting.
    const analysis = null as BugAnalysis | null
    const aiError = undefined as string | undefined

    const basic = analysis ? null : fallbackSummary(logs, page)
    const severity = (analysis?.severity?.toUpperCase() ?? data.severity ?? "MEDIUM") as Severity
    const host = hostOf(page?.url)
    const project = auth.projectId
      ? { id: auth.projectId }
      : host
      ? await this.prisma.project.findFirst({ where: { workspaceId: auth.workspaceId, hosts: { has: host } }, select: { id: true } })
      : null
    const create = async () => {
      const number = await this.nextNumber(auth.workspaceId)
      return this.prisma.bugReport.create({
        data: {
          workspaceId: auth.workspaceId,
          reporterId: auth.userId,
          number,
          projectId: project?.id,
          title: analysis?.title ?? data.title ?? noteTitle(data.userNote, logs) ?? fallbackTitle(logs, page),
          description: analysis?.description ?? data.description ?? basic?.description,
          stepsToReproduce: analysis?.steps ?? (data.stepsToReproduce?.length ? data.stepsToReproduce : basic?.steps) ?? [],
          expectedResult: analysis?.expected,
          actualResult: analysis?.actual,
          severity: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(severity) ? severity : "MEDIUM",
          aiSummary: analysis?.description ?? data.aiSummary,
          aiRootCause: analysis?.rootCause,
          aiSuggestions: analysis?.suggestions ?? data.aiSuggestions ?? [],
          url: page?.url?.slice(0, 2000),
          errorSignature: errorSignature(logs, page),
          aiStatus: data.analyze ? "pending" : "skipped",
          browserInfo: {
            recordingUrl,
            screenshotUrls,
            duration: data.duration,
            source: auth.source ?? "extension",
            userNote: data.userNote?.slice(0, 4000),
            reporter: auth.reporter,
            startedAt: typeof data.startedAt === "number" && Number.isFinite(data.startedAt) ? data.startedAt : undefined,
            page: page ? { ...page } : undefined,
            affectedArea: analysis?.affectedArea,
            logs: logs as unknown as Prisma.InputJsonValue[],
            logSummary: summarizeLogs(logs),
            droppedLogs: data.droppedLogs ?? 0,
            aiError,
            ...(data.mediaPending ? { mediaPending: true, mediaPendingSince: Date.now() } : {}),
          } as Prisma.InputJsonValue,
        },
      })

    }
    let report: Awaited<ReturnType<typeof create>>
    try {
      report = await create()
    } catch (error) {
      // Two reports got the same BUG number at the same moment: take the next one.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") report = await create()
      else throw error
    }
    await logActivity(this.prisma, report.id, auth.userId, "created", {
      logs: logs.length,
      screenshots: screenshotUrls.length,
      source: auth.source ?? "extension",
      ...(auth.reporter?.email ? { email: auth.reporter.email } : {}),
    })
    // With media still uploading, the AI and the Slack alert wait for attachMedia().
    if (data.mediaPending) return { ...report, analysis, aiError }
    if (data.analyze) this.runAiInBackground(auth.workspaceId, report.id)
    else await this.integrations.notifySlack(auth.workspaceId, "created", report.id, auth.source === "widget" ? `Reported from the website${auth.reporter?.email ? ` by ${auth.reporter.email}` : ""}` : undefined)
    return { ...report, analysis, aiError }
  }

  /** Slack "new bug" goes out after the first AI attempt (so it has a good title), only once. */
  private async announceOnce(workspaceId: string, id: string) {
    const attempts = await this.prisma.activity.count({ where: { reportId: id, kind: { in: ["ai_done", "ai_failed"] } } })
    if (attempts === 1) {
      const r = await this.prisma.bugReport.findUnique({ where: { id }, select: { browserInfo: true } })
      const info = (r?.browserInfo ?? {}) as { source?: string; reporter?: { email?: string } }
      await this.integrations.notifySlack(workspaceId, "created", id, info.source === "widget" ? `Reported from the website${info.reporter?.email ? ` by ${info.reporter.email}` : ""}` : undefined)
    }
  }

  /** Next BUG-<n> for a workspace. The unique index catches races; we retry once. */
  private async nextNumber(workspaceId: string) {
    const top = await this.prisma.bugReport.aggregate({ where: { workspaceId }, _max: { number: true } })
    return (top._max.number ?? 0) + 1
  }

  /** Keep the serverless function alive after the response until the AI is done (max ~4 min). */
  runAiInBackground(workspaceId: string, id: string) {
    const job = this.applyAi(workspaceId, id, 240_000).catch(() => undefined)
    try {
      waitUntil(job)
    } catch {
      // not on Vercel: the promise just runs
    }
  }

  async findAll(workspaceId: string, filters?: { status?: ReportStatus; severity?: Severity; limit?: number }) {
    return this.prisma.bugReport.findMany({
      where: {
        workspaceId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.severity && { severity: filters.severity }),
      },
      select: LIST_FIELDS,
      orderBy: { createdAt: "desc" },
      take: Math.min(filters?.limit ?? 200, 500),
    }).then(stripLogs).then((rows) => rows.map(withStaleAi)).then((rows) => this.withDuplicateCounts(workspaceId, rows))
  }

  async getRecent(workspaceId: string, limit = 5) {
    return this.prisma.bugReport.findMany({
      where: { workspaceId },
      select: LIST_FIELDS,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 50),
    }).then(stripLogs)
  }

  async getStats(workspaceId: string) {
    const where = { workspaceId }
    const [total, bySeverity, byStatus, critical, pending] = await Promise.all([
      this.prisma.bugReport.count({ where }),
      this.prisma.bugReport.groupBy({ by: ["severity"], where, _count: true }),
      this.prisma.bugReport.groupBy({ by: ["status"], where, _count: true }),
      this.prisma.bugReport.count({ where: { ...where, severity: "CRITICAL" } }),
      this.prisma.bugReport.count({ where: { ...where, status: "OPEN" } }),
    ])
    return {
      total,
      critical,
      pending,
      bySeverity: Object.fromEntries(bySeverity.map((s) => [s.severity, s._count])),
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    }
  }

  private async withDuplicateCounts<T extends { errorSignature: string | null }>(workspaceId: string, rows: T[]) {
    const signatures = [...new Set(rows.map((r) => r.errorSignature).filter((s): s is string => Boolean(s)))]
    if (!signatures.length) return rows.map((r) => ({ ...r, duplicateCount: 1 }))
    const groups = await this.prisma.bugReport.groupBy({
      by: ["errorSignature"],
      where: { workspaceId, errorSignature: { in: signatures } },
      _count: true,
    })
    const counts = new Map(groups.map((g) => [g.errorSignature, g._count]))
    return rows.map((r) => ({ ...r, duplicateCount: (r.errorSignature && counts.get(r.errorSignature)) || 1 }))
  }

  /** Button "Generate AI write-up": runs in the background, the page polls for the result. */
  /** The extension uploaded the video and screenshots after creating the report: attach them, then run the AI. */
  async attachMedia(workspaceId: string, id: string, data: { recordingUrl?: unknown; screenshotUrls?: unknown; duration?: unknown; error?: unknown }) {
    const report = await this.prisma.bugReport.findFirst({ where: { id, workspaceId } })
    if (!report) throw new NotFoundException("Report not found")
    const info = (report.browserInfo ?? {}) as Record<string, unknown>
    if (!info.mediaPending) return { ok: true, already: true }
    const recordingUrl = typeof data.recordingUrl === "string" && isOwnUpload(data.recordingUrl, "recordings", workspaceId) ? data.recordingUrl : undefined
    const screenshotUrls = (Array.isArray(data.screenshotUrls) ? data.screenshotUrls : [])
      .filter((u): u is string => typeof u === "string" && isOwnUpload(u, "thumbnails", workspaceId))
      .slice(0, 30)
    const duration = typeof data.duration === "number" && Number.isFinite(data.duration) ? Math.max(0, Math.round(data.duration)) : info.duration
    const next = { ...info, recordingUrl, screenshotUrls, duration, mediaPending: false, mediaError: typeof data.error === "string" ? data.error.slice(0, 300) : undefined }
    await this.prisma.bugReport.update({ where: { id }, data: { browserInfo: next as Prisma.InputJsonValue } })
    if (report.aiStatus === "pending") this.runAiInBackground(workspaceId, id)
    else await this.integrations.notifySlack(workspaceId, "created", id)
    return { ok: true }
  }

  async analyzeAgain(workspaceId: string, id: string) {
    const report = await this.findOne(workspaceId, id)
    if (report.aiStatus === "pending" && Date.now() - report.updatedAt.getTime() < 5 * 60 * 1000) {
      return { ok: true, pending: true }
    }
    await this.prisma.bugReport.update({ where: { id }, data: { aiStatus: "pending" } })
    this.runAiInBackground(workspaceId, id)
    return { ok: true, pending: true }
  }

  async applyAi(workspaceId: string, id: string, budgetMs: number) {
    const report = await this.findOne(workspaceId, id)
    const info = (report.browserInfo ?? {}) as { logs?: CapturedLog[]; page?: PageContext; screenshotUrls?: string[]; duration?: number }
    const result = await this.ai.analyze({
      workspaceId,
      budgetMs,
      note: (info as { userNote?: string }).userNote,
      screenshots: info.screenshotUrls ?? [],
      logs: info.logs ?? [],
      page: info.page,
      durationSeconds: info.duration,
    })
    if (!result.analysis) {
      await this.prisma.bugReport.update({
        where: { id },
        data: { aiStatus: "failed", browserInfo: { ...(info as object), aiError: result.error } as Prisma.InputJsonValue },
      })
      await logActivity(this.prisma, id, null, "ai_failed", { error: result.error })
      await this.announceOnce(workspaceId, id)
      return { ok: false, error: result.error }
    }
    const a = result.analysis
    // Keep a title the user already edited.
    const current = await this.prisma.bugReport.findUniqueOrThrow({ where: { id }, select: { title: true, description: true } })
    const autoTitle = current.title === report.title && (report.aiStatus !== "done")
    await this.prisma.bugReport.update({
      where: { id },
      data: {
        ...(autoTitle ? { title: a.title } : {}),
        description: a.description,
        stepsToReproduce: a.steps,
        expectedResult: a.expected,
        actualResult: a.actual,
        severity: a.severity.toUpperCase() as Severity,
        aiSummary: a.description,
        aiRootCause: a.rootCause,
        aiSuggestions: a.suggestions,
        aiStatus: "done",
        browserInfo: { ...(info as object), aiError: undefined, affectedArea: a.affectedArea, aiModel: result.model } as Prisma.InputJsonValue,
      },
    })
    await logActivity(this.prisma, id, null, "ai_done", { severity: a.severity, model: result.model })
    await this.announceOnce(workspaceId, id)
    return { ok: true }
  }

  async setShared(workspaceId: string, id: string, shared: boolean, actorId?: string) {
    const report = await this.findOne(workspaceId, id)
    const shareToken = shared ? report.shareToken ?? randomToken().slice(0, 22) : null
    await this.prisma.bugReport.update({ where: { id }, data: { shareToken } })
    if (shared !== Boolean(report.shareToken)) await logActivity(this.prisma, id, actorId ?? null, shared ? "shared" : "unshared")
    return { shareToken }
  }

  /** Read-only view for a share link. No reporter email, no workspace data. */
  async findShared(token: string) {
    if (!token || token.length > 64) throw new NotFoundException("Report not found")
    const r = await this.prisma.bugReport.findUnique({ where: { shareToken: token } })
    if (!r) throw new NotFoundException("This link is no longer shared")
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      stepsToReproduce: r.stepsToReproduce,
      expectedResult: r.expectedResult,
      actualResult: r.actualResult,
      severity: r.severity,
      status: r.status,
      aiSummary: r.aiSummary,
      aiRootCause: r.aiRootCause,
      aiSuggestions: r.aiSuggestions,
      url: r.url,
      browserInfo: r.browserInfo,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      shareToken: r.shareToken,
    }
  }

  /** 404 for reports in other workspaces. */
  async findOne(workspaceId: string, id: string) {
    const report = await this.prisma.bugReport.findFirst({
      where: { id, workspaceId },
      include: {
        session: { include: { recording: true, logs: { orderBy: { timestamp: "asc" } } } },
        reporter: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, color: true } },
        links: { orderBy: { createdAt: "asc" } },
        verifications: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    })
    if (!report) throw new NotFoundException("Report not found")
    const duplicates = report.errorSignature
      ? await this.prisma.bugReport.findMany({
          where: { workspaceId, errorSignature: report.errorSignature, id: { not: id } },
          select: { id: true, title: true, status: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : []
    return { ...withStaleAi(report), duplicates }
  }

  async update(workspaceId: string, id: string, data: UpdateReportDto, actorId?: string) {
    const before = await this.findOne(workspaceId, id)
    const allowed: Prisma.BugReportUncheckedUpdateInput = {}
    for (const key of ["title", "description", "stepsToReproduce", "expectedResult", "actualResult", "severity", "status", "aiSummary", "aiRootCause", "aiSuggestions"] as const) {
      if (data[key] !== undefined) (allowed as Record<string, unknown>)[key] = data[key]
    }
    if (typeof allowed.title === "string") allowed.title = allowed.title.trim().slice(0, 200) || before.title
    if (data.screenshotUrls) {
      const urls = data.screenshotUrls.filter((u) => isOwnUpload(u, "thumbnails", workspaceId)).slice(0, 30)
      allowed.browserInfo = { ...((before.browserInfo as object) ?? {}), screenshotUrls: urls } as Prisma.InputJsonValue
    }
    if (data.priority !== undefined) {
      if (!(PRIORITIES as readonly string[]).includes(String(data.priority))) throw new BadRequestException("Unknown priority")
      allowed.priority = data.priority
    }
    if (data.labels !== undefined) allowed.labels = cleanLabels(data.labels)
    if (data.assigneeId !== undefined) {
      if (data.assigneeId === null) allowed.assigneeId = null
      else {
        const member = await this.prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId: String(data.assigneeId) } } })
        if (!member) throw new BadRequestException("That person is not in this workspace")
        allowed.assigneeId = member.userId
      }
    }
    if (data.projectId !== undefined) {
      if (data.projectId === null) allowed.projectId = null
      else {
        const project = await this.prisma.project.findFirst({ where: { id: String(data.projectId), workspaceId }, select: { id: true } })
        if (!project) throw new BadRequestException("Unknown project")
        allowed.projectId = project.id
      }
    }
    const updated = await this.prisma.bugReport.update({ where: { id }, data: allowed })

    // Activity for the changes people care about.
    const actor = actorId ?? null
    if (allowed.status !== undefined && allowed.status !== before.status) {
      await logActivity(this.prisma, id, actor, "status", { from: before.status, to: allowed.status })
      await this.integrations.onStatusChange(workspaceId, id, before.status, allowed.status as ReportStatus)
      if (["RESOLVED", "CLOSED"].includes(String(allowed.status))) await this.integrations.notifySlack(workspaceId, "resolved", id)
    }
    if (allowed.assigneeId !== undefined && allowed.assigneeId !== before.assigneeId) {
      await logActivity(this.prisma, id, actor, "assignee", { to: allowed.assigneeId })
      if (allowed.assigneeId && actor) notifyAssigned(this.prisma, this.mailer, id, String(allowed.assigneeId), actor)
      if (allowed.assigneeId) {
        const who = await this.prisma.user.findUnique({ where: { id: String(allowed.assigneeId) }, select: { name: true } })
        await this.integrations.notifySlack(workspaceId, "assigned", id, who ? `Assigned to *${who.name}*` : undefined)
      }
    }
    if (allowed.priority !== undefined && allowed.priority !== before.priority) await logActivity(this.prisma, id, actor, "priority", { from: before.priority, to: allowed.priority })
    if (allowed.labels !== undefined && JSON.stringify(allowed.labels) !== JSON.stringify(before.labels)) await logActivity(this.prisma, id, actor, "labels", { to: allowed.labels })
    if (allowed.projectId !== undefined && allowed.projectId !== before.projectId) await logActivity(this.prisma, id, actor, "project", { to: allowed.projectId })
    if (allowed.severity !== undefined && allowed.severity !== before.severity) await logActivity(this.prisma, id, actor, "severity", { from: before.severity, to: allowed.severity })
    if (allowed.title !== undefined && allowed.title !== before.title) await logActivity(this.prisma, id, actor, "title", { to: allowed.title })
    return updated
  }

  /** Same change on many reports (bulk actions in the table). */
  async bulkUpdate(workspaceId: string, ids: unknown, data: UpdateReportDto, actorId?: string) {
    if (!Array.isArray(ids) || !ids.length) throw new BadRequestException("Pick at least one report")
    const results = []
    for (const id of ids.slice(0, 100)) {
      if (typeof id !== "string") continue
      try {
        await this.update(workspaceId, id, data, actorId)
        results.push(id)
      } catch {
        // skip reports that are gone or not ours
      }
    }
    return { updated: results.length }
  }

  async updateStatus(workspaceId: string, id: string, status: ReportStatus, actorId?: string) {
    return this.update(workspaceId, id, { status }, actorId)
  }

  async delete(workspaceId: string, id: string) {
    const report = await this.findOne(workspaceId, id)
    const deleted = await this.prisma.bugReport.delete({ where: { id } })
    // Remove this report's files from storage too (only files inside this workspace's folder).
    const info = (report.browserInfo ?? {}) as { recordingUrl?: string; screenshotUrls?: string[] }
    const urls = [info.recordingUrl, ...(info.screenshotUrls ?? [])].filter(
      (u): u is string => typeof u === "string" && isBlobUrl(u) && (isOwnUpload(u, "thumbnails", workspaceId) || isOwnUpload(u, "recordings", workspaceId))
    )
    if (urls.length && process.env.BLOB_READ_WRITE_TOKEN) {
      await del(urls, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => undefined)
    }
    return deleted
  }
}

const LIST_FIELDS = {
  id: true,
  number: true,
  priority: true,
  labels: true,
  assignee: { select: { id: true, name: true, email: true } },
  project: { select: { id: true, name: true, color: true } },
  title: true,
  description: true,
  severity: true,
  status: true,
  url: true,
  aiSummary: true,
  stepsToReproduce: true,
  browserInfo: true,
  errorSignature: true,
  shareToken: true,
  aiStatus: true,
  createdAt: true,
  updatedAt: true,
  reporter: { select: { id: true, name: true, email: true } },
} satisfies Prisma.BugReportSelect

/** Lists only need media links and counts, not the full log array. */
function stripLogs<T extends { browserInfo: Prisma.JsonValue }>(rows: T[]): T[] {
  return rows.map((row) => {
    const info = row.browserInfo
    if (!info || typeof info !== "object" || Array.isArray(info)) return row
    const { logs: _logs, ...rest } = info as Record<string, unknown>
    return { ...row, browserInfo: rest as Prisma.JsonValue }
  })
}

/** A background AI job that never finished (function was stopped) counts as failed, so it can be retried. */
function withStaleAi<T extends { aiStatus: string | null; updatedAt: Date }>(row: T): T {
  if (row.aiStatus === "pending" && Date.now() - new Date(row.updatedAt).getTime() > 6 * 60 * 1000) {
    return { ...row, aiStatus: "failed" }
  }
  return row
}

/** For widget reports: the reporter's own words make the best title, unless there is a real JS error. */
function noteTitle(note: string | undefined, logs: CapturedLog[]): string | null {
  if (!note?.trim()) return null
  const hasJsError = logs.some((l) => l.level === "ERROR" && l.type !== "NETWORK" && !l.data?.beforeRecording)
  if (hasJsError) return null
  const first = note.trim().split(/\n/)[0].replace(/\s+/g, " ")
  return first.length > 90 ? `${first.slice(0, 89)}…` : first
}
