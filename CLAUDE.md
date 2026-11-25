@AGENTS.md

## Claude Code specifics

- Hooks in `.claude/settings.json` run automatically: they block edits to secrets, lockfiles and committed migrations,
  ask before commits, pushes, deploys and installs, format files after edits, and run the checks for what you changed
  before you finish. If a hook blocks you, read its message and change course; do not work around it.
- Sub-agents in `.claude/agents/`: use `code-reviewer` before asking to commit, `test-writer` after API logic changes,
  `migration-checker` for any Prisma schema change.
- Hooks are tested by `node .claude/hooks/test-hooks.mjs` (also in CI). If you change a hook, add a test case to
  `.claude/hooks/test-cases.json`.
