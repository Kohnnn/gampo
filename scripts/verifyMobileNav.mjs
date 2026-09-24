// Mobile navigation regression probe.
//
// Covers the defects an independent review found in the first version of the
// Phase 03 nav/mobile work. The original verification used synthetic DOM clicks
// (`el.click()`), which bypass hit-testing entirely and therefore passed while
// the drawer was actually broken. Every interaction check here therefore uses a
// real hit test (`elementFromPoint`) or a real dispatched pointer sequence.
//
// Specifically guards:
//   1. The off-canvas backdrop must sit BEHIND the drawer, not over it. As a
//      child of a transformed, z-indexed element it was trapped in that stacking
//      context and intercepted taps on the drawer's own links.
//   2. Tapping outside the drawer must hit the backdrop (so it dismisses).
//   3. The drawer must show text labels; a ≤1200px rule collapses the sidebar to
//      an icon rail, which left every destination unlabelled at 375px.
//   4. The bottom dock must stay ONE row. Six items with `auto-fit` wrapped to a
//      second row and grew the dock past the reserved --mobile-nav-height.
//   5. Escape must dismiss the drawer and return focus to its trigger.
//
// Reuses raw CDP over Node's global WebSocket so it needs no extra deps.

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = (process.argv.find(a => a.startsWith('--baseUrl='))?.split('=')[1] || 'http://127.0.0.1:4173').replace(/\/$/, '')
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
const port = 9950 + Math.floor(Math.random() * 120)
const userDataDir = join(tmpdir(), `gampo-mobilenav-${process.pid}`)

const failures = []
const record = (ok, label, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label} :: ${JSON.stringify(detail)}`)
    if (!ok) failures.push(label)
}

let proc
let ws
let nextId = 1
const pending = new Map()

function send(method, params = {}) {
    const id = nextId++
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
    })
}


// The welcome modal covers a fresh profile and would sit over the drawer in
// every hit test below, so dismiss it once after the first navigation.
const dismissModalExpr = `
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 14; i++) {
    const card = document.querySelector('.welcome-card');
    if (!card) return { dismissed: true, tries: i };
    const btn = [...card.querySelectorAll('button')].pop();
    if (btn) { btn.click(); await sleep(350); continue; }
    await sleep(250);
  }
  return { dismissed: !document.querySelector('.welcome-card') };
})()

`
async function evalExpr(expression) {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails))
    return res.result?.value
}

async function waitForDebugger() {
    const start = Date.now()
    while (Date.now() - start < 15000) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`)
            if (res.ok) return
        } catch { /* retry */ }
        await sleep(200)
    }
    throw new Error('debugger not ready')
}

async function clickAt(x, y) {
    for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', {
            type, x, y, button: 'left', clickCount: 1,
        })
    }
}

// --- probe bodies ---------------------------------------------------------

const dockExpr = `
(() => {
  const nav = document.querySelector('.mobile-bottom-nav');
  if (!nav) return { present: false };
  const items = [...nav.querySelectorAll('a, button')];
  const rows = new Set(items.map(i => Math.round(i.getBoundingClientRect().top)));
  const h = Math.round(nav.getBoundingClientRect().height);
  const reserved = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mobile-nav-height'), 10);
  return { present: true, items: items.length, rows: rows.size, height: h, reserved };
})()
`

const openDrawerExpr = `
(() => {
  const btn = document.querySelector('.header-menu-btn');
  if (!btn) return { ok: false, reason: 'no header menu button' };
  btn.click();
  return { ok: true };
})()
`

// Hit tests run AFTER the drawer is open, in a separate evaluate.
const drawerHitExpr = `
(() => {
  const sb = document.querySelector('.app-sidebar');
  const bd = document.querySelector('.sidebar-backdrop');
  if (!sb) return { ok: false, reason: 'no sidebar' };
  const sbR = sb.getBoundingClientRect();
  // A real destination other than the current route, so navigation is observable.
  const link = sb.querySelector('nav a[href]:not([href="/"])');
  if (!link) return { ok: false, reason: 'no drawer nav link' };
  const lr = link.getBoundingClientRect();
  const cx = lr.left + lr.width / 2;
  const cy = lr.top + lr.height / 2;
  const insideEl = document.elementFromPoint(cx, cy);
  const outX = Math.min(innerWidth - 2, sbR.right + 24);
  const outsideEl = outX > sbR.right ? document.elementFromPoint(outX, innerHeight / 2) : null;
  // Check EVERY label, not just the first: the earlier assertion would still
  // pass while all but one label had disappeared.
  const labels = [...sb.querySelectorAll('.nav-item span:not(.nav-icon)')];
  const hiddenLabels = labels.filter(e => e.getBoundingClientRect().width === 0);
  return {
    ok: true,
    insideHitsLink: !!insideEl && (insideEl === link || link.contains(insideEl)),
    insideClass: insideEl ? String(insideEl.className).slice(0, 40) : null,
    outsideHitsBackdrop: !!outsideEl && String(outsideEl.className).includes('sidebar-backdrop'),
    outsideClass: outsideEl ? String(outsideEl.className).slice(0, 40) : null,
    backdropIsSibling: !!bd && bd.parentElement === sb.parentElement,
    labelCount: labels.length,
    hiddenLabelCount: hiddenLabels.length,
    labelVisible: labels.length > 0 && hiddenLabels.length === 0,
    href: link.getAttribute('href'),
    tapX: Math.round(cx),
    tapY: Math.round(cy),
    stack: document.elementsFromPoint(cx, cy).slice(0, 4).map(e => e.tagName + '.' + String(e.className).slice(0, 24)),
    sidebarX: Math.round(sbR.x),
    innerW: innerWidth,
  };
})()
`

const focusStateExpr = `
(() => {
  const sb = document.querySelector('.app-sidebar');
  return {
    drawerX: sb ? Math.round(sb.getBoundingClientRect().x) : 999,
    focusInsideDrawer: !!sb && sb.contains(document.activeElement),
    focusOnMenuBtn: !!document.activeElement && document.activeElement.classList.contains('header-menu-btn'),
  };
})()
`

try {
    proc = spawn(browser, [
        '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
        '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank',
    ], { stdio: 'ignore' })
    await waitForDebugger()
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const target = list.find(t => t.type === 'page')
    if (!target) throw new Error('no page target')
    ws = new WebSocket(target.webSocketDebuggerUrl)

    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
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
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 1, mobile: true })
    await send('Page.navigate', { url: BASE + '/' })
    await sleep(3400)
    // 4. dock stays one row within its reserved height
    const dock = await evalExpr(dockExpr)
    record(dock.rows === 1, 'mobile dock stays a single row', dock)
    record(dock.height <= dock.reserved, 'mobile dock fits its reserved height', dock)

    // The welcome modal renders only after hydration, so it must be dismissed
    // here — after the app has settled — or it sits over the drawer in every hit
    // test below. It is verified gone (element absent) before proceeding.
    const modal = await evalExpr(`
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 30; i++) {
    const card = document.querySelector('.welcome-card');
    if (!card) {
      if (i > 3) return { gone: true, tries: i };
      await sleep(200);
      continue;
    }
    const btn = [...card.querySelectorAll('button')].pop();
    if (btn) { btn.click(); await sleep(400); continue; }
    await sleep(200);
  }
  return { gone: !document.querySelector('.welcome-card'), tries: 30 };
})()
`)
    record(modal.gone === true, 'welcome modal is gone before hit testing', modal)
    await sleep(600)
    // 1/2/3. open the drawer (retrying until hydrated), then hit-test it for real
    const drawerOpened = await evalExpr(`
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 40; i++) {
    const btn = document.querySelector('.header-menu-btn');
    const sb = document.querySelector('.app-sidebar');
    if (btn && sb) {
      btn.click();
      // The drawer slides in over ~250ms; hit-testing mid-animation reads a
      // half-open box, so wait for the position to settle before returning.
      for (let j = 0; j < 20; j++) {
        await sleep(100);
        if (Math.round(sb.getBoundingClientRect().x) === 0) return { opened: true, tries: i };
      }
    }
    await sleep(250);
  }
  return { opened: false };
})()
`)
    record(drawerOpened.opened === true, 'drawer opens for the hit test', drawerOpened)
    const hit = await evalExpr(drawerHitExpr)
    record(hit.insideHitsLink === true, 'drawer links are not covered by the backdrop', hit)
    record(hit.outsideHitsBackdrop === true, 'tap outside the drawer hits the backdrop', hit)
    record(hit.backdropIsSibling === true, 'backdrop is a sibling of the drawer', hit)
    record(hit.labelVisible === true, 'drawer shows text labels at 375px', hit)

    // a REAL pointer tap on a link must navigate (synthetic .click() bypasses hit testing)
    await clickAt(hit.tapX, hit.tapY)
    await sleep(1600)
    const afterTap = await evalExpr('(() => ({ path: location.pathname, drawerClosed: Math.round(document.querySelector(".app-sidebar").getBoundingClientRect().x) < 0 }))()')
    // Assert the ACTUAL destination, not merely "not the root route": a tap
    // landing on any wrong non-root page would otherwise pass.
    record(afterTap.path === hit.href, 'real pointer tap on a drawer link navigates', { ...afterTap, expected: hit.href })

    // 5. Escape dismisses and returns focus
    await send('Page.navigate', { url: BASE + '/' })
    await sleep(3400)
    const modal2 = await evalExpr(`
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 30; i++) {
    const card = document.querySelector('.welcome-card');
    if (!card) {
      if (i > 3) return { gone: true, tries: i };
      await sleep(200);
      continue;
    }
    const btn = [...card.querySelectorAll('button')].pop();
    if (btn) { btn.click(); await sleep(400); continue; }
    await sleep(200);
  }
  return { gone: !document.querySelector('.welcome-card'), tries: 30 };
})()
`)
    record(modal2.gone === true, 'welcome modal gone before the keyboard test', modal2)
    // Focus must actually land on the trigger before Enter means anything.
    const focused = await evalExpr('(() => { const b = document.querySelector(".header-menu-btn"); b.focus(); return document.activeElement === b })()')
    record(focused === true, 'menu button holds focus before Enter', { focused })
    // `text` must be set for the browser to run the button's default
    // activation; a bare keyDown/keyUp pair dispatches the event but skips it.
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await sleep(900)
    await evalExpr(`
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const sb = document.querySelector('.app-sidebar');
  for (let i = 0; i < 25; i++) {
    if (Math.round(sb.getBoundingClientRect().x) === 0) return true;
    await sleep(100);
  }
  return false;
})()
`)
    const opened = await evalExpr(focusStateExpr)
    record(opened.drawerX === 0, 'Enter on the menu button opens the drawer', opened)
    record(opened.focusInsideDrawer === true, 'focus moves into the opened drawer', opened)

    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await sleep(900)
    const closed = await evalExpr(focusStateExpr)
    record(closed.drawerX < 0, 'Escape dismisses the drawer', closed)
    record(closed.focusOnMenuBtn === true, 'Escape returns focus to the menu button', closed)
} catch (err) {
    console.error('PROBE ERROR:', err.message)
    failures.push('probe error: ' + err.message)
} finally {
    try { ws?.close() } catch { /* ignore */ }
    try { proc?.kill() } catch { /* ignore */ }
}

if (failures.length) {
    console.log(`\nMOBILE NAV FAILED (${failures.length}): ${failures.join('; ')}`)
    process.exit(1)
}
console.log('\nMOBILE NAV PASSED')
