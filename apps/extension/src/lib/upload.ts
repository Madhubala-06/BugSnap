import { put } from "@vercel/blob/client"
import { apiFetch } from "./auth"

/**
 * Uploads one file. In production the API hands out a short-lived token and the
 * file goes straight to storage (no size limit from the API). In local dev the
 * file is posted to the API.
 */
type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

export async function uploadFile(kind: "recording" | "screenshot", blob: Blob, name: string, fetcher: Fetcher = apiFetch): Promise<string> {
  const tokenRes = await fetcher("/upload/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, contentType: blob.type }),
  })
  if (!tokenRes.ok) throw new Error(`Upload failed (${tokenRes.status})`)
  const ticket = await tokenRes.json()

  if (ticket.mode === "blob") {
    const result = await put(ticket.pathname, blob, {
      access: "public",
      token: ticket.clientToken,
      contentType: ticket.contentType,
      multipart: blob.size > 8 * 1024 * 1024,
    })
    return result.url
  }

  const form = new FormData()
  form.append("file", blob, name)
  const res = await fetcher(kind === "recording" ? "/upload/recording" : "/upload/thumbnail", { method: "POST", body: form })
  if (!res.ok) throw new Error(`Upload failed (${res.status})`)
  return (await res.json()).url as string
}
