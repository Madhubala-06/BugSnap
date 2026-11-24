import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common"
import { Prisma, type ReportStatus } from "@prisma/client"
import { waitUntil } from "@vercel/functions"
import * as crypto from "crypto"
import { PrismaService } from "../prisma/prisma.service"
import { decrypt, encrypt } from "../auth/crypto"
import { logActivity } from "../triage/activity"
import { toIssueMarkdown } from "../reports/formats"
import * as GH from "./github"
import { isSlackWebhook, postToSlack, slackMessage } from "./slack"
import { linearCreateIssue, linearCreateWebhook, linearDeleteWebhook, linearSetStateType, linearTeams, linearViewer } from "./linear"
import { cleanJiraSite, jiraCreateIssue, jiraMoveTo, jiraMyself, jiraProjects, jiraStatus, type JiraCreds } from "./jira"

export type Provider = "github" | "linear" | "jira" | "slack"
export const PROVIDERS: Provider[] = ["github", "linear", "jira", "slack"]
const DONE: ReportStatus[] = ["RESOLVED", "CLOSED", "WONT_FIX"]

export function appUrl() {
  return (process.env.FRONTEND_URL || "http://localhost:3002").split(",")[0].trim().replace(/\/$/, "")
}
export function apiUrl() {
  return (process.env.BASE_URL || "http://localhost:3001").replace(/\/$/, "")
}

function background(job: Promise<unknown>) {
  try {
    waitUntil(job.catch(() => undefined))
  } catch {
    // not on Vercel
  }
}

type Cfg = Record<string, unknown>

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name)
  constructor(private readonly prisma: PrismaService) {}

  // ---------- storage ----------

  async get(workspaceId: string, provider: Provider) {
    return this.prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId, provider } } })
  }

  secret<T>(row: { secretEnc: string | null }): T | null {
    if (!row.secretEnc) return null
    const raw = decrypt(row.secretEnc)
    try {
      return raw ? (JSON.parse(raw) as T) : null
    } catch {
      return null
    }
  }

  async list(workspaceId: string) {
    const rows = await this.prisma.integration.findMany({ where: { workspaceId } })
    return {
      available: { github: GH.githubConfigured(), linear: true, jira: true, slack: true },
      githubInstallUrl: GH.githubConfigured() ? `https://github.com/apps/${process.env.GITHUB_APP_SLUG}/installations/new` : null,
      connected: Object.fromEntries(rows.map((r) => [r.provider, { config: r.config, connectedAt: r.createdAt }])),
    }
  }

  private async save(workspaceId: string, provider: Provider, config: Cfg, secret: unknown, userId: string | null, externalId?: string) {
    const data = {
      config: config as Prisma.InputJsonValue,
      secretEnc: secret ? encrypt(JSON.stringify(secret)) : null,
      externalId: externalId ?? null,
      createdById: userId,
    }
    return this.prisma.integration.upsert({
      where: { workspaceId_provider: { workspaceId, provider } },
      create: { workspaceId, provider, ...data },
      update: data,
    })
  }

  async updateConfig(workspaceId: string, provider: Provider, patch: Cfg) {
    const row = await this.get(workspaceId, provider)
    if (!row) throw new NotFoundException("Not connected")
    const allowed: Record<Provider, string[]> = {
      github: ["defaultRepo"],
      linear: ["teamId"],
      jira: ["projectKey"],
      slack: ["events"],
    }
    const next = { ...(row.config as Cfg) }
    for (const k of allowed[provider]) if (patch[k] !== undefined) next[k] = patch[k]
    if (provider === "slack" && next.events) next.events = cleanEvents(next.events)
    await this.prisma.integration.update({ where: { id: row.id }, data: { config: next as Prisma.InputJsonValue } })
    return next
  }

  async disconnect(workspaceId: string, provider: Provider) {
    const row = await this.get(workspaceId, provider)
    if (!row) return { ok: true }
    if (provider === "linear") {
      const s = this.secret<{ apiKey: string; webhookId?: string }>(row)
      if (s?.apiKey && s.webhookId) await linearDeleteWebhook(s.apiKey, s.webhookId)
    }
    await this.prisma.integration.delete({ where: { id: row.id } })
    return { ok: true }
  }

  // ---------- connect ----------

  /** Signed state for the GitHub install redirect, so it lands in the right workspace. */
  signState(workspaceId: string, userId: string) {
    const body = Buffer.from(JSON.stringify({ w: workspaceId, u: userId, e: Date.now() + 30 * 60 * 1000 })).toString("base64url")
    const sig = crypto.createHmac("sha256", process.env.APP_SECRET || "bugsnap-dev-only-secret").update(body).digest("base64url")
    return `${body}.${sig}`
  }

  readState(state: string): { w: string; u: string } | null {
    const [body, sig] = (state || "").split(".")
    if (!body || !sig) return null
    const expected = crypto.createHmac("sha256", process.env.APP_SECRET || "bugsnap-dev-only-secret").update(body).digest("base64url")
    if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as { w: string; u: string; e: number }
    return data.e > Date.now() ? data : null
  }

  async connectGithub(workspaceId: string, userId: string, installationId: string) {
    const info = await GH.installationInfo(installationId)
    const repos = await GH.listRepos(installationId).catch(() => [])
    await this.save(workspaceId, "github", { installationId, account: info.account.login, defaultRepo: repos[0]?.fullName ?? null }, null, userId, installationId)
  }

  async connectSlack(workspaceId: string, userId: string, body: { webhookUrl?: unknown; channel?: unknown }) {
    if (!isSlackWebhook(body.webhookUrl)) throw new BadRequestException("Paste a Slack incoming webhook URL (https://hooks.slack.com/services/…)")
    const url = body.webhookUrl.trim()
    await postToSlack(url, { text: ":white_check_mark: BugSnap is connected. New bugs will show up here." }).catch(() => {
      throw new BadRequestException("Slack did not accept a test message on that URL")
    })
    const channel = typeof body.channel === "string" ? body.channel.slice(0, 80) : null
    await this.save(workspaceId, "slack", { channel, events: ["created", "assigned", "resolved"] }, { webhookUrl: url }, userId)
  }

  async connectLinear(workspaceId: string, userId: string, body: { apiKey?: unknown }) {
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
    if (!/^lin_api_[A-Za-z0-9]{20,}$/.test(apiKey)) throw new BadRequestException("Paste a Linear personal API key (starts with lin_api_)")
    const who = await linearViewer(apiKey).catch(() => {
      throw new BadRequestException("Linear did not accept that key")
    })
    const teams = await linearTeams(apiKey)
    const old = await this.get(workspaceId, "linear")
    const oldSecret = old ? this.secret<{ apiKey: string; webhookId?: string }>(old) : null
    if (oldSecret?.webhookId) await linearDeleteWebhook(oldSecret.apiKey, oldSecret.webhookId)
    // Status sync: Linear calls us when an issue changes.
    const webhookSecret = crypto.randomBytes(24).toString("hex")
    const hookToken = crypto.randomBytes(12).toString("hex")
    const webhookId = await linearCreateWebhook(apiKey, `${apiUrl()}/integrations/linear/webhook/${hookToken}`, webhookSecret).catch((e) => {
      this.logger.warn(`Linear webhook not created: ${e instanceof Error ? e.message : e}`)
      return undefined
    })
    await this.save(
      workspaceId,
      "linear",
      { organization: who.organization.name, urlKey: who.organization.urlKey, teamId: teams[0]?.id ?? null, teams: teams.map((t) => ({ id: t.id, key: t.key, name: t.name })), sync: Boolean(webhookId) },
      { apiKey, webhookId, webhookSecret },
      userId,
      hookToken
    )
  }

  async connectJira(workspaceId: string, userId: string, body: { site?: unknown; email?: unknown; token?: unknown }) {
    const site = cleanJiraSite(body.site)
    const email = typeof body.email === "string" ? body.email.trim() : ""
    const token = typeof body.token === "string" ? body.token.trim() : ""
    if (!site) throw new BadRequestException("Enter your Jira site, like acme.atlassian.net")
    if (!email || !token) throw new BadRequestException("Enter the email and API token of the Jira account")
    const creds = { site, email, token }
    const me = await jiraMyself(creds).catch(() => {
      throw new BadRequestException("Jira did not accept these details")
    })
    const projects = await jiraProjects(creds)
    await this.save(workspaceId, "jira", { site, account: me.displayName, projectKey: projects[0]?.key ?? null, projects }, creds, userId)
  }

  async githubRepos(workspaceId: string) {
    const row = await this.get(workspaceId, "github")
    if (!row) throw new NotFoundException("GitHub is not connected")
    return GH.listRepos(String((row.config as Cfg).installationId))
  }

  // ---------- create issues ----------

  async createIssue(workspaceId: string, userId: string, reportId: string, provider: Provider, target?: string) {
    if (provider === "slack") throw new BadRequestException("Slack does not hold issues")
    const report = await this.prisma.bugReport.findFirst({ where: { id: reportId, workspaceId } })
    if (!report) throw new NotFoundException("Report not found")
    const row = await this.get(workspaceId, provider)
    if (!row) throw new BadRequestException(`Connect ${provider} first in Integrations`)
    const cfg = row.config as Cfg
    const title = report.title
    const body = toIssueMarkdown(report, appUrl())
    let link: { externalId: string; key: string; url: string; state: string }

    if (provider === "github") {
      const repo = target || (cfg.defaultRepo as string)
      if (!repo) throw new BadRequestException("Pick a repository")
      const issue = await GH.createIssue(String(cfg.installationId), repo, title, body, ["bug"])
      link = { externalId: `${repo}#${issue.number}`, key: `${repo}#${issue.number}`, url: issue.url, state: issue.state }
    } else if (provider === "linear") {
      const s = this.secret<{ apiKey: string }>(row)
      const teamId = target || (cfg.teamId as string)
      if (!s || !teamId) throw new BadRequestException("Pick a Linear team")
      const issue = await linearCreateIssue(s.apiKey, teamId, title, body)
      link = { externalId: issue.id, key: issue.identifier, url: issue.url, state: issue.state.name }
    } else {
      const s = this.secret<JiraCreds>(row)
      const projectKey = target || (cfg.projectKey as string)
      if (!s || !projectKey) throw new BadRequestException("Pick a Jira project")
      const issue = await jiraCreateIssue(s, projectKey, title, body.replace(/\*\*/g, "").replace(/```/g, ""))
      link = { externalId: issue.key, key: issue.key, url: issue.url, state: "To Do" }
    }

    const saved = await this.prisma.reportLink.create({ data: { reportId, provider, ...link } })
    await logActivity(this.prisma, reportId, userId, "issue_created", { provider, key: link.key, url: link.url })
    return saved
  }

  // ---------- sync: BugSnap → tools ----------

  /** When a report is resolved or reopened in BugSnap, close or reopen linked issues. */
  async onStatusChange(workspaceId: string, reportId: string, from: ReportStatus, to: ReportStatus) {
    const wasDone = DONE.includes(from)
    const isDone = DONE.includes(to)
    if (wasDone === isDone) return
    const job = (async () => {
        const links = await this.prisma.reportLink.findMany({ where: { reportId } })
        for (const l of links) {
          const row = await this.get(workspaceId, l.provider as Provider)
          if (!row) continue
          try {
            if (l.provider === "github") {
              const [repo, num] = l.externalId.split("#")
              await GH.setIssueState(String((row.config as Cfg).installationId), repo, Number(num), isDone ? "closed" : "open", to === "WONT_FIX" ? "not_planned" : "completed")
              await this.prisma.reportLink.update({ where: { id: l.id }, data: { state: isDone ? "closed" : "open" } })
            } else if (l.provider === "linear") {
              const s = this.secret<{ apiKey: string }>(row)
              if (s) {
                await linearSetStateType(s.apiKey, l.externalId, isDone ? (to === "WONT_FIX" ? "canceled" : "completed") : "unstarted")
                await this.prisma.reportLink.update({ where: { id: l.id }, data: { state: isDone ? (to === "WONT_FIX" ? "Canceled" : "Done") : "Todo" } })
              }
            } else if (l.provider === "jira") {
              const s = this.secret<JiraCreds>(row)
              if (s) {
                await jiraMoveTo(s, l.externalId, isDone ? "done" : "new")
                const st = await jiraStatus(s, l.externalId).catch(() => null)
                if (st) await this.prisma.reportLink.update({ where: { id: l.id }, data: { state: st.name } })
              }
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.error(`Sync to ${l.provider} failed: ${message}`)
            await logActivity(this.prisma, reportId, null, "sync_failed", { provider: l.provider, key: l.key, error: message.slice(0, 200) })
          }
        }
      })()
    // Wait up to 8 s so the change lands before the response; finish in the background if slower.
    const timeout = new Promise((r) => setTimeout(r, 8000))
    await Promise.race([job, timeout])
    background(job)
  }

  // ---------- sync: tools → BugSnap ----------

  /** Apply a status change that came from GitHub, Linear or Jira (no echo back). */
  async applyExternal(provider: string, externalId: string, done: boolean, label: string, state: string) {
    const link = await this.prisma.reportLink.findUnique({ where: { provider_externalId: { provider, externalId } }, include: { report: true } })
    if (!link) return { ok: true, matched: false }
    await this.prisma.reportLink.update({ where: { id: link.id }, data: { state } })
    const current = link.report.status
    const next: ReportStatus | null = done && !DONE.includes(current) ? "RESOLVED" : !done && DONE.includes(current) ? "OPEN" : null
    if (next) {
      await this.prisma.bugReport.update({ where: { id: link.reportId }, data: { status: next } })
      await logActivity(this.prisma, link.reportId, null, "synced", { provider, key: link.key, label, to: next })
    }
    return { ok: true, matched: true, status: next }
  }

  async refreshJira(workspaceId: string, reportId: string) {
    const links = await this.prisma.reportLink.findMany({ where: { reportId, provider: "jira", report: { workspaceId } } })
    const row = links.length ? await this.get(workspaceId, "jira") : null
    const s = row ? this.secret<JiraCreds>(row) : null
    if (!s) return
    for (const l of links) {
      const st = await jiraStatus(s, l.externalId).catch(() => null)
      // applyExternal only changes the bug when Jira and BugSnap disagree, so this is safe to run every time.
      if (st) await this.applyExternal("jira", l.externalId, st.category === "done", `${l.key} moved to ${st.name}`, st.name)
    }
  }

  // ---------- Slack alerts ----------

  async notifySlack(workspaceId: string, event: "created" | "assigned" | "resolved", reportId: string, extra?: string) {
    const job = (async () => {
        const row = await this.get(workspaceId, "slack")
        if (!row) return
        const events = cleanEvents((row.config as Cfg).events)
        if (!events.includes(event)) return
        const s = this.secret<{ webhookUrl: string }>(row)
        const report = await this.prisma.bugReport.findUnique({ where: { id: reportId } })
        if (!s || !report) return
        const headline = event === "created" ? ":beetle: New bug" : event === "assigned" ? ":bust_in_silhouette: Bug assigned" : ":white_check_mark: Bug resolved"
        await postToSlack(
          s.webhookUrl,
          slackMessage({ headline, bug: `BUG-${report.number ?? ""}`, title: report.title, severity: report.severity, url: `${appUrl()}/dashboard/reports/${report.id}`, page: report.url, extra })
        )
      })().catch((e) => console.error(`Slack alert failed: ${e instanceof Error ? e.message : e}`))
    // Serverless can freeze right after the response, so wait (briefly) for Slack.
    await Promise.race([job, new Promise((r) => setTimeout(r, 5000))])
    background(job)
  }

  async jiraProjects(workspaceId: string) {
    const row = await this.get(workspaceId, "jira")
    const s = row ? this.secret<JiraCreds>(row) : null
    if (!s) throw new NotFoundException("Jira is not connected")
    return jiraProjects(s)
  }
}

export const SLACK_EVENTS = ["created", "assigned", "resolved"] as const
function cleanEvents(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((e): e is string => (SLACK_EVENTS as readonly string[]).includes(e)) : [...SLACK_EVENTS]
}
