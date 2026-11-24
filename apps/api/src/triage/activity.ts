import { Prisma, PrismaClient } from "@prisma/client"

type Db = Pick<PrismaClient, "activity">

/** Records one thing that happened to a report. Never throws. */
export async function logActivity(db: Db, reportId: string, actorId: string | null, kind: string, data?: Record<string, unknown>) {
  await db.activity
    .create({ data: { reportId, actorId, kind, data: (data ?? undefined) as Prisma.InputJsonValue | undefined } })
    .catch(() => undefined)
}

export const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const

/** Lowercase, trimmed, unique, max 8 labels of 24 chars. */
export function cleanLabels(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== "string") continue
    const label = raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "").slice(0, 24)
    if (label && !out.includes(label)) out.push(label)
    if (out.length >= 8) break
  }
  return out
}

/** "shop.acme.com" matches https://shop.acme.com/x and http://localhost:3000 matches "localhost:3000". */
export function hostOf(url?: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return null
  }
}
