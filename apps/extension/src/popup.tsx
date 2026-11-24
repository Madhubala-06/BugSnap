import { useEffect, useState } from "react"
import type { RecordingState } from "./lib/types"
import "../style.css"
import logoUrl from "data-base64:~assets/icon.png"

function Popup() {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    session: null,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)

  // Get current status on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }).then((response) => {
      if (response?.state) {
        setState(response.state)
      }
    })
  }, [])

  // Update duration timer
  useEffect(() => {
    if (!state.isRecording || !state.session?.startTime) {
      setDuration(0)
      return
    }

    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - state.session!.startTime!) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [state.isRecording, state.session?.startTime])

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const handleStartRecording = async () => {
    setLoading(true)
    setError(null)

    try {
      // Open the recorder tab for screen capture
      const recorderUrl = chrome.runtime.getURL("tabs/recorder.html")
      await chrome.tabs.create({ url: recorderUrl })

      // Close popup - recording will happen in the new tab
      window.close()
    } catch (err) {
      setError("Failed to open recorder")
      setLoading(false)
    }
  }

  const handleStopRecording = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await chrome.runtime.sendMessage({ type: "STOP_RECORDING" })
      if (response?.success) {
        setState({ isRecording: false, session: response.session })
      } else {
        setError(response?.error || "Failed to stop recording")
      }
    } catch (err) {
      setError("Failed to stop recording")
    } finally {
      setLoading(false)
    }
  }

  const logsCount = state.session?.logs?.length || 0

  return (
    <div className="w-80 bg-[#111113] text-[#ededef]">
      {/* Header */}
      <div className="bg-[#141416] border-b border-[#232327] px-4 py-3">
        <div className="flex items-center gap-2">
          <img src={logoUrl} alt="" className="w-7 h-7 rounded-md shadow-[0_0_14px_-3px_rgba(59,130,246,.8)]" />
          <h1 className="text-lg font-semibold text-white">BugSnap</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Status */}
        <div className="mb-4 p-3 rounded-lg bg-[#18181b]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#8b8b93]">Status</span>
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  state.isRecording ? "bg-[#f87171]/100 animate-pulse" : "bg-[#5c5c64]"
                }`}
              />
              <span className="text-sm font-medium">
                {state.isRecording ? "Recording" : "Ready"}
              </span>
            </div>
          </div>

          {state.isRecording && (
            <>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-[#8b8b93]">Duration</span>
                <span className="text-sm font-mono font-medium text-[#93c5fd]">
                  {formatDuration(duration)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-[#8b8b93]">Events Captured</span>
                <span className="text-sm font-medium">{logsCount}</span>
              </div>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-[#f87171]/10 border border-[#f87171]/30">
            <p className="text-sm text-[#f87171]">{error}</p>
          </div>
        )}

        {/* Recording Button */}
        <button
          onClick={state.isRecording ? handleStopRecording : handleStartRecording}
          disabled={loading}
          className={`w-full py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
            state.isRecording
              ? "bg-[#f87171]/100 hover:bg-[#dc2626] text-white"
              : "bg-[#3b82f6] hover:bg-[#2563eb] text-white"
          } ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
        >
          {loading ? (
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : state.isRecording ? (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Stop Recording
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8" />
              </svg>
              Start Recording
            </>
          )}
        </button>

        {/* Session info after stopping */}
        {!state.isRecording && state.session && state.session.logs.length > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-[#4ade80]/10 border border-[#4ade80]/30">
            <p className="text-sm text-[#4ade80] font-medium">Recording Complete!</p>
            <p className="text-xs text-[#86efac] mt-1">
              Captured {state.session.logs.length} events
            </p>
          </div>
        )}

        {/* Help text */}
        <p className="mt-4 text-xs text-[#5c5c64] text-center">
          {state.isRecording
            ? "Recording in progress in another tab"
            : "Opens screen recorder to capture video"}
        </p>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#232327] bg-[#18181b]">
        <a
          href="http://localhost:3002/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[#93c5fd] hover:text-white flex items-center justify-center gap-1"
        >
          Open Dashboard
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>
    </div>
  )
}

export default Popup
