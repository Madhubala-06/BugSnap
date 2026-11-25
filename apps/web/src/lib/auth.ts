export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
const TOKEN_KEY = "bugsnap_token"

export type Role = "owner" | "admin" | "member" | "guest"
export const ROLE_RANK: Record<Role, number> = { guest: 0, member: 1, admin: 2, owner: 3 }

export interface Me {
  id: string
  email: string
  name: string
  role: Role
  notifyEmail?: boolean
  workspace: { id: string; name: string; members?: number }
  workspaces?: { id: string; name: string; role: Role; members: number }[]
}

/** True if the signed-in person has at least this role in the current workspace. */
export const can = (me: Me | null | undefined, min: Role) => Boolean(me && ROLE_RANK[me.role ?? "guest"] >= ROLE_RANK[min])

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) window.localStorage.setItem(TOKEN_KEY, token)
  else window.localStorage.removeItem(TOKEN_KEY)
}

/** fetch() with the sign-in token. A 401 sends the user to /login. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers = new Headers(init.headers)
  if (token) headers.set("Authorization", `Bearer ${token}`)
  const response = await fetch(input, { ...init, headers })
  // Only react if this request used the current token. A late 401 from an old,
  // expired token must not wipe a sign-in that just happened.
  if (response.status === 401 && token && getToken() === token && !window.location.pathname.startsWith("/login")) {
    setToken(null)
    const next = encodeURIComponent(window.location.pathname + window.location.search)
    window.location.href = `/login?next=${next}`
  }
  return response
}

async function readError(response: Response, fallback: string) {
  try {
    const body = await response.json()
    return typeof body.message === "string" ? body.message : fallback
  } catch {
    return fallback
  }
}

export async function requestCode(email: string): Promise<{ sent: boolean; devCode?: string }> {
  const response = await fetch(`${API_URL}/auth/request-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })
  if (!response.ok) throw new Error(await readError(response, "Could not send the code"))
  return response.json()
}

export async function verifyCode(email: string, code: string): Promise<{ token: string; user: Me }> {
  const response = await fetch(`${API_URL}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, client: "web" }),
  })
  if (!response.ok) throw new Error(await readError(response, "Could not sign in"))
  return response.json()
}

export async function getMe(): Promise<Me | null> {
  if (!getToken()) return null
  const response = await authFetch(`${API_URL}/auth/me`)
  return response.ok ? response.json() : null
}

export async function signOut() {
  // Sign the Chrome extension out too, so a shared computer does not stay signed in there.
  const { askExtension, extensionInstalled } = await import("./extension")
  if (extensionInstalled()) await askExtension("BUGSNAP_SIGN_OUT", {}, 1500)
  await authFetch(`${API_URL}/auth/logout`, { method: "POST" }).catch(() => undefined)
  setToken(null)
  window.location.href = "/login"
}
