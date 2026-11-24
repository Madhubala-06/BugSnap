import { useEffect, useState, useRef, useCallback } from "react"
import { startScreenRecording, stopScreenRecording, type RecordingResult } from "../lib/recorder"
import { getConfig } from "../lib/storage"
import { apiFetch, getAuth } from "../lib/auth"
import { uploadFile } from "../lib/upload"
import type { RecordingSession } from "../lib/types"
import "../styles/recorder.css"
import logoUrl from "data-base64:~assets/icon.png"

type Status = "idle" | "requesting" | "recording" | "stopping" | "uploading" | "analyzing" | "done" | "error"

interface BugAnalysis {
  title: string
  description: string
  severity: "low" | "medium" | "high" | "critical"
  steps: string[]
  suggestions: string[]
  rootCause?: string
  affectedArea?: string
}

const targetTabId = Number(new URLSearchParams(location.search).get("tabId")) || undefined

function RecorderPage() {
  const [status, setStatus] = useState<Status>("idle")
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RecordingResult | null>(null)
  const [uploadProgress, setUploadProgress] = useState<string>("")
  const [analysis, setAnalysis] = useState<BugAnalysis | null>(null)
  const [aiNote, setAiNote] = useState<string | null>(null)
  const [reportLink, setReportLink] = useState<string | null>(null)
  const [logCount, setLogCount] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stoppingRef = useRef(false)
  const recordingStartedAt = useRef<number | null>(null)

  const uploadRecording = useCallback(async (recording: RecordingResult, session: RecordingSession | null) => {
    try {
      const { appUrl } = await getConfig()

      setUploadProgress("Uploading video...")
      const recordingUrl = await uploadFile("recording", recording.videoBlob, "recording.webm")

      const screenshotUrls: string[] = []
      for (let i = 0; i < recording.screenshots.length; i++) {
        setUploadProgress(`Uploading screenshot ${i + 1}/${recording.screenshots.length}...`)
        try {
          screenshotUrls.push(await uploadFile("screenshot", recording.screenshots[i], `screenshot-${i}.jpg`))
        } catch (shotError) {
          console.warn("Screenshot upload failed", shotError)
        }
      }

      // One call: the server saves the report and runs the AI on
      // screenshots + console/network logs + clicks + page info.
      setStatus("analyzing")
      setUploadProgress("Writing the bug report...")
      const logs = session?.logs ?? []
      setLogCount(logs.length)
      const res = await apiFetch("/reports/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordingUrl,
          screenshotUrls,
          duration: recording.duration,
          page: session?.metadata,
          logs,
          droppedLogs: session?.droppedLogs ?? 0,
          startedAt: recordingStartedAt.current ?? session?.startTime,
          analyze: true,
        }),
      })
      if (!res.ok) throw new Error(`Saving the report failed (${res.status})`)
      const report = await res.json()
      if (report.analysis) setAnalysis(report.analysis)
      else if (report.aiStatus === "pending") setAiNote("Saved. The AI is writing the report now; it will appear on the report page in about a minute.")
      else setAiNote(report.aiError || null)
      if (report.id) setReportLink(`${appUrl}/dashboard/reports/${report.id}`)

      setUploadProgress("")
      setStatus("done")
    } catch (err) {
      console.error("Upload error:", err)
      setStatus("error")
      setError(err instanceof Error ? err.message : "Failed to upload")
    }
  }, [])

  const handleStopRecording = useCallback(async () => {
    if (stoppingRef.current) return
    stoppingRef.current = true
    setStatus("stopping")
    const recordingResult = await stopScreenRecording()
    const stop = await chrome.runtime.sendMessage({ type: "STOP_RECORDING" }).catch(() => null)
    if (!recordingResult) {
      setStatus("error")
      setError("Failed to stop recording")
      return
    }
    setResult(recordingResult)
    setStatus("uploading")
    await uploadRecording(recordingResult, stop?.session ?? null)
  }, [uploadRecording])

  const handleStartRecording = useCallback(async () => {
    setError(null)
    if (!(await getAuth())) {
      setStatus("error")
      setError("Please sign in first: click the BugSnap icon in the toolbar.")
      return
    }
    setStatus("requesting")
    stoppingRef.current = false
    // "Stop sharing" in Chrome's bar ends the recording the same way as our button.
    const started = await startScreenRecording(() => handleStopRecording())
    if (started.success) {
      recordingStartedAt.current = Date.now()
      setStatus("recording")
      setDuration(0)
      await chrome.runtime.sendMessage({ type: "START_RECORDING", targetTabId })
      // Send the user back to the page with the bug.
      if (targetTabId) chrome.tabs.update(targetTabId, { active: true }).catch(() => undefined)
    } else {
      setStatus("error")
      setError(started.error || "Failed to start recording")
    }
  }, [handleStopRecording])

  // Auto-start when the page opens
  useEffect(() => {
    handleStartRecording()
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Stop pressed in the popup
  useEffect(() => {
    const listener = (message: { type?: string }) => {
      if (message?.type === "STOP_RECORDING") handleStopRecording()
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [handleStopRecording])

  // Duration timer
  useEffect(() => {
    if (status !== "recording") return
    intervalRef.current = setInterval(() => setDuration((d) => d + 1), 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [status])

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="recorder-page">
      <div className="recorder-container">
        <div className="recorder-header">
          <img className="recorder-icon" src={logoUrl} alt="" />
          <h1>BugSnap</h1>
        </div>

        <div className="recorder-content">
          {status === "requesting" && (
            <div className="status-message">
              <div className="spinner" />
              <p>Requesting screen access...</p>
              <p className="hint">Please select a screen or window to share</p>
            </div>
          )}

          {status === "recording" && (
            <div className="recording-status">
              <div className="recording-indicator">
                <span className="pulse-dot" />
                <span>Recording</span>
              </div>
              <div className="duration">{formatDuration(duration)}</div>
              <button className="stop-button" onClick={handleStopRecording}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
                Stop Recording
              </button>
              <p className="hint">Go back to your tab and reproduce the bug. Then stop here, from the BugSnap icon, or with the Chrome &quot;Stop sharing&quot; bar.</p>
            </div>
          )}

          {status === "stopping" && (
            <div className="status-message">
              <div className="spinner" />
              <p>Processing recording...</p>
            </div>
          )}

          {(status === "uploading" || status === "analyzing") && (
            <div className="status-message">
              <div className="spinner" />
              <p>{status === "analyzing" ? "Analyzing..." : "Uploading..."}</p>
              {uploadProgress && <p className="progress">{uploadProgress}</p>}
            </div>
          )}

          {status === "done" && result && (
            <div className="done-status">
              <svg className="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <h2>Recording Complete!</h2>
              <div className="stats">
                <p>Duration: {formatDuration(result.duration)}</p>
                <p>Video size: {(result.videoBlob.size / 1024 / 1024).toFixed(2)} MB</p>
                <p>Screenshots: {result.screenshots.length}</p>
                <p>Logs captured: {logCount}</p>
              </div>

              {analysis && (
                <div className="ai-analysis">
                  <h3>AI Bug Report</h3>
                  <div className="analysis-content">
                    <div className="analysis-header">
                      <span className={`severity-badge severity-${analysis.severity}`}>
                        {analysis.severity}
                      </span>
                      <div>
                        <strong>{analysis.title}</strong>
                        {analysis.affectedArea && (
                          <span className="affected-area">in {analysis.affectedArea}</span>
                        )}
                      </div>
                    </div>
                    <p className="analysis-description">{analysis.description}</p>
                    {analysis.steps.length > 0 && (
                      <div className="analysis-steps">
                        <strong>Steps to Reproduce:</strong>
                        <ol>
                          {analysis.steps.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {analysis.rootCause && (
                      <div className="analysis-root-cause">
                        <strong>Root Cause:</strong>
                        <p>{analysis.rootCause}</p>
                      </div>
                    )}
                    {analysis.suggestions.length > 0 && (
                      <div className="analysis-suggestions">
                        <strong>Suggestions:</strong>
                        <ul>
                          {analysis.suggestions.map((suggestion, i) => (
                            <li key={i}>{suggestion}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!analysis && (
                <p className="no-analysis">
                  {aiNote || "Report saved. Add a Gemini API key in Settings to get an AI write-up."}
                </p>
              )}

              {reportLink && (
                <a className="close-button" href={reportLink} target="_blank" rel="noreferrer">
                  Open report
                </a>
              )}
              <button className="close-button secondary" onClick={() => window.close()}>
                Close Window
              </button>
            </div>
          )}

          {status === "error" && (
            <div className="error-status">
              <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" d="M15 9l-6 6M9 9l6 6" />
              </svg>
              <h2>Error</h2>
              <p>{error}</p>
              <button className="retry-button" onClick={handleStartRecording}>
                Try Again
              </button>
            </div>
          )}

          {status === "idle" && (
            <div className="status-message">
              <p>Initializing...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default RecorderPage
