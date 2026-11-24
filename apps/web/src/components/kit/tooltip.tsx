"use client"

import * as T from "@radix-ui/react-tooltip"

export const TooltipProvider = T.Provider

export function Tip({ label, children, side = "bottom" }: { label: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-50 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md">
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}
