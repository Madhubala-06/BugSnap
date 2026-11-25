// Run with: pnpm --filter @bugsnap/api test  (builds first, then uses node:test)
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")
const { resolveUploadPath, buildLogDigest, summarizeLogs, fallbackTitle, buildPageBlock } = require("../dist/ai/context")
const { sanitizeLogs } = require("../dist/reports/reports.service")

const uploads = path.resolve("/srv/app/uploads")
const t0 = "2026-11-24T10:00:00.000Z"
const at = (s) => new Date(Date.parse(t0) + s * 1000).toISOString()

test("resolveUploadPath accepts our own screenshot URLs", () => {
  const file = resolveUploadPath("http://localhost:3001/uploads/thumbnails/0a1b-2c3d.jpg", uploads)
  assert.equal(file, path.join(uploads, "thumbnails", "0a1b-2c3d.jpg"))
})

test("resolveUploadPath blocks outside URLs, traversal and other folders", () => {
  for (const bad of [
    "http://169.254.169.254/latest/meta-data",
    "http://localhost:3001/uploads/thumbnails/../../etc/passwd.png",
    "http://localhost:3001/uploads/recordings/abc.webm",
    "http://localhost:3001/uploads/secret/abc.png",
    "file:///etc/passwd",
    "not a url at all %%%",
  ]) {
    assert.equal(resolveUploadPath(bad, uploads), null, bad)
  }
})

test("summarizeLogs counts errors, failed requests and clicks", () => {
  const logs = [
    { type: "CLICK", level: "INFO", message: "Clicked button", timestamp: at(1) },
    { type: "NETWORK", level: "ERROR", message: "POST /api/pay → 500", timestamp: at(2) },
    { type: "CONSOLE", level: "WARN", message: "slow", timestamp: at(3) },
    { type: "ERROR", level: "ERROR", message: "TypeError: x is undefined", timestamp: at(4) },
  ]
  assert.deepEqual(summarizeLogs(logs), { total: 4, errors: 2, warnings: 1, failedRequests: 1, clicks: 1 })
})

test("buildLogDigest keeps errors and clicks, drops noise, shows relative time", () => {
  const noise = Array.from({ length: 200 }, (_, i) => ({ type: "NETWORK", level: "INFO", message: `GET /ok/${i} → 200`, timestamp: at(0.01 * i) }))
  const logs = [
    ...noise,
    { type: "CLICK", level: "INFO", message: 'Clicked button "Pay now"', timestamp: at(5) },
    { type: "NETWORK", level: "ERROR", message: "POST /api/pay → 500", data: { responseBody: '{"error":"card_declined"}' }, timestamp: at(5.4) },
  ]
  const digest = buildLogDigest(logs, t0, 20)
  const lines = digest.split("\n").filter((l) => l.startsWith("["))
  assert.ok(lines.length <= 20)
  assert.match(digest, /\[\+5\.0s\] CLICK INFO: Clicked button "Pay now"/)
  assert.match(digest, /POST \/api\/pay → 500/)
  assert.match(digest, /card_declined/)
  assert.equal(buildLogDigest([]), "No logs were captured.")
})

test("fallbackTitle prefers the first error from the recording", () => {
  const logs = [
    { type: "ERROR", level: "ERROR", message: "old error", data: { beforeRecording: true }, timestamp: at(0) },
    { type: "ERROR", level: "ERROR", message: "TypeError: cart is null", timestamp: at(3) },
  ]
  assert.equal(fallbackTitle(logs), "TypeError: cart is null")
  assert.equal(fallbackTitle(logs, { url: "https://shop.test/checkout?x=1" }), "TypeError: cart is null on /checkout")
  const net = [{ type: "NETWORK", level: "ERROR", message: "POST https://shop.test/api/pay?token=[hidden] → 502", timestamp: at(1) }]
  assert.equal(fallbackTitle(net), "POST /api/pay failed (502)")
  const crash = [
    { type: "CONSOLE", level: "ERROR", message: "Payment UI crashed TypeError: Cannot read properties of undefined (reading 'id')", timestamp: at(1) },
  ]
  assert.equal(fallbackTitle(crash, { url: "https://shop.test/checkout" }), "TypeError: Cannot read properties of undefined (reading 'id') on /checkout")
  assert.equal(fallbackTitle([], { title: "Checkout" }), 'Issue on "Checkout"')
})

test("buildPageBlock lists URL, viewport and browser", () => {
  const block = buildPageBlock({ url: "https://shop.test/cart", viewport: { width: 1280, height: 720 }, userAgent: "Chrome/131" })
  assert.match(block, /URL: https:\/\/shop.test\/cart/)
  assert.match(block, /Viewport: 1280x720/)
})

test("sanitizeLogs drops junk, fixes types and caps size", () => {
  const out = sanitizeLogs([
    null,
    "text",
    { message: 5 },
    { type: "HACK", level: "LOUD", message: "x".repeat(10000), timestamp: "nope" },
    { type: "NETWORK", level: "ERROR", message: "ok", timestamp: t0, data: { status: 500 } },
  ])
  assert.equal(out.length, 2)
  assert.equal(out[0].type, "CONSOLE")
  assert.equal(out[0].level, "INFO")
  assert.equal(out[0].message.length, 4000)
  assert.ok(!Number.isNaN(Date.parse(out[0].timestamp)))
  assert.deepEqual(out[1].data, { status: 500 })
  assert.deepEqual(sanitizeLogs("nope"), [])
  assert.equal(sanitizeLogs(Array.from({ length: 1500 }, () => ({ message: "m" }))).length, 1000)
})

test("isOwnUpload only accepts files from our uploads folder", () => {
  const { isOwnUpload } = require("../dist/ai/context")
  assert.ok(isOwnUpload("http://localhost:3001/uploads/thumbnails/4cea-185c.jpg", "thumbnails"))
  assert.ok(isOwnUpload("https://api.example.com/uploads/recordings/ab-12.webm", "recordings"))
  assert.ok(!isOwnUpload("http://169.254.169.254/latest/meta-data", "thumbnails"))
  assert.ok(!isOwnUpload("http://x/uploads/recordings/a.webm", "thumbnails"))
  assert.ok(!isOwnUpload("javascript:alert(1)", "thumbnails"))
  assert.ok(!isOwnUpload(42, "thumbnails"))
})

test("fallbackSummary builds steps and a description without AI", () => {
  const { fallbackSummary } = require("../dist/ai/context")
  const logs = [
    { type: "ERROR", level: "ERROR", message: "old", data: { beforeRecording: true }, timestamp: at(0) },
    { type: "INPUT", level: "INFO", message: 'Changed input "Coupon"', timestamp: at(1) },
    { type: "CLICK", level: "INFO", message: 'Clicked button "Pay now"', timestamp: at(2) },
    { type: "NETWORK", level: "ERROR", message: "POST /api/pay → 502", timestamp: at(3) },
    { type: "CONSOLE", level: "ERROR", message: "TypeError: x is undefined", timestamp: at(4) },
  ]
  const out = fallbackSummary(logs, { url: "https://shop.test/cart", title: "Checkout" })
  assert.deepEqual(out.steps, ["Open https://shop.test/cart", 'Fill in input "Coupon"', 'Click button "Pay now"'])
  assert.match(out.description, /1 request failed, first: POST \/api\/pay → 502/)
  assert.match(out.description, /1 error in the console, first: TypeError/)
  assert.doesNotMatch(out.description, /old/)
  assert.match(fallbackSummary([], {}).description, /No errors/)
})
