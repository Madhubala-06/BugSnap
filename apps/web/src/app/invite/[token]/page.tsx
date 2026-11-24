"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Loader2, Users } from "lucide-react"
import { acceptInvite, previewInvite } from "@/lib/api"
import { getMe, getToken, setToken, type Me } from "@/lib/auth"
import { Button } from "@/components/ui/button"

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [invite, setInvite] = useState<{ workspace: string; email: string; role: string; invitedBy: string } | null>(null)
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    previewInvite(token).then(setInvite).catch((e) => setError(e instanceof Error ? e.message : "This invite is not valid"))
    if (getToken()) getMe().then(setMe).catch(() => setMe(null))
    else setMe(null)
  }, [token])

  const next = `/invite/${token}`
  const wrongUser = me && invite && me.email.toLowerCase() !== invite.email.toLowerCase()

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-10 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={32} height={32} className="rounded-lg shadow-[0_0_18px_-4px_rgba(59,130,246,.7)]" />
          <span className="text-lg font-semibold tracking-tight text-foreground">BugSnap</span>
        </Link>

        {error ? (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Invite not available</h1>
            <p className="mt-2 text-sm text-foreground-secondary">{error}</p>
            <Button className="mt-6" variant="outline" onClick={() => router.push("/dashboard")}>Go to BugSnap</Button>
          </div>
        ) : !invite || me === undefined ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
        ) : (
          <div>
            <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary"><Users className="h-6 w-6" /></span>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Join {invite.workspace}</h1>
            <p className="mt-2 text-sm text-foreground-secondary">
              {invite.invitedBy} invited <b className="text-foreground">{invite.email}</b> to join as <b className="text-foreground">{invite.role}</b>.
            </p>

            {!me ? (
              <Button className="mt-6 w-full" onClick={() => router.push(`/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`)}>
                Sign in as {invite.email}
              </Button>
            ) : wrongUser ? (
              <div className="mt-6 space-y-3">
                <p className="rounded-lg border border-border bg-background-secondary p-3 text-sm text-foreground-secondary">
                  You are signed in as {me.email}. This invite is for {invite.email}.
                </p>
                <Button
                  className="w-full"
                  onClick={() => {
                    setToken(null)
                    router.push(`/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`)
                  }}
                >
                  Switch to {invite.email}
                </Button>
              </div>
            ) : (
              <Button
                className="mt-6 w-full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await acceptInvite(token)
                    window.location.href = "/dashboard"
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not accept the invite")
                    setBusy(false)
                  }
                }}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Accept and open {invite.workspace}
              </Button>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
