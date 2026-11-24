import { Body, Controller, Get, HttpCode, Post, Res } from "@nestjs/common"
import type { Response } from "express"
import { Auth, type AuthContext } from "../auth/public.decorator"
import { ReportsService } from "../reports/reports.service"
import { toAgentText, toPlaywrightTest } from "../reports/formats"
import { ReportStatus, Severity } from "@prisma/client"

/**
 * Model Context Protocol server (Streamable HTTP, stateless JSON responses).
 * Lets coding agents like Claude Code or Cursor read BugSnap reports.
 * Auth: "Authorization: Bearer bsk_..." (an API key from Settings).
 */
const PROTOCOL = "2025-06-18"

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
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_playwright_test",
    description: "Get a Playwright test that replays the recorded steps. It fails while the bug exists and passes once fixed.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "update_bug_status",
    description: "Change a report's status, for example to RESOLVED after you fixed it.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, status: { type: "string", enum: Object.values(ReportStatus) } },
      required: ["id", "status"],
    },
    annotations: { destructiveHint: false },
  },
]

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> }

@Controller("mcp")
export class McpController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  info() {
    return { name: "bugsnap", transport: "streamable-http", use: "POST JSON-RPC to this URL with Authorization: Bearer bsk_..." }
  }

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
    const id = typeof args.id === "string" ? args.id : ""
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
        await this.reports.updateStatus(auth.workspaceId, id, status)
        return text(`Report ${id} is now ${status.toLowerCase()}.`)
      }
      default:
        return { isError: true, content: [{ type: "text", text: `Unknown tool ${name}` }] }
    }
  }
}
