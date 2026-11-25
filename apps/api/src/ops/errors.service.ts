import { Injectable } from "@nestjs/common"
import * as crypto from "crypto"
import { PrismaService } from "../prisma/prisma.service"
import { Mailer } from "../auth/mailer"
import { postToSlack } from "../integrations/slack"

export interface ErrorInput {
  source: "api" | "web" | "extension"
  message: string
  stack?: string | null
  path?: string | null
  method?: string | null
  status?: number | null
  userId?: string | null
  workspaceId?: string | null
  userAgent?: string | null
}

export const opsEmails = () =>
  (process.env.OPS_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

/** Same error again (different ids, numbers or tokens in the text) gets the same fingerprint. */
export function fingerprint(e: Pick<ErrorInput, "source" | "message" | "path">) {
  const msg = e.message.split("\n")[0].replace(/[0-9a-f]{8,}/gi, "#").replace(/\d+/g, "#").slice(0, 200)
  const path = (e.path ?? "").split("?")[0].replace(/\/[a-z0-9]{20,}/gi, "/:id").replace(/\/\d+/g, "/:n")
  return crypto.createHash("sha1").update(`${e.source}|${msg}|${path}`).digest("hex").slice(0, 16)
}

@Injectable()
export class ErrorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer
  ) {}

  async record(e: ErrorInput) {
    const fp = fingerprint(e)
    const clip = (v: string | null | undefined, n: number) => (v ? String(v).slice(0, n) : null)
    try {
      const seenRecently = await this.prisma.errorEvent.count({ where: { fingerprint: fp, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } } })
      await this.prisma.errorEvent.create({
        data: {
          source: e.source,
          fingerprint: fp,
          message: clip(e.message, 1000) ?? "Unknown error",
          stack: clip(e.stack, 6000),
          path: clip(e.path, 500),
          method: clip(e.method, 10),
          status: e.status ?? null,
          userId: e.userId ?? null,
          workspaceId: e.workspaceId ?? null,
          userAgent: clip(e.userAgent, 300),
        },
      })
      // Tell the team once per new kind of error per hour, not on every repeat.
      if (!seenRecently) await this.alert(e)
    } catch {
      // never let error tracking break the request
    }
  }

  private async alert(e: ErrorInput) {
    const where = `${e.source}${e.method ? ` ${e.method}` : ""}${e.path ? ` ${e.path.split("?")[0]}` : ""}`
    const line = e.message.split("\n")[0].slice(0, 200)
    const app = (process.env.FRONTEND_URL || "").split(",")[0]
    const text = `New error in BugSnap (${where}):\n\n${line}\n\n${(e.stack ?? "").split("\n").slice(0, 8).join("\n")}\n\nAll errors: ${app}/dashboard/ops`
    for (const to of opsEmails()) await this.mailer.sendEmail(to, `BugSnap error: ${line.slice(0, 80)}`, text, `<pre style="font:13px ui-monospace,monospace;white-space:pre-wrap">${escape(text)}</pre>`)
    if (process.env.OPS_SLACK_WEBHOOK) await postToSlack(process.env.OPS_SLACK_WEBHOOK, { text: `:rotating_light: *New error* in \`${where}\`\n${line}` }).catch(() => undefined)
  }

  /** Grouped view for the ops page: one row per kind of error. */
  async summary(days = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const groups = await this.prisma.errorEvent.groupBy({ by: ["fingerprint"], where: { createdAt: { gt: since } }, _count: { _all: true }, _max: { createdAt: true } })
    groups.sort((a, b) => (b._max.createdAt?.getTime() ?? 0) - (a._max.createdAt?.getTime() ?? 0))
    const rows = []
    for (const g of groups.slice(0, 100)) {
      const latest = await this.prisma.errorEvent.findFirst({ where: { fingerprint: g.fingerprint }, orderBy: { createdAt: "desc" } })
      if (latest) rows.push({ fingerprint: g.fingerprint, count: g._count._all, lastSeen: g._max.createdAt, source: latest.source, message: latest.message, path: latest.path, method: latest.method, status: latest.status, stack: latest.stack, userAgent: latest.userAgent })
    }
    const total = groups.reduce((n, g) => n + g._count._all, 0)
    return { days, total, groups: rows }
  }
}

function escape(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)
}
