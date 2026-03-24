"use client"

import { useState, useEffect } from "react"
import { Play, Clock, HardDrive, Video, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getRecordings, type Recording } from "@/lib/api"

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
  return (bytes / (1024 * 1024)).toFixed(1) + " MB"
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

export default function RecordingsPage() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<Recording | null>(null)

  useEffect(() => {
    async function fetchRecordings() {
      try {
        const data = await getRecordings()
        setRecordings(data)
      } catch (err) {
        setError("Failed to load recordings")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchRecordings()
  }, [])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <p className="text-destructive">{error}</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Recordings</h1>
        <p className="text-foreground-secondary">View all bug reproduction recordings</p>
      </div>

      {recordings.length === 0 ? (
        <div className="text-center py-12">
          <Video className="h-16 w-16 mx-auto text-foreground-muted mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No recordings yet</h3>
          <p className="text-foreground-secondary">
            Start recording bugs using the browser extension
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {recordings.map((recording) => (
            <Card
              key={recording.filename}
              className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedVideo(recording)}
            >
              <div className="relative aspect-video bg-background-tertiary flex items-center justify-center">
                <Video className="h-12 w-12 text-foreground-muted" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-foreground/20">
                  <Button size="icon" className="rounded-full h-14 w-14">
                    <Play className="h-6 w-6" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-4">
                <div>
                  <h3 className="font-medium mb-2 text-foreground truncate">
                    {recording.filename}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-foreground-muted">
                    <span className="flex items-center gap-1">
                      <HardDrive className="h-3 w-3" />
                      {formatFileSize(recording.size)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(recording.createdAt)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Video Modal */}
      {selectedVideo && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="bg-background rounded-lg max-w-4xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-medium text-foreground truncate">
                {selectedVideo.filename}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedVideo(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4">
              <video
                src={selectedVideo.url}
                controls
                autoPlay
                className="w-full rounded-lg"
              />
              <div className="mt-4 flex items-center gap-4 text-sm text-foreground-secondary">
                <span>{formatFileSize(selectedVideo.size)}</span>
                <span>{formatDate(selectedVideo.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
