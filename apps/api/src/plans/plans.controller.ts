import { Controller, Get, HttpCode, Post } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { Auth, MinRole, type AuthContext } from "../auth/public.decorator"
import { Mailer } from "../auth/mailer"
import { opsEmails } from "../ops/errors.service"
import { PLANS, usage } from "./plans"

@Controller("workspace")
export class PlansController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer
  ) {}

  @Get("usage")
  usage(@Auth() auth: AuthContext) {
    return usage(this.prisma, auth.workspaceId).then((u) => ({ ...u, plans: PLANS }))
  }

  /** No payments yet: record interest in Pro and tell the team. */
  @Post("pro-interest")
  @HttpCode(200)
  @MinRole("admin")
  async proInterest(@Auth() auth: AuthContext) {
    const ws = await this.prisma.workspace.update({ where: { id: auth.workspaceId }, data: { proInterestAt: new Date() }, select: { name: true } })
    for (const to of opsEmails()) {
      await this.mailer.sendEmail(to, `Pro waitlist: ${ws.name}`, `${auth.email} wants BugSnap Pro for "${ws.name}".`, `<p><b>${auth.email}</b> wants BugSnap Pro for "${ws.name}".</p>`)
    }
    return { ok: true }
  }
}
