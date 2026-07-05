// Focused regression check for the "bet & options blurred / unclickable" bug.
// Opens the mobile bet/options sheet on a set of games and asserts:
//   1. the sheet (.bp-content) becomes visible and opaque,
//   2. an elementFromPoint hit test on the bet input lands inside the sheet
//      (NOT on the dismiss scrim that previously painted over it).
// Reuses raw CDP over Node's global WebSocket so it needs no extra deps.

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = (process.argv.find(a => a.startsWith('--baseUrl='))?.split('=')[1] || 'http://127.0.0.1:4173').replace(/\/$/, '')
const ROUTES = (process.argv.find(a => a.startsWith('--routes='))?.split('=')[1] || '/dice,/blackjack,/roulette,/keno').split(',')
// Multiple mobile widths so a mid-mobile regression (e.g. 466px) can't slip
// through a 390-only check. The report observed a no-op tap at 466x704 even
// though the 390-only synthetic-click check passed.
const VIEWPORTS = (process.argv.find(a => a.startsWith('--viewports='))?.split('=')[1] || '390x844,466x704,492x820')
    .split(',')
    .map(v => {
        const [w, h] = v.split('x').map(Number)
        return { w, h }
    })
const EDGE_CANDIDATES = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]
const browser = process.argv.find(a => a.startsWith('--browser='))?.split('=')[1]
    || EDGE_CANDIDATES.find(c => existsSync(c))
if (!browser) throw new Error('No Edge/Chrome found; pass --browser=')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const port = 9700 + Math.floor(Math.random() * 200)
const userDataDir = join(tmpdir(), `gampo-betsheet-${process.pid}`)

const proc = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, 'about:blank',
], { stdio: 'ignore' })
proc.unref()

async function waitForDebugger() {
    const start = Date.now()
    while (Date.now() - start < 10000) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`)
            if (res.ok) return res.json()
        } catch { /* retry */ }
        await sleep(200)
    }
    throw new Error('debugger not ready')
}

let nextId = 1
const pending = new Map()
let ws

function send(method, params = {}, sessionId) {
    const id = nextId++
    const msg = { id, method, params }
    if (sessionId) msg.sessionId = sessionId
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify(msg))
    })
}

async function evalExpr(expression, sessionId) {
    const res = await send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true,
    }, sessionId)
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails))
    return res.result?.value
}

const checkExpr = `
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const toggle = document.querySelector('[data-mobile-settings-toggle]');
  if (!toggle) return { ok: false, reason: 'no settings toggle (game may have no setup controls)' };
  // Real hit-test the toggle center BEFORE clicking. If another element paints
  // on top of the portaled dock at this viewport width, the tap is a no-op and
  // the top element is something other than the toggle (or its descendant).
  const tr = toggle.getBoundingClientRect();
  const tx = Math.max(1, Math.min(innerWidth - 1, tr.left + tr.width / 2));
  const ty = Math.max(1, Math.min(innerHeight - 1, tr.top + tr.height / 2));
  const topAtToggle = document.elementFromPoint(tx, ty);
  const toggleReachable = !!topAtToggle && (toggle === topAtToggle || toggle.contains(topAtToggle) || topAtToggle.contains(toggle));
  if (!toggleReachable) {
    return {
      ok: false,
      reason: 'toggle not hit-reachable',
      toggleTop: topAtToggle ? String(topAtToggle.className || topAtToggle.tagName).slice(0, 60) : null,
      toggleRect: { top: Math.round(tr.top), left: Math.round(tr.left), w: Math.round(tr.width), h: Math.round(tr.height) },
    };
  }
  // Dispatch a real pointer/click sequence on the actual top element so any
  // interception or pointer-events trap surfaces as a failure.
  ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(type => {
    topAtToggle.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: tx, clientY: ty }));
  });
  await sleep(320);
  const sheet = document.querySelector('.bp-content');
  if (!sheet) return { ok: false, reason: 'no .bp-content sheet' };
  const cs = getComputedStyle(sheet);
  const rect = sheet.getBoundingClientRect();
  const opaque = Number(cs.opacity) > 0.9;
  const onScreen = rect.top < innerHeight && rect.bottom > 0 && rect.height > 0;
  // Hit-test the bet input (or first control) center: it must resolve to an
  // element inside the sheet, not the scrim.
  const ctrl = sheet.querySelector('.bp-bet-input, button, input');
  let hit = null, hitInsideSheet = false, hitIsScrim = false;
  if (ctrl) {
    const r = ctrl.getBoundingClientRect();
    const x = Math.max(1, Math.min(innerWidth - 1, r.left + r.width / 2));
    const y = Math.max(1, Math.min(innerHeight - 1, r.top + r.height / 2));
    const top = document.elementFromPoint(x, y);
    hit = top ? (top.className || top.tagName) : null;
    hitInsideSheet = !!top && (sheet === top || sheet.contains(top));
    hitIsScrim = !!top && typeof top.className === 'string' && top.className.includes('bp-mobile-scrim');
  }
  return {
    ok: opaque && onScreen && hitInsideSheet && !hitIsScrim,
    opaque, onScreen, hitInsideSheet, hitIsScrim,
    hit: typeof hit === 'string' ? hit.slice(0, 60) : hit,
    sheetTop: Math.round(rect.top), sheetHeight: Math.round(rect.height),
  };
})()
`

// Wave 2: extended touch-floor assertion for the bet chips.
// Counts `.bp-bet-btn` chips inside `[data-mobile-stepper-chips]` and asserts
// none are below the 44px touch target. Reports min-height + count so a
// regression is obvious in the log.
const TOUCH_FLOOR_EXPR = `
(() => {
  const groups = document.querySelectorAll('[data-mobile-stepper-chips]');
  if (!groups.length) return { ok: false, reason: 'no stepper chips found' };
  let minHeight = Infinity;
  let total = 0;
  for (const group of groups) {
    const chips = group.querySelectorAll('.bp-bet-btn');
    for (const chip of chips) {
      total += 1;
      const r = chip.getBoundingClientRect();
      if (r.height < minHeight) minHeight = r.height;
    }
  }
  return {
    ok: total > 0 && minHeight >= 44,
    total,
    minHeight: Number.isFinite(minHeight) ? Math.round(minHeight) : null,
    floor: 44,
  };
})()
`

async function main() {
    const version = await waitForDebugger()
    ws = new WebSocket(version.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
    ws.onmessage = (ev) => {
        const data = JSON.parse(ev.data)
        if (data.id && pending.has(data.id)) {
            const { resolve, reject } = pending.get(data.id)
            pending.delete(data.id)
            if (data.error) reject(new Error(data.error.message))
            else resolve(data.result)
        }
    }
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    await send('Page.enable', {}, sessionId)
    await send('Runtime.enable', {}, sessionId)

    // Pre-seed first-visit onboarding as seen so the one-time WelcomeModal
    // (welcome-backdrop / welcome-card / welcome-cta) doesn't intercept taps
    // on a fresh browser profile. The modal is verified separately.
    try {
        await send('Page.addScriptToEvaluateOnNewDocument', {
            source: "try { localStorage.setItem('gampo_onboarding_v1', JSON.stringify({ seen: true, seenAt: new Date().toISOString() })); } catch (e) {}",
        }, sessionId)
    } catch { /* older Chromium may reject */ }

    let failures = 0
    for (const vp of VIEWPORTS) {
        await send('Emulation.setDeviceMetricsOverride', {
            width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: true,
        }, sessionId)
        for (const route of ROUTES) {
            await send('Page.navigate', { url: `${BASE}${route}` }, sessionId)
            await sleep(1700)
            let r
            try { r = await evalExpr(checkExpr, sessionId) }
            catch (e) { r = { ok: false, reason: String(e).slice(0, 80) } }
            const status = r.ok ? 'PASS' : (r.reason?.includes('no setup') ? 'SKIP' : 'FAIL')
            if (status === 'FAIL') failures++
            console.log(`${status} ${vp.w}x${vp.h} ${route} :: ${JSON.stringify(r)}`)
            // Wave 2: 44px touch floor on the bet chips. Sheet SKIPs don't
            // count as failures — many games don't expose the bet sheet
            // (e.g. fixed-stake games).
            let tf
            try { tf = await evalExpr(TOUCH_FLOOR_EXPR, sessionId) }
            catch (e) { tf = { ok: false, reason: String(e).slice(0, 80) } }
            const tfStatus = tf.ok ? 'PASS' : (tf.reason?.includes('no stepper') ? 'SKIP' : 'FAIL')
            if (tfStatus === 'FAIL') failures++
            console.log(`${tfStatus} ${vp.w}x${vp.h} ${route} touch-floor :: ${JSON.stringify(tf)}`)
        }
    }

    await send('Target.closeTarget', { targetId })
    ws.close()
    proc.kill()
    console.log(failures === 0 ? '\\nALL BET-SHEET CHECKS PASSED' : `\\n${failures} BET-SHEET CHECK(S) FAILED`)
    process.exit(failures === 0 ? 0 : 1)
}

main().catch(err => { console.error(err); proc.kill(); process.exit(1) })
