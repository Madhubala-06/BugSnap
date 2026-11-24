"use client"

import { useState } from "react"
import { Check, Copy, Download, FlaskConical, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getReportText } from "@/lib/api"
import { downloadText } from "@/lib/export"

/** Shows a Playwright test generated from the recorded steps. */
export function PlaywrightCard({ reportId }: { reportId: string }) {
  const [code, setCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      setCode(await getReportText(reportId, "playwright"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <FlaskConical className="h-5 w-5" />
          Regression test
        </CardTitle>
        {code && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(code)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadText(`bug-${reportId.slice(0, 8)}.spec.ts`, code, "text/plain")}>
              <Download className="h-4 w-4 mr-1" /> .spec.ts
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {code ? (
          <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-background p-4 font-mono text-xs leading-relaxed text-foreground-secondary">
            {code}
          </pre>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-foreground-secondary">
              A Playwright test that replays these steps. It fails while the bug is there and passes once it is fixed.
            </p>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Show test"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
