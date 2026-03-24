import { Injectable } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { Severity, ReportStatus, Prisma } from "@prisma/client"

interface CreateReportDto {
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
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateReportDto) {
    return this.prisma.bugReport.create({
      data: {
        sessionId: data.sessionId,
        workspaceId: data.workspaceId,
        reporterId: data.reporterId,
        title: data.title,
        description: data.description,
        stepsToReproduce: data.stepsToReproduce,
        expectedResult: data.expectedResult,
        actualResult: data.actualResult,
        severity: data.severity ?? "MEDIUM",
        url: data.url,
        browserInfo: data.browserInfo,
        aiSummary: data.aiSummary,
        aiRootCause: data.aiRootCause,
        aiSuggestions: data.aiSuggestions ?? [],
      },
      include: {
        session: {
          include: {
            recording: true,
          },
        },
        reporter: true,
      },
    })
  }

  async createQuick(data: {
    title: string
    description?: string
    stepsToReproduce?: string[]
    severity?: Severity
    aiSummary?: string
    aiSuggestions?: string[]
    recordingUrl?: string
    screenshotUrls?: string[]
  }) {
    return this.prisma.bugReport.create({
      data: {
        title: data.title,
        description: data.description,
        stepsToReproduce: data.stepsToReproduce ?? [],
        severity: data.severity ?? "MEDIUM",
        aiSummary: data.aiSummary,
        aiSuggestions: data.aiSuggestions ?? [],
        // Store URLs in browserInfo as metadata
        browserInfo: {
          recordingUrl: data.recordingUrl,
          screenshotUrls: data.screenshotUrls,
        },
      },
    })
  }

  async findAll(workspaceId?: string, filters?: { status?: ReportStatus; severity?: Severity; limit?: number }) {
    return this.prisma.bugReport.findMany({
      where: {
        ...(workspaceId && { workspaceId }),
        ...(filters?.status && { status: filters.status }),
        ...(filters?.severity && { severity: filters.severity }),
      },
      include: {
        session: {
          include: {
            recording: true,
          },
        },
        reporter: true,
      },
      orderBy: { createdAt: "desc" },
      ...(filters?.limit && { take: filters.limit }),
    })
  }

  async getRecent(limit: number = 5) {
    return this.prisma.bugReport.findMany({
      include: {
        reporter: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })
  }

  async getGlobalStats() {
    const [total, bySeverity, byStatus, critical, pending] = await Promise.all([
      this.prisma.bugReport.count(),
      this.prisma.bugReport.groupBy({
        by: ["severity"],
        _count: true,
      }),
      this.prisma.bugReport.groupBy({
        by: ["status"],
        _count: true,
      }),
      this.prisma.bugReport.count({ where: { severity: "CRITICAL" } }),
      this.prisma.bugReport.count({ where: { status: "OPEN" } }),
    ])

    return {
      total,
      critical,
      pending,
      bySeverity: Object.fromEntries(bySeverity.map((s) => [s.severity, s._count])),
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    }
  }

  async findOne(id: string) {
    return this.prisma.bugReport.findUnique({
      where: { id },
      include: {
        session: {
          include: {
            recording: true,
            logs: {
              orderBy: { timestamp: "asc" },
            },
          },
        },
        reporter: true,
        workspace: true,
      },
    })
  }

  async update(id: string, data: UpdateReportDto) {
    return this.prisma.bugReport.update({
      where: { id },
      data,
      include: {
        session: {
          include: {
            recording: true,
          },
        },
        reporter: true,
      },
    })
  }

  async updateStatus(id: string, status: ReportStatus) {
    return this.prisma.bugReport.update({
      where: { id },
      data: { status },
    })
  }

  async delete(id: string) {
    return this.prisma.bugReport.delete({
      where: { id },
    })
  }

  async getStats(workspaceId: string) {
    const [total, bySeverity, byStatus] = await Promise.all([
      this.prisma.bugReport.count({ where: { workspaceId } }),
      this.prisma.bugReport.groupBy({
        by: ["severity"],
        where: { workspaceId },
        _count: true,
      }),
      this.prisma.bugReport.groupBy({
        by: ["status"],
        where: { workspaceId },
        _count: true,
      }),
    ])

    return {
      total,
      bySeverity: Object.fromEntries(bySeverity.map((s) => [s.severity, s._count])),
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    }
  }
}
