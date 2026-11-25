const { test } = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")

test("GitHub webhook signature", () => {
  process.env.GITHUB_WEBHOOK_SECRET = "s3cret"
  const { verifyGithubSignature } = require("../dist/integrations/github")
  const raw = Buffer.from('{"action":"closed"}')
  const good = "sha256=" + crypto.createHmac("sha256", "s3cret").update(raw).digest("hex")
  assert.ok(verifyGithubSignature(raw, good))
  assert.ok(!verifyGithubSignature(raw, good.replace(/.$/, "0")))
  assert.ok(!verifyGithubSignature(Buffer.from("{}"), good))
  assert.ok(!verifyGithubSignature(raw, undefined))
})

test("GitHub app JWT is RS256 and verifiable", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 })
  process.env.GITHUB_APP_ID = "12345"
  process.env.GITHUB_APP_PRIVATE_KEY = privateKey.export({ type: "pkcs1", format: "pem" }).toString().replace(/\n/g, "\\n")
  const { appJwt } = require("../dist/integrations/github")
  const jwt = appJwt(1_700_000_000)
  const [h, p, s] = jwt.split(".")
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url")), { alg: "RS256", typ: "JWT" })
  const payload = JSON.parse(Buffer.from(p, "base64url"))
  assert.equal(payload.iss, "12345")
  assert.ok(payload.exp - payload.iat <= 600)
  assert.ok(crypto.createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s, "base64url")))
})

test("Linear webhook signature", () => {
  const { verifyLinearSignature } = require("../dist/integrations/linear")
  const raw = Buffer.from('{"type":"Issue"}')
  const sig = crypto.createHmac("sha256", "abc").update(raw).digest("hex")
  assert.ok(verifyLinearSignature(raw, sig, "abc"))
  assert.ok(!verifyLinearSignature(raw, sig, "other"))
})

test("Slack URL and Jira site checks", () => {
  const { isSlackWebhook } = require("../dist/integrations/slack")
  const { cleanJiraSite } = require("../dist/integrations/jira")
  assert.ok(isSlackWebhook("https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXXXXXX"))
  assert.ok(!isSlackWebhook("https://evil.com/services/T000/B000/XXXXXXXX"))
  assert.ok(!isSlackWebhook("http://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXXXXXX"))
  assert.equal(cleanJiraSite("Acme.atlassian.net"), "https://acme.atlassian.net")
  assert.equal(cleanJiraSite("https://acme.atlassian.net/jira/software"), "https://acme.atlassian.net")
  assert.equal(cleanJiraSite("https://evil.com"), null)
})

test("install state is signed and expires", () => {
  process.env.APP_SECRET = "test-secret"
  const { IntegrationsService } = require("../dist/integrations/integrations.service")
  const svc = new IntegrationsService({})
  const state = svc.signState("ws1", "u1")
  assert.deepEqual({ w: svc.readState(state).w, u: svc.readState(state).u }, { w: "ws1", u: "u1" })
  const [body] = state.split(".")
  const forged = Buffer.from(JSON.stringify({ w: "other", u: "u1", e: Date.now() + 1e6 })).toString("base64url") + "." + state.split(".")[1]
  assert.equal(svc.readState(forged), null)
  assert.equal(svc.readState(body + ".x"), null)
})

test("issue body has steps, errors and a link back", () => {
  const { toIssueMarkdown } = require("../dist/reports/formats")
  const md = toIssueMarkdown(
    {
      id: "r1",
      number: 7,
      title: "t",
      severity: "HIGH",
      status: "OPEN",
      createdAt: new Date(),
      description: "<p>Pay hangs</p>",
      stepsToReproduce: ["Open cart", "Click Pay"],
      expectedResult: "works",
      actualResult: "spins",
      browserInfo: {
        page: { url: "https://shop.test/cart" },
        logs: [{ type: "CONSOLE", level: "ERROR", message: "TypeError: x", timestamp: new Date().toISOString(), data: { stack: "at a\nat b" } }],
        screenshotUrls: ["https://x/1.jpg"],
      },
    },
    "https://app.test",
  )
  assert.match(md, /Pay hangs/)
  assert.match(md, /1\. Open cart/)
  assert.match(md, /TypeError: x/)
  assert.match(md, /\[Screenshot 1\]\(https:\/\/x\/1\.jpg\)/)
  assert.match(md, /BUG-7 full report/)
  assert.match(md, /https:\/\/app\.test\/dashboard\/reports\/r1/)
})

test("bug references are found in PR text", () => {
  const { bugRefs } = require("../dist/ci/ci.controller")
  assert.deepEqual(bugRefs("Fixes BUG-12 and bug 7; see #BUG-12, bug_3"), [12, 7, 3])
  assert.deepEqual(bugRefs("no refs here, debug-4 is not one"), [])
})

test("regression test can target another build", () => {
  const { toPlaywrightTest } = require("../dist/reports/formats")
  const spec = toPlaywrightTest({
    id: "r",
    title: "t",
    severity: "LOW",
    status: "OPEN",
    createdAt: new Date(),
    browserInfo: { page: { url: "https://shop.test/cart?x=1" } },
  })
  assert.match(spec, /process\.env\.BUGSNAP_BASE_URL/)
  assert.match(spec, /page\.goto\(url\("https:\/\/shop\.test\/cart\?x=1"\)\)/)
})
