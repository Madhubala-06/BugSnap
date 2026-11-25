import { waitUntil } from "@vercel/functions"
import type { PrismaService } from "../prisma/prisma.service"
import type { Mailer } from "../auth/mailer"
import { assignedEmail, mentionEmail } from "./email-templates"

function appUrl() {
  return (process.env.FRONTEND_URL || "http://localhost:3002").split(",")[0].trim().replace(/\/$/, "")
}

function background(job: Promise<unknown>) {
  try {
    waitUntil(job.catch(() => undefined))
  } catch {
    // not on Vercel
  }
}

/** Email the new assignee (not when you assign yourself, and only if they want emails). */
export function notifyAssigned(prisma: PrismaService, mailer: Mailer, reportId: string, assigneeId: string, actorId: string) {
  if (assigneeId === actorId) return
  background(
    (async () => {
      const [report, assignee, actor] = await Promise.all([
        prisma.bugReport.findUnique({ where: { id: reportId }, select: { id: true, number: true, title: true } }),
        prisma.user.findUnique({ where: { id: assigneeId } }),
        prisma.user.findUnique({ where: { id: actorId }, select: { name: true } }),
      ])
      if (!report || !assignee?.notifyEmail) return
      const mail = assignedEmail({
        actor: actor?.name ?? "Someone",
        bug: `BUG-${report.number ?? ""}`,
        title: report.title,
        url: `${appUrl()}/dashboard/reports/${report.id}`,
      })
      await mailer.sendEmail(assignee.email, mail.subject, mail.text, mail.html)
    })(),
  )
}

/**
 * Finds @mentions in a comment. "@Arjun", "@arjun.k" (email name) and
 * "@Arjun Kumar" (full name) all work. Returns member ids.
 */
export function findMentions(text: string, members: { id: string; name: string; email: string }[]) {
  const lower = text.toLowerCase()
  const ids = new Set<string>()
  for (const m of members) {
    const handles = [m.name, m.name.split(/\s+/)[0], m.email.split("@")[0]].map((h) => h.toLowerCase()).filter((h) => h.length >= 2)
    if (handles.some((h) => new RegExp(`(^|\\s)@${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[\\s,.!?:;])`, "i").test(lower))) ids.add(m.id)
  }
  return [...ids]
}

export function notifyMentions(prisma: PrismaService, mailer: Mailer, reportId: string, workspaceId: string, actorId: string, comment: string) {
  background(
    (async () => {
      const members = await prisma.membership.findMany({
        where: { workspaceId },
        include: { user: { select: { id: true, name: true, email: true, notifyEmail: true } } },
      })
      const ids = findMentions(
        comment,
        members.map((m) => m.user),
      ).filter((id) => id !== actorId)
      if (!ids.length) return
      const [report, actor] = await Promise.all([
        prisma.bugReport.findUnique({ where: { id: reportId }, select: { id: true, number: true, title: true } }),
        prisma.user.findUnique({ where: { id: actorId }, select: { name: true } }),
      ])
      if (!report) return
      for (const m of members.filter((x) => ids.includes(x.user.id) && x.user.notifyEmail)) {
        const mail = mentionEmail({
          actor: actor?.name ?? "Someone",
          bug: `BUG-${report.number ?? ""}`,
          title: report.title,
          comment: comment.slice(0, 500),
          url: `${appUrl()}/dashboard/reports/${report.id}`,
        })
        await mailer.sendEmail(m.user.email, mail.subject, mail.text, mail.html)
      }
    })(),
  )
}
