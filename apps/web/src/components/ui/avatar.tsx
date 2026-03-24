import { cn } from "@/lib/utils"

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string
  fallback: string
}

function Avatar({ src, fallback, className, ...props }: AvatarProps) {
  return (
    <div
      className={cn(
        "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      {src ? (
        <img src={src} alt={fallback} className="aspect-square h-full w-full" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gray-200 text-sm font-medium text-gray-600">
          {fallback}
        </div>
      )}
    </div>
  )
}

export { Avatar }
