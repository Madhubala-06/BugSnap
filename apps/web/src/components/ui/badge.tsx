import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-background-tertiary text-foreground",
      critical: "bg-severity-critical-bg text-severity-critical",
      high: "bg-severity-high-bg text-severity-high",
      medium: "bg-severity-medium-bg text-severity-medium",
      low: "bg-severity-low-bg text-severity-low",
      info: "bg-primary-muted text-primary",
      success: "bg-success-muted text-success",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
