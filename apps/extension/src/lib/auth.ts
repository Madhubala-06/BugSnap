import { getConfig } from "./storage"

const AUTH_KEY = "bugsnapAuth"

export interface StoredAuth {
  token: string
  email: string
  workspaceName?: string
}

export async function getAuth(): Promise<StoredAuth | null> {
  const result = await chrome.storage.local.get(AUTH_KEY)
  return result[AUTH_KEY] ?? null
}

export async function setAuth(auth: StoredAuth | null) {
  if (auth) await chrome.storage.local.set({ [AUTH_KEY]: auth })
  else await chrome.storage.local.remove(AUTH_KEY)
}

async function post(path: string, body: unknown, token?: string) {
  const { apiUrl } = await getConfig()
  const res = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.message === "string" ? data.message : `Request failed (${res.status})`)
  return data
}

export const requestCode = (email: string) => post("/auth/request-code", { email }) as Promise<{ sent: boolean; devCode?: string }>

export async function verifyCode(email: string, code: string) {
  const data = await post("/auth/verify", { email, code, client: "extension" })
  const auth: StoredAuth = { token: data.token, email: data.user.email, workspaceName: data.user.workspace?.name }
  await setAuth(auth)
  return auth
}

export async function signOut() {
  const auth = await getAuth()
  if (auth) await post("/auth/logout", {}, auth.token).catch(() => undefined)
  await setAuth(null)
}

/** fetch() to the API with the sign-in token. Throws a clear error on 401. */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const [{ apiUrl }, auth] = await Promise.all([getConfig(), getAuth()])
  if (!auth) throw new Error("Please sign in from the BugSnap icon first.")
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${auth.token}`)
  const res = await fetch(`${apiUrl}${path}`, { ...init, headers })
  if (res.status === 401) {
    await setAuth(null)
    throw new Error("Your sign-in expired. Click the BugSnap icon and sign in again.")
  }
  return res
}
