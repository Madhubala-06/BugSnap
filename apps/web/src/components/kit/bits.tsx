import { cn } from "@/lib/utils"
import type { ReportStatus, Severity } from "@/lib/api"

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("rounded border border-b-2 border-border bg-background-secondary px-1 font-mono text-[10.5px] leading-4 text-foreground-muted", className)}>
      {children}
    </kbd>
  )
}

const SEV: Record<string, string> = {
  CRITICAL: "text-red-600 bg-red-500/10 dark:text-red-400",
  HIGH: "text-orange-600 bg-orange-500/10 dark:text-orange-400",
  MEDIUM: "text-amber-700 bg-amber-500/15 dark:text-amber-400 dark:bg-amber-400/10",
  LOW: "text-foreground-secondary bg-background-tertiary",
}
export function SeverityPill({ severity, className }: { severity: Severity | string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-px text-xs font-medium", SEV[severity] ?? SEV.LOW, className)}>
      {severity.toLowerCase()}
    </span>
  )
}

export const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  FIX_READY: "Fix ready",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  WONT_FIX: "Won't fix",
}
export const STATUS_ORDER: ReportStatus[] = ["OPEN", "IN_PROGRESS", "FIX_READY", "RESOLVED", "WONT_FIX"] as ReportStatus[]

/** Linear-style status circle. */
export function StatusIcon({ status, className }: { status: ReportStatus | string; className?: string }) {
  const base = "inline-block h-3 w-3 shrink-0 rounded-full border-[1.5px]"
  switch (status) {
    case "IN_PROGRESS":
      return <span className={cn(base, "border-amber-400", className)} style={{ background: "conic-gradient(rgb(251 191 36) 0 50%, transparent 0)" }} />
    case "FIX_READY":
      return <span className={cn(base, "border-violet-400", className)} style={{ background: "conic-gradient(rgb(167 139 250) 0 75%, transparent 0)" }} />
    case "RESOLVED":
    case "CLOSED":
      return <span className={cn(base, "border-emerald-400 bg-emerald-400", className)} />
    case "WONT_FIX":
      return <span className={cn(base, "border-foreground-muted bg-foreground-muted/40", className)} />
    default:
      return <span className={cn(base, "border-foreground-muted", className)} />
  }
}

export const PRIORITY_LABEL: Record<string, string> = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low", none: "No priority" }
export const PRIORITY_ORDER = ["urgent", "high", "medium", "low", "none"]

/** Signal-bar priority icon. */
export function PriorityIcon({ priority, className }: { priority: string; className?: string }) {
  if (priority === "urgent")
    return (
      <span className={cn("inline-grid h-3.5 w-3.5 place-items-center rounded-[3px] bg-red-500 text-[10px] font-bold leading-none text-white", className)}>!</span>
    )
  const level = priority === "high" ? 3 : priority === "medium" ? 2 : priority === "low" ? 1 : 0
  if (!level) return <span className={cn("inline-block h-3.5 w-3.5 text-center leading-[14px] text-foreground-muted", className)}>–</span>
  return (
    <span className={cn("inline-flex h-3.5 w-3.5 items-end gap-[2px]", className)}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn("w-[3px] rounded-[1px]", i <= level ? "bg-foreground-secondary" : "bg-border")} style={{ height: `${i * 4 + 2}px` }} />
      ))}
    </span>
  )
}

const AV = ["bg-violet-600", "bg-sky-600", "bg-pink-600", "bg-emerald-600", "bg-amber-600", "bg-indigo-600", "bg-rose-600", "bg-teal-600"]
export function Avatar({ name, email, size = 20, className }: { name?: string | null; email?: string | null; size?: number; className?: string }) {
  const label = (name || email || "?").trim()
  let hash = 0
  for (const ch of email || label) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <span
      title={name || email || undefined}
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold text-white", AV[hash % AV.length], className)}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.45) }}
    >
      {label.charAt(0).toUpperCase()}
    </span>
  )
}

export function bugId(n?: number | null) {
  return n ? `BUG-${n}` : "BUG"
}

export function timeAgo(date: string | Date) {
  const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

/** Tell the sidebar (and anything else listening) that reports changed. */
export function notifyReportsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("bugsnap:reports-changed"))
}

/** "3h ago", or "just now". */
export function ago(date: string | Date) {
  const t = timeAgo(date)
  return t === "just now" || /^\d{1,2} [A-Z]/.test(t) ? t : `${t} ago`
}
