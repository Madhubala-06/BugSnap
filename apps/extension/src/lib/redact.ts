// Small helpers that keep secrets and huge payloads out of bug reports.
const SECRET_PARAM = /^(token|access_token|id_token|refresh_token|key|api_key|apikey|secret|password|pass|pwd|auth|code|session|sig|signature)$/i

export const MAX_TEXT = 2000

export function clip(text: string, max = MAX_TEXT): string {
  return text.length > max ? `${text.slice(0, max)}… [${text.length - max} more chars]` : text
}

export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw, location.href)
    url.searchParams.forEach((_value, name) => {
      if (SECRET_PARAM.test(name)) url.searchParams.set(name, "[hidden]")
    })
    if (url.username || url.password) {
      url.username = ""
      url.password = ""
    }
    return url.href
  } catch {
    return raw
  }
}

export function redactText(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, "Bearer [hidden]")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[hidden-jwt]")
    .replace(/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}/g, "[hidden-key]")
    .replace(/AIza[0-9A-Za-z\-_]{30,}/g, "[hidden-key]")
    .replace(/\bAQ\.[A-Za-z0-9_\-]{30,}/g, "[hidden-key]")
}
