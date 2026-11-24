import * as crypto from "crypto"

export const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex")

export const randomToken = () => crypto.randomBytes(32).toString("base64url")

/** 6-digit code, no modulo bias. */
export const randomCode = () => crypto.randomInt(0, 1_000_000).toString().padStart(6, "0")

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

function secretKey() {
  const secret = process.env.APP_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new Error("APP_SECRET is not set")
    return crypto.createHash("sha256").update("bugsnap-dev-only-secret").digest()
  }
  return crypto.createHash("sha256").update(secret).digest()
}

/** AES-256-GCM. Output: base64url(iv).base64url(tag).base64url(ciphertext) */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".")
}

export function decrypt(packed: string): string | null {
  try {
    const [iv, tag, data] = packed.split(".").map((p) => Buffer.from(p, "base64url"))
    const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const email = raw.trim().toLowerCase()
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(email) ? email : null
}
