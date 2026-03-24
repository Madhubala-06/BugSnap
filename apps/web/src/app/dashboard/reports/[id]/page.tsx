"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  Video,
  Image,
  Terminal,
  Globe,
  Loader2,
  Clock,
  User,
  Sparkles,
  Save,
  Check,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RichTextEditor } from "@/components/editor/rich-text-editor"
import { ImageEditor } from "@/components/editor/image-editor"
import {
  getBugReport,
  updateBugReportStatus,
  updateBugReport,
  deleteBugReport,
  type BugReport,
  type Severity,
  type ReportStatus,
} from "@/lib/api"

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function severityToVariant(severity: Severity): "low" | "medium" | "high" | "critical" {
  return severity.toLowerCase() as "low" | "medium" | "high" | "critical"
}

const statusOptions: ReportStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "WONT_FIX"]

export default function BugReportDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [report, setReport] = useState<BugReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [selectedImage, setSelectedImage] = useState<{ url: string; index: number } | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const id = params.id as string

  useEffect(() => {
    async function fetchReport() {
      try {
        const data = await getBugReport(id)
        setReport(data)
        setTitle(data.title)
        setDescription(data.description || "")
      } catch (err) {
        console.error("Failed to fetch report:", err)
      } finally {
        setLoading(false)
      }
    }
    if (id) fetchReport()
  }, [id])

  const handleStatusChange = async (newStatus: ReportStatus) => {
    if (!report) return
    setUpdating(true)
    try {
      const updated = await updateBugReportStatus(report.id, newStatus)
      setReport({ ...report, status: updated.status })
    } catch (err) {
      console.error("Failed to update status:", err)
    } finally {
      setUpdating(false)
    }
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
    setHasChanges(true)
    setSaved(false)
  }

  const handleDescriptionChange = (content: string) => {
    setDescription(content)
    setHasChanges(true)
    setSaved(false)
  }

  const handleSave = useCallback(async () => {
    if (!report || !hasChanges) return
    setSaving(true)
    try {
      await updateBugReport(report.id, { title, description })
      setReport({ ...report, title, description })
      setHasChanges(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error("Failed to save:", err)
    } finally {
      setSaving(false)
    }
  }, [report, title, description, hasChanges])

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleSave])

  const handleDelete = async () => {
    if (!report) return
    setDeleting(true)
    try {
      await deleteBugReport(report.id)
      router.push("/dashboard/reports")
    } catch (err) {
      console.error("Failed to delete:", err)
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="p-8">
        <p className="text-foreground-secondary">Bug report not found</p>
      </div>
    )
  }

  const recordingUrl = report.browserInfo?.recordingUrl || report.session?.recording?.url
  const screenshotUrls = report.browserInfo?.screenshotUrls || []
  const logs = report.session?.logs || []

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/reports")}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Reports
        </Button>

        <div className="flex items-start justify-between">
          <div className="flex-1 mr-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="font-mono text-sm text-foreground-muted">{report.id.slice(0, 8)}</span>
              <Badge variant={severityToVariant(report.severity)}>{report.severity.toLowerCase()}</Badge>
            </div>
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              className="text-2xl font-bold text-foreground bg-transparent border-none outline-none w-full focus:ring-0 p-0"
              placeholder="Bug title..."
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={saving || !hasChanges}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </>
              )}
            </Button>
            <select
              value={report.status}
              onChange={(e) => handleStatusChange(e.target.value as ReportStatus)}
              disabled={updating}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status.replace("_", " ")}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-4 text-sm text-foreground-secondary">
          <span className="flex items-center gap-1">
            <User className="h-4 w-4" />
            {report.reporter?.name || "Anonymous"}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {formatDate(report.createdAt)}
          </span>
          {report.url && (
            <a
              href={report.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <Globe className="h-4 w-4" />
              {new URL(report.url).hostname}
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Generated Summary */}
          {report.aiSummary && (
            <div className="bg-gradient-to-r from-primary/10 to-purple-500/10 border border-primary/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">AI Generated Summary</span>
              </div>
              <p className="text-foreground-secondary text-sm">{report.aiSummary}</p>
            </div>
          )}

          {/* Rich Text Editor */}
          <div>
            <label className="text-sm font-medium text-foreground-secondary mb-2 block">
              Description
            </label>
            <RichTextEditor
              content={description}
              onChange={handleDescriptionChange}
              placeholder="Describe the bug in detail... Use formatting to make it clear."
            />
          </div>

          {/* Recording */}
          {recordingUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Video className="h-5 w-5" />
                  Recording
                </CardTitle>
              </CardHeader>
              <CardContent>
                <video
                  src={recordingUrl}
                  controls
                  className="w-full rounded-lg bg-black"
                  style={{ maxHeight: "400px" }}
                />
              </CardContent>
            </Card>
          )}

          {/* Screenshots */}
          {screenshotUrls.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Image className="h-5 w-5" />
                  Screenshots ({screenshotUrls.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {screenshotUrls.map((url, index) => (
                    <img
                      key={index}
                      src={url}
                      alt={`Screenshot ${index + 1}`}
                      className="rounded-lg border border-border cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setSelectedImage({ url, index })}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Console Logs */}
          {logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Console Logs ({logs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-900 rounded-lg p-4 max-h-80 overflow-auto font-mono text-sm">
                  {logs.map((log, index) => (
                    <div
                      key={index}
                      className={`py-1 ${
                        log.level === "error"
                          ? "text-red-400"
                          : log.level === "warn"
                          ? "text-yellow-400"
                          : "text-gray-300"
                      }`}
                    >
                      <span className="text-gray-500">[{log.type}]</span> {log.message}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* AI Insights */}
          {(report.aiRootCause || (report.aiSuggestions && report.aiSuggestions.length > 0)) && (
            <Card className="bg-primary-muted/50 border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-primary">
                  <Sparkles className="h-5 w-5" />
                  AI Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {report.aiRootCause && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-1">Root Cause</h4>
                    <p className="text-foreground-secondary text-sm">{report.aiRootCause}</p>
                  </div>
                )}

                {report.aiSuggestions && report.aiSuggestions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-1">Suggestions</h4>
                    <ul className="list-disc list-inside text-foreground-secondary text-sm space-y-1">
                      {report.aiSuggestions.map((suggestion, i) => (
                        <li key={i}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Steps to Reproduce */}
          {report.stepsToReproduce && report.stepsToReproduce.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Steps to Reproduce</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal list-inside text-foreground-secondary text-sm space-y-2">
                  {report.stepsToReproduce.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          {/* Expected vs Actual */}
          {(report.expectedResult || report.actualResult) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Expected vs Actual</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {report.expectedResult && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-1">Expected</h4>
                    <p className="text-foreground-secondary text-sm">{report.expectedResult}</p>
                  </div>
                )}
                {report.actualResult && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-1">Actual</h4>
                    <p className="text-foreground-secondary text-sm">{report.actualResult}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Image Editor Modal */}
      {selectedImage && (
        <ImageEditor
          imageUrl={selectedImage.url}
          onClose={() => setSelectedImage(null)}
          onSave={(dataUrl) => {
            if (report?.browserInfo?.screenshotUrls) {
              const newUrls = [...report.browserInfo.screenshotUrls]
              newUrls[selectedImage.index] = dataUrl
              setReport({
                ...report,
                browserInfo: {
                  ...report.browserInfo,
                  screenshotUrls: newUrls,
                },
              })
              setHasChanges(true)
            }
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-foreground mb-2">Delete Bug Report</h3>
            <p className="text-foreground-secondary mb-6">
              Are you sure you want to delete this bug report? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
