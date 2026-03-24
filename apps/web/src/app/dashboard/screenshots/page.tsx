"use client"

import { useState, useEffect } from "react"
import { Clock, HardDrive, Image, X, Loader2, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getThumbnails, type Thumbnail } from "@/lib/api"

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

export default function ScreenshotsPage() {
  const [screenshots, setScreenshots] = useState<Thumbnail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<Thumbnail | null>(null)

  useEffect(() => {
    async function fetchScreenshots() {
      try {
        const data = await getThumbnails()
        setScreenshots(data)
      } catch (err) {
        setError("Failed to load screenshots")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchScreenshots()
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
        <h1 className="text-2xl font-bold text-foreground">Screenshots</h1>
        <p className="text-foreground-secondary">View all captured screenshots</p>
      </div>

      {screenshots.length === 0 ? (
        <div className="text-center py-12">
          <Image className="h-16 w-16 mx-auto text-foreground-muted mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No screenshots yet</h3>
          <p className="text-foreground-secondary">
            Screenshots are captured automatically during recordings
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {screenshots.map((screenshot) => (
            <Card
              key={screenshot.filename}
              className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedImage(screenshot)}
            >
              <div className="relative aspect-video bg-background-tertiary">
                <img
                  src={screenshot.url}
                  alt={screenshot.filename}
                  className="w-full h-full object-cover"
                />
              </div>
              <CardContent className="p-4">
                <div>
                  <h3 className="font-medium mb-2 text-foreground truncate text-sm">
                    {screenshot.filename}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-foreground-muted">
                    <span className="flex items-center gap-1">
                      <HardDrive className="h-3 w-3" />
                      {formatFileSize(screenshot.size)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(screenshot.createdAt)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Image Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="bg-background rounded-lg max-w-5xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-medium text-foreground truncate">
                {selectedImage.filename}
              </h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(selectedImage.url, "_blank")}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedImage(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="p-4">
              <img
                src={selectedImage.url}
                alt={selectedImage.filename}
                className="w-full rounded-lg"
              />
              <div className="mt-4 flex items-center gap-4 text-sm text-foreground-secondary">
                <span>{formatFileSize(selectedImage.size)}</span>
                <span>{formatDate(selectedImage.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
