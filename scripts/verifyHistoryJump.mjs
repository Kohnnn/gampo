// S6 regression probe: the in-game History jump must actually land the user on
// the History panel below 768px, and must not appear on desktop where the aside
// is already visible beside the stage.
//
// Real rendered-browser check (not a source-text assertion). `HistoryDrawer`
// lives in `GameShell`'s aside, which stacks *under* the playfield on mobile —
// measured at scroll top 2002 of a 2280px area versus in-viewport on desktop,
// i.e. reachable but effectively undiscoverable.
//
// Reuses raw CDP over Node's global WebSocket so it needs no extra deps.
//
// Usage:
//   npm run build && npx vite preview --host 127.0.0.1 --port 4173
//   node scripts/verifyHistoryJump.mjs --baseUrl=http://127.0.0.1:4173 \
//     --browser=/path/to/chrome
//
// Exits non-zero on any failure so it can gate a phase.

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = (process.argv.find(a => a.startsWith('--baseUrl='))?.split('=')[1] || 'http://127.0.0.1:4173').replace(/\/$/, '')
const ROUTES = (process.argv.find(a => a.startsWith('--routes='))?.split('=')[1] || '/dice,/crash,/plinko').split(',')
const EDGE_CANDIDATES = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
]
const browser = process.argv.find(a => a.startsWith('--browser='))?.split('=')[1]
    || EDGE_CANDIDATES.find(c => existsSync(c))
if (!browser) throw new Error('No Chrome/Chromium found; pass --browser=')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const port = 9800 + Math.floor(Math.random() * 150)
const userDataDir = join(tmpdir(), `gampo-histjump-${process.pid}`)

const failures = []
const record = (ok, label, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label} :: ${JSON.stringify(detail)}`)
    if (!ok) failures.push(label)
}

let proc
let ws
let nextId = 1
const pending = new Map()

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

async function waitForDebugger() {
    const start = Date.now()
    while (Date.now() - start < 15000) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`)
            if (res.ok) return res.json()
        } catch { /* retry */ }
        await sleep(200)
    }
    throw new Error('debugger not ready')
}

// Mobile geometry probe: is the control visible, where is History, and where
// does History land after activating the control?
const mobileExpr = `
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const btn = document.querySelector('[data-gt-history]');
  const panel = document.querySelector('.hd-panel');
  if (!btn) return { ok: false, reason: 'no history control rendered' };
  const br = btn.getBoundingClientRect();
  const before = panel ? panel.getBoundingClientRect() : null;
  const out = {
    buttonVisible: br.width > 0 && br.height > 0,
    buttonW: Math.round(br.width),
    historyTopBefore: before ? Math.round(before.top) : null,
    viewportH: innerHeight,
  };
  btn.click();
  await sleep(1400);
  const panel2 = document.querySelector('.hd-panel');
  const dock = document.querySelector('.bp-mobile-dock');
  const p2 = panel2 ? panel2.getBoundingClientRect() : null;
  const d2 = dock ? dock.getBoundingClientRect() : null;
  out.historyTopAfter = p2 ? Math.round(p2.top) : null;
  out.onScreen = p2 ? (p2.top >= 0 && p2.top < innerHeight) : false;
  out.detailsOpen = panel2 ? !!panel2.open : null;
  out.dockTop = d2 ? Math.round(d2.top) : null;
  out.aboveDock = (p2 && d2) ? p2.top < d2.top : false;
  return out;
})()
`

const desktopExpr = `
(() => {
  const btn = document.querySelector('[data-gt-history]');
  const summary = document.querySelector('.hd-panel .hd-header');
  const r = summary ? summary.getBoundingClientRect() : null;
  return {
    buttonDisplay: btn ? getComputedStyle(btn).display : 'MISSING',
    historyTop: r ? Math.round(r.top) : null,
    inViewport: r ? (r.top < innerHeight) : false,
  };
})()
`

try {
    proc = spawn(browser, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run', '--no-default-browser-check', '--disable-gpu',
        'about:blank',
    ], { stdio: 'ignore' })

    await waitForDebugger()
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const target = list.find(t => t.type === 'page')
    if (!target) throw new Error('no page target')
    ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
        ws.onopen = resolve
        ws.onerror = reject
    })
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id)
            pending.delete(msg.id)
            if (msg.error) reject(new Error(JSON.stringify(msg.error)))
            else resolve(msg.result)
        }
    }

    await send('Page.enable')
    await send('Runtime.enable')

    async function visit(url, width, height) {
        await send('Emulation.setDeviceMetricsOverride', {
            width, height, deviceScaleFactor: 1, mobile: width < 769,
        })
        await send('Page.navigate', { url })
        await sleep(2600)
    }

    for (const route of ROUTES) {
        const url = BASE + route

        // --- mobile ---
        await visit(url, 375, 667)
        const mob = await evalExpr(mobileExpr)
        if (!mob?.ok && mob?.reason) {
            record(false, `${route} mobile probe`, mob)
        } else {
            record(mob.buttonVisible === true, `${route} mobile history control visible`, mob)
            record(
                mob.historyTopBefore !== null && mob.historyTopBefore > mob.viewportH,
                `${route} mobile History starts off-screen (the defect)`,
                { historyTopBefore: mob.historyTopBefore, viewportH: mob.viewportH },
            )
            record(mob.onScreen === true, `${route} mobile jump lands History on screen`, mob)
            record(mob.detailsOpen === true, `${route} mobile jump opens the History disclosure`, mob)
            record(mob.aboveDock === true, `${route} mobile History lands above the dock`, mob)
        }

        // --- desktop ---
        await visit(url, 1610, 870)
        const desk = await evalExpr(desktopExpr)
        record(desk.buttonDisplay === 'none', `${route} desktop hides the history control`, desk)
        record(desk.inViewport === true, `${route} desktop History already visible`, desk)
    }
} catch (err) {
    console.error('PROBE ERROR:', err.message)
    failures.push('probe error: ' + err.message)
} finally {
    try { ws?.close() } catch { /* ignore */ }
    try { proc?.kill() } catch { /* ignore */ }
}

if (failures.length) {
    console.log(`\nHISTORY JUMP FAILED (${failures.length}): ${failures.join('; ')}`)
    process.exit(1)
}
console.log('\nHISTORY JUMP PASSED')
