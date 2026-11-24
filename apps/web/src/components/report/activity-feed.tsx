"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Sparkles } from "lucide-react"
import { addComment, getActivity, type ActivityItem } from "@/lib/api"
import { useWorkspace } from "@/components/shell/workspace-data"
import { Avatar, Kbd, PRIORITY_LABEL, STATUS_LABEL, timeAgo } from "@/components/kit/bits"

function describe(item: ActivityItem, memberName: (id?: unknown) => string): string {
  const d = (item.data ?? {}) as Record<string, unknown>
  switch (item.kind) {
    case "created":
      return d.source === "widget" ? "reported it from the website" : "recorded the bug"
    case "ai_done":
      return `wrote the report${d.severity ? ` and set severity to ${String(d.severity)}` : ""}`
    case "ai_failed":
      return typeof d.error === "string" && /key/i.test(d.error) ? "could not write the report (no AI key)" : "could not write the report yet (AI busy)"
    case "status":
      return `moved it to ${STATUS_LABEL[String(d.to)] ?? String(d.to)}`
    case "assignee":
      return d.to ? `assigned it to ${memberName(d.to)}` : "removed the assignee"
    case "priority":
      return `set priority to ${PRIORITY_LABEL[String(d.to)] ?? String(d.to)}`
    case "severity":
      return `set severity to ${String(d.to).toLowerCase()}`
    case "labels":
      return Array.isArray(d.to) && d.to.length ? `set labels: ${(d.to as string[]).join(", ")}` : "removed the labels"
    case "project":
      return "moved it to another project"
    case "title":
      return "renamed it"
    case "shared":
      return "created a share link"
    case "unshared":
      return "stopped sharing"
    default:
      return item.kind ?? "updated it"
  }
}

/** Activity history plus comments, newest last. */
export function ActivityFeed({ reportId, refreshKey }: { reportId: string; refreshKey?: unknown }) {
  const { members } = useWorkspace()
  const [items, setItems] = useState<ActivityItem[] | null>(null)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    getActivity(reportId).then(setItems).catch(() => setItems([]))
  }, [reportId])
  useEffect(load, [load, refreshKey])

  const memberName = (id?: unknown) => members.find((m) => m.id === id)?.name ?? "someone"

  const post = async () => {
    if (!text.trim()) return
    setBusy(true)
    try {
      await addComment(reportId, text)
      setText("")
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {items === null ? (
        <div className="h-16 animate-pulse rounded-lg bg-background-tertiary/40" />
      ) : (
        <ol className="space-y-3">
          {items.map((item) =>
            item.type === "comment" ? (
              <li key={item.id} className="flex gap-2.5">
                <Avatar name={item.actor?.name} email={item.actor?.email} size={20} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px]">
                    <b className="font-medium text-foreground">{item.actor?.name}</b>
                    <span className="text-foreground-muted"> · {timeAgo(item.createdAt)}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] text-foreground">
                    {item.body?.split(/(@\w+)/g).map((part, i) => (part.startsWith("@") ? <span key={i} className="text-primary">{part}</span> : part))}
                  </p>
                </div>
              </li>
            ) : (
              <li key={item.id} className="flex items-start gap-2.5 text-[12.5px] text-foreground-secondary">
                {item.actor ? (
                  <Avatar name={item.actor.name} email={item.actor.email} size={20} />
                ) : item.kind === "created" ? (
                  <Avatar name={String((item.data as Record<string, unknown> | null)?.email ?? "Visitor")} email={String((item.data as Record<string, unknown> | null)?.email ?? "visitor")} size={20} />
                ) : (
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"><Sparkles className="h-3 w-3" /></span>
                )}
                <span className="pt-0.5">
                  <b className="font-medium text-foreground">
                    {item.actor?.name ?? (item.kind === "created" ? String((item.data as Record<string, unknown> | null)?.email ?? "A website visitor") : "BugSnap AI")}
                  </b>{" "}
                  {describe(item, memberName)}
                  <span className="text-foreground-muted"> · {timeAgo(item.createdAt)}</span>
                </span>
              </li>
            )
          )}
        </ol>
      )}
      <div className="mt-3 rounded-lg border border-border bg-card focus-within:border-primary">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") post()
          }}
          rows={2}
          placeholder="Leave a comment… use @ to mention"
          aria-label="Comment"
          className="block w-full resize-none bg-transparent px-2.5 py-2 text-[13px] outline-none placeholder:text-foreground-muted"
        />
        <div className="flex items-center justify-end gap-2 px-2 pb-2">
          <Kbd>⌘↵</Kbd>
          <button
            onClick={post}
            disabled={busy || !text.trim()}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[12.5px] font-medium text-primary-foreground disabled:opacity-40"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Comment
          </button>
        </div>
      </div>
    </div>
  )
}
