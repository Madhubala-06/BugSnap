import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { PrismaService } from "../prisma/prisma.service"
import type { AuthContext } from "../auth/public.decorator"

export type LimitBy = "ip" | "user" | "workspace"
export interface LimitRule {
  name: string
  by: LimitBy
  limit: number
  windowSec: number
}
export const RATE_LIMITS = "rateLimits"

/** Cap how often one person, workspace or IP can hit a route. Several rules may be stacked. */
export const RateLimit = (...rules: LimitRule[]) => SetMetadata(RATE_LIMITS, rules)

export function clientIp(req: { headers?: Record<string, unknown>; ip?: string; socket?: { remoteAddress?: string } }) {
  const fwd = String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim()
  return fwd || String(req.headers?.["x-real-ip"] ?? "") || req.ip || req.socket?.remoteAddress || "unknown"
}

/** Count one hit in a fixed window; returns the count after this hit. One SQL round trip. */
export async function hit(prisma: PrismaService, key: string, windowSec: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_counters (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_counters.window_start < now() - make_interval(secs => ${windowSec}) THEN 1 ELSE rate_counters.count + 1 END,
      window_start = CASE WHEN rate_counters.window_start < now() - make_interval(secs => ${windowSec}) THEN now() ELSE rate_counters.window_start END
    RETURNING count`
  return Number(rows[0]?.count ?? 1)
}

export function tooMany(windowSec: number) {
  const mins = Math.ceil(windowSec / 60)
  return new HttpException(`Too many requests. Please wait ${mins >= 60 ? `${Math.round(mins / 60)} hour${mins >= 120 ? "s" : ""}` : `${mins} minute${mins > 1 ? "s" : ""}`} and try again.`, HttpStatus.TOO_MANY_REQUESTS)
}

/** Runs after the sign-in guard, so it can limit per user and per workspace too. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext) {
    const rules = this.reflector.getAllAndOverride<LimitRule[]>(RATE_LIMITS, [context.getHandler(), context.getClass()])
    if (!rules?.length || process.env.RATE_LIMITS === "off") return true
    const req = context.switchToHttp().getRequest()
    const auth = req.auth as AuthContext | undefined
    for (const rule of rules) {
      const who = rule.by === "ip" ? clientIp(req) : rule.by === "user" ? auth?.userId : auth?.workspaceId
      if (!who) continue
      const count = await hit(this.prisma, `${rule.name}:${rule.by}:${who}`, rule.windowSec).catch(() => 0)
      if (count > rule.limit) throw tooMany(rule.windowSec)
    }
    return true
  }
}
