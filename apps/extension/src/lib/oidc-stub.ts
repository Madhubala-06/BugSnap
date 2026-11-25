// The extension uploads with a short-lived client token from our API, so it never needs
// Vercel's server-side OIDC login. @vercel/blob imports it anyway; this stub keeps
// Node-only code out of the browser bundle.
export async function getVercelOidcToken(): Promise<string> {
  return ""
}
export function getVercelOidcTokenSync(): string {
  return ""
}
export function getContext() {
  return {}
}
