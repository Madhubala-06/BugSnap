import type { Metadata } from "next"
import Landing from "@/components/landing/landing"

export const metadata: Metadata = {
  title: "BugSnap · Record a bug once. The agent does the rest.",
  description:
    "BugSnap records the bug, reads the console and network logs, replays the steps in a clean browser, finds duplicates and drafts the ticket. You approve before it's filed.",
}

export default function Home() {
  return <Landing />
}
