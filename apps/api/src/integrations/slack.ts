/** Slack incoming webhooks: a URL the customer creates in their Slack. */
export function isSlackWebhook(url: unknown): url is string {
  return typeof url === "string" && /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,}$/.test(url.trim())
}

export async function postToSlack(url: string, payload: object) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`Slack ${res.status}: ${(await res.text()).slice(0, 120)}`)
}

const SEV_EMOJI: Record<string, string> = { CRITICAL: ":red_circle:", HIGH: ":large_orange_circle:", MEDIUM: ":large_yellow_circle:", LOW: ":white_circle:" }

/** One Slack message for a bug event, with a button back to BugSnap. */
export function slackMessage(p: { headline: string; bug: string; title: string; severity: string; url: string; page?: string | null; extra?: string }) {
  const lines = [`*<${p.url}|${p.bug}: ${p.title.replace(/[<>&]/g, "")}>*`, `${SEV_EMOJI[p.severity] ?? ""} ${p.severity.toLowerCase()}${p.page ? ` · ${p.page.replace(/^https?:\/\//, "").replace(/\?.*$/, "")}` : ""}`]
  if (p.extra) lines.push(p.extra)
  return {
    text: `${p.headline}: ${p.bug} ${p.title}`,
    blocks: [
      { type: "context", elements: [{ type: "mrkdwn", text: p.headline }] },
      { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
      { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in BugSnap" }, url: p.url }] },
    ],
  }
}
