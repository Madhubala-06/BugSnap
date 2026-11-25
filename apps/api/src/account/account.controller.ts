import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Header, HttpCode } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { Auth, type AuthContext } from "../auth/public.decorator"
import { RateLimit } from "../ops/rate-limit"
import { deleteWorkspaceFiles } from "./files"

/** Your own data: download all of it, or delete your account. */
@Controller("account")
export class AccountController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("export")
  @Header("Content-Disposition", 'attachment; filename="bugsnap-my-data.json"')
  @RateLimit({ name: "export", by: "user", limit: 10, windowSec: 3600 })
  async export(@Auth() auth: AuthContext) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } })
    const [memberships, reports, comments, apiKeys] = await Promise.all([
      this.prisma.membership.findMany({ where: { userId: user.id }, include: { workspace: { select: { id: true, name: true, createdAt: true } } } }),
      this.prisma.bugReport.findMany({ where: { reporterId: user.id }, orderBy: { createdAt: "desc" } }),
      this.prisma.comment.findMany({ where: { authorId: user.id }, orderBy: { createdAt: "desc" } }),
      this.prisma.apiKey.findMany({
        where: { userId: user.id },
        select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, revokedAt: true },
      }),
    ])
    return {
      exportedAt: new Date().toISOString(),
      profile: { id: user.id, email: user.email, name: user.name, notifyEmail: user.notifyEmail, createdAt: user.createdAt },
      workspaces: memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name, role: m.role, joinedAt: m.createdAt })),
      bugReports: reports,
      comments,
      apiKeys,
    }
  }

  /**
   * Delete your account. Workspaces where you are the only member are deleted with all their files.
   * In shared workspaces your bug reports stay for the team (without your name); your comments go.
   */
  @Delete()
  @HttpCode(200)
  @RateLimit({ name: "delete-account", by: "user", limit: 5, windowSec: 3600 })
  async remove(@Auth() auth: AuthContext, @Body() body: { confirmEmail?: unknown }) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } })
    if (typeof body?.confirmEmail !== "string" || body.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new BadRequestException("Type your email address to confirm")
    }
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id },
      include: { workspace: { select: { id: true, name: true, members: { select: { userId: true, role: true } } } } },
    })
    const solo = memberships.filter((m) => m.workspace.members.length === 1).map((m) => m.workspace)
    const shared = memberships.filter((m) => m.workspace.members.length > 1)
    const stuck = shared.filter((m) => m.role === "owner" && !m.workspace.members.some((x) => x.userId !== user.id && x.role === "owner"))
    if (stuck.length) {
      throw new ConflictException(
        `Make someone else an owner of ${stuck.map((m) => `"${m.workspace.name}"`).join(", ")} first (Team page), or remove the other members.`,
      )
    }
    const sharedIds = shared.map((m) => m.workspace.id)

    // Keep the team's bugs; just drop who reported them.
    if (sharedIds.length) await this.prisma.bugReport.updateMany({ where: { reporterId: user.id, workspaceId: { in: sharedIds } }, data: { reporterId: null } })
    // The user row still points at a "current" workspace; move it off solo ones so the cascade below is predictable.
    if (sharedIds[0]) await this.prisma.user.update({ where: { id: user.id }, data: { workspaceId: sharedIds[0] } })
    await this.prisma.user.delete({ where: { id: user.id } })
    for (const w of solo) {
      await deleteWorkspaceFiles(w.id).catch(() => 0)
      await this.prisma.workspace.delete({ where: { id: w.id } }).catch(() => undefined)
    }
    return { ok: true, deletedWorkspaces: solo.map((w) => w.name), leftWorkspaces: shared.map((m) => m.workspace.name) }
  }
}
