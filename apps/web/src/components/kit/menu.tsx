"use client"

import * as DM from "@radix-ui/react-dropdown-menu"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export const Menu = DM.Root
export const MenuTrigger = DM.Trigger
export const MenuGroup = DM.Group

export function MenuContent({ className, align = "start", sideOffset = 6, ...props }: DM.DropdownMenuContentProps) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[200px] overflow-hidden rounded-lg border border-border bg-card p-1 text-sm text-foreground shadow-[0_16px_48px_-12px_rgba(0,0,0,.55)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </DM.Portal>
  )
}

export function MenuItem({ className, inset, ...props }: DM.DropdownMenuItemProps & { inset?: boolean }) {
  return (
    <DM.Item
      className={cn(
        "flex cursor-default select-none items-center gap-2.5 rounded-md px-2 py-1.5 text-foreground-secondary outline-none",
        "data-[highlighted]:bg-background-tertiary data-[highlighted]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  )
}

/** Item with a check mark on the right when selected. */
export function MenuCheckItem({ checked, children, ...props }: DM.DropdownMenuItemProps & { checked?: boolean }) {
  return (
    <MenuItem {...props}>
      {children}
      <span className="ml-auto pl-3">{checked && <Check className="h-3.5 w-3.5 text-primary" />}</span>
    </MenuItem>
  )
}

export function MenuLabel({ className, ...props }: DM.DropdownMenuLabelProps) {
  return <DM.Label className={cn("px-2 py-1.5 text-xs font-medium text-foreground-muted", className)} {...props} />
}

export function MenuSeparator({ className, ...props }: DM.DropdownMenuSeparatorProps) {
  return <DM.Separator className={cn("my-1 h-px bg-border", className)} {...props} />
}

export function MenuHint({ children }: { children: React.ReactNode }) {
  return <span className="ml-auto pl-3 text-xs text-foreground-muted">{children}</span>
}
