"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Globe, Image as ImageIcon, Loader2, Sparkles, Terminal, Video } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LogTimeline } from "@/components/report/log-timeline"
import { RecordingPlayer } from "@/components/report/recording-player"
import { InlineCode } from "@/components/report/inline-code"
import { getSharedReport, type BugReport } from "@/lib/api"

const strip = (html?: string | null) => (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

export default function SharedReportPage() {
  const { token } = useParams<{ token: string }>()
  const [report, setReport] = useState<BugReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState<string | null>(null)

  useEffect(() => {
    getSharedReport(token)
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : "This link is not available"))
  }, [token])

  if (error) {
    return (
      <Shell>
        <div className="py-24 text-center">
          <h1 className="text-xl font-semibold text-foreground">This report is not shared any more</h1>
          <p className="mt-2 text-foreground-secondary">Ask the person who sent it for a new link.</p>
        </div>
      </Shell>
    )
  }
  if (!report) {
    return (
      <Shell>
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
        </div>
      </Shell>
    )
  }

  const info = report.browserInfo ?? {}
  const logs = info.logs ?? []
  const page = info.page
  const shots = info.screenshotUrls ?? []
  const description = strip(report.description)

  return (
    <Shell>
      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={report.severity.toLowerCase() as "low" | "medium" | "high" | "critical"}>{report.severity.toLowerCase()}</Badge>
          <span className="text-foreground-secondary">{report.status.toLowerCase().replace("_", " ")}</span>
          <span className="text-foreground-muted">· {new Date(report.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{report.title}</h1>
        {(page?.url || report.url) && (
          <a href={page?.url || report.url || undefined} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <Globe className="h-4 w-4" /> {page?.url || report.url}
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {(description || report.aiSummary) && (
            <Card>
              <CardContent className="pt-6 text-sm leading-relaxed text-foreground-secondary">
                {report.aiStatus === "done" && (
                  <span className="mb-2 flex items-center gap-1 text-xs font-medium text-primary">
                    <Sparkles className="h-3.5 w-3.5" /> Written by AI from the recording
                  </span>
                )}
                <InlineCode text={description || report.aiSummary || ""} />
              </CardContent>
            </Card>
          )}
          {info.recordingUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Video className="h-5 w-5" /> Recording
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RecordingPlayer src={info.recordingUrl} />
              </CardContent>
            </Card>
          )}
          {shots.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ImageIcon className="h-5 w-5" /> Screenshots ({shots.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {shots.map((url, i) => (
                  <button key={url} onClick={() => setZoom(url)} className="overflow-hidden rounded-lg border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Screenshot ${i + 1}`} className="w-full" />
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
          {logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Terminal className="h-5 w-5" /> What happened ({logs.length} events)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LogTimeline logs={logs} />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {report.stepsToReproduce?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Steps to reproduce</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal space-y-1.5 pl-5 text-sm text-foreground-secondary">
                  {report.stepsToReproduce.map((s, i) => (
                    <li key={i}><InlineCode text={s.replace(/^Step \d+:\s*/i, "")} /></li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
          {(report.expectedResult || report.actualResult) && (
            <Card>
              <CardContent className="space-y-3 pt-6 text-sm">
                {report.expectedResult && (
                  <div>
                    <h2 className="mb-1 font-medium text-foreground">Expected</h2>
                    <p className="text-foreground-secondary"><InlineCode text={report.expectedResult} /></p>
                  </div>
                )}
                {report.actualResult && (
                  <div>
                    <h2 className="mb-1 font-medium text-foreground">Actual</h2>
                    <p className="text-foreground-secondary"><InlineCode text={report.actualResult} /></p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {report.aiRootCause && (
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-primary">
                  <Sparkles className="h-5 w-5" /> Likely cause
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-foreground-secondary">
                <p><InlineCode text={report.aiRootCause} /></p>
                {report.aiSuggestions?.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5">
                    {report.aiSuggestions.map((s, i) => (
                      <li key={i}><InlineCode text={s} /></li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
          {page?.viewport?.width ? (
            <Card>
              <CardContent className="pt-6 font-mono text-xs text-foreground-secondary">
                {page.viewport.width} × {page.viewport.height}
                {page.userAgent ? ` · ${page.userAgent.match(/Chrome\/(\d+)/)?.[0]?.replace("/", " ") ?? ""}` : ""}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {zoom && (
        <button className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={() => setZoom(null)} aria-label="Close">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="Screenshot" className="max-h-full max-w-full rounded-lg" />
        </button>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={24} height={24} className="rounded-md" />
            <span className="font-semibold text-foreground">BugSnap</span>
          </Link>
          <Link href="/login" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Record your own bugs, free
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
