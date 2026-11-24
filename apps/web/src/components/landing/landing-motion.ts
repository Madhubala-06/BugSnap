/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * All landing-page motion: hero capture field, crawling bug, scroll tilt, the agent run,
 * the race bars, and the interactive feature cards. Returns a cleanup function.
 */
type Fit = { x: CanvasRenderingContext2D; w: number; h: number }

const LOGS = [
  ["00:03", "k", "click", "button#apply-coupon"],
  ["00:05", "", "GET", "/api/cart 200 · 84ms"],
  ["00:09", "k", "click", "button.pay"],
  ["00:10", "e", "POST", "/api/orders 500 · 312ms"],
  ["00:10", "e", "error", "TypeError: discount is undefined (cart.ts:142)"],
  ["00:11", "w", "warn", "Retrying payment intent…"],
]
const STEPS = [
  ["Watching the recording", "14 s · 4 clicks · 2 pages"],
  ["Reading console & network", "1 error · 1 failed request"],
  ["Replaying steps in a clean browser", "reproduced 2 of 2 runs"],
  ["Checking for duplicates", "1 similar report: #97 (closed)"],
  ["Finding the likely cause", "POST /api/orders → cart.ts:142"],
  ["Drafting the ticket", "waiting for your approval"],
]
const EVENTS: [number, string, string, string][] = [
  [0.08, "click", "button#apply-coupon", "#93c5fd"],
  [0.3, "network", "GET /api/cart 200", "#8b8b93"],
  [0.62, "click", "button.pay", "#93c5fd"],
  [0.7, "network", "POST /api/orders 500", "#f87171"],
  [0.72, "error", "TypeError: discount is undefined", "#f87171"],
  [0.85, "warn", "Retrying payment intent…", "#fbbf24"],
]
const REPLAY = ["$ bugsnap replay #128", "→ open https://shop.acme.dev/checkout", "→ click button#apply-coupon", "→ click button.pay", "✗ POST /api/orders 500  (run 1)", "✗ POST /api/orders 500  (run 2)"]
const PAYLOADS = [
  "issue with title, steps, logs and a replay link",
  "issue in your team's triage queue, labelled by area",
  "ticket with severity, component and attachments",
  "a message in #bugs with the summary and a link",
]

export function initLanding(root: HTMLElement): () => void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const DPR = Math.min(2, window.devicePixelRatio || 1)
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as T
  const $$ = <T extends Element = HTMLElement>(s: string) => [...root.querySelectorAll(s)] as T[]
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (ms: number, f: () => void) => {
    const id = setTimeout(() => {
      timers.delete(id)
      f()
    }, reduce ? 0 : ms)
    timers.add(id)
  }
  const offs: (() => void)[] = []
  const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, ev: K | string, fn: (e: HTMLElementEventMap[K]) => void, opt?: AddEventListenerOptions) => {
    el.addEventListener(ev, fn as EventListener, opt)
    offs.push(() => el.removeEventListener(ev, fn as EventListener, opt))
  }
  const observers: IntersectionObserver[] = []
  const once = (el: Element, f: () => void, th = 0.4) => {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        f()
        io.disconnect()
      }
    }, { threshold: th })
    io.observe(el)
    observers.push(io)
  }
  const fit = (c: HTMLCanvasElement): Fit => {
    const r = c.getBoundingClientRect()
    c.width = r.width * DPR
    c.height = r.height * DPR
    const x = c.getContext("2d")!
    x.setTransform(DPR, 0, 0, DPR, 0, 0)
    return { x, w: r.width, h: r.height }
  }

  /* 1. hero capture field */
  const fc = $<HTMLCanvasElement>("#field")
  let F: Fit
  let parts: { x: number; y: number; vx: number; vy: number; cap: number }[] = []
  let scanX = -200
  const initField = () => {
    F = fit(fc)
    parts = Array.from({ length: Math.round((F.w * F.h) / 9000) }, () => ({ x: Math.random() * F.w, y: Math.random() * F.h, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25, cap: 0 }))
  }
  const drawField = () => {
    const x = F.x
    x.clearRect(0, 0, F.w, F.h)
    scanX += 3.2
    if (scanX > F.w + 300) scanX = -300
    const g = x.createLinearGradient(scanX - 120, 0, scanX, 0)
    g.addColorStop(0, "rgba(59,130,246,0)")
    g.addColorStop(1, "rgba(59,130,246,.10)")
    x.fillStyle = g
    x.fillRect(scanX - 120, 0, 120, F.h)
    x.fillStyle = "rgba(147,197,253,.5)"
    x.fillRect(scanX, 0, 1, F.h)
    const caught: typeof parts = []
    for (const p of parts) {
      p.x += p.vx
      p.y += p.vy
      if (p.x < 0 || p.x > F.w) p.vx *= -1
      if (p.y < 0 || p.y > F.h) p.vy *= -1
      if (Math.abs(p.x - scanX) < 4) p.cap = 1
      p.cap = Math.max(0, p.cap - 0.006)
      if (p.cap > 0) {
        caught.push(p)
        x.strokeStyle = `rgba(59,130,246,${p.cap})`
        x.lineWidth = 1
        const s = 3 + p.cap * 4
        x.strokeRect(p.x - s / 2, p.y - s / 2, s, s)
      }
      x.fillStyle = p.cap > 0 ? `rgba(147,197,253,${0.4 + p.cap * 0.6})` : "rgba(255,255,255,.16)"
      x.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6)
    }
    x.lineWidth = 0.6
    for (let i = 0; i < caught.length; i++)
      for (let j = i + 1; j < caught.length; j++) {
        const a = caught[i], b = caught[j], d = Math.hypot(a.x - b.x, a.y - b.y)
        if (d < 90) {
          x.strokeStyle = `rgba(59,130,246,${Math.min(a.cap, b.cap) * 0.5 * (1 - d / 90)})`
          x.beginPath()
          x.moveTo(a.x, a.y)
          x.lineTo(b.x, b.y)
          x.stroke()
        }
      }
  }

  /* 2. crawling bug: click to snap it */
  const hero = $("#hero"), bug = $("#bug"), snappedEl = $("#snapped")
  const B = { x: 120, y: 260, a: 0, t: 0 }
  let snaps = 0, hidden = false
  const moveBug = () => {
    if (hidden) return
    const W = hero.clientWidth, H = Math.min(hero.clientHeight, 700)
    B.t += 0.02
    B.a += Math.sin(B.t * 1.7) * 0.05 + (Math.random() - 0.5) * 0.08
    B.x += Math.cos(B.a) * 1.3
    B.y += Math.sin(B.a) * 1.3
    if (B.x < 30 || B.x > W - 60) B.a = Math.PI - B.a
    if (B.y < 120 || B.y > H - 40) B.a = -B.a
    B.x = Math.max(30, Math.min(W - 60, B.x))
    B.y = Math.max(120, Math.min(H - 40, B.y))
    bug.style.left = B.x + "px"
    bug.style.top = B.y + "px"
    bug.style.transform = `rotate(${B.a * 57.3 + 90}deg)`
  }
  on(bug, "click", () => {
    const f = document.createElement("span")
    f.className = "flash"
    f.style.left = B.x + 15 + "px"
    f.style.top = B.y + 15 + "px"
    hero.appendChild(f)
    later(700, () => f.remove())
    const r = bug.getBoundingClientRect(), t = snappedEl.getBoundingClientRect()
    const chip = document.createElement("span")
    chip.className = "chipfly"
    chip.textContent = "bug #" + (130 + snaps)
    chip.style.left = r.left + "px"
    chip.style.top = r.top + "px"
    root.appendChild(chip)
    requestAnimationFrame(() => {
      chip.style.left = t.left + "px"
      chip.style.top = t.top + "px"
      chip.style.opacity = ".2"
      chip.style.transform = "scale(.6)"
    })
    later(820, () => {
      chip.remove()
      snaps++
      snappedEl.textContent = snaps + (snaps === 1 ? " bug" : " bugs") + " snapped"
      snappedEl.classList.remove("bump")
      void snappedEl.offsetWidth
      snappedEl.classList.add("bump")
    })
    hidden = true
    bug.style.opacity = "0"
    later(2200, () => {
      B.x = Math.random() * (hero.clientWidth - 120) + 40
      B.y = 200 + Math.random() * 300
      hidden = false
      bug.style.opacity = "1"
    })
  })

  /* 3. product frame flattens as you scroll */
  const frame = $("#frame")
  const tilt = () => {
    const r = frame.getBoundingClientRect()
    const p = Math.max(0, Math.min(1, 1 - (r.top - innerHeight * 0.2) / (innerHeight * 0.7)))
    frame.style.setProperty("--rx", (22 * (1 - p)).toFixed(2) + "deg")
    frame.style.setProperty("--sc", (0.94 + 0.06 * p).toFixed(3))
  }
  on(window, "scroll", tilt, { passive: true })
  tilt()

  /* 4. hero agent run (loops) */
  const logs = $("#logs"), steps = $("#steps"), ticket = $("#ticket"), state = $("#state"), cur = $("#cur"), clk = $("#clk"), toast = $("#toast")
  const runAgent = () => {
    logs.innerHTML = LOGS.map(([t, c, k, m]) => `<div class="ln"><span class="t">${t}</span><span class="${c}">${k}</span><span>${m}</span></div>`).join("")
    steps.innerHTML = STEPS.map(([a, b]) => `<li class="st"><span class="dot"></span><span>${a}<small>${b}</small></span></li>`).join("")
    ticket.classList.remove("on")
    toast.classList.remove("on")
    state.innerHTML = "<i></i>working"
    const lns = [...logs.children], sts = [...steps.children]
    const move = (x: number, y: number) => { cur.style.left = x + "%"; cur.style.top = y + "%" }
    const tap = (x: number, y: number) => { clk.style.left = x + "%"; clk.style.top = y + "%"; clk.classList.remove("on"); void clk.offsetWidth; clk.classList.add("on") }
    later(300, () => move(22, 52))
    later(1200, () => { tap(22, 52); lns[0].classList.add("on") })
    later(1700, () => lns[1].classList.add("on"))
    later(2300, () => move(83, 82))
    later(3200, () => { tap(83, 82); lns[2].classList.add("on") })
    later(3600, () => { lns[3].classList.add("on"); lns[4].classList.add("on"); toast.classList.add("on") })
    later(4100, () => lns[5].classList.add("on"))
    sts.forEach((s, i) => {
      later(4600 + i * 1100, () => s.classList.add("run"))
      later(4600 + i * 1100 + 900, () => { s.classList.remove("run"); s.classList.add("done") })
    })
    later(4600 + sts.length * 1100, () => { ticket.classList.add("on"); state.innerHTML = "ready" })
    if (!reduce) later(4600 + sts.length * 1100 + 6000, runAgent)
  }
  runAgent()

  /* 5. race bars */
  const race = $("#race")
  once(race, () => race.classList.add("go"))

  /* 6. scrub timeline */
  const frames = $("#frames"), sbar = $("#sbar"), shead = $("#shead"), sout = $("#sout")
  frames.innerHTML = "<i></i>".repeat(10)
  sbar.insertAdjacentHTML("beforeend", EVENTS.map(([p, , , c]) => `<span class="mk" style="left:${p * 100}%;background:${c}"></span>`).join(""))
  const scrubTo = (v: number) => {
    const p = Math.max(0, Math.min(1, v))
    shead.style.left = p * 100 + "%"
    ;[...frames.children].forEach((f, i) => f.classList.toggle("on", i <= Math.floor(p * 9.99)))
    const ev = [...EVENTS].reverse().find((e) => e[0] <= p)
    sout.innerHTML = `<span style="color:var(--dim)">00:${String(Math.round(p * 14)).padStart(2, "0")}</span>  ` + (ev ? `<b style="color:${ev[3]}">${ev[1]}</b> ${ev[2]}` : "recording starts")
  }
  let drag = false
  const pos = (e: PointerEvent) => { const r = sbar.getBoundingClientRect(); return (e.clientX - r.left) / r.width }
  on(sbar, "pointerdown", (e: PointerEvent) => { drag = true; sbar.setPointerCapture(e.pointerId); scrubTo(pos(e)) })
  on(sbar, "pointermove", (e: PointerEvent) => { if (drag) scrubTo(pos(e)) })
  on(sbar, "pointerup", () => { drag = false })
  on($("#scrub"), "pointermove", (e: PointerEvent) => {
    if (!drag && e.pointerType === "mouse" && (e.target as HTMLElement).closest(".frames,.bar")) scrubTo(pos(e))
  })
  scrubTo(0.72)

  /* 7. replay terminal */
  const term = $("#term"), res = $("#res"), rb = $<HTMLButtonElement>("#runrep")
  const replay = () => {
    term.innerHTML = REPLAY.map((l) => `<div style="color:${l.startsWith("✗") ? "var(--err)" : l.startsWith("$") ? "var(--acc2)" : "var(--muted)"}">${l}</div>`).join("")
    res.classList.remove("on")
    rb.disabled = true
    ;[...term.children].forEach((d, i) => later(i * 420, () => d.classList.add("on")))
    later(REPLAY.length * 420 + 200, () => { res.classList.add("on"); rb.disabled = false; rb.textContent = "↻ Run again" })
  }
  on(rb, "click", replay)
  once(term, replay, 0.6)

  /* 8. root-cause connector */
  const rc = $("#rc"), rcp = $<SVGPathElement>("#rcp")
  $$("#rc [data-l]").forEach((s) =>
    on(s, "mouseenter", () => {
      const n = s.dataset.l
      $$("#rc .hl").forEach((x) => x.classList.remove("hl"))
      const c = rc.querySelector(`[data-c="${n}"]`) as HTMLElement
      s.classList.add("hl")
      c.classList.add("hl")
      const R = rc.getBoundingClientRect(), a = s.getBoundingClientRect(), b = c.getBoundingClientRect()
      const x1 = a.right - R.left - 4, y1 = a.top - R.top + a.height / 2, x2 = b.left - R.left + 2, y2 = b.top - R.top + b.height / 2
      rcp.setAttribute("d", `M${x1},${y1} C${x1 + 30},${y1} ${x2 - 30},${y2} ${x2},${y2}`)
      rcp.classList.add("on")
    }),
  )
  on(rc, "mouseleave", () => { rcp.classList.remove("on"); $$("#rc .hl").forEach((x) => x.classList.remove("hl")) })

  /* 9. approve switch → stamp */
  const sw = $("#sw"), stamp = $("#stamp"), swl = $("#swl")
  on(sw, "click", () => {
    const onNow = !sw.classList.contains("on")
    sw.classList.toggle("on", onNow)
    swl.textContent = onNow ? "approved · filed to GitHub #412" : "needs your approval"
    stamp.classList.remove("on")
    if (onNow) { void stamp.offsetWidth; stamp.classList.add("on") }
  })

  /* 10. mask on hover */
  const mask = $("#mask"), G = "#%&*@$!?"
  const intervals = new Set<ReturnType<typeof setInterval>>()
  const morph = (el: HTMLElement & { _t?: ReturnType<typeof setInterval> }, to: string) => {
    let i = 0
    if (el._t) { clearInterval(el._t); intervals.delete(el._t) }
    el._t = setInterval(() => {
      i++
      el.textContent = to.split("").map((c, k) => (k < i ? c : c !== " " ? G[Math.floor(Math.random() * G.length)] : c)).join("")
      if (i >= to.length) { clearInterval(el._t!); intervals.delete(el._t!); el.textContent = to }
    }, 28)
    intervals.add(el._t)
  }
  on(mask, "mouseenter", () => $$("#mask .v").forEach((v) => { v.classList.add("m"); morph(v, v.dataset.m!) }))
  on(mask, "mouseleave", () => $$("#mask .v").forEach((v) => { v.classList.remove("m"); morph(v, v.dataset.r!) }))

  /* 11. integration hub */
  const hub = $("#hub"), hs = $<SVGSVGElement>("#hubsvg"), payload = $("#payload")
  let lines: { p: SVGPathElement; dot: SVGCircleElement; len: number; t: number }[] = []
  const buildHub = () => {
    const R = hub.getBoundingClientRect(), core = hub.querySelector(".core")!.getBoundingClientRect()
    const cx = core.left - R.left + core.width / 2, cy = core.top - R.top + core.height / 2
    hs.innerHTML = ""
    lines = $$("#hub [data-n]").map((n) => {
      const b = n.getBoundingClientRect()
      const x = b.left - R.left + b.width / 2, y = b.top - R.top + b.height / 2
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path")
      p.setAttribute("d", `M${cx},${cy} C${(cx + x) / 2},${cy} ${(cx + x) / 2},${y} ${x},${y}`)
      p.setAttribute("class", "line")
      hs.appendChild(p)
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle")
      dot.setAttribute("r", "3.5")
      dot.setAttribute("fill", "#93c5fd")
      hs.appendChild(dot)
      return { p, dot, len: p.getTotalLength(), t: Math.random() }
    })
  }
  const drawHub = () => {
    for (const L of lines) {
      L.t = (L.t + 0.006) % 1
      const pt = L.p.getPointAtLength(L.t * L.len)
      L.dot.setAttribute("cx", String(pt.x))
      L.dot.setAttribute("cy", String(pt.y))
    }
  }
  $$("#hub [data-n]").forEach((n) => {
    on(n, "mouseenter", () => {
      const i = Number(n.dataset.n)
      lines.forEach((L, k) => L.p.classList.toggle("on", k === i))
      payload.innerHTML = "sends <b>" + PAYLOADS[i] + "</b>"
    })
    on(n, "mouseleave", () => { lines.forEach((L) => L.p.classList.remove("on")); payload.textContent = PAYLOADS[0] })
  })

  /* 12. how-it-works rail */
  const flow = $("#flow"), fss = $$("#flow .fs"), railFill = $("#flow .rail i")
  const flowScroll = () => {
    const r = flow.getBoundingClientRect()
    const p = Math.max(0, Math.min(1, (innerHeight * 0.75 - r.top) / (r.height + innerHeight * 0.2)))
    railFill.style.width = p * 100 + "%"
    fss.forEach((f, i) => f.classList.toggle("on", p >= i / 3 + 0.02))
  }
  on(window, "scroll", flowScroll, { passive: true })
  flowScroll()

  /* 13. final CTA rain */
  const rcv = $<HTMLCanvasElement>("#rain")
  let RN: Fit
  let drops: { x: number; y: number; v: number; l: number }[] = []
  let wind = 0
  const initRain = () => {
    RN = fit(rcv)
    drops = Array.from({ length: 60 }, () => ({ x: Math.random() * RN.w, y: Math.random() * RN.h, v: 0.6 + Math.random() * 1.4, l: 6 + Math.random() * 14 }))
  }
  on(rcv.parentElement!, "pointermove", (e: PointerEvent) => { const r = rcv.getBoundingClientRect(); wind = ((e.clientX - r.left) / r.width - 0.5) * 3 })
  const drawRain = () => {
    const x = RN.x
    x.clearRect(0, 0, RN.w, RN.h)
    x.lineWidth = 1
    for (const d of drops) {
      d.y += d.v
      d.x += wind * 0.4
      if (d.y > RN.h) { d.y = -20; d.x = Math.random() * RN.w }
      if (d.x < 0) d.x += RN.w
      if (d.x > RN.w) d.x -= RN.w
      const g = x.createLinearGradient(d.x, d.y, d.x - wind * 3, d.y - d.l)
      g.addColorStop(0, "rgba(147,197,253,.55)")
      g.addColorStop(1, "rgba(59,130,246,0)")
      x.strokeStyle = g
      x.beginPath()
      x.moveTo(d.x, d.y)
      x.lineTo(d.x - wind * 3, d.y - d.l)
      x.stroke()
    }
  }

  /* 14. footer word lights up under the cursor */
  const bw = $("#bigword")
  bw.style.setProperty("--mx", "-999px")
  on(bw, "pointermove", (e: PointerEvent) => { const r = bw.getBoundingClientRect(); bw.style.setProperty("--mx", e.clientX - r.left + "px"); bw.style.setProperty("--my", e.clientY - r.top + "px") })
  on(bw, "pointerleave", () => bw.style.setProperty("--mx", "-999px"))

  /* loop */
  let raf = 0
  const init = () => { initField(); initRain(); buildHub() }
  const loop = () => {
    drawField()
    moveBug()
    drawRain()
    drawHub()
    if (!reduce) raf = requestAnimationFrame(loop)
  }
  let started = false
  document.fonts.ready.then(() => {
    if (started) return
    started = true
    init()
    loop()
  })
  on(window, "resize", init)

  return () => {
    started = true
    cancelAnimationFrame(raf)
    timers.forEach(clearTimeout)
    intervals.forEach(clearInterval)
    observers.forEach((o) => o.disconnect())
    offs.forEach((f) => f())
  }
}
