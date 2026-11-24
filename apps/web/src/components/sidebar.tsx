"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Bug,
  LayoutDashboard,
  Settings,
  Search,
  Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./ui/button"
import { ThemeToggle } from "./theme-toggle"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Bug Reports", href: "/dashboard/reports", icon: Bug },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={28} height={28} className="rounded-[7px] shadow-[0_0_18px_-4px_rgba(59,130,246,.7)]" />
          <span className="text-lg font-semibold tracking-tight text-sidebar-foreground">BugSnap</span>
        </Link>
      </div>

      <div className="p-4">
        <Button className="w-full gap-2">
          <Plus className="h-4 w-4" />
          New Report
        </Button>
      </div>

      <div className="px-4 pb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
          <input
            type="text"
            placeholder="Search bugs..."
            className="w-full rounded-md border border-border bg-background-secondary py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-active text-primary"
                  : "text-sidebar-foreground hover:bg-background-secondary"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-muted text-sm font-medium text-primary">
              L
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-sidebar-foreground">Local workspace</p>
              <p className="text-xs text-foreground-muted">Not signed in yet</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}
