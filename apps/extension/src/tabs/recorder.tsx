import { useEffect, useState, useRef } from "react"
import { startScreenRecording, stopScreenRecording, type RecordingResult } from "../lib/recorder"
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

function RecorderPage() {
  const [status, setStatus] = useState<Status>("idle")
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RecordingResult | null>(null)
  const [uploadProgress, setUploadProgress] = useState<string>("")
  const [analysis, setAnalysis] = useState<BugAnalysis | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-start recording when page opens
  useEffect(() => {
    handleStartRecording()
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  // Duration timer
  useEffect(() => {
    if (status === "recording") {
      intervalRef.current = setInterval(() => {
        setDuration((d) => d + 1)
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [status])

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const handleStartRecording = async () => {
    setStatus("requesting")
    setError(null)

    const result = await startScreenRecording()

    if (result.success) {
      setStatus("recording")
      setDuration(0)
      // Notify background script
      chrome.runtime.sendMessage({ type: "START_RECORDING" })
    } else {
      setStatus("error")
      setError(result.error || "Failed to start recording")
    }
  }

  const handleStopRecording = async () => {
    setStatus("stopping")

    const recordingResult = await stopScreenRecording()

    if (recordingResult) {
      setResult(recordingResult)
      setStatus("uploading")

      // Notify background script
      chrome.runtime.sendMessage({ type: "STOP_RECORDING" })

      // Upload to backend
      await uploadRecording(recordingResult)
    } else {
      setStatus("error")
      setError("Failed to stop recording")
    }
  }

  const uploadRecording = async (recording: RecordingResult) => {
    try {
      const apiUrl = "http://localhost:3001"
      const screenshotUrls: string[] = []
      let videoUrl = ""
      let aiAnalysis: BugAnalysis | null = null

      // Upload video
      setUploadProgress("Uploading video...")
      const videoFormData = new FormData()
      videoFormData.append("file", recording.videoBlob, "recording.webm")

      const videoResponse = await fetch(`${apiUrl}/upload/recording`, {
        method: "POST",
        body: videoFormData,
      })

      if (!videoResponse.ok) {
        throw new Error("Failed to upload video")
      }

      const videoData = await videoResponse.json()
      videoUrl = videoData.url
      console.log("Video uploaded:", videoData)

      // Upload screenshots
      for (let i = 0; i < recording.screenshots.length; i++) {
        setUploadProgress(`Uploading screenshot ${i + 1}/${recording.screenshots.length}...`)

        const screenshotFormData = new FormData()
        screenshotFormData.append("file", recording.screenshots[i], `screenshot-${i}.png`)

        const screenshotResponse = await fetch(`${apiUrl}/upload/thumbnail`, {
          method: "POST",
          body: screenshotFormData,
        })

        if (screenshotResponse.ok) {
          const screenshotData = await screenshotResponse.json()
          console.log(`Screenshot ${i + 1} uploaded:`, screenshotData)
          screenshotUrls.push(screenshotData.url)
        }
      }

      // Analyze with AI
      if (screenshotUrls.length > 0) {
        setStatus("analyzing")
        setUploadProgress("Analyzing with AI...")

        try {
          const analyzeResponse = await fetch(`${apiUrl}/ai/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ screenshots: screenshotUrls }),
          })

          if (analyzeResponse.ok) {
            const analyzeData = await analyzeResponse.json()
            if (analyzeData.success && analyzeData.analysis) {
              aiAnalysis = analyzeData.analysis
              setAnalysis(aiAnalysis)
            }
          }
        } catch (aiError) {
          console.log("AI analysis not available:", aiError)
        }
      }

      // Save bug report to database
      setUploadProgress("Saving bug report...")
      try {
        const reportData = {
          title: aiAnalysis?.title || `Bug Report - ${new Date().toLocaleString()}`,
          description: aiAnalysis?.description,
          stepsToReproduce: aiAnalysis?.steps || [],
          severity: (aiAnalysis?.severity?.toUpperCase() || "MEDIUM") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
          aiSummary: aiAnalysis?.description,
          aiSuggestions: aiAnalysis?.suggestions || [],
          recordingUrl: videoUrl,
          screenshotUrls: screenshotUrls,
        }

        const reportResponse = await fetch(`${apiUrl}/reports/quick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reportData),
        })

        if (reportResponse.ok) {
          const report = await reportResponse.json()
          console.log("Bug report saved:", report)
        }
      } catch (reportError) {
        console.error("Failed to save bug report:", reportError)
      }

      setUploadProgress("")
      setStatus("done")
    } catch (err) {
      console.error("Upload error:", err)
      setStatus("error")
      setError(err instanceof Error ? err.message : "Failed to upload")
    }
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
              <p className="hint">Reproduce the bug, then click Stop Recording</p>
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
                  Add OpenAI API key in Settings to enable AI bug analysis
                </p>
              )}

              <button className="close-button" onClick={() => window.close()}>
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
