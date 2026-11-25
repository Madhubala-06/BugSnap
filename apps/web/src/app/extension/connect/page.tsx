"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, PlugZap } from "lucide-react"
import { API_URL, authFetch, getToken } from "@/lib/auth"
import { askExtension, extensionInstalled } from "@/lib/extension"

type Step = "working" | "done" | "missing" | "error"

/**
 * The extension's "Sign in" button opens this page. If you are signed in on the website,
 * the extension gets its own sign-in automatically; otherwise you log in first and land back here.
 */
export default function ConnectExtensionPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("working")
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (!getToken()) {
      router.replace("/login?next=/extension/connect")
      return
    }
    ;(async () => {
      // The extension's helper script marks the page when it loads; give it a moment.
      for (let i = 0; i < 20 && !extensionInstalled(); i++) await new Promise((r) => setTimeout(r, 100))
      if (!extensionInstalled()) return setStep("missing")
      const res = await authFetch(`${API_URL}/auth/extension-token`, { method: "POST" })
      if (res.status === 401) return router.replace("/login?next=/extension/connect")
      if (!res.ok) {
        setError("Could not create a sign-in for the extension.")
        return setStep("error")
      }
      const { token, me } = (await res.json()) as { token: string; me: { email: string; name: string; workspace: { name: string } } }
      const reply = await askExtension("BUGSNAP_SIGN_IN", { token, email: me.email, name: me.name, workspaceName: me.workspace.name })
      if (!reply?.ok) {
        setError(reply?.error ?? "The extension did not answer. Reload this page and try again.")
        return setStep("error")
      }
      setEmail(me.email)
      setStep("done")
    })()
  }, [router])

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" width={44} height={44} className="mx-auto mb-6 rounded-xl shadow-[0_0_22px_-4px_rgba(59,130,246,.7)]" />
        {step === "working" && (
          <>
            <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-foreground-muted" />
            <h1 className="text-lg font-semibold">Signing in the extension…</h1>
          </>
        )}
        {step === "done" && (
          <>
            <CheckCircle2 className="mx-auto mb-3 h-7 w-7 text-emerald-500" />
            <h1 className="text-lg font-semibold">The extension is signed in</h1>
            <p className="mt-2 text-sm text-foreground-muted">
              Signed in as <span className="text-foreground">{email}</span>. Go back to the page with the bug and click the BugSnap icon to start recording.
            </p>
            <p className="mt-6 text-xs text-foreground-muted">This tab closes by itself.</p>
          </>
        )}
        {step === "missing" && (
          <>
            <PlugZap className="mx-auto mb-3 h-7 w-7 text-foreground-muted" />
            <h1 className="text-lg font-semibold">Extension not found</h1>
            <p className="mt-2 text-sm text-foreground-muted">Install the BugSnap Chrome extension, then click its Sign in button again.</p>
            <Link href="/dashboard/settings#extension" className="mt-6 inline-block text-sm text-primary hover:underline">How to install it</Link>
          </>
        )}
        {step === "error" && (
          <>
            <h1 className="text-lg font-semibold">Could not sign in the extension</h1>
            <p className="mt-2 text-sm text-foreground-muted">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-6 text-sm text-primary hover:underline">Try again</button>
          </>
        )}
      </div>
    </main>
  )
}
