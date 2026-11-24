import type { Metadata } from "next"
import { LegalPage } from "@/components/legal/legal-page"

export const metadata: Metadata = { title: "Privacy · BugSnap" }

const CONTACT = "emadhubala1@gmail.com"

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="24 November 2026">
      <p>
        BugSnap helps you record a bug in your browser and turn it into a report. This page explains, in plain words, what we collect, why, and
        what we never collect.
      </p>

      <h2>What the Chrome extension collects</h2>
      <p>The extension only records while you are recording. When you press Stop, it sends one report to your workspace. It collects:</p>
      <ul>
        <li>A video of the screen, window or tab you choose to share, and a few screenshots from it.</li>
        <li>Console messages and errors from the page you are testing, including stack traces.</li>
        <li>Network requests that the page makes: method, address, status code, timing, and the response body of failed requests (shortened).</li>
        <li>What you clicked and which fields you changed (the element, not what you typed), and page changes.</li>
        <li>Page address and title, window size, screen size, browser version and language.</li>
      </ul>

      <h2>What we never collect</h2>
      <ul>
        <li>What you type into fields. We only note that a field changed.</li>
        <li>Passwords or anything in password fields.</li>
        <li>Request headers, cookies or your browsing history.</li>
        <li>Anything while you are not recording.</li>
      </ul>
      <p>
        Before a report leaves your browser, the extension hides values that look like secrets: tokens and keys in web addresses, bearer tokens,
        JSON web tokens and common API keys are replaced with <code>[hidden]</code>. Please still avoid recording screens with private data.
      </p>

      <h2>Your account</h2>
      <p>To sign in we store your email address. We email you a one-time code. We store only a scrambled (hashed) copy of codes and sign-in tokens.</p>

      <h2>AI write-ups</h2>
      <p>
        If AI write-ups are on, the screenshots, the captured logs and the page details of a report are sent to Google&apos;s Gemini API to write
        the summary, steps and likely cause. If you use BugSnap&apos;s free AI allowance, it runs on a free Gemini plan, and Google may use that
        content to improve its products. If you add your own Gemini key in Settings, your key&apos;s terms with Google apply instead. You can
        turn AI off by removing your key and not using the free allowance.
      </p>

      <h2>Where data is stored</h2>
      <ul>
        <li>Reports and accounts: a Postgres database run by Neon (Singapore).</li>
        <li>Videos and screenshots: Vercel Blob storage. Files have long, random addresses. Anyone who has a file&apos;s address can open it.</li>
        <li>The website and API run on Vercel.</li>
      </ul>

      <h2>Sharing</h2>
      <p>
        Reports are private to your workspace. If you create a share link, anyone with that link can view that one report until you press
        &ldquo;Stop sharing&rdquo;. The GitHub button only opens GitHub with text filled in. BugSnap does not post anything for you.
      </p>

      <h2>Keeping and deleting data</h2>
      <p>
        Data stays until you delete it. Deleting a report also deletes its video and screenshots. To delete your whole account and workspace,
        email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will do it within 30 days.
      </p>

      <h2>We do not sell data</h2>
      <p>We do not sell or rent your data, and we do not use it for advertising.</p>

      <h2>Contact</h2>
      <p>
        Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </LegalPage>
  )
}
