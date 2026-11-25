// PreToolUse (Edit|Write|MultiEdit|NotebookEdit): keep agents away from secrets, lockfiles
// and migrations that have already been committed (and so may already be applied somewhere).
import { readInput, rel, isTracked, block, config } from "./lib.mjs"

const input = await readInput()
const file = rel(input.tool_input?.file_path ?? input.tool_input?.notebook_path)
if (!file) process.exit(0)

for (const rule of config.protect ?? []) {
  if (new RegExp(rule.pattern).test(file)) block(`${file}: ${rule.reason}`)
}
for (const rule of config.protectIfCommitted ?? []) {
  if (new RegExp(rule.pattern).test(file) && isTracked(file)) block(`${file}: ${rule.reason}`)
}
process.exit(0)
