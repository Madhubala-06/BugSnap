const { test } = require("node:test")
const assert = require("node:assert/strict")
const { bugHints, pickFiles, applyEdits } = require("../dist/ai-fix/pick-files")

test("hints come from stack file names and page paths", () => {
  const h = bugHints(["at onPay (https://shop.test/static/js/checkout.js:42:31)", "https://shop.test/cart?x=1", "TypeError in main.8f3a.js"])
  assert.ok(h.names.includes("checkout.js"))
  assert.ok(h.words.includes("cart"))
  assert.ok(!h.names.includes("main.8f3a.js"))
})

test("picks named files first and skips vendor/build files", () => {
  const files = [
    { path: "node_modules/x/checkout.js", size: 100 },
    { path: "dist/app.min.js", size: 100 },
    { path: "src/checkout.js", size: 2000 },
    { path: "src/cart/Cart.tsx", size: 3000 },
    { path: "README.md", size: 100 },
    ...Array.from({ length: 40 }, (_, i) => ({ path: `src/other/f${i}.ts`, size: 5000 })),
  ]
  const out = pickFiles(files, { names: ["checkout.js"], words: ["cart"] }).map((f) => f.path)
  assert.equal(out[0], "src/checkout.js")
  assert.ok(out.includes("src/cart/Cart.tsx"))
  assert.ok(!out.some((p) => p.startsWith("node_modules") || p.startsWith("dist") || p.endsWith(".md")))
})

test("edits apply only when the text is found exactly once", () => {
  const files = { "a.js": "let cart\nconst x = cart.total\n", "b.js": "x\nx\n" }
  const ok = applyEdits(files, [{ path: "a.js", find: "let cart\n", replace: "const cart = { total: 1 }\n" }])
  assert.equal(ok.ok, true)
  assert.match(ok.changed["a.js"], /total: 1/)
  assert.equal(applyEdits(files, [{ path: "b.js", find: "x\n", replace: "y\n" }]).ok, false)
  assert.equal(applyEdits(files, [{ path: "c.js", find: "x", replace: "y" }]).ok, false)
  assert.equal(applyEdits(files, [{ path: "a.js", find: "nope", replace: "y" }]).ok, false)
  // "$&" in the replacement must be literal, not a regex back-reference
  assert.match(applyEdits(files, [{ path: "a.js", find: "let cart", replace: "let price = '$&'" }]).changed["a.js"], /'\$&'/)
})
