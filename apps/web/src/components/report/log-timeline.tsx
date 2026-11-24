"use client"

import { useMemo, useState } from "react"
import type { SessionLog } from "@/lib/api"
import { cn } from "@/lib/utils"

type Filter = "all" | "errors" | "network" | "actions" | "console"

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "errors", label: "Errors" },
  { id: "network", label: "Network" },
  { id: "actions", label: "Clicks & pages" },
  { id: "console", label: "Console" },
]

function matches(log: SessionLog, filter: Filter) {
  const level = log.level.toUpperCase()
  switch (filter) {
    case "errors":
      return level === "ERROR" || level === "WARN"
    case "network":
      return log.type === "NETWORK"
    case "actions":
      return log.type === "CLICK" || log.type === "NAVIGATION" || log.type === "INPUT"
    case "console":
      return log.type === "CONSOLE"
    default:
      return true
  }
}

const TYPE_LABEL: Record<string, string> = {
  CONSOLE: "console",
  NETWORK: "network",
  CLICK: "click",
  ERROR: "error",
  NAVIGATION: "page",
  INPUT: "input",
}

export function LogTimeline({ logs, dropped = 0 }: { logs: SessionLog[]; dropped?: number }) {
  const [filter, setFilter] = useState<Filter>(() =>
    logs.some((l) => l.level.toUpperCase() === "ERROR") ? "errors" : "all"
  )
  const [open, setOpen] = useState<number | null>(null)
  const start = logs.length ? Date.parse(logs[0].timestamp) : 0

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, logs.filter((l) => matches(l, f.id)).length])),
    [logs]
  )
  const visible = logs.map((log, index) => ({ log, index })).filter(({ log }) => matches(log, filter))

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter logs">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              filter === f.id
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border text-foreground-secondary hover:text-foreground"
            )}
          >
            {f.label} <span className="ml-1 font-mono opacity-70">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      <div className="max-h-96 overflow-auto rounded-lg border border-border bg-background font-mono text-xs">
        {visible.length === 0 && <p className="p-4 text-foreground-muted">Nothing here.</p>}
        {visible.map(({ log, index }) => {
          const level = log.level.toUpperCase()
          const extra = log.data ?? log.metadata
          const stack = typeof extra?.stack === "string" ? extra.stack : undefined
          const body = typeof extra?.responseBody === "string" ? extra.responseBody : undefined
          const selector = typeof extra?.selector === "string" ? extra.selector : undefined
          const hasDetail = Boolean(stack || body || selector)
          const t = start ? ((Date.parse(log.timestamp) - start) / 1000).toFixed(1) : ""
          return (
            <div
              key={index}
              className={cn(
                "border-b border-border/60 px-3 py-1.5 last:border-0",
                level === "ERROR" && "bg-destructive/5",
                level === "WARN" && "bg-warning/5"
              )}
            >
              <button
                type="button"
                disabled={!hasDetail}
                onClick={() => setOpen(open === index ? null : index)}
                className="flex w-full items-start gap-3 text-left disabled:cursor-default"
              >
                <span className="w-12 shrink-0 text-right text-foreground-muted">+{t}s</span>
                <span className="w-14 shrink-0 text-foreground-muted">{TYPE_LABEL[log.type] ?? log.type.toLowerCase()}</span>
                <span
                  className={cn(
                    "min-w-0 flex-1 break-words",
                    level === "ERROR" ? "text-destructive" : level === "WARN" ? "text-warning" : "text-foreground-secondary"
                  )}
                >
                  {log.message}
                  {extra?.beforeRecording ? <span className="ml-2 text-foreground-muted">(before recording)</span> : null}
                </span>
              </button>
              {open === index && hasDetail && (
                <pre className="ml-[7.75rem] mt-1 whitespace-pre-wrap break-words text-[11px] text-foreground-muted">
                  {selector && `selector: ${selector}\n`}
                  {body && `response: ${body}\n`}
                  {stack}
                </pre>
              )}
            </div>
          )
        })}
      </div>
      {dropped > 0 && (
        <p className="mt-2 text-xs text-foreground-muted">{dropped} more events were not kept (limit 1,000 per recording).</p>
      )}
    </div>
  )
}
