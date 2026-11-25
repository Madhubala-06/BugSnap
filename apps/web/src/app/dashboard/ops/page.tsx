"use client"

import { useEffect, useState } from "react"
import { useCrumbs } from "@/components/shell/workspace-data"
import { API_URL, authFetch } from "@/lib/auth"
import { ago } from "@/components/kit/bits"

interface Group {
  fingerprint: string
  count: number
  lastSeen: string
  source: "api" | "web" | "extension"
  message: string
  path?: string | null
  method?: string | null
  status?: number | null
  stack?: string | null
  userAgent?: string | null
}

const SOURCE: Record<Group["source"], string> = { api: "Server", web: "Website", extension: "Extension" }

/** The BugSnap team's own error log (only visible to OPS_EMAILS). */
export default function OpsPage() {
  useCrumbs([{ label: "Errors (team)" }])
  const [days, setDays] = useState(7)
  const [data, setData] = useState<{ total: number; groups: Group[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    authFetch(`${API_URL}/ops/errors?days=${days}`)
      .then(async (r) => (r.ok ? setData(await r.json()) : setError(r.status === 403 ? "Only the BugSnap team can see this page." : "Could not load errors")))
      .catch(() => setError("Could not load errors"))
  }, [days])

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Errors</h1>
          <p className="text-sm text-foreground-muted">Crashes in BugSnap itself (server, website, extension). New kinds of errors are emailed to the team once an hour.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-0.5 text-xs">
          {[1, 7, 30].map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`rounded-md px-2.5 py-1 ${d === days ? "bg-background-secondary text-foreground" : "text-foreground-muted hover:text-foreground"}`}>
              {d === 1 ? "24 hours" : `${d} days`}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-foreground-muted">{error}</p>}
      {!error && !data && <div className="h-40 animate-pulse rounded-xl bg-background-secondary" />}
      {data && data.groups.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-foreground-muted">No errors in this period.</div>
      )}
      {data && data.groups.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <p className="border-b border-border bg-background-secondary px-4 py-2 text-xs text-foreground-muted">
            {data.total} error{data.total === 1 ? "" : "s"} in {data.groups.length} group{data.groups.length === 1 ? "" : "s"}
          </p>
          {data.groups.map((g) => (
            <div key={g.fingerprint} className="border-b border-border last:border-0">
              <button onClick={() => setOpen(open === g.fingerprint ? null : g.fingerprint)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-background-secondary/60">
                <span className="mt-0.5 w-20 flex-none rounded-md bg-red-500/10 px-1.5 py-0.5 text-center text-[11px] font-medium text-red-400">{SOURCE[g.source] ?? g.source}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[13px] text-foreground">{g.message}</span>
                  <span className="block truncate text-xs text-foreground-muted">
                    {[g.method, g.path?.split("?")[0], g.status].filter(Boolean).join(" ")}
                  </span>
                </span>
                <span className="flex-none text-right text-xs text-foreground-muted">
                  <span className="block font-medium text-foreground">×{g.count}</span>
                  {ago(g.lastSeen)}
                </span>
              </button>
              {open === g.fingerprint && (
                <div className="space-y-2 px-4 pb-4">
                  {g.stack && <pre className="max-h-72 overflow-auto rounded-lg bg-background-secondary p-3 font-mono text-[11.5px] leading-5 text-foreground-secondary">{g.stack}</pre>}
                  {g.userAgent && <p className="text-xs text-foreground-muted">Browser: {g.userAgent}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
