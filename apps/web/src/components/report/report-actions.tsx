"use client"

import { useEffect, useState } from "react"
import { Bot, Check, Github, Link2, Loader2, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { analyzeReport, getBugReport, getAiStatus, getReportText, saveGithubRepo, setReportShared, type BugReport } from "@/lib/api"
import { reportToMarkdown } from "@/lib/export"

/** GitHub's "new issue" page with title and body filled in. No GitHub login needed on our side. */
export function githubIssueUrl(repo: string, report: BugReport, appUrl: string) {
  let body = reportToMarkdown(report, appUrl).replace(/^## .*\n\n/, "")
  if (body.length > 6000) body = `${body.slice(0, 6000)}\n\n_(trimmed, see the full report in BugSnap)_`
  const params = new URLSearchParams({ title: report.title.slice(0, 200), body, labels: "bug" })
  return `https://github.com/${repo}/issues/new?${params.toString()}`
}

export function ReportActions({ report, onChange }: { report: BugReport; onChange: (r: BugReport) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [repo, setRepo] = useState<string | null>(null)
  const [askRepo, setAskRepo] = useState(false)
  const [repoInput, setRepoInput] = useState("")

  useEffect(() => {
    getAiStatus()
      .then((s) => setRepo(s.githubRepo))
      .catch(() => undefined)
  }, [])

  // While the AI writes in the background, check every few seconds.
  const pending = report.aiStatus === "pending"
  useEffect(() => {
    if (!pending) return
    let stopped = false
    const started = Date.now()
    const poll = async () => {
      if (stopped) return
      try {
        const fresh = await getBugReport(report.id)
        if (fresh.aiStatus !== "pending") {
          onChange(fresh)
          return
        }
      } catch {
        // keep trying
      }
      if (Date.now() - started < 6 * 60 * 1000) setTimeout(poll, 4000)
    }
    const timer = setTimeout(poll, 4000)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, report.id])

  // If the AI was busy earlier, quietly start another background attempt when the report is opened.
  const [autoTried, setAutoTried] = useState(false)
  useEffect(() => {
    if (autoTried || report.aiStatus !== "failed") return
    setAutoTried(true)
    analyzeReport(report.id)
      .then((res) => {
        if (res.ok) onChange({ ...report, aiStatus: "pending" })
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTried, report.aiStatus, report.id])

  const flash = (key: string) => {
    setDone(key)
    setTimeout(() => setDone((d) => (d === key ? null : d)), 1800)
  }

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setBusy(null)
    }
  }

  const shareUrl = report.shareToken ? `${window.location.origin}/r/${report.shareToken}` : null

  const openGithub = (target: string) => {
    window.open(githubIssueUrl(target, report, window.location.origin), "_blank", "noopener,noreferrer")
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {pending ? (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 text-sm text-primary" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> AI is writing the report...
          </span>
        ) : (
          report.aiStatus !== "done" && (
            <Button
              size="sm"
              onClick={() =>
                run("ai", async () => {
                  const res = await analyzeReport(report.id)
                  if (!res.ok) throw new Error(res.error || "AI write-up failed")
                  onChange({ ...report, aiStatus: "pending" })
                })
              }
              disabled={busy !== null}
              className="gap-1.5"
            >
              {busy === "ai" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate AI write-up
            </Button>
          )
        )}

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={busy !== null}
          title="Copies a prompt with the exact errors, timeline and a Playwright test. Paste it into Cursor, Claude Code or Copilot."
          onClick={() =>
            run("fix", async () => {
              await navigator.clipboard.writeText(await getReportText(report.id, "fix-prompt"))
              flash("fix")
            })
          }
        >
          {busy === "fix" ? <Loader2 className="h-4 w-4 animate-spin" /> : done === "fix" ? <Check className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
          {done === "fix" ? "Prompt copied" : "Fix with AI"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={busy !== null}
          onClick={() =>
            run("share", async () => {
              const { shareToken } = report.shareToken ? { shareToken: report.shareToken } : await setReportShared(report.id, true)
              onChange({ ...report, shareToken })
              await navigator.clipboard.writeText(`${window.location.origin}/r/${shareToken}`)
              flash("share")
            })
          }
        >
          {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : done === "share" ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
          {done === "share" ? "Link copied" : report.shareToken ? "Copy share link" : "Share link"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => (repo ? openGithub(repo) : setAskRepo(true))}
          title={repo ? `New issue in ${repo}` : "Create a GitHub issue"}
        >
          <Github className="h-4 w-4" />
          GitHub issue
        </Button>
      </div>

      {shareUrl && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-foreground-secondary">
          Anyone with this link can view the report:
          <a href={shareUrl} target="_blank" rel="noreferrer" className="font-mono text-primary hover:underline">
            {shareUrl.replace(/^https?:\/\//, "")}
          </a>
          <button
            className="text-foreground-muted underline hover:text-foreground"
            onClick={() =>
              run("unshare", async () => {
                await setReportShared(report.id, false)
                onChange({ ...report, shareToken: null })
              })
            }
          >
            Stop sharing
          </button>
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {askRepo && (
        <form
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault()
            run("repo", async () => {
              const saved = await saveGithubRepo(repoInput)
              setRepo(saved.githubRepo)
              setAskRepo(false)
              if (saved.githubRepo) openGithub(saved.githubRepo)
            })
          }}
        >
          <label className="text-sm text-foreground" htmlFor="gh-repo">
            Which GitHub repository?
          </label>
          <Input id="gh-repo" value={repoInput} onChange={(e) => setRepoInput(e.target.value)} placeholder="owner/repo" className="h-8 w-56" autoFocus />
          <Button size="sm" type="submit" disabled={!repoInput.trim() || busy === "repo"}>
            Save and open
          </Button>
          <button type="button" aria-label="Cancel" onClick={() => setAskRepo(false)} className="text-foreground-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  )
}
