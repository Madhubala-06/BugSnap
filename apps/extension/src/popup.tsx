import { useEffect, useRef, useState } from "react"
import type { RecordingState } from "./lib/types"
import { apiFetch, getAuth, signOut, type StoredAuth } from "./lib/auth"
import { DEFAULT_APP_URL } from "./lib/storage"
import "../style.css"
import logoUrl from "data-base64:~assets/icon.png"

const W = "w-[332px]"
const RESTRICTED = /^(chrome|chrome-extension|edge|about|devtools|view-source):|^https:\/\/chromewebstore\.google\.com|^https:\/\/chrome\.google\.com\/webstore/

function openDashboard(path = "/dashboard") {
  chrome.tabs.create({ url: `${DEFAULT_APP_URL}${path}` })
  window.close()
}

function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]" title="Open BugSnap">
      <img src={logoUrl} alt="" className="h-7 w-7 rounded-md shadow-[0_0_14px_-3px_rgba(59,130,246,.8)]" />
      <span className="text-[15px] font-semibold tracking-tight text-white">BugSnap</span>
    </button>
  )
}

function Skeleton() {
  return (
    <div className={`${W} space-y-3 bg-[#111113] p-4`}>
      <div className="h-7 w-28 animate-pulse rounded-md bg-[#1d1d21]" />
      <div className="h-16 animate-pulse rounded-xl bg-[#1d1d21]" />
      <div className="h-11 animate-pulse rounded-xl bg-[#1d1d21]" />
    </div>
  )
}

function SignedOut() {
  const signIn = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    await chrome.runtime.sendMessage({ type: "OPEN_SIGN_IN", returnTabId: tab?.id })
    window.close()
  }
  return (
    <div className={`${W} bg-[#111113] px-6 pb-6 pt-8 text-center`}>
      <img src={logoUrl} alt="" className="mx-auto mb-4 h-12 w-12 rounded-xl shadow-[0_0_22px_-4px_rgba(59,130,246,.8)]" />
      <h1 className="text-[17px] font-semibold text-white">Sign in to continue</h1>
      <p className="mx-auto mt-1.5 max-w-[250px] text-[13px] leading-5 text-[#8b8b93]">
        Record a bug once. BugSnap writes the report, steps and a test for you.
      </p>
      <button onClick={signIn} className="mt-5 w-full rounded-xl bg-[#3b82f6] py-2.5 text-sm font-medium text-white transition hover:bg-[#2563eb]">
        Sign in
      </button>
      <p className="mt-3 text-[11.5px] text-[#5c5c64]">New here? Signing in creates your free account.</p>
    </div>
  )
}

function Avatar({ auth, onSignOut }: { auth: StoredAuth; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [])
  const initial = (auth.name || auth.email).trim()[0]?.toUpperCase() ?? "?"
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid h-8 w-8 place-items-center rounded-full bg-[#3b82f6]/15 text-[13px] font-semibold text-[#93c5fd] ring-1 ring-[#3b82f6]/30 hover:ring-[#3b82f6]/60"
        title={auth.email}
        aria-label="Account menu"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 w-56 overflow-hidden rounded-xl border border-[#26262b] bg-[#16161a] shadow-2xl">
          <div className="border-b border-[#26262b] px-3 py-2.5">
            <p className="truncate text-[13px] font-medium text-white">{auth.name || auth.email}</p>
            <p className="truncate text-xs text-[#8b8b93]">{auth.email}</p>
            {auth.workspaceName && <p className="mt-1 truncate text-xs text-[#5c5c64]">{auth.workspaceName}</p>}
          </div>
          <button onClick={() => openDashboard()} className="block w-full px-3 py-2 text-left text-[13px] text-[#d4d4d8] hover:bg-[#1f1f24]">Open dashboard</button>
          <button onClick={() => openDashboard("/dashboard/reports")} className="block w-full px-3 py-2 text-left text-[13px] text-[#d4d4d8] hover:bg-[#1f1f24]">My bug reports</button>
          <button onClick={onSignOut} className="block w-full border-t border-[#26262b] px-3 py-2 text-left text-[13px] text-[#f87171] hover:bg-[#1f1f24]">Sign out</button>
        </div>
      )}
    </div>
  )
}

function useActiveTab() {
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null)
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => setTab(t ?? null))
  }, [])
  return tab
}

function usePinned() {
  const [pinned, setPinned] = useState(true)
  useEffect(() => {
    const action = chrome.action as unknown as { getUserSettings?: () => Promise<{ isOnToolbar: boolean }> }
    action.getUserSettings?.().then((s) => setPinned(s.isOnToolbar)).catch(() => undefined)
  }, [])
  return pinned
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`

function SignedIn({ auth, onSignOut }: { auth: StoredAuth; onSignOut: () => void }) {
  const tab = useActiveTab()
  const pinned = usePinned()
  const [state, setState] = useState<RecordingState>({ isRecording: false, session: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }).then((r) => r?.state && setState(r.state)).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (!state.isRecording) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [state.isRecording])

  const restricted = !!tab?.url && RESTRICTED.test(tab.url)
  const host = (() => {
    try {
      return tab?.url ? new URL(tab.url).host : ""
    } catch {
      return ""
    }
  })()

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const url = chrome.runtime.getURL(`tabs/recorder.html${tab?.id ? `?tabId=${tab.id}` : ""}`)
      await chrome.tabs.create({ url, index: (tab?.index ?? 0) + 1, active: true })
      window.close()
    } catch {
      setError("Could not open the recorder")
      setBusy(false)
    }
  }

  const finish = async () => {
    setBusy(true)
    const r = await chrome.runtime.sendMessage({ type: "STOP_RECORDING" }).catch(() => null)
    if (r?.success) setState({ isRecording: false, session: r.session })
    else setError(r?.error ?? "Could not stop the recording")
    setBusy(false)
  }

  const goToRecorder = async () => {
    const [rec] = await chrome.tabs.query({ url: chrome.runtime.getURL("tabs/recorder.html") + "*" })
    if (rec?.id) {
      await chrome.tabs.update(rec.id, { active: true })
      if (rec.windowId) await chrome.windows.update(rec.windowId, { focused: true })
    }
    window.close()
  }

  const elapsed = state.session?.startTime ? Math.max(0, Math.floor((now - state.session.startTime) / 1000)) : 0
  const events = state.session?.logs?.length ?? 0

  return (
    <div className={`${W} min-h-[270px] bg-[#111113] text-[#ededef]`}>
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <Logo onClick={() => openDashboard()} />
        <Avatar auth={auth} onSignOut={onSignOut} />
      </div>

      <div className="px-4 pb-4 pt-2">
        {state.isRecording ? (
          <>
            <div className="rounded-xl border border-[#f87171]/25 bg-[#f87171]/[0.06] p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium text-white">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f87171] opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
                  </span>
                  Recording
                </span>
                <span className="font-mono text-lg tabular-nums text-white">{fmt(elapsed)}</span>
              </div>
              <p className="mt-2 text-xs text-[#a1a1aa]">
                {events} event{events === 1 ? "" : "s"} captured{state.session?.metadata?.url ? ` on ${safeHost(state.session.metadata.url)}` : ""}
              </p>
            </div>
            <button onClick={finish} disabled={busy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ef4444] py-2.5 text-sm font-medium text-white transition hover:bg-[#dc2626] disabled:opacity-60">
              <span className="h-3 w-3 rounded-[3px] bg-white" />
              {busy ? "Finishing…" : "Finish and create report"}
            </button>
            <button onClick={goToRecorder} className="mt-2 w-full rounded-xl py-2 text-xs text-[#8b8b93] hover:text-white">Go to the recorder tab</button>
          </>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-xl border border-[#232327] bg-[#16161a] p-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#5c5c64]">This tab</p>
              <div className="mt-1.5 flex items-center gap-2">
                {tab?.favIconUrl && !restricted ? <img src={tab.favIconUrl} alt="" className="h-4 w-4 rounded-sm" /> : <span className="h-4 w-4 rounded-sm bg-[#26262b]" />}
                <span className="truncate text-[13px] text-white">{tab?.title || host || "Current page"}</span>
              </div>
              {host && !restricted && <p className="mt-0.5 truncate pl-6 text-xs text-[#5c5c64]">{host}</p>}
              {restricted && (
                <div className="absolute inset-0 grid place-items-center bg-[#16161a]/95 px-4 text-center">
                  <p className="text-[12.5px] leading-5 text-[#a1a1aa]">
                    <span className="font-medium text-white">Can’t record this page.</span> Open the website with the bug, then click BugSnap again.
                  </p>
                </div>
              )}
            </div>

            {!pinned && (
              <p className="mt-3 rounded-lg bg-[#3b82f6]/10 px-3 py-2 text-xs leading-5 text-[#93c5fd]">
                Tip: pin BugSnap to your toolbar. Click the puzzle icon, then the pin next to BugSnap.
              </p>
            )}

            {error && <p className="mt-3 rounded-lg bg-[#f87171]/10 px-3 py-2 text-xs text-[#f87171]">{error}</p>}

            <button
              onClick={start}
              disabled={busy || restricted}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b82f6] py-3 text-sm font-medium text-white shadow-[0_8px_24px_-10px_rgba(59,130,246,.8)] transition hover:bg-[#2563eb] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-white" />
              {busy ? "Opening…" : "Start recording"}
            </button>
            <p className="mt-2.5 text-center text-[11.5px] leading-4 text-[#5c5c64]">Records your screen, clicks, console and network. Passwords and keys are hidden.</p>
          </>
        )}
      </div>
    </div>
  )
}

function safeHost(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function Popup() {
  const [auth, setAuthState] = useState<StoredAuth | null | undefined>(undefined)

  useEffect(() => {
    getAuth().then(async (saved) => {
      setAuthState(saved)
      if (!saved) return
      // Refresh name/workspace, and notice if the sign-in was ended elsewhere.
      try {
        const res = await apiFetch("/auth/me")
        if (res.ok) {
          const me = await res.json()
          const fresh = { ...saved, email: me.email, name: me.name, workspaceName: me.workspace?.name }
          await chrome.storage.local.set({ bugsnapAuth: fresh })
        }
      } catch {
        // 401 clears the sign-in (handled in apiFetch); offline keeps the saved one
      }
    })
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && "bugsnapAuth" in changes) setAuthState(changes.bugsnapAuth.newValue ?? null)
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [])

  if (auth === undefined) return <Skeleton />
  if (!auth) return <SignedOut />
  return (
    <SignedIn
      auth={auth}
      onSignOut={async () => {
        await signOut()
        setAuthState(null)
      }}
    />
  )
}

export default Popup
