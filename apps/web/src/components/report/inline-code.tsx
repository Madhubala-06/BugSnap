/** Shows `backtick` parts of AI text as inline code. */
export function InlineCode({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]{1,300}`)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <code key={i} className="rounded bg-background-secondary px-1 py-0.5 font-mono text-[0.85em] text-foreground [overflow-wrap:anywhere]">
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}
