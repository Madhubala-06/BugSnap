const { test } = require("node:test")
const assert = require("node:assert/strict")
const { encrypt, decrypt, normalizeEmail, randomCode, safeEqual, sha256 } = require("../dist/auth/crypto")
const { isOwnUpload } = require("../dist/ai/context")

test("encrypt/decrypt round trip and tamper check", () => {
  const packed = encrypt("AIzaSyEXAMPLEKEY1234567890")
  assert.ok(!packed.includes("AIza"))
  assert.equal(decrypt(packed), "AIzaSyEXAMPLEKEY1234567890")
  const [iv, tag, data] = packed.split(".")
  const flipped = (data[0] === "A" ? "B" : "A") + data.slice(1)
  const broken = [iv, tag, flipped].join(".")
  assert.equal(decrypt(broken), null)
  assert.equal(decrypt("garbage"), null)
})

test("normalizeEmail", () => {
  assert.equal(normalizeEmail("  Madhu@Example.COM "), "madhu@example.com")
  for (const bad of ["", "no-at", "a@b", "a b@c.com", 5, null]) assert.equal(normalizeEmail(bad), null)
})

test("codes are 6 digits and compared safely", () => {
  for (let i = 0; i < 50; i++) assert.match(randomCode(), /^\d{6}$/)
  assert.ok(safeEqual(sha256("x"), sha256("x")))
  assert.ok(!safeEqual(sha256("x"), sha256("y")))
})

test("blob uploads must be inside the caller's workspace folder", () => {
  const base = "https://abc123.public.blob.vercel-storage.com"
  assert.ok(isOwnUpload(`${base}/w/ws1/thumbnails/1a2b-3c.jpg`, "thumbnails", "ws1"))
  assert.ok(!isOwnUpload(`${base}/w/ws2/thumbnails/1a2b-3c.jpg`, "thumbnails", "ws1"))
  assert.ok(!isOwnUpload(`${base}/w/ws1/recordings/1a2b.webm`, "thumbnails", "ws1"))
  assert.ok(!isOwnUpload(`http://abc123.public.blob.vercel-storage.com/w/ws1/thumbnails/a.jpg`, "thumbnails", "ws1"))
  assert.ok(!isOwnUpload(`https://evil.com/w/ws1/thumbnails/a.jpg`, "thumbnails", "ws1"))
  assert.ok(!isOwnUpload(`${base}/w/ws1/thumbnails/a.jpg`, "thumbnails"))
})
