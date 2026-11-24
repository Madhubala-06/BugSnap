// Small monochrome-friendly marks for the integrations we support.
export function GithubMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}
export function SlackMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#E01E5A" d="M5.04 15.17a2.52 2.52 0 1 1-2.52-2.52h2.52v2.52Zm1.27 0a2.52 2.52 0 0 1 5.04 0v6.31a2.52 2.52 0 1 1-5.04 0v-6.31Z" />
      <path fill="#36C5F0" d="M8.83 5.04a2.52 2.52 0 1 1 2.52-2.52v2.52H8.83Zm0 1.27a2.52 2.52 0 0 1 0 5.04H2.52a2.52 2.52 0 0 1 0-5.04h6.31Z" />
      <path fill="#2EB67D" d="M18.96 8.83a2.52 2.52 0 1 1 2.52 2.52h-2.52V8.83Zm-1.27 0a2.52 2.52 0 0 1-5.04 0V2.52a2.52 2.52 0 1 1 5.04 0v6.31Z" />
      <path fill="#ECB22E" d="M15.17 18.96a2.52 2.52 0 1 1-2.52 2.52v-2.52h2.52Zm0-1.27a2.52 2.52 0 0 1 0-5.04h6.31a2.52 2.52 0 1 1 0 5.04h-6.31Z" />
    </svg>
  )
}
export function LinearMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="#5E6AD2" aria-hidden>
      <path d="M2.9 14.3 9.7 21.1A10 10 0 0 1 2.9 14.3Zm-.9-3 10.7 10.7a10 10 0 0 0 2.3-.4L2.4 9a10 10 0 0 0-.4 2.3Zm1-4 13.7 13.7c.6-.3 1.2-.6 1.7-1L4 5.3c-.4.5-.7 1.1-1 1.7Zm2.4-3a10 10 0 1 1 14.3 14.3L5.4 4.3Z" />
    </svg>
  )
}
export function JiraMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#2684FF" d="M22.2 11.4 12.6 1.8 11.7.9 4.5 8.1l-2.7 2.7a.8.8 0 0 0 0 1.2l6.6 6.6 3.6 3.6 7.2-7.2.1-.1 2.9-2.9a.8.8 0 0 0 0-1.2Zm-10.2 4-3.3-3.3 3.3-3.3 3.3 3.3-3.3 3.3Z" />
    </svg>
  )
}
