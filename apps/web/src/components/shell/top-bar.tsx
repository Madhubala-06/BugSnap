"use client"

import { Fragment, useState } from "react"
import Link from "next/link"
import { CircleDot, Search } from "lucide-react"
import { Kbd } from "@/components/kit/bits"
import { Dialog, DialogContent } from "@/components/kit/dialog"
import { CommandPalette } from "./command-palette"
import { useWorkspace } from "./workspace-data"
import { useMe } from "@/components/auth-gate"

export function TopBar() {
  const { crumbs } = useWorkspace()
  const me = useMe()
  const [palette, setPalette] = useState(false)
  const [recordHelp, setRecordHelp] = useState(false)

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border px-5">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[13.5px] text-foreground-muted">
        <span className="truncate">{me?.workspace.name}</span>
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            <span>/</span>
            {c.href && i < crumbs.length - 1 ? (
              <Link href={c.href} className={`truncate text-foreground-secondary hover:text-foreground ${c.mono ? "font-mono" : ""}`}>
                {c.label}
              </Link>
            ) : (
              <span className={`truncate font-medium text-foreground ${c.mono ? "font-mono" : ""}`}>{c.label}</span>
            )}
          </Fragment>
        ))}
      </nav>

      <button
        onClick={() => setPalette(true)}
        className="ml-auto flex h-8 w-64 items-center gap-2 rounded-lg border border-border bg-background-secondary px-2.5 text-[13px] text-foreground-muted hover:border-border-hover"
      >
        <Search className="h-4 w-4" />
        Search or jump to…
        <Kbd className="ml-auto">⌘K</Kbd>
      </button>
      <button
        onClick={() => setRecordHelp(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.15)] hover:bg-primary-hover"
      >
        <CircleDot className="h-4 w-4" />
        Record bug
      </button>

      <CommandPalette open={palette} onOpenChange={setPalette} />
      <Dialog open={recordHelp} onOpenChange={setRecordHelp}>
        <DialogContent title="Record a bug" description="Bugs are recorded with the BugSnap Chrome extension, right on the page where they happen.">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground-secondary">
            <li>Open the page with the bug in Chrome.</li>
            <li>
              Click the BugSnap icon in the toolbar and press <b className="text-foreground">Start recording</b>.
            </li>
            <li>
              Show the bug, then press <b className="text-foreground">Stop</b>. The report appears here with the video, errors and AI write-up.
            </li>
          </ol>
          <div className="mt-5 flex justify-end gap-2">
            <Link
              href="/dashboard/settings#extension"
              onClick={() => setRecordHelp(false)}
              className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm hover:bg-background-tertiary"
            >
              Get the extension
            </Link>
            <Link
              href="/r/demo"
              target="_blank"
              className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
            >
              See an example report
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  )
}
