// PreToolUse (Bash): refuse destructive commands, and make the agent ask a human before
// anything that leaves the machine (push, deploy, publish) or changes dependencies.
import { readInput, block, ask, config } from "./lib.mjs"

const input = await readInput()
const cmd = String(input.tool_input?.command ?? "")
if (!cmd) process.exit(0)

for (const rule of config.bash?.deny ?? []) {
  if (new RegExp(rule.pattern, "i").test(cmd)) block(`"${cmd.slice(0, 120)}" - ${rule.reason}`)
}
for (const rule of config.bash?.ask ?? []) {
  if (new RegExp(rule.pattern, "i").test(cmd)) ask(rule.reason)
}
process.exit(0)
