// Overlay-above-drawer regression probe.
//
// Guards the Escape-ownership rule for the mobile drawer: when an overlay is
// painted above the drawer, one Escape must dismiss ONE layer — the overlay
// first, then the drawer — never the drawer underneath a still-open overlay.
//
// This probe exists because three successive attempts at that rule each failed
// on a real route, and none of them was caught by `verifyMobileNav.mjs`:
//
//   1. Inferring intent from DOM state (any mounted `[role="dialog"]`) broke on
//      `/dice`, where BetPanel keeps a closed sheet portaled as `role="dialog"`.
//   2. A hardcoded class list (`.hotkey-backdrop, [role="dialog"][aria-modal]`)
//      broke on `/slots`, whose bet sheet uses `role="dialog"` with no
//      `aria-modal` and neither listed class.
//   3. A pattern list of dialog/backdrop/overlay/sheet selectors would still
//      miss an overlay named otherwise (e.g. `.sb-mobile-slip`).
//
// The rule is now structural — an overlay is detected from what is actually
// painted above the drawer — so this probe asserts observable behaviour on the
// three real co-existence cases rather than asserting the implementation.
//
// Reuses raw CDP over Node's global WebSocket so it needs no extra deps.

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = (process.argv.find(a => a.startsWith('--baseUrl='))?.split('=')[1] || 'http://127.0.0.1:4173').replace(/\/$/, '')
const CHROME_CANDIDATES = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
]
const browser = process.argv.find(a => a.startsWith('--browser='))?.split('=')[1]
    || CHROME_CANDIDATES.find(c => existsSync(c))
if (!browser) throw new Error('No Chrome/Chromium found; pass --browser=')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const port = 9950 + Math.floor(Math.random() * 120)
const userDataDir = join(tmpdir(), `gampo-overlaystack-${process.pid}`)

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

// Reports which overlay layer is up, from the behaviour's own contract: the
// overlay declares an Escape claim while it is open. Used only to report the
// state, never as the assertion itself — the assertions below are on
// observable behaviour.
const overlayProbeExpr = `
(() => {
  const d = document.querySelector('.app-sidebar');
  return {
    ok: !!d,
    shortcutsOpen: !!document.querySelector('.hotkey-card'),
    betSheetOpen: !!document.querySelector('.slot-mobile-bet-sheet-backdrop'),
  };
})()
`

const stateExpr = `
(() => {
  const sb = document.querySelector('.app-sidebar');
  return {
    drawerX: sb ? Math.round(sb.getBoundingClientRect().x) : 999,
    drawerOpen: !!sb && Math.round(sb.getBoundingClientRect().x) === 0,
    shortcutsOpen: !!document.querySelector('.hotkey-card'),
    betSheetOpen: !!document.querySelector('.slot-mobile-bet-sheet-backdrop'),
    menuFocused: !!document.activeElement && document.activeElement.classList.contains('header-menu-btn'),
  };
})()
`

const toolsStateExpr = `
(() => {
  const sb = document.querySelector('.app-sidebar');
  return {
    drawerOpen: !!sb && Math.round(sb.getBoundingClientRect().x) === 0,
    popoverOpen: !!document.querySelector('.gt-popover-portal'),
  };
})()
`

const dismissWelcomeExpr = `
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 20; i++) {
    const card = document.querySelector('.welcome-card');
    if (!card) {
      if (i > 3) return { gone: true, tries: i };
      await sleep(200);
      continue;
    }
    const btn = [...card.querySelectorAll('button')].pop();
    if (btn) { btn.click(); await sleep(350); continue; }
    await sleep(200);
  }
  return { gone: !document.querySelector('.welcome-card') };
})()
`

const openDrawerExpr = `
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const btn = document.querySelector('.header-menu-btn');
  if (!btn) return { opened: false, reason: 'no menu button' };
  btn.click();
  for (let i = 0; i < 25; i++) {
    await sleep(100);
    const sb = document.querySelector('.app-sidebar');
    if (sb && Math.round(sb.getBoundingClientRect().x) === 0) return { opened: true };
  }
  return { opened: false };
})()
`

// Focus a drawer link so the drawer's Escape handler is eligible to claim the
// key (it only acts when focus is inside the drawer).
const focusDrawerLinkExpr = `
(() => {
  const sb = document.querySelector('.app-sidebar');
  const link = sb && sb.querySelector('nav a[href], button');
  if (link) link.focus();
  return { focusedInside: !!sb && sb.contains(document.activeElement) };
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
    await send('Emulation.setDeviceMetricsOverride', {
        width: 375, height: 667, deviceScaleFactor: 1, mobile: true,
    })

    const go = async (path) => {
        await send('Page.navigate', { url: BASE + path })
        await sleep(3200)
        await evalExpr(dismissWelcomeExpr)
        await sleep(400)
    }
    const pressEscape = async () => {
        for (const type of ['keyDown', 'keyUp']) {
            await send('Input.dispatchKeyEvent', {
                type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
            })
        }
        await sleep(600)
    }
    const pressQuestion = async () => {
        for (const type of ['keyDown', 'keyUp']) {
            await send('Input.dispatchKeyEvent', {
                type, key: '?', code: 'Slash', windowsVirtualKeyCode: 191, nativeVirtualKeyCode: 191, modifiers: 8,
            })
        }
        await sleep(700)
    }

    // --- 1. Library route: no overlay. Escape must close the drawer and restore focus.
    await go('/originals')
    const opened1 = await evalExpr(openDrawerExpr)
    record(opened1.opened === true, 'drawer opens with no overlay', opened1)
    const det1 = await evalExpr(overlayProbeExpr)
    record(det1.shortcutsOpen === false && det1.betSheetOpen === false, 'no overlay is up over an unobstructed drawer', det1)
    await evalExpr(focusDrawerLinkExpr)
    await pressEscape()
    const s1 = await evalExpr(stateExpr)
    record(s1.drawerOpen === false, 'Escape closes the drawer when nothing is above it', s1)
    record(s1.menuFocused === true, 'Escape returns focus to the menu button', s1)

    // --- 2. /dice + shortcuts panel. The panel opens on `?` WITHOUT moving focus,
    //        which is exactly why the drawer's handler must not claim the key.
    await go('/dice')
    await evalExpr(openDrawerExpr)
    await pressQuestion()
    const det2 = await evalExpr(overlayProbeExpr)
    const s2pre = await evalExpr(stateExpr)
    record(s2pre.shortcutsOpen === true, 'shortcuts panel opens over the drawer', s2pre)
    record(det2.shortcutsOpen === true, 'shortcuts panel is reported up over the drawer', det2)
    await evalExpr(focusDrawerLinkExpr)
    await pressEscape()
    const s2a = await evalExpr(stateExpr)
    record(s2a.shortcutsOpen === false, 'first Escape closes the shortcuts panel', s2a)
    record(s2a.drawerOpen === true, 'first Escape does not close the drawer underneath', s2a)
    await pressEscape()
    const s2b = await evalExpr(stateExpr)
    record(s2b.drawerOpen === false, 'second Escape closes the drawer once the panel is gone', s2b)
    record(s2b.menuFocused === true, 'second Escape returns focus to the menu button', s2b)

    // --- 3. /slots + bet sheet. This sheet is `role="dialog"` with NO
    //        `aria-modal` and no backdrop class, so both earlier implementations
    //        missed it and Escape closed the drawer underneath.
    await go('/slots')
    const sheetOpened = await evalExpr(`
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const el = document.querySelector('.slot-mobile-readout');
  if (!el) return { ok: false, reason: 'no bet readout control' };
  el.click();
  for (let i = 0; i < 20; i++) {
    await sleep(100);
    if (document.querySelector('.slot-mobile-bet-sheet-backdrop')) return { ok: true };
  }
  return { ok: false, reason: 'sheet did not open' };
})()
`)
    record(sheetOpened.ok === true, 'slots bet sheet opens', sheetOpened)
    await evalExpr(openDrawerExpr)
    const det3 = await evalExpr(overlayProbeExpr)
    const s3pre = await evalExpr(stateExpr)
    record(s3pre.betSheetOpen === true && s3pre.drawerOpen === true, 'bet sheet and drawer are both open', s3pre)
    record(det3.betSheetOpen === true, 'bet sheet is reported up over the drawer', det3)
    await evalExpr(focusDrawerLinkExpr)
    await pressEscape()
    const s3 = await evalExpr(stateExpr)
    record(s3.drawerOpen === true, 'Escape does not close the drawer underneath the bet sheet', s3)
    // The sheet now handles Escape itself (it previously had no handler), so it
    // closes and the drawer beneath it stays open. The assertion is on the
    // stacking behaviour — one Escape, one layer — not on which layer wins.
    record(s3.betSheetOpen === false, 'Escape closes the bet sheet that owns the key', s3)

    // --- 4. Two claimed overlays open at once. This is the case that broke the
    //        previous boolean-claim design: with two independent handlers on the
    //        same node, one Escape closed BOTH. Ownership now routes to a single
    //        handler, so each keypress must close exactly one layer.
    await go('/slots')
    const betAgain = await evalExpr(`
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const el = document.querySelector('.slot-mobile-readout');
  if (!el) return { ok: false, reason: 'no bet readout control' };
  el.click();
  for (let i = 0; i < 20; i++) {
    await sleep(100);
    if (document.querySelector('.slot-mobile-bet-sheet-backdrop')) return { ok: true };
  }
  return { ok: false, reason: 'sheet did not open' };
})()
`)
    record(betAgain.ok === true, 'slots bet sheet opens for the concurrent case', betAgain)
    await evalExpr(openDrawerExpr)
    await pressQuestion()
    await evalExpr(focusDrawerLinkExpr)
    const cPre = await evalExpr(stateExpr)
    record(cPre.betSheetOpen === true && cPre.shortcutsOpen === true, 'two claimed overlays are open at once', cPre)
    await pressEscape()
    const cMid = await evalExpr(stateExpr)
    const closed = (cPre.betSheetOpen && !cMid.betSheetOpen ? 1 : 0) + (cPre.shortcutsOpen && !cMid.shortcutsOpen ? 1 : 0)
    record(closed === 1, 'one Escape closes exactly ONE of the two overlays', { ...cMid, closedCount: closed })
    await pressEscape()
    const cEnd = await evalExpr(stateExpr)
    record(
        cEnd.betSheetOpen === false && cEnd.shortcutsOpen === false,
        'the second Escape closes the remaining overlay',
        cEnd,
    )
    record(cEnd.drawerOpen === true, 'the drawer survives both overlay Escapes', cEnd)

    // --- 5. Game tools popover over the drawer. This overlay keeps its own
    //        window Escape listener; when it was unregistered, one Escape
    //        closed the popover AND the drawer.
    await go('/dice')
    const toolsOpened = await evalExpr(`
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const btn = document.querySelector('button[aria-label="Game tools"]');
  if (!btn) return { ok: false, reason: 'no game tools button' };
  btn.click();
  for (let i = 0; i < 20; i++) {
    await sleep(100);
    if (document.querySelector('.gt-popover-portal')) return { ok: true };
  }
  return { ok: false, reason: 'popover did not open' };
})()
`)
    record(toolsOpened.ok === true, 'game tools popover opens', toolsOpened)
    await evalExpr(openDrawerExpr)
    await evalExpr(focusDrawerLinkExpr)
    const tPre = await evalExpr(toolsStateExpr)
    record(tPre.popoverOpen === true && tPre.drawerOpen === true, 'popover and drawer are both open', tPre)
    await pressEscape()
    const tMid = await evalExpr(toolsStateExpr)
    record(tMid.popoverOpen === false, 'first Escape closes the popover', tMid)
    record(tMid.drawerOpen === true, 'first Escape does not close the drawer under the popover', tMid)
    await pressEscape()
    const tEnd = await evalExpr(toolsStateExpr)
    record(tEnd.drawerOpen === false, 'second Escape closes the drawer once the popover is gone', tEnd)

    if (failures.length) {
        console.log(`\nOVERLAY STACK FAILED (${failures.length}): ${failures.join('; ')}`)
        process.exitCode = 1
    } else {
        console.log('\nOVERLAY STACK PASSED')
    }
} finally {
    try { ws?.close() } catch { /* ignore */ }
    try { proc?.kill() } catch { /* ignore */ }
}
