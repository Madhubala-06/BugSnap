"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Bot,
  ChevronDown,
  Copy,
  FlaskConical,
  Github,
  Globe,
  Image as ImageIcon,
  Layers,
  Link2,
  Loader2,
  MoreHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react"
import {
  analyzeReport,
  createExternalIssue,
  getIntegrations,
  refreshExternalIssues,
  type IntegrationsState,
  type Provider,
  deleteBugReport,
  getAiStatus,
  getBugReport,
  getReportText,
  saveGithubRepo,
  setReportShared,
  updateBugReport,
  uploadImage,
  type BugReport,
} from "@/lib/api"
import { reportToMarkdown, downloadText } from "@/lib/export"
import { useCrumbs } from "@/components/shell/workspace-data"
import { useMe } from "@/components/auth-gate"
import { API_URL, authFetch, can } from "@/lib/auth"
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, MenuHint } from "@/components/kit/menu"
import { Dialog, DialogContent } from "@/components/kit/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger, Count } from "@/components/kit/tabs"
import { ago, bugId, SeverityPill, timeAgo, Avatar } from "@/components/kit/bits"
import { Tip } from "@/components/kit/tooltip"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { RichTextEditor } from "@/components/editor/rich-text-editor"
import { ImageEditor } from "@/components/editor/image-editor"
import { InlineCode } from "@/components/report/inline-code"
import { PlaywrightCard } from "@/components/report/playwright-card"
import { githubIssueUrl } from "@/components/report/report-actions"
import { EventList, PlayerProvider, SyncedPlayer, timeEvents } from "@/components/report/synced-player"
import { ReportDetails } from "@/components/report/report-details"
import { ActivityFeed } from "@/components/report/activity-feed"
import { GithubMark, JiraMark, LinearMark } from "@/components/brand/logos"
import Link from "next/link"

const strip = (html?: string | null) => (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

function shortBrowser(ua?: string) {
  if (!ua) return ""
  const chrome = ua.match(/Chrome\/(\d+)/)
  const os = /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : /iPhone|iPad/.test(ua) ? "iOS" : ""
  return [chrome ? `Chrome ${chrome[1]}` : "", os].filter(Boolean).join(" · ")
}

export default function ReportPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [report, setReport] = useState<BugReport | null>(null)
  const [missing, setMissing] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [descDirty, setDescDirty] = useState(false)
  const [editingShot, setEditingShot] = useState<{ url: string; index: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [repoDialog, setRepoDialog] = useState(false)
  const [repo, setRepo] = useState<string | null>(null)
  const [repoInput, setRepoInput] = useState("")
  const [activityKey, setActivityKey] = useState(0)
  const [tools, setTools] = useState<IntegrationsState | null>(null)
  const [creating, setCreating] = useState<Provider | null>(null)
  const [fixing, setFixing] = useState(false)
  const autoRetried = useRef(false)
  const me = useMe()
  const canEdit = can(me, "member")

  const merge = useCallback((patch: Partial<BugReport>) => {
    setReport((r) => (r ? { ...r, ...patch } : r))
    setActivityKey((k) => k + 1)
  }, [])

  const load = useCallback(async () => {
    try {
      const data = await getBugReport(id)
      setReport(data)
      setTitle(data.title)
      setDescription(data.description || "")
      setDescDirty(false)
    } catch {
      setMissing(true)
    }
  }, [id])

  useEffect(() => {
    load()
    getAiStatus().then((s) => setRepo(s.githubRepo)).catch(() => undefined)
    getIntegrations().then(setTools).catch(() => undefined)
  }, [load])

  // Jira has no webhooks for API tokens: refresh linked ticket status when the page opens.
  const hasJira = report?.links?.some((l) => l.provider === "jira")
  useEffect(() => {
    if (!hasJira || !report) return
    refreshExternalIssues(report.id)
      .then((links) => setReport((r) => (r ? { ...r, links } : r)))
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasJira, report?.id])

  useCrumbs(
    report
      ? [
          ...(report.project ? [{ label: report.project.name, href: `/dashboard/reports?project=${report.project.id}` }] : [{ label: "All reports", href: "/dashboard/reports?view=all" }]),
          { label: bugId(report.number), mono: true },
        ]
      : []
  )

  // AI write-up in the background: poll while pending, retry once if it failed earlier.
  const pending = report?.aiStatus === "pending"
  useEffect(() => {
    if (!pending) return
    let stop = false
    const started = Date.now()
    const poll = async () => {
      if (stop) return
      const fresh = await getBugReport(id).catch(() => null)
      if (fresh && fresh.aiStatus !== "pending") {
        setReport(fresh)
        setTitle(fresh.title)
        if (!descDirty) setDescription(fresh.description || "")
        setActivityKey((k) => k + 1)
        if (fresh.aiStatus === "done") toast.success("AI write-up is ready")
        return
      }
      if (Date.now() - started < 6 * 60 * 1000) setTimeout(poll, 4000)
    }
    const t = setTimeout(poll, 4000)
    return () => {
      stop = true
      clearTimeout(t)
    }
  }, [pending, id, descDirty])

  // The extension opens this page right after you stop; the video arrives a few seconds later.
  const mediaPending = Boolean(report?.browserInfo?.mediaPending) && Date.now() - (report?.browserInfo?.mediaPendingSince ?? 0) < 10 * 60 * 1000
  useEffect(() => {
    if (!mediaPending) return
    let stop = false
    const poll = async () => {
      if (stop) return
      const fresh = await getBugReport(id).catch(() => null)
      if (fresh && !fresh.browserInfo?.mediaPending) {
        setReport(fresh)
        setActivityKey((k) => k + 1)
        if (fresh.browserInfo?.mediaError) toast.error("The video could not be uploaded. The steps and logs are saved.")
        return
      }
      setTimeout(poll, 2500)
    }
    const t = setTimeout(poll, 2500)
    return () => {
      stop = true
      clearTimeout(t)
    }
  }, [mediaPending, id])

  useEffect(() => {
    if (!report || autoRetried.current || report.aiStatus !== "failed" || !canEdit) return
    autoRetried.current = true
    analyzeReport(report.id).then((r) => r.ok && merge({ aiStatus: "pending" })).catch(() => undefined)
  }, [report, merge])

  const info = report?.browserInfo ?? {}
  const logs = useMemo(() => (report?.session?.logs?.length ? report.session.logs : info.logs ?? []), [report, info.logs])
  const events = useMemo(() => timeEvents(logs, info.startedAt), [logs, info.startedAt])
  const keyMoments = events.filter((e) => e.kind === "error" || e.kind === "click" || e.kind === "input" || (e.kind === "nav" && e.t > 0.5))
  const consoleEvents = events.filter((e) => e.log.type === "CONSOLE" || e.log.type === "ERROR")
  const networkLogs = logs.filter((l) => l.type === "NETWORK")
  const errorCount = logs.filter((l) => l.level.toUpperCase() === "ERROR").length
  const shots = info.screenshotUrls ?? []
  const page = info.page

  if (missing) {
    return (
      <div className="p-10 text-center">
        <p className="text-foreground">This report does not exist or you do not have access.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/dashboard/reports")}>Back to reports</Button>
      </div>
    )
  }
  if (!report) {
    return (
      <div className="grid grid-cols-[1fr_320px] gap-0" aria-busy="true">
        <div className="space-y-4 p-6">
          <div className="h-6 w-40 animate-pulse rounded bg-background-secondary" />
          <div className="h-8 w-3/4 animate-pulse rounded bg-background-secondary" />
          <div className="aspect-video animate-pulse rounded-xl bg-background-secondary" />
        </div>
        <div className="border-l border-border bg-background-secondary/40" />
      </div>
    )
  }

  const saveTitle = async () => {
    const next = title.trim()
    if (!next || next === report.title) return setTitle(report.title)
    try {
      await updateBugReport(report.id, { title: next })
      merge({ title: next })
    } catch {
      toast.error("Could not rename")
      setTitle(report.title)
    }
  }

  const saveDescription = async () => {
    if (!descDirty) return
    try {
      await updateBugReport(report.id, { description })
      setDescDirty(false)
      toast.success("Description saved")
    } catch {
      toast.error("Could not save the description")
    }
  }

  const copy = async (text: string, message: string) => {
    await navigator.clipboard.writeText(text)
    toast.success(message)
  }

  const openFixPr = async () => {
    if (!report) return
    setFixing(true)
    const t = toast.loading("The AI is reading the code and writing a fix. This takes up to a minute…")
    try {
      const res = await authFetch(`${API_URL}/reports/${report.id}/ai-fix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.message === "string" ? data.message : "Could not open a fix pull request")
      toast.success(
        <span>
          Draft PR opened: <a className="underline" href={data.url} target="_blank" rel="noreferrer">{data.repo}#{data.number}</a>
          {data.files?.length ? ` (${data.files.join(", ")})` : ""}
        </span>,
        { id: t, duration: 10000 }
      )
      load()
      setActivityKey((k) => k + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open a fix pull request", { id: t, duration: 10000 })
    } finally {
      setFixing(false)
    }
  }

  const fixWithAi = async () => {
    const t = toast.loading("Preparing the prompt…")
    try {
      await navigator.clipboard.writeText(await getReportText(report.id, "fix-prompt"))
      toast.success("Fix prompt copied. Paste it into Cursor, Claude Code or Copilot.", { id: t })
    } catch {
      toast.error("Could not prepare the prompt", { id: t })
    }
  }

  const share = async () => {
    try {
      const token = report.shareToken ?? (await setReportShared(report.id, true)).shareToken
      merge({ shareToken: token })
      await copy(`${window.location.origin}/r/${token}`, "Share link copied. Anyone with it can view this report.")
    } catch {
      toast.error("Could not create a share link")
    }
  }

  const openGithub = (target: string) => window.open(githubIssueUrl(target, report, window.location.origin), "_blank", "noopener,noreferrer")

  const generate = async () => {
    try {
      const res = await analyzeReport(report.id)
      if (!res.ok) throw new Error(res.error)
      merge({ aiStatus: "pending" })
      toast("The AI is writing the report. It usually takes under a minute.")
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Could not start the AI write-up")
    }
  }

  const descriptionText = strip(description)

  return (
    <PlayerProvider events={events}>
      <div className="grid min-h-full grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 px-6 pb-16 pt-5">
          {/* Header */}
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-foreground-muted">{bugId(report.number)}</span>
                <SeverityPill severity={report.severity} />
                {report.aiStatus === "done" && (
                  <span className="inline-flex items-center gap-1 text-primary"><Sparkles className="h-3.5 w-3.5" />AI write-up</span>
                )}
                {pending && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary" role="status">
                    <Loader2 className="h-3 w-3 animate-spin" />AI is writing the report…
                  </span>
                )}
                {(report.duplicateCount ?? 1) > 1 && (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><Layers className="h-3.5 w-3.5" />Seen {report.duplicateCount} times</span>
                )}
              </div>
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
                onBlur={saveTitle}
                readOnly={!canEdit}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
                rows={1}
                ref={(el) => {
                  if (el) {
                    el.style.height = "auto"
                    el.style.height = `${el.scrollHeight}px`
                  }
                }}
                aria-label="Bug title"
                className="block w-full resize-none overflow-hidden rounded-md bg-transparent text-[22px] font-semibold leading-tight tracking-tight text-foreground outline-none hover:bg-background-secondary/60 focus:bg-background-secondary/60"
              />
              {report.verifications?.[0] && (() => {
                const v = report.verifications[0]
                const ok = v.status === "passed"
                return (
                  <a
                    href={v.runUrl || v.prUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    title={v.details || undefined}
                    className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] ${ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}
                  >
                    {ok ? "✓ Fix verified" : v.status === "failed" ? "✗ Still reproduces" : "⚠ Test could not run"}
                    {v.prNumber ? <span className="text-foreground-muted">on PR #{v.prNumber}{v.repo ? ` · ${v.repo}` : ""}</span> : null}
                    <span className="text-foreground-muted">· {new Date(v.createdAt).toLocaleDateString()}</span>
                  </a>
                )
              })()}
              {report.links && report.links.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {report.links.map((l) => {
                    const Logo = l.provider === "github" ? GithubMark : l.provider === "linear" ? LinearMark : JiraMark
                    const closed = /^(closed|done|completed|canceled|cancelled)$/i.test(l.state ?? "")
                    return (
                      <a
                        key={l.id}
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-[12px] text-foreground-secondary hover:border-border-hover hover:text-foreground"
                      >
                        <Logo className="h-3.5 w-3.5" />
                        <span className="font-mono">{l.key}</span>
                        {l.state && <span className={closed ? "text-violet-400" : "text-emerald-500"}>· {l.state}</span>}
                      </a>
                    )
                  })}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-foreground-muted">
                {!report.reporter && info.source === "widget" && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="rounded bg-sky-500/10 px-1.5 text-[11px] text-sky-600 dark:text-sky-400">website</span>
                    {info.reporter?.email ?? "A visitor"} reported {ago(report.createdAt)}
                  </span>
                )}
                {report.reporter && (
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar name={report.reporter.name} email={report.reporter.email} size={16} />
                    {report.reporter.name} recorded {ago(report.createdAt)}
                  </span>
                )}
                {(page?.url || report.url) && (
                  <>
                    <span>·</span>
                    <a href={page?.url || report.url || undefined} target="_blank" rel="noreferrer" className="inline-flex max-w-[360px] items-center gap-1 truncate text-primary hover:underline">
                      <Globe className="h-3.5 w-3.5 shrink-0" />
                      {(page?.url || report.url || "").replace(/^https?:\/\//, "").replace(/\?.*$/, "")}
                    </a>
                  </>
                )}
                {page?.userAgent && <><span>·</span><span>{shortBrowser(page.userAgent)}</span></>}
                {page?.viewport?.width ? <><span>·</span><span className="font-mono">{page.viewport.width}×{page.viewport.height}</span></> : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Menu>
                <MenuTrigger
                  disabled={fixing}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.15)] outline-none hover:bg-primary-hover disabled:opacity-70"
                >
                  {fixing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                  {fixing ? "Writing a fix…" : "Fix with AI"}
                  <ChevronDown className="h-3.5 w-3.5 opacity-80" />
                </MenuTrigger>
                <MenuContent align="end" className="w-72">
                  <MenuItem disabled={!canEdit || !tools?.connected.github} onSelect={openFixPr}>
                    <GithubMark className="h-4 w-4" />
                    <span className="flex flex-col">
                      <span>Open a fix pull request</span>
                      <span className="text-[11.5px] text-foreground-muted">{tools?.connected.github ? "AI writes a small fix as a draft PR" : "Connect GitHub in Integrations first"}</span>
                    </span>
                  </MenuItem>
                  <MenuItem onSelect={fixWithAi}>
                    <Bot className="h-4 w-4" />
                    <span className="flex flex-col">
                      <span>Copy prompt for your coding agent</span>
                      <span className="text-[11.5px] text-foreground-muted">Errors, timeline and a test, for Claude Code, Cursor…</span>
                    </span>
                  </MenuItem>
                </MenuContent>
              </Menu>
              <Menu>
                <MenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium outline-none hover:bg-background-tertiary">
                  <Github className="h-4 w-4" />Create issue<ChevronDown className="h-3.5 w-3.5 text-foreground-muted" />
                </MenuTrigger>
                <MenuContent align="end" className="w-64">
                  {(["github", "linear", "jira"] as Provider[]).filter((p) => tools?.connected[p]).map((p) => {
                    const cfg = (tools?.connected[p]?.config ?? {}) as Record<string, string>
                    const target = p === "github" ? cfg.defaultRepo : p === "linear" ? ((cfg.teams as unknown as { id: string; key: string }[]) ?? []).find((t) => t.id === cfg.teamId)?.key : cfg.projectKey
                    const Logo = p === "github" ? GithubMark : p === "linear" ? LinearMark : JiraMark
                    return (
                      <MenuItem
                        key={p}
                        disabled={!canEdit || creating !== null}
                        onSelect={async () => {
                          setCreating(p)
                          const t = toast.loading(`Creating the ${p === "github" ? "GitHub" : p === "linear" ? "Linear" : "Jira"} issue…`)
                          try {
                            const link = await createExternalIssue(report.id, p)
                            merge({ links: [...(report.links ?? []), link] })
                            toast.success(<span>Created <a className="underline" href={link.url} target="_blank" rel="noreferrer">{link.key}</a></span>, { id: t })
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Could not create the issue", { id: t })
                          } finally {
                            setCreating(null)
                          }
                        }}
                      >
                        <Logo className="h-4 w-4" />
                        {p === "github" ? "GitHub" : p === "linear" ? "Linear" : "Jira"}
                        <MenuHint>{target ?? "choose default"}</MenuHint>
                      </MenuItem>
                    )
                  })}
                  {!(["github", "linear", "jira"] as Provider[]).some((p) => tools?.connected[p]) && (
                    <MenuItem onSelect={() => (repo ? openGithub(repo) : setRepoDialog(true))}>
                      <Github className="h-4 w-4" />Open a GitHub issue page<MenuHint>{repo ?? "choose repo"}</MenuHint>
                    </MenuItem>
                  )}
                  <MenuSeparator />
                  <MenuItem asChild>
                    <Link href="/dashboard/integrations">Connect GitHub, Linear or Jira…</Link>
                  </MenuItem>
                </MenuContent>
              </Menu>
              {canEdit && <Tip label={report.shareToken ? "Copy the share link" : "Create a read-only link"}>
                <button onClick={share} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium hover:bg-background-tertiary">
                  <Link2 className="h-4 w-4" />Share
                </button>
              </Tip>}
              <Menu>
                <MenuTrigger className="grid h-8 w-8 place-items-center rounded-lg text-foreground-secondary outline-none hover:bg-background-tertiary" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </MenuTrigger>
                <MenuContent align="end">
                  <MenuItem onSelect={() => copy(reportToMarkdown(report, window.location.origin), "Copied as Markdown")}><Copy className="h-4 w-4" />Copy as Markdown</MenuItem>
                  <MenuItem disabled={pending || !canEdit} onSelect={generate}><Sparkles className="h-4 w-4" />{report.aiStatus === "done" ? "Write again with AI" : "Generate AI write-up"}</MenuItem>
                  <MenuItem onSelect={async () => downloadText(`${bugId(report.number).toLowerCase()}.spec.ts`, await getReportText(report.id, "playwright"), "text/plain")}>
                    <FlaskConical className="h-4 w-4" />Download regression test
                  </MenuItem>
                  {report.shareToken && canEdit && (
                    <MenuItem onSelect={async () => { await setReportShared(report.id, false); merge({ shareToken: null }); toast.success("Stopped sharing") }}>
                      <Link2 className="h-4 w-4" />Stop sharing
                    </MenuItem>
                  )}
                  <MenuSeparator />
                  <MenuItem disabled={!canEdit} onSelect={() => setConfirmDelete(true)} className="text-red-400 data-[highlighted]:text-red-400"><Trash2 className="h-4 w-4" />Delete report</MenuItem>
                </MenuContent>
              </Menu>
            </div>
          </div>

          {/* Video */}
          {mediaPending ? (
            <div className="mt-5 grid aspect-video w-full place-items-center rounded-xl border border-dashed border-border bg-background-secondary">
              <div className="text-center">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">Uploading your recording…</p>
                <p className="mt-1 text-xs text-foreground-muted">The video shows up here in a few seconds. Then the AI writes the report.</p>
              </div>
            </div>
          ) : info.mediaPending ? (
            <p className="mt-5 rounded-xl border border-border bg-background-secondary px-4 py-3 text-sm text-foreground-muted">The recording did not finish uploading. The steps and logs below are saved.</p>
          ) : info.recordingExpiredAt && !info.recordingUrl ? (
            <p className="mt-5 rounded-xl border border-border bg-background-secondary px-4 py-3 text-sm text-foreground-muted">The video was removed after the plan&apos;s storage period. The steps, logs and screenshots are kept.</p>
          ) : info.recordingUrl ? (
            <div className="mt-5"><SyncedPlayer src={info.recordingUrl} /></div>
          ) : shots[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shots[shots.length - 1]} alt="Last screenshot" className="mt-5 w-full rounded-xl border border-border" />
          ) : null}

          <Tabs defaultValue="overview" className="mt-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="timeline">Timeline <Count>{events.length}</Count></TabsTrigger>
              <TabsTrigger value="console">Console <Count tone={errorCount ? "red" : undefined}>{consoleEvents.length}</Count></TabsTrigger>
              <TabsTrigger value="network">Network <Count tone={networkLogs.some((l) => l.level.toUpperCase() === "ERROR") ? "red" : undefined}>{networkLogs.length}</Count></TabsTrigger>
              <TabsTrigger value="test"><FlaskConical className="h-3.5 w-3.5" />Regression test</TabsTrigger>
              <TabsTrigger value="shots">Screenshots <Count>{shots.length}</Count></TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4 outline-none">
              {info.userNote && (
                <blockquote className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
                  <p className="mb-1 text-xs font-medium text-sky-600 dark:text-sky-400">
                    {info.reporter?.email ? `${info.reporter.email} wrote` : "The person who reported it wrote"}
                  </p>
                  <p className="whitespace-pre-wrap text-[14px] text-foreground">{info.userNote}</p>
                </blockquote>
              )}
              {report.aiStatus !== "done" && !pending && canEdit && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <p className="flex-1 text-sm text-foreground-secondary">
                    {report.aiStatus === "failed"
                      ? report.browserInfo?.aiError || "The AI could not write this one yet."
                      : "Let the AI write the summary, steps, expected vs actual and the likely cause."}
                  </p>
                  <Button size="sm" onClick={generate}>Generate AI write-up</Button>
                </div>
              )}

              <div className="rounded-xl border border-border">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    What happened
                    {report.aiStatus === "done" && <span className="text-xs font-normal text-primary">written by AI, edit freely</span>}
                  </h2>
                  {descDirty && (
                    <Button size="sm" onClick={saveDescription}>Save</Button>
                  )}
                </div>
                <div className="px-1 [&_.ProseMirror]:min-h-[64px]" onBlur={saveDescription}>
                  <RichTextEditor
                    editable={canEdit}
                    content={description}
                    onChange={(c) => {
                      setDescription(c)
                      setDescDirty(strip(c) !== strip(report.description))
                    }}
                    placeholder="Describe what went wrong…"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {report.stepsToReproduce?.length > 0 && (
                  <section className="rounded-xl border border-border p-4">
                    <h2 className="mb-2 text-sm font-semibold">Steps to reproduce</h2>
                    <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px] text-foreground-secondary">
                      {report.stepsToReproduce.map((s, i) => <li key={i}><InlineCode text={s.replace(/^Step \d+:\s*/i, "")} /></li>)}
                    </ol>
                  </section>
                )}
                {report.aiRootCause && (
                  <section className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                    <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-primary"><Sparkles className="h-4 w-4" />Likely cause</h2>
                    <p className="text-[13.5px] text-foreground-secondary"><InlineCode text={report.aiRootCause} /></p>
                    {report.aiSuggestions?.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-foreground-secondary">
                        {report.aiSuggestions.slice(0, 4).map((s, i) => <li key={i}><InlineCode text={s} /></li>)}
                      </ul>
                    )}
                  </section>
                )}
                {report.expectedResult && (
                  <section className="rounded-xl border border-border p-4">
                    <h2 className="mb-2 text-sm font-semibold">Expected</h2>
                    <p className="text-[13.5px] text-foreground-secondary"><InlineCode text={report.expectedResult} /></p>
                  </section>
                )}
                {report.actualResult && (
                  <section className="rounded-xl border border-border p-4">
                    <h2 className="mb-2 text-sm font-semibold">Actual</h2>
                    <p className="text-[13.5px] text-foreground-secondary"><InlineCode text={report.actualResult} /></p>
                  </section>
                )}
              </div>

              {keyMoments.length > 0 && (
                <section>
                  <h2 className="mb-2 text-sm font-semibold">Key moments <span className="font-normal text-foreground-muted">· click to jump in the video</span></h2>
                  <EventList events={keyMoments} />
                </section>
              )}
            </TabsContent>

            <TabsContent value="timeline" className="mt-4 outline-none">
              <EventList events={events} empty="No events were captured for this recording." />
              {(info.droppedLogs ?? 0) > 0 && <p className="mt-2 text-xs text-foreground-muted">{info.droppedLogs} more events were not kept (limit 1,000).</p>}
            </TabsContent>

            <TabsContent value="console" className="mt-4 outline-none">
              <EventList events={consoleEvents} empty="No console messages." />
            </TabsContent>

            <TabsContent value="network" className="mt-4 outline-none">
              {networkLogs.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-foreground-muted">No requests were captured.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full table-fixed text-[12.5px]">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-foreground-muted">
                        <th className="w-16 px-3 py-2 font-normal">Method</th>
                        <th className="px-3 py-2 font-normal">URL</th>
                        <th className="w-16 px-3 py-2 font-normal">Status</th>
                        <th className="w-20 px-3 py-2 font-normal">Time</th>
                        <th className="w-[34%] px-3 py-2 font-normal">Response</th>
                      </tr>
                    </thead>
                    <tbody>
                      {networkLogs.map((l, i) => {
                        const d = (l.data ?? {}) as Record<string, unknown>
                        const bad = l.level.toUpperCase() === "ERROR"
                        return (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="px-3 py-2 font-mono">{String(d.method ?? "")}</td>
                            <td className="truncate px-3 py-2 font-mono text-foreground-secondary" title={String(d.url ?? l.message)}>{String(d.url ?? l.message).replace(/^https?:\/\/[^/]+/, "")}</td>
                            <td className={`px-3 py-2 font-mono ${bad ? "text-red-400" : "text-emerald-400"}`}>{String(d.status ?? (bad ? "failed" : ""))}</td>
                            <td className="px-3 py-2 font-mono text-foreground-muted">{typeof d.duration === "number" ? `${d.duration}ms` : ""}</td>
                            <td className="truncate px-3 py-2 font-mono text-foreground-muted" title={String(d.responseBody ?? "")}>{String(d.responseBody ?? d.error ?? "")}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="test" className="mt-4 outline-none">
              <PlaywrightCard reportId={report.id} />
            </TabsContent>

            <TabsContent value="shots" className="mt-4 outline-none">
              {shots.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-foreground-muted">No screenshots.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {shots.map((url, i) => (
                    <button key={url} onClick={() => setEditingShot({ url, index: i })} className="group relative overflow-hidden rounded-lg border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Screenshot ${i + 1}`} className="w-full" />
                      <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                        <ImageIcon className="h-3.5 w-3.5" />Annotate
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Right panel */}
        <aside className="space-y-6 border-t border-border bg-background-secondary/40 p-5 xl:border-l xl:border-t-0">
          <section>
            <h2 className="mb-2 text-[11.5px] font-medium text-foreground-muted">Details</h2>
            <ReportDetails report={report} onChange={merge} readOnly={!canEdit} />
          </section>

          {report.duplicates && report.duplicates.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-medium text-foreground-muted">
                <Layers className="h-3.5 w-3.5 text-amber-400" />Seen {report.duplicates.length + 1} times
              </h2>
              <ul className="space-y-1">
                {report.duplicates.slice(0, 5).map((d) => (
                  <li key={d.id}>
                    <a href={`/dashboard/reports/${d.id}`} className="flex justify-between gap-2 rounded-md px-1.5 py-1 text-[12.5px] text-foreground-secondary hover:bg-background-tertiary hover:text-foreground">
                      <span className="truncate">{d.title}</span>
                      <span className="shrink-0 text-foreground-muted">{timeAgo(d.createdAt)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {page && (
            <section>
              <h2 className="mb-2 text-[11.5px] font-medium text-foreground-muted">Environment</h2>
              <dl className="grid grid-cols-[84px_1fr] gap-y-1 px-1.5 text-[12.5px]">
                {page.userAgent && <><dt className="text-foreground-muted">Browser</dt><dd className="text-foreground-secondary">{shortBrowser(page.userAgent)}</dd></>}
                {page.viewport?.width ? <><dt className="text-foreground-muted">Viewport</dt><dd className="font-mono text-foreground-secondary">{page.viewport.width} × {page.viewport.height}</dd></> : null}
                {page.screen && <><dt className="text-foreground-muted">Screen</dt><dd className="font-mono text-foreground-secondary">{page.screen.width} × {page.screen.height} @{page.screen.pixelRatio}x</dd></>}
                {page.language && <><dt className="text-foreground-muted">Language</dt><dd className="text-foreground-secondary">{page.language}</dd></>}
                {info.duration ? <><dt className="text-foreground-muted">Recording</dt><dd className="text-foreground-secondary">{info.duration}s</dd></> : null}
              </dl>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-[11.5px] font-medium text-foreground-muted">Activity</h2>
            <ActivityFeed reportId={report.id} refreshKey={activityKey} />
          </section>
        </aside>
      </div>

      {editingShot && (
        <ImageEditor
          imageUrl={editingShot.url}
          onClose={() => setEditingShot(null)}
          onSave={async (dataUrl) => {
            const next = [...shots]
            try {
              next[editingShot.index] = await uploadImage(dataUrl)
              await updateBugReport(report.id, { screenshotUrls: next })
              merge({ browserInfo: { ...info, screenshotUrls: next } })
              toast.success("Screenshot saved")
            } catch {
              toast.error("Could not save the screenshot")
            }
          }}
        />
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent title={`Delete ${bugId(report.number)}?`} description="The report, its video and screenshots are deleted for good.">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              className="bg-red-500 hover:bg-red-600"
              onClick={async () => {
                await deleteBugReport(report.id)
                toast.success(`${bugId(report.number)} deleted`)
                router.push("/dashboard/reports")
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={repoDialog} onOpenChange={setRepoDialog}>
        <DialogContent title="Which GitHub repository?" description="GitHub opens with the issue filled in. Nothing is posted for you.">
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                const saved = await saveGithubRepo(repoInput)
                setRepo(saved.githubRepo)
                setRepoDialog(false)
                if (saved.githubRepo) openGithub(saved.githubRepo)
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not save")
              }
            }}
          >
            <Input autoFocus value={repoInput} onChange={(e) => setRepoInput(e.target.value)} placeholder={repo ?? "owner/repo"} />
            <Button type="submit" disabled={!repoInput.trim()}>Save and open</Button>
          </form>
        </DialogContent>
      </Dialog>
    </PlayerProvider>
  )
}
