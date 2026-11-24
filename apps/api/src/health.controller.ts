import { Controller, Get } from "@nestjs/common"
import { PrismaService } from "./prisma/prisma.service"
import { Public } from "./auth/public.decorator"

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async getHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return {
        status: "ok",
        database: "connected",
        timestamp: new Date().toISOString(),
      }
    } catch {
      return {
        status: "error",
        database: "disconnected",
        timestamp: new Date().toISOString(),
      }
    }
  }
}
