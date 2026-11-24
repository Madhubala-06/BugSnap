import Link from "next/link"
import { Layers } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { BugReport } from "@/lib/api"

export function DuplicatesCard({ report }: { report: BugReport }) {
  const dupes = report.duplicates ?? []
  if (!dupes.length) return null
  return (
    <Card className="border-warning/30">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Layers className="h-5 w-5 text-warning" />
          Seen {dupes.length + 1} times
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-foreground-secondary">Other reports with the same error on the same page:</p>
        <ul className="space-y-1.5">
          {dupes.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2">
              <Link href={`/dashboard/reports/${d.id}`} className="truncate text-primary hover:underline">
                {d.title}
              </Link>
              <span className="shrink-0 text-xs text-foreground-muted">
                {new Date(d.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {d.status.toLowerCase().replace("_", " ")}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
