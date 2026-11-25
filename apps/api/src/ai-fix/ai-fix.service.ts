import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common"
import * as crypto from "crypto"
import { PrismaService } from "../prisma/prisma.service"
import { AIService } from "../ai/ai.service"
import { IntegrationsService, appUrl } from "../integrations/integrations.service"
import { logActivity } from "../triage/activity"
import { toFixPrompt } from "../reports/formats"
import * as GH from "../integrations/github"
import { applyEdits, bugHints, pickFiles, type Edit } from "./pick-files"

const SYSTEM = `You are a careful senior engineer fixing one bug in a real codebase.
You get the bug (recorded in a browser: steps, exact errors, failing requests) and some files from the repo.
Make the smallest safe change that fixes the root cause. Do not refactor, rename or reformat. Do not touch unrelated code.
Answer ONLY with JSON:
{"summary": "one or two sentences: what you changed", "rootCause": "one or two sentences", "confidence": "high" | "medium" | "low",
 "edits": [{"path": "exact file path as given", "find": "exact text copied from that file, long enough to be unique (2+ whole lines)", "replace": "the new text"}]}
Rules: "find" must be copied character for character from the file, including spaces and indentation, and appear exactly once.
Only edit files you were shown. If you cannot find the cause in these files, return "edits": [] and say why in "summary".`

type FixAnswer = { summary?: string; rootCause?: string; confidence?: string; edits?: Edit[] }

@Injectable()
export class AiFixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIService,
    private readonly integrations: IntegrationsService,
  ) {}

  async openFixPr(workspaceId: string, userId: string, reportId: string, repoArg?: string) {
    const report = await this.prisma.bugReport.findFirst({ where: { id: reportId, workspaceId } })
    if (!report) throw new NotFoundException("Report not found")
    const gh = await this.integrations.get(workspaceId, "github")
    if (!gh) throw new BadRequestException("Connect GitHub first (Integrations page)")
    const installationId = String((gh.config as Record<string, unknown>).installationId)
    const repo = repoArg || ((gh.config as Record<string, unknown>).defaultRepo as string | undefined)
    if (!repo) throw new BadRequestException("Pick a default repository on the Integrations page")

    const perms = await GH.installationPermissions(installationId)
    if (perms.contents !== "write" || perms.pull_requests !== "write") {
      throw new ConflictException(
        "BugSnap's GitHub app needs permission to open pull requests. Accept the new permissions on GitHub (Settings > Applications > BugSnap Bug Reports), then try again.",
      )
    }

    const { defaultBranch } = await GH.repoInfo(installationId, repo)
    const { headSha, files } = await GH.listFiles(installationId, repo, defaultBranch)
    const info = (report.browserInfo ?? {}) as { logs?: { message?: string; data?: Record<string, unknown> }[]; page?: { url?: string } }
    const texts = [
      report.url ?? "",
      info.page?.url ?? "",
      ...(info.logs ?? []).flatMap((l) => [l.message ?? "", String(l.data?.stack ?? ""), String(l.data?.url ?? "")]),
    ]
    const chosen = pickFiles(files, bugHints(texts))
    if (!chosen.length) throw new BadRequestException(`Could not find source files in ${repo} to look at`)
    const contents: Record<string, string> = {}
    const shas: Record<string, string> = {}
    for (const f of chosen) {
      const r = await GH.readFile(installationId, repo, f.path, defaultBranch)
      contents[f.path] = r.text
      shas[f.path] = r.sha
    }

    const prompt = [
      toFixPrompt(report, appUrl()),
      "",
      "## Files from the repository",
      ...Object.entries(contents).map(([p, t]) => `### ${p}\n\`\`\`\n${t}\n\`\`\``),
    ].join("\n")
    let answer: FixAnswer | null = null
    let applied: ReturnType<typeof applyEdits> | null = null
    let feedback = ""
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.ai.generateJson<FixAnswer>(workspaceId, SYSTEM, prompt + feedback, 100_000)
      if ("error" in res) throw new ConflictException(res.error)
      answer = res.json
      if (!answer.edits?.length) throw new ConflictException(`The AI could not find a safe fix: ${answer.summary ?? "no explanation"}`)
      applied = applyEdits(contents, answer.edits)
      if (applied.ok) break
      feedback = `\n\n## Your previous answer could not be applied\n${applied.error}. Copy "find" text exactly from the files above.`
    }
    if (!answer || !applied?.ok)
      throw new ConflictException(`The AI's change did not apply cleanly${applied && !applied.ok ? `: ${applied.error}` : ""}. Try again or fix it by hand.`)

    const branch = `bugsnap/fix-bug-${report.number ?? "x"}-${crypto.randomBytes(2).toString("hex")}`
    await GH.createBranch(installationId, repo, branch, headSha)
    const message = `Fix BUG-${report.number}: ${report.title}`.slice(0, 120)
    for (const [path, text] of Object.entries(applied.changed)) await GH.writeFile(installationId, repo, branch, path, text, shas[path], message)

    const body = [
      `Fixes BUG-${report.number}`,
      "",
      `**What changed:** ${answer.summary ?? ""}`,
      `**Root cause:** ${answer.rootCause ?? "see the bug report"}`,
      `**AI confidence:** ${answer.confidence ?? "unknown"}`,
      "",
      `Files: ${Object.keys(applied.changed)
        .map((p) => `\`${p}\``)
        .join(", ")}`,
      "",
      `[BUG-${report.number} in BugSnap](${appUrl()}/dashboard/reports/${report.id}): video, steps, console and network.`,
      "",
      "---",
      "Written by BugSnap AI as a draft. Please review it before merging. If the BugSnap verify workflow is set up, it replays the bug on this pull request and reports whether it is really fixed.",
    ].join("\n")
    const pr = await GH.openPullRequest(installationId, repo, branch, defaultBranch, `Fix BUG-${report.number}: ${report.title}`.slice(0, 200), body)
    const key = `${repo}#${pr.number}`
    await this.prisma.reportLink.upsert({
      where: { provider_externalId: { provider: "github", externalId: key } },
      create: { reportId, provider: "github", externalId: key, key, url: pr.url, state: "draft PR" },
      update: { url: pr.url, state: "draft PR" },
    })
    if (report.status === "OPEN") await this.prisma.bugReport.update({ where: { id: reportId }, data: { status: "IN_PROGRESS" } })
    await logActivity(this.prisma, reportId, userId, "ai_fix", { key, url: pr.url, files: Object.keys(applied.changed), confidence: answer.confidence })
    return { url: pr.url, number: pr.number, repo, branch, files: Object.keys(applied.changed), summary: answer.summary, confidence: answer.confidence }
  }
}
