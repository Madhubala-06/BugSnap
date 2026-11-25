import { Controller, ForbiddenException, Get, Headers } from "@nestjs/common"
import { del } from "@vercel/blob"
import * as crypto from "crypto"
import { Prisma } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { Public } from "../auth/public.decorator"
import { PLANS } from "../plans/plans"

/** Daily housekeeping, called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. */
@Controller("ops/cron")
export class CronController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get("daily")
  async daily(@Headers("authorization") header?: string) {
    const secret = process.env.CRON_SECRET
    const expected = `Bearer ${secret}`
    if (!secret || !header || header.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected))) {
      throw new ForbiddenException()
    }
    const videos = await this.expireVideos()
    const day = 24 * 60 * 60 * 1000
    const [counters, errors, codes, tokens] = await Promise.all([
      this.prisma.rateCounter.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 2 * day) } } }),
      this.prisma.errorEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * day) } } }),
      this.prisma.loginCode.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - day) } } }),
      this.prisma.authToken.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    ])
    return { ok: true, videosRemoved: videos, rateCounters: counters.count, errorEvents: errors.count, loginCodes: codes.count, expiredSignIns: tokens.count }
  }

  /** Remove videos older than the workspace plan keeps them (screenshots, steps and logs stay). */
  private async expireVideos() {
    let removed = 0
    for (const plan of Object.values(PLANS)) {
      if (plan.videoDays == null) continue
      const cutoff = new Date(Date.now() - plan.videoDays * 24 * 60 * 60 * 1000)
      const rows = await this.prisma.$queryRaw<{ id: string; url: string; info: Prisma.JsonValue }[]>`
        SELECT r.id, r.browser_info->>'recordingUrl' AS url, r.browser_info AS info
        FROM bug_reports r JOIN workspaces w ON w.id = r.workspace_id
        WHERE w.plan = ${plan.id} AND r.created_at < ${cutoff} AND r.browser_info->>'recordingUrl' IS NOT NULL
        LIMIT 300`
      for (const row of rows) {
        if (process.env.BLOB_READ_WRITE_TOKEN && /\.blob\.vercel-storage\.com\//.test(row.url)) {
          await del(row.url, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => undefined)
        }
        const info = { ...((row.info ?? {}) as Record<string, unknown>), recordingUrl: undefined, recordingExpiredAt: new Date().toISOString() }
        await this.prisma.bugReport.update({ where: { id: row.id }, data: { browserInfo: info as Prisma.InputJsonValue } })
        removed++
      }
    }
    return removed
  }
}
