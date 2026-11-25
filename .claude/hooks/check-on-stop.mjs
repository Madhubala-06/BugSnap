// Stop: before the agent says "done", run the checks for the parts of the repo it changed.
// Failures are sent back to the agent (exit 2) so it fixes them instead of stopping.
import { execSync, spawnSync } from "node:child_process"
import path from "node:path"
import { readInput, root, config } from "./lib.mjs"

const input = await readInput()
if (input.stop_hook_active) process.exit(0) // already continuing because of this hook: don't loop

const git = (args) => {
  try {
    return execSync(`git ${args}`, { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean)
  } catch {
    return []
  }
}
const changed = [...new Set([...git("diff --name-only HEAD"), ...git("ls-files --others --exclude-standard")])]
if (!changed.length) process.exit(0)

const failures = []
for (const check of config.checks ?? []) {
  if (!changed.some((f) => new RegExp(check.match).test(f))) continue
  const r = spawnSync("bash", ["-c", check.run], { cwd: path.join(root, check.cwd ?? "."), encoding: "utf8", timeout: (check.timeoutSec ?? 300) * 1000 })
  if (r.status !== 0) {
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-40).join("\n")
    failures.push(`### ${check.name} failed (${check.cwd ?? "."}: ${check.run})\n${out || (r.error ? String(r.error) : "no output")}`)
  }
}
if (failures.length) {
  process.stderr.write(`Checks failed for the files you changed. Fix them before finishing:\n\n${failures.join("\n\n")}\n`)
  process.exit(2)
}
process.exit(0)
