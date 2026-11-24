"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Blocks, Bot, Bug, Check, ChevronDown, Inbox, LayoutGrid, LogOut, Moon, Plus, Puzzle, Settings, Sun, User, UserPlus, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMe } from "@/components/auth-gate"
import { useTheme } from "@/components/theme-provider"
import { can, signOut } from "@/lib/auth"
import { createWorkspace, getAiStatus, getBugReports, switchWorkspace, type AiStatus, type BugReport } from "@/lib/api"
import { Dialog, DialogContent } from "@/components/kit/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/kit/menu"
import { Avatar } from "@/components/kit/bits"
import { Tip } from "@/components/kit/tooltip"
import { useWorkspace } from "./workspace-data"

const OPEN = ["OPEN", "IN_PROGRESS", "FIX_READY"]

function NavLink({ href, icon, label, count, active, hot }: { href: string; icon: React.ReactNode; label: string; count?: number; active: boolean; hot?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] transition-colors",
        active ? "bg-background-tertiary text-foreground [&_svg]:text-primary" : "text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={cn("ml-auto font-mono text-[11px]", hot ? "rounded-full bg-primary/15 px-1.5 text-primary" : "text-foreground-muted")}>{count}</span>
      )}
    </Link>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const params = useSearchParams()
  const me = useMe()
  const { projects, setNewProjectOpen } = useWorkspace()
  const { resolvedTheme, setTheme } = useTheme()
  const [reports, setReports] = useState<BugReport[]>([])
  const [ai, setAi] = useState<AiStatus | null>(null)
  const [newWs, setNewWs] = useState(false)
  const [wsName, setWsName] = useState("")

  useEffect(() => {
    const refresh = () => getBugReports({ limit: 500 }).then(setReports).catch(() => undefined)
    refresh()
    getAiStatus().then(setAi).catch(() => undefined)
    window.addEventListener("bugsnap:reports-changed", refresh)
    return () => window.removeEventListener("bugsnap:reports-changed", refresh)
  }, [pathname])

  const onReports = pathname === "/dashboard/reports"
  const view = params.get("view") ?? (params.get("project") ? "" : "all")
  const project = params.get("project")
  const inbox = reports.filter((r) => r.status === "OPEN" && !r.assignee).length
  const mine = reports.filter((r) => r.assignee?.id === me?.id && OPEN.includes(r.status)).length
  const icon = "h-4 w-4 shrink-0"

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <Menu>
        <MenuTrigger className="m-2.5 flex items-center gap-2.5 rounded-lg p-2 text-left outline-none hover:bg-background-tertiary focus-visible:ring-2 focus-visible:ring-ring">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={26} height={26} className="rounded-[7px] shadow-[0_0_16px_-4px_rgba(59,130,246,.8)]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold leading-tight text-foreground">{me?.workspace.name ?? "Workspace"}</span>
            <span className="block text-[11.5px] text-foreground-muted">{me?.workspace.members ?? 1} {me?.workspace.members === 1 ? "member" : "members"} · {me?.role}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-foreground-muted" />
        </MenuTrigger>
        <MenuContent className="w-64">
          <MenuLabel>Workspaces</MenuLabel>
          {(me?.workspaces ?? []).map((w) => (
            <MenuItem
              key={w.id}
              onSelect={async () => {
                if (w.id === me?.workspace.id) return
                await switchWorkspace(w.id)
                window.location.href = "/dashboard"
              }}
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-primary/15 text-[10px] font-semibold text-primary">{w.name.charAt(0).toUpperCase()}</span>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.id === me?.workspace.id ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="text-[11px] text-foreground-muted">{w.role}</span>}
            </MenuItem>
          ))}
          <MenuItem onSelect={() => setNewWs(true)}><Plus className="h-4 w-4" />New workspace</MenuItem>
          <MenuSeparator />
          {can(me, "admin") && (
            <MenuItem asChild>
              <Link href="/dashboard/team?invite=1"><UserPlus className="h-4 w-4" />Invite people</Link>
            </MenuItem>
          )}
          <MenuItem asChild>
            <Link href="/dashboard/settings"><Settings className="h-4 w-4" />Settings</Link>
          </MenuItem>
          <MenuSeparator />
          <MenuLabel>{me?.email}</MenuLabel>
          <MenuItem onSelect={() => signOut()}><LogOut className="h-4 w-4" />Sign out</MenuItem>
        </MenuContent>
      </Menu>

      <Dialog open={newWs} onOpenChange={setNewWs}>
        <DialogContent title="New workspace" description="A separate space with its own people, projects and bugs. Good for a client or another company.">
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                await createWorkspace(wsName)
                window.location.href = "/dashboard/team?invite=1"
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not create it")
              }
            }}
          >
            <Input autoFocus value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="Acme Inc" />
            <Button type="submit" disabled={!wsName.trim()}>Create</Button>
          </form>
        </DialogContent>
      </Dialog>

      <nav className="flex min-h-0 flex-1 flex-col gap-px overflow-auto px-2.5" aria-label="Main">
        <NavLink href="/dashboard" icon={<LayoutGrid className={icon} />} label="Home" active={pathname === "/dashboard"} />
        <NavLink href="/dashboard/reports?view=inbox" icon={<Inbox className={icon} />} label="Inbox" count={inbox} hot active={onReports && view === "inbox"} />
        <NavLink href="/dashboard/reports?view=mine" icon={<User className={icon} />} label="My bugs" count={mine} active={onReports && view === "mine"} />
        <NavLink href="/dashboard/reports?view=all" icon={<Bug className={icon} />} label="All reports" count={reports.length} active={onReports && view === "all" && !project} />

        <div className="mt-4 flex items-center justify-between px-2 pb-1 text-[11px] font-medium text-foreground-muted">
          Projects
          <Tip label="New project">
            <button onClick={() => setNewProjectOpen(true)} className="rounded p-0.5 hover:bg-background-tertiary hover:text-foreground" aria-label="New project">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </Tip>
        </div>
        {projects.length === 0 ? (
          <button onClick={() => setNewProjectOpen(true)} className="rounded-md px-2 py-1.5 text-left text-[12.5px] text-foreground-muted hover:bg-background-tertiary hover:text-foreground-secondary">
            Group bugs by website →
          </button>
        ) : (
          projects.map((p) => (
            <NavLink
              key={p.id}
              href={`/dashboard/reports?project=${p.id}`}
              icon={<span className="ml-0.5 mr-0.5 h-2 w-2 shrink-0 rounded-[2px]" style={{ background: p.color }} />}
              label={p.name}
              count={p.openCount}
              active={onReports && project === p.id}
            />
          ))
        )}

        <div className="mt-4 px-2 pb-1 text-[11px] font-medium text-foreground-muted">Workspace</div>
        <NavLink href="/dashboard/team" icon={<Users className={icon} />} label="Team" count={me?.workspace.members && me.workspace.members > 1 ? me.workspace.members : undefined} active={pathname === "/dashboard/team"} />
        <NavLink href="/dashboard/integrations" icon={<Blocks className={icon} />} label="Integrations" active={pathname === "/dashboard/integrations"} />
        <NavLink href="/dashboard/settings#extension" icon={<Puzzle className={icon} />} label="Chrome extension" active={false} />
        <NavLink href="/dashboard/settings#agents" icon={<Bot className={icon} />} label="AI agents (MCP)" active={false} />
        <NavLink href="/dashboard/settings" icon={<Settings className={icon} />} label="Settings" active={pathname === "/dashboard/settings"} />
      </nav>

      <div className="border-t border-sidebar-border p-3">
        {ai && !ai.key && (
          <Link href="/dashboard/settings" className="mb-3 block rounded-md p-1 hover:bg-background-tertiary">
            <span className="flex justify-between text-[11.5px] text-foreground-muted">
              <span>Free AI write-ups</span>
              <span className="font-mono">{ai.sharedUsed} / {ai.sharedLimit}</span>
            </span>
            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-border">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (ai.sharedUsed / Math.max(1, ai.sharedLimit)) * 100)}%` }} />
            </span>
          </Link>
        )}
        <div className="flex items-center gap-2.5">
          <Avatar name={me?.name} email={me?.email} size={26} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium text-foreground">{me?.name}</span>
            <span className="block truncate text-[11.5px] text-foreground-muted">{me?.email}</span>
          </span>
          <Tip label={resolvedTheme === "dark" ? "Light theme" : "Dark theme"} side="top">
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="rounded-md p-1.5 text-foreground-muted hover:bg-background-tertiary hover:text-foreground"
              aria-label="Switch theme"
            >
              {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </Tip>
        </div>
      </div>
    </aside>
  )
}
