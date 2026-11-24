// Small, plain emails. Text first; HTML is the same content with light styling.
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

function wrap(title: string, body: string, cta?: { label: string; url: string }) {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:auto;padding:24px;color:#111">
  <p style="margin:0 0 16px;font-weight:600;font-size:15px">BugSnap</p>
  <h2 style="margin:0 0 12px;font-size:18px">${esc(title)}</h2>
  <div style="font-size:14px;line-height:1.55;color:#333">${body}</div>
  ${cta ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px">${esc(cta.label)}</a></p>` : ""}
  <p style="margin-top:28px;font-size:12px;color:#888">You get this because of your BugSnap account. Turn off emails in Settings.</p>
</div>`
}

export function inviteEmail(p: { inviter: string; workspace: string; role: string; url: string }) {
  const subject = `${p.inviter} invited you to ${p.workspace} on BugSnap`
  const text = `${p.inviter} invited you to join "${p.workspace}" on BugSnap as ${p.role}.\n\nBugSnap records bugs with the video, console errors and failed requests, and writes the report with AI.\n\nAccept the invite: ${p.url}\n\nThe link works for 7 days.`
  const html = wrap(
    `Join ${p.workspace} on BugSnap`,
    `<p><b>${esc(p.inviter)}</b> invited you to join <b>${esc(p.workspace)}</b> as <b>${esc(p.role)}</b>.</p><p>BugSnap records bugs with the video, console errors and failed requests, and writes the report with AI.</p><p style="color:#888;font-size:12px">The link works for 7 days.</p>`,
    { label: "Accept invite", url: p.url }
  )
  return { subject, text, html }
}

export function assignedEmail(p: { actor: string; bug: string; title: string; url: string }) {
  const subject = `${p.bug}: ${p.title} was assigned to you`
  const text = `${p.actor} assigned ${p.bug} to you: ${p.title}\n\nOpen it: ${p.url}`
  const html = wrap(`${p.bug} is yours`, `<p><b>${esc(p.actor)}</b> assigned you <b>${esc(p.bug)}</b>: ${esc(p.title)}</p>`, { label: "Open the bug", url: p.url })
  return { subject, text, html }
}

export function mentionEmail(p: { actor: string; bug: string; title: string; comment: string; url: string }) {
  const subject = `${p.actor} mentioned you on ${p.bug}`
  const text = `${p.actor} mentioned you on ${p.bug} (${p.title}):\n\n"${p.comment}"\n\nReply: ${p.url}`
  const html = wrap(
    `${p.actor} mentioned you`,
    `<p>On <b>${esc(p.bug)}</b>: ${esc(p.title)}</p><blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #2563eb;background:#f5f7ff">${esc(p.comment)}</blockquote>`,
    { label: "Reply", url: p.url }
  )
  return { subject, text, html }
}
