"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import * as Checkbox from "@radix-ui/react-checkbox"
import { Check, Download, FileText, Layers, MessageSquareWarning, Minus, Plus, Settings2, Sparkles, Tag, User, X } from "lucide-react"
import { ProjectSettingsDialog } from "@/components/shell/project-settings-dialog"
import { cn } from "@/lib/utils"
import { useMe } from "@/components/auth-gate"
import { can } from "@/lib/auth"
import { useCrumbs, useWorkspace } from "@/components/shell/workspace-data"
import { bulkUpdate, getBugReports, type BugReport, type ReportStatus, type Severity } from "@/lib/api"
import { reportsToCsv, downloadText } from "@/lib/export"
import { Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/kit/menu"
import {
  Avatar,
  bugId,
  notifyReportsChanged,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  PriorityIcon,
  SeverityPill,
  STATUS_LABEL,
  STATUS_ORDER,
  StatusIcon,
  timeAgo,
} from "@/components/kit/bits"
import { Tip } from "@/components/kit/tooltip"

const OPEN: ReportStatus[] = ["OPEN", "IN_PROGRESS", "FIX_READY"]
const DONE: ReportStatus[] = ["RESOLVED", "CLOSED", "WONT_FIX"]
const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

type Tab = "open" | "critical" | "unassigned" | "fix" | "done"
const TABS: { id: Tab; label: string; test: (r: BugReport) => boolean }[] = [
  { id: "open", label: "All open", test: (r) => OPEN.includes(r.status) },
  { id: "critical", label: "Critical", test: (r) => OPEN.includes(r.status) && r.severity === "CRITICAL" },
  { id: "unassigned", label: "Unassigned", test: (r) => OPEN.includes(r.status) && !r.assignee },
  { id: "fix", label: "Fix ready", test: (r) => r.status === "FIX_READY" },
  { id: "done", label: "Done", test: (r) => DONE.includes(r.status) },
]

export default function ReportsPage() {
  return (
    <Suspense>
      <ReportsTable />
    </Suspense>
  )
}

function Box({ checked, onChange, label }: { checked: boolean | "indeterminate"; onChange: (v: boolean) => void; label: string }) {
  return (
    <Checkbox.Root
      checked={checked}
      onCheckedChange={(v) => onChange(v === true)}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      className="grid h-[15px] w-[15px] place-items-center rounded-[4px] border border-border-hover bg-background-secondary data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary"
    >
      <Checkbox.Indicator>
        {checked === "indeterminate" ? <Minus className="h-3 w-3 text-white" /> : <Check className="h-3 w-3 text-white" />}
      </Checkbox.Indicator>
    </Checkbox.Root>
  )
}

function FilterChip({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px]",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-dashed border-border-hover text-foreground-secondary hover:border-solid hover:text-foreground",
      )}
    >
      {children}
    </span>
  )
}

const bulkBtn = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[13px] outline-none hover:bg-background-tertiary"

function ReportsTable() {
  const router = useRouter()
  const params = useSearchParams()
  const me = useMe()
  const { members, projects } = useWorkspace()
  const canEdit = can(me, "member")
  const view = params.get("view") ?? "all"
  const projectId = params.get("project")
  const project = projects.find((p) => p.id === projectId)

  const [reports, setReports] = useState<BugReport[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("open")
  const [search, setSearch] = useState(params.get("q") ?? "")
  const [sev, setSev] = useState<Severity[]>([])
  const [assignee, setAssignee] = useState<string[]>([])
  const [label, setLabel] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [settings, setSettings] = useState<"general" | "widget" | null>(null)

  const title = project ? project.name : view === "inbox" ? "Inbox" : view === "mine" ? "My bugs" : "All reports"
  const subtitle = project
    ? project.hosts.join(", ") || "Bugs in this project"
    : view === "inbox"
      ? "New bugs nobody has picked up yet"
      : view === "mine"
        ? "Bugs assigned to you"
        : "Everything recorded in this workspace"
  useCrumbs([{ label: title }])

  const load = useCallback(() => {
    getBugReports({ limit: 500 })
      .then((r) => {
        setReports(r)
        setError(null)
      })
      .catch(() => setError("Could not load reports. Check your connection and refresh."))
  }, [])
  useEffect(load, [load])
  useEffect(() => setSearch(params.get("q") ?? ""), [params])
  useEffect(() => setSelected(new Set()), [view, projectId, tab])

  // Scope by sidebar view, then by tab, then by filters.
  const scoped = useMemo(() => {
    const all = reports ?? []
    if (projectId) return all.filter((r) => r.project?.id === projectId)
    if (view === "inbox") return all.filter((r) => r.status === "OPEN" && !r.assignee)
    if (view === "mine") return all.filter((r) => r.assignee?.id === me?.id)
    return all
  }, [reports, view, projectId, me?.id])

  const tabs = view === "inbox" ? TABS.slice(0, 2) : TABS
  const activeTab = tabs.find((t) => t.id === tab) ?? tabs[0]
  const allLabels = useMemo(() => [...new Set(scoped.flatMap((r) => r.labels ?? []))].sort(), [scoped])
  const q = search.trim().toLowerCase()
  const rows = scoped.filter(
    (r) =>
      activeTab.test(r) &&
      (!sev.length || sev.includes(r.severity)) &&
      (!assignee.length || assignee.includes(r.assignee?.id ?? "none")) &&
      (!label.length || label.some((l) => r.labels?.includes(l))) &&
      (!q || `${bugId(r.number)} ${r.title} ${r.url ?? ""} ${(r.labels ?? []).join(" ")}`.toLowerCase().includes(q)),
  )
  const filtering = Boolean(q || sev.length || assignee.length || label.length)

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const allChecked: boolean | "indeterminate" = rows.length > 0 && rows.every((r) => selected.has(r.id)) ? true : selected.size ? "indeterminate" : false

  const applyBulk = async (changes: Record<string, unknown>, message: string) => {
    const ids = [...selected]
    try {
      const res = await bulkUpdate(ids, changes)
      toast.success(`${message} · ${res.updated} report${res.updated === 1 ? "" : "s"}`)
      setSelected(new Set())
      load()
      notifyReportsChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update")
    }
  }

  const toggleIn = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

  return (
    <div className="pb-24">
      <div className="flex items-center gap-3 px-6 pt-5">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          {project && <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: project.color }} />}
          {title}
        </h1>
        <span className="truncate text-sm text-foreground-muted">{subtitle}</span>
        <div className="ml-auto flex gap-2">
          {project && canEdit && (
            <>
              <button
                onClick={() => setSettings("widget")}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium hover:bg-background-tertiary"
              >
                <MessageSquareWarning className="h-4 w-4" />
                Website widget{project.widgetEnabled && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
              </button>
              <button
                onClick={() => setSettings("general")}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-background-tertiary"
                aria-label="Project settings"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            disabled={!rows.length}
            onClick={() => downloadText(`bugsnap-${title.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`, reportsToCsv(rows))}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium hover:bg-background-tertiary disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="mt-3 flex gap-1 border-b border-border px-6" role="tablist" aria-label="Views">
        {tabs.map((t) => {
          const n = scoped.filter(t.test).length
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab.id === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-[13.5px]",
                activeTab.id === t.id ? "border-primary text-foreground" : "border-transparent text-foreground-muted hover:text-foreground-secondary",
              )}
            >
              {t.label}
              <span className="font-mono text-[11px] text-foreground-muted">{n}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-6 py-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by title, page or BUG-…"
          aria-label="Filter reports"
          className="mr-1 h-7 w-60 rounded-md border border-border bg-background-secondary px-2.5 text-[12.5px] outline-none placeholder:text-foreground-muted focus:border-primary"
        />
        <Menu>
          <MenuTrigger className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <FilterChip active={sev.length > 0}>
              {sev.length ? (
                <>Severity: {sev.map((s) => s.toLowerCase()).join(", ")}</>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Severity
                </>
              )}
            </FilterChip>
          </MenuTrigger>
          <MenuContent>
            {SEVERITIES.map((s) => (
              <MenuCheckItem
                key={s}
                checked={sev.includes(s)}
                onSelect={(e) => {
                  e.preventDefault()
                  setSev((v) => toggleIn(v, s))
                }}
              >
                <SeverityPill severity={s} />
              </MenuCheckItem>
            ))}
          </MenuContent>
        </Menu>
        <Menu>
          <MenuTrigger className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <FilterChip active={assignee.length > 0}>
              {assignee.length ? (
                <>Assignee: {assignee.length}</>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Assignee
                </>
              )}
            </FilterChip>
          </MenuTrigger>
          <MenuContent>
            <MenuCheckItem
              checked={assignee.includes("none")}
              onSelect={(e) => {
                e.preventDefault()
                setAssignee((v) => toggleIn(v, "none"))
              }}
            >
              <User className="h-4 w-4" /> Unassigned
            </MenuCheckItem>
            {members.map((m) => (
              <MenuCheckItem
                key={m.id}
                checked={assignee.includes(m.id)}
                onSelect={(e) => {
                  e.preventDefault()
                  setAssignee((v) => toggleIn(v, m.id))
                }}
              >
                <Avatar name={m.name} email={m.email} size={18} /> {m.name}
              </MenuCheckItem>
            ))}
          </MenuContent>
        </Menu>
        {(allLabels.length > 0 || label.length > 0) && (
          <Menu>
            <MenuTrigger className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <FilterChip active={label.length > 0}>
                {label.length ? (
                  <>Label: {label.join(", ")}</>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    Label
                  </>
                )}
              </FilterChip>
            </MenuTrigger>
            <MenuContent>
              {allLabels.map((l) => (
                <MenuCheckItem
                  key={l}
                  checked={label.includes(l)}
                  onSelect={(e) => {
                    e.preventDefault()
                    setLabel((v) => toggleIn(v, l))
                  }}
                >
                  <Tag className="h-3.5 w-3.5" /> {l}
                </MenuCheckItem>
              ))}
            </MenuContent>
          </Menu>
        )}
        {filtering && (
          <button
            onClick={() => {
              setSearch("")
              setSev([])
              setAssignee([])
              setLabel([])
            }}
            className="ml-1 inline-flex items-center gap-1 text-[12.5px] text-foreground-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
        <span className="ml-auto text-xs text-foreground-muted">Newest first</span>
      </div>

      {error && (
        <p role="alert" className="px-6 pb-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {reports === null ? (
        <div className="space-y-1 px-6" aria-busy="true" aria-label="Loading reports">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[54px] animate-pulse rounded-md bg-background-secondary" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="mx-6 mt-6 rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-foreground-muted" />
          {filtering ? (
            <p className="text-foreground-secondary">No reports match these filters.</p>
          ) : view === "inbox" ? (
            <>
              <p className="font-medium text-foreground">Inbox zero</p>
              <p className="mt-1 text-sm text-foreground-secondary">Every new bug has someone on it.</p>
            </>
          ) : (
            <>
              <p className="font-medium text-foreground">No bugs here yet</p>
              <p className="mt-1 text-sm text-foreground-secondary">
                Record one with the Chrome extension, or{" "}
                <Link href="/r/demo" target="_blank" className="text-primary hover:underline">
                  see an example report
                </Link>
                .
              </p>
            </>
          )}
        </div>
      ) : (
        <table className="w-full table-fixed border-collapse text-[13.5px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-foreground-muted">
              <th className="w-12 py-2 pl-6 font-normal">
                {canEdit && <Box checked={allChecked} label="Select all" onChange={(on) => setSelected(on ? new Set(rows.map((r) => r.id)) : new Set())} />}
              </th>
              <th className="w-20 py-2 font-normal">ID</th>
              <th className="py-2 font-normal">Bug</th>
              <th className="w-24 py-2 font-normal">Severity</th>
              <th className="w-32 py-2 font-normal">Status</th>
              <th className="w-14 py-2 font-normal">Seen</th>
              <th className="w-40 py-2 font-normal">Assignee</th>
              <th className="w-20 py-2 pr-6 text-right font-normal">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const page = r.url ? r.url.replace(/^https?:\/\//, "").replace(/\?.*$/, "") : ""
              const errors = r.browserInfo?.logSummary?.errors ?? 0
              const sel = selected.has(r.id)
              return (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/dashboard/reports/${r.id}`)}
                  className={cn("cursor-pointer border-b border-border", sel ? "bg-primary/10" : "hover:bg-background-secondary")}
                >
                  <td className="py-2.5 pl-6">{canEdit && <Box checked={sel} label={`Select ${bugId(r.number)}`} onChange={(on) => toggle(r.id, on)} />}</td>
                  <td className="py-2.5 font-mono text-xs text-foreground-muted">{bugId(r.number)}</td>
                  <td className="py-2.5 pr-4">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {r.priority && r.priority !== "none" && <PriorityIcon priority={r.priority} />}
                      <span className="truncate font-medium text-foreground">{r.title}</span>
                      {r.aiStatus === "done" && (
                        <Tip label="AI write-up">
                          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                        </Tip>
                      )}
                      {(r.labels ?? []).slice(0, 2).map((l) => (
                        <span key={l} className="shrink-0 rounded border border-border px-1.5 text-[11px] text-foreground-secondary">
                          {l}
                        </span>
                      ))}
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-xs text-foreground-muted">
                      {r.project && <span className="h-1.5 w-1.5 shrink-0 rounded-[2px]" style={{ background: r.project.color }} />}
                      {r.browserInfo?.source === "widget" && (
                        <span className="shrink-0 rounded bg-sky-500/10 px-1 font-sans text-[10.5px] text-sky-600 dark:text-sky-400">website</span>
                      )}
                      <span className="truncate">{page || "no page"}</span>
                      {errors > 0 && (
                        <span className="shrink-0 text-destructive/80">
                          · {errors} error{errors > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5">
                    <SeverityPill severity={r.severity} />
                  </td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-foreground-secondary">
                      <StatusIcon status={r.status} />
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="py-2.5">
                    {(r.duplicateCount ?? 1) > 1 ? (
                      <Tip label="Same error on the same page">
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-amber-600 dark:text-amber-400">
                          <Layers className="h-3 w-3" />
                          {r.duplicateCount}
                        </span>
                      </Tip>
                    ) : (
                      <span className="text-foreground-muted">·</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    {r.assignee ? (
                      <span className="inline-flex min-w-0 items-center gap-2 text-foreground-secondary">
                        <Avatar name={r.assignee.name} email={r.assignee.email} size={20} />
                        <span className="truncate">{r.assignee.name}</span>
                      </span>
                    ) : (
                      <span className="text-foreground-muted">Unassigned</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-6 text-right text-xs text-foreground-muted">{timeAgo(r.createdAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {project && settings && (
        <ProjectSettingsDialog project={project} open={Boolean(settings)} initialTab={settings} onOpenChange={(o) => !o && setSettings(null)} />
      )}

      {/* Bulk actions */}
      <div
        className={cn(
          "fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-border bg-card py-1.5 pl-4 pr-1.5 shadow-[0_16px_48px_-12px_rgba(0,0,0,.6)] transition-all",
          selected.size ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        )}
        aria-hidden={!selected.size}
      >
        <span className="mr-2 text-sm font-medium">{selected.size} selected</span>
        <Menu>
          <MenuTrigger className={bulkBtn}>
            <User className="h-4 w-4" />
            Assign
          </MenuTrigger>
          <MenuContent side="top">
            <MenuItem onSelect={() => applyBulk({ assigneeId: null }, "Unassigned")}>No one</MenuItem>
            {members.map((m) => (
              <MenuItem key={m.id} onSelect={() => applyBulk({ assigneeId: m.id }, `Assigned to ${m.name}`)}>
                <Avatar name={m.name} email={m.email} size={18} />
                {m.name}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
        <Menu>
          <MenuTrigger className={bulkBtn}>
            <StatusIcon status="IN_PROGRESS" />
            Status
          </MenuTrigger>
          <MenuContent side="top">
            {STATUS_ORDER.map((s) => (
              <MenuItem key={s} onSelect={() => applyBulk({ status: s }, `Moved to ${STATUS_LABEL[s]}`)}>
                <StatusIcon status={s} />
                {STATUS_LABEL[s]}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
        <Menu>
          <MenuTrigger className={bulkBtn}>
            <PriorityIcon priority="high" />
            Priority
          </MenuTrigger>
          <MenuContent side="top">
            {PRIORITY_ORDER.map((p) => (
              <MenuItem key={p} onSelect={() => applyBulk({ priority: p }, `Priority set to ${PRIORITY_LABEL[p]}`)}>
                <PriorityIcon priority={p} />
                {PRIORITY_LABEL[p]}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
        {projects.length > 0 && (
          <Menu>
            <MenuTrigger className={bulkBtn}>Project</MenuTrigger>
            <MenuContent side="top">
              <MenuLabel>Move to project</MenuLabel>
              {projects.map((p) => (
                <MenuItem key={p.id} onSelect={() => applyBulk({ projectId: p.id }, `Moved to ${p.name}`)}>
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: p.color }} />
                  {p.name}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem onSelect={() => applyBulk({ projectId: null }, "Removed from project")}>No project</MenuItem>
            </MenuContent>
          </Menu>
        )}
        <button
          onClick={() => setSelected(new Set())}
          className="ml-1 rounded-lg p-2 text-foreground-muted hover:bg-background-tertiary hover:text-foreground"
          aria-label="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
