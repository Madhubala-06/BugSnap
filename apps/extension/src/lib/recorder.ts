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
let startTime: number = 0

export async function startScreenRecording(): Promise<{ success: boolean; error?: string }> {
  try {
    // Request screen capture
    mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    })

    // Create video element for screenshots
    videoElement = document.createElement("video")
    videoElement.srcObject = mediaStream
    videoElement.muted = true
    await videoElement.play()

    // Create canvas for screenshots
    canvasElement = document.createElement("canvas")

    // Start recording
    recordedChunks = []
    screenshots = []
    startTime = Date.now()

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm"

    mediaRecorder = new MediaRecorder(mediaStream, {
      mimeType,
      videoBitsPerSecond: 2500000,
    })

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data)
      }
    }

    mediaRecorder.start(1000) // Collect data every second

    // Take screenshots every 3 seconds
    screenshotInterval = setInterval(() => {
      takeScreenshot()
    }, 3000)

    // Take initial screenshot
    setTimeout(takeScreenshot, 500)

    // Handle stream end (user clicks "Stop sharing")
    mediaStream.getVideoTracks()[0].onended = () => {
      stopScreenRecording()
    }

    return { success: true }
  } catch (error) {
    console.error("Failed to start recording:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to start screen recording",
    }
  }
}

function takeScreenshot(): void {
  if (!videoElement || !canvasElement || !mediaStream) return

  const track = mediaStream.getVideoTracks()[0]
  const settings = track.getSettings()

  canvasElement.width = settings.width || 1920
  canvasElement.height = settings.height || 1080

  const ctx = canvasElement.getContext("2d")
  if (!ctx) return

  ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height)

  canvasElement.toBlob(
    (blob) => {
      if (blob) {
        screenshots.push(blob)
      }
    },
    "image/png",
    0.9
  )
}

export async function stopScreenRecording(): Promise<RecordingResult | null> {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      resolve(null)
      return
    }

    // Clear screenshot interval
    if (screenshotInterval) {
      clearInterval(screenshotInterval)
      screenshotInterval = null
    }

    // Take final screenshot
    takeScreenshot()

    mediaRecorder.onstop = () => {
      const duration = Math.floor((Date.now() - startTime) / 1000)
      const videoBlob = new Blob(recordedChunks, { type: "video/webm" })

      // Stop all tracks
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop())
        mediaStream = null
      }

      // Cleanup
      videoElement = null
      canvasElement = null
      mediaRecorder = null

      resolve({
        videoBlob,
        screenshots: [...screenshots],
        duration,
      })
    }

    mediaRecorder.stop()
  })
}

export function isRecording(): boolean {
  return mediaRecorder !== null && mediaRecorder.state === "recording"
}

export function getRecordingState(): "inactive" | "recording" | "paused" {
  return mediaRecorder?.state || "inactive"
}
