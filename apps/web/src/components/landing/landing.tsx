"use client"

import { useEffect, useRef } from "react"
import { initLanding } from "./landing-motion"
import "./landing.css"

/** BugSnap marketing page. All motion lives in landing-motion.ts and is cleaned up on unmount. */
export default function Landing() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!root.current) return
    return initLanding(root.current)
  }, [])

  return (
    <div ref={root} className="bsl">

<nav className="nav"><span className="logo"><img src="/logo.png" alt="" width={26} height={26}/>BugSnap</span>
<ul><li>Product</li><li>How it works</li><li>Integrations</li><li>Docs</li></ul>
<span className="r"><span className="snapped" id="snapped">0 bugs snapped</span><a className="btn p" href="/dashboard">Try the demo</a></span></nav>

<header className="hero" id="hero">
  <canvas id="field"></canvas><div className="glow"></div>
  <span className="badge"><b>New</b>An agent that reproduces bugs for you</span>
  <h1>Record a <span className="bracket" id="bkt"><span className="lbl">captured</span><svg className="bk l" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true"><path d="M10 1.5H1.5V98.5H10" vectorEffect="non-scaling-stroke"/></svg>bug<svg className="bk r" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 1.5H8.5V98.5H0" vectorEffect="non-scaling-stroke"/></svg></span> once.<br/><span className="soft">The agent does the rest.</span></h1>
  <p className="lead">BugSnap watches the recording, reads the console and network logs, replays the steps in a clean browser to confirm the bug, finds duplicates, and drafts the ticket. You approve before it's filed.</p>
  <div className="cta"><a className="btn p" href="/dashboard">Try the demo, no sign-up</a><a className="btn" href="https://github.com/Madhubala-06/BugSnap#load-the-chrome-extension">Add to Chrome →</a></div>
  <p className="hint">psst, there's a <b>bug</b> crawling on this page. click it to snap it.</p>
  <div id="bug" title="Snap me"><svg viewBox="0 0 32 32"><g fill="none" stroke="#93c5fd" strokeWidth="1.6" strokeLinecap="round"><path d="M10 13 5 10M10 17H4M10 21l-5 3M22 13l5-3M22 17h6M22 21l5 3M13 8l-2-3M19 8l2-3"/></g><ellipse cx="16" cy="18" rx="6.5" ry="8" fill="#3b82f6"/><circle cx="16" cy="9.5" r="3.6" fill="#1d4ed8"/><path d="M16 11v15" stroke="#0a0a0b" strokeWidth="1.2"/></svg></div>

  <div className="stage"><div className="frame" id="frame">
    <div className="app">
      <aside className="side">
        <div className="ws"><i></i>Acme Web</div>
        <a className="on">◉ Reports <span className="n">24</span></a><a>▶ Recordings <span className="n">31</span></a><a>⧉ Duplicates <span className="n">6</span></a><a>⚙ Agent rules</a><a>⇄ Integrations</a>
      </aside>
      <div className="mid">
        <div className="rec">
          <div className="mock"><b>Checkout</b><div className="bar" style={{width:"60%"}}></div><div className="bar" style={{width:"80%"}}></div><div className="bar" style={{width:"45%"}}></div><div className="toast" id="toast">Something went wrong</div><div className="pay">Pay ₹1,499</div></div>
          <svg className="cursor" id="cur" viewBox="0 0 24 24" style={{left:"30%",top:"30%"}}><path d="M3 2l7 19 2.5-8.5L21 10z" fill="#fff" stroke="#000"/></svg>
          <span className="click" id="clk"></span><span className="rectag"><i></i>REC 00:14</span>
        </div>
        <div className="logs"><div className="h"><span className="on">Console 3</span><span>Network 12</span><span>Clicks 4</span><span>Env</span></div><div id="logs"></div></div>
      </div>
      <div className="agent">
        <div className="ah"><b>Agent run #128</b><span id="state"><i></i>working</span></div>
        <ol className="steps" id="steps"></ol>
        <div className="ticket" id="ticket">
          <div style={{fontWeight:"600"}}>Pay button fails with 500 when coupon is applied</div>
          <div className="row"><span className="tag c">critical</span><span className="tag ok">reproduced 2/2</span><span className="tag">checkout</span><span className="tag">Chrome 131 · macOS</span></div>
          <div style={{color:"var(--muted)",fontSize:"12.5px",lineHeight:"1.5"}}>Likely cause: <span style={{fontFamily:"var(--mono)",color:"var(--acc2)"}}>POST /api/orders</span> returns 500; <span style={{fontFamily:"var(--mono)"}}>TypeError: discount is undefined</span> at <span style={{fontFamily:"var(--mono)"}}>cart.ts:142</span>.</div>
          <div className="act"><a className="btn p">Approve & file to GitHub</a><a className="btn">Edit</a></div>
        </div>
      </div>
    </div>
  </div></div>
</header>

<section>
  <span className="kick">WHY</span>
  <h2>A bug report in 40 seconds, not 25 minutes</h2>
  <p className="sub">Writing steps, grabbing logs, checking it happens again. The agent does that part.</p>
  <div className="race" id="race">
    <div className="lane slow"><span className="who">Writing it by hand</span><div className="track"><div className="fill">screenshots · steps · logs · retry…</div></div><span className="t">~25 min</span></div>
    <div className="lane fast"><span className="who">BugSnap agent</span><div className="track"><div className="fill">done</div></div><span className="t">~40 s</span></div>
    <div className="done">✓ ticket ready while you're still on the page</div>
  </div>
</section>

<section>
  <span className="kick">FEATURES</span>
  <h2>Every card here is a working demo</h2>
  <p className="sub">Drag, hover and click. This is what the agent does with your recording.</p>
  <div className="bento">
    <div className="b w4"><div className="demo scrub" id="scrub"><span className="try">drag the timeline</span><div className="frames" id="frames"></div><div className="bar" id="sbar"><span className="head" id="shead"></span></div><div className="out" id="sout"></div></div>
      <h3>Full context on one timeline</h3><p>Video, clicks, console and network logs are synced, so you see exactly what broke and when.</p></div>
    <div className="b w2"><div className="demo replay"><span className="try">press run</span><div className="term" id="term"></div><span className="res" id="res">✓ reproduced 2 of 2</span><div><button type="button" className="btn runbtn" id="runrep">▶ Run replay</button></div></div>
      <h3>Reproduction agent</h3><p>Replays your steps in a clean browser to prove the bug is real.</p></div>
    <div className="b w3"><div className="demo"><span className="try">hover a stack line</span><div className="rc" id="rc">
        <div className="col stack"><div className="hdr">STACK TRACE</div><div data-l="0">TypeError: discount is undefined</div><div data-l="1">at applyCoupon (cart.ts:142)</div><div data-l="2">at checkout (pay.ts:58)</div><div data-l="3">at onClick (Pay.tsx:21)</div></div>
        <div className="col code"><div className="hdr">LIKELY FILES</div><div data-c="1">cart.ts · L142 total - discount.amount</div><div data-c="2">pay.ts · L58 applyCoupon(cart)</div><div data-c="3">Pay.tsx · L21 onClick=&#123;checkout&#125;</div><div data-c="0" style={{color:"var(--dim)"}}>fix: guard if (!discount) return total</div></div>
        <svg id="rcsvg"><path id="rcp"/></svg></div></div>
      <h3>Root-cause hints</h3><p>Links each stack line to the file and line most likely at fault, with a fix to check.</p></div>
    <div className="b w3"><div className="demo"><span className="try">hover the card</span><div className="dup">
        <div className="dc">Login button does nothing on Safari<small>#81 · open</small><span className="pct">12%</span></div>
        <div className="dc">Checkout 500 when promo code used<small>#97 · closed last week</small><span className="pct">91% match</span></div>
        <div className="dc">Pay fails with 500 when coupon is applied<small>new · this report</small></div></div></div>
      <h3>Duplicate detection</h3><p>Finds the same bug before you file it again, and shows how often it happens.</p></div>
    <div className="b w2"><div className="demo ap"><span className="try">flip the switch</span><div className="doc"><b>Pay fails with 500</b><div className="ln2" style={{width:"85%"}}></div><div className="ln2" style={{width:"65%"}}></div><div className="ln2" style={{width:"75%"}}></div><span className="stamp" id="stamp">FILED</span></div><label className="sw" id="sw"><i></i><span id="swl">needs your approval</span></label></div>
      <h3>You stay in charge</h3><p>The agent drafts. Nothing is filed until a person approves it.</p></div>
    <div className="b w4"><div className="demo mask" id="mask"><span className="try">hover to mask</span>
        <div className="fld"><span>email</span><span className="v" data-r="riya@acme.dev" data-m="r•••@acme.dev">riya@acme.dev</span></div>
        <div className="fld"><span>card</span><span className="v" data-r="4242 4242 4242 4242" data-m="•••• •••• •••• 4242">4242 4242 4242 4242</span></div>
        <div className="fld"><span>password</span><span className="v" data-r="hunter2!" data-m="••••••••">hunter2!</span></div></div>
      <h3>Private by default</h3><p>Emails, cards and passwords are masked in the browser before anything is uploaded.</p></div>
  </div>
</section>

<section>
  <span className="kick">INTEGRATIONS</span>
  <h2>Files to the tools you already use</h2>
  <p className="sub">Hover a tool to see what the agent sends.</p>
  <div className="hub" id="hub"><svg id="hubsvg"></svg>
    <div className="node core" style={{left:"50%",top:"46%"}}>BugSnap agent</div>
    <div className="node" data-n="0" style={{left:"12%",top:"18%"}}>GitHub Issues</div>
    <div className="node" data-n="1" style={{left:"88%",top:"18%"}}>Linear</div>
    <div className="node" data-n="2" style={{left:"12%",top:"76%"}}>Jira</div>
    <div className="node" data-n="3" style={{left:"88%",top:"76%"}}>Slack</div>
    <div className="payload" id="payload">issue with title, steps, logs and a replay link</div>
  </div>
</section>

<section>
  <span className="kick">HOW IT WORKS</span>
  <h2>Record. Let it check. Approve.</h2>
  <div className="flow" id="flow"><div className="rail"><i></i></div>
    <div className="fs"><span className="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg></span><b>01</b><h3>Record</h3><p>Click the extension and reproduce the bug. Video, clicks, console, network and browser details are captured together.</p></div>
    <div className="fs"><span className="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12a7 7 0 1 0 2-5M5 4v4h4"/></svg></span><b>02</b><h3>The agent checks</h3><p>It replays your steps, reads the errors, looks for duplicates and drafts the ticket with a likely cause.</p></div>
    <div className="fs"><span className="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 13l4 4L19 7"/></svg></span><b>03</b><h3>You approve</h3><p>Edit anything, then file it to GitHub, Linear or Jira, or share one link with the team.</p></div>
  </div>
</section>

<div className="final"><canvas id="rain"></canvas>
  <span className="kick">TRY IT</span>
  <h2>See the agent work on a real bug</h2>
  <p className="sub" style={{marginBottom:"26px"}}>Open the demo workspace with a recorded checkout bug. No account needed.</p>
  <div className="cta"><a className="btn p" href="/dashboard">Open the demo</a><a className="btn" href="https://github.com/Madhubala-06/BugSnap">View on GitHub</a></div>
</div>

<footer id="foot">
  <div className="ftop">
    <div className="brand"><span className="logo"><img src="/logo.png" alt="" width={26} height={26}/>BugSnap</span><p>© 2026 BugSnap. Built by Madhubala.<br/>All rights reserved.</p></div>
    <div><h4>Product</h4><ul><li><a href="#">Chrome extension</a></li><li><a href="#">Agent</a></li><li><a href="#">Integrations</a></li><li><a href="/dashboard">Demo</a></li></ul></div>
    <div><h4>Developers</h4><ul><li><a href="#">Docs</a></li><li><a href="#">API</a></li><li><a href="https://github.com/Madhubala-06/BugSnap">GitHub</a></li><li><a href="#">Changelog</a></li></ul></div>
    <div><h4>Legal</h4><ul><li><a href="#">Privacy</a></li><li><a href="#">Terms</a></li><li><a href="#">Data handling</a></li></ul></div>
    <div><h4>Account</h4><ul><li><a href="#">Sign up</a></li><li><a href="#">Log in</a></li><li><a href="#">Forgot password</a></li></ul></div>
  </div>
  <div className="fbot"><span>Made for people who hate writing bug reports</span><span>v0.2 · preview</span></div>
  <div className="bigword" id="bigword">BugSnap</div>
</footer>


    </div>
  )
}
