"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Filter, Download, MoreVertical, FileText, Loader2, Video, Image } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  getBugReports,
  type BugReport,
  type Severity,
  type ReportStatus,
} from "@/lib/api"

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function severityToVariant(severity: Severity): "low" | "medium" | "high" | "critical" {
  return severity.toLowerCase() as "low" | "medium" | "high" | "critical"
}

function formatStatus(status: string): string {
  return status.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function ReportsPage() {
  const router = useRouter()
  const [bugReports, setBugReports] = useState<BugReport[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [severityFilter, setSeverityFilter] = useState<string>("")
  const [search, setSearch] = useState("")

  useEffect(() => {
    async function fetchReports() {
      try {
        const reports = await getBugReports({
          status: statusFilter as ReportStatus || undefined,
          severity: severityFilter as Severity || undefined,
        })
        setBugReports(reports)
      } catch (err) {
        console.error("Failed to fetch reports:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchReports()
  }, [statusFilter, severityFilter])

  const hasMedia = (bug: BugReport) => {
    return bug.browserInfo?.recordingUrl ||
           (bug.browserInfo?.screenshotUrls && bug.browserInfo.screenshotUrls.length > 0) ||
           bug.session?.recording
  }

  const filteredReports = bugReports.filter((bug) =>
    search ? bug.title.toLowerCase().includes(search.toLowerCase()) : true
  )
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bug Reports</h1>
          <p className="text-foreground-secondary">View and manage all reported bugs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="mb-6 flex gap-4">
        <Input
          placeholder="Search reports..."
          className="max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
        >
          <option value="">All Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {filteredReports.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="h-16 w-16 mx-auto text-foreground-muted mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No bug reports yet</h3>
          <p className="text-foreground-secondary">
            Record bugs using the browser extension to create reports
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReports.map((bug) => (
            <Card
              key={bug.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push(`/dashboard/reports/${bug.id}`)}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-sm text-foreground-muted">{bug.id.slice(0, 8)}</span>
                      <Badge variant={severityToVariant(bug.severity)}>{bug.severity.toLowerCase()}</Badge>
                      <span className="text-sm text-foreground-secondary">{formatStatus(bug.status)}</span>
                      {hasMedia(bug) && (
                        <div className="flex items-center gap-1 text-foreground-muted">
                          {(bug.browserInfo?.recordingUrl || bug.session?.recording) && (
                            <Video className="h-4 w-4" />
                          )}
                          {bug.browserInfo?.screenshotUrls && bug.browserInfo.screenshotUrls.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Image className="h-4 w-4" />
                              <span className="text-xs">{bug.browserInfo.screenshotUrls.length}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold mb-2 text-foreground">{bug.title}</h3>
                    {bug.description && (
                      <p className="text-foreground-secondary mb-4 line-clamp-2">{bug.description}</p>
                    )}

                    {bug.aiSummary && (
                      <div className="mb-4 p-3 bg-primary-muted rounded-lg">
                        <span className="text-xs font-medium text-primary">AI Analysis</span>
                        <p className="text-sm text-foreground mt-1 line-clamp-2">{bug.aiSummary}</p>
                      </div>
                    )}

                    <div className="mt-4 flex items-center gap-4 text-sm text-foreground-secondary">
                      <span>Reporter: {bug.reporter?.name || "Anonymous"}</span>
                      <span>Created: {formatDate(bug.createdAt)}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
