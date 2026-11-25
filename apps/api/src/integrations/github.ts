import * as crypto from "crypto"

/**
 * GitHub App helpers. Env: GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_PRIVATE_KEY (PEM,
 * "\n" escapes allowed), GITHUB_WEBHOOK_SECRET.
 */
export const githubConfigured = () => Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_APP_SLUG)

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url")

/** Short-lived JWT that proves we are the app (RS256). */
export function appJwt(now = Math.floor(Date.now() / 1000)) {
  const key = (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n")
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: process.env.GITHUB_APP_ID }))
  const sig = crypto.createSign("RSA-SHA256").update(`${header}.${payload}`).sign(key)
  return `${header}.${payload}.${b64url(sig)}`
}

const tokenCache = new Map<string, { token: string; exp: number }>()

async function gh<T>(path: string, init: RequestInit & { token?: string; app?: boolean } = {}): Promise<T> {
  const auth = init.app ? `Bearer ${appJwt()}` : `token ${init.token}`
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "BugSnap",
      Authorization: auth,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 200)}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

export async function installationToken(installationId: string) {
  const hit = tokenCache.get(installationId)
  if (hit && hit.exp > Date.now() + 60_000) return hit.token
  const r = await gh<{ token: string; expires_at: string }>(`/app/installations/${installationId}/access_tokens`, { method: "POST", app: true })
  tokenCache.set(installationId, { token: r.token, exp: Date.parse(r.expires_at) })
  return r.token
}

export async function installationInfo(installationId: string) {
  return gh<{ id: number; account: { login: string; type: string } }>(`/app/installations/${installationId}`, { app: true })
}

export async function listRepos(installationId: string) {
  const token = await installationToken(installationId)
  const r = await gh<{ repositories: { full_name: string; private: boolean; has_issues: boolean }[] }>(`/installation/repositories?per_page=100`, { token })
  return r.repositories.filter((x) => x.has_issues).map((x) => ({ fullName: x.full_name, private: x.private }))
}

export async function createIssue(installationId: string, repo: string, title: string, body: string, labels: string[] = []) {
  const token = await installationToken(installationId)
  const issue = await gh<{ number: number; html_url: string; state: string }>(`/repos/${repo}/issues`, {
    method: "POST",
    token,
    body: JSON.stringify({ title: title.slice(0, 250), body: body.slice(0, 60_000), labels }),
  }).catch(async (error) => {
    // Labels that do not exist (or no permission) should not block the issue.
    if (labels.length)
      return gh<{ number: number; html_url: string; state: string }>(`/repos/${repo}/issues`, {
        method: "POST",
        token,
        body: JSON.stringify({ title: title.slice(0, 250), body: body.slice(0, 60_000) }),
      })
    throw error
  })
  return { number: issue.number, url: issue.html_url, state: issue.state }
}

export async function setIssueState(installationId: string, repo: string, number: number, state: "open" | "closed", reason?: "completed" | "not_planned") {
  const token = await installationToken(installationId)
  await gh(`/repos/${repo}/issues/${number}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ state, ...(state === "closed" && reason ? { state_reason: reason } : {}) }),
  })
}

export async function commentOnIssue(installationId: string, repo: string, number: number, body: string) {
  const token = await installationToken(installationId)
  await gh(`/repos/${repo}/issues/${number}/comments`, { method: "POST", token, body: JSON.stringify({ body }) })
}

/** X-Hub-Signature-256 check. */
export function verifyGithubSignature(raw: Buffer | undefined, header: string | undefined) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret || !raw || !header?.startsWith("sha256=")) return false
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(header)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// ---------- code changes (AI fix pull requests) ----------

export async function repoInfo(installationId: string, repo: string) {
  const token = await installationToken(installationId)
  const r = await gh<{ default_branch: string; private: boolean }>(`/repos/${repo}`, { token })
  return { defaultBranch: r.default_branch, private: r.private }
}

export async function listFiles(installationId: string, repo: string, branch: string) {
  const token = await installationToken(installationId)
  const ref = await gh<{ object: { sha: string } }>(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { token })
  const tree = await gh<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>(
    `/repos/${repo}/git/trees/${ref.object.sha}?recursive=1`,
    { token },
  )
  return { headSha: ref.object.sha, files: tree.tree.filter((t) => t.type === "blob").map((t) => ({ path: t.path, size: t.size ?? 0 })) }
}

export async function readFile(installationId: string, repo: string, path: string, ref: string) {
  const token = await installationToken(installationId)
  const r = await gh<{ content: string; encoding: string; sha: string }>(
    `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
    { token },
  )
  return { text: Buffer.from(r.content, (r.encoding as BufferEncoding) || "base64").toString("utf8"), sha: r.sha }
}

export async function createBranch(installationId: string, repo: string, name: string, fromSha: string) {
  const token = await installationToken(installationId)
  await gh(`/repos/${repo}/git/refs`, { method: "POST", token, body: JSON.stringify({ ref: `refs/heads/${name}`, sha: fromSha }) })
}

export async function writeFile(installationId: string, repo: string, branch: string, path: string, text: string, sha: string, message: string) {
  const token = await installationToken(installationId)
  await gh(`/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "PUT",
    token,
    body: JSON.stringify({ message, content: Buffer.from(text, "utf8").toString("base64"), sha, branch }),
  })
}

export async function openPullRequest(installationId: string, repo: string, head: string, base: string, title: string, body: string) {
  const token = await installationToken(installationId)
  const r = await gh<{ number: number; html_url: string }>(`/repos/${repo}/pulls`, {
    method: "POST",
    token,
    body: JSON.stringify({ title, head, base, body, draft: true }),
  })
  return { number: r.number, url: r.html_url }
}

/** Which permissions the installed app has (contents/pull_requests are needed for fix PRs). */
export async function installationPermissions(installationId: string) {
  const r = await gh<{ permissions: Record<string, string> }>(`/app/installations/${installationId}`, { app: true })
  return r.permissions ?? {}
}
