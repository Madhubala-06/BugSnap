# BugSnap verify fix (GitHub Action)

Write `Fixes BUG-12` in a pull request. This action downloads BUG-12's regression test from BugSnap
(the steps recorded in the browser), runs it with Playwright against your build, and:

- comments on the pull request: fixed, or still reproduces (with the error),
- shows the result on the bug in BugSnap and moves it to **Fix ready** when it passes,
- fails the check while the bug still reproduces (turn off with `fail-on-bug: false`).

```yaml
name: BugSnap verify fix
on:
  pull_request:
    types: [opened, synchronize, edited, reopened]
permissions:
  contents: read
  pull-requests: write
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Start your app, or point base-url at a preview deployment.
      - run: npm ci && npm run build && (npm start &) && npx wait-on http://localhost:3000
      - uses: Madhubala-06/BugSnap/action@local-changes
        with:
          api-key: ${{ secrets.BUGSNAP_API_KEY }}
          base-url: http://localhost:3000
```

Inputs: `api-key` (required), `base-url`, `api-url`, `github-token`, `fail-on-bug`. Output: `result` (`passed`, `failed` or `none`).
