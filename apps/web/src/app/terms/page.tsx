import type { Metadata } from "next"
import Link from "next/link"
import { LegalPage } from "@/components/legal/legal-page"

export const metadata: Metadata = { title: "Terms · BugSnap" }

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="24 November 2026">
      <p>By using BugSnap you agree to these terms. They are short on purpose.</p>
      <h2>The service</h2>
      <p>
        BugSnap is offered free, as is, while it is in early access. Features and limits (such as the monthly free AI write-ups) may change. We
        try to keep it running, but we cannot promise it will always be available or error free.
      </p>
      <h2>Your content</h2>
      <p>
        You own your recordings and reports. You give BugSnap permission to store and process them only to run the service, as described in the{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>
      <h2>Use it fairly</h2>
      <ul>
        <li>Only record pages and data you are allowed to record.</li>
        <li>Do not use BugSnap to collect other people&apos;s personal data without their permission.</li>
        <li>Do not try to break, overload or get around the limits of the service.</li>
      </ul>
      <h2>Ending</h2>
      <p>You can stop using BugSnap at any time and ask us to delete your data. We may suspend accounts that break these terms.</p>
      <h2>Liability</h2>
      <p>To the extent the law allows, BugSnap is not liable for indirect losses, or for loss of data, arising from using the service.</p>
    </LegalPage>
  )
}
