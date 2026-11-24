/*! BugSnap website widget · https://bugsnap-web.vercel.app
 * <script src="https://bugsnap-api.vercel.app/widget.js" data-key="pk_..." async></script>
 * Options: data-button="false" hides the button (call BugSnap.open() yourself).
 * JS API: BugSnap.open(), BugSnap.identify({ email, name }), BugSnap.report("text")
 */
;(function () {
  "use strict"
  if (window.BugSnap && window.BugSnap.__loaded) return

  var script = document.currentScript || document.querySelector('script[src*="widget.js"][data-key]')
  if (!script) return
  var KEY = script.getAttribute("data-key") || ""
  var API = (script.getAttribute("data-api") || script.src.replace(/\/widget\.js.*$/, "")).replace(/\/$/, "")
  var SHOW_BUTTON = script.getAttribute("data-button") !== "false"
  var MAX = 150

  // ---------- capture: keep the last few minutes of what happened ----------
  var logs = []
  var SECRET = /^(token|access_token|id_token|refresh_token|key|api_key|apikey|secret|password|pass|pwd|auth|code|session|sig|signature)$/i
  function clip(s, n) { s = String(s); n = n || 2000; return s.length > n ? s.slice(0, n) + "… [" + (s.length - n) + " more chars]" : s }
  function redactUrl(raw) {
    try {
      var u = new URL(raw, location.href)
      u.searchParams.forEach(function (_v, k) { if (SECRET.test(k)) u.searchParams.set(k, "[hidden]") })
      u.username = ""; u.password = ""
      return u.href
    } catch (e) { return String(raw) }
  }
  function redact(t) {
    return String(t)
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, "Bearer [hidden]")
      .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[hidden-jwt]")
      .replace(/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}/g, "[hidden-key]")
      .replace(/AIza[0-9A-Za-z\-_]{30,}/g, "[hidden-key]")
      .replace(/\b\d{15,19}\b/g, "[hidden-number]")
  }
  function push(type, level, message, data) {
    logs.push({ type: type, level: level, message: clip(redact(message)), data: data || undefined, timestamp: new Date().toISOString() })
    if (logs.length > MAX) logs.shift()
  }
  function fmt(a) {
    if (typeof a === "string") return a
    if (a instanceof Error) return a.name + ": " + a.message
    try { return JSON.stringify(a) } catch (e) { return String(a) }
  }

  ;["error", "warn"].forEach(function (m) {
    var orig = console[m]
    console[m] = function () {
      try {
        var args = [].slice.call(arguments)
        var err = args.filter(function (a) { return a instanceof Error })[0]
        push("CONSOLE", m === "warn" ? "WARN" : "ERROR", args.map(fmt).join(" "), err && err.stack ? { stack: clip(redact(err.stack), 1500) } : undefined)
      } catch (e) {}
      return orig.apply(console, arguments)
    }
  })
  window.addEventListener("error", function (e) {
    if (e instanceof ErrorEvent) {
      push("ERROR", "ERROR", e.message, { filename: e.filename, lineno: e.lineno, colno: e.colno, stack: e.error && e.error.stack ? clip(redact(e.error.stack), 1500) : undefined })
    } else if (e.target && e.target !== window && (e.target.src || e.target.href)) {
      push("ERROR", "ERROR", "Failed to load " + e.target.tagName.toLowerCase() + ": " + redactUrl(e.target.src || e.target.href))
    }
  }, true)
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason
    push("ERROR", "ERROR", "Unhandled promise rejection: " + (r && r.message ? r.message : fmt(r)), r && r.stack ? { stack: clip(redact(r.stack), 1500) } : undefined)
  })

  var isOurs = function (url) { return String(url).indexOf(API) === 0 }
  if (window.fetch) {
    var origFetch = window.fetch
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : input && input.url ? input.url : String(input)
      var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase()
      var t0 = Date.now()
      var p = origFetch.apply(this, arguments)
      if (isOurs(url)) return p
      return p.then(function (res) {
        var data = { url: redactUrl(url), method: method, status: res.status, duration: Date.now() - t0 }
        if (!res.ok) {
          res.clone().text().then(function (body) {
            data.responseBody = clip(redact(body), 600)
            push("NETWORK", "ERROR", method + " " + redactUrl(url) + " → " + res.status, data)
          }).catch(function () { push("NETWORK", "ERROR", method + " " + redactUrl(url) + " → " + res.status, data) })
        } else {
          push("NETWORK", "INFO", method + " " + redactUrl(url) + " → " + res.status, data)
        }
        return res
      }, function (err) {
        push("NETWORK", "ERROR", method + " " + redactUrl(url) + " → failed", { url: redactUrl(url), method: method, error: String(err && err.message || err), duration: Date.now() - t0 })
        throw err
      })
    }
  }
  var XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (m, u) { this.__bs = { m: String(m).toUpperCase(), u: String(u) }; return XO.apply(this, arguments) }
  XMLHttpRequest.prototype.send = function () {
    var x = this, t0 = Date.now()
    if (x.__bs && !isOurs(x.__bs.u)) x.addEventListener("loadend", function () {
      var bad = x.status === 0 || x.status >= 400
      push("NETWORK", bad ? "ERROR" : "INFO", x.__bs.m + " " + redactUrl(x.__bs.u) + " → " + (x.status || "failed"), { url: redactUrl(x.__bs.u), method: x.__bs.m, status: x.status, duration: Date.now() - t0 })
    })
    return XS.apply(this, arguments)
  }

  function describe(el) {
    var tag = el.tagName.toLowerCase()
    var label = el.getAttribute("aria-label") || (el.labels && el.labels[0] && el.labels[0].textContent) || el.placeholder || el.name || (el.textContent || "")
    label = String(label).trim().replace(/\s+/g, " ").slice(0, 60)
    return label ? tag + ' "' + label + '"' : tag
  }
  function selector(el) {
    var parts = []
    while (el && el !== document.body && parts.length < 5) {
      var p = el.tagName.toLowerCase()
      if (el.id) { parts.unshift(p + "#" + el.id); break }
      var t = el.getAttribute("data-testid")
      if (t) p += '[data-testid="' + t + '"]'
      else if (typeof el.className === "string" && el.className.trim()) p += "." + el.className.trim().split(/\s+/)[0]
      parts.unshift(p); el = el.parentElement
    }
    return parts.join(" > ")
  }
  document.addEventListener("click", function (e) {
    var t = e.target
    if (!t || !t.closest || (host && host.contains(t))) return
    t = t.closest("button,a,[role=button],input,select,textarea,label,summary") || t
    push("CLICK", "INFO", "Clicked " + describe(t), { selector: selector(t), url: location.href })
  }, true)
  document.addEventListener("change", function (e) {
    var t = e.target
    if (!t || !("value" in t) || (host && host.contains(t))) return
    push("INPUT", "INFO", "Changed " + describe(t), { selector: selector(t) })
  }, true)
  ;["pushState", "replaceState"].forEach(function (k) {
    var o = history[k]
    history[k] = function () { var r = o.apply(this, arguments); push("NAVIGATION", "INFO", "Opened " + location.href, { url: location.href }); return r }
  })
  window.addEventListener("popstate", function () { push("NAVIGATION", "INFO", "Opened " + location.href, { url: location.href }) })
  push("NAVIGATION", "INFO", "Opened " + location.href, { url: location.href })

  // ---------- UI ----------
  var host = null, root = null, cfg = { label: "Report a bug", position: "bottom-right", color: "#2563EB" }, who = {}
  try { who = JSON.parse(localStorage.getItem("bugsnap:who") || "{}") } catch (e) {}

  var CSS = ":host{all:initial}*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}" +
    ".btn{position:fixed;bottom:20px;z-index:2147483646;display:flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:10px 16px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 10px 30px -8px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.2)}" +
    ".btn:hover{filter:brightness(1.08)}.btn svg{width:16px;height:16px}" +
    ".panel{position:fixed;bottom:76px;z-index:2147483647;width:340px;max-width:calc(100vw - 32px);background:#fff;color:#111;border-radius:14px;box-shadow:0 24px 64px -16px rgba(0,0,0,.45),0 0 0 1px rgba(0,0,0,.08);padding:16px}" +
    ".right{right:20px}.left{left:20px}" +
    "h2{margin:0 0 4px;font-size:16px}p{margin:0 0 12px;font-size:13px;color:#555;line-height:1.45}" +
    "textarea,input[type=email]{width:100%;border:1px solid #d4d4d8;border-radius:8px;padding:9px 10px;font-size:14px;color:#111;background:#fff;outline:none}" +
    "textarea{min-height:92px;resize:vertical}textarea:focus,input:focus{border-color:var(--c);box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 20%,transparent)}" +
    "label{display:flex;gap:8px;align-items:center;font-size:13px;color:#333;margin:10px 0}" +
    ".row{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}" +
    ".send{border:0;border-radius:8px;padding:9px 14px;color:#fff;font-weight:600;font-size:14px;cursor:pointer;background:var(--c)}.send:disabled{opacity:.6;cursor:default}" +
    ".ghost{border:1px solid #d4d4d8;border-radius:8px;padding:9px 12px;background:#fff;color:#333;font-size:14px;cursor:pointer}" +
    ".err{color:#b91c1c;font-size:13px;margin-top:8px}.ok{text-align:center;padding:8px 4px 4px}.ok p{margin:0}.ok b{display:block;font-size:16px;margin-bottom:4px}" +
    ".foot{margin-top:12px;font-size:11px;color:#999;text-align:center}.foot a{color:#999}"

  var BUG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2l1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3 3 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6M12 20v-9M6 13H2M22 13h-4"/></svg>'

  function mount() {
    host = document.createElement("div")
    host.setAttribute("data-bugsnap", "")
    root = host.attachShadow({ mode: "open" })
    root.innerHTML = "<style>" + CSS + "</style>"
    root.host.style.setProperty("--c", cfg.color)
    document.body.appendChild(host)
    if (SHOW_BUTTON) {
      var b = document.createElement("button")
      b.className = "btn " + (cfg.position === "bottom-left" ? "left" : "right")
      b.style.background = cfg.color
      b.innerHTML = BUG + "<span></span>"
      b.querySelector("span").textContent = cfg.label
      b.setAttribute("aria-haspopup", "dialog")
      b.addEventListener("click", function () { panel ? close() : open() })
      root.appendChild(b)
    }
  }

  var panel = null
  function close() { if (panel) { panel.remove(); panel = null } }
  function open(prefill) {
    if (!root) return
    close()
    panel = document.createElement("div")
    panel.className = "panel " + (cfg.position === "bottom-left" ? "left" : "right")
    panel.setAttribute("role", "dialog")
    panel.setAttribute("aria-label", "Report a problem")
    var canShot = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)
    panel.innerHTML =
      "<h2>Report a problem</h2><p>Tell us what went wrong. We include technical details from this page so the team can fix it fast.</p>" +
      '<textarea placeholder="What happened? What did you expect?"></textarea>' +
      (who.email ? "" : '<input type="email" placeholder="Your email (optional, for follow-up)" style="margin-top:8px">') +
      (canShot ? '<label><input type="checkbox" checked> Attach a screenshot of this page</label>' : "") +
      '<div class="err" hidden></div><div class="row"><button class="ghost" type="button">Cancel</button><button class="send" type="button">Send report</button></div>' +
      '<div class="foot">Powered by <a href="https://bugsnap-web.vercel.app" target="_blank" rel="noopener">BugSnap</a></div>'
    root.appendChild(panel)
    var ta = panel.querySelector("textarea")
    if (prefill) ta.value = prefill
    setTimeout(function () { ta.focus() }, 30)
    panel.querySelector(".ghost").onclick = close
    panel.addEventListener("keydown", function (e) { if (e.key === "Escape") close() })
    panel.querySelector(".send").onclick = function () { send(panel) }
  }

  function screenshot() {
    // Chrome asks the user to share this tab; we grab one frame and stop.
    return navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" }, audio: false, preferCurrentTab: true, selfBrowserSurface: "include" })
      .then(function (stream) {
        var video = document.createElement("video")
        video.srcObject = stream; video.muted = true
        return video.play().then(function () {
          return new Promise(function (r) { setTimeout(r, 250) })
        }).then(function () {
          var w = video.videoWidth, h = video.videoHeight, s = Math.min(1, 1280 / w)
          var c = document.createElement("canvas"); c.width = Math.round(w * s); c.height = Math.round(h * s)
          c.getContext("2d").drawImage(video, 0, 0, c.width, c.height)
          stream.getTracks().forEach(function (t) { t.stop() })
          return c.toDataURL("image/jpeg", 0.8)
        })
      })
      .catch(function () { return null })
  }

  function send(p) {
    var text = p.querySelector("textarea").value.trim()
    var emailEl = p.querySelector('input[type=email]')
    var shotEl = p.querySelector('input[type=checkbox]')
    var err = p.querySelector(".err"), btn = p.querySelector(".send")
    if (text.length < 3) { err.hidden = false; err.textContent = "Please describe the problem."; return }
    if (emailEl && emailEl.value.trim()) { who.email = emailEl.value.trim(); try { localStorage.setItem("bugsnap:who", JSON.stringify(who)) } catch (e) {} }
    btn.disabled = true; btn.textContent = "Sending…"; err.hidden = true
    var shot = shotEl && shotEl.checked
    if (shot) host.style.display = "none"
    ;(shot ? screenshot() : Promise.resolve(null)).then(function (dataUrl) {
      host.style.display = ""
      return fetch(API + "/widget/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: KEY,
          description: text,
          email: who.email,
          name: who.name,
          screenshot: dataUrl || undefined,
          logs: logs.slice(),
          page: {
            url: location.href, title: document.title, language: navigator.language,
            viewport: { width: innerWidth, height: innerHeight },
            screen: { width: screen.width, height: screen.height, pixelRatio: devicePixelRatio },
          },
        }),
      })
    }).then(function (res) {
      return res.json().catch(function () { return {} }).then(function (body) {
        if (!res.ok) throw new Error(body.message || "Could not send the report")
        p.innerHTML = '<div class="ok"><b>Thanks, report sent</b><p>The team got it with the technical details' + (body.number ? ' <span style="white-space:nowrap">(BUG-' + body.number + ")</span>" : "") + ".</p></div>"
        setTimeout(close, 3500)
      })
    }).catch(function (e) {
      host.style.display = ""
      btn.disabled = false; btn.textContent = "Send report"
      err.hidden = false; err.textContent = e.message || "Could not send the report"
    })
  }

  function start() {
    fetch(API + "/widget/config?key=" + encodeURIComponent(KEY))
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (c) {
        if (!c || !c.enabled) return
        if (!c.allowed) { console.warn("[BugSnap] This site is not in the project's website addresses. Add " + location.host + " in BugSnap."); return }
        cfg = { label: c.label || cfg.label, position: c.position || cfg.position, color: c.color || cfg.color }
        mount()
      })
      .catch(function () {})
  }

  window.BugSnap = {
    __loaded: true,
    open: function (text) { open(text) },
    close: close,
    identify: function (p) { who = { email: p && p.email, name: p && p.name }; try { localStorage.setItem("bugsnap:who", JSON.stringify(who)) } catch (e) {} },
    report: function (text) { open(text) },
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start)
  else start()
})()
