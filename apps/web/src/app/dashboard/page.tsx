"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Bug, Video, Clock, AlertTriangle, FileText } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  getRecordings,
  getThumbnails,
  getRecentBugReports,
  getGlobalStats,
  type BugReport,
  type Severity,
} from "@/lib/api"

interface DashboardStats {
  totalReports: number
  recordings: number
  screenshots: number
  pending: number
  critical: number
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)

  if (hours < 1) return "Just now"
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`
  return date.toLocaleDateString()
}

function severityToVariant(severity: Severity): "low" | "medium" | "high" | "critical" {
  return severity.toLowerCase() as "low" | "medium" | "high" | "critical"
}

function formatStatus(status: string): string {
  return status.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalReports: 0,
    recordings: 0,
    screenshots: 0,
    pending: 0,
    critical: 0,
  })
  const [recentBugs, setRecentBugs] = useState<BugReport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [recordings, thumbnails, globalStats, recent] = await Promise.all([
          getRecordings(),
          getThumbnails(),
          getGlobalStats().catch(() => ({ total: 0, critical: 0, pending: 0, bySeverity: {}, byStatus: {} })),
          getRecentBugReports(5).catch(() => []),
        ])

        setStats({
          totalReports: globalStats.total,
          recordings: recordings.length,
          screenshots: thumbnails.length,
          pending: globalStats.pending,
          critical: globalStats.critical,
        })
        setRecentBugs(recent)
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const statCards = [
    { name: "Total Reports", value: stats.totalReports, icon: Bug, change: "Bug reports filed" },
    { name: "Recordings", value: stats.recordings, icon: Video, change: "Screen recordings" },
    { name: "Pending Review", value: stats.pending, icon: Clock, change: "Open issues" },
    { name: "Critical Bugs", value: stats.critical, icon: AlertTriangle, change: "Need attention" },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-foreground-secondary">Overview of your bug tracking activity</p>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.name}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground-secondary">{stat.name}</p>
                  <p className="text-3xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-foreground-muted mt-1">{stat.change}</p>
                </div>
                <div className="rounded-full bg-primary-muted p-3">
                  <stat.icon className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Bug Reports</CardTitle>
          <Link
            href="/dashboard/reports"
            className="text-sm text-primary hover:underline"
          >
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-foreground-muted">Loading...</div>
          ) : recentBugs.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-foreground-muted mb-3" />
              <p className="text-foreground-secondary">No bug reports yet</p>
              <p className="text-sm text-foreground-muted">
                Record a bug using the extension to create your first report
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentBugs.map((bug) => (
                <Link
                  key={bug.id}
                  href={`/dashboard/reports/${bug.id}`}
                  className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-background-secondary transition-colors cursor-pointer block"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-sm font-mono text-foreground-muted">
                        {bug.id.slice(0, 8)}
                      </span>
                      <h3 className="font-medium text-foreground">{bug.title}</h3>
                      <p className="text-sm text-foreground-secondary">
                        {bug.reporter?.name || "Anonymous"} &middot; {formatDate(bug.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={severityToVariant(bug.severity)}>
                      {bug.severity.toLowerCase()}
                    </Badge>
                    <span className="text-sm text-foreground-secondary">
                      {formatStatus(bug.status)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
