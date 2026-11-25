import { Body, Controller, Get, HttpCode, Post, Res } from "@nestjs/common"
import { RateLimit } from "../ops/rate-limit"
import type { Response } from "express"
import { Auth, type AuthContext } from "../auth/public.decorator"
import { ReportsService } from "../reports/reports.service"
import { toAgentText, toFixPrompt, toPlaywrightTest } from "../reports/formats"
import { PrismaService } from "../prisma/prisma.service"
import { AiFixService } from "../ai-fix/ai-fix.service"
import { logActivity } from "../triage/activity"
import { appUrl } from "../integrations/integrations.service"
import { ReportStatus, Severity } from "@prisma/client"

/**
 * Model Context Protocol server (Streamable HTTP, stateless JSON responses).
 * Lets coding agents like Claude Code or Cursor read BugSnap reports.
 * Auth: "Authorization: Bearer bsk_..." (an API key from Settings).
 */
const PROTOCOL = "2025-06-18"

const ID_SCHEMA = { type: "string", description: "Report id or BUG number like BUG-12" }

const TOOLS = [
  {
    name: "list_bug_reports",
    description: "List recent bug reports in this BugSnap workspace. Filter by status, severity or a search word.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: Object.values(ReportStatus) },
        severity: { type: "string", enum: Object.values(Severity) },
        query: { type: "string", description: "Words to find in the title or page URL" },
        limit: { type: "number", minimum: 1, maximum: 50 },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_bug_report",
    description:
      "Get one bug report with everything needed to fix it: steps, exact console errors with stack traces, failed requests with response bodies, the full timeline, page and browser details, and a Playwright test that reproduces it.",
    inputSchema: { type: "object", properties: { id: ID_SCHEMA }, required: ["id"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_playwright_test",
    description: "Get a Playwright test that replays the recorded steps. It fails while the bug exists and passes once fixed.",
    inputSchema: { type: "object", properties: { id: ID_SCHEMA }, required: ["id"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "update_bug_status",
    description: "Change a report's status, for example to RESOLVED after you fixed it.",
    inputSchema: {
      type: "object",
      properties: { id: ID_SCHEMA, status: { type: "string", enum: Object.values(ReportStatus) } },
      required: ["id", "status"],
    },
    annotations: { destructiveHint: false },
  },
  {
    name: "get_fix_prompt",
    description: "Everything a coding agent needs to fix the bug in one prompt: exact errors and stacks, failing requests, timeline, likely cause, and the regression test.",
    inputSchema: { type: "object", properties: { id: ID_SCHEMA }, required: ["id"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "add_comment",
    description: "Leave a comment on a bug report, for example what you found or what you changed.",
    inputSchema: { type: "object", properties: { id: ID_SCHEMA, text: { type: "string" } }, required: ["id", "text"] },
    annotations: { destructiveHint: false },
  },
  {
    name: "report_test_result",
    description:
      "After you ran the bug's Playwright test (get_playwright_test) against your fix, report the result. 'passed' moves the bug to FIX_READY and shows 'Fix verified' in BugSnap.",
    inputSchema: {
      type: "object",
      properties: { id: ID_SCHEMA, status: { type: "string", enum: ["passed", "failed"] }, details: { type: "string", description: "Test output or what changed" }, branch: { type: "string" } },
      required: ["id", "status"],
    },
    annotations: { destructiveHint: false },
  },
  {
    name: "get_verification_status",
    description: "The latest results of running this bug's regression test in CI or by an agent (passed/failed, pull request, when).",
    inputSchema: { type: "object", properties: { id: ID_SCHEMA }, required: ["id"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "open_fix_pull_request",
    description: "Ask BugSnap's own AI to write a small fix and open a draft pull request in the connected GitHub repo (needs the GitHub integration). Prefer fixing it yourself if you have the code.",
    inputSchema: { type: "object", properties: { id: ID_SCHEMA, repo: { type: "string", description: "owner/name, defaults to the workspace's default repo" } }, required: ["id"] },
    annotations: { destructiveHint: false },
  },
]

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> }

@Controller("mcp")
export class McpController {
  constructor(
    private readonly reports: ReportsService,
    private readonly prisma: PrismaService,
    private readonly fixes: AiFixService
  ) {}

  /** Accept "BUG-12", "12" or the internal id. */
  private async resolveId(auth: AuthContext, raw: unknown) {
    const v = typeof raw === "string" ? raw.trim() : ""
    const m = v.match(/^(?:BUG[-_ ]?)?(\d{1,7})$/i)
    if (m) {
      const r = await this.prisma.bugReport.findFirst({ where: { workspaceId: auth.workspaceId, number: Number(m[1]) }, select: { id: true } })
      return r?.id ?? v
    }
    return v
  }

  @Get()
  info() {
    return { name: "bugsnap", transport: "streamable-http", use: "POST JSON-RPC to this URL with Authorization: Bearer bsk_..." }
  }

  @RateLimit({ name: "mcp", by: "user", limit: 600, windowSec: 3600 })
  @Post()
  @HttpCode(200)
  async rpc(@Auth() auth: AuthContext, @Body() body: RpcRequest | RpcRequest[], @Res({ passthrough: true }) res: Response) {
    const batch = Array.isArray(body) ? body : [body]
    const replies = (await Promise.all(batch.map((req) => this.handle(auth, req)))).filter(Boolean)
    if (!replies.length) {
      res.status(202)
      return ""
    }
    return Array.isArray(body) ? replies : replies[0]
  }

  private async handle(auth: AuthContext, req: RpcRequest) {
    if (!req || req.jsonrpc !== "2.0" || typeof req.method !== "string") {
      return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } }
    }
    if (req.id === undefined) return null // notification
    const ok = (result: unknown) => ({ jsonrpc: "2.0", id: req.id, result })
    try {
      switch (req.method) {
        case "initialize":
          return ok({
            protocolVersion: (req.params?.protocolVersion as string) || PROTOCOL,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "bugsnap", version: "1.0.0" },
            instructions: "BugSnap holds bug reports recorded in real browsers. Use get_bug_report to get exact errors, the timeline and a Playwright test before changing code.",
          })
        case "ping":
          return ok({})
        case "tools/list":
          return ok({ tools: TOOLS })
        case "tools/call":
          return ok(await this.callTool(auth, String(req.params?.name ?? ""), (req.params?.arguments as Record<string, unknown>) ?? {}))
        default:
          return { jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `Unknown method ${req.method}` } }
      }
    } catch (error) {
      return ok({ isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Something went wrong" }] })
    }
  }

  private async callTool(auth: AuthContext, name: string, args: Record<string, unknown>) {
    const text = (t: string) => ({ content: [{ type: "text", text: t }] })
    const id = await this.resolveId(auth, args.id)
    const noGuests = () => ({ isError: true, content: [{ type: "text", text: "Guests cannot change reports." }] })
    switch (name) {
      case "list_bug_reports": {
        const status = Object.values(ReportStatus).includes(args.status as ReportStatus) ? (args.status as ReportStatus) : undefined
        const severity = Object.values(Severity).includes(args.severity as Severity) ? (args.severity as Severity) : undefined
        const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50)
        let rows = await this.reports.findAll(auth.workspaceId, { status, severity, limit: 200 })
        const query = typeof args.query === "string" ? args.query.toLowerCase() : ""
        if (query) rows = rows.filter((r) => `${r.title} ${r.url ?? ""}`.toLowerCase().includes(query))
        rows = rows.slice(0, limit)
        if (!rows.length) return text("No bug reports match.")
        return text(
          rows
            .map((r) => `- ${r.id}${r.number ? ` (BUG-${r.number})` : ""} | ${r.severity.toLowerCase()} | ${r.status.toLowerCase()} | ${r.title}${r.duplicateCount > 1 ? ` (seen ${r.duplicateCount} times)` : ""}${r.url ? ` | ${r.url}` : ""}`)
            .join("\n")
        )
      }
      case "get_bug_report":
        return text(toAgentText(await this.reports.findOne(auth.workspaceId, id)))
      case "get_playwright_test":
        return text(toPlaywrightTest(await this.reports.findOne(auth.workspaceId, id)))
      case "update_bug_status": {
        if (auth.role === "guest") return { isError: true, content: [{ type: "text", text: "Guests cannot change reports." }] }
        const status = args.status as ReportStatus
        if (!Object.values(ReportStatus).includes(status)) return { isError: true, content: [{ type: "text", text: "Unknown status" }] }
        await this.reports.updateStatus(auth.workspaceId, id, status, auth.userId)
        return text(`Report ${id} is now ${status.toLowerCase()}.`)
      }
      case "get_fix_prompt":
        return text(toFixPrompt(await this.reports.findOne(auth.workspaceId, id), appUrl()))
      case "add_comment": {
        const body = typeof args.text === "string" ? args.text.trim().slice(0, 8000) : ""
        if (!body) return { isError: true, content: [{ type: "text", text: "Comment text is empty" }] }
        await this.reports.findOne(auth.workspaceId, id)
        await this.prisma.comment.create({ data: { reportId: id, authorId: auth.userId, body } })
        return text("Comment added.")
      }
      case "report_test_result": {
        if (auth.role === "guest") return noGuests()
        const status = args.status === "passed" ? "passed" : "failed"
        const report = await this.reports.findOne(auth.workspaceId, id)
        const details = typeof args.details === "string" ? args.details.slice(0, 4000) : null
        await this.prisma.verification.create({ data: { reportId: id, status, details, repo: typeof args.branch === "string" ? `agent · ${args.branch.slice(0, 100)}` : "agent" } })
        await logActivity(this.prisma, id, auth.userId, "verified", { status, agent: true })
        if (status === "passed" && (report.status === "OPEN" || report.status === "IN_PROGRESS")) await this.reports.updateStatus(auth.workspaceId, id, "FIX_READY", auth.userId)
        return text(status === "passed" ? `Recorded: fix verified. BUG-${report.number} is now FIX_READY.` : `Recorded: the bug still reproduces on BUG-${report.number}.`)
      }
      case "get_verification_status": {
        const rows = await this.prisma.verification.findMany({ where: { reportId: id, report: { workspaceId: auth.workspaceId } }, orderBy: { createdAt: "desc" }, take: 5 })
        if (!rows.length) return text("No test runs recorded yet. Run get_playwright_test against your fix, then report_test_result.")
        return text(rows.map((v) => `- ${v.createdAt.toISOString()} ${v.status}${v.prNumber ? ` on PR #${v.prNumber}` : ""}${v.repo ? ` (${v.repo})` : ""}${v.prUrl ? ` ${v.prUrl}` : ""}${v.details ? `\n  ${v.details.split("\n").slice(0, 4).join("\n  ")}` : ""}`).join("\n"))
      }
      case "open_fix_pull_request": {
        if (auth.role === "guest") return noGuests()
        const r = await this.fixes.openFixPr(auth.workspaceId, auth.userId, id, typeof args.repo === "string" ? args.repo : undefined)
        return text(`Opened draft PR ${r.repo}#${r.number}: ${r.url}\nFiles: ${r.files.join(", ")}\n${r.summary ?? ""}`)
      }
      default:
        return { isError: true, content: [{ type: "text", text: `Unknown tool ${name}` }] }
    }
  }
}
