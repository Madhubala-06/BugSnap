// CI guardrail: the rules and tools that agents rely on must stay true.
// Each check here exists because something went wrong once (see docs/agent-mistakes.md).
import { execSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

const root = process.cwd()
const cfg = JSON.parse(readFileSync(path.join(root, ".claude/hooks/config.json"), "utf8")).ci ?? {}
const problems = []
const read = (p) => readFileSync(path.join(root, p), "utf8")
const git = (a) => execSync(`git ${a}`, { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean)

// 1. One rules file every agent reads; CLAUDE.md imports it.
if (!existsSync("AGENTS.md")) problems.push("AGENTS.md is missing")
if (!existsSync("CLAUDE.md") || !read("CLAUDE.md").includes("@AGENTS.md")) problems.push("CLAUDE.md must import @AGENTS.md")

// 2. Every `npm run x` / `pnpm ... x` in AGENTS.md must be a real script somewhere.
const scripts = new Set()
for (const f of git("ls-files")) if (f.endsWith("package.json")) Object.keys(JSON.parse(read(f)).scripts ?? {}).forEach((s) => scripts.add(s))
if (existsSync("AGENTS.md")) {
  for (const m of read("AGENTS.md").matchAll(/(?:npm|pnpm(?: --filter [\w@/.-]+)?) run ([\w:.-]+)/g)) {
    if (!scripts.has(m[1])) problems.push(`AGENTS.md mentions "${m[0]}" but no package.json has a "${m[1]}" script`)
  }
}

// 3. Hooks referenced in settings exist; sub-agents have name + description.
const settings = JSON.parse(read(".claude/settings.json"))
for (const groups of Object.values(settings.hooks ?? {}))
  for (const g of groups)
    for (const h of g.hooks ?? []) {
      const m = String(h.command).match(/\.claude\/hooks\/[\w.-]+/)
      if (m && !existsSync(m[0])) problems.push(`.claude/settings.json runs ${m[0]}, which does not exist`)
    }
for (const f of existsSync(".claude/agents") ? readdirSync(".claude/agents") : []) {
  const text = read(`.claude/agents/${f}`)
  if (!/^---[\s\S]*?\nname: .+[\s\S]*?\ndescription: .+[\s\S]*?\n---/.test(text))
    problems.push(`.claude/agents/${f} needs front matter with name and description`)
}

// 4. Every mistake in the log names the rule that was added, and where it lives.
if (existsSync("docs/agent-mistakes.md")) {
  const entries = read("docs/agent-mistakes.md")
    .split(/\n(?=## )/)
    .filter((e) => e.startsWith("## "))
  for (const e of entries) {
    const title = e.split("\n")[0]
    if (!/\*\*Rule added:\*\*/.test(e)) problems.push(`agent-mistakes.md "${title}" has no **Rule added:**`)
    const where = e.match(/\*\*Where:\*\*(.*)/)?.[1] ?? ""
    const paths = [...where.matchAll(/`([^`]+)`/g)].map((m) => m[1].replace(/#.*$/, ""))
    if (!paths.length) problems.push(`agent-mistakes.md "${title}" has no **Where:** path`)
    for (const p of paths) if (!existsSync(p)) problems.push(`agent-mistakes.md "${title}" points to ${p}, which does not exist`)
  }
} else problems.push("docs/agent-mistakes.md is missing")

// 5. No real env files in git. Build-time files holding only public values (bundled into the app anyway) are fine.
const PUBLIC_KEY = /^(PLASMO_PUBLIC_|NEXT_PUBLIC_|VITE_)/
for (const f of git("ls-files")) {
  if (!/(^|\/)\.env(\.|$)/.test(f) || /\.example$/.test(f)) continue
  const keys = [...read(f).matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)].map((m) => m[1])
  const secret = keys.filter((k) => !PUBLIC_KEY.test(k))
  if (!keys.length || secret.length)
    problems.push(
      `${f} is tracked by git${secret.length ? ` and holds non-public ${secret.join(", ")}` : ""}; only .env.example files or public-only build files may be committed`,
    )
}

// 6. Every setting the code reads is documented in .env.example.
for (const d of cfg.envDocs ?? []) {
  const used = new Set()
  for (const f of git(`ls-files ${d.src}`)) {
    const text = read(f)
    for (const re of d.patterns) for (const m of text.matchAll(new RegExp(re, "g"))) used.add(m[1].toUpperCase())
  }
  const documented = new Set([...read(d.example).matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]))
  for (const v of used) if (!documented.has(v) && !(d.ignore ?? []).includes(v)) problems.push(`${d.src} reads ${v}, but ${d.example} does not list it`)
}

// 7. New migrations must sort after every existing one (PRs only).
const base = process.env.GITHUB_BASE_REF
if (cfg.migrationsDir && base) {
  try {
    execSync(`git fetch --depth=200 origin ${base}`, { cwd: root, stdio: "ignore" })
    const before = execSync(`git ls-tree --name-only origin/${base} ${cfg.migrationsDir}/`, { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map((p) => path.basename(p))
    const newest =
      before
        .filter((n) => /^\d/.test(n))
        .sort()
        .at(-1) ?? ""
    const added = git(`diff --name-only --diff-filter=A origin/${base}...HEAD -- ${cfg.migrationsDir}`).map((p) => p.split("/").slice(-2, -1)[0])
    for (const a of new Set(added)) if (a <= newest) problems.push(`migration ${a} sorts before ${newest}; rename it so it runs last`)
  } catch {
    problems.push(`could not compare migrations with origin/${base}`)
  }
}

if (problems.length) {
  console.error(`Agent setup check failed:\n${problems.map((p) => `- ${p}`).join("\n")}`)
  process.exit(1)
}
console.log("Agent setup check passed")
