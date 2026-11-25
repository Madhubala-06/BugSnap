import { HttpException, HttpStatus } from "@nestjs/common"
import type { PrismaService } from "../prisma/prisma.service"

export type PlanId = "free" | "pro"
export interface Plan {
  id: PlanId
  name: string
  reportsPerMonth: number | null
  members: number | null
  aiPerMonth: number | null
  videoDays: number | null
}

/** One place for what each plan allows. null = no limit. */
export const PLANS: Record<PlanId, Plan> = {
  free: { id: "free", name: "Free", reportsPerMonth: 100, members: 5, aiPerMonth: Number(process.env.SHARED_AI_MONTHLY_LIMIT || 20), videoDays: 90 },
  pro: { id: "pro", name: "Pro", reportsPerMonth: null, members: 50, aiPerMonth: 1000, videoDays: 365 },
}

export const planOf = (plan: string | null | undefined): Plan => PLANS[(plan as PlanId) in PLANS ? (plan as PlanId) : "free"]

export const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))

export class LimitReached extends HttpException {
  constructor(message: string) {
    super({ statusCode: 402, error: "Plan limit", message, upgrade: true }, HttpStatus.PAYMENT_REQUIRED)
  }
}

export async function usage(prisma: PrismaService, workspaceId: string) {
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { plan: true, aiUsed: true, aiPeriod: true, proInterestAt: true, geminiKeyEnc: true },
  })
  const plan = planOf(ws.plan)
  const period = new Date().toISOString().slice(0, 7)
  const [reports, members, pendingInvites, videos] = await Promise.all([
    prisma.bugReport.count({ where: { workspaceId, createdAt: { gte: monthStart() } } }),
    prisma.membership.count({ where: { workspaceId } }),
    prisma.invite.count({ where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*)::bigint AS n FROM bug_reports WHERE workspace_id = ${workspaceId} AND browser_info->>'recordingUrl' IS NOT NULL`
      .then((r) => Number(r[0]?.n ?? 0))
      .catch(() => 0),
  ])
  return {
    plan,
    proInterest: Boolean(ws.proInterestAt),
    ownAiKey: Boolean(ws.geminiKeyEnc),
    reports: { used: reports, limit: plan.reportsPerMonth },
    members: { used: members, pending: pendingInvites, limit: plan.members },
    ai: { used: ws.aiPeriod === period ? ws.aiUsed : 0, limit: plan.aiPerMonth },
    videos: { count: videos, keptDays: plan.videoDays },
    resetsOn: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString(),
  }
}

export async function assertCanCreateReport(prisma: PrismaService, workspaceId: string) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { plan: true } })
  const plan = planOf(ws?.plan)
  if (plan.reportsPerMonth == null) return
  const used = await prisma.bugReport.count({ where: { workspaceId, createdAt: { gte: monthStart() } } })
  if (used >= plan.reportsPerMonth) {
    throw new LimitReached(
      `This workspace used all ${plan.reportsPerMonth} bug reports of the ${plan.name} plan this month. It resets on the 1st, or join the Pro waitlist in Settings.`,
    )
  }
}

export async function assertCanAddMembers(prisma: PrismaService, workspaceId: string, adding: number) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { plan: true } })
  const plan = planOf(ws?.plan)
  if (plan.members == null) return
  const [members, pending] = await Promise.all([
    prisma.membership.count({ where: { workspaceId } }),
    prisma.invite.count({ where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
  ])
  if (members + pending + adding > plan.members) {
    throw new LimitReached(
      `The ${plan.name} plan allows ${plan.members} people per workspace (${members} members, ${pending} invited). Remove someone or join the Pro waitlist in Settings.`,
    )
  }
}
