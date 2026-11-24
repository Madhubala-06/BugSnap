"use client"

import { useCrumbs } from "@/components/shell/workspace-data"
import { useState, useEffect } from "react"
import { Eye, EyeOff, Check, Loader2, Trash2, Puzzle, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { API_URL, authFetch, signOut } from "@/lib/auth"
import { useMe } from "@/components/auth-gate"
import { AgentKeys } from "@/components/agent-keys"
import { saveGithubRepo, renameWorkspace, updateProfile } from "@/lib/api"
import { can } from "@/lib/auth"
import { toast } from "sonner"

const EXTENSION_URL = process.env.NEXT_PUBLIC_EXTENSION_URL || ""

export default function SettingsPage() {
  useCrumbs([{ label: "Settings" }])
  const me = useMe()
  const [geminiKey, setGeminiKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedHint, setSavedHint] = useState("")
  const [usingServerKey, setUsingServerKey] = useState(false)
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null)
  const [repo, setRepo] = useState("")
  const [repoMsg, setRepoMsg] = useState<string | null>(null)
  const isAdmin = can(me, "admin")
  const [name, setName] = useState(me?.name ?? "")
  const [notify, setNotify] = useState(me?.notifyEmail ?? true)
  const [wsName, setWsName] = useState(me?.workspace.name ?? "")
  const [error, setError] = useState<string | null>(null)

  const load = () =>
    authFetch(`${API_URL}/settings/gemini-key`)
      .then((res) => res.json())
      .then((data) => {
        setSavedHint(data.key ?? "")
        setUsingServerKey(Boolean(data.usingServerKey))
        setUsage({ used: data.sharedUsed ?? 0, limit: data.sharedLimit ?? 0 })
        setRepo((r) => r || data.githubRepo || "")
      })
      .catch(() => undefined)

  useEffect(() => {
    load()
  }, [])

  const handleSaveKey = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await authFetch(`${API_URL}/settings/gemini-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: geminiKey }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || "Could not save the key")
      }
      setGeminiKey("")
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the key")
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveKey = async () => {
    await authFetch(`${API_URL}/settings/gemini-key`, { method: "DELETE" })
    load()
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-foreground-secondary">Your workspace, the AI key and the Chrome extension</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Your profile</CardTitle>
            <CardDescription>How teammates see you, and which emails you get.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault()
                await updateProfile({ name })
                toast.success("Name saved")
              }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" className="max-w-xs" />
              <Button type="submit" variant="outline" disabled={!name.trim() || name === me?.name}>Save</Button>
            </form>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={notify}
                onChange={async (e) => {
                  setNotify(e.target.checked)
                  await updateProfile({ notifyEmail: e.target.checked })
                  toast.success(e.target.checked ? "Emails on" : "Emails off")
                }}
                className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
              />
              <span>
                <span className="block text-foreground">Email me when a bug is assigned to me or someone @mentions me</span>
                <span className="block text-xs text-foreground-muted">Sent to {me?.email}</span>
              </span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>{isAdmin ? "The name your team sees." : "Only admins can rename the workspace."}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault()
                try {
                  await renameWorkspace(wsName)
                  window.location.reload()
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not rename")
                }
              }}
            >
              <Input value={wsName} onChange={(e) => setWsName(e.target.value)} disabled={!isAdmin} aria-label="Workspace name" className="max-w-xs" />
              {isAdmin && <Button type="submit" variant="outline" disabled={!wsName.trim() || wsName === me?.workspace.name}>Rename</Button>}
            </form>
          </CardContent>
        </Card>

        <Card id="extension">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Puzzle className="h-5 w-5 text-primary" />
              Record a bug with the Chrome extension
            </CardTitle>
            <CardDescription>Reports are created from the extension. It records your screen, clicks, console and network.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground-secondary">
              <li>
                {EXTENSION_URL ? (
                  <a href={EXTENSION_URL} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    Install BugSnap for Chrome
                  </a>
                ) : (
                  <>Install the BugSnap extension (load the built folder in <span className="font-mono text-foreground">chrome://extensions</span> with Developer mode on).</>
                )}
              </li>
              <li>
                Click the BugSnap icon and sign in with <span className="text-foreground">{me?.email}</span>.
              </li>
              <li>Open the page with the bug, press Record, show the bug, then press Stop.</li>
              <li>The report shows up here with the video, timeline and AI write-up.</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI write-ups</CardTitle>
            <CardDescription>BugSnap uses Google Gemini to turn a recording into a bug report.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="text-sm font-medium text-foreground" htmlFor="gemini-key">
              Gemini API key for this workspace
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  disabled={!isAdmin}
                  id="gemini-key"
                  type={showKey ? "text" : "password"}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder={savedHint ? `Saved: ${savedHint} (type a new key to replace it)` : "AIza..."}
                  className="pr-10"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? "Hide key" : "Show key"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button onClick={handleSaveKey} disabled={saving || !geminiKey}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : "Save key"}
              </Button>
              {savedHint && (
                <Button variant="outline" onClick={handleRemoveKey} aria-label="Remove key">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <p className="text-xs text-foreground-muted">
              {savedHint
                ? "Your key is stored encrypted and only used for this workspace. No BugSnap limit."
                : usingServerKey && usage
                  ? `Using BugSnap's free AI: ${usage.used} of ${usage.limit} write-ups used this month. Add your own key for unlimited write-ups.`
                  : "No key saved. Reports are still created, just without the AI write-up."}{" "}
              Get a free key at{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                aistudio.google.com/apikey
              </a>
              .
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>GitHub</CardTitle>
            <CardDescription>The repository for the &ldquo;GitHub issue&rdquo; button on reports. Nothing is posted for you: GitHub opens with the issue filled in.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault()
                setRepoMsg(null)
                try {
                  const saved = await saveGithubRepo(repo)
                  setRepo(saved.githubRepo ?? "")
                  setRepoMsg(saved.githubRepo ? "Saved" : "Removed")
                } catch (err) {
                  setRepoMsg(err instanceof Error ? err.message : "Could not save")
                }
              }}
            >
              <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" aria-label="GitHub repository" className="max-w-xs" disabled={!isAdmin} />
              {isAdmin && <Button type="submit" variant="outline">Save</Button>}
            </form>
            {repoMsg && <p className="mt-2 text-sm text-foreground-secondary" role="status">{repoMsg}</p>}
          </CardContent>
        </Card>

        <AgentKeys />

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div className="min-w-0 text-sm">
              <p className="text-foreground">{me?.email}</p>
              <p className="text-foreground-muted">{me?.workspace.name}</p>
            </div>
            <Button variant="outline" onClick={() => signOut()} className="gap-2">
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
