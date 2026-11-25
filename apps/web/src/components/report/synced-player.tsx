"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { Globe, MousePointerClick, Pause, Play, Terminal, TriangleAlert, Type, Waypoints } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SessionLog } from "@/lib/api"

export interface TimedEvent {
  t: number // seconds from the start of the video
  log: SessionLog
  kind: "error" | "click" | "input" | "nav" | "network" | "console"
}

interface PlayerState {
  time: number
  duration: number
  seek: (t: number, play?: boolean) => void
  events: TimedEvent[]
}

const Ctx = createContext<PlayerState>({ time: 0, duration: 0, seek: () => undefined, events: [] })
export const usePlayer = () => useContext(Ctx)

function kindOf(log: SessionLog): TimedEvent["kind"] {
  const level = log.level.toUpperCase()
  if (level === "ERROR") return "error"
  if (log.type === "CLICK") return "click"
  if (log.type === "INPUT") return "input"
  if (log.type === "NAVIGATION") return "nav"
  if (log.type === "NETWORK") return "network"
  return "console"
}

/** Puts every log on the video's clock. */
export function timeEvents(logs: SessionLog[], startedAt?: number): TimedEvent[] {
  if (!logs.length) return []
  const first = Date.parse(logs[0].timestamp)
  const origin = startedAt && Math.abs(startedAt - first) < 10 * 60 * 1000 ? startedAt : first
  return logs.map((log) => ({ t: Math.max(0, (Date.parse(log.timestamp) - origin) / 1000), log, kind: kindOf(log) }))
}

export function PlayerProvider({ events, children }: { events: TimedEvent[]; children: React.ReactNode }) {
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const seek = useCallback((t: number, play = true) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, t)
    if (play) v.play().catch(() => undefined)
  }, [])
  const value = useMemo(() => ({ time, duration, seek, events }), [time, duration, seek, events])
  return (
    <Ctx.Provider value={value}>
      <VideoRefContext.Provider value={{ videoRef, setTime, setDuration }}>{children}</VideoRefContext.Provider>
    </Ctx.Provider>
  )
}

const VideoRefContext = createContext<{
  videoRef: React.MutableRefObject<HTMLVideoElement | null>
  setTime: (t: number) => void
  setDuration: (d: number) => void
} | null>(null)

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`

/** Video with error/click markers on the seek bar. */
export function SyncedPlayer({ src }: { src: string }) {
  const ref = useContext(VideoRefContext)!
  const { time, duration, events, seek } = usePlayer()
  const [playing, setPlaying] = useState(false)
  const fixing = useRef(false)
  const trackRef = useRef<HTMLDivElement>(null)

  const markers = events.filter((e) => e.kind === "error" || e.kind === "click" || e.kind === "nav")
  const pct = (t: number) => (duration ? Math.min(100, (t / duration) * 100) : 0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (e.key !== " " || tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return
      const v = ref.videoRef.current
      if (!v) return
      e.preventDefault()
      if (v.paused) v.play().catch(() => undefined)
      else v.pause()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [ref])

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-black">
      <video
        ref={ref.videoRef}
        src={src}
        preload="metadata"
        playsInline
        className="block aspect-video w-full bg-black"
        onClick={(e) => (e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause())}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => ref.setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          // Chrome's screen recorder leaves the length out of the file; seeking far ahead makes the browser work it out.
          if (!Number.isFinite(v.duration)) {
            fixing.current = true
            v.currentTime = 1e101
          } else ref.setDuration(v.duration)
        }}
        onDurationChange={(e) => {
          const v = e.currentTarget
          if (Number.isFinite(v.duration)) {
            ref.setDuration(v.duration)
            if (fixing.current) {
              fixing.current = false
              v.currentTime = 0
            }
          }
        }}
      />
      <div className="flex items-center gap-3 border-t border-border bg-background-secondary px-3 py-2.5">
        <button
          onClick={() => {
            const v = ref.videoRef.current
            if (!v) return
            if (v.paused) v.play().catch(() => undefined)
            else v.pause()
          }}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foreground text-background"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
        </button>
        <div
          ref={trackRef}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") seek(time + 1, false)
            if (e.key === "ArrowLeft") seek(time - 1, false)
          }}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            seek(((e.clientX - r.left) / r.width) * duration, false)
          }}
          className="relative h-6 flex-1 cursor-pointer outline-none"
        >
          <div className="absolute inset-x-0 top-[11px] h-1 rounded-full bg-border" />
          <div className="absolute left-0 top-[11px] h-1 rounded-full bg-primary" style={{ width: `${pct(time)}%` }} />
          {markers.map((m, i) => (
            <span
              key={i}
              title={m.log.message}
              className={cn(
                "absolute top-[2px] h-1.5 w-1.5 -translate-x-1/2 rounded-full ring-2 ring-background-secondary",
                m.kind === "error" ? "bg-red-400" : m.kind === "click" ? "bg-sky-400" : "bg-foreground-muted",
              )}
              style={{ left: `${pct(m.t)}%` }}
            />
          ))}
          <div className="absolute top-[6px] h-3.5 w-0.5 -translate-x-1/2 rounded bg-foreground" style={{ left: `${pct(time)}%` }} />
        </div>
        <span className="w-[86px] shrink-0 text-right font-mono text-xs text-foreground-secondary">
          {fmt(time)} / {fmt(duration)}
        </span>
      </div>
    </div>
  )
}

const ICON: Record<TimedEvent["kind"], React.ReactNode> = {
  error: <TriangleAlert className="h-3.5 w-3.5" />,
  click: <MousePointerClick className="h-3.5 w-3.5" />,
  input: <Type className="h-3.5 w-3.5" />,
  nav: <Globe className="h-3.5 w-3.5" />,
  network: <Waypoints className="h-3.5 w-3.5" />,
  console: <Terminal className="h-3.5 w-3.5" />,
}
const LABEL: Record<TimedEvent["kind"], string> = { error: "error", click: "click", input: "input", nav: "page", network: "network", console: "console" }

/** List of events; the one playing now is highlighted, clicking one jumps the video there. */
export function EventList({ events, empty }: { events: TimedEvent[]; empty?: string }) {
  const { time, seek, duration } = usePlayer()
  const [open, setOpen] = useState<number | null>(null)
  if (!events.length)
    return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-foreground-muted">{empty ?? "Nothing captured."}</p>
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {events.map((e, i) => {
        const now = duration > 0 && time >= e.t - 0.05 && time < e.t + 0.7
        const data = e.log.data ?? e.log.metadata ?? {}
        const detail = [
          typeof data.selector === "string" ? `selector: ${data.selector}` : "",
          typeof data.responseBody === "string" ? `response: ${data.responseBody}` : "",
          typeof data.stack === "string" ? data.stack : "",
        ]
          .filter(Boolean)
          .join("\n")
        const side =
          e.kind === "network" || e.log.type === "NETWORK"
            ? typeof data.duration === "number"
              ? `${data.duration}ms`
              : ""
            : e.kind === "input"
              ? "value not recorded"
              : typeof data.selector === "string"
                ? data.selector
                : ""
        return (
          <div key={i} className={cn("border-b border-border last:border-0", now && "bg-primary/10 shadow-[inset_2px_0_0_hsl(var(--primary))]")}>
            <button
              onClick={() => {
                seek(Math.max(0, e.t - 0.4))
                if (detail) setOpen(open === i ? null : i)
              }}
              className="grid w-full grid-cols-[52px_84px_1fr_auto] items-center gap-2.5 px-3 py-2 text-left text-[12.5px] hover:bg-background-secondary"
            >
              <span className="font-mono text-foreground-muted">+{e.t.toFixed(1)}s</span>
              <span className={cn("flex items-center gap-1.5", e.kind === "error" ? "text-red-400" : "text-foreground-muted")}>
                {ICON[e.kind]}
                {e.log.type === "NETWORK" ? "network" : LABEL[e.kind]}
              </span>
              <span
                className={cn(
                  "truncate",
                  e.kind === "error"
                    ? "font-mono text-red-400"
                    : e.log.type === "NETWORK" || e.log.type === "CONSOLE"
                      ? "font-mono text-foreground-secondary"
                      : "text-foreground",
                )}
              >
                {e.log.message}
              </span>
              <span className="max-w-[180px] truncate font-mono text-[11px] text-foreground-muted">{side}</span>
            </button>
            {open === i && detail && (
              <pre className="mx-3 mb-2 whitespace-pre-wrap break-words rounded-md bg-background-secondary p-2.5 font-mono text-[11.5px] text-foreground-secondary">
                {detail}
              </pre>
            )}
          </div>
        )
      })}
    </div>
  )
}
