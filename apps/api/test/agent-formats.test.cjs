const { test } = require("node:test")
const assert = require("node:assert/strict")
const { toPlaywrightTest, toFixPrompt } = require("../dist/reports/formats")
const { errorSignature } = require("../dist/ai/context")

const t0 = "2026-11-24T10:00:00.000Z"
const at = (s) => new Date(Date.parse(t0) + s * 1000).toISOString()
const report = {
  id: "r1",
  title: "Pay now fails with 502",
  description: "<p>Checkout breaks.</p>",
  stepsToReproduce: ["Open cart", "Click Pay now"],
  severity: "HIGH",
  status: "OPEN",
  createdAt: t0,
  url: "https://shop.test/cart",
  browserInfo: {
    page: { url: "https://shop.test/cart?token=[hidden]", viewport: { width: 1280, height: 720 } },
    logs: [
      { type: "INPUT", level: "INFO", message: 'Changed input "Coupon"', data: { selector: "input#coupon" }, timestamp: at(1) },
      { type: "CLICK", level: "INFO", message: 'Clicked button "Pay now"', data: { selector: "button#pay" }, timestamp: at(2) },
      { type: "CLICK", level: "INFO", message: "Clicked div", data: { selector: "div.card > span.x" }, timestamp: at(2.5) },
      { type: "NAVIGATION", level: "INFO", message: "Opened https://shop.test/thanks?id=9", data: { url: "https://shop.test/thanks?id=9" }, timestamp: at(2.8) },
      { type: "NETWORK", level: "ERROR", message: "POST https://shop.test/api/pay → 502", data: { responseBody: "{\"error\":\"timeout\"}" }, timestamp: at(3) },
      { type: "CONSOLE", level: "ERROR", message: "TypeError: Cannot read properties of undefined (reading 'id')", data: { stack: "at onPay (checkout.js:42:31)" }, timestamp: at(3.1) },
    ],
  },
}

test("Playwright test replays steps with good locators and asserts no errors", () => {
  const spec = toPlaywrightTest(report)
  assert.match(spec, /import \{ test, expect \} from "@playwright\/test"/)
  assert.match(spec, /await page\.goto\("https:\/\/shop\.test\/cart\?token=\[hidden\]"\)/)
  assert.match(spec, /page\.getByLabel\("Coupon"\)\.fill\(/)
  assert.match(spec, /page\.getByRole\("button", \{ name: "Pay now" \}\)\.click\(\)/)
  assert.match(spec, /page\.locator\("div\.card > span\.x"\)\.click\(\)/)
  assert.match(spec, /waitForURL\("https:\/\/shop\.test\/thanks\*\*"\)/)
  assert.match(spec, /setViewportSize\(\{ width: 1280, height: 720 \}\)/)
  assert.match(spec, /expect\(pageErrors, "errors in the page"\)\.toEqual\(\[\]\)/)
  assert.doesNotMatch(spec, /SAVE10/)
})

test("Fix prompt has exact errors, stack, response body and the test", () => {
  const prompt = toFixPrompt(report, "https://app.test")
  assert.match(prompt, /https:\/\/app\.test\/dashboard\/reports\/r1/)
  assert.match(prompt, /TypeError: Cannot read properties of undefined/)
  assert.match(prompt, /checkout\.js:42:31/)
  assert.match(prompt, /Response body: \{"error":"timeout"\}/)
  assert.match(prompt, /Checkout breaks\./)
  assert.doesNotMatch(prompt, /<p>/)
  assert.match(prompt, /@playwright\/test/)
})

test("errorSignature groups the same bug and ignores ids, numbers and query strings", () => {
  const mk = (msg, url) => [{ type: "CONSOLE", level: "ERROR", message: msg, timestamp: t0 }]
  const a = errorSignature(mk("TypeError: order 123 failed at https://x.test/a?b=1"), { url: "https://shop.test/orders/123?x=1" })
  const b = errorSignature(mk("TypeError: order 987 failed at https://y.test/a?b=2"), { url: "https://shop.test/orders/555" })
  const c = errorSignature(mk("RangeError: something else"), { url: "https://shop.test/orders/555" })
  assert.equal(a, b)
  assert.notEqual(a, c)
  assert.equal(errorSignature([{ type: "CLICK", level: "INFO", message: "x", timestamp: t0 }]), null)
  const early = [{ type: "ERROR", level: "ERROR", message: "old", data: { beforeRecording: true }, timestamp: t0 }]
  assert.equal(errorSignature(early), null)
})

test("labels are cleaned and hosts parsed", () => {
  const { cleanLabels, hostOf } = require("../dist/triage/activity")
  assert.deepEqual(cleanLabels([" Checkout ", "checkout", "Pay Ments", 5, "<script>", "", "a".repeat(40)]), ["checkout", "pay-ments", "script", "a".repeat(24)])
  assert.deepEqual(cleanLabels("nope"), [])
  assert.equal(cleanLabels(Array.from({ length: 20 }, (_, i) => `l${i}`)).length, 8)
  assert.equal(hostOf("https://Shop.Acme.com/cart?x=1"), "shop.acme.com")
  assert.equal(hostOf("http://localhost:3000/a"), "localhost:3000")
  assert.equal(hostOf("not a url"), null)
})
