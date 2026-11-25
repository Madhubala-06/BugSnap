import Link from "next/link"

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" width={44} height={44} className="mx-auto mb-6 rounded-xl shadow-[0_0_22px_-4px_rgba(59,130,246,.7)]" />
        <p className="font-mono text-sm text-primary">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">We could not find that page</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-foreground-secondary">The link may be old, or the bug report may have been deleted.</p>
        <div className="mt-6 flex justify-center gap-3 text-sm">
          <Link href="/dashboard" className="rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-primary/90">Go to dashboard</Link>
          <Link href="/" className="rounded-lg border border-border px-4 py-2 text-foreground-secondary hover:text-foreground">Home</Link>
        </div>
      </div>
    </main>
  )
}
