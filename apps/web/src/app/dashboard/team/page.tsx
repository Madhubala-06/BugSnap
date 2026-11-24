"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Check, ChevronDown, Copy, Mail, MoreHorizontal, UserPlus } from "lucide-react"
import { useMe } from "@/components/auth-gate"
import { useCrumbs } from "@/components/shell/workspace-data"
import { can, type Role } from "@/lib/auth"
import { getTeam, inviteMembers, removeMember, revokeInvite, setMemberRole, type PendingInvite, type TeamMember } from "@/lib/api"
import { ago, Avatar } from "@/components/kit/bits"
import { Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/kit/menu"
import { Dialog, DialogContent } from "@/components/kit/dialog"
import { Button } from "@/components/ui/button"

const ROLE_INFO: Record<Role, { label: string; hint: string }> = {
  owner: { label: "Owner", hint: "Everything, including other owners" },
  admin: { label: "Admin", hint: "Invite people, change roles and settings" },
  member: { label: "Member", hint: "Record, triage and fix bugs" },
  guest: { label: "Guest", hint: "Record bugs, view and comment. Good for clients" },
}
const ROLES: Role[] = ["owner", "admin", "member", "guest"]

export default function TeamPage() {
  return (
    <Suspense>
      <Team />
    </Suspense>
  )
}

function Team() {
  const me = useMe()
  const params = useSearchParams()
  useCrumbs([{ label: "Team" }])
  const [members, setMembers] = useState<TeamMember[] | null>(null)
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [inviteOpen, setInviteOpen] = useState(params.get("invite") === "1")
  const isAdmin = can(me, "admin")

  const load = useCallback(() => {
    getTeam()
      .then((t) => {
        setMembers(t.members)
        setInvites(t.invites)
      })
      .catch(() => toast.error("Could not load the team"))
  }, [])
  useEffect(load, [load])

  const changeRole = async (m: TeamMember, role: Role) => {
    try {
      await setMemberRole(m.id, role)
      toast.success(`${m.name} is now ${ROLE_INFO[role].label.toLowerCase()}`)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the role")
    }
  }

  const remove = async (m: TeamMember) => {
    const self = m.id === me?.id
    try {
      await removeMember(self ? "me" : m.id)
      if (self) {
        window.location.href = "/dashboard"
        return
      }
      toast.success(`${m.name} was removed. Their open bugs went back to the inbox.`)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove")
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-foreground-muted">
            People in {me?.workspace.name}. {isAdmin ? "Invite teammates, or clients as guests." : "Only admins can invite people."}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setInviteOpen(true)} className="gap-1.5">
            <UserPlus className="h-4 w-4" />Invite people
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="border-b border-border bg-background-secondary px-4 py-2 text-xs font-medium text-foreground-muted">
          {members ? `${members.length} ${members.length === 1 ? "member" : "members"}` : "Members"}
        </div>
        {members === null ? (
          <div className="space-y-px p-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-md bg-background-secondary" />)}</div>
        ) : (
          <ul>
            {members.map((m) => {
              const self = m.id === me?.id
              const canEdit = isAdmin && !self && (m.role !== "owner" || me?.role === "owner")
              return (
                <li key={m.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                  <Avatar name={m.name} email={m.email} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.name} {self && <span className="font-normal text-foreground-muted">(you)</span>}
                    </p>
                    <p className="truncate text-xs text-foreground-muted">{m.email} · joined {ago(m.joinedAt)}</p>
                  </div>
                  {canEdit ? (
                    <Menu>
                      <MenuTrigger className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-[13px] outline-none hover:bg-background-tertiary">
                        {ROLE_INFO[m.role].label}<ChevronDown className="h-3.5 w-3.5 text-foreground-muted" />
                      </MenuTrigger>
                      <MenuContent align="end" className="w-72">
                        {ROLES.filter((r) => r !== "owner" || me?.role === "owner").map((r) => (
                          <MenuCheckItem key={r} checked={m.role === r} onSelect={() => changeRole(m, r)}>
                            <span>
                              <span className="block text-foreground">{ROLE_INFO[r].label}</span>
                              <span className="block text-xs text-foreground-muted">{ROLE_INFO[r].hint}</span>
                            </span>
                          </MenuCheckItem>
                        ))}
                      </MenuContent>
                    </Menu>
                  ) : (
                    <span className="px-2.5 text-[13px] text-foreground-secondary">{ROLE_INFO[m.role].label}</span>
                  )}
                  {(canEdit || self) && (
                    <Menu>
                      <MenuTrigger className="grid h-8 w-8 place-items-center rounded-lg text-foreground-muted outline-none hover:bg-background-tertiary" aria-label={`More for ${m.name}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </MenuTrigger>
                      <MenuContent align="end">
                        <MenuItem onSelect={() => remove(m)} className="text-red-400 data-[highlighted]:text-red-400">
                          {self ? "Leave workspace" : `Remove ${m.name}`}
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {isAdmin && invites.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border bg-background-secondary px-4 py-2 text-xs font-medium text-foreground-muted">Pending invites</div>
          <ul>
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                <span className="grid h-[30px] w-[30px] place-items-center rounded-full border border-dashed border-border-hover text-foreground-muted">
                  <Mail className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{i.email}</p>
                  <p className="text-xs text-foreground-muted">
                    {ROLE_INFO[i.role].label} · invited by {i.invitedBy} {ago(i.createdAt)} · expires in {Math.max(1, Math.round((new Date(i.expiresAt).getTime() - Date.now()) / 86400000))} days
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await inviteMembers(i.email, i.role)
                      toast.success(`Invite sent again to ${i.email}`)
                      load()
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not resend")
                    }
                  }}
                >
                  Resend
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await revokeInvite(i.id)
                    toast.success("Invite cancelled")
                    load()
                  }}
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {ROLES.map((r) => (
          <div key={r} className="rounded-lg border border-border px-3 py-2.5">
            <p className="text-sm font-medium">{ROLE_INFO[r].label}</p>
            <p className="text-xs text-foreground-muted">{ROLE_INFO[r].hint}</p>
          </div>
        ))}
      </div>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onDone={load} canOwner={me?.role === "owner"} />
    </div>
  )
}

function InviteDialog({ open, onOpenChange, onDone, canOwner }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void; canOwner: boolean }) {
  const [emails, setEmails] = useState("")
  const [role, setRole] = useState<Role>("member")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<{ email: string; status: string; url?: string }[] | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const close = (o: boolean) => {
    onOpenChange(o)
    if (!o) {
      setSent(null)
      setEmails("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title="Invite people" description="They get an email with a link. You can also copy the link and send it yourself.">
        {sent ? (
          <div className="space-y-3">
            <ul className="space-y-2">
              {sent.map((r) => (
                <li key={r.email} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="min-w-0 flex-1 truncate">{r.email}</span>
                  {r.status === "already_member" ? (
                    <span className="text-xs text-foreground-muted">already in the team</span>
                  ) : (
                    r.url && (
                      <button
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        onClick={async () => {
                          await navigator.clipboard.writeText(r.url!)
                          setCopied(r.email)
                          setTimeout(() => setCopied(null), 1500)
                        }}
                      >
                        {copied === r.email ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied === r.email ? "Copied" : "Copy link"}
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSent(null)}>Invite more</Button>
              <Button onClick={() => close(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              try {
                const res = await inviteMembers(emails, role)
                setSent(res.results)
                onDone()
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not send the invites")
              } finally {
                setBusy(false)
              }
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Emails</span>
              <textarea
                autoFocus
                rows={3}
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder="priya@acme.com, arjun@acme.com"
                className="w-full resize-none rounded-lg border border-border bg-background-secondary px-3 py-2 text-sm outline-none placeholder:text-foreground-muted focus:border-primary"
              />
            </label>
            <div>
              <span className="mb-1.5 block text-sm font-medium">Role</span>
              <Menu>
                <MenuTrigger className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-background-secondary px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span>
                    {ROLE_INFO[role].label} <span className="text-foreground-muted">· {ROLE_INFO[role].hint}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-foreground-muted" />
                </MenuTrigger>
                <MenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                  <MenuLabel>They can…</MenuLabel>
                  {ROLES.filter((r) => r !== "owner" || canOwner).map((r) => (
                    <MenuCheckItem key={r} checked={role === r} onSelect={() => setRole(r)}>
                      <span>
                        <span className="block text-foreground">{ROLE_INFO[r].label}</span>
                        <span className="block text-xs text-foreground-muted">{ROLE_INFO[r].hint}</span>
                      </span>
                    </MenuCheckItem>
                  ))}
                  <MenuSeparator />
                  <MenuLabel>Up to 50 people per workspace while BugSnap is free.</MenuLabel>
                </MenuContent>
              </Menu>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button type="submit" disabled={busy || !emails.trim()}>Send invites</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
