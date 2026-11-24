"use client"

import * as D from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

export function DialogContent({
  className,
  children,
  title,
  description,
  hideClose,
  ...props
}: D.DialogContentProps & { title?: React.ReactNode; description?: React.ReactNode; hideClose?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 rounded-xl border border-border bg-card p-5 text-foreground shadow-[0_24px_64px_-16px_rgba(0,0,0,.6)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 focus:outline-none",
          className
        )}
        {...props}
      >
        {title ? (
          <D.Title className="pr-8 text-base font-semibold">{title}</D.Title>
        ) : (
          <D.Title className="sr-only">Dialog</D.Title>
        )}
        {description ? <D.Description className="mt-1 text-sm text-foreground-secondary">{description}</D.Description> : <D.Description className="sr-only" />}
        <div className={title ? "mt-4" : ""}>{children}</div>
        {!hideClose && (
          <D.Close className="absolute right-3 top-3 rounded-md p-1.5 text-foreground-muted hover:bg-background-tertiary hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  )
}
