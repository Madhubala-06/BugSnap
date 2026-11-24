import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, NotFoundException, Param, Patch, Post, Query, Req, Res } from "@nestjs/common"
import type { Request, Response } from "express"
import { PrismaService } from "../prisma/prisma.service"
import { Auth, MinRole, Public, type AuthContext } from "../auth/public.decorator"
import { verifyGithubSignature } from "./github"
import { verifyLinearSignature } from "./linear"
import { appUrl, IntegrationsService, PROVIDERS, type Provider } from "./integrations.service"

type RawRequest = Request & { rawBody?: Buffer }

const asProvider = (p: string): Provider => {
  if (!PROVIDERS.includes(p as Provider)) throw new NotFoundException("Unknown integration")
  return p as Provider
}

@Controller()
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly prisma: PrismaService
  ) {}

  @Get("integrations")
  list(@Auth() auth: AuthContext) {
    return this.integrations.list(auth.workspaceId)
  }

  /** Where to send the admin to install the GitHub App; state ties the install to this workspace. */
  @Get("integrations/github/install")
  @MinRole("admin")
  install(@Auth() auth: AuthContext) {
    const slug = process.env.GITHUB_APP_SLUG
    if (!slug) throw new BadRequestException("GitHub is not set up on this server yet")
    return { url: `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(this.integrations.signState(auth.workspaceId, auth.userId))}` }
  }

  /** GitHub sends people back here after they install (the app's "Setup URL"). */
  @Public()
  @Get("integrations/github/setup")
  async githubSetup(@Query("installation_id") installationId: string, @Query("state") state: string, @Res() res: Response) {
    const back = (q: string) => res.redirect(`${appUrl()}/dashboard/integrations?${q}`)
    const who = this.integrations.readState(state)
    if (!who) return back("error=github_state")
    if (!/^\d+$/.test(installationId ?? "")) return back("error=github_install")
    try {
      await this.integrations.connectGithub(who.w, who.u, installationId)
      return back("connected=github")
    } catch {
      return back("error=github_install")
    }
  }

  @Get("integrations/github/repos")
  githubRepos(@Auth() auth: AuthContext) {
    return this.integrations.githubRepos(auth.workspaceId)
  }

  @Get("integrations/jira/projects")
  jiraProjects(@Auth() auth: AuthContext) {
    return this.integrations.jiraProjects(auth.workspaceId)
  }

  @Post("integrations/:provider")
  @MinRole("admin")
  async connect(@Auth() auth: AuthContext, @Param("provider") p: string, @Body() body: Record<string, unknown>) {
    const provider = asProvider(p)
    if (provider === "slack") await this.integrations.connectSlack(auth.workspaceId, auth.userId, body ?? {})
    else if (provider === "linear") await this.integrations.connectLinear(auth.workspaceId, auth.userId, body ?? {})
    else if (provider === "jira") await this.integrations.connectJira(auth.workspaceId, auth.userId, body ?? {})
    else throw new BadRequestException("Connect GitHub with the Install button")
    return this.integrations.list(auth.workspaceId)
  }

  @Patch("integrations/:provider")
  @MinRole("admin")
  update(@Auth() auth: AuthContext, @Param("provider") p: string, @Body() body: Record<string, unknown>) {
    return this.integrations.updateConfig(auth.workspaceId, asProvider(p), body ?? {})
  }

  @Delete("integrations/:provider")
  @MinRole("admin")
  disconnect(@Auth() auth: AuthContext, @Param("provider") p: string) {
    return this.integrations.disconnect(auth.workspaceId, asProvider(p))
  }

  // ---------- issues for a report ----------

  @Post("reports/:id/issues")
  @MinRole("member")
  createIssue(@Auth() auth: AuthContext, @Param("id") id: string, @Body() body: { provider?: string; target?: string }) {
    return this.integrations.createIssue(auth.workspaceId, auth.userId, id, asProvider(String(body?.provider ?? "")), typeof body?.target === "string" ? body.target : undefined)
  }

  @Post("reports/:id/issues/refresh")
  @HttpCode(200)
  async refresh(@Auth() auth: AuthContext, @Param("id") id: string) {
    await this.integrations.refreshJira(auth.workspaceId, id)
    return this.prisma.reportLink.findMany({ where: { reportId: id, report: { workspaceId: auth.workspaceId } } })
  }

  // ---------- incoming webhooks ----------

  @Public()
  @Post("integrations/github/webhook")
  @HttpCode(200)
  async githubWebhook(@Req() req: RawRequest, @Headers("x-hub-signature-256") sig: string, @Headers("x-github-event") event: string, @Body() body: Record<string, any>) {
    if (!verifyGithubSignature(req.rawBody, sig)) throw new ForbiddenException("Bad signature")
    if (event === "issues" && (body.action === "closed" || body.action === "reopened")) {
      const repo = body.repository?.full_name
      const num = body.issue?.number
      if (repo && num) {
        const closed = body.action === "closed"
        return this.integrations.applyExternal("github", `${repo}#${num}`, closed, `${repo}#${num} was ${closed ? "closed" : "reopened"} on GitHub`, closed ? "closed" : "open")
      }
    }
    if (event === "installation" && body.action === "deleted" && body.installation?.id) {
      await this.prisma.integration.deleteMany({ where: { provider: "github", externalId: String(body.installation.id) } })
    }
    return { ok: true }
  }

  @Public()
  @Post("integrations/linear/webhook/:token")
  @HttpCode(200)
  async linearWebhook(@Req() req: RawRequest, @Param("token") token: string, @Headers("linear-signature") sig: string, @Body() body: Record<string, any>) {
    const row = await this.prisma.integration.findFirst({ where: { provider: "linear", externalId: token } })
    if (!row) throw new NotFoundException()
    const s = this.integrations.secret<{ webhookSecret: string }>(row)
    if (!s || !verifyLinearSignature(req.rawBody, sig, s.webhookSecret)) throw new ForbiddenException("Bad signature")
    if (body.type === "Issue" && body.action === "update" && body.data?.id && body.updatedFrom?.stateId) {
      const type = body.data.state?.type as string | undefined
      const name = body.data.state?.name as string | undefined
      const done = type === "completed" || type === "canceled"
      return this.integrations.applyExternal("linear", body.data.id, done, `${body.data.identifier ?? "Linear issue"} moved to ${name ?? type}`, name ?? type ?? "")
    }
    return { ok: true }
  }
}
