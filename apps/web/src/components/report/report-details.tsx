"use client"

import { useState } from "react"
import * as Popover from "@radix-ui/react-popover"
import { toast } from "sonner"
import { Plus, Tag, X } from "lucide-react"
import { updateBugReport, type BugReport, type ReportStatus, type Severity } from "@/lib/api"
import { useWorkspace } from "@/components/shell/workspace-data"
import { Menu, MenuCheckItem, MenuContent, MenuSeparator, MenuTrigger } from "@/components/kit/menu"
import { Avatar, notifyReportsChanged, PRIORITY_LABEL, PRIORITY_ORDER, PriorityIcon, SeverityPill, STATUS_LABEL, STATUS_ORDER, StatusIcon } from "@/components/kit/bits"

const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
const field = "disabled:cursor-default disabled:hover:bg-transparent flex min-h-[30px] w-full items-center gap-2 rounded-md px-1.5 text-left text-[13px] text-foreground outline-none hover:bg-background-tertiary focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-background-tertiary"

/** Right-hand details panel. Every field saves as soon as it changes. */
export function ReportDetails({ report, onChange, readOnly }: { report: BugReport; onChange: (r: Partial<BugReport>) => void; readOnly?: boolean }) {
  const { members, projects } = useWorkspace()

  const save = async (patch: Parameters<typeof updateBugReport>[1], local: Partial<BugReport>, message?: string) => {
    const before = { ...report }
    onChange(local)
    try {
      await updateBugReport(report.id, patch)
      notifyReportsChanged()
      if (message) toast.success(message)
    } catch (err) {
      onChange(before)
      toast.error(err instanceof Error ? err.message : "Could not save")
    }
  }

  return (
    <dl className="grid grid-cols-[84px_1fr] items-center gap-x-2 gap-y-0.5">
      <dt className="text-[12.5px] text-foreground-muted">Status</dt>
      <dd>
        <Menu>
          <MenuTrigger disabled={readOnly} className={field}><StatusIcon status={report.status} />{STATUS_LABEL[report.status]}</MenuTrigger>
          <MenuContent>
            {STATUS_ORDER.map((s) => (
              <MenuCheckItem key={s} checked={report.status === s} onSelect={() => save({ status: s as ReportStatus }, { status: s as ReportStatus }, `Status: ${STATUS_LABEL[s]}`)}>
                <StatusIcon status={s} />{STATUS_LABEL[s]}
              </MenuCheckItem>
            ))}
          </MenuContent>
        </Menu>
      </dd>

      <dt className="text-[12.5px] text-foreground-muted">Assignee</dt>
      <dd>
        <Menu>
          <MenuTrigger disabled={readOnly} className={field}>
            {report.assignee ? (
              <><Avatar name={report.assignee.name} email={report.assignee.email} size={20} /><span className="truncate">{report.assignee.name}</span></>
            ) : (
              <span className="text-foreground-muted">Unassigned</span>
            )}
          </MenuTrigger>
          <MenuContent>
            <MenuCheckItem checked={!report.assignee} onSelect={() => save({ assigneeId: null }, { assignee: null, assigneeId: null })}>No one</MenuCheckItem>
            {members.map((m) => (
              <MenuCheckItem key={m.id} checked={report.assignee?.id === m.id} onSelect={() => save({ assigneeId: m.id }, { assignee: m, assigneeId: m.id }, `Assigned to ${m.name}`)}>
                <Avatar name={m.name} email={m.email} size={18} />{m.name}
              </MenuCheckItem>
            ))}
          </MenuContent>
        </Menu>
      </dd>

      <dt className="text-[12.5px] text-foreground-muted">Priority</dt>
      <dd>
        <Menu>
          <MenuTrigger disabled={readOnly} className={field}><PriorityIcon priority={report.priority ?? "none"} />{PRIORITY_LABEL[report.priority ?? "none"]}</MenuTrigger>
          <MenuContent>
            {PRIORITY_ORDER.map((p) => (
              <MenuCheckItem key={p} checked={(report.priority ?? "none") === p} onSelect={() => save({ priority: p }, { priority: p })}>
                <PriorityIcon priority={p} />{PRIORITY_LABEL[p]}
              </MenuCheckItem>
            ))}
          </MenuContent>
        </Menu>
      </dd>

      <dt className="text-[12.5px] text-foreground-muted">Severity</dt>
      <dd>
        <Menu>
          <MenuTrigger disabled={readOnly} className={field}><SeverityPill severity={report.severity} /></MenuTrigger>
          <MenuContent>
            {SEVERITIES.map((s) => (
              <MenuCheckItem key={s} checked={report.severity === s} onSelect={() => save({ severity: s }, { severity: s })}>
                <SeverityPill severity={s} />
              </MenuCheckItem>
            ))}
          </MenuContent>
        </Menu>
      </dd>

      <dt className="self-start pt-1.5 text-[12.5px] text-foreground-muted">Labels</dt>
      <dd><Labels report={report} save={save} readOnly={readOnly} /></dd>

      <dt className="text-[12.5px] text-foreground-muted">Project</dt>
      <dd>
        <Menu>
          <MenuTrigger disabled={readOnly} className={field}>
            {report.project ? (
              <><span className="h-2 w-2 rounded-[2px]" style={{ background: report.project.color }} />{report.project.name}</>
            ) : (
              <span className="text-foreground-muted">{projects.length ? "No project" : "None yet"}</span>
            )}
          </MenuTrigger>
          <MenuContent>
            {projects.map((p) => (
              <MenuCheckItem key={p.id} checked={report.project?.id === p.id} onSelect={() => save({ projectId: p.id }, { project: { id: p.id, name: p.name, color: p.color }, projectId: p.id })}>
                <span className="h-2 w-2 rounded-[2px]" style={{ background: p.color }} />{p.name}
              </MenuCheckItem>
            ))}
            {projects.length > 0 && <MenuSeparator />}
            <MenuCheckItem checked={!report.project} onSelect={() => save({ projectId: null }, { project: null, projectId: null })}>No project</MenuCheckItem>
          </MenuContent>
        </Menu>
      </dd>
    </dl>
  )
}

function Labels({ report, save, readOnly }: { report: BugReport; save: (patch: { labels: string[] }, local: Partial<BugReport>) => Promise<void>; readOnly?: boolean }) {
  const [text, setText] = useState("")
  const labels = report.labels ?? []
  const add = (l: string) => {
    const clean = l.trim().toLowerCase().replace(/\s+/g, "-")
    if (!clean || labels.includes(clean)) return
    const next = [...labels, clean].slice(0, 8)
    save({ labels: next }, { labels: next })
    setText("")
  }
  return (
    <div className="flex min-h-[30px] flex-wrap items-center gap-1 px-1.5 py-1">
      {labels.map((l) => (
        <span key={l} className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 text-[11.5px] text-foreground-secondary">
          {l}
          {!readOnly && <button
            aria-label={`Remove ${l}`}
            onClick={() => {
              const next = labels.filter((x) => x !== l)
              save({ labels: next }, { labels: next })
            }}
            className="text-foreground-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>}
        </span>
      ))}
      {readOnly ? (labels.length ? null : <span className="text-[12px] text-foreground-muted">None</span>) : <Popover.Root>
        <Popover.Trigger className="inline-flex items-center gap-1 rounded-md px-1 text-[12px] text-foreground-muted hover:bg-background-tertiary hover:text-foreground" aria-label="Add label">
          {labels.length ? <Plus className="h-3.5 w-3.5" /> : <><Tag className="h-3.5 w-3.5" />Add label</>}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content sideOffset={6} align="start" className="z-50 w-56 rounded-lg border border-border bg-card p-2 shadow-[0_16px_48px_-12px_rgba(0,0,0,.55)]">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                add(text)
              }}
            >
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="checkout, payments…"
                className="h-8 w-full rounded-md border border-border bg-background-secondary px-2 text-sm outline-none focus:border-primary"
              />
            </form>
            <div className="mt-2 flex flex-wrap gap-1">
              {["checkout", "payments", "login", "ui", "mobile", "regression"].filter((s) => !labels.includes(s)).map((s) => (
                <button key={s} onClick={() => add(s)} className="rounded-md border border-border px-1.5 text-[11.5px] text-foreground-secondary hover:bg-background-tertiary">
                  {s}
                </button>
              ))}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>}
    </div>
  )
}
