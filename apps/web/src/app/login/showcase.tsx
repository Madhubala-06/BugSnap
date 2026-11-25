import { Bot, FlaskConical, Github, Play, Sparkles, TriangleAlert } from "lucide-react"

/** Right side of the login page: a small, honest preview of what one recording turns into. */
export function LoginShowcase() {
  return (
    <aside className="relative hidden overflow-hidden border-l border-border bg-[#0c0d10] lg:flex lg:flex-col lg:justify-center">
      {/* faint grid + blue light */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at 55% 45%, black 30%, transparent 75%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[38%] h-[420px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3b82f6]/[0.13] blur-[90px]"
      />

      <div className="relative mx-auto w-full max-w-[500px] px-10">
        <p className="mb-2 text-[13px] font-medium text-primary">One recording in, a ready-to-fix bug out</p>
        <h2 className="mb-8 text-[26px] font-semibold leading-tight tracking-tight text-foreground">
          Show the bug once.
          <br />
          BugSnap writes the rest.
        </h2>

        {/* the report card */}
        <div className="bs-card rounded-2xl border border-white/[0.08] bg-[#131418]/95 p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,.9)] backdrop-blur">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-foreground-muted">BUG-128</span>
            <span className="rounded-md bg-orange-500/15 px-1.5 py-0.5 text-[11px] font-medium text-orange-400">high</span>
            <span className="ml-auto flex items-center gap-1 text-foreground-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Open
            </span>
          </div>
          <p className="mt-2 text-[15px] font-semibold text-foreground">Pay button spins forever on checkout</p>

          <div className="mt-3 grid grid-cols-[150px_1fr] gap-3">
            {/* tiny video frame */}
            <div className="relative h-[92px] overflow-hidden rounded-lg border border-white/[0.06] bg-[#1a1c22]">
              <div className="absolute left-2 right-2 top-2 h-2 rounded bg-white/[0.07]" />
              <div className="absolute left-2 top-6 h-2 w-16 rounded bg-white/[0.05]" />
              <div className="absolute bottom-3 left-2 right-2 h-5 rounded bg-[#3b82f6]/70" />
              <span className="bs-click absolute bottom-[14px] left-[62px] h-4 w-4 rounded-full border-2 border-red-400" />
              <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/60 px-1 py-0.5 font-mono text-[9px] text-white/80">
                <Play className="h-2.5 w-2.5" />
                0:14
              </span>
            </div>
            <div className="min-w-0 space-y-1.5 text-[12px]">
              <p className="bs-row flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-primary" style={{ animationDelay: ".2s" }}>
                <Sparkles className="h-3 w-3" /> AI summary
              </p>
              <p className="bs-row leading-[1.45] text-foreground-secondary" style={{ animationDelay: ".45s" }}>
                Clicking Pay sends <span className="font-mono text-[11px] text-foreground">POST /api/pay</span>, which fails with 500. The button never stops
                loading.
              </p>
            </div>
          </div>

          <ol className="mt-3 space-y-1 text-[12px] text-foreground-secondary">
            {["Open the cart", "Enter card details", "Click Pay"].map((s, i) => (
              <li key={s} className="bs-row flex gap-2" style={{ animationDelay: `${0.7 + i * 0.18}s` }}>
                <span className="font-mono text-foreground-muted">{i + 1}.</span>
                {s}
              </li>
            ))}
          </ol>

          <div
            className="bs-row mt-3 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-2.5 py-2 font-mono text-[11px] text-red-300"
            style={{ animationDelay: "1.3s" }}
          >
            <TriangleAlert className="mt-px h-3.5 w-3.5 flex-none" />
            <span className="truncate">TypeError: Cannot read properties of undefined (reading &apos;total&apos;)</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <span
              className="bs-chip inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] px-2 py-1 text-[11.5px] text-foreground-secondary"
              style={{ animationDelay: "1.6s" }}
            >
              <Github className="h-3.5 w-3.5" /> acme/shop#142
            </span>
            <span
              className="bs-chip inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] px-2 py-1 text-[11.5px] text-foreground-secondary"
              style={{ animationDelay: "1.75s" }}
            >
              <FlaskConical className="h-3.5 w-3.5" /> Playwright test ready
            </span>
            <span
              className="bs-chip inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11.5px] text-primary"
              style={{ animationDelay: "1.9s" }}
            >
              <Bot className="h-3.5 w-3.5" /> Fix with AI
            </span>
          </div>
        </div>

        <ul className="mt-8 grid grid-cols-3 gap-4 text-[12.5px] leading-5 text-foreground-muted">
          <li>
            <span className="block font-medium text-foreground">Records it all</span>Screen, clicks, console and network
          </li>
          <li>
            <span className="block font-medium text-foreground">Writes the report</span>Steps, expected vs actual, likely cause
          </li>
          <li>
            <span className="block font-medium text-foreground">Sends it on</span>GitHub, Linear, Jira or Slack
          </li>
        </ul>
      </div>

      <style>{`
        .bs-row, .bs-chip { opacity: 0; transform: translateY(4px); animation: bs-in .45s ease-out forwards; }
        .bs-chip { transform: scale(.96); }
        .bs-click { animation: bs-click 2.4s ease-out infinite; }
        @keyframes bs-in { to { opacity: 1; transform: none; } }
        @keyframes bs-click { 0%, 55% { opacity: 0; transform: scale(.4); } 62% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.8); } }
        @media (prefers-reduced-motion: reduce) {
          .bs-row, .bs-chip { opacity: 1; transform: none; animation: none; }
          .bs-click { animation: none; opacity: .8; }
        }
      `}</style>
    </aside>
  )
}
