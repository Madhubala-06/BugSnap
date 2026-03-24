import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from "@nestjs/common"
import { ReportsService } from "./reports.service"
import { Severity, ReportStatus, Prisma } from "@prisma/client"

@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  create(
    @Body()
    body: {
      sessionId: string
      workspaceId: string
      reporterId: string
      title: string
      description?: string
      stepsToReproduce: string[]
      expectedResult?: string
      actualResult?: string
      severity?: Severity
      url?: string
      browserInfo?: Prisma.InputJsonValue
      aiSummary?: string
      aiRootCause?: string
      aiSuggestions?: string[]
    }
  ) {
    return this.reportsService.create(body)
  }

  @Post("quick")
  createQuick(
    @Body()
    body: {
      title: string
      description?: string
      stepsToReproduce?: string[]
      severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      aiSummary?: string
      aiSuggestions?: string[]
      recordingUrl?: string
      screenshotUrls?: string[]
    }
  ) {
    return this.reportsService.createQuick(body)
  }

  @Get()
  findAll(
    @Query("workspaceId") workspaceId?: string,
    @Query("status") status?: ReportStatus,
    @Query("severity") severity?: Severity,
    @Query("limit") limit?: string
  ) {
    return this.reportsService.findAll(workspaceId, {
      status,
      severity,
      limit: limit ? parseInt(limit) : undefined
    })
  }

  @Get("recent")
  getRecent(@Query("limit") limit?: string) {
    return this.reportsService.getRecent(limit ? parseInt(limit) : 5)
  }

  @Get("global-stats")
  getGlobalStats() {
    return this.reportsService.getGlobalStats()
  }

  @Get("stats")
  getStats(@Query("workspaceId") workspaceId: string) {
    return this.reportsService.getStats(workspaceId)
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.reportsService.findOne(id)
  }

  @Patch(":id")
  update(
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
      aiSummary?: string
      aiRootCause?: string
      aiSuggestions?: string[]
    }
  ) {
    return this.reportsService.update(id, body)
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body() body: { status: ReportStatus }
  ) {
    return this.reportsService.updateStatus(id, body.status)
  }

  @Delete(":id")
  delete(@Param("id") id: string) {
    return this.reportsService.delete(id)
  }
}
