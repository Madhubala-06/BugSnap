import { Injectable } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { SessionStatus, LogType, LogLevel, Prisma } from "@prisma/client"

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, metadata?: Prisma.InputJsonValue) {
    return this.prisma.session.create({
      data: {
        userId,
        metadata,
      },
    })
  }

  async findAll(userId: string) {
    return this.prisma.session.findMany({
      where: { userId },
      include: {
        recording: true,
        bugReport: true,
        _count: { select: { logs: true } },
      },
      orderBy: { createdAt: "desc" },
    })
  }

  async findOne(id: string) {
    return this.prisma.session.findUnique({
      where: { id },
      include: {
        recording: true,
        logs: {
          orderBy: { timestamp: "asc" },
        },
        bugReport: true,
      },
    })
  }

  async updateStatus(id: string, status: SessionStatus) {
    return this.prisma.session.update({
      where: { id },
      data: { status },
    })
  }

  async addLog(
    sessionId: string,
    type: LogType,
    message: string,
    data?: Prisma.InputJsonValue,
    level: LogLevel = "INFO"
  ) {
    return this.prisma.sessionLog.create({
      data: {
        sessionId,
        type,
        level,
        message,
        data,
      },
    })
  }

  async addLogs(
    sessionId: string,
    logs: Array<{
      type: LogType
      message: string
      data?: Prisma.InputJsonValue
      level?: LogLevel
      timestamp?: Date
    }>
  ) {
    return this.prisma.sessionLog.createMany({
      data: logs.map((log) => ({
        sessionId,
        type: log.type,
        level: log.level ?? "INFO",
        message: log.message,
        data: log.data,
        timestamp: log.timestamp ?? new Date(),
      })),
    })
  }

  async saveRecording(
    sessionId: string,
    url: string,
    duration?: number,
    size?: number,
    thumbnailUrl?: string
  ) {
    return this.prisma.recording.create({
      data: {
        sessionId,
        url,
        duration,
        size,
        thumbnailUrl,
      },
    })
  }

  async delete(id: string) {
    return this.prisma.session.delete({
      where: { id },
    })
  }
}
