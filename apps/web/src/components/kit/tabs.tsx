"use client"

import * as TB from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

export const Tabs = TB.Root
export const TabsContent = TB.Content

export function TabsList({ className, ...props }: TB.TabsListProps) {
  return <TB.List className={cn("flex gap-1 border-b border-border", className)} {...props} />
}

export function TabsTrigger({ className, ...props }: TB.TabsTriggerProps) {
  return (
    <TB.Trigger
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-2.5 py-2 text-sm text-foreground-muted transition-colors hover:text-foreground-secondary",
        "data-[state=active]:border-primary data-[state=active]:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t",
        className
      )}
      {...props}
    />
  )
}

export function Count({ children, tone }: { children: React.ReactNode; tone?: "red" | "blue" }) {
  return (
    <span className={cn("font-mono text-[11px]", tone === "red" ? "text-destructive" : tone === "blue" ? "text-primary" : "text-foreground-muted")}>
      {children}
    </span>
  )
}
