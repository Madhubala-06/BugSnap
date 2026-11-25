import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common"
import { RateLimit } from "../ops/rate-limit"
import { PrismaService } from "../prisma/prisma.service"
import { Auth, MinRole, type AuthContext } from "../auth/public.decorator"
import { logActivity } from "../triage/activity"
import { toPlaywrightTest } from "../reports/formats"
import { appUrl, IntegrationsService } from "../integrations/integrations.service"

/** Pull "BUG-12", "bug 12", "#BUG-12" style references out of any text. */
export function bugRefs(text: unknown): number[] {
  const found = new Set<number>()
  for (const m of String(text ?? "").matchAll(/\bBUG[-_ ]?(\d{1,7})\b/gi)) found.add(Number(m[1]))
  return [...found].slice(0, 20)
}

type Result = { number?: unknown; status?: unknown; details?: unknown }

/**
 * Endpoints for the BugSnap GitHub Action ("verify the fix"). It downloads the regression tests for
 * the bugs a pull request mentions, runs them, and sends the results back. Uses a BugSnap API key.
 */
@Controller("ci")
export class CiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
  ) {}

  @RateLimit({ name: "ci", by: "workspace", limit: 300, windowSec: 3600 })
  @Get("tests")
  @MinRole("member")
  async tests(@Auth() auth: AuthContext, @Query("refs") refs: string) {
    const numbers = bugRefs(refs)
    if (!numbers.length) return { tests: [] }
    const reports = await this.prisma.bugReport.findMany({ where: { workspaceId: auth.workspaceId, number: { in: numbers } } })
    return {
      tests: reports.map((r) => ({
        number: r.number,
        id: r.id,
        title: r.title,
        status: r.status,
        url: `${appUrl()}/dashboard/reports/${r.id}`,
        test: toPlaywrightTest(r),
      })),
    }
  }

  @RateLimit({ name: "ci-results", by: "workspace", limit: 300, windowSec: 3600 })
  @Post("results")
  @HttpCode(200)
  @MinRole("member")
  async results(
    @Auth() auth: AuthContext,
    @Body() body: { repo?: unknown; prNumber?: unknown; prUrl?: unknown; commitSha?: unknown; runUrl?: unknown; results?: Result[] },
  ) {
    if (!Array.isArray(body?.results) || !body.results.length) throw new BadRequestException("No results")
    const str = (v: unknown, max = 300) => (typeof v === "string" && v ? v.slice(0, max) : null)
    const link = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v.slice(0, 500) : null)
    const prNumber = Number.isInteger(body.prNumber) ? (body.prNumber as number) : null
    const out = []
    for (const r of body.results.slice(0, 20)) {
      const status = r.status === "passed" || r.status === "failed" ? r.status : "error"
      const report = await this.prisma.bugReport.findFirst({ where: { workspaceId: auth.workspaceId, number: Number(r.number) } })
      if (!report) continue
      await this.prisma.verification.create({
        data: {
          reportId: report.id,
          status,
          repo: str(body.repo, 200),
          prNumber,
          prUrl: link(body.prUrl),
          commitSha: str(body.commitSha, 64),
          runUrl: link(body.runUrl),
          details: str(r.details, 4000),
        },
      })
      await logActivity(this.prisma, report.id, auth.userId, "verified", { status, prNumber, prUrl: link(body.prUrl), repo: str(body.repo, 200) })
      // A passing test on a PR means the fix is ready (it becomes Resolved when the PR's issue closes or someone marks it).
      let movedTo: string | null = null
      if (status === "passed" && (report.status === "OPEN" || report.status === "IN_PROGRESS")) {
        await this.prisma.bugReport.update({ where: { id: report.id }, data: { status: "FIX_READY" } })
        await logActivity(this.prisma, report.id, auth.userId, "status", { from: report.status, to: "FIX_READY" })
        movedTo = "FIX_READY"
      }
      if (status === "passed") {
        await this.integrations.notifySlack(auth.workspaceId, "resolved", report.id, `Fix verified in CI${prNumber ? ` on PR #${prNumber}` : ""}`)
      }
      out.push({ number: report.number, status, movedTo, url: `${appUrl()}/dashboard/reports/${report.id}` })
    }
    return { results: out }
  }
}
