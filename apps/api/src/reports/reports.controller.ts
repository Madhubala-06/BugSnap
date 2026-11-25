import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Header, HttpCode } from "@nestjs/common"
import { RateLimit } from "../ops/rate-limit"
import { toFixPrompt, toPlaywrightTest } from "./formats"
import { ReportsService, type QuickReportInput } from "./reports.service"
import { Severity, ReportStatus } from "@prisma/client"
import { Auth, MinRole, Public, type AuthContext } from "../auth/public.decorator"

const STATUSES = Object.values(ReportStatus)
const SEVERITIES = Object.values(Severity)

@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RateLimit({ name: "report", by: "user", limit: 60, windowSec: 3600 }, { name: "report", by: "workspace", limit: 600, windowSec: 86400 })
  @Post("quick")
  createQuick(@Auth() auth: AuthContext, @Body() body: QuickReportInput) {
    return this.reports.createQuick(auth, body ?? {})
  }

  @Get()
  findAll(
    @Auth() auth: AuthContext,
    @Query("status") status?: string,
    @Query("severity") severity?: string,
    @Query("limit") limit?: string
  ) {
    return this.reports.findAll(auth.workspaceId, {
      status: STATUSES.includes(status as ReportStatus) ? (status as ReportStatus) : undefined,
      severity: SEVERITIES.includes(severity as Severity) ? (severity as Severity) : undefined,
      limit: limit ? Number.parseInt(limit, 10) || undefined : undefined,
    })
  }

  @MinRole("member")
  @Post("bulk")
  bulk(@Auth() auth: AuthContext, @Body() body: { ids?: string[]; changes?: Record<string, unknown> }) {
    const c = body?.changes ?? {}
    const changes = {
      ...(c.status !== undefined ? { status: c.status as ReportStatus } : {}),
      ...(c.priority !== undefined ? { priority: String(c.priority) } : {}),
      ...(c.assigneeId !== undefined ? { assigneeId: c.assigneeId as string | null } : {}),
      ...(c.projectId !== undefined ? { projectId: c.projectId as string | null } : {}),
      ...(c.severity !== undefined ? { severity: c.severity as Severity } : {}),
    }
    return this.reports.bulkUpdate(auth.workspaceId, body?.ids, changes, auth.userId)
  }

  @Get("recent")
  getRecent(@Auth() auth: AuthContext, @Query("limit") limit?: string) {
    return this.reports.getRecent(auth.workspaceId, limit ? Number.parseInt(limit, 10) || 5 : 5)
  }

  // "global-stats" kept for the existing dashboard; both are workspace-only now.
  @Get("global-stats")
  getGlobalStats(@Auth() auth: AuthContext) {
    return this.reports.getStats(auth.workspaceId)
  }

  @Get("stats")
  getStats(@Auth() auth: AuthContext) {
    return this.reports.getStats(auth.workspaceId)
  }

  @MinRole("member")
  @RateLimit({ name: "media", by: "user", limit: 120, windowSec: 3600 })
  @MinRole("member")
  @Post(":id/media")
  @HttpCode(200)
  attachMedia(@Auth() auth: AuthContext, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.reports.attachMedia(auth.workspaceId, id, body ?? {})
  }

  @RateLimit({ name: "ai", by: "workspace", limit: 40, windowSec: 3600 })
  @Post(":id/analyze")
  analyze(@Auth() auth: AuthContext, @Param("id") id: string) {
    return this.reports.analyzeAgain(auth.workspaceId, id)
  }

  @Get(":id/playwright")
  @Header("Content-Type", "text/plain; charset=utf-8")
  async playwright(@Auth() auth: AuthContext, @Param("id") id: string) {
    return toPlaywrightTest(await this.reports.findOne(auth.workspaceId, id))
  }

  @Get(":id/fix-prompt")
  @Header("Content-Type", "text/plain; charset=utf-8")
  async fixPrompt(@Auth() auth: AuthContext, @Param("id") id: string, @Query("app") app?: string) {
    const appUrl = (process.env.FRONTEND_URL || "").split(",")[0] || app
    return toFixPrompt(await this.reports.findOne(auth.workspaceId, id), appUrl)
  }

  @MinRole("member")
  @Post(":id/share")
  share(@Auth() auth: AuthContext, @Param("id") id: string) {
    return this.reports.setShared(auth.workspaceId, id, true, auth.userId)
  }

  @MinRole("member")
  @Delete(":id/share")
  unshare(@Auth() auth: AuthContext, @Param("id") id: string) {
    return this.reports.setShared(auth.workspaceId, id, false, auth.userId)
  }

  @Get(":id")
  findOne(@Auth() auth: AuthContext, @Param("id") id: string) {
    return this.reports.findOne(auth.workspaceId, id)
  }

  @MinRole("member")
  @Patch(":id")
  update(
    @Auth() auth: AuthContext,
    @Param("id") id: string,
    @Body()
    body: {
      title?: string
      description?: string
      stepsToReproduce?: string[]
      expectedResult?: string
      actualResult?: string
      severity?: Severity
      status?: ReportStatus
      screenshotUrls?: string[]
      priority?: string
      labels?: string[]
      assigneeId?: string | null
      projectId?: string | null
    }
  ) {
    return this.reports.update(auth.workspaceId, id, body ?? {}, auth.userId)
  }

  @MinRole("member")
  @Patch(":id/status")
  updateStatus(@Auth() auth: AuthContext, @Param("id") id: string, @Body() body: { status: ReportStatus }) {
    return this.reports.updateStatus(auth.workspaceId, id, body?.status, auth.userId)
  }

  @MinRole("member")
  @Delete(":id")
  delete(@Auth() auth: AuthContext, @Param("id") id: string) {
    return this.reports.delete(auth.workspaceId, id)
  }
}

/** Public, read-only views of shared reports. */
@Controller("public")
export class PublicReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Public()
  @Get("reports/:token")
  shared(@Param("token") token: string) {
    return this.reports.findShared(token)
  }
}
