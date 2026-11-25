import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Query, Req } from "@nestjs/common"
import type { Request } from "express"
import { Auth, Public, type AuthContext } from "../auth/public.decorator"
import { ErrorsService, opsEmails } from "./errors.service"
import { RateLimit } from "./rate-limit"

@Controller("ops")
export class OpsController {
  constructor(private readonly errors: ErrorsService) {}

  /** Browser errors from the web app and the extension (no sign-in needed, rate limited). */
  @Public()
  @Post("client-errors")
  @HttpCode(204)
  @RateLimit({ name: "client-error", by: "ip", limit: 60, windowSec: 3600 })
  async clientError(@Req() req: Request, @Body() body: { source?: unknown; message?: unknown; stack?: unknown; url?: unknown }) {
    if (typeof body?.message !== "string" || !body.message.trim()) return
    await this.errors.record({
      source: body.source === "extension" ? "extension" : "web",
      message: body.message.slice(0, 1000),
      stack: typeof body.stack === "string" ? body.stack : null,
      path: typeof body.url === "string" ? body.url.replace(/^https?:\/\/[^/]+/, "") : null,
      userAgent: String(req.headers["user-agent"] ?? ""),
    })
  }

  /** Throws on purpose, so the team can check that errors are tracked and alerts arrive. */
  @Post("test-error")
  testError(@Auth() auth: AuthContext) {
    if (!opsEmails().includes(auth.email.toLowerCase())) throw new ForbiddenException("Only the BugSnap team can do this")
    throw new Error(`Test error from ${auth.email} at ${new Date().toISOString()}`)
  }

  @Get("errors")
  list(@Auth() auth: AuthContext, @Query("days") days?: string) {
    if (!opsEmails().includes(auth.email.toLowerCase())) throw new ForbiddenException("Only the BugSnap team can see this")
    return this.errors.summary(Math.min(30, Math.max(1, Number(days) || 7)))
  }
}
