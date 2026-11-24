import * as crypto from "crypto"

/** Linear GraphQL with a personal API key. */
async function linear<T>(apiKey: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.errors?.length) throw new Error(`Linear: ${body.errors?.[0]?.message ?? res.status}`)
  return body.data as T
}

export async function linearViewer(apiKey: string) {
  const d = await linear<{ viewer: { name: string; email: string }; organization: { name: string; urlKey: string } }>(apiKey, `{ viewer { name email } organization { name urlKey } }`)
  return d
}

export async function linearTeams(apiKey: string) {
  const d = await linear<{ teams: { nodes: { id: string; key: string; name: string }[] } }>(apiKey, `{ teams(first: 50) { nodes { id key name } } }`)
  return d.teams.nodes
}

export async function linearCreateIssue(apiKey: string, teamId: string, title: string, description: string) {
  const d = await linear<{ issueCreate: { success: boolean; issue: { id: string; identifier: string; url: string; state: { name: string; type: string } } } }>(
    apiKey,
    `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url state { name type } } } }`,
    { input: { teamId, title: title.slice(0, 250), description: description.slice(0, 60_000) } }
  )
  return d.issueCreate.issue
}

/** Move an issue to the team's first state of a type ("completed", "canceled", "unstarted"). */
export async function linearSetStateType(apiKey: string, issueId: string, type: "completed" | "canceled" | "unstarted" | "started") {
  const d = await linear<{ issue: { team: { states: { nodes: { id: string; type: string; position: number }[] } } } }>(
    apiKey,
    `query($id: String!) { issue(id: $id) { team { states { nodes { id type position } } } } }`,
    { id: issueId }
  )
  const state = d.issue.team.states.nodes.filter((s) => s.type === type).sort((a, b) => a.position - b.position)[0]
  if (!state) return
  await linear(apiKey, `mutation($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success } }`, { id: issueId, stateId: state.id })
}

/** Ask Linear to call us when issues change. Returns the webhook id. */
export async function linearCreateWebhook(apiKey: string, url: string, secret: string) {
  const d = await linear<{ webhookCreate: { success: boolean; webhook: { id: string } } }>(
    apiKey,
    `mutation($input: WebhookCreateInput!) { webhookCreate(input: $input) { success webhook { id } } }`,
    { input: { url, secret, resourceTypes: ["Issue"], allPublicTeams: true, label: "BugSnap" } }
  )
  return d.webhookCreate.webhook.id
}

export async function linearDeleteWebhook(apiKey: string, id: string) {
  await linear(apiKey, `mutation($id: String!) { webhookDelete(id: $id) { success } }`, { id }).catch(() => undefined)
}

export function verifyLinearSignature(raw: Buffer | undefined, header: string | undefined, secret: string) {
  if (!raw || !header) return false
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(header)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
