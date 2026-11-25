// Shared helpers for the Claude Code hooks in this repo. Hooks get JSON on stdin.
// Exit 0 = fine. Exit 2 = blocked; stderr is shown to the agent so it can correct course.
import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import path from "node:path"

export const root = process.env.CLAUDE_PROJECT_DIR || process.cwd()
export const config = JSON.parse(readFileSync(path.join(root, ".claude/hooks/config.json"), "utf8"))

export async function readInput() {
  let raw = ""
  for await (const chunk of process.stdin) raw += chunk
  try {
    return JSON.parse(raw || "{}")
  } catch {
    return {}
  }
}

/** Repo-relative path with forward slashes. */
export function rel(file) {
  if (!file) return ""
  const abs = path.isAbsolute(file) ? file : path.join(root, file)
  return path.relative(root, abs).split(path.sep).join("/")
}

export function isTracked(relPath) {
  try {
    execSync(`git ls-files --error-unmatch -- "${relPath}"`, { cwd: root, stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

export function block(reason) {
  process.stderr.write(`Blocked by repo hook: ${reason}\n`)
  process.exit(2)
}

/** Ask the human to confirm (PreToolUse JSON decision). */
export function ask(reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason } }))
  process.exit(0)
}
