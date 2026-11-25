"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, Check, Loader2, Mail, Puzzle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getMe, getToken, requestCode, setToken, verifyCode } from "@/lib/auth"
import { LoginShowcase } from "./showcase"

const RESEND_AFTER = 30

function mailLink(email: string): { label: string; href: string } | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? ""
  if (domain === "gmail.com" || domain === "googlemail.com") return { label: "Open Gmail", href: "https://mail.google.com/mail/u/0/#search/BugSnap+newer_than%3A1h" }
  if (/^(outlook|hotmail|live)\./.test(domain)) return { label: "Open Outlook", href: "https://outlook.live.com/mail/" }
  if (domain === "yahoo.com") return { label: "Open Yahoo Mail", href: "https://mail.yahoo.com/" }
  return null
}

/** Six boxes, one digit each. Typing moves on; pasting or autofilling a full code fills them all. */
function CodeInput({ value, onChange, onComplete, disabled }: { value: string; onChange: (v: string) => void; onComplete: (v: string) => void; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "")

  useEffect(() => {
    refs.current[0]?.focus()
  }, [])

  const set = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, 6)
    onChange(clean)
    if (clean.length === 6) onComplete(clean)
    return clean
  }

  return (
    <div
      className="flex gap-2"
      onPaste={(e) => {
        const text = e.clipboardData.getData("text")
        if (!/\d/.test(text)) return
        e.preventDefault()
        const clean = set(text)
        refs.current[Math.min(clean.length, 5)]?.focus()
      }}
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          aria-label={`Digit ${i + 1} of 6`}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={i === 0 ? 6 : 1}
          disabled={disabled}
          value={d}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, "")
            if (!typed) return
            if (typed.length > 1) {
              const clean = set(typed)
              refs.current[Math.min(clean.length, 5)]?.focus()
              return
            }
            set((value.slice(0, i) + typed + value.slice(i + 1)).slice(0, 6))
            refs.current[i + 1]?.focus()
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault()
              if (value[i]) set(value.slice(0, i) + value.slice(i + 1))
              else if (i > 0) {
                set(value.slice(0, i - 1) + value.slice(i))
                refs.current[i - 1]?.focus()
              }
            } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus()
            else if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus()
          }}
          onFocus={(e) => e.target.select()}
          className="h-12 w-full min-w-0 rounded-lg border border-border bg-background-secondary text-center font-mono text-lg text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
        />
      ))}
    </div>
  )
}

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/dashboard"
  const forExtension = next.startsWith("/extension/connect")
  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState(params.get("email") ?? "")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [wait, setWait] = useState(0)
  const [resent, setResent] = useState(false)

  // Skip the form only if the saved sign-in still works.
  useEffect(() => {
    if (!getToken()) return
    getMe().then((me) => {
      if (me) router.replace(next)
      else setToken(null)
    })
  }, [router, next])

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const sendCode = async (e?: React.FormEvent, again = false) => {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await requestCode(email.trim())
      setDevCode(result.devCode ?? null)
      setStep("code")
      setCode("")
      setWait(RESEND_AFTER)
      setResent(again)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code")
    } finally {
      setBusy(false)
    }
  }

  const verify = async (value = code) => {
    if (value.length !== 6 || busy) return
    setBusy(true)
    setError(null)
    try {
      const { token } = await verifyCode(email.trim(), value)
      setToken(token)
      router.replace(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in")
      setCode("")
      setBusy(false)
    }
  }

  const mail = mailLink(email)

  return (
    <div className="w-full max-w-[380px]">
      {step === "email" ? (
        <form onSubmit={sendCode} className="space-y-5">
          <div>
            {forExtension && (
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary">
                <Puzzle className="h-3.5 w-3.5" /> Connecting the Chrome extension
              </p>
            )}
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground">
              {forExtension ? "Sign in to connect the extension" : "Welcome to BugSnap"}
            </h1>
            <p className="mt-2 text-[15px] leading-6 text-foreground-secondary">
              Sign in or create your free account. We email you a 6-digit code, so there is no password to remember.
            </p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Email</span>
            <Input
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="h-11"
            />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="h-11 w-full gap-2 text-[15px]" disabled={busy || !email}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Continue with email
          </Button>
          <ul className="space-y-1.5 pt-1 text-[13px] text-foreground-muted">
            <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary" />Free to start, no card needed</li>
            <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary" />New accounts get a private workspace</li>
          </ul>
        </form>
      ) : (
        <div className="space-y-5">
          <button
            type="button"
            onClick={() => {
              setStep("email")
              setCode("")
              setError(null)
            }}
            className="flex items-center gap-1 text-sm text-foreground-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Use a different email
          </button>
          <div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground">Check your email</h1>
            <p className="mt-2 text-[15px] leading-6 text-foreground-secondary">
              {resent ? "We sent a new code to " : "We sent a 6-digit code to "}
              <span className="text-foreground">{email}</span>. It works for 10 minutes.
            </p>
          </div>
          {devCode && (
            <p className="rounded-md border border-border bg-background-secondary px-3 py-2 font-mono text-xs text-foreground-secondary">
              Local dev (no email set up): your code is {devCode}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              verify()
            }}
            className="space-y-4"
          >
            <CodeInput value={code} onChange={setCode} onComplete={verify} disabled={busy} />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="h-11 w-full gap-2 text-[15px]" disabled={busy || code.length !== 6}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Sign in<ArrowRight className="h-4 w-4" /></>}
            </Button>
          </form>
          <div className="flex items-center justify-between text-sm">
            {mail ? (
              <a href={mail.href} target="_blank" rel="noreferrer" className="text-primary hover:underline">{mail.label}</a>
            ) : (
              <span className="text-foreground-muted">Check your spam folder too.</span>
            )}
            <button type="button" onClick={() => sendCode(undefined, true)} disabled={busy || wait > 0} className="text-foreground-secondary hover:text-foreground disabled:text-foreground-muted">
              {wait > 0 ? `Resend in ${wait}s` : "Resend code"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="flex min-h-screen flex-col px-6 py-6 sm:px-10">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={30} height={30} className="rounded-lg shadow-[0_0_18px_-4px_rgba(59,130,246,.7)]" />
            <span className="text-[17px] font-semibold tracking-tight text-foreground">BugSnap</span>
          </Link>
          <Link href="/" className="text-sm text-foreground-muted hover:text-foreground">Back to home</Link>
        </header>
        <div className="flex flex-1 items-center justify-center py-10">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <footer className="text-center text-xs text-foreground-muted lg:text-left">
          By continuing you agree to our <Link href="/terms" className="underline hover:text-foreground">Terms</Link> and{" "}
          <Link href="/privacy" className="underline hover:text-foreground">Privacy policy</Link>.
        </footer>
      </section>
      <LoginShowcase />
    </main>
  )
}
