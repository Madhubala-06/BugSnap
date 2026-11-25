// Self-test for the hooks: feeds sample tool calls and checks each decision. Run in CI.
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const cases = JSON.parse(readFileSync(path.join(root, ".claude/hooks/test-cases.json"), "utf8"))
let failed = 0
for (const c of cases) {
  const r = spawnSync("node", [path.join(root, ".claude/hooks", c.hook)], {
    input: JSON.stringify(c.input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  })
  const got = r.status === 2 ? "block" : /"permissionDecision":"ask"/.test(r.stdout) ? "ask" : "allow"
  const ok = got === c.expect
  if (!ok) failed++
  console.log(`${ok ? "ok  " : "FAIL"} ${c.hook} ${c.name}: expected ${c.expect}, got ${got}`)
}
if (failed) {
  console.error(`${failed} hook test(s) failed`)
  process.exit(1)
}
console.log(`all ${cases.length} hook tests passed`)
