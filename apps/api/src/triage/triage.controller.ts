import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from "@nestjs/common"
import { RateLimit } from "../ops/rate-limit"
import { PrismaService } from "../prisma/prisma.service"
import { Auth, MinRole, type AuthContext } from "../auth/public.decorator"
import { Mailer } from "../auth/mailer"
import { notifyMentions } from "../teams/notify"
import { hostOf, logActivity } from "./activity"

const COLORS = ["#3B82F6", "#A78BFA", "#F472B6", "#34D399", "#FBBF24", "#F87171", "#22D3EE", "#A3E635"]

@Controller()
export class TriageController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer
  ) {}

  /** People who can be assigned in this workspace. */
  @Get("workspace/members")
  async members(@Auth() auth: AuthContext) {
    const rows = await this.prisma.membership.findMany({
      where: { workspaceId: auth.workspaceId },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    })
    return rows.map((m) => ({ ...m.user, role: m.role })).sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Labels already used in this workspace, most used first. */
  @Get("workspace/labels")
  async labels(@Auth() auth: AuthContext) {
    const rows = await this.prisma.$queryRaw<{ label: string; n: bigint }[]>`
      SELECT unnest(labels) AS label, COUNT(*) AS n FROM bug_reports
      WHERE workspace_id = ${auth.workspaceId} GROUP BY 1 ORDER BY 2 DESC LIMIT 50`
    return rows.map((r) => ({ label: r.label, count: Number(r.n) }))
  }

  // ---------- projects ----------
  @Get("projects")
  async projects(@Auth() auth: AuthContext) {
    const [projects, counts] = await Promise.all([
      this.prisma.project.findMany({ where: { workspaceId: auth.workspaceId }, orderBy: { createdAt: "asc" } }),
      this.prisma.bugReport.groupBy({
        by: ["projectId"],
        where: { workspaceId: auth.workspaceId, status: { in: ["OPEN", "IN_PROGRESS", "FIX_READY"] } },
        _count: true,
      }),
    ])
    const open = new Map(counts.map((c) => [c.projectId, c._count]))
    return projects.map((p) => ({ ...p, openCount: open.get(p.id) ?? 0 }))
  }

  @Post("projects")
  @MinRole("member")
  async createProject(@Auth() auth: AuthContext, @Body() body: { name?: string; hosts?: string[]; color?: string }) {
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 40) : ""
    if (!name) throw new BadRequestException("Give the project a name")
    const count = await this.prisma.project.count({ where: { workspaceId: auth.workspaceId } })
    if (count >= 30) throw new BadRequestException("Up to 30 projects per workspace")
    const project = await this.prisma.project.create({
      data: {
        workspaceId: auth.workspaceId,
        name,
        color: typeof body.color === "string" && /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : COLORS[count % COLORS.length],
        hosts: cleanHosts(body.hosts),
      },
    })
    // Pick up existing reports from these hosts.
    if (project.hosts.length) await this.claimReports(auth.workspaceId, project.id, project.hosts)
    return project
  }

  @Patch("projects/:id")
  @MinRole("member")
  async updateProject(@Auth() auth: AuthContext, @Param("id") id: string, @Body() body: { name?: string; hosts?: string[]; color?: string }) {
    const existing = await this.prisma.project.findFirst({ where: { id, workspaceId: auth.workspaceId } })
    if (!existing) throw new NotFoundException("Project not found")
    const project = await this.prisma.project.update({
      where: { id },
      data: {
        ...(typeof body?.name === "string" && body.name.trim() ? { name: body.name.trim().slice(0, 40) } : {}),
        ...(Array.isArray(body?.hosts) ? { hosts: cleanHosts(body.hosts) } : {}),
        ...(typeof body?.color === "string" && /^#[0-9a-f]{6}$/i.test(body.color) ? { color: body.color } : {}),
      },
    })
    if (project.hosts.length) await this.claimReports(auth.workspaceId, project.id, project.hosts)
    return project
  }

  @Delete("projects/:id")
  @MinRole("member")
  async deleteProject(@Auth() auth: AuthContext, @Param("id") id: string) {
    const result = await this.prisma.project.deleteMany({ where: { id, workspaceId: auth.workspaceId } })
    return { ok: result.count > 0 }
  }

  private async claimReports(workspaceId: string, projectId: string, hosts: string[]) {
    const reports = await this.prisma.bugReport.findMany({ where: { workspaceId, projectId: null }, select: { id: true, url: true } })
    const ids = reports.filter((r) => hosts.includes(hostOf(r.url) ?? "")).map((r) => r.id)
    if (ids.length) await this.prisma.bugReport.updateMany({ where: { id: { in: ids } }, data: { projectId } })
  }

  // ---------- comments & activity ----------
  @Get("reports/:id/activity")
  async activity(@Auth() auth: AuthContext, @Param("id") id: string) {
    await this.ownReport(auth, id)
    const [items, comments] = await Promise.all([
      this.prisma.activity.findMany({
        where: { reportId: id },
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
        take: 200,
      }),
      this.prisma.comment.findMany({
        where: { reportId: id },
        include: { author: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
        take: 200,
      }),
    ])
    return [
      ...items.map((a) => ({ type: "activity" as const, id: a.id, kind: a.kind, data: a.data, actor: a.actor, createdAt: a.createdAt })),
      ...comments.map((c) => ({ type: "comment" as const, id: c.id, body: c.body, actor: c.author, createdAt: c.createdAt })),
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  @RateLimit({ name: "comment", by: "user", limit: 120, windowSec: 3600 })
  @Post("reports/:id/comments")
  async comment(@Auth() auth: AuthContext, @Param("id") id: string, @Body() body: { body?: string }) {
    await this.ownReport(auth, id)
    const text = typeof body?.body === "string" ? body.body.trim().slice(0, 5000) : ""
    if (!text) throw new BadRequestException("Write something first")
    const comment = await this.prisma.comment.create({
      data: { reportId: id, authorId: auth.userId, body: text },
      include: { author: { select: { id: true, name: true, email: true } } },
    })
    notifyMentions(this.prisma, this.mailer, id, auth.workspaceId, auth.userId, text)
    return comment
  }

  @Delete("comments/:id")
  async deleteComment(@Auth() auth: AuthContext, @Param("id") id: string) {
    const result = await this.prisma.comment.deleteMany({ where: { id, authorId: auth.userId } })
    return { ok: result.count > 0 }
  }

  private async ownReport(auth: AuthContext, id: string) {
    const report = await this.prisma.bugReport.findFirst({ where: { id, workspaceId: auth.workspaceId }, select: { id: true } })
    if (!report) throw new NotFoundException("Report not found")
  }
}

function cleanHosts(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input
    .filter((h): h is string => typeof h === "string")
    .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter((h) => /^[a-z0-9.-]+(:\d+)?$/.test(h)))].slice(0, 10)
}

export { logActivity }
