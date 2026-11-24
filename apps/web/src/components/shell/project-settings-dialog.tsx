"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, Copy, Globe, MessageSquareWarning, RefreshCw } from "lucide-react"
import { Dialog, DialogContent } from "@/components/kit/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/kit/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { API_URL, configureWidget, deleteProject, updateProject, type Project, type WidgetConfig } from "@/lib/api"
import { useWorkspace } from "./workspace-data"
import { useMe } from "@/components/auth-gate"
import { can } from "@/lib/auth"
import { cn } from "@/lib/utils"

const COLORS = ["#2563EB", "#7C3AED", "#DB2777", "#059669", "#D97706", "#111827"]

export function ProjectSettingsDialog({ project, open, onOpenChange, initialTab = "general" }: { project: Project; open: boolean; onOpenChange: (o: boolean) => void; initialTab?: "general" | "widget" }) {
  const router = useRouter()
  const me = useMe()
  const isAdmin = can(me, "admin")
  const { refreshProjects } = useWorkspace()
  const [name, setName] = useState(project.name)
  const [hosts, setHosts] = useState(project.hosts.join(", "))
  const [enabled, setEnabled] = useState(Boolean(project.widgetEnabled))
  const [key, setKey] = useState(project.widgetKey ?? null)
  const [cfg, setCfg] = useState<WidgetConfig>(project.widgetConfig ?? { label: "Report a bug", position: "bottom-right", color: "#2563EB" })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(project.name)
    setHosts(project.hosts.join(", "))
    setEnabled(Boolean(project.widgetEnabled))
    setKey(project.widgetKey ?? null)
    setCfg(project.widgetConfig ?? { label: "Report a bug", position: "bottom-right", color: "#2563EB" })
  }, [open, project])

  const hostList = hosts.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean)
  const snippet = key ? `<script src="${API_URL}/widget.js" data-key="${key}" async></script>` : ""

  const saveWidget = async (patch: { enabled?: boolean; config?: Partial<WidgetConfig>; rotateKey?: boolean }, message?: string) => {
    try {
      const res = await configureWidget(project.id, patch)
      setKey(res.widgetKey)
      setEnabled(res.widgetEnabled)
      setCfg(res.widgetConfig)
      await refreshProjects()
      if (message) toast.success(message)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the widget")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`${project.name} settings`} className="max-w-xl">
        <Tabs defaultValue={initialTab}>
          <TabsList>
            <TabsTrigger value="general"><Globe className="h-3.5 w-3.5" />General</TabsTrigger>
            <TabsTrigger value="widget"><MessageSquareWarning className="h-3.5 w-3.5" />Website widget{enabled && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />}</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4 space-y-4 outline-none">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Name</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Website addresses</span>
              <Input value={hosts} onChange={(e) => setHosts(e.target.value)} placeholder="app.acme.com, staging.acme.com, localhost:3000" />
              <span className="mt-1 block text-xs text-foreground-muted">Bugs recorded on these addresses go into this project. The website widget only works on these addresses.</span>
            </label>
            <div className="flex items-center justify-between">
              <button
                className="text-sm text-red-400 hover:underline"
                onClick={async () => {
                  if (!confirm(`Delete the project “${project.name}”? Its bugs stay, without a project.`)) return
                  await deleteProject(project.id)
                  await refreshProjects()
                  onOpenChange(false)
                  router.push("/dashboard/reports?view=all")
                }}
              >
                Delete project
              </button>
              <Button
                onClick={async () => {
                  try {
                    await updateProject(project.id, { name, hosts: hostList })
                    await refreshProjects()
                    toast.success("Project saved")
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not save")
                  }
                }}
              >
                Save
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="widget" className="mt-4 space-y-4 outline-none">
            <p className="text-sm text-foreground-secondary">
              Add a “Report a bug” button to your website. Your users and clients describe the problem, and BugSnap attaches the console errors,
              failed requests, clicks and a screenshot. No extension or account needed.
            </p>

            {!project.hosts.length && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                Add your website address in the General tab first. The widget only works on the project&apos;s own addresses.
              </p>
            )}

            <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <span>
                <span className="block text-sm font-medium">Widget is {enabled ? "on" : "off"}</span>
                <span className="block text-xs text-foreground-muted">{isAdmin ? "Turn it off any time; the button disappears from your site." : "Only admins can change the widget."}</span>
              </span>
              <button
                role="switch"
                aria-checked={enabled}
                disabled={!isAdmin || !project.hosts.length}
                onClick={() => saveWidget({ enabled: !enabled }, enabled ? "Widget turned off" : "Widget turned on")}
                className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40", enabled ? "bg-primary" : "bg-border-hover")}
              >
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", enabled ? "left-[22px]" : "left-0.5")} />
              </button>
            </label>

            {key && (
              <div>
                <span className="mb-1.5 flex items-center justify-between text-sm font-medium">
                  <span>Paste this into your site, before <code className="font-mono text-xs">&lt;/body&gt;</code></span>
                  {isAdmin && (
                    <button onClick={() => saveWidget({ rotateKey: true }, "New key made. Update the snippet on your site.")} className="inline-flex items-center gap-1 text-xs font-normal text-foreground-muted hover:text-foreground">
                      <RefreshCw className="h-3 w-3" />New key
                    </button>
                  )}
                </span>
                <div className="relative">
                  <pre className="whitespace-pre-wrap break-all rounded-lg border border-border bg-background-secondary p-3 pr-20 font-mono text-xs leading-relaxed text-foreground-secondary">{snippet}</pre>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(snippet)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    }}
                    className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-foreground-muted">
                  Works on: {project.hosts.join(", ") || "no addresses yet"}. Use <code className="font-mono">BugSnap.open()</code> to open it from your own button, and add <code className="font-mono">data-button=&quot;false&quot;</code> to hide ours.
                </p>
              </div>
            )}

            {isAdmin && (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Button text</span>
                  <Input
                    value={cfg.label}
                    onChange={(e) => setCfg({ ...cfg, label: e.target.value })}
                    onBlur={() => saveWidget({ config: { label: cfg.label } })}
                    maxLength={30}
                  />
                </label>
                <div>
                  <span className="mb-1.5 block text-sm font-medium">Position</span>
                  <div className="flex h-10 overflow-hidden rounded-lg border border-border text-sm">
                    {(["bottom-left", "bottom-right"] as const).map((pos) => (
                      <button key={pos} onClick={() => saveWidget({ config: { position: pos } })} className={cn("px-3", cfg.position === pos ? "bg-primary/15 text-primary" : "text-foreground-secondary hover:bg-background-tertiary")}>
                        {pos === "bottom-left" ? "Left" : "Right"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <span className="mb-1.5 block text-sm font-medium">Colour</span>
                  <div className="flex items-center gap-2">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        aria-label={`Colour ${c}`}
                        onClick={() => saveWidget({ config: { color: c } })}
                        className={cn("h-7 w-7 rounded-full ring-offset-2 ring-offset-card", cfg.color.toLowerCase() === c.toLowerCase() && "ring-2 ring-foreground")}
                        style={{ background: c }}
                      />
                    ))}
                    <span className="ml-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white" style={{ background: cfg.color }}>
                      {cfg.label || "Report a bug"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
