"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Check, ChevronDown, ExternalLink, Loader2 } from "lucide-react"
import { useMe } from "@/components/auth-gate"
import { useCrumbs } from "@/components/shell/workspace-data"
import { can } from "@/lib/auth"
import {
  connectIntegration,
  disconnectIntegration,
  getIntegrations,
  githubInstallUrl,
  githubRepos,
  updateIntegration,
  type IntegrationsState,
  type Provider,
} from "@/lib/api"
import { GithubMark, JiraMark, LinearMark, SlackMark } from "@/components/brand/logos"
import { Menu, MenuCheckItem, MenuContent, MenuTrigger } from "@/components/kit/menu"
import { Dialog, DialogContent } from "@/components/kit/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const INFO: Record<Provider, { name: string; blurb: string; Logo: (p: { className?: string }) => JSX.Element }> = {
  github: { name: "GitHub", blurb: "Create issues in one click. Closing the issue resolves the bug, and resolving the bug closes the issue.", Logo: GithubMark },
  linear: { name: "Linear", blurb: "Create Linear issues from bugs. Status stays in sync both ways.", Logo: LinearMark },
  jira: { name: "Jira", blurb: "Create Jira tickets from bugs. Moving the ticket to Done resolves the bug, and the other way round.", Logo: JiraMark },
  slack: { name: "Slack", blurb: "Post new, assigned and resolved bugs to a channel.", Logo: SlackMark },
}
const ORDER: Provider[] = ["github", "slack", "linear", "jira"]

export default function IntegrationsPage() {
  return (
    <Suspense>
      <Integrations />
    </Suspense>
  )
}

function Integrations() {
  useCrumbs([{ label: "Integrations" }])
  const me = useMe()
  const isAdmin = can(me, "admin")
  const params = useSearchParams()
  const router = useRouter()
  const [state, setState] = useState<IntegrationsState | null>(null)
  const [dialog, setDialog] = useState<Provider | null>(null)

  const load = useCallback(() => getIntegrations().then(setState).catch(() => toast.error("Could not load integrations")), [])
  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const connected = params.get("connected")
    const error = params.get("error")
    if (connected) toast.success(`${INFO[connected as Provider]?.name ?? connected} connected`)
    if (error) toast.error(error.startsWith("github") ? "GitHub install did not finish. Please try again from this page." : "Something went wrong")
    if (connected || error) router.replace("/dashboard/integrations")
  }, [params, router])

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <h1 className="text-xl font-semibold tracking-tight">Integrations</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        Send bugs where your team already works. {isAdmin ? "" : "Only admins can connect tools; anyone can use them."}
      </p>

      {!state ? (
        <div className="grid gap-4 sm:grid-cols-2">{ORDER.map((p) => <div key={p} className="h-40 animate-pulse rounded-xl bg-background-secondary" />)}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {ORDER.map((p) => (
            <IntegrationCard key={p} provider={p} state={state} isAdmin={isAdmin} onConnect={() => setDialog(p)} onChange={load} />
          ))}
        </div>
      )}

      {dialog && dialog !== "github" && (
        <ConnectDialog
          provider={dialog}
          onClose={() => setDialog(null)}
          onDone={(s) => {
            setState(s)
            setDialog(null)
            toast.success(`${INFO[dialog].name} connected`)
          }}
        />
      )}
    </div>
  )
}

function IntegrationCard({ provider, state, isAdmin, onConnect, onChange }: { provider: Provider; state: IntegrationsState; isAdmin: boolean; onConnect: () => void; onChange: () => void }) {
  const { name, blurb, Logo } = INFO[provider]
  const conn = state.connected[provider]
  const cfg = (conn?.config ?? {}) as Record<string, unknown>
  const available = state.available[provider]
  const [busy, setBusy] = useState(false)

  const connectGithub = async () => {
    setBusy(true)
    try {
      window.location.href = (await githubInstallUrl()).url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "GitHub is not available yet")
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-border p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-background-secondary text-foreground"><Logo className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{name}</p>
          {conn ? (
            <p className="flex items-center gap-1 text-xs text-emerald-500"><Check className="h-3.5 w-3.5" />Connected{accountLabel(provider, cfg)}</p>
          ) : (
            <p className="text-xs text-foreground-muted">{available ? "Not connected" : "Coming soon"}</p>
          )}
        </div>
      </div>
      <p className="mb-4 flex-1 text-sm text-foreground-secondary">{blurb}</p>

      {conn ? (
        <div className="space-y-3">
          <Defaults provider={provider} cfg={cfg} isAdmin={isAdmin} onChange={onChange} />
          {isAdmin && (
            <button
              className="text-xs text-foreground-muted hover:text-red-400"
              onClick={async () => {
                if (!confirm(`Disconnect ${name}? Links on existing bugs stay.`)) return
                await disconnectIntegration(provider)
                toast.success(`${name} disconnected`)
                onChange()
              }}
            >
              Disconnect
            </button>
          )}
        </div>
      ) : (
        <Button
          variant="outline"
          disabled={!isAdmin || !available || busy}
          onClick={provider === "github" ? connectGithub : onConnect}
          className="self-start"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : provider === "github" ? <>Install on GitHub<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></> : `Connect ${name}`}
        </Button>
      )}
    </div>
  )
}

function accountLabel(provider: Provider, cfg: Record<string, unknown>) {
  const v = provider === "github" ? cfg.account : provider === "linear" ? cfg.organization : provider === "jira" ? cfg.site : cfg.channel
  return v ? ` · ${String(v).replace(/^https:\/\//, "")}` : ""
}

const pickBtn = "flex h-9 w-full items-center justify-between rounded-lg border border-border bg-background-secondary px-3 text-left text-sm outline-none disabled:opacity-60"

function Defaults({ provider, cfg, isAdmin, onChange }: { provider: Provider; cfg: Record<string, unknown>; isAdmin: boolean; onChange: () => void }) {
  const [repos, setRepos] = useState<{ fullName: string }[] | null>(null)
  const save = async (patch: Record<string, unknown>, message = "Saved") => {
    try {
      await updateIntegration(provider, patch)
      toast.success(message)
      onChange()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save")
    }
  }

  if (provider === "github") {
    return (
      <div>
        <p className="mb-1 text-xs text-foreground-muted">Default repository</p>
        <Menu onOpenChange={(o) => o && !repos && githubRepos().then(setRepos).catch(() => setRepos([]))}>
          <MenuTrigger disabled={!isAdmin} className={pickBtn}>
            <span className="truncate font-mono text-[13px]">{String(cfg.defaultRepo ?? "Choose a repository")}</span>
            <ChevronDown className="h-4 w-4 text-foreground-muted" />
          </MenuTrigger>
          <MenuContent className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-auto">
            {repos === null ? <p className="p-2 text-sm text-foreground-muted">Loading…</p> : repos.length === 0 ? <p className="p-2 text-sm text-foreground-muted">No repositories. Give the app access on GitHub.</p> : null}
            {repos?.map((r) => (
              <MenuCheckItem key={r.fullName} checked={cfg.defaultRepo === r.fullName} onSelect={() => save({ defaultRepo: r.fullName }, `Default repository: ${r.fullName}`)}>
                <span className="font-mono text-[13px]">{r.fullName}</span>
              </MenuCheckItem>
            ))}
          </MenuContent>
        </Menu>
      </div>
    )
  }
  if (provider === "linear") {
    const teams = (cfg.teams as { id: string; key: string; name: string }[]) ?? []
    const team = teams.find((t) => t.id === cfg.teamId)
    return (
      <div>
        <p className="mb-1 text-xs text-foreground-muted">Default team{cfg.sync ? " · status sync on" : ""}</p>
        <Menu>
          <MenuTrigger disabled={!isAdmin} className={pickBtn}>
            <span>{team ? `${team.key} · ${team.name}` : "Choose a team"}</span>
            <ChevronDown className="h-4 w-4 text-foreground-muted" />
          </MenuTrigger>
          <MenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
            {teams.map((t) => (
              <MenuCheckItem key={t.id} checked={t.id === cfg.teamId} onSelect={() => save({ teamId: t.id }, `Default team: ${t.name}`)}>{t.key} · {t.name}</MenuCheckItem>
            ))}
          </MenuContent>
        </Menu>
      </div>
    )
  }
  if (provider === "jira") {
    const projects = (cfg.projects as { key: string; name: string }[]) ?? []
    return (
      <div>
        <p className="mb-1 text-xs text-foreground-muted">Default project</p>
        <Menu>
          <MenuTrigger disabled={!isAdmin} className={pickBtn}>
            <span>{cfg.projectKey ? `${String(cfg.projectKey)} · ${projects.find((p) => p.key === cfg.projectKey)?.name ?? ""}` : "Choose a project"}</span>
            <ChevronDown className="h-4 w-4 text-foreground-muted" />
          </MenuTrigger>
          <MenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
            {projects.map((p) => (
              <MenuCheckItem key={p.key} checked={p.key === cfg.projectKey} onSelect={() => save({ projectKey: p.key }, `Default project: ${p.name}`)}>{p.key} · {p.name}</MenuCheckItem>
            ))}
          </MenuContent>
        </Menu>
      </div>
    )
  }
  const events = (cfg.events as string[]) ?? ["created", "assigned", "resolved"]
  const LABEL: Record<string, string> = { created: "New bugs", assigned: "Bug assigned", resolved: "Bug resolved" }
  return (
    <div>
      <p className="mb-1.5 text-xs text-foreground-muted">Post to Slack when</p>
      <div className="flex flex-wrap gap-1.5">
        {Object.keys(LABEL).map((e) => {
          const on = events.includes(e)
          return (
            <button
              key={e}
              disabled={!isAdmin}
              onClick={() => save({ events: on ? events.filter((x) => x !== e) : [...events, e] })}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${on ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-foreground-muted"}`}
            >
              {on && <Check className="h-3 w-3" />}{LABEL[e]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ConnectDialog({ provider, onClose, onDone }: { provider: Exclude<Provider, "github">; onClose: () => void; onDone: (s: IntegrationsState) => void }) {
  const [fields, setFields] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [k]: e.target.value }))

  const help: Record<typeof provider, React.ReactNode> = {
    slack: (
      <ol className="list-decimal space-y-1 pl-5">
        <li>In Slack, open <a className="text-primary underline" href="https://api.slack.com/apps?new_app=1" target="_blank" rel="noreferrer">api.slack.com/apps</a> and create an app “BugSnap” (from scratch) in your workspace.</li>
        <li>Turn on <b>Incoming Webhooks</b>, click <b>Add New Webhook to Workspace</b> and pick a channel.</li>
        <li>Copy the webhook URL and paste it here. We send a test message.</li>
      </ol>
    ),
    linear: (
      <p>
        In Linear, open <b>Settings → Account → Security &amp; access → Personal API keys</b>, create a key named “BugSnap” and paste it here.
        BugSnap also sets up a webhook so status changes sync back.
      </p>
    ),
    jira: (
      <p>
        Create an API token at{" "}
        <a className="text-primary underline" href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">id.atlassian.com → API tokens</a>
        , then enter your Jira site, the account email and the token. Tickets are created as that account.
      </p>
    ),
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Connect ${INFO[provider].name}`}>
        <div className="mb-4 text-sm text-foreground-secondary">{help[provider]}</div>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            try {
              onDone(await connectIntegration(provider, fields))
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not connect")
              setBusy(false)
            }
          }}
        >
          {provider === "slack" && (
            <>
              <Input autoFocus required placeholder="https://hooks.slack.com/services/…" value={fields.webhookUrl ?? ""} onChange={set("webhookUrl")} />
              <Input placeholder="Channel name (optional, for your reference) e.g. #bugs" value={fields.channel ?? ""} onChange={set("channel")} />
            </>
          )}
          {provider === "linear" && <Input autoFocus required type="password" placeholder="lin_api_…" value={fields.apiKey ?? ""} onChange={set("apiKey")} autoComplete="off" />}
          {provider === "jira" && (
            <>
              <Input autoFocus required placeholder="acme.atlassian.net" value={fields.site ?? ""} onChange={set("site")} />
              <Input required type="email" placeholder="you@acme.com" value={fields.email ?? ""} onChange={set("email")} />
              <Input required type="password" placeholder="API token" value={fields.token ?? ""} onChange={set("token")} autoComplete="off" />
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Connect</Button>
          </div>
          <p className="text-xs text-foreground-muted">Keys are stored encrypted and only used for this workspace.</p>
        </form>
      </DialogContent>
    </Dialog>
  )
}
