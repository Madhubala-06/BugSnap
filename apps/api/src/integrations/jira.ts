/** Jira Cloud REST v3 with email + API token (basic auth). */
export interface JiraCreds {
  site: string // https://acme.atlassian.net
  email: string
  token: string
}

export function cleanJiraSite(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const m = raw.trim().match(/^(?:https?:\/\/)?([a-z0-9-]+\.atlassian\.net)\/?/i)
  return m ? `https://${m[1].toLowerCase()}` : null
}

async function jira<T>(c: JiraCreds, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${c.site}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.email}:${c.token}`).toString("base64")}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (res.status === 204 ? undefined : await res.json()) as T
}

export const jiraMyself = (c: JiraCreds) => jira<{ displayName: string; emailAddress?: string }>(c, "/rest/api/3/myself")

export async function jiraProjects(c: JiraCreds) {
  const r = await jira<{ values: { key: string; name: string }[] }>(c, "/rest/api/3/project/search?maxResults=50")
  return r.values.map((p) => ({ key: p.key, name: p.name }))
}

/** Plain text to Atlassian Document Format, one paragraph per line. */
function adf(text: string) {
  const paragraphs = text
    .split("\n")
    .slice(0, 300)
    .map((line) => (line.trim() ? { type: "paragraph", content: [{ type: "text", text: line.slice(0, 2000) }] } : { type: "paragraph", content: [] }))
  return { type: "doc", version: 1, content: paragraphs }
}

export async function jiraCreateIssue(c: JiraCreds, projectKey: string, summary: string, description: string) {
  const make = (issuetype: string) =>
    jira<{ key: string }>(c, "/rest/api/3/issue", {
      method: "POST",
      body: JSON.stringify({
        fields: { project: { key: projectKey }, summary: summary.slice(0, 250), description: adf(description), issuetype: { name: issuetype } },
      }),
    })
  // Not every project has a "Bug" type; fall back to "Task".
  const issue = await make("Bug").catch(() => make("Task"))
  return { key: issue.key, url: `${c.site}/browse/${issue.key}` }
}

export async function jiraStatus(c: JiraCreds, key: string) {
  const r = await jira<{ fields: { status: { name: string; statusCategory: { key: string } } } }>(c, `/rest/api/3/issue/${key}?fields=status`)
  return { name: r.fields.status.name, category: r.fields.status.statusCategory.key } // new | indeterminate | done
}

/** Move to the first transition whose target status is in the wanted category. */
export async function jiraMoveTo(c: JiraCreds, key: string, category: "done" | "new") {
  const r = await jira<{ transitions: { id: string; to: { statusCategory: { key: string } } }[] }>(c, `/rest/api/3/issue/${key}/transitions`)
  const t = r.transitions.find((x) => x.to.statusCategory.key === category)
  if (t) await jira(c, `/rest/api/3/issue/${key}/transitions`, { method: "POST", body: JSON.stringify({ transition: { id: t.id } }) })
}
