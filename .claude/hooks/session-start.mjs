// SessionStart: give the agent the repo state and the most recent lessons up front.
import { execSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { root } from "./lib.mjs"

const sh = (c) => {
  try {
    return execSync(c, { cwd: root, encoding: "utf8" }).trim()
  } catch {
    return ""
  }
}
const lines = [`Branch: ${sh("git branch --show-current") || "?"}`, `Uncommitted files: ${sh("git status --short").split("\n").filter(Boolean).length}`]
const log = path.join(root, "docs/agent-mistakes.md")
if (existsSync(log)) {
  const titles = readFileSync(log, "utf8")
    .split("\n")
    .filter((l) => /^## /.test(l))
    .map((l) => `- ${l.slice(3)}`)
  if (titles.length) lines.push("Past agent mistakes in this repo (read docs/agent-mistakes.md before similar work):", ...titles.slice(-12))
}
lines.push("Rules: AGENTS.md. Never commit, push or deploy without the owner's go-ahead.")
process.stdout.write(lines.join("\n") + "\n")
