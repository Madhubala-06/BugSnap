"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Check, Circle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { getOnboarding, type Onboarding } from "@/lib/api"

const HIDE_KEY = "bugsnap_hide_checklist"

/** Short checklist for new workspaces. Ticks itself off from real data. */
export function GettingStarted() {
  const [data, setData] = useState<Onboarding | null>(null)
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    setHidden(localStorage.getItem(HIDE_KEY) === "1")
    getOnboarding()
      .then(setData)
      .catch(() => undefined)
  }, [])

  if (!data || hidden) return null
  const steps = [
    {
      done: data.recordedFirstBug,
      title: "Record your first bug",
      body: "Install the Chrome extension, open the broken page, press Record and show the bug.",
      href: "/dashboard/settings#extension",
      cta: "Get the extension",
    },
    {
      done: data.gotAiWriteUp,
      title: "Get an AI write-up",
      body: data.ai.key
        ? "Your own Gemini key is set. Every new report gets a write-up."
        : `Free: ${Math.max(0, data.ai.sharedLimit - data.ai.sharedUsed)} of ${data.ai.sharedLimit} AI write-ups left this month.`,
      href: "/dashboard/reports",
      cta: "Open a report",
    },
    {
      done: data.sharedReport,
      title: "Hand it to a developer",
      body: "Share a read-only link or open a GitHub issue in one click.",
      href: "/dashboard/reports",
      cta: "Share a report",
    },
    {
      done: data.connectedAgent,
      title: "Let your AI coding agent read bugs",
      body: "Connect Claude Code or Cursor so they can pull the exact errors and fix them.",
      href: "/dashboard/settings#agents",
      cta: "Connect",
    },
  ]
  const finished = steps.filter((s) => s.done).length
  if (finished === steps.length) return null

  return (
    <Card className="mb-8 border-primary/25">
      <CardContent className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Getting started</h2>
            <p className="text-sm text-foreground-secondary">
              {finished} of {steps.length} done
            </p>
          </div>
          <button
            className="text-xs text-foreground-muted hover:text-foreground"
            onClick={() => {
              localStorage.setItem(HIDE_KEY, "1")
              setHidden(true)
            }}
          >
            Hide
          </button>
        </div>
        <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-background-secondary" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(finished / steps.length) * 100}%` }} />
        </div>
        <ol className="grid gap-3 md:grid-cols-2">
          {steps.map((s) => (
            <li key={s.title} className="flex gap-3 rounded-lg border border-border p-4">
              {s.done ? (
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3.5 w-3.5" />
                </span>
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-foreground-muted" />
              )}
              <div className="min-w-0">
                <p className={s.done ? "font-medium text-foreground-secondary line-through" : "font-medium text-foreground"}>{s.title}</p>
                <p className="mt-0.5 text-sm text-foreground-secondary">{s.body}</p>
                {!s.done && (
                  <Link href={s.href} className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
                    {s.cta} →
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
