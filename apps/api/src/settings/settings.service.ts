import { BadRequestException, Injectable } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { Prisma } from "@prisma/client"
import { decrypt, encrypt } from "../auth/crypto"
import { planOf } from "../plans/plans"

/** Per-workspace settings. The Gemini key is stored encrypted. */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  get sharedLimit() {
    return Number(process.env.SHARED_AI_MONTHLY_LIMIT || 20)
  }

  /**
   * Which Gemini key to use. A workspace's own key has no BugSnap limit.
   * Otherwise the shared key is used, up to `sharedLimit` write-ups a month.
   */
  async pickGeminiKey(workspaceId: string): Promise<{ key: string; shared: boolean } | { key: null; reason: string }> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { geminiKeyEnc: true, aiUsed: true, aiPeriod: true, plan: true },
    })
    const limit = planOf(ws?.plan).aiPerMonth ?? Infinity
    const own = ws?.geminiKeyEnc ? decrypt(ws.geminiKeyEnc) : null
    if (own) return { key: own, shared: false }
    const shared = process.env.GEMINI_API_KEY
    if (!shared) return { key: null, reason: "No Gemini API key set. Add one in Settings to get an AI write-up." }
    const used = ws?.aiPeriod === currentPeriod() ? ws.aiUsed : 0
    if (used >= limit) {
      return {
        key: null,
        reason: `You used all ${limit} AI write-ups of your plan this month. Add your own free Gemini key in Settings for unlimited write-ups.`,
      }
    }
    return { key: shared, shared: true }
  }

  /** Counts one free write-up (only call after a successful AI answer). */
  async countSharedUse(workspaceId: string) {
    const period = currentPeriod()
    const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { aiPeriod: true } })
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: ws?.aiPeriod === period ? { aiUsed: { increment: 1 } } : { aiUsed: 1, aiPeriod: period },
    })
  }

  async getKeyStatus(workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { geminiKeyEnc: true, aiUsed: true, aiPeriod: true, githubRepo: true, plan: true },
    })
    const own = ws?.geminiKeyEnc ? decrypt(ws.geminiKeyEnc) : null
    return {
      key: own ? (own.length > 14 ? `${own.slice(0, 6)}...${own.slice(-4)}` : "***") : undefined,
      usingServerKey: !own && Boolean(process.env.GEMINI_API_KEY),
      sharedUsed: ws?.aiPeriod === currentPeriod() ? ws.aiUsed : 0,
      sharedLimit: planOf(ws?.plan).aiPerMonth ?? this.sharedLimit,
      githubRepo: ws?.githubRepo ?? null,
    }
  }

  async onboarding(workspaceId: string) {
    const [reports, recorded, aiDone, shared, apiKeys, status] = await Promise.all([
      this.prisma.bugReport.count({ where: { workspaceId } }),
      this.prisma.bugReport.count({ where: { workspaceId, NOT: { browserInfo: { equals: Prisma.DbNull } } } }),
      this.prisma.bugReport.count({ where: { workspaceId, aiStatus: "done" } }),
      this.prisma.bugReport.count({ where: { workspaceId, NOT: { shareToken: null } } }),
      this.prisma.apiKey.count({ where: { workspaceId, revokedAt: null } }),
      this.getKeyStatus(workspaceId),
    ])
    return {
      recordedFirstBug: recorded > 0,
      gotAiWriteUp: aiDone > 0,
      sharedReport: shared > 0 || Boolean(status.githubRepo),
      connectedAgent: apiKeys > 0,
      reports,
      ai: status,
    }
  }

  async setGithubRepo(workspaceId: string, repo: unknown) {
    let value: string | null = null
    if (typeof repo === "string" && repo.trim()) {
      const cleaned = repo
        .trim()
        .replace(/^https?:\/\/github\.com\//i, "")
        .replace(/\.git$/, "")
        .replace(/\/+$/, "")
      if (!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(cleaned)) {
        throw new BadRequestException("Use the form owner/repo, for example acme/web-app")
      }
      value = cleaned
    }
    await this.prisma.workspace.update({ where: { id: workspaceId }, data: { githubRepo: value } })
    return { githubRepo: value }
  }

  async setGeminiKey(workspaceId: string, key: unknown) {
    if (key === null || key === "") {
      await this.prisma.workspace.update({ where: { id: workspaceId }, data: { geminiKeyEnc: null } })
      return
    }
    if (typeof key !== "string" || key.trim().length < 20 || key.length > 200) {
      throw new BadRequestException("That does not look like a Gemini API key")
    }
    await this.prisma.workspace.update({ where: { id: workspaceId }, data: { geminiKeyEnc: encrypt(key.trim()) } })
  }
}

export function currentPeriod(date = new Date()) {
  return date.toISOString().slice(0, 7)
}
