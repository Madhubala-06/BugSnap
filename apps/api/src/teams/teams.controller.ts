import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, GoneException, HttpCode, NotFoundException, Param, Patch, Post } from "@nestjs/common"
import { assertCanAddMembers } from "../plans/plans"
import { RateLimit } from "../ops/rate-limit"
import { waitUntil } from "@vercel/functions"
import { PrismaService } from "../prisma/prisma.service"
import { Mailer } from "../auth/mailer"
import { normalizeEmail, randomToken, sha256 } from "../auth/crypto"
import { Auth, MinRole, Public, ROLE_RANK, ROLES, type AuthContext, type Role } from "../auth/public.decorator"
import { inviteEmail } from "./email-templates"

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_MEMBERS = 50

export function appUrl() {
  return (process.env.FRONTEND_URL || "http://localhost:3002").split(",")[0].trim().replace(/\/$/, "")
}

function background(job: Promise<unknown>) {
  try {
    waitUntil(job.catch(() => undefined))
  } catch {
    // not on Vercel: the promise just runs
  }
}

const asRole = (r: unknown): Role | null => (ROLES.includes(r as Role) ? (r as Role) : null)

@Controller()
export class TeamsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer
  ) {}

  // ---------- workspaces ----------

  @Post("workspaces")
  async create(@Auth() auth: AuthContext, @Body() body: { name?: string }) {
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : ""
    if (!name) throw new BadRequestException("Give the workspace a name")
    const owned = await this.prisma.membership.count({ where: { userId: auth.userId, role: "owner" } })
    if (owned >= 10) throw new BadRequestException("You can own up to 10 workspaces")
    const ws = await this.prisma.workspace.create({
      data: { name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}-${randomToken().slice(0, 6).toLowerCase()}` },
    })
    await this.prisma.membership.create({ data: { workspaceId: ws.id, userId: auth.userId, role: "owner" } })
    await this.prisma.user.update({ where: { id: auth.userId }, data: { workspaceId: ws.id } })
    return { id: ws.id, name: ws.name }
  }

  /** Switch the workspace you work in (web, extension and MCP keys follow). */
  @Post("workspaces/:id/switch")
  @HttpCode(200)
  async switch(@Auth() auth: AuthContext, @Param("id") id: string) {
    const m = await this.prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId: id, userId: auth.userId } } })
    if (!m) throw new NotFoundException("You are not in that workspace")
    await this.prisma.user.update({ where: { id: auth.userId }, data: { workspaceId: id } })
    return { ok: true }
  }

  @Patch("workspace")
  @MinRole("admin")
  async rename(@Auth() auth: AuthContext, @Body() body: { name?: string }) {
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : ""
    if (!name) throw new BadRequestException("Give the workspace a name")
    const ws = await this.prisma.workspace.update({ where: { id: auth.workspaceId }, data: { name } })
    return { id: ws.id, name: ws.name }
  }

  // ---------- members ----------

  @Get("workspace/team")
  async team(@Auth() auth: AuthContext) {
    const [members, invites] = await Promise.all([
      this.prisma.membership.findMany({
        where: { workspaceId: auth.workspaceId },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.invite.findMany({
        where: { workspaceId: auth.workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
        include: { invitedBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ])
    return {
      you: { id: auth.userId, role: auth.role },
      members: members.map((m) => ({ ...m.user, role: m.role, joinedAt: m.createdAt })),
      // Only admins see pending invites.
      invites: ROLE_RANK[auth.role] >= ROLE_RANK.admin
        ? invites.map((i) => ({ id: i.id, email: i.email, role: i.role, invitedBy: i.invitedBy.name, createdAt: i.createdAt, expiresAt: i.expiresAt }))
        : [],
    }
  }

  @Patch("workspace/members/:userId")
  @MinRole("admin")
  async setRole(@Auth() auth: AuthContext, @Param("userId") userId: string, @Body() body: { role?: string }) {
    const role = asRole(body?.role)
    if (!role) throw new BadRequestException("Unknown role")
    const target = await this.prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId: auth.workspaceId, userId } } })
    if (!target) throw new NotFoundException("Not a member")
    // Only owners can make or unmake owners.
    if ((role === "owner" || target.role === "owner") && auth.role !== "owner") throw new ForbiddenException("Only owners can change owners")
    if (target.role === "owner" && role !== "owner") await this.keepAnOwner(auth.workspaceId, userId)
    await this.prisma.membership.update({ where: { id: target.id }, data: { role } })
    return { ok: true }
  }

  @Delete("workspace/members/:userId")
  async remove(@Auth() auth: AuthContext, @Param("userId") userId: string) {
    const self = userId === "me" || userId === auth.userId
    const id = self ? auth.userId : userId
    if (!self && ROLE_RANK[auth.role] < ROLE_RANK.admin) throw new ForbiddenException("Only workspace admins can remove people")
    const target = await this.prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId: auth.workspaceId, userId: id } } })
    if (!target) throw new NotFoundException("Not a member")
    if (target.role === "owner" && !self && auth.role !== "owner") throw new ForbiddenException("Only owners can remove owners")
    if (target.role === "owner") await this.keepAnOwner(auth.workspaceId, id)
    await this.prisma.membership.delete({ where: { id: target.id } })
    // Their open bugs go back to the inbox.
    await this.prisma.bugReport.updateMany({ where: { workspaceId: auth.workspaceId, assigneeId: id }, data: { assigneeId: null } })
    return { ok: true }
  }

  private async keepAnOwner(workspaceId: string, leavingUserId: string) {
    const others = await this.prisma.membership.count({ where: { workspaceId, role: "owner", NOT: { userId: leavingUserId } } })
    if (!others) throw new BadRequestException("A workspace needs at least one owner. Make someone else owner first.")
  }

  // ---------- invites ----------

  @RateLimit({ name: "invite", by: "workspace", limit: 50, windowSec: 86400 })
  @Post("workspace/invites")
  @MinRole("admin")
  async invite(@Auth() auth: AuthContext, @Body() body: { emails?: unknown; role?: string }) {
    const role = asRole(body?.role) ?? "member"
    if (role === "owner" && auth.role !== "owner") throw new ForbiddenException("Only owners can invite owners")
    const raw = Array.isArray(body?.emails) ? body.emails : typeof body?.emails === "string" ? body.emails.split(/[\s,;]+/) : []
    const emails = [...new Set(raw.map(normalizeEmail).filter((e): e is string => Boolean(e)))].slice(0, 20)
    await assertCanAddMembers(this.prisma, auth.workspaceId, emails.length)
    if (!emails.length) throw new BadRequestException("Enter at least one valid email")

    const [count, ws, inviter] = await Promise.all([
      this.prisma.membership.count({ where: { workspaceId: auth.workspaceId } }),
      this.prisma.workspace.findUniqueOrThrow({ where: { id: auth.workspaceId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } }),
    ])
    if (count + emails.length > MAX_MEMBERS) throw new BadRequestException(`Up to ${MAX_MEMBERS} people per workspace for now`)

    const results: { email: string; status: "invited" | "already_member"; url?: string }[] = []
    for (const email of emails) {
      const existing = await this.prisma.membership.findFirst({ where: { workspaceId: auth.workspaceId, user: { email } } })
      if (existing) {
        results.push({ email, status: "already_member" })
        continue
      }
      // Replace older pending invites for the same email.
      await this.prisma.invite.deleteMany({ where: { workspaceId: auth.workspaceId, email, acceptedAt: null } })
      const token = randomToken()
      await this.prisma.invite.create({
        data: { workspaceId: auth.workspaceId, email, role, tokenHash: sha256(token), invitedById: auth.userId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
      })
      const url = `${appUrl()}/invite/${token}`
      const mail = inviteEmail({ inviter: inviter.name, workspace: ws.name, role, url })
      background(this.mailer.sendEmail(email, mail.subject, mail.text, mail.html))
      // The link is returned so admins can also share it themselves.
      results.push({ email, status: "invited", url })
    }
    return { results }
  }

  @Delete("workspace/invites/:id")
  @MinRole("admin")
  async revoke(@Auth() auth: AuthContext, @Param("id") id: string) {
    const r = await this.prisma.invite.deleteMany({ where: { id, workspaceId: auth.workspaceId, acceptedAt: null } })
    return { ok: r.count > 0 }
  }

  /** What an invite is for, so the page can say "Join Acme as member". */
  @Public()
  @Get("invites/:token")
  async preview(@Param("token") token: string) {
    const invite = await this.findInvite(token)
    return { workspace: invite.workspace.name, email: invite.email, role: invite.role, invitedBy: invite.invitedBy.name }
  }

  @Post("invites/:token/accept")
  @HttpCode(200)
  async accept(@Auth() auth: AuthContext, @Param("token") token: string) {
    const invite = await this.findInvite(token)
    if (invite.email !== auth.email.toLowerCase()) {
      throw new ForbiddenException(`This invite is for ${invite.email}. Sign in with that email to accept it.`)
    }
    await this.prisma.membership.upsert({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: auth.userId } },
      create: { workspaceId: invite.workspaceId, userId: auth.userId, role: invite.role },
      update: {},
    })
    await this.prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } })
    await this.prisma.user.update({ where: { id: auth.userId }, data: { workspaceId: invite.workspaceId } })
    return { ok: true, workspace: { id: invite.workspaceId, name: invite.workspace.name } }
  }

  private async findInvite(token: string) {
    if (!token || token.length > 100) throw new NotFoundException("Invite not found")
    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash: sha256(token) },
      include: { workspace: { select: { name: true } }, invitedBy: { select: { name: true } } },
    })
    if (!invite) throw new NotFoundException("This invite does not exist. Ask for a new one.")
    if (invite.acceptedAt) throw new GoneException("This invite was already used.")
    if (invite.expiresAt < new Date()) throw new GoneException("This invite has expired. Ask for a new one.")
    return invite
  }
}
