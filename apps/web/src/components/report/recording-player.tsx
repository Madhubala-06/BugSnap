"use client"

import { useRef } from "react"

/**
 * Chrome's screen recorder writes WebM files without a duration, so the
 * seek bar does not work. Seeking far ahead once makes the browser work out
 * the real length; then we jump back to the start.
 */
export function RecordingPlayer({ src }: { src: string }) {
  const fixing = useRef(false)

  return (
    <video
      src={src}
      controls
      preload="metadata"
      className="w-full rounded-lg bg-black"
      style={{ maxHeight: "400px" }}
      onLoadedMetadata={(e) => {
        const video = e.currentTarget
        if (video.duration === Infinity || Number.isNaN(video.duration)) {
          fixing.current = true
          video.currentTime = 1e101
        }
      }}
      onDurationChange={(e) => {
        const video = e.currentTarget
        if (fixing.current && Number.isFinite(video.duration)) {
          fixing.current = false
          video.currentTime = 0
        }
      }}
    />
  )
}
