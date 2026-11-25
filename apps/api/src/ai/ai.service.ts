import { Injectable, Logger } from "@nestjs/common"
import * as fs from "fs/promises"
import * as path from "path"
import { SettingsService } from "../settings/settings.service"
import {
  isBlobUrl,
  isOwnUpload,
  buildLogDigest,
  buildPageBlock,
  mimeFor,
  resolveUploadPath,
  summarizeLogs,
  type CapturedLog,
  type PageContext,
} from "./context"

export interface BugAnalysis {
  title: string
  description: string
  severity: "low" | "medium" | "high" | "critical"
  steps: string[]
  expected?: string
  actual?: string
  suggestions: string[]
  rootCause?: string
  affectedArea?: string
}

export interface AnalysisInput {
  workspaceId: string
  /** How long to keep trying busy models (ms). Default 45s. */
  budgetMs?: number
  /** What the reporter wrote (website widget). */
  note?: string
  screenshots: string[]
  logs?: CapturedLog[]
  page?: PageContext
  durationSeconds?: number
}

export type AnalysisResult = { analysis: BugAnalysis; model?: string } | { analysis: null; error: string }

const SYSTEM_PROMPT = `You are a senior QA engineer. You get evidence from one bug recording:
screenshots in time order, a timeline of console logs, network requests, clicks and page changes, and page details.
Write one clear bug report a developer can act on.

Rules:
- Use the timeline as the main evidence. Quote exact error messages, status codes and URLs from it.
- Use the screenshots to see what the user saw (error messages, broken UI, wrong data).
- Steps must be concrete and reproducible, built from the clicks and page changes in the timeline.
- Only state a root cause the evidence supports. If you are guessing, say "Likely" and why.
- Ignore noise that has nothing to do with the bug (analytics calls, extension logs, favicon 404s).
- Entries marked "(before recording)" happened just before the user pressed Record. They may be the cause.
- If nothing looks broken, say so: severity "low", title starting with "No clear bug found".

Severity: critical = crash, data loss, security issue or blocked core flow; high = main feature broken, no easy workaround;
medium = partly broken, workaround exists; low = cosmetic or minor.

Reply with JSON only, matching this shape:
{"title": string (under 90 chars), "description": string, "severity": "critical"|"high"|"medium"|"low",
 "steps": string[], "expected": string, "actual": string, "rootCause": string, "affectedArea": string, "suggestions": string[]}`

const MAX_IMAGES = 4
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name)
  private readonly uploadDir = path.join(process.cwd(), "uploads")

  constructor(private readonly settingsService: SettingsService) {}

  /** Tried in order. Free-tier models are often "busy", so we fall through. */
  get models() {
    return (process.env.GEMINI_MODELS || "gemini-3.8-flash,gemini-3.5-flash-lite,gemini-3.5-flash,gemini-3.1-flash-lite,gemini-flash-latest")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean)
  }

  async analyze(input: AnalysisInput): Promise<AnalysisResult> {
    const pick = await this.settingsService.pickGeminiKey(input.workspaceId)
    if (pick.key === null) return { analysis: null, error: pick.reason }

    const logs = input.logs ?? []
    const images = await this.loadImages(input.screenshots ?? [], input.workspaceId)
    if (!images.length && !logs.length) return { analysis: null, error: "Nothing to analyse: no screenshots or logs." }

    const counts = summarizeLogs(logs)
    const evidence = [
      ...(input.note ? ["## What the person reporting it wrote", `"${input.note.slice(0, 1500)}"`, ""] : []),
      "## Page",
      buildPageBlock(input.page),
      input.durationSeconds ? `Recording length: ${input.durationSeconds}s` : "",
      "",
      `## Timeline (${counts.total} events: ${counts.errors} errors, ${counts.warnings} warnings, ${counts.failedRequests} failed requests, ${counts.clicks} clicks)`,
      buildLogDigest(logs),
      "",
      `## Screenshots: ${images.length} attached in time order (first one is the start, last is the end).`,
    ].join("\n")
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: evidence }, ...images] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" },
    })

    const deadline = Date.now() + (input.budgetMs ?? 45_000)
    let lastError = "AI analysis failed. The report was still saved."
    // Free-tier models are busy at random. Keep cycling through the list until
    // the deadline: a busy model is skipped, not waited on.
    const retired = new Set<string>()
    let i = 0
    while (Date.now() < deadline - 4_000) {
      const live = this.models.filter((m) => !retired.has(m))
      if (!live.length) break
      const model = live[i % live.length]
      // After each full round, wait a little longer before the next (busy spikes pass).
      if (i > 0 && i % live.length === 0) await new Promise((r) => setTimeout(r, Math.min(15_000, 1000 * 2 ** Math.floor(i / live.length))))
      i++
      for (let attempt = 0; attempt < 1; attempt++) {
        const left = deadline - Date.now()
        if (left < 4_000) return { analysis: null, error: 'The AI is busy right now. Use "Generate AI write-up" on the report to try again.' }
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": pick.key },
            body,
            // Background jobs can afford to wait for slower models.
            signal: AbortSignal.timeout(Math.min(left, (input.budgetMs ?? 45_000) > 60_000 ? 70_000 : 25_000)),
          })
          if (response.ok) {
            const data = await response.json()
            const content: string | undefined = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("")
            if (!content) {
              lastError = "The AI returned an empty answer."
              break
            }
            const analysis = normalize(JSON.parse(content.replace(/```(json)?/g, "").trim()))
            if (pick.shared) await this.settingsService.countSharedUse(input.workspaceId)
            return { analysis, model }
          }
          const text = await response.text()
          this.logger.warn(`Gemini ${model} ${response.status}: ${text.slice(0, 160)}`)
          if ((response.status === 400 || response.status === 403) && /API key|permission|PERMISSION_DENIED/i.test(text)) {
            return { analysis: null, error: "The Gemini API key was rejected. Check it in Settings." }
          }
          if (response.status === 404 || /no longer available|not found/i.test(text)) {
            retired.add(model)
            break
          }
          if (response.status === 503 || response.status === 429 || response.status >= 500) {
            lastError = 'The AI is busy right now. Use "Generate AI write-up" on the report to try again.'
            if (/quota|billing/i.test(text)) retired.add(model)
            continue
          }
          lastError = `AI request failed (${response.status}).`
          break
        } catch (error) {
          this.logger.warn(`Gemini ${model} failed: ${error instanceof Error ? error.message : error}`)
          lastError = "AI analysis failed. The report was still saved."
        }
      }
    }
    return { analysis: null, error: lastError }
  }

  /**
   * Ask Gemini for a JSON answer (text only), cycling through free models until the deadline,
   * like analyze(). Counts one shared write-up on success.
   */
  async generateJson<T>(
    workspaceId: string,
    system: string,
    prompt: string,
    budgetMs = 90_000,
    maxOutputTokens = 8192,
  ): Promise<{ json: T; model: string } | { error: string }> {
    const pick = await this.settingsService.pickGeminiKey(workspaceId)
    if (pick.key === null) return { error: pick.reason }
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens, responseMimeType: "application/json" },
    })
    const deadline = Date.now() + budgetMs
    const retired = new Set<string>()
    let lastError = "The AI is busy right now. Try again in a minute."
    let i = 0
    while (Date.now() < deadline - 5_000) {
      const live = this.models.filter((m) => !retired.has(m))
      if (!live.length) break
      const model = live[i % live.length]
      if (i > 0 && i % live.length === 0) await new Promise((r) => setTimeout(r, Math.min(10_000, 1000 * 2 ** Math.floor(i / live.length))))
      i++
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": pick.key },
          body,
          signal: AbortSignal.timeout(Math.max(5_000, Math.min(deadline - Date.now(), 80_000))),
        })
        if (response.ok) {
          const data = await response.json()
          const content: string | undefined = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("")
          if (!content) {
            lastError = "The AI returned an empty answer."
            continue
          }
          const json = JSON.parse(content.replace(/```(json)?/g, "").trim()) as T
          if (pick.shared) await this.settingsService.countSharedUse(workspaceId)
          return { json, model }
        }
        const text = await response.text()
        if ((response.status === 400 || response.status === 403) && /API key|permission|PERMISSION_DENIED/i.test(text))
          return { error: "The Gemini API key was rejected. Check it in Settings." }
        if (response.status === 404 || /no longer available|not found/i.test(text)) retired.add(model)
        else if (/quota|billing/i.test(text)) retired.add(model)
      } catch {
        // timeout or bad JSON: try the next model
      }
    }
    return { error: lastError }
  }

  /** Only reads our own uploaded screenshots (local disk or this workspace's Blob folder). */
  private async loadImages(urls: string[], workspaceId: string) {
    const picked = urls.length > MAX_IMAGES ? [urls[0], ...urls.slice(-(MAX_IMAGES - 1))] : urls
    const parts: { inline_data: { mime_type: string; data: string } }[] = []
    for (const url of picked) {
      try {
        let buffer: Buffer | null = null
        let mime = "image/jpeg"
        if (isBlobUrl(url) && isOwnUpload(url, "thumbnails", workspaceId)) {
          const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
          if (!res.ok) continue
          buffer = Buffer.from(await res.arrayBuffer())
          mime = res.headers.get("content-type")?.split(";")[0] || mimeFor(url)
        } else {
          const file = resolveUploadPath(url, this.uploadDir)
          if (!file) {
            this.logger.warn(`Skipped screenshot that is not an uploaded file: ${url.slice(0, 120)}`)
            continue
          }
          buffer = await fs.readFile(file)
          mime = mimeFor(file)
        }
        if (!buffer || buffer.length > MAX_IMAGE_BYTES) continue
        parts.push({ inline_data: { mime_type: mime, data: buffer.toString("base64") } })
      } catch {
        // missing or unreadable
      }
    }
    return parts
  }
}

const SEVERITIES = ["low", "medium", "high", "critical"] as const

function normalize(raw: Record<string, unknown>): BugAnalysis {
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 15) : [])
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined)
  const severity = String(raw.severity ?? "medium").toLowerCase()
  return {
    title: (text(raw.title) ?? "Bug report").slice(0, 120),
    description: text(raw.description) ?? "",
    severity: (SEVERITIES as readonly string[]).includes(severity) ? (severity as BugAnalysis["severity"]) : "medium",
    steps: list(raw.steps),
    expected: text(raw.expected),
    actual: text(raw.actual),
    suggestions: list(raw.suggestions),
    rootCause: text(raw.rootCause),
    affectedArea: text(raw.affectedArea),
  }
}
