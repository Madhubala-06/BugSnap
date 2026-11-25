// PostToolUse (Edit|Write|MultiEdit): format the file that was just written, with the
// formatter this repo already uses. Never fails the edit; prints what it did.
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { readInput, rel, root, config } from "./lib.mjs"

const input = await readInput()
const file = rel(input.tool_input?.file_path)
if (!file || !existsSync(path.join(root, file))) process.exit(0)

for (const f of config.format ?? []) {
  if (!new RegExp(f.match).test(file)) continue
  const cwd = path.join(root, f.cwd ?? ".")
  const target = path.relative(cwd, path.join(root, file))
  for (const step of f.steps) {
    const [bin, ...args] = step.map((s) => s.replace("{file}", target))
    if (bin.includes("/") && !existsSync(path.join(cwd, bin))) continue // formatter not installed
    spawnSync(bin, args, { cwd, stdio: "ignore", timeout: 30_000 })
  }
  process.stdout.write(`formatted ${file}\n`)
  break
}
process.exit(0)
