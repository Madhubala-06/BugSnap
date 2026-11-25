import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common"
import type { Request, Response } from "express"
import * as fs from "fs"
import * as path from "path"
import { PrismaService } from "../prisma/prisma.service"
import { ReportsService, sanitizeLogs } from "../reports/reports.service"
import { StorageService } from "../storage/storage.service"
import { Auth, MinRole, Public, type AuthContext } from "../auth/public.decorator"
import { normalizeEmail, randomToken, sha256 } from "../auth/crypto"
import { hostOf } from "../triage/activity"

const MAX_PER_HOUR_PER_VISITOR = 10
const MAX_PER_HOUR_PER_PROJECT = 200

export interface WidgetConfig {
  label: string
  position: "bottom-right" | "bottom-left"
  color: string
}
const DEFAULT_CONFIG: WidgetConfig = { label: "Report a bug", position: "bottom-right", color: "#2563EB" }

function cleanConfig(input: unknown, base: WidgetConfig = DEFAULT_CONFIG): WidgetConfig {
  const c = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  return {
    label: typeof c.label === "string" && c.label.trim() ? c.label.trim().slice(0, 30) : base.label,
    position: c.position === "bottom-left" ? "bottom-left" : c.position === "bottom-right" ? "bottom-right" : base.position,
    color: typeof c.color === "string" && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : base.color,
  }
}

/** The host of the page that is calling us (Origin header, then Referer). */
function callerHost(req: Request): string | null {
  const origin = req.headers.origin || req.headers.referer
  return typeof origin === "string" ? hostOf(origin) : null
}

let widgetSource: string | null = null
function loadWidget() {
  if (widgetSource === null) {
    const candidates = [path.join(process.cwd(), "assets", "widget.js"), path.join(__dirname, "..", "..", "assets", "widget.js")]
    const file = candidates.find((f) => fs.existsSync(f))
    widgetSource = file ? fs.readFileSync(file, "utf8") : "console.warn('BugSnap widget is not available')"
  }
  return widgetSource
}

@Controller()
export class WidgetController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly storage: StorageService,
  ) {}

  // ---------- for the dashboard ----------

  /** Turn the widget on/off for a project and set its look. Creates the public key on first use. */
  @Post("projects/:id/widget")
  @MinRole("admin")
  async configure(@Auth() auth: AuthContext, @Param("id") id: string, @Body() body: { enabled?: boolean; config?: unknown; rotateKey?: boolean }) {
    const project = await this.prisma.project.findFirst({ where: { id, workspaceId: auth.workspaceId } })
    if (!project) throw new NotFoundException("Project not found")
    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        widgetKey: !project.widgetKey || body?.rotateKey ? `pk_${randomToken().slice(0, 24)}` : undefined,
        widgetEnabled: typeof body?.enabled === "boolean" ? body.enabled : project.widgetEnabled,
        widgetConfig: cleanConfig(body?.config, cleanConfig(project.widgetConfig)) as object,
      },
    })
    return {
      id: updated.id,
      widgetKey: updated.widgetKey,
      widgetEnabled: updated.widgetEnabled,
      widgetConfig: cleanConfig(updated.widgetConfig),
      hosts: updated.hosts,
    }
  }

  // ---------- public, used by the script on customer websites ----------

  @Public()
  @Get("widget.js")
  @Header("Content-Type", "application/javascript; charset=utf-8")
  @Header("Cache-Control", "public, max-age=300")
  @Header("Access-Control-Allow-Origin", "*")
  script() {
    return loadWidget()
  }

  @Public()
  @Get("widget/config")
  async config(@Query("key") key: string, @Req() req: Request) {
    const project = await this.projectForKey(key)
    const host = callerHost(req)
    return {
      enabled: project.widgetEnabled,
      allowed: Boolean(host && project.hosts.includes(host)),
      ...cleanConfig(project.widgetConfig),
    }
  }

  @Public()
  @Post("widget/reports")
  @HttpCode(201)
  async report(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: Record<string, unknown>) {
    res.setHeader("Cache-Control", "no-store")
    const project = await this.projectForKey(String(body?.key ?? ""))
    if (!project.widgetEnabled) throw new ForbiddenException("The bug widget is turned off for this site.")

    // Only from the project's own websites.
    const host = callerHost(req)
    if (!host || !project.hosts.includes(host)) {
      throw new ForbiddenException(`This site (${host ?? "unknown"}) is not on the project's list of website addresses.`)
    }

    // Rate limits: per visitor (IP + browser) and per project.
    const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "")
      .split(",")[0]
      .trim()
    const visitor = sha256(`${ip}|${req.headers["user-agent"] ?? ""}|${project.id}`).slice(0, 24)
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const [mine, total] = await Promise.all([
      this.prisma.activity.count({
        where: { kind: "created", createdAt: { gt: hourAgo }, report: { projectId: project.id }, data: { path: ["visitor"], equals: visitor } },
      }),
      this.prisma.bugReport.count({ where: { projectId: project.id, createdAt: { gt: hourAgo } } }),
    ])
    if (mine >= MAX_PER_HOUR_PER_VISITOR || total >= MAX_PER_HOUR_PER_PROJECT) {
      throw new HttpException("Too many reports. Please try again later.", HttpStatus.TOO_MANY_REQUESTS)
    }

    const description = typeof body.description === "string" ? body.description.trim().slice(0, 4000) : ""
    if (description.length < 3) throw new BadRequestException("Tell us what went wrong")
    const email = normalizeEmail(body.email) ?? undefined
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : undefined

    // Optional screenshot of the tab, sent as a data URL.
    const screenshotUrls: string[] = []
    if (typeof body.screenshot === "string" && body.screenshot.startsWith("data:image/")) {
      try {
        screenshotUrls.push((await this.storage.saveDataUrl(project.workspaceId, body.screenshot)).url)
      } catch {
        // a bad screenshot should not lose the report
      }
    }

    const page = body.page && typeof body.page === "object" ? (body.page as Record<string, unknown>) : {}
    const logs = sanitizeLogs(body.logs).slice(-300)
    const report = await this.reports.createQuick(
      { workspaceId: project.workspaceId, userId: null, projectId: project.id, source: "widget", reporter: { email, name } },
      {
        title: undefined,
        description: `<p>${escapeHtml(description).replace(/\n/g, "<br>")}</p>`,
        screenshotUrls,
        logs,
        page: {
          url: typeof page.url === "string" ? page.url.slice(0, 2000) : undefined,
          title: typeof page.title === "string" ? page.title.slice(0, 300) : undefined,
          userAgent: String(req.headers["user-agent"] ?? "").slice(0, 400),
          language: typeof page.language === "string" ? page.language.slice(0, 20) : undefined,
          viewport: isSize(page.viewport) ? page.viewport : undefined,
          screen: isSize(page.screen) ? { ...page.screen, pixelRatio: Number((page.screen as { pixelRatio?: number }).pixelRatio) || 1 } : undefined,
        },
        analyze: true,
        userNote: description,
      },
    )
    // Remember who sent it (hashed) for the rate limit.
    await this.prisma.activity.updateMany({
      where: { reportId: report.id, kind: "created" },
      data: { data: { source: "widget", visitor, ...(email ? { email } : {}) } },
    })
    return { ok: true, id: report.id, number: report.number }
  }

  private async projectForKey(key: string) {
    if (!key || !/^pk_[A-Za-z0-9_-]{10,40}$/.test(key)) throw new NotFoundException("Unknown widget key")
    const project = await this.prisma.project.findUnique({ where: { widgetKey: key } })
    if (!project) throw new NotFoundException("Unknown widget key")
    return project
  }
}

function isSize(v: unknown): v is { width: number; height: number } {
  const o = v as { width?: unknown; height?: unknown }
  return Boolean(o && typeof o.width === "number" && typeof o.height === "number" && o.width > 0 && o.width < 20000 && o.height < 20000)
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
}
