"use client"

import { useState, useEffect } from "react"
import { Eye, EyeOff, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export default function SettingsPage() {
  const [geminiKey, setGeminiKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedHint, setSavedHint] = useState("")

  useEffect(() => {
    // Load existing API key
    fetch(`${API_URL}/settings/gemini-key`)
      .then((res) => res.json())
      .then((data) => {
        if (data.key) {
          setSavedHint(data.key)
        }
      })
      .catch(console.error)
  }, [])

  const handleSaveKey = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/settings/gemini-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: geminiKey }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch (err) {
      console.error("Failed to save API key:", err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-foreground-secondary">Manage your account and preferences</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>AI Configuration</CardTitle>
            <CardDescription>Configure Gemini for automatic bug descriptions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Gemini API Key</label>
              <p className="text-xs text-foreground-muted mb-2">
                Used to analyze screenshots and generate bug descriptions automatically
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder={savedHint ? `Saved: ${savedHint} (type a new key to replace it)` : "AIza..."}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button onClick={handleSaveKey} disabled={saving || !geminiKey}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : saved ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    "Save Key"
                  )}
                </Button>
              </div>
              <p className="text-xs text-foreground-muted mt-2">
                Get your API key from{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  aistudio.google.com/apikey
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Update your personal information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">First Name</label>
                <Input placeholder="Your first name" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Last Name</label>
                <Input placeholder="Your last name" className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input placeholder="you@company.com" type="email" className="mt-1" />
            </div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>Manage your workspace settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Workspace Name</label>
              <Input placeholder="Your team or company" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Workspace URL</label>
              <div className="mt-1 flex">
                <span className="inline-flex items-center rounded-l-md border border-r-0 border-border bg-background-secondary px-3 text-sm text-foreground-secondary">
                  bugsnap.app/
                </span>
                <Input placeholder="your-team" className="rounded-l-none" />
              </div>
            </div>
            <Button>Update Workspace</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>Connect with your favorite tools</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-primary-muted">
                    <span className="text-lg text-primary font-semibold">J</span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Jira</p>
                    <p className="text-sm text-foreground-secondary">Create Jira tickets automatically</p>
                  </div>
                </div>
                <Button variant="outline">Connect</Button>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-accent-muted">
                    <span className="text-lg text-accent font-semibold">S</span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Slack</p>
                    <p className="text-sm text-foreground-secondary">Send bug reports to Slack channels</p>
                  </div>
                </div>
                <Button variant="outline">Connect</Button>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-foreground">
                    <span className="text-lg text-background font-semibold">G</span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">GitHub</p>
                    <p className="text-sm text-foreground-secondary">Link bugs to GitHub issues</p>
                  </div>
                </div>
                <Button variant="outline">Connect</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Configure how you receive updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <label className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Email notifications</p>
                  <p className="text-sm text-foreground-secondary">Receive email when a new bug is reported</p>
                </div>
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
              </label>
              <label className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Critical bug alerts</p>
                  <p className="text-sm text-foreground-secondary">Get notified immediately for critical bugs</p>
                </div>
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
              </label>
              <label className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Weekly digest</p>
                  <p className="text-sm text-foreground-secondary">Receive a weekly summary of bug activity</p>
                </div>
                <input type="checkbox" className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
              </label>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
