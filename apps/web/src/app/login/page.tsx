"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Loader2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getMe, getToken, requestCode, setToken, verifyCode } from "@/lib/auth"

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/dashboard"
  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState(params.get("email") ?? "")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  // Skip the form only if the saved sign-in still works.
  useEffect(() => {
    if (!getToken()) return
    getMe().then((me) => {
      if (me) router.replace(next)
      else setToken(null)
    })
  }, [router, next])

  useEffect(() => {
    if (step === "code") codeRef.current?.focus()
  }, [step])

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await requestCode(email)
      setDevCode(result.devCode ?? null)
      setStep("code")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code")
    } finally {
      setBusy(false)
    }
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { token } = await verifyCode(email, code)
      setToken(token)
      router.replace(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in")
      setBusy(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <Link href="/" className="mb-10 flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" width={32} height={32} className="rounded-lg shadow-[0_0_18px_-4px_rgba(59,130,246,.7)]" />
        <span className="text-lg font-semibold tracking-tight text-foreground">BugSnap</span>
      </Link>

      {step === "email" ? (
        <form onSubmit={sendCode} className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sign in</h1>
            <p className="mt-1 text-sm text-foreground-secondary">We will email you a 6-digit code. No password needed.</p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Work email</span>
            <Input
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full gap-2" disabled={busy || !email}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Email me a code
          </Button>
          <p className="text-xs text-foreground-muted">New here? Signing in creates your private workspace.</p>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <button
            type="button"
            onClick={() => {
              setStep("email")
              setCode("")
              setError(null)
            }}
            className="flex items-center gap-1 text-sm text-foreground-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Change email
          </button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Check your email</h1>
            <p className="mt-1 text-sm text-foreground-secondary">
              We sent a code to <span className="text-foreground">{email}</span>. It works for 10 minutes.
            </p>
          </div>
          {devCode && (
            <p className="rounded-md border border-border bg-background-secondary px-3 py-2 font-mono text-xs text-foreground-secondary">
              Local dev (no email set up): your code is {devCode}
            </p>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">6-digit code</span>
            <Input
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="font-mono tracking-[0.3em]"
            />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || code.replace(/\D/g, "").length !== 6}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </Button>
          <button type="button" onClick={() => sendCode()} disabled={busy} className="text-sm text-primary hover:underline disabled:opacity-50">
            Send a new code
          </button>
        </form>
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}
