"use client"

import { useEffect, useState } from "react"
import { Bot, Check, Copy, KeyRound, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { API_URL, createApiKey, listApiKeys, revokeApiKey, type ApiKey } from "@/lib/api"

function CopyBlock({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 pr-20 font-mono text-xs text-foreground-secondary">{text}</pre>
      <button
        aria-label={`Copy ${label}`}
        onClick={async () => {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-border bg-background-secondary px-2 py-1 text-xs text-foreground-secondary hover:text-foreground"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}

/** API keys and setup for coding agents (MCP). */
export function AgentKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [name, setName] = useState("Claude Code")
  const [fresh, setFresh] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = () => listApiKeys().then(setKeys).catch(() => undefined)
  useEffect(() => {
    load()
  }, [])

  const mcpUrl = `${API_URL}/mcp`
  const key = fresh ?? "bsk_YOUR_KEY"
  const claude = `claude mcp add --transport http bugsnap ${mcpUrl} --header "Authorization: Bearer ${key}"`
  const cursor = JSON.stringify({ mcpServers: { bugsnap: { url: mcpUrl, headers: { Authorization: `Bearer ${key}` } } } }, null, 2)

  return (
    <Card id="agents">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          Connect your AI coding agent
        </CardTitle>
        <CardDescription>
          Claude Code, Cursor and other MCP tools can list your bugs, read the exact errors and timeline, get a regression test, and mark bugs fixed.
          Try asking: &ldquo;Fix the latest BugSnap bug&rdquo;.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError(null)
            try {
              const created = await createApiKey(name)
              setFresh(created.key ?? null)
              load()
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not create a key")
            } finally {
              setBusy(false)
            }
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name" aria-label="Key name" className="max-w-xs" />
          <Button type="submit" disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Create key
          </Button>
        </form>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        {fresh && (
          <div className="space-y-1 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm font-medium text-foreground">Your new key. Copy it now, it is shown only once.</p>
            <CopyBlock text={fresh} label="key" />
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Claude Code</p>
          <CopyBlock text={claude} label="Claude Code command" />
          <p className="pt-2 text-sm font-medium text-foreground">Cursor (.cursor/mcp.json)</p>
          <CopyBlock text={cursor} label="Cursor config" />
        </div>

        {keys.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-foreground">{k.name}</p>
                  <p className="font-mono text-xs text-foreground-muted">
                    {k.prefix}… · {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleDateString("en-GB")}` : "never used"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Revoke ${k.name}`}
                  onClick={async () => {
                    await revokeApiKey(k.id)
                    load()
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
