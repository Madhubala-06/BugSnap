import Link from "next/link"
import { Bug, Video, Zap, Users, ArrowRight, CheckCircle } from "lucide-react"

const features = [
  {
    icon: Video,
    title: "Screen Recording",
    description: "One-click recording captures everything - screen, clicks, and interactions.",
  },
  {
    icon: Bug,
    title: "Auto Log Capture",
    description: "Console errors, network requests, and user actions captured automatically.",
  },
  {
    icon: Zap,
    title: "AI Analysis",
    description: "AI generates bug reports with reproduction steps and root cause analysis.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Share bug reports instantly with your team via link or integrations.",
  },
]

const benefits = [
  "No more vague bug descriptions",
  "Complete technical context captured",
  "AI-powered root cause detection",
  "Faster debugging cycles",
]

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <nav className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bug className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold text-foreground">BugSnap</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-foreground-secondary hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <Link
              href="/dashboard"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary-hover transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <section className="py-20 bg-gradient-to-b from-primary-muted to-background">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold text-foreground mb-6">
            Bug reporting,<br />powered by AI
          </h1>
          <p className="text-xl text-foreground-secondary mb-8 max-w-2xl mx-auto">
            Stop writing bug reports manually. Record your screen, and let AI generate
            complete bug reports with reproduction steps and technical analysis.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/dashboard"
              className="bg-primary text-primary-foreground px-6 py-3 rounded-lg hover:bg-primary-hover transition-colors flex items-center gap-2 font-medium"
            >
              Open Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button className="border border-border text-foreground px-6 py-3 rounded-lg hover:bg-background-secondary transition-colors font-medium">
              Install Extension
            </button>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">How it works</h2>
          <div className="grid md:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={feature.title} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-muted text-primary mb-4">
                  <feature.icon className="h-6 w-6" />
                </div>
                <div className="text-sm text-primary font-medium mb-2">Step {index + 1}</div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">{feature.title}</h3>
                <p className="text-foreground-secondary">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-background-secondary">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6 text-foreground">
                Better bug reports mean faster fixes
              </h2>
              <p className="text-foreground-secondary mb-6">
                Traditional bug reports lack context. Developers spend hours asking for more
                information. BugSnap captures everything automatically, so your team
                can focus on fixing instead of investigating.
              </p>
              <ul className="space-y-3">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-success" />
                    <span className="text-foreground">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-card rounded-lg shadow-lg p-6 border border-border">
              <div className="flex items-center gap-2 mb-4">
                <span className="font-mono text-sm text-foreground-muted">BUG-127</span>
                <span className="bg-severity-high-bg text-severity-high text-xs px-2 py-1 rounded-full">High</span>
              </div>
              <h3 className="font-semibold mb-2 text-foreground">Dashboard filter not updating</h3>
              <div className="text-sm text-foreground-secondary mb-4">
                <p className="font-medium text-foreground mb-1">AI Analysis:</p>
                <p>The filter component is not triggering a re-fetch. The API call is missing
                the updated date parameters.</p>
              </div>
              <div className="text-sm">
                <p className="font-medium text-foreground mb-1">Steps to Reproduce:</p>
                <ol className="list-decimal list-inside text-foreground-secondary space-y-1">
                  <li>Open dashboard</li>
                  <li>Click date filter</li>
                  <li>Select "Last 7 days"</li>
                  <li>Click apply</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4 text-foreground">Ready to improve your bug workflow?</h2>
          <p className="text-foreground-secondary mb-8">Start capturing better bug reports today.</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg hover:bg-primary-hover transition-colors font-medium"
          >
            Go to Dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-foreground-muted text-sm">
          BugSnap - Capture, analyze, and report bugs automatically
        </div>
      </footer>
    </main>
  )
}
