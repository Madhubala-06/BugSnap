/** Choose which repo files the AI should see for a bug: files named in stacks/URLs first, then path words. */
const SKIP = /(^|\/)(node_modules|dist|build|out|coverage|\.next|vendor|\.git)\/|\.min\.|\.map$|lock(\.json|\.yaml)?$|\.lock$|\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|mp4|webm|pdf|zip)$/i
const CODE = /\.(m?[jt]sx?|cjs|vue|svelte|astro|html?|css|scss|py|rb|go|java|kt|php|cs|rs|swift)$/i

export function bugHints(texts: string[]): { names: string[]; words: string[] } {
  const names = new Set<string>()
  const words = new Set<string>()
  for (const t of texts) {
    for (const m of t.matchAll(/([\w@./-]+\.(?:m?[jt]sx?|cjs|vue|svelte|py|rb|go|java|php|html?|css))(?::\d+)?/gi)) {
      const base = m[1].split(/[/?#]/).filter(Boolean).pop()
      if (base && !/^(chunk|main|bundle|vendor|index-[a-z0-9]+)\b/i.test(base)) names.add(base.toLowerCase())
    }
    for (const m of t.matchAll(/https?:\/\/[^\s"')]+/gi)) {
      try {
        new URL(m[0]).pathname
          .split("/")
          .filter((w) => w.length > 2 && !/^\d+$/.test(w))
          .forEach((w) => words.add(w.toLowerCase().replace(/\.\w+$/, "")))
      } catch {
        // not a URL
      }
    }
  }
  return { names: [...names], words: [...words].slice(0, 8) }
}

export function pickFiles(files: { path: string; size: number }[], hints: { names: string[]; words: string[] }, maxFiles = 8, maxBytes = 120_000) {
  const usable = files.filter((f) => !SKIP.test(f.path) && CODE.test(f.path) && f.size > 0 && f.size < 80_000)
  const score = (f: { path: string }) => {
    const p = f.path.toLowerCase()
    const base = p.split("/").pop() ?? p
    let s = 0
    if (hints.names.includes(base)) s += 100
    for (const w of hints.words) if (p.includes(w)) s += 20
    if (/(^|\/)(src|app|pages|components|lib|site|public)\//.test(p)) s += 3
    if (/test|spec|stories/.test(p)) s -= 15
    return s
  }
  const ranked = usable.map((f) => ({ ...f, s: score(f) })).sort((a, b) => b.s - a.s || a.size - b.size)
  // Tiny projects: just send everything.
  const total = usable.reduce((n, f) => n + f.size, 0)
  const chosen = total <= maxBytes && usable.length <= maxFiles * 2 ? ranked : ranked.filter((f) => f.s > 0)
  const out: { path: string; size: number }[] = []
  let bytes = 0
  for (const f of chosen) {
    if (out.length >= maxFiles || bytes + f.size > maxBytes) continue
    out.push({ path: f.path, size: f.size })
    bytes += f.size
  }
  return out
}

export interface Edit {
  path: string
  find: string
  replace: string
}

/** Apply exact find/replace edits. Each `find` must appear exactly once in its file. */
export function applyEdits(files: Record<string, string>, edits: Edit[]): { ok: true; changed: Record<string, string> } | { ok: false; error: string } {
  const changed: Record<string, string> = {}
  for (const e of edits) {
    if (typeof e?.path !== "string" || typeof e.find !== "string" || typeof e.replace !== "string" || !e.find) return { ok: false, error: "An edit was incomplete" }
    const current = changed[e.path] ?? files[e.path]
    if (current == null) return { ok: false, error: `The AI tried to edit ${e.path}, which it was not shown` }
    const n = current.split(e.find).length - 1
    if (n !== 1) return { ok: false, error: `The text to replace in ${e.path} was found ${n} times (needs exactly once)` }
    changed[e.path] = current.replace(e.find, () => e.replace)
  }
  for (const p of Object.keys(changed)) if (changed[p] === files[p]) delete changed[p]
  return Object.keys(changed).length ? { ok: true, changed } : { ok: false, error: "The AI did not change anything" }
}
