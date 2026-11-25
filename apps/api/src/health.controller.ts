import { Controller, Get, HttpCode, Res } from "@nestjs/common"
import type { Response } from "express"
import { PrismaService } from "./prisma/prisma.service"
import { Public } from "./auth/public.decorator"

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Uptime checks: 200 when the database answers, 503 when it does not. */
  @Public()
  @Get(["", "health"])
  @HttpCode(200)
  async getHealth(@Res({ passthrough: true }) res: Response) {
    const started = Date.now()
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return { status: "ok", database: "connected", dbMs: Date.now() - started, timestamp: new Date().toISOString() }
    } catch {
      res.status(503)
      return { status: "error", database: "disconnected", timestamp: new Date().toISOString() }
    }
  }
}
