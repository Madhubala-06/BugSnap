"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import * as D from "@radix-ui/react-dialog"
import { Bot, Bug, Circle, FolderPlus, Inbox, LayoutGrid, LogOut, Moon, Search, Settings, User } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { getBugReports, type BugReport } from "@/lib/api"
import { signOut } from "@/lib/auth"
import { bugId, Kbd } from "@/components/kit/bits"
import { useWorkspace } from "./workspace-data"

const group =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-foreground-muted"
const item =
  "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground-secondary data-[selected=true]:bg-background-tertiary data-[selected=true]:text-foreground"

/** ⌘K: jump to any bug or run a command. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const { setNewProjectOpen } = useWorkspace()
  const [reports, setReports] = useState<BugReport[]>([])

  useEffect(() => {
    if (open)
      getBugReports({ limit: 200 })
        .then(setReports)
        .catch(() => undefined)
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  const run = (fn: () => void) => {
    onOpenChange(false)
    fn()
  }

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" />
        <D.Content className="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_64px_-16px_rgba(0,0,0,.6)]">
          <D.Title className="sr-only">Search and commands</D.Title>
          <D.Description className="sr-only">Find a bug report or run a command</D.Description>
          <Command loop label="Search and commands">
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="h-4 w-4 text-foreground-muted" />
              <Command.Input
                autoFocus
                placeholder="Search bugs or type a command…"
                className="h-12 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-foreground-muted"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[52vh] overflow-auto p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-sm text-foreground-muted">Nothing found.</Command.Empty>
              {reports.length > 0 && (
                <Command.Group heading="Bugs" className={group}>
                  {reports.slice(0, 50).map((r) => (
                    <Command.Item
                      key={r.id}
                      value={`${bugId(r.number)} ${r.title} ${r.url ?? ""}`}
                      className={item}
                      onSelect={() => run(() => router.push(`/dashboard/reports/${r.id}`))}
                    >
                      <span className="w-14 shrink-0 font-mono text-xs text-foreground-muted">{bugId(r.number)}</span>
                      <span className="truncate">{r.title}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Go to" className={group}>
                <Command.Item className={item} onSelect={() => run(() => router.push("/dashboard"))}>
                  <LayoutGrid className="h-4 w-4" />
                  Home
                </Command.Item>
                <Command.Item className={item} onSelect={() => run(() => router.push("/dashboard/reports?view=inbox"))}>
                  <Inbox className="h-4 w-4" />
                  Inbox
                </Command.Item>
                <Command.Item className={item} onSelect={() => run(() => router.push("/dashboard/reports?view=mine"))}>
                  <User className="h-4 w-4" />
                  My bugs
                </Command.Item>
                <Command.Item className={item} onSelect={() => run(() => router.push("/dashboard/reports?view=all"))}>
                  <Bug className="h-4 w-4" />
                  All reports
                </Command.Item>
                <Command.Item className={item} onSelect={() => run(() => router.push("/dashboard/settings"))}>
                  <Settings className="h-4 w-4" />
                  Settings
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Actions" className={group}>
                <Command.Item className={item} onSelect={() => run(() => router.push("/dashboard/settings#extension"))}>
                  <Circle className="h-4 w-4" />
                  Record a bug
                </Command.Item>
                <Command.Item className={item} onSelect={() => run(() => setNewProjectOpen(true))}>
                  <FolderPlus className="h-4 w-4" />
                  New project
                </Command.Item>
                <Command.Item className={item} onSelect={() => run(() => router.push("/dashboard/settings#agents"))}>
                  <Bot className="h-4 w-4" />
                  Connect Claude Code or Cursor (MCP)
                </Command.Item>
                <Command.Item className={item} onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>
                  <Moon className="h-4 w-4" />
                  Switch light / dark theme
                </Command.Item>
                <Command.Item className={item} onSelect={() => run(() => signOut())}>
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
