"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Loader2 } from "lucide-react"
import { getMe, getToken, type Me } from "@/lib/auth"

const MeContext = createContext<Me | null>(null)
export const useMe = () => useContext(MeContext)

const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))])

/** Shows the dashboard only to signed-in users. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [me, setMe] = useState<Me | null>(null)
  const [failed, setFailed] = useState(false)

  const check = useCallback(async () => {
    setFailed(false)
    if (!getToken()) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`)
      return
    }
    // Retry once: the first request after a quiet period can be slow.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const user = await withTimeout(getMe(), 12_000)
        if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`)
        else setMe(user)
        return
      } catch {
        // try again
      }
    }
    setFailed(true)
  }, [router, pathname])

  useEffect(() => {
    if (!me) check()
  }, [check, me])

  if (!me) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background" aria-busy={!failed}>
        {failed ? (
          <>
            <p className="text-sm text-foreground-secondary">BugSnap is taking too long to respond.</p>
            <button onClick={check} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Try again
            </button>
          </>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
        )}
      </div>
    )
  }
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>
}
