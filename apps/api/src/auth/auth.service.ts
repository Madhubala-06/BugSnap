import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { Mailer } from "./mailer"
import { normalizeEmail, randomCode, randomToken, safeEqual, sha256 } from "./crypto"
import { ROLE_RANK, type AuthContext, type Role } from "./public.decorator"

const CODE_TTL_MS = 10 * 60 * 1000
const MAX_CODES_PER_WINDOW = 5
const CODE_WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer
  ) {}

  async requestCode(rawEmail: unknown) {
    const email = normalizeEmail(rawEmail)
    if (!email) throw new BadRequestException("Enter a valid email address")

    const recent = await this.prisma.loginCode.count({
      where: { email, createdAt: { gt: new Date(Date.now() - CODE_WINDOW_MS) } },
    })
    if (recent >= MAX_CODES_PER_WINDOW) {
      throw new HttpException("Too many codes. Wait 15 minutes and try again.", HttpStatus.TOO_MANY_REQUESTS)
    }

    const code = randomCode()
    await this.prisma.loginCode.create({
      data: { email, codeHash: sha256(`${email}:${code}`), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
    })
    const emailed = await this.mailer.sendLoginCode(email, code)
    // In local dev without email, return the code so you can sign in.
    return { sent: true, ...(emailed ? {} : { devCode: code }) }
  }

  async verify(rawEmail: unknown, rawCode: unknown, client: unknown) {
    const email = normalizeEmail(rawEmail)
    const code = typeof rawCode === "string" ? rawCode.replace(/\D/g, "") : ""
    if (!email || code.length !== 6) throw new BadRequestException("Enter the 6-digit code")

    const entry = await this.prisma.loginCode.findFirst({
      where: { email, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    })
    if (!entry || entry.attempts >= MAX_ATTEMPTS) throw new UnauthorizedException("This code has expired. Ask for a new one.")

    if (!safeEqual(entry.codeHash, sha256(`${email}:${code}`))) {
      await this.prisma.loginCode.update({ where: { id: entry.id }, data: { attempts: { increment: 1 } } })
      throw new UnauthorizedException("That code is not right")
    }
    await this.prisma.loginCode.update({ where: { id: entry.id }, data: { usedAt: new Date() } })

    let user = await this.prisma.user.findUnique({ where: { email }, include: { workspace: true } })
    if (!user) {
      const name = email.split("@")[0].split("+")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      const workspace = await this.prisma.workspace.create({
        data: {
          name: `${name}'s workspace`,
          slug: `${email.split("@")[0].replace(/[^a-z0-9]/g, "").slice(0, 20) || "ws"}-${randomToken().slice(0, 6).toLowerCase()}`,
          users: { create: { email, name } },
        },
        include: { users: true },
      })
      await this.prisma.membership.create({ data: { workspaceId: workspace.id, userId: workspace.users[0].id, role: "owner" } })
      user = { ...workspace.users[0], workspace }
    }

    const token = randomToken()
    await this.prisma.authToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        client: client === "extension" ? "extension" : "web",
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    })
    // Clean up old codes for this email.
    await this.prisma.loginCode.deleteMany({ where: { email, createdAt: { lt: new Date(Date.now() - CODE_WINDOW_MS) } } })

    return { token, user: this.publicUser(user) }
  }

  async validate(token: string): Promise<AuthContext | null> {
    if (!token || token.length > 200) return null
    if (token.startsWith("bsk_")) return this.validateApiKey(token)
    const row = await this.prisma.authToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    })
    if (!row || row.expiresAt < new Date()) return null
    // Touch at most once an hour.
    if (Date.now() - row.lastUsedAt.getTime() > 60 * 60 * 1000) {
      await this.prisma.authToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined)
    }
    const membership = await this.currentMembership(row.userId, row.user.workspaceId)
    if (!membership) return null
    return { userId: row.userId, workspaceId: membership.workspaceId, email: row.user.email, tokenId: row.id, role: membership.role as Role }
  }

  /**
   * The workspace a person is working in. If they were removed from it,
   * fall back to another one they belong to (or a fresh personal one).
   */
  async currentMembership(userId: string, workspaceId: string) {
    const current = await this.prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } })
    if (current) return current
    let other = await this.prisma.membership.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } })
    if (!other) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } })
      if (!user) return null
      const ws = await this.prisma.workspace.create({
        data: { name: `${user.name}'s workspace`, slug: `ws-${randomToken().slice(0, 10).toLowerCase()}` },
      })
      other = await this.prisma.membership.create({ data: { workspaceId: ws.id, userId, role: "owner" } })
    }
    await this.prisma.user.update({ where: { id: userId }, data: { workspaceId: other.workspaceId } })
    return other
  }

  /** API keys (bsk_...) for coding agents and scripts. */
  private async validateApiKey(key: string): Promise<AuthContext | null> {
    const row = await this.prisma.apiKey.findUnique({ where: { keyHash: sha256(key) }, include: { user: true } })
    if (!row || row.revokedAt) return null
    // Keys stop working if their owner leaves the workspace.
    const membership = await this.prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId: row.workspaceId, userId: row.userId } } })
    if (!membership) return null
    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 10 * 60 * 1000) {
      await this.prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined)
    }
    return { userId: row.userId, workspaceId: row.workspaceId, email: row.user.email, tokenId: `apikey:${row.id}`, role: membership.role as Role }
  }

  async listApiKeys(auth: AuthContext) {
    return this.prisma.apiKey.findMany({
      where: { workspaceId: auth.workspaceId, revokedAt: null },
      select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    })
  }

  async createApiKey(auth: AuthContext, rawName: unknown) {
    const name = typeof rawName === "string" && rawName.trim() ? rawName.trim().slice(0, 60) : "API key"
    const count = await this.prisma.apiKey.count({ where: { workspaceId: auth.workspaceId, revokedAt: null } })
    if (count >= 10) throw new BadRequestException("You can have up to 10 keys. Revoke one first.")
    const key = `bsk_${randomToken()}`
    const row = await this.prisma.apiKey.create({
      data: { workspaceId: auth.workspaceId, userId: auth.userId, name, prefix: key.slice(0, 10), keyHash: sha256(key) },
      select: { id: true, name: true, prefix: true, createdAt: true },
    })
    // The full key is shown once and never stored.
    return { ...row, key }
  }

  async revokeApiKey(auth: AuthContext, id: string) {
    const result = await this.prisma.apiKey.updateMany({ where: { id, workspaceId: auth.workspaceId, revokedAt: null }, data: { revokedAt: new Date() } })
    return { ok: result.count > 0 }
  }

  async me(auth: AuthContext) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } })
    const memberships = await this.prisma.membership.findMany({
      where: { userId: auth.userId },
      include: { workspace: { select: { id: true, name: true, _count: { select: { members: true } } } } },
      orderBy: { createdAt: "asc" },
    })
    const current = memberships.find((m) => m.workspaceId === auth.workspaceId)
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      notifyEmail: user.notifyEmail,
      role: auth.role,
      isOps: (process.env.OPS_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).includes(user.email.toLowerCase()),
      workspace: { id: auth.workspaceId, name: current?.workspace.name ?? "Workspace", members: current?.workspace._count.members ?? 1 },
      workspaces: memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name, role: m.role, members: m.workspace._count.members })),
    }
  }

  async updateProfile(auth: AuthContext, body: { name?: unknown; notifyEmail?: unknown }) {
    const data: { name?: string; notifyEmail?: boolean } = {}
    if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 60)
    if (typeof body?.notifyEmail === "boolean") data.notifyEmail = body.notifyEmail
    await this.prisma.user.update({ where: { id: auth.userId }, data })
    return this.me(auth)
  }

  hasRole(auth: AuthContext, min: Role) {
    return ROLE_RANK[auth.role] >= ROLE_RANK[min]
  }

  /**
   * A separate sign-in for the Chrome extension, handed over by the signed-in web app
   * (the website's own token is never shared). Signing out of one does not end the other.
   */
  async issueExtensionToken(auth: AuthContext) {
    if (auth.tokenId.startsWith("apikey:")) throw new ForbiddenException("Use a browser sign-in to connect the extension")
    const token = randomToken()
    await this.prisma.authToken.create({
      data: { userId: auth.userId, tokenHash: sha256(token), client: "extension", expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
    })
    return { token, me: await this.me(auth) }
  }

  async logout(auth: AuthContext) {
    if (auth.tokenId.startsWith("apikey:")) return { ok: true }
    await this.prisma.authToken.delete({ where: { id: auth.tokenId } }).catch(() => undefined)
    return { ok: true }
  }

  private publicUser(user: { id: string; email: string; name: string; workspace: { id: string; name: string } }) {
    return { id: user.id, email: user.email, name: user.name, workspace: { id: user.workspace.id, name: user.workspace.name } }
  }
}
