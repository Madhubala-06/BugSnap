// Hidden page that holds the tab recording. The service worker can't record video, and a
// visible recorder tab gets in the way, so Chrome's "offscreen document" does it instead.
// It only has chrome.runtime, so the sign-in token and API address arrive with each message.
import { uploadFile } from "../lib/upload"

type Msg =
  | { target: "offscreen"; type: "PREPARE"; streamId: string }
  | { target: "offscreen"; type: "GO" }
  | { target: "offscreen"; type: "PAUSE" }
  | { target: "offscreen"; type: "RESUME" }
  | { target: "offscreen"; type: "CANCEL" }
  | { target: "offscreen"; type: "STOP"; apiUrl: string; token: string; reportId: string; durationSec: number }

const MAX_SHOTS = 20
let stream: MediaStream | null = null
let recorder: MediaRecorder | null = null
let chunks: Blob[] = []
let shots: Blob[] = []
let pendingShots: Promise<void>[] = []
let video: HTMLVideoElement | null = null
let canvas: HTMLCanvasElement | null = null
let shotTimer: ReturnType<typeof setInterval> | null = null
let tickTimer: ReturnType<typeof setInterval> | null = null
let finishing = false

const tell = (event: "tick" | "track-ended" | "done" | "error", error?: string) =>
  chrome.runtime.sendMessage({ type: "OFFSCREEN_EVENT", event, error }).catch(() => undefined)

async function prepare(streamId: string) {
  cleanup()
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      // Chrome's tab-capture constraints (not in the standard TS types).
      mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId, maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30 },
    } as unknown as MediaTrackConstraints,
  })
  video = document.createElement("video")
  video.srcObject = stream
  video.muted = true
  await video.play()
  canvas = document.createElement("canvas")
  // The tab closed, or Chrome ended the capture.
  stream.getVideoTracks()[0].addEventListener("ended", () => {
    if (!finishing) setTimeout(() => tell("track-ended"), 100)
  })
}

function go() {
  if (!stream) throw new Error("No stream")
  chunks = []
  shots = []
  pendingShots = []
  finishing = false
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm"
  recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 })
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
  recorder.start(1000)
  setTimeout(shot, 400)
  shotTimer = setInterval(() => recorder?.state === "recording" && shot(), 3000)
  // Also keeps the service worker awake and updates the toolbar timer.
  tickTimer = setInterval(() => tell("tick"), 1000)
}

function shot() {
  if (!video || !canvas || !stream) return
  const w = video.videoWidth || 1280
  const h = video.videoHeight || 720
  const scale = Math.min(1, 1280 / w)
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  pendingShots.push(
    new Promise((resolve) =>
      canvas!.toBlob(
        (blob) => {
          if (blob) {
            shots.push(blob)
            // Keep the first frame and the latest ones: the bug is usually at the end.
            if (shots.length > MAX_SHOTS) shots.splice(1, 1)
          }
          resolve()
        },
        "image/jpeg",
        0.85,
      ),
    ),
  )
}

function stopRecorder(): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!recorder || recorder.state === "inactive") return resolve(null)
    if (recorder.state === "recording") shot()
    recorder.onstop = async () => {
      await Promise.all(pendingShots)
      resolve(new Blob(chunks, { type: "video/webm" }))
    }
    recorder.stop()
  })
}

function cleanup() {
  if (shotTimer) clearInterval(shotTimer)
  if (tickTimer) clearInterval(tickTimer)
  shotTimer = tickTimer = null
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  video = null
  canvas = null
  recorder = null
}

async function stopAndUpload(m: Extract<Msg, { type: "STOP" }>) {
  finishing = true
  const blob = await stopRecorder()
  const capturedShots = [...shots]
  cleanup()
  const fetcher = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    headers.set("Authorization", `Bearer ${m.token}`)
    return fetch(`${m.apiUrl}${path}`, { ...init, headers })
  }
  let recordingUrl: string | undefined
  const screenshotUrls: string[] = []
  let error: string | undefined
  try {
    if (blob && blob.size > 0) recordingUrl = await uploadFile("recording", blob, "recording.webm", fetcher)
    for (let i = 0; i < capturedShots.length; i++) {
      try {
        screenshotUrls.push(await uploadFile("screenshot", capturedShots[i], `screenshot-${i}.jpg`, fetcher))
      } catch {
        // one failed screenshot is fine
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Upload failed"
  }
  const res = await fetcher(`/reports/${m.reportId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recordingUrl, screenshotUrls, duration: m.durationSec, error }),
  }).catch(() => null)
  tell(res?.ok && !error ? "done" : "error", error ?? (res?.ok ? undefined : "Could not attach the recording"))
}

chrome.runtime.onMessage.addListener((message: Msg, _sender, sendResponse) => {
  if (message?.target !== "offscreen") return
  ;(async () => {
    try {
      switch (message.type) {
        case "PREPARE":
          await prepare(message.streamId)
          break
        case "GO":
          go()
          break
        case "PAUSE":
          if (recorder?.state === "recording") recorder.pause()
          break
        case "RESUME":
          if (recorder?.state === "paused") recorder.resume()
          break
        case "CANCEL":
          finishing = true
          if (recorder && recorder.state !== "inactive") recorder.stop()
          cleanup()
          break
        case "STOP":
          // Answer right away; the upload result arrives later as an event.
          sendResponse({ ok: true })
          await stopAndUpload(message)
          return
      }
      sendResponse({ ok: true })
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  })()
  return true
})

export default function Offscreen() {
  return null
}
