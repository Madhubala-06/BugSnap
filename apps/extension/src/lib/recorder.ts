export interface RecordingResult {
  videoBlob: Blob
  screenshots: Blob[]
  duration: number
}

let mediaRecorder: MediaRecorder | null = null
let recordedChunks: Blob[] = []
let mediaStream: MediaStream | null = null
let screenshotInterval: ReturnType<typeof setInterval> | null = null
let screenshots: Blob[] = []
let videoElement: HTMLVideoElement | null = null
let canvasElement: HTMLCanvasElement | null = null
let startTime = 0
let finished: Promise<RecordingResult> | null = null
let pendingShots: Promise<void>[] = []

const MAX_SCREENSHOTS = 20

/**
 * Starts screen capture. `onEnded` fires when the user stops sharing from
 * Chrome's own "Stop sharing" bar, so the page can still upload the result.
 */
export async function startScreenRecording(onEnded?: () => void): Promise<{ success: boolean; error?: string }> {
  try {
    mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      audio: false,
    })

    videoElement = document.createElement("video")
    videoElement.srcObject = mediaStream
    videoElement.muted = true
    await videoElement.play()
    canvasElement = document.createElement("canvas")

    recordedChunks = []
    screenshots = []
    pendingShots = []
    startTime = Date.now()

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm"
    const recorder = new MediaRecorder(mediaStream, { mimeType, videoBitsPerSecond: 2_500_000 })
    mediaRecorder = recorder

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data)
    }

    // One promise for "recording is over", whoever stopped it.
    finished = new Promise<RecordingResult>((resolve) => {
      recorder.onstop = async () => {
        await Promise.all(pendingShots)
        const duration = Math.floor((Date.now() - startTime) / 1000)
        const videoBlob = new Blob(recordedChunks, { type: "video/webm" })
        mediaStream?.getTracks().forEach((track) => track.stop())
        mediaStream = null
        videoElement = null
        canvasElement = null
        mediaRecorder = null
        resolve({ videoBlob, screenshots: [...screenshots], duration })
      }
    })

    recorder.start(1000)
    screenshotInterval = setInterval(takeScreenshot, 3000)
    setTimeout(takeScreenshot, 500)

    mediaStream.getVideoTracks()[0].onended = () => {
      onEnded?.()
    }

    return { success: true }
  } catch (error) {
    console.error("Failed to start recording:", error)
    const message = error instanceof Error ? error.message : "Failed to start screen recording"
    return {
      success: false,
      error: /Permission denied|NotAllowed/i.test(message) ? "Screen sharing was cancelled." : message,
    }
  }
}

function takeScreenshot(): void {
  if (!videoElement || !canvasElement || !mediaStream) return
  const settings = mediaStream.getVideoTracks()[0]?.getSettings()
  const srcW = settings?.width || videoElement.videoWidth || 1920
  const srcH = settings?.height || videoElement.videoHeight || 1080
  // 1280px wide is plenty for reading a screen, and keeps uploads and AI fast.
  const scale = Math.min(1, 1280 / srcW)
  canvasElement.width = Math.round(srcW * scale)
  canvasElement.height = Math.round(srcH * scale)
  const ctx = canvasElement.getContext("2d")
  if (!ctx) return
  ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height)
  pendingShots.push(
    new Promise<void>((resolve) => {
      canvasElement!.toBlob(
        (blob) => {
          if (blob) {
            screenshots.push(blob)
            // Keep the first frame and the most recent ones (the bug is usually at the end).
            if (screenshots.length > MAX_SCREENSHOTS) screenshots.splice(1, 1)
          }
          resolve()
        },
        "image/jpeg",
        0.85
      )
    })
  )
}

export async function stopScreenRecording(): Promise<RecordingResult | null> {
  if (!finished) return null
  if (screenshotInterval) {
    clearInterval(screenshotInterval)
    screenshotInterval = null
  }
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    takeScreenshot()
    mediaRecorder.stop()
  }
  const result = await finished
  finished = null
  return result
}

export function isRecording(): boolean {
  return mediaRecorder !== null && mediaRecorder.state === "recording"
}

export function getRecordingState(): "inactive" | "recording" | "paused" {
  return mediaRecorder?.state || "inactive"
}
