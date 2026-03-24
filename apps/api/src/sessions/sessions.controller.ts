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
import { SessionsService } from "./sessions.service"
import { SessionStatus, LogType, LogLevel, Prisma } from "@prisma/client"

@Controller("sessions")
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  create(
    @Body() body: { userId: string; metadata?: Prisma.InputJsonValue }
  ) {
    return this.sessionsService.create(body.userId, body.metadata)
  }

  @Get()
  findAll(@Query("userId") userId: string) {
    return this.sessionsService.findAll(userId)
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.sessionsService.findOne(id)
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body() body: { status: SessionStatus }
  ) {
    return this.sessionsService.updateStatus(id, body.status)
  }

  @Post(":id/logs")
  addLog(
    @Param("id") id: string,
    @Body()
    body: {
      type: LogType
      message: string
      data?: Prisma.InputJsonValue
      level?: LogLevel
    }
  ) {
    return this.sessionsService.addLog(
      id,
      body.type,
      body.message,
      body.data,
      body.level
    )
  }

  @Post(":id/logs/batch")
  addLogs(
    @Param("id") id: string,
    @Body()
    body: {
      logs: Array<{
        type: LogType
        message: string
        data?: Prisma.InputJsonValue
        level?: LogLevel
        timestamp?: string
      }>
    }
  ) {
    const logs = body.logs.map((log) => ({
      ...log,
      timestamp: log.timestamp ? new Date(log.timestamp) : undefined,
    }))
    return this.sessionsService.addLogs(id, logs)
  }

  @Post(":id/recording")
  saveRecording(
    @Param("id") id: string,
    @Body()
    body: {
      url: string
      duration?: number
      size?: number
      thumbnailUrl?: string
    }
  ) {
    return this.sessionsService.saveRecording(
      id,
      body.url,
      body.duration,
      body.size,
      body.thumbnailUrl
    )
  }

  @Delete(":id")
  delete(@Param("id") id: string) {
    return this.sessionsService.delete(id)
  }
}
