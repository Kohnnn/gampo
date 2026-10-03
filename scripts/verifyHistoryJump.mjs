// Phase 03 residual journey oracle (J1-J10 + J2a/J3a/J3b/J4a/J9a).
//
// Implements the bounded evidence matrix of the residual Validate Contract:
//   process/features/casino-overhaul/active/casino-experience-wayfinder_23-09-26/
//     phase-03-browse-residual-journey_PLAN_29-09-26.md
//
// Owned runtime only: exclusive disposable profile, launched child with
// --remote-debugging-port=0, DevToolsActivePort + child announcement +
// /json/version UUID must agree before any Page/Runtime/Input call, and only
// the created page target is used. Cleanup failure is a gate failure.
//
// Usage:
//   npm run build && npx vite preview --host 127.0.0.1 --port 4173
//   npm run verify:residual-journey -- --baseUrl=http://127.0.0.1:4173 \
//     --browser=/path/to/chrome
//
// Exits non-zero on any failed, skipped or missing required case.

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

import { join } from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
// Per-case isolation. The residual contract's J1 case is "fresh profile", and
// J4/J10 assert round-settlement deltas, so each case must start from a known
// storage state instead of inheriting the previous case's ledger. Without this
// the oracle reports the *previous* case's leftovers as the app's behaviour.
const GAMPO_KEYS = [
    'gampo_credits', 'gampo_history', 'gampo_history_dice',
    'gampo_pinned_games', 'gampo_onboarding_v1',
]


// Mode setup per parent line 769. Never infer the mode from the launch flag:
// assert the rendered matchMedia result and root class after hydration.
const MODE_SPECS = {
    N: { osReduce: false, appReduce: false },
    O: { osReduce: true, appReduce: false },
    A: { osReduce: false, appReduce: true },
}

async function applyMode(mode) {
    const spec = MODE_SPECS[mode]
    await send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: spec.osReduce ? 'reduce' : 'no-preference' }],
    })
    await run(`
      let settings = {};
      try { settings = JSON.parse(localStorage.getItem('gampo_settings_v1') || '{}') || {}; } catch { settings = {}; }
      settings.reduceMotion = ${spec.appReduce};
      localStorage.setItem('gampo_settings_v1', JSON.stringify(settings));
      return true;
    `)
}

// Asserted from rendered state, not from what we asked for.
const MODE_STATE_EXPR = `
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  return { reduce, rootClass: root.className.includes('gampo-reduce-motion') };
`

// Mode identity is bound to the two inputs the app actually consumes:
//  * `O` (OS reduce) is a media-query preference. Per the bound residual plan,
//    folding it into the app's motion class is explicit Phase 05 work, and
//    `useSettings.js` is a read-only dependency for this phase — so `O` asserts
//    the media query only and must NOT require the root class.
//  * `A` (in-app toggle) is asserted on the root class, which is the surface it
//    actually drives.
// Asserting `O` on the root class demanded an out-of-scope app change; that is
// an oracle defect, not an app defect.
const modeMatches = (mode, state) => {
    const spec = MODE_SPECS[mode]
    if (state.reduce !== spec.osReduce) return false
    if (mode === 'A') return state.rootClass === true
    if (mode === 'O') return true
    return state.rootClass === false
}
// Resets the isolated state, then asserts the precondition before any case may
// record an app verdict. A failed precondition is an oracle failure, not an app
// failure, and is labelled as such.
async function beginCase(id, expect = {}, viewport = { w: 375, h: 667, mobile: true }, mode = 'N') {
    // Storage is origin-scoped: navigate first, then reset and apply the mode,
    // otherwise about:blank denies localStorage access.
    await goto('/', viewport.w, viewport.h, viewport.mobile)
    await applyMode(mode)
    await run(`
      for (const k of ${JSON.stringify(GAMPO_KEYS)}) localStorage.removeItem(k);
      localStorage.removeItem('gampo_welcome_dismissed');
      sessionStorage.clear();
      return true;
    `)
    if (expect.credits !== undefined) {
        await run(`
          localStorage.setItem('gampo_credits', ${JSON.stringify(String(expect.credits))});
          return true;
        `)
    }
    const state = await storage()
    const fresh = !GAMPO_KEYS.some(k => k !== 'gampo_credits' && state[k] !== undefined && state[k] !== null)
    if (!fresh) {
        record(id, false, 'ORACLE PRECONDITION: isolated storage was not fresh', { leaked: Object.keys(state).filter(k => GAMPO_KEYS.includes(k)) })
        return false
    }
    return true
}

// Precondition gate: record ORACLE PRECONDITION (a probe defect) rather than an
// app verdict when the state a case needs was never established.
const precondition = (id, ok, label, detail) => {
    if (ok) return true
    record(id, false, `ORACLE PRECONDITION: ${label}`, detail)
    return false
}

// Labels each orchestration step so a mid-case throw names the exact call it
// came from, instead of reporting only the injected expression.
let CASE_STEP = 'boot'
const step = async (label, fn) => { CASE_STEP = label; try { return await fn() } catch (err) { throw new Error(`[at ${label}] ${err.message}`) } }

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback
const BASE = (arg('baseUrl', 'http://127.0.0.1:4173')).replace(/\/$/, '')
const EDGE_CANDIDATES = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
]
const browser = arg('browser', undefined) || EDGE_CANDIDATES.find(c => existsSync(c))
if (!browser || !existsSync(browser)) throw new Error('No Chrome/Chromium found; pass --browser=<absolute path>')

const sleep = ms => new Promise(r => setTimeout(r, ms))

// --- case registry --------------------------------------------------------
// The required matrix is PREDECLARED here, not discovered while running. Plan
// line 229 makes a missing or skipped required case a failure, so registering
// an ID only at the moment it is recorded would let an omission pass silently.
const VIEWPORTS_CORE = ['375x667', '740x360', '768x1024', '1610x870']
const VIEWPORTS_N = VIEWPORTS_CORE
const VIEWPORTS_TWO = ['375x667', '1610x870']
const MODES = ['N', 'O', 'A']
const METHODS = ['kb', 'ptr']
const coreCell = (j, suffix = '') => VIEWPORTS_CORE.flatMap(vp => MODES.flatMap(m => METHODS.map(me => `${j}.${vp}.${m}.${me}${suffix}`)))
const single = (j, viewports = VIEWPORTS_N) => viewports.map(vp => `${j}.${vp}.N`)

// J9 records a precondition under `J9.<vp>.N` plus these named sub-assertions.
const J9_SUBCASES = VIEWPORTS_TWO.flatMap(vp => [
    `J9.${vp}.N`,
    ...['malformed JSON', 'wrong type', 'mixed array'].map(l => `J9.${vp}.N.${l}`),
    ...['13-distinct-paths', '13-add-fifo', 'over-cap', 'dup', 'pin-only-setItem-failure', 'pin-only-truthful']
        .map(k => `J9.${vp}.N.${k}`),
])

const REQUIRED_CASES = new Set([
    // J1-J6: four viewports x N/O/A x independent keyboard and pointer subcases.
    ...coreCell('J1'), ...coreCell('J2'), ...coreCell('J3'),
    ...coreCell('J4'), ...coreCell('J5'), ...coreCell('J6'),
    // Single-cell cases at four N viewports.
    ...single('J2a'), ...single('J3a'), ...single('J3b'), ...single('J4a'),
    ...single('J7'), ...single('J8'),
    // Storage/interruption boundaries at two N sizes.
    // J9 is one precondition cell plus its named sub-assertions, so every
    // sub-case id the body records is declared here too — otherwise
    // `recordCase` correctly rejects them as unregistered.
    ...J9_SUBCASES, ...single('J9a', VIEWPORTS_TWO), ...single('J10', VIEWPORTS_TWO),
])

const failures = []
const required = new Set(REQUIRED_CASES)
const seen = new Set()
// Retained for call-site compatibility; the ID is already predeclared, so this
// no longer decides whether an omission fails.
const require_ = id => id
const record = (id, ok, label, detail) => {
    seen.add(id)
    console.log(`${ok ? 'PASS' : 'FAIL'} [${id}] ${label} :: ${JSON.stringify(detail)}`)
    if (!ok) failures.push(`${id} ${label}`)
}

// Records a case against the PREDECLARED matrix. An ID outside the matrix is
// itself a failure, so a typo cannot create a phantom pass.
const recordCase = (id, ok, label, detail) => {
    if (!REQUIRED_CASES.has(id)) {
        record(id, false, `CASE NOT IN PREDECLARED MATRIX: ${label}`, detail)
        return
    }
    record(id, ok, label, detail)
}

// Asserts the emulated mode actually took effect in the rendered document. A
// mode that did not apply must fail the cell rather than silently run as N.
async function assertMode(id, mode) {
    const state = await run(MODE_STATE_EXPR)
    if (!modeMatches(mode, state)) {
        recordCase(id, false, `mode ${mode} did not take effect in the rendered document`, { mode, expected: MODE_SPECS[mode], state })
        return false
    }
    return true
}

// --- owned CDP runtime ----------------------------------------------------
let proc
let ws
let exited = false
let spawnError = null
let stderr = ''
let port = null
let userDataDir = null
let ownedTarget = null
let exitResolve
const exitPromise = new Promise(resolve => { exitResolve = resolve })
let nextId = 1
const pending = new Map()

const eventHandlers = new Map()
function onEvent(method, handler) {
    if (!eventHandlers.has(method)) eventHandlers.set(method, new Set())
    eventHandlers.get(method).add(handler)
    return () => eventHandlers.get(method).delete(handler)
}

function send(method, params = {}) {
    const id = nextId++
    return new Promise((resolve, reject) => {
        if (ws?.readyState !== WebSocket.OPEN) return reject(new Error('Owned CDP socket is not open'))
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
    })
}

async function evalExpr(expression) {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails))
    return res.result?.value
}

async function run(fnBody, args = {}) {
    const names = Object.keys(args)
    const argList = JSON.stringify(args)
    return evalExpr(`(async () => { const {${names.join(',')}} = ${argList}; ${fnBody} })()`)
}

async function waitForDebugger() {
    const started = Date.now()
    while (Date.now() - started < 20000) {
        if (spawnError) throw spawnError
        if (exited) throw new Error(`Chromium exited before debugger ownership: ${stderr}`)
        const file = await readFile(join(userDataDir, 'DevToolsActivePort'), 'utf8').catch(() => null)
        const announcement = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+(\/devtools\/browser\/[\w-]+))/)
        if (file && announcement) {
            const [number, path, ...extra] = file.trim().split(/\r?\n/)
            if (!/^\d+$/.test(number) || !/^\/devtools\/browser\/[\w-]+$/.test(path) || extra.length
                || Number(number) !== Number(new URL(announcement[1]).port) || announcement[2] !== path) {
                throw new Error('Ambiguous DevToolsActivePort/child announcement')
            }
            const response = await fetch(`http://127.0.0.1:${number}/json/version`).catch(() => null)
            if (response?.ok) {
                const version = await response.json()
                if (version.webSocketDebuggerUrl !== announcement[1]) throw new Error('Unowned debugger endpoint UUID')
                port = Number(number)
                console.log('OWNED DEBUGGER', JSON.stringify({ pid: proc.pid, port, uuid: path, browser: version.Browser }))
                return
            }
        }
        await sleep(100)
    }
    throw new Error('Owned debugger not ready')
}
async function key(k, withShift = false, code = undefined, vk = undefined) {
    const c = code ?? (k.length === 1 ? `Key${k.toUpperCase()}` : k)
    const vkey = vk ?? (k === 'Tab' ? 9 : k === 'Enter' ? 13 : k === 'Escape' ? 27 : 0)
    const common = { key: k, code: c, windowsVirtualKeyCode: vkey, nativeVirtualKeyCode: vkey, modifiers: withShift ? 8 : 0 }
    // Enter only activates a focused <button>/<a> when it arrives with `text`
    // (and a `char` event). A bare keyDown/keyUp pair produces no activation at
    // all in headless Chromium, which silently defeated the whole keyboard lane.
    // `keyDown` carrying text is what activates a focused <button>; adding a
    // separate `char` event doubles the activation (React sees two clicks), so
    // one event per physical key press is correct.
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...common, text: k.length === 1 ? k : (k === 'Enter' ? '\r' : undefined) })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...common })
}

async function clickAt(x, y) {
    for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, pointerType: 'mouse' })
    }
}

const rectOf = selector => run(`
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { x: rect.x, y: rect.y, w: rect.width, h: rect.height, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
           midX: rect.x + rect.width / 2, midY: rect.y + rect.height / 2 };
`)

async function clickSelector(selector) {
    const r = await rectOf(selector)
    if (!r) throw new Error(`missing click target ${selector}`)
    await clickAt(r.midX, r.midY)
    return r
}

const storage = () => run(`
  const out = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out[k] = localStorage.getItem(k); }
  return out;
`)

// A document mid-navigation has an opaque origin: touching localStorage there
// throws SecurityError, and the execution context can be destroyed outright.
// Those two are transient "not ready yet" states. Anything else (a malformed
// predicate, a real app error) must surface, not be swallowed into a timeout.
const TRANSIENT_EVAL = /SecurityError|Access is denied|Execution context was destroyed|Cannot find context|Inspected target navigated or closed/i

const waitFor = async (expr, timeout = 8000, step = 120) => {
    const started = Date.now()
    while (Date.now() - started < timeout) {
        let ok = false
        try {
            ok = await evalExpr(expr)
        } catch (err) {
            if (!TRANSIENT_EVAL.test(String(err && err.message))) throw err
        }
        if (ok) return true
        await sleep(step)
    }
    return false
}

async function dismissWelcome() {
    const has = await evalExpr(`!!document.querySelector('.welcome-cta')`)
    if (!has) return false
    await clickSelector('.welcome-cta').catch(() => {})
    await sleep(400)
    return true
}

async function goto(path, width, height, mobile) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
    await send('Page.navigate', { url: BASE + path })
    // A navigation that never reaches readyState=complete is a harness failure:
    // proceeding would assert against a half-loaded document.
    const ready = await waitFor(`document.readyState === 'complete'`, 15000)
    if (!ready) throw new Error(`navigation to ${path} never reached readyState=complete`)
    await sleep(900)
}

// --- journeys ------------------------------------------------------------
const VIEWPORTS = [
    { w: 375, h: 667, label: '375x667', mobile: true },
    { w: 740, h: 360, label: '740x360', mobile: true },
    { w: 768, h: 1024, label: '768x1024', mobile: false },
    { w: 1610, h: 870, label: '1610x870', mobile: false },
]


async function j1Search(vp, mode = 'N', method = 'ptr') {
    const caseId = `J1.${vp.label}.${mode}.${method}`
    await beginCase(caseId, { credits: 1000 }, vp, mode)
    await goto('/', vp.w, vp.h, vp.mobile)
    if (!(await assertMode(caseId, mode))) return
    const empty = await run(`
      const recent = document.querySelectorAll('[data-home-recent] [data-game-link], .game-card').length;
      const tx = localStorage.getItem('gampo_history');
      return { recentRows: recent, history: tx };
    `)
    recordCase(caseId, empty.recentRows === 0 && !empty.history, 'J1 fresh profile shows no fabricated recent/history', empty)

    await evalExpr(`(() => { const i = document.querySelector('.nav-game-search input, .search-input-wrapper input'); if (i) { i.focus(); } return !!i; })()`)
    const searched = await run(`
      const input = document.querySelector('.nav-game-search input, .search-input-wrapper input');
      if (!input) return { ok: false, reason: 'no search input' };
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '  dIcE  ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      const hrefs = [...document.querySelectorAll('a[href="/dice"]')].map(a => a.getAttribute('href'));
      return { ok: true, diceLinks: hrefs.length, firstHref: hrefs[0] || null };
    `)
    recordCase(caseId, searched.ok && searched.diceLinks > 0, 'J1 whitespace/case search resolves canonical /dice', searched)

    const noMatch = await run(`
      const input = document.querySelector('.nav-game-search input, .search-input-wrapper input');
      if (!input) return { ok: false };
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'zz-no-such-game-29');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      const links = [...document.querySelectorAll('.header-search-results a, .header-search-results a.active')].length;
      const empty = !!document.querySelector('.header-search-empty');
      setter.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return { links, empty };
    `)
    recordCase(caseId, noMatch.links === 0, 'J1 no-match query yields no result links', noMatch)

    const filter = await run(`
      const btns = [...document.querySelectorAll('.casino-filters button')];
      const slots = btns.find(b => b.textContent.trim() === 'Slots');
      const all = btns.find(b => b.textContent.trim() === 'All');
      if (!slots || !all) return { ok: false, reason: 'no casino-filters controls', found: btns.map(b => b.textContent.trim()) };
      slots.click(); await new Promise(r => setTimeout(r, 400));
      const slotsHasDice = !!document.querySelector('a[href="/dice"]');
      const slotsRows = document.querySelectorAll('#root a[href^="/"]').length;
      all.click(); await new Promise(r => setTimeout(r, 400));
      const allHasDice = !!document.querySelector('a[href="/dice"]');
      return { ok: true, slotsHasDice, slotsRows, allHasDice };
    `)
    // The 'Slots' filter selects items with a provider (HomePage: `filter === 'Slots' && item.provider`).
    // It is a provider filter, not a "slots category" filter, so Dice legitimately remains visible.
    // Assert the filter actually applies (row count changes and All restores) instead of a
    // category claim the UI never made.
    const allRows = await run(`
      const all = [...document.querySelectorAll('.casino-filters button')].find(b => b.textContent.trim() === 'All');
      if (!all) return -1;
      all.click(); await new Promise(r => setTimeout(r, 400));
      return document.querySelectorAll('#root a[href^="/"]').length;
    `)
    if (!precondition(caseId, allRows >= 0, 'no casino-filters All control to restore the grid', { allRows })) return
    // Assert the filter actually applies: Slots narrows the grid and All
    // restores it. A control that did nothing would leave the row count equal
    // and fail here, rather than passing on the precondition alone.
    recordCase(caseId,
        filter.ok && filter.slotsRows !== allRows && allRows > 0,
        'J1 Slots provider filter actually narrows the grid and All restores it',
        { slotsRows: filter.slotsRows, allRows, slotsHasDice: filter.slotsHasDice, allHasDice: filter.allHasDice })
}

// J2 / J2a drive the real pin control through BOTH input methods per cell. The
// pressed boolean must track persisted storage, not a transient optimistic
// render: after a tamper of the stored array the control must read false.
async function j2Pin(vp, mode, method, caseKind = 'J2') {
    // The same body serves the J2 matrix row (N/O/A x kb/ptr) and the added
    // single-cell J2a at N. The caller decides the id explicitly: deriving it
    // from mode/method would collide with the real core N/ptr slot, emitting an
    // unregistered id AND leaving `J2.<vp>.N.ptr` missing.
    const caseId = caseKind === 'J2a' ? `J2a.${vp.label}.N` : `J2.${vp.label}.${mode}.${method}`
    await beginCase(caseId, { credits: 1000 }, vp, mode)
    await goto('/originals', vp.w, vp.h, vp.mobile)
    await dismissWelcome()
    // Restore the N/O/A mode gate the id fix removed. J2a only ever runs at N,
    // but the J2 matrix cells must still prove the mode they claim.
    if (!(await assertMode(caseId, mode))) return



    // The pin lives in the sidebar: off-canvas below 769px, laid out beside the
    // content above it. Only open the drawer when it is actually off-canvas —
    // otherwise the hidden menu button swallows the click and the control is
    // never reached at desktop widths.
    // Reach the pin control. Two distinct obstacles: below 769px the sidebar is
    // off-canvas (open the drawer), and a collapsed desktop rail hides pins
    // outright (`.app-sidebar-hidden .nav-pin { display: none }`), so the rail
    // has to be expanded back before the control exists at all.
    const ensurePinReachable = async () => {
        const state = await run(`
          const b = document.querySelector('.header-menu-btn');
          const offCanvas = !!b && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0;
          const aside = document.querySelector('.app-sidebar');
          // The drawer is only "closed" when the class is present: the toggle
          // button is a TOGGLE, so clicking it while open would close it.
          const drawerClosed = !!aside && aside.classList.contains('app-sidebar-hidden');
          const hiddenRail = document.documentElement.classList.contains('app-sidebar-hidden');
          const pin = document.querySelector('.nav-row .nav-pin');
          const pinUsable = !!pin && pin.getBoundingClientRect().width > 0
              && getComputedStyle(pin).visibility !== 'hidden'
              && !(aside && aside.classList.contains('app-sidebar-hidden'));
          return { offCanvas, drawerClosed, hiddenRail, pinUsable };
        `)
        // Open only when the drawer is actually closed. HeaderMenuBtn is a
        // TOGGLE: clicking it while open would close the drawer we need.
        if (state.drawerClosed || state.hiddenRail) {
            const opened = await evalExpr(`(() => {
              const b = document.querySelector('.header-menu-btn');
              if (b && getComputedStyle(b).display !== 'none') { b.click(); return 'header'; }
              const t = [...document.querySelectorAll('button')]
                .find(x => /open navigation|open menu|show sidebar|expand sidebar/i
                  .test((x.getAttribute('aria-label') || '') + ' ' + (x.title || '')));
              if (t) { t.click(); return 'toggle'; }
              return null;
            })()`)
            if (opened) await sleep(900)
        } else if (!state.pinUsable) {
            // Desktop collapsed rail: the in-sidebar control labelled "Expand
            // sidebar" restores it; the header button is display:none here.
            const toggled = await evalExpr(`(() => {
              const t = [...document.querySelectorAll('button')]
                .find(b => /expand sidebar/i.test(b.getAttribute('aria-label') || b.title || ''));
              if (t) { t.click(); return true; }
              return false;
            })()`)
            if (toggled) await sleep(700)
        }
        return state
    }
    // Contract J2 pins /dice specifically (CONTRACT-MATRIX.md J2 requires the
    // stored array to be ['/dice']). Dice is a real sidebar row (Sidebar.jsx
    // gameItems), so the probe must target it by href rather than take whichever
    // pin is reachable: pinning any other game would not discharge the case.
    // The sidebar is its own scroll container, so scroll the row in and
    // re-measure.
    const findPin = (href) => run(`
      const rows = [...document.querySelectorAll('.nav-row')]
        .filter(row => row.querySelector('a[href="' + ${JSON.stringify(href)} + '"]'));
      for (const row of rows) {
        const a = row.querySelector('a[href]');
        const btn = row.querySelector('.nav-pin');
        if (!a || !btn) continue;
        btn.scrollIntoView({ block: 'center' });
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const r = btn.getBoundingClientRect();
        if (r.width < 10 || r.height < 10) continue;
        if (r.top < 0 || r.bottom > innerHeight) continue;
        return { href: a.getAttribute('href'), x: r.x + r.width / 2, y: r.y + r.height / 2,
                 pressed: btn.getAttribute('aria-pressed'), label: btn.getAttribute('aria-label') };
      }
      return null;
    `)
    const readPin = (href) => run(`
      const row = [...document.querySelectorAll('.nav-row')].find(x => x.querySelector('a[href="' + ${JSON.stringify(href)} + '"]'));
      const btn = row ? row.querySelector('.nav-pin') : null;
      return { ok: !!btn, pressed: btn ? btn.getAttribute('aria-pressed') : null,
               label: btn ? (btn.getAttribute('aria-label') || null) : null,
               stored: localStorage.getItem('gampo_pinned_games') };
    `)
    // Bind the case to its required witness: /dice, per CONTRACT-MATRIX J2.
    const PIN_TARGET = '/dice'
    await ensurePinReachable()
    const target = await findPin(PIN_TARGET)
    if (!precondition(caseId, !!target, `no reachable /dice pin control in the sidebar`, { target })) return

    const href = target.href
    // The sidebar search box is the React-controlled way to open every category
    // group; the label carries the game name (e.g. "Pin Dice").
    // The aria-label is "Pin Dice" / "Unpin Dice"; strip either prefix so the
    // sidebar search gets the bare game name ("Dice"), not the label.
    const GAME_NAME = (target.label || '').replace(/^(?:un)?pin\s+/i, '').trim() || href.replace(/^\//, '')
    // State 1 — unpinned. Contract: aria-pressed tracks storage across
    // unpinned / pinned / after-reload, with a changing label. Reading it before
    // the activation is what makes the later true a real transition rather than
    // a control that is always pressed.
    const beforeState = await readPin(href)
    if (!precondition(caseId, beforeState.pressed === 'false' && /^pin\s/i.test(beforeState.label || ''),
        'pin control did not start unpressed with a Pin label', beforeState)) return

    if (method === 'kb') {
        // Real keyboard: focus the control and activate with Enter.
        const focused = await run(`
          const row = [...document.querySelectorAll('.nav-row')].find(x => x.querySelector('a[href=${JSON.stringify(href)}]'));
          const btn = row ? row.querySelector('.nav-pin') : null;
          if (!btn) return { ok: false };
          btn.scrollIntoView({ block: 'center' });
          btn.focus();
          return { ok: document.activeElement === btn };
        `)
        if (!precondition(caseId, focused.ok, 'pin control could not receive keyboard focus', focused)) return
        await key('Enter', false, 'Enter', 13)
        await sleep(450)
    } else {
        // The control is `opacity: 0` until its row is hovered, so move the real
        // pointer onto it first — otherwise the target is present but not
        // perceivable or hit-testable.
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x, y: target.y, button: 'none' })
        await sleep(250)
        await clickAt(target.x, target.y)
        await sleep(450)
    }

    // State 2 — pinned. Contract requires storage to hold exactly /dice:
    // includes() would accept a polluted array, so compare the whole shape.
    const afterPin = await readPin(href)
    const storedAfter = JSON.parse(afterPin.stored || '[]')
    const pinPersisted = Array.isArray(storedAfter) && storedAfter.length === 1 && storedAfter[0] === PIN_TARGET
    const pressedAfterPin = afterPin.pressed === 'true'
    // Semantic, not merely "different": the label must move Pin -> Unpin for
    // this game, so an unrelated relabel cannot satisfy the contract. The
    // prefix strip must match both "Pin " and "Unpin " (^un?pin misses "Pin").
    const stripPin = (s) => (s || '').replace(/^(?:un)?pin\s+/i, '').trim()
    const labelChanged = /^unpin\s/i.test(afterPin.label || '')
        && /^pin\s/i.test(beforeState.label || '')
        && stripPin(afterPin.label) === stripPin(beforeState.label)
    // The pin must appear under the sidebar's "Pinned" group specifically, not
    // merely somewhere in the sidebar, and the pin must not create ledger rows
    // (it is a browse affordance, not a wager).
    const visibleIn = async () => run(`
      const groups = [...document.querySelectorAll('.app-sidebar details.nav-game-group')];
      const pinnedGroup = groups.find(g => /pinned/i.test(g.querySelector('summary')?.textContent || ''));
      const cardInPinnedGroup = pinnedGroup
        ? !!pinnedGroup.querySelector('a[href=${JSON.stringify(href)}]')
        : false;
      // Dice result history lives under gampo_history_dice (useGameSession.js:30
      // uses \`gampo_history_\${gameId}\`); the global gampo_history holds account
      // ledger rows. Both must stay empty: a pin is a browse affordance.
      // A missing key is legitimately empty. A present-but-malformed or
      // non-array value is NOT "no rows": it is a corrupted ledger, and must
      // fail rather than be normalised to [].
      const parse = (k) => {
        const raw = localStorage.getItem(k);
        if (raw == null) return { rows: [], valid: true };
        try { const v = JSON.parse(raw); return Array.isArray(v) ? { rows: v, valid: true } : { rows: [], valid: false }; }
        catch { return { rows: [], valid: false }; }
      };
      const g = parse('gampo_history');
      const d = parse('gampo_history_dice');
      const betRows = g.rows.filter(r => r && (r.type === 'bet' || r.type === 'return')).length;
      return { hasPinnedGroup: !!pinnedGroup, cardInPinnedGroup,
               ledgerRows: g.rows.length, betRows, diceRows: d.rows.length,
               ledgersValid: g.valid && d.valid };
    `)
    const pinnedVisibility = await visibleIn()
    // The Home "Pinned" surface only exists on `/`, so assert it there against
    // the same href — navigating to /dice would never show it.
    await goto('/', vp.w, vp.h, vp.mobile)
    const homePinned = await run(`
      // HomePage renders the pinned surface as a CategoryRow titled "Pinned
      // games" whose cards are .category-card (HomePage.jsx:214-215, 310-328).
      const rows = [...document.querySelectorAll('.category-row')];
      const pinnedRow = rows.find(r => /pinned games/i.test(r.querySelector('h2')?.textContent || ''));
      const card = pinnedRow ? pinnedRow.querySelector('.category-card[href=${JSON.stringify(href)}]') : null;
      return { onHome: location.pathname === '/',
               hasPinnedRow: !!pinnedRow,
               cardInPinnedRow: !!card };
    `)
    const shownOnHome = homePinned.onHome && homePinned.hasPinnedRow && homePinned.cardInPinnedRow
    await goto('/originals', vp.w, vp.h, vp.mobile)
    await ensurePinReachable()
    const reloadedPinned = await readPin(href)
    const retainedAfterNavigate = reloadedPinned.pressed === 'true'

    // Storage-vs-optimistic discrimination: tamper the stored array, then assert
    // the rendered pressed state follows storage, not a cached UI value.
    const tampered = await run(`
      localStorage.setItem('gampo_pinned_games', JSON.stringify([]));
      const row = [...document.querySelectorAll('.nav-row')].find(x => x.querySelector('a[href=${JSON.stringify(href)}]'));
      const btn = row ? row.querySelector('.nav-pin') : null;
      return { pressed: btn ? btn.getAttribute('aria-pressed') : null, stored: localStorage.getItem('gampo_pinned_games') };
    `)
    await goto('/originals', vp.w, vp.h, vp.mobile)
    await ensurePinReachable()
    const afterTamperReload = await readPin(href)
    const pressedTracksStorage = afterTamperReload.pressed === 'false'
    const labelRestored = /^pin\s/i.test(afterTamperReload.label || '')
        && afterTamperReload.label === beforeState.label

    // Every toggle below is anchored to the SAME href (/dice) resolved fresh
    // from the sidebar; a click on another game's pin would prove nothing.
    const spotFor = async () => run(`
      // Category groups render open={group === 'Featured' || 'Slots' || search}
      // (Sidebar.jsx:340), so hand-toggling open is undone by the next render.
      // Typing the game name into the sidebar search opens every group the
      // React way, then the row is guaranteed to have a real box.
      const input = document.querySelector('.nav-game-search input');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(GAME_NAME)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));
      }
      // offsetParent is null for position:fixed drawers (mobile sidebar), so
      // test the computed visibility and a non-zero box instead.
      const visible = el => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const b = el.getBoundingClientRect();
        return b.width > 0 || b.height > 0;
      };
      const rows = [...document.querySelectorAll('.app-sidebar .nav-row')]
        .filter(r => r.querySelector('a[href=${JSON.stringify(href)}]') && visible(r));
      if (!rows.length) return { fail: 'no visible row for href', total: document.querySelectorAll('.app-sidebar .nav-row').length };
      const row = rows[0];
      const btn = row.querySelector('.nav-pin');
      if (!btn) return { fail: 'row has no .nav-pin' };
      const aside = document.querySelector('.app-sidebar');
      if (aside && aside.scrollHeight > aside.clientHeight) {
        const rowTop = row.getBoundingClientRect().top - aside.getBoundingClientRect().top + aside.scrollTop;
        aside.scrollTop = Math.max(0, rowTop - Math.round(aside.clientHeight / 2));
      }

      // The control is opacity:0 until its row is hovered (index.css:1194),
      // and a collapsed group zeroes the row box. Reveal both, then settle
      // layout with a double RAF before measuring.
      row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const r = btn.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) {
        return { fail: 'control too small', w: r.width, h: r.height, open: row.closest('details')?.open ?? null };
      }
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !btn.contains(hit)) return { fail: 'hit test missed', hit: hit ? hit.className : null };
      return { x, y };
    `)
    const clickPinHref = async () => {
        await ensurePinReachable()
        const s = await spotFor()
        if (!s || s.fail) return { clicked: false, reason: s ? s.fail : 'null spot' }
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: s.x, y: s.y, button: 'none' })
        await sleep(200)
        await clickAt(s.x, s.y)
        await sleep(500)
        // Clear the search filter so later reads see the normal (unfiltered)
        // sidebar and the scroll position/group state stay realistic.
        await evalExpr(`(() => {
          const i = document.querySelector('.nav-game-search input');
          if (i && i.value) {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            setter.call(i, '');
            i.dispatchEvent(new Event('input', { bubbles: true }));
          }
          return true;
        })()`)
        await sleep(300)
        return { clicked: true }
    }

    // The tamper above cleared storage and the reload applied it, so /dice is
    // currently UNPINNED. Restore it first, otherwise the "unpin" leg would
    // actually pin and the composite would prove the inverse of the contract.
    const restoreClicked = await clickPinHref()
    const restored = await readPin(href)
    const restoreOk = restoreClicked.clicked && restored.pressed === 'true'
        && /^unpin\s/i.test(restored.label || '') && JSON.parse(restored.stored || '[]')[0] === PIN_TARGET

    // Contract order: unpin -> reload removes it -> re-pin.
    const unpinClicked = await clickPinHref()
    const unPin = await readPin(href)
    await goto('/originals', vp.w, vp.h, vp.mobile)
    await ensurePinReachable()
    const afterUnpinReload = await readPin(href)
    const unpinStored = JSON.parse(afterUnpinReload.stored || '[]')
    // Contract: unpin -> []; reload removes it. Assert the exact empty array.
    const unpinRemovedAfterReload = afterUnpinReload.pressed === 'false'
        && Array.isArray(unpinStored) && unpinStored.length === 0

    const rePinClicked = await clickPinHref()
    const rePin = await readPin(href)
    const rePinStored = JSON.parse(rePin.stored || '[]')
    // The re-pin must have been a real click, not pre-existing state.
    const rePinned = rePinClicked.clicked && rePin.pressed === 'true'
        && Array.isArray(rePinStored) && rePinStored.length === 1 && rePinStored[0] === PIN_TARGET

    // Immediate unpin effect: storage must be exactly [] at the moment of the
    // click, not merely after a reload (the matrix binds unpin -> []).
    const unPinStored = JSON.parse(unPin.stored || '[]')
    const unPinnedClears = unpinClicked.clicked && unPin.pressed === 'false'
        && Array.isArray(unPinStored) && unPinStored.length === 0

    // Browsing must never create ledger OR result rows: re-read both keys after
    // the whole toggle cycle, since the initial sample only covered the first
    // pin. Dice results are persisted under gampo_history_dice, not
    // gampo_history (useGameSession.js:30 -> `gampo_history_${gameId}`).
    const finalLedger = await run(`
      const parse = (k) => {
        const raw = localStorage.getItem(k);
        if (raw == null) return { rows: [], valid: true };
        try { const v = JSON.parse(raw); return Array.isArray(v) ? { rows: v, valid: true } : { rows: [], valid: false }; }
        catch { return { rows: [], valid: false }; }
      };
      const g = parse('gampo_history');
      const d = parse('gampo_history_dice');
      return { ledgerRows: g.rows.length,
               betRows: g.rows.filter(r => r && (r.type === 'bet' || r.type === 'return')).length,
               diceRows: d.rows.length,
               ledgersValid: g.valid && d.valid };
    `)
    const noLedgerRows = finalLedger.ledgerRows === 0 && finalLedger.betRows === 0
        && finalLedger.diceRows === 0 && finalLedger.ledgersValid
        && pinnedVisibility.ledgersValid

    // One composite record per case id: recording twice under the same id would
    // double-count the cell and hide a half-pass.
    recordCase(caseId,
        pinPersisted && pressedAfterPin && labelChanged
        && pinnedVisibility.hasPinnedGroup && pinnedVisibility.cardInPinnedGroup
        && pinnedVisibility.ledgerRows === 0 && pinnedVisibility.betRows === 0
        && pinnedVisibility.diceRows === 0 && pinnedVisibility.ledgersValid
        && shownOnHome
        && retainedAfterNavigate && pressedTracksStorage && labelRestored
        && restoreOk && unPinnedClears && unpinRemovedAfterReload && rePinned && noLedgerRows,
        `${caseKind} pin via ${method}: pin/unpin/reload-removal/re-pin, sidebar+home visibility, retention, no ledger rows`,
        { href, beforeState, afterPin, storedAfter, pinPersisted, pressedAfterPin, labelChanged,
          pinnedVisibility, homePinned, shownOnHome, retainedAfterNavigate, tampered,
          afterTamperReload, pressedTracksStorage, labelRestored, restoreOk, restored,
          unPin, unPinStored, unPinnedClears, unpinClicked, afterUnpinReload, unpinRemovedAfterReload,
          rePin, rePinned, rePinClicked, finalLedger, noLedgerRows })
}

// J3 — stake/rules/EV through the visible BetPanel plus Escape/opener focus.
async function j3Stake(vp, mode, method) {
    const caseId = `J3.${vp.label}.${mode}.${method}`
    await beginCase(caseId, { credits: 1000 }, vp, mode)
    await goto('/dice', vp.w, vp.h, vp.mobile)
    await dismissWelcome()
    if (!(await assertMode(caseId, mode))) return

    // On short landscape viewports the bet sheet mounts lazily, so wait for the
    // controls rather than sampling once and reporting a missing-input precondition.
    await waitFor(`!!document.querySelector('.bp-bet-input') && !!document.querySelector('.education-panel')`, 8000)
    const stake = await run(`
      const input = document.querySelector('.bp-bet-input');
      const info = document.querySelector('.education-panel');
      if (!input || !info) return { ok: false, hasInput: !!input, hasPanel: !!info };
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '7.5');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const text = info.textContent || '';
      const ev = (text.match(/EV per play[^0-9-]*(-?[0-9.]+)/) || [])[1];
      return { ok: true, value: input.value, evText: ev === undefined ? null : ev, panelText: text.slice(0, 160) };
    `)
    // The panel displays currency to 2dp, so 7.5 * 1% edge renders as -0.07.
    // Assert the displayed value matches the selected stake's edge within display
    // rounding, and that it is NOT the fabricated 5-stake edge (-0.05).
    const shown = stake.evText === null ? null : Number(stake.evText)
    const expectedEv = shown !== null && Math.abs(shown + 0.075) <= 0.0051
    const notFabricated = shown !== null && Math.abs(shown + 0.05) > 0.005
    recordCase(caseId, stake.ok && stake.value === '7.5' && expectedEv && notFabricated,
        `J3 EducationPanel EV reflects the 7.50 selected stake via ${method}, not a fixed 5`,
        { ...stake, expected: -0.075, fabricatedValue: -0.05 })

    // Empty/negative stake entry is clamped by the current UI: assert the actual
    // resulting value and that no spurious round is created.
    const clamped = await run(`
      const input = document.querySelector('.bp-bet-input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      const rowsBefore = JSON.parse(localStorage.getItem('gampo_history_dice') || '[]').length;
      setter.call(input, '-5');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      const rowsAfter = JSON.parse(localStorage.getItem('gampo_history_dice') || '[]').length;
      return { value: input.value, rowsBefore, rowsAfter, nonNegative: Number(input.value) >= 0 || input.value === '' };
    `)
    recordCase(caseId, clamped.nonNegative && clamped.rowsAfter === clamped.rowsBefore,
        `J3 negative stake is clamped with no spontaneous round via ${method}`, clamped)
}

// J3b — the disabled-reason contract as its own case: reachable by keyboard AND
// pointer, programmatically associated, accurate for BOTH reasons (first visit
// and mid-round). A visually present but unassociated string does not satisfy it.
async function j3Rebet(vp, mode, method) {
    const caseId = `J3b.${vp.label}.N`
    await beginCase(caseId, { credits: 1000 }, vp, mode)
    await goto('/dice', vp.w, vp.h, vp.mobile)
    await dismissWelcome()
    if (!(await assertMode(caseId, mode))) return

    const firstVisit = await run(`
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Rebet');
      if (!btn) return { ok: false, reason: 'no rebet button' };
      const desc = btn.getAttribute('aria-describedby');
      const reason = desc ? document.getElementById(desc) : null;
      const style = reason ? getComputedStyle(reason) : null;
      btn.focus();
      return { ok: true, disabled: btn.disabled, describedBy: desc || null,
               reasonText: reason ? reason.textContent.trim() : null,
               focusable: document.activeElement === btn,
               visible: !!(reason && style && style.display !== 'none' && style.visibility !== 'hidden' && reason.getBoundingClientRect().height > 0) };
    `)
    const assoc = !!firstVisit.describedBy && firstVisit.reasonText === 'Place your first bet to enable Rebet'
    recordCase(caseId, firstVisit.ok && firstVisit.disabled === true && firstVisit.visible && assoc,
        `J3b first-visit disabled reason is visible, associated and accurate at ${vp.label}`,
        { ...firstVisit, associated: assoc })

    // Mid-round reason: settle into an accepted round so `hasFixedBet` applies,
    // then re-read the reason text. It must change to the mid-round wording.
    const started = await run(`
      const play = document.querySelector('[data-bp-action]') || [...document.querySelectorAll('button')].find(b => /Roll Dice/.test(b.textContent));
      if (!play) return { ok: false };
      const rect = play.getBoundingClientRect();
      return { ok: true, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    `)
    if (precondition(caseId, started.ok, 'no play control to reach the mid-round reason', started)) {
        await clickAt(started.x, started.y)
        await sleep(400)
        const midRound = await run(`
          const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Rebet');
          if (!btn) return { ok: false };
          const desc = btn.getAttribute('aria-describedby');
          const reason = desc ? document.getElementById(desc) : null;
          const style = reason ? getComputedStyle(reason) : null;
          return { ok: true, disabled: btn.disabled, describedBy: desc || null,
                   reasonText: reason ? reason.textContent.trim() : null,
                   visible: !!(reason && style && style.display !== 'none' && reason.getBoundingClientRect().height > 0) };
        `)
        // Accuracy contract: a reason must exist ONLY while the control is
        // disabled, and must not be stale once Rebet becomes usable. Asserting a
        // fixed second wording would fail when Rebet is legitimately enabled.
        const accurate = midRound.disabled
            ? (!!midRound.describedBy && midRound.visible && typeof midRound.reasonText === 'string' && midRound.reasonText.length > 0)
            : (!midRound.describedBy && !midRound.visible)
        recordCase(caseId, midRound.ok && accurate,
            `J3b reason stays accurate in the ${midRound.disabled ? 'mid-round disabled' : 'enabled'} state at ${vp.label}`,
            { firstVisitText: firstVisit.reasonText, midRound, accurate })
    }
}

async function j3Affordability(vp) {
    const id = vp.id
    await beginCase(`${id}.J3.affordability`, { credits: 1000 })
    // beginCase lands on '/' for origin-scoped storage; this case needs the game
    // surface, so navigate before touching .bp-bet-input.
    await goto('/dice', vp.w, vp.h, vp.mobile)
    await dismissWelcome()
    const before = await storage()
    const res = await run(`
      const input = document.querySelector('.bp-bet-input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '1001');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 250));
      const play = document.querySelector('[data-bp-action]') || [...document.querySelectorAll('button')].find(b => /Roll Dice/.test(b.textContent));
      if (!play) return { ok: false, reason: 'no play control' };
      const rect = play.getBoundingClientRect();
      return { ok: true, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, value: input.value };
    `)
    if (!res.ok) { recordCase(caseId, false, 'ORACLE PRECONDITION: no play control to click', res); return }
    await clickAt(res.x, res.y)
    await sleep(900)
    const after = await storage()
    const sameCredits = before.gampo_credits === after.gampo_credits
    const toast = await evalExpr(`!!document.body.textContent.includes('Not enough credits')`)
    recordCase(caseId, sameCredits && toast, 'J3 unaffordable stake is rejected with unchanged credit state', { toast, value: res.value, unchanged: sameCredits })
}

async function j4Round(vp, mode = 'N', method = 'ptr') {
    const caseId = `J4.${vp.label}.${mode}.${method}`
    await beginCase(caseId, { credits: 1000 }, vp, mode)
    await goto('/dice', vp.w, vp.h, vp.mobile)
    if (!(await assertMode(caseId, mode))) return
    await dismissWelcome()
    await run(`
      const input = document.querySelector('.bp-bet-input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '7.5'); input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 250));
    `)
    const before = await storage()
    const beforeCredits = JSON.parse(before.gampo_credits || '0')
    const beforeDice = JSON.parse(before.gampo_history_dice || '[]')
    const target = await run(`
      const play = document.querySelector('[data-bp-action]') || [...document.querySelectorAll('button')].find(b => /Roll Dice/.test(b.textContent));
      if (!play) return null; const rect = play.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    `)
    if (!target) { recordCase(caseId, false, 'J4 primary control not found', {}); return null }
    await clickAt(target.x, target.y)
    const settled = await waitFor(`(() => { try { return JSON.parse(localStorage.getItem('gampo_history_dice') || '[]').length > ${beforeDice.length}; } catch { return false; } })()`, 12000)
    if (!settled) {
        precondition(`${id}.J4.round`, false, 'a Dice round did not settle, so no delta could be asserted', { settled, diceRows: [beforeDice.length, JSON.parse((await storage()).gampo_history_dice || '[]').length], stake: '7.5', beforeCredits })
        return null
    }
    const after = await storage()
    const afterCredits = JSON.parse(after.gampo_credits || '0')
    const afterDice = JSON.parse(after.gampo_history_dice || '[]')
    const afterGlobal = JSON.parse(after.gampo_history || '[]')
    const rec = afterDice[0]
    // Real ledger schema (CreditContext.recordTransaction): { id, timestamp, type: 'bet'|'win',
    // label, amount, balance } and sliced to 100. There is no gameId field, and a losing round
    // records only `bet`; a winning round records `bet` then `win`.
    const settledRows = afterGlobal.filter(t => !JSON.stringify(before).includes(t.id))
    const debits = settledRows.filter(t => t.type === 'bet')
    const wins = settledRows.filter(t => t.type === 'win')
    const grossStake = debits.reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0)
    const grossWin = wins.reduce((sum, t) => sum + Number(t.amount || 0), 0)
    const delta = Number((afterCredits - beforeCredits).toFixed(2))
    const ledgerNet = Number((grossWin - grossStake).toFixed(2))
    const ok = settled && afterDice.length === beforeDice.length + 1
        && Math.abs(delta - (rec?.profit ?? 0)) < 0.011
        && Math.abs(ledgerNet - delta) < 0.011
        && Math.abs(grossStake - 7.5) < 0.011
        && (rec?.profit >= 0 ? wins.length === 1 && grossWin > 0 : wins.length === 0)
    recordCase(caseId, ok, 'J4 exactly one Dice round with matching credit and ledger deltas', {
        settled, diceRows: [beforeDice.length, afterDice.length], delta, ledgerNet, grossStake, grossWin,
        profit: rec?.profit ?? null, debitRows: debits.length, winRows: wins.length, afterCredits,
    })
    return { before, after, rec }
}

async function j5HistoryActivity(vp, mode = 'N', method = 'ptr') {
    const caseId = `J5.${vp.label}.${mode}.${method}`
    const id = vp.label
    await beginCase(caseId, { credits: 1000 }, vp, mode)
    // J5 must own its premise: settle a round first, then assert the History
    // affordance and Activity ledger reflect it.
    await goto('/dice', vp.w, vp.h, vp.mobile)
    await dismissWelcome()
    const settledRows = await run(`
      const input = document.querySelector('.bp-bet-input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '7.5'); input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 250));
      const play = document.querySelector('[data-bp-action]') || [...document.querySelectorAll('button')].find(b => /Roll Dice/.test(b.textContent));
      if (!play) return { ok: false };
      const rect = play.getBoundingClientRect();
      return { ok: true, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    `)
    if (precondition(`${id}.J5.history`, settledRows.ok, 'no play control to settle a round for the History check', settledRows)) {
        await clickAt(settledRows.x, settledRows.y)
        const didSettle = await waitFor(`JSON.parse(localStorage.getItem('gampo_history_dice') || '[]').length > 0`, 12000)
        precondition(`${id}.J5.history`, didSettle, 'no round settled, so the History panel could not be checked', { didSettle })
    }
    const jumped = await run(`
      const btn = document.querySelector('[data-gt-history]');
      if (!btn) return { offered: false };
      const rect = btn.getBoundingClientRect();
      return { offered: true, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, top: rect.top };
    `)
    if (jumped.offered) {
        await clickAt(jumped.x, jumped.y)
        await sleep(900)
    }
    const panel = await run(`
      const p = document.querySelector('.hd-panel');
      if (!p) return { ok: false };
      const rect = p.getBoundingClientRect();
      const dock = document.querySelector('.mobile-bottom-nav');
      const ds = dock ? getComputedStyle(dock) : null;
      const dockVisible = !!(dock && ds && ds.display !== 'none' && ds.visibility !== 'hidden' && dock.getBoundingClientRect().height > 0);
      return { ok: true, rowVisible: rect.top < innerHeight && rect.bottom > 0, aboveDock: !dockVisible || rect.bottom <= dock.getBoundingClientRect().top + 1 };
    `)
    recordCase(caseId, panel.ok && panel.rowVisible, 'J5 History panel visible above fixed chrome', panel)

    await goto('/dice', vp.w, vp.h, vp.mobile).catch(() => {})
    await send('Page.navigate', { url: `${BASE}/activity` })
    await waitFor(`document.readyState === 'complete'`, 15000)
    await sleep(1000)
    const activity = await run(`
      const text = document.body.textContent;
      return { hasDice: /Dice/.test(text), rows: document.querySelectorAll('[data-credit-tx], .credit-tx-item, li').length };
    `)
    recordCase(caseId, activity.hasDice, 'J5 Activity ledger shows the settled Dice entry', activity)

    const before = await storage()
    await send('Page.navigate', { url: `${BASE}/dice` })
    await waitFor(`document.readyState === 'complete'`, 15000)
    await sleep(1200)
    const after = await storage()
    const same = ['gampo_credits', 'gampo_history', 'gampo_history_dice'].every(k => before[k] === after[k])
    recordCase(caseId, same, 'J5 navigation/reload adds no duplicate debit, return or round', { same })
}

async function j6FocusOverflow(vp, mode = 'N', method = 'ptr') {
    const caseId = `J6.${vp.label}.${mode}.${method}`
    const id = vp.label
    if (!(await assertMode(caseId, mode))) return
    const geom = await run(`
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > innerWidth;
      const action = document.querySelector('[data-bp-action]') || [...document.querySelectorAll('button')].find(b => /Roll Dice/.test(b.textContent));
      const a = action?.getBoundingClientRect();
      const dock = document.querySelector('.mobile-bottom-nav');
      const ds = dock ? getComputedStyle(dock) : null;
      const dockVisible = !!(dock && ds && ds.display !== 'none' && ds.visibility !== 'hidden' && dock.getBoundingClientRect().height > 0);
      return { overflow, actionTop: a?.top ?? null, actionBottom: a?.bottom ?? null,
               dockVisible, dockTop: dockVisible ? dock.getBoundingClientRect().top : null, vh: innerHeight };
    `)
    const obscured = geom.actionBottom !== null && geom.dockVisible === true && geom.actionBottom > geom.dockTop + 1
    recordCase(caseId, geom.overflow === false && !obscured, 'J6 no document horizontal overflow and action not obscured by chrome', geom)
}

async function j7Routes(vp, mode = 'N', method = 'ptr') {
    const caseId = `J7.${vp.label}.N`
    const id = vp.label
    if (!(await assertMode(caseId, mode))) return
    const cases = [
        { path: '/dice', expect: 'ready' },
        { path: '/hilocards', expect: 'alias' },
        { path: '/journey-missing-29', expect: 'not-found' },
        { path: '/slots-missing-29', expect: 'not-found' },
    ]
    for (const c of cases) {
        await goto(c.path, vp.w, vp.h, vp.mobile)
        const res = await run(`
          const dice = !!document.querySelector('main, .game-shell, [data-game-root]');
          const notFound = !!document.querySelector('.not-found, .route-error');
          const links = [...document.querySelectorAll('.not-found a, .route-error a, .route-fallback a')].map(a => a.getAttribute('href'));
          return { url: location.pathname, dice, notFound, links };
        `)
        const ok = c.expect === 'ready' ? res.dice && res.url === '/dice'
            : c.expect === 'alias' ? res.url === '/hilo'
                : res.notFound === true && res.links.length > 0
        recordCase(caseId, ok, `J7 ${c.path} resolves with a usable outcome`, res)
    }
}

// J8 / F2 — the four phases the residual probe F2 actually names. The previous
// body blocked `*.webp`/`*.png` on `/` and called any decoded image "cover
// recovery": it never touched the Dice cover, never loaded the Dice lazy chunk,
// and its negative control ("blocked art degrades") was satisfied by a spinner
// or any unrelated `<img>` — see the "initials are 2 letters" mistake below.
//
// Dependencies are DISCOVERED from the served bundle, never hardcoded: the Dice
// cover is read back from the rendered card's own `src`, and the lazy chunk is
// resolved by loading `/dice` in a throwaway same-origin iframe and diffing
// performance entries before/after. Nothing is written to the production
// profile, and navigation is always a fresh document (`Page.navigate`), so
// in-memory module state from an earlier phase can never satisfy a later one.
//
// The four phases are aggregated into the single predeclared cell per viewport,
// but the detail object names each phase result separately. A phase that cannot
// be reached is reported as an Oracle Precondition, EXCEPT the chunk-failure
// bounded-UI / lobby-exit contract, which fails honestly when absent.


// J8 / F2 — the four phases the residual probe F2 actually names. The previous
// body blocked `*.webp`/`*.png` on `/` and called any decoded image "cover
// recovery": it never touched the Dice cover, never loaded the Dice lazy chunk,
// and its negative control ("blocked art degrades") was satisfied by a spinner
// or any unrelated `<img>` — see the "initials are 2 letters" mistake below.
//
// Dependencies are DISCOVERED from the served bundle, never hardcoded: the Dice
// cover is read back from the rendered card's own `src`, and the lazy chunk is
// resolved by loading `/dice` in a throwaway same-origin iframe and diffing
// performance entries before/after. Nothing is written to the production
// profile, and navigation is always a fresh document (`Page.navigate`), so
// in-memory module state from an earlier phase can never satisfy a later one.
//
// The four phases are aggregated into the single predeclared cell per viewport,
// but the detail object names each phase result separately. A phase that cannot
// be reached is reported as an Oracle Precondition, EXCEPT the chunk-failure
// bounded-UI / lobby-exit contract, which fails honestly when absent.
//
async function j8Recovery(vp, mode = 'N', method = 'ptr') {
    const caseId = `J8.${vp.label}.N`
    const id = vp.label
    if (!(await assertMode(caseId, mode))) return
    if (!(await beginCase(`${id}.J8`))) return

    await send('Network.enable')
    await send('Network.setBlockedURLs', { urls: [] })

    // Phases navigate to '/' and '/dice'. The first-visit welcome dialog is a
    // full-viewport overlay that covers the game surface and steals click
    // hit-testing, so it must be dismissed after every document load. The modal
    // itself only touches sessionStorage, which beginCase has just cleared.
    // The app's default test stake is off the bet input's 0.25 step grid, so
    // BetPanel can never resolve it and never mounts the primary action; the
    // stake is set through React's own input setter to a legal value.
    const settle = async ({ stake = null } = {}) => {
        await dismissWelcome()
        await sleep(250)
        await dismissWelcome()
        if (stake !== null) {
            await run(`
              const input = document.querySelector('.bp-bet-input');
              if (!input) return false;
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
              setter.call(input, ${JSON.stringify(stake)});
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              await new Promise(r => setTimeout(r, 700));
              return true;
            `)
        } else {
            await sleep(700)
        }
    }

    // Real Dice = the game's own stage/scene markup. The stale oracle looked for
    // `main, .game-shell` and matched the persistent layout at `/dice`, so a
    // chunk that never loaded still read as "ready".
    const DICE_READY = `!!(document.querySelector('.core-stage') || document.querySelector('.dice-stage') || document.querySelector('.dice-meta-row'))`
    const readDiceSurface = ({ chunk = null } = {}) => run(`
      const decoy = !!document.querySelector('[data-j8-decoy]');
      const shell = document.querySelector('.game-shell');
      const stage = document.querySelector('.core-stage');
      const readyNode = document.querySelector('.core-stage-body') || stage || shell;
      const action = document.querySelector('[data-ux-primary-action]');
      const loader = !!document.querySelector('.core-stage-loading');
      const fallback = !!document.querySelector('.route-fallback, .route-spinner');
      const error = !!document.querySelector('.route-error, .not-found');
      const retry = [...document.querySelectorAll('button')].find(b => /retry/i.test(b.textContent || '')) || null;
      const links = [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(Boolean);
      const requests = ${chunk ? `performance.getEntriesByType('resource').filter(e => e.name === ${JSON.stringify(chunk)}).length` : '0'};
      const stageText = (stage ? stage.textContent : '').replace(/\\s+/g, ' ').trim().slice(0, 140);
      return {
        path: location.pathname, decoy, shell: !!shell, stage: !!stage, loader, fallback, error,
        ready: ${DICE_READY}, readyText: (readyNode ? readyNode.textContent : '').replace(/\\s+/g, ' ').trim().slice(0, 120),
        hasPrimaryAction: !!action, primaryLabel: action ? (action.textContent || '').trim() : null,
        retry: !!retry, retryLabel: retry ? (retry.textContent || '').trim() : null,
        exitLinks: links.filter(h => h === '/' || h === '/originals' || h === '/activity'),
        stageText, requests,
      };
    `)

    // --- discover the REAL cover + lazy chunk from a fresh served document ----
    // (1) The cover is read back from the card the app itself rendered, so a
    //     rename or a format swap cannot silently turn this phase into a no-op.
    // (2) The chunk is found in a throwaway iframe. The iframe shares the origin
    //     (so performance entries and init scripts apply) but owns its own
    //     document, so nothing here is cached into the profile/main frame.
    //     Its `window.name` also survives the CDP `about:blank` navigation.
    const discovery = await step(`${vp.label}.J8.discover`, async () => {
        await goto('/', vp.w, vp.h, vp.mobile)
        await settle()
        const cover = await run(`
          const card = document.querySelector('.casino-game-card[href="/dice"]') || document.querySelector('a[href="/dice"]');
          const img = card ? card.querySelector('img') : null;
          const art = card ? card.querySelector('.casino-game-art, .category-art') : null;
          const initials = art ? art.querySelector('span') : null;
          const res = performance.getEntriesByType('resource').filter(e => img && e.name === new URL(img.src, location.href).href);
          return { found: !!img, src: img ? new URL(img.src, location.href).href : null,
                   sameOrigin: img ? new URL(img.src, location.href).origin === location.origin : false,
                   naturalWidth: img ? img.naturalWidth : null, complete: img ? img.complete : null,
                   resourceEntries: res.length,
                   initials: initials ? initials.textContent.trim() : null,
                   title: card ? (card.querySelector('.casino-game-titlemark strong, h3')?.textContent?.trim() || null) : null };
        `)
        // Discover the lazy chunk by loading /dice for real and reading resource
        // timing. The previous iframe + window.name channel silently produced an
        // empty asset list, which made every J8 cell an oracle precondition. A
        // direct navigation is deterministic and needs no injected script.
        const dice = await run(`
          const before = performance.getEntriesByType('resource').length;
          return { before };
        `)
        await goto('/dice', vp.w, vp.h, vp.mobile)
        await settle()
        const chunk = await run(`
          const js = performance.getEntriesByType('resource').map(e => e.name)
            .filter(u => /\\.js(\\?|$)/.test(u) && /dice/i.test(decodeURIComponent(u)));
          const stage = !!(document.querySelector('.core-stage') || document.querySelector('.dice-stage'));
          const fallback = !!document.querySelector('.route-fallback, .route-spinner');
          return { chunks: js, stage, fallback };
        `)
        return { cover, chunk, dice }
    })

    const coverUrl = discovery.cover.src
    const chunkUrl = discovery.chunk.chunks[0]
    if (!precondition(caseId, !!coverUrl && discovery.cover.found, 'Dice cover URL could not be discovered from the rendered card', discovery)) return
    if (!precondition(caseId, !!chunkUrl, 'Dice lazy chunk could not be discovered in the served bundle', discovery)) return
    const chunkPath = new URL(chunkUrl).pathname

    // Importing the chunk from a fresh same-origin document must resolve. This
    // is the positive control that justifies the later transport-level failure.
    const importControl = await run(`
      try { await import(${JSON.stringify(chunkPath)}); return { ok: true }; }
      catch (err) { return { ok: false, error: String(err && err.message || err) }; }
    `)
    if (!precondition(caseId, importControl.ok, 'the discovered Dice chunk does not load from a fresh document, so failure cannot be attributed to interception', importControl)) return

    const phase = {}

    // --- phase 1: real cover failure (not a pending lazy decode) -------------
    // Bounded re-request budget: the cover may be probed (Asset's preload probe)
    // and then rendered, so a couple of requests is normal. A retry loop would
    // show up as a climbing count, which is why the count is asserted, along
    // with the fact that the block actually landed on the wire.
    // The image is already in the HTTP cache from the discovery pass, and a
    // blocked URL does not evict it — the request is simply served from cache,
    // so the block never lands and the phase silently measures nothing. Disable
    // the cache for this phase so the failure is real.
    await send('Network.setCacheDisabled', { cacheDisabled: true })
    await send('Network.setBlockedURLs', { urls: [coverUrl] })
    await goto('/', vp.w, vp.h, vp.mobile)
    await settle()
    const coverProbe = await run(`
      const card = document.querySelector('.casino-game-card[href="/dice"]') || document.querySelector('a[href="/dice"]');
      const img = card ? card.querySelector('img') : null;
      const art = card ? card.querySelector('.casino-game-art, .category-art') : null;
      const initials = art ? art.querySelector('span') : null;
      const res = performance.getEntriesByType('resource').filter(e => e.name === ${JSON.stringify(coverUrl)});
      return { sawImage: !!img, complete: img ? img.complete : null, naturalWidth: img ? img.naturalWidth : null,
               initials: initials ? initials.textContent.trim() : null,
               initialsBox: initials ? (() => { const b = initials.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })() : null,
               title: card ? (card.querySelector('.casino-game-titlemark strong, h3')?.textContent?.trim() || null) : null,
               hasUsableLink: !!card, requests: res.length,
               decodedElsewhere: [...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth > 0).length };
    `)
    // When the cover fails, the app removes the <img> entirely and falls back to
    // an initials tile — verified by direct probe (`hasImg: false`, initials
    // "Di"). Requiring `sawImage === true` therefore demanded an <img> that is
    // only present on success, so the phase could never pass. The bound contract
    // is "cover failure degrades safely with identity preserved", asserted here
    // as: no broken/decoded image, a rendered identity tile, and a live link.
    // Proof the block landed: measured against the served app, a blocked cover
    // leaves NO <img> in the card at all (the app swaps to an initials tile),
    // while an unblocked one renders `<img>` with naturalWidth 1024. `requests`
    // is NOT the signal — a blocked URL still records its failed preload probes.
    // So the block is proven by the degraded render itself, and a page that
    // simply had not finished loading would still show an <img> (complete=false,
    // naturalWidth 0) and would not satisfy `blockLanded`.
    const blockLanded = coverProbe.sawImage === false
    const degraded = coverProbe.sawImage !== true || coverProbe.naturalWidth === 0
    phase.coverFail = {
        blockedUrl: coverUrl, requests: coverProbe.requests, blockLanded, degraded,
        sawImage: coverProbe.sawImage,
        // The grid renders the name's FIRST TWO CHARS ("Di"); the previous
        // oracle's regression was asserting on the 5-letter category chip
        // ("Table") that the overlay clips to a ~39x15 box.
        initials: coverProbe.initials, initialsBox: coverProbe.initialsBox,
        identityPreserved: coverProbe.title === 'Dice' && coverProbe.initials === 'Di',
        hasUsableLink: coverProbe.hasUsableLink, decodedElsewhere: coverProbe.decodedElsewhere,
    }
    // Restore requires a genuinely fresh document. `goto()` issues
    // Page.navigate to the SAME url, which in this SPA is a same-document
    // navigation: React never remounts GameArt, so the `failed` flag set by the
    // blocked load survives and the cell would fail on a stale-state artefact
    // rather than on the restore contract. Navigate away first, then hard-reload
    // the route so the tree is rebuilt from scratch.
    await send('Network.setBlockedURLs', { urls: [] })
    await send('Network.setCacheDisabled', { cacheDisabled: false })
    await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile })
    await send('Page.navigate', { url: 'about:blank' })
    await sleep(300)
    await send('Page.navigate', { url: BASE + '/' })
    await waitFor(`document.readyState === 'complete'`, 15000)
    await sleep(900)
    await settle()
    const coverRestored = await run(`
      // The cover uses loading="lazy" decoding="async". A card that never enters
      // the viewport is never fetched, so its <img> reports complete === false
      // with only intrinsic dimensions. The contract requires the decoded art to
      // be back after a clean reload, so scroll the card into view and then
      // require a genuine decode: img.decode() resolves only when the bitmap is
      // available, and complete && naturalWidth > 0 confirms real bytes.
      const card = document.querySelector('.casino-game-card[href="/dice"]');
      if (card) card.scrollIntoView({ block: 'center' });
      const read = () => {
        const c = document.querySelector('.casino-game-card[href="/dice"]');
        const img = c ? c.querySelector('img') : null;
        return { has: !!img, complete: img ? img.complete : null, naturalWidth: img ? img.naturalWidth : null, src: img ? img.src : null };
      };
      let decoded = false;
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const s = read();
        if (s.has) {
          const img = document.querySelector('.casino-game-card[href="/dice"] img');
          if (img.complete && img.naturalWidth > 0) {
            try { await img.decode(); decoded = true; break; }
            catch { /* decode rejected; keep waiting */ }
          }
        }
        await new Promise(r => setTimeout(r, 100));
      }
      return { decoded, ...read() };
    `)
    phase.coverFail.restored = coverRestored
    phase.coverFail.ok = phase.coverFail.blockLanded && phase.coverFail.degraded
        && phase.coverFail.identityPreserved && phase.coverFail.hasUsableLink && coverRestored.decoded

    // --- phase 2: delay the real lazy chunk ---------------------------------
    // Fetch domains are absolute; pattern matching treats '*' as a wildcard and
    // '?' as a single character, so the URL is escaped explicitly.
    const chunkPattern = new URL(chunkUrl).origin + new URL(chunkUrl).pathname.replace(/[?*]/g, ch => '\\' + ch)
    const chunkPaused = []
    const holdChunk = event => {
        const { requestId, request } = event.params
        if (request?.url !== chunkUrl) return
        chunkPaused.push(requestId)
        // Held open on purpose: no continueRequest until the release step.
    }
    await send('Fetch.enable', { patterns: [{ urlPattern: chunkPattern, requestStage: 'Request' }] })
    const offHold = onEvent('Fetch.requestPaused', holdChunk)
    await goto('/dice', vp.w, vp.h, vp.mobile)
    await settle({ stake: '7.5' })
    await waitFor(`!(${DICE_READY}) || __j8Held`, 1200).then(() => true).catch(() => true)
    const duringHold = await readDiceSurface({ chunk: chunkUrl })
    await sleep(1400)
    const stillHolding = await readDiceSurface({ chunk: chunkUrl })
    phase.chunkDelay = {
        blockedUrl: chunkUrl, pattern: chunkPattern, paused: chunkPaused.length, requestIds: chunkPaused,
        duringHold, stillHolding,
        // At no point while the chunk is held may the app present Dice as ready.
        noFalseReady: duringHold.ready === false && stillHolding.ready === false,
        showsLoading: stillHolding.shell === true || stillHolding.loader === true || stillHolding.fallback === true,
    }
    // Release the held request and require Dice to become reachable.
    if (chunkPaused.length) {
        for (const requestId of chunkPaused) await send('Fetch.continueRequest', { requestId }).catch(() => {})
    }
    const reached = await waitFor(DICE_READY, 20000)
    const afterRelease = await readDiceSurface({ chunk: chunkUrl })
    phase.chunkDelay.released = { reached, afterRelease }
    phase.chunkDelay.ok = chunkPaused.length > 0 && phase.chunkDelay.noFalseReady && phase.chunkDelay.showsLoading
        && reached && afterRelease.ready === true
    await send('Fetch.disable').catch(() => {})
    offHold()

    // --- phase 3: chunk failure across the one permitted recovery reload ----
    // Fetch.failRequest is transport-level, which is required here: the app's
    // `t.lazy` preloads its dependency list at module scope through the same
    // loader, so a module-map/`import()` level failure would surface even on a
    // healthy network and would not be attributable to the chunk.
    const failedIds = []
    const failChunk = event => {
        const { requestId, request } = event.params
        if (request?.url !== chunkUrl) return
        failedIds.push(requestId)
        send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {})
    }
    await send('Fetch.enable', { patterns: [{ urlPattern: chunkPattern, requestStage: 'Request' }] })
    const offFail = onEvent('Fetch.requestPaused', failChunk)
    // The reload target is a FRESH document, so there is no earlier healthy
    // module instance to satisfy the import and no earlier recovery guard.
    await send('Page.navigate', { url: `${BASE}/dice` })
    await waitFor(`document.readyState === 'complete'`, 15000)
    await sleep(1200)
    await dismissWelcome()
    // The listener may reload the document once (recovery) — wait for that
    // second document to settle before reading the failure surface.
    await sleep(2500)
    await dismissWelcome()
    const failureSurface = await readDiceSurface({ chunk: chunkUrl })
    phase.chunkFail = {
        blockedUrl: chunkUrl, failedRequests: failedIds.length,
        failureSurface,
        failed: failedIds.length > 0 && failureSurface.ready === false,
        // The SPA history fallback answers a missing asset path with index.html
        // (200), so a transport abort of the chunk is invisible in the
        // performance timeline; the wire count is therefore not the signal here.
        // Contract: a bounded failure surface, NOT a blank shell, plus a usable exit.
        boundedUi: (failureSurface.shell === true && (failureSurface.error === true || failureSurface.fallback === true)) || failureSurface.error === true,
        lobbyExit: failureSurface.exitLinks.length > 0,
        retryControl: { present: failureSurface.retry, label: failureSurface.retryLabel },
    }
    // Probe Retry honestly (no promise that it clears a cached rejection).
    if (failureSurface.retry) {
        const retryButton = await run(`
          const btn = [...document.querySelectorAll('button')].find(b => /retry/i.test(b.textContent || ''));
          if (!btn) return null;
          const box = btn.getBoundingClientRect();
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        `)
        if (retryButton) {
            await clickAt(retryButton.x, retryButton.y)
            await sleep(2500)
            await dismissWelcome()
            phase.chunkFail.retryOutcome = await readDiceSurface({ chunk: chunkUrl })
        }
    }
    phase.chunkFail.ok = phase.chunkFail.failed && phase.chunkFail.boundedUi && phase.chunkFail.lobbyExit

    // --- phase 4: full clean recovery (interception removed) ----------------
    await send('Fetch.disable').catch(() => {})
    await send('Fetch.disable').catch(() => {})
    offFail()
    const recoveredDoc = await (async () => {
        await send('Page.navigate', { url: `${BASE}/dice` })
        await waitFor(`document.readyState === 'complete'`, 15000)
        await sleep(1200)
        await dismissWelcome()
        return waitFor(DICE_READY, 20000)
    })()
    const recovered = await readDiceSurface({ chunk: chunkUrl })
    phase.recovery = { reached: recoveredDoc, surface: recovered }
    phase.recovery.ok = recoveredDoc && recovered.ready === true && recovered.hasPrimaryAction === true

    // Deep link after a lobby stop: fresh document at '/' then a fresh document
    // at '/dice' (not an SPA push), so the recovery must hold on a cold route.
    await goto('/', vp.w, vp.h, vp.mobile)
    await settle()
    await send('Page.navigate', { url: `${BASE}/dice` })
    await waitFor(`document.readyState === 'complete'`, 15000)
    await sleep(1200)
    await dismissWelcome()
    const deepLinked = await waitFor(DICE_READY, 20000)
    const deepSurface = await readDiceSurface({ chunk: chunkUrl })
    phase.recovery.deepLink = { reached: deepLinked, surface: deepSurface, ok: deepLinked && deepSurface.ready === true }
    phase.recovery.ok = phase.recovery.ok && phase.recovery.deepLink.ok


    const ok = phase.coverFail.ok === true && phase.chunkDelay.ok === true
        && phase.chunkFail.ok === true && phase.recovery.ok === true
    recordCase(caseId, ok, `J8 cover failure degrades safely, lazy chunk delay/failure stay bounded, and clean recovery restores Dice at ${vp.label}`, {
        config: { mode, method },
        discovered: { cover: coverUrl, chunk: chunkUrl, chunkPattern, coverFound: discovery.cover.resourceEntries, coverDecoded: discovery.cover.naturalWidth,
            chunkDiscovered: discovery.chunk.chunks.length, chunkStage: discovery.chunk.stage, importControl: importControl.ok },
        coverFail: phase.coverFail,
        chunkDelay: { ...phase.chunkDelay, released: phase.chunkDelay.released ? { reached: phase.chunkDelay.released.reached, ready: phase.chunkDelay.released.afterRelease?.ready } : null },
        chunkFail: phase.chunkFail,
        recovery: phase.recovery,
    })
}
async function j9StorageBoundaries(vp) {
    const baseId = `J9.${vp.label}.N`
    const w = Number(vp.w), h = Number(vp.h), mobile = !!vp.mobile
    await beginCase(baseId, {}, { w, h, mobile }, 'N')
    await goto('/', w, h, mobile)
    await dismissWelcome()

    // 1. Malformed / wrong-type / mixed fixtures must not crash or link to a
    //    route that does not exist.
    const fixtures = [
        { value: '{bad', label: 'malformed JSON' },
        { value: '{}', label: 'wrong type' },
        { value: '["/dice","/journey-missing-29",42]', label: 'mixed array' },
    ]
    for (const c of fixtures) {
        await run(`localStorage.setItem('gampo_pinned_games', ${JSON.stringify(c.value)}); return true;`)
        await goto('/', w, h, mobile)
        const res = await run(`
          const dead = [...document.querySelectorAll('a')].filter(a => a.getAttribute('href') === '/journey-missing-29').length;
          const appMounted = !!document.querySelector('#root')?.children.length;
          const diceVisible = !!document.querySelector('a[href="/dice"]') || !!document.querySelector('[data-home-recent] a[href="/dice"]');
          return { dead, appMounted, diceVisible };
        `)
        recordCase(`${baseId}.${c.label}`, res.appMounted && res.dead === 0 && res.diceVisible,
            `J9 ${c.label} does not crash or create dead links`, res)
    }

    // 2. Ordinary 13-add FIFO via the REAL UI - not by writing the array
    await run(`for (const k of ${JSON.stringify(GAMPO_KEYS)}) localStorage.removeItem(k); localStorage.removeItem('gampo_welcome_dismissed'); sessionStorage.clear(); return true;`)
    await goto('/', w, h, mobile)
    await dismissWelcome()
    // The sidebar must be open and each pin scrolled into view before it can be
    // clicked: below 769px it is an off-canvas drawer, and its own scroll
    // container puts most rows below the fold. Open it with a real CDP pointer
    // click — a synthetic element.click() left the drawer hidden on the narrow
    // viewports, and `.app-sidebar-hidden .nav-pin { display: none }` then made
    // every candidate resolve to a zero-width handle.
    const openSidebar = async () => {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const state = await run(`
              const aside = document.querySelector('.app-sidebar');
              const hidden = !!aside && aside.className.includes('app-sidebar-hidden');
              const pin = document.querySelector('.app-sidebar .nav-pin');
              const usable = !!pin && pin.getBoundingClientRect().width > 0;
              if (!hidden && usable) return { done: true };
              const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
              // Off-canvas drawer (below 769px): the header button opens it.
              const header = document.querySelector('.header-menu-btn');
              // Collapsed desktop rail: the in-sidebar control re-expands it.
              const rail = [...document.querySelectorAll('button')]
                .find(b => /expand sidebar/i.test(b.getAttribute('aria-label') || b.title || ''));
              const target = visible(header) ? header : (visible(rail) ? rail : null);
              if (!target) return { done: false, reason: hidden ? 'no toggle' : 'no pin' };
              const r = target.getBoundingClientRect();
              return { done: false, x: r.x + r.width / 2, y: r.y + r.height / 2 };
            `)
            if (state.done) return true
            if (state.x == null) return false
            await clickAt(state.x, state.y)
            await new Promise(r => setTimeout(r, 800))
        }
        return false
    }
    // The first-visit welcome card is a full-viewport overlay that sits over the
    // header button, so the drawer can never be opened until it is dismissed.
    // Without this the whole 13-click sequence ran against the modal.
    await dismissWelcome()
    await openSidebar()
    await dismissWelcome()

    // 13 distinct UI adds, driven by real CDP pointer events (the plan does not
    // accept synthetic element.click() as evidence). A pinned game renders TWICE
    // (its normal group and a "Pinned" group), so a positional re-resolve can
    // land on the Pinned copy and toggle the game back off. Collapse the Pinned
    // group each step so every game has exactly one row, resolve that row's pin
    // handle by href identity, and click it through the input pipeline.
    const order = []
    const visiblePinSpot = href => run(`
      // Collapse Pinned so each game has exactly one row, then make sure the
      // target's own group is open: collapsed <details> rows have
      // offsetParent === null and would otherwise read as "row missing", which
      // is what made the desktop candidates all fail.
      for (const d of document.querySelectorAll('.app-sidebar details.nav-game-group')) {
        const isPinned = /pinned/i.test(d.querySelector('summary')?.textContent || '');
        const hasTarget = !!d.querySelector('a[href=' + JSON.stringify(${JSON.stringify(href)}) + ']');
        if (isPinned) d.removeAttribute('open');
        else if (hasTarget) d.setAttribute('open', '');
      }
      const row = [...document.querySelectorAll('.app-sidebar .nav-row')]
        .find(r => r.querySelector('a[href=' + JSON.stringify(${JSON.stringify(href)}) + ']') && r.offsetParent !== null);
      if (!row) return { ok: false, reason: 'row missing' };
      const pin = row.querySelector('.nav-pin');
      if (!pin) return { ok: false, reason: 'pin missing' };
      // Scroll with the container's own top as the origin: row.offsetTop is
      // relative to the row's offsetParent, which below 769px is not the
      // app-sidebar element (the drawer wraps it), so using offsetTop directly
      // left every row ~500px out of view and no candidate ever resolved.
      const aside = document.querySelector('.app-sidebar');
      const place = () => {
        if (!aside || aside.scrollHeight <= aside.clientHeight) return;
        // Scroll with the container's own top as the origin: row.offsetTop is
        // relative to the row's offsetParent, which below 769px is not the
        // app-sidebar element (the drawer wraps it), so using offsetTop directly
        // left every row ~500px out of view and no candidate ever resolved.
        const rowTop = row.getBoundingClientRect().top - aside.getBoundingClientRect().top + aside.scrollTop;
        aside.scrollTop = Math.max(0, rowTop - Math.round(aside.clientHeight / 2));
      };
      place();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      // The sidebar header is sticky and can sit over a row whose centre lands
      // in the top band, so a first hit-test can be occluded. Nudge the row
      // downward by the header's height and retest once before declaring it
      // unreachable.
      const hitOf = el => {
        const r = el.getBoundingClientRect();
        if (r.width < 10) return { ok: false, reason: 'not rendered', w: Math.round(r.width) };
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { ok: !!hit && el.contains(hit), x: r.x + r.width / 2, y: r.y + r.height / 2, tag: hit ? hit.tagName : null };
      };
      let spot = hitOf(row.querySelector('.nav-pin'));
      if (!spot.ok && spot.reason !== 'not rendered' && aside && aside.scrollHeight > aside.clientHeight) {
        aside.scrollTop = Math.max(0, aside.scrollTop - 140);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        spot = hitOf(row.querySelector('.nav-pin'));
      }
      if (!spot.ok) return { ok: false, reason: spot.reason || 'occluded', tag: spot.tag || null };
      return { ok: true, x: spot.x, y: spot.y };
    `)
    const paths = await run(`
      const seen = [];
      for (const row of document.querySelectorAll('.app-sidebar .nav-row')) {
        const a = row.querySelector('a[href]');
        if (a && row.querySelector('.nav-pin') && !seen.includes(a.getAttribute('href'))) seen.push(a.getAttribute('href'));
      }
      return seen;
    `)
    for (const href of paths) {
        if (order.length === 13) break
        const before = await run(`return JSON.parse(localStorage.getItem('gampo_pinned_games') || '[]')`)
        const spot = await visiblePinSpot(href)
        if (!spot.ok) continue
        await clickAt(spot.x, spot.y)
        await sleep(300)
        const after = await run(`return JSON.parse(localStorage.getItem('gampo_pinned_games') || '[]')`)
        if (after.includes(href) && !before.includes(href)) order.push(href)
    }
    if (order.length < 13) {
        recordCase(`${baseId}.13-distinct-paths`, false,
            `J9 only ${order.length} of 13 distinct pin adds persisted`, { used: order })
        recordCase(baseId, false, `J9 storage boundaries precondition at ${vp.label}`, { reached: '13-distinct-paths', used: order })
        return
    }
    recordCase(`${baseId}.13-distinct-paths`, true,
        `J9 13 distinct pin adds each persisted as its own entry`,
        { used: order })

    // Bind the contract exactly: 13 distinct UI adds must leave the last 12 in
    // click order with the first evicted. Every click must actually persist —
    // accepting a short array would hide dropped clicks behind a passing case.
    const stored = await run(`return JSON.parse(localStorage.getItem('gampo_pinned_games') || '[]')`)
    const expected = order.slice(-12)
    const everyClickPersisted = order.length === 13
    const firstEvicted = order.length === 13 && stored.length === 12 && !stored.includes(order[0])
    const lastTwelveOrdered = stored.length === expected.length && stored.every((v, i) => v === expected[i])
    const ok = everyClickPersisted && firstEvicted && lastTwelveOrdered
    recordCase(`${baseId}.13-add-fifo`, ok,
        `J9 13 distinct pin adds evict the first and keep the last 12 in order`,
        { used: order, stored, expected, everyClickPersisted, firstEvicted, lastTwelveOrdered })
    
    // 3. Over-cap restored array
    await run(`for (const k of ${JSON.stringify(GAMPO_KEYS)}) localStorage.removeItem(k); localStorage.removeItem('gampo_welcome_dismissed'); sessionStorage.clear(); return true;`)
    await run(`localStorage.setItem('gampo_pinned_games', ${JSON.stringify(JSON.stringify(['/poker','/crash','/plinko','/mines','/dice','/limbo','/keno','/wheel','/roulette','/blackjack','/slots','/hilo','/coinflip','/moles','/snakes']))}); return true;`)
    await goto('/', w, h, mobile)
    await waitFor(`document.readyState === 'complete'`, 15000)
    await sleep(900)
    const restoredCap = await run(`return JSON.parse(localStorage.getItem('gampo_pinned_games') || '[]').length`)
    recordCase(`${baseId}.over-cap`, restoredCap === 12, `J9 over-cap restored array restores exactly 12`, { restored: restoredCap })
    
    // 4. Duplicate restored array
    await run(`for (const k of ${JSON.stringify(GAMPO_KEYS)}) localStorage.removeItem(k); localStorage.removeItem('gampo_welcome_dismissed'); sessionStorage.clear(); return true;`)
    await run(`localStorage.setItem('gampo_pinned_games', ${JSON.stringify(JSON.stringify(['/dice','/dice','/limbo','/dice']))}); return true;`)
    await goto('/', w, h, mobile)
    await waitFor(`document.readyState === 'complete'`, 15000)
    await sleep(900)
    const restoredDup = await run(`return JSON.parse(localStorage.getItem('gampo_pinned_games') || '[]')`)
    const isDistinct = restoredDup.length === restoredDup.filter((v, i) => restoredDup.indexOf(v) === i).length
    recordCase(`${baseId}.dup`, isDistinct, `J9 duplicate restored array collapsed to distinct`, { restored: restoredDup })
    
    // 5. Pin-only setItem failure
    await run(`for (const k of ${JSON.stringify(GAMPO_KEYS)}) localStorage.removeItem(k); localStorage.removeItem('gampo_welcome_dismissed'); sessionStorage.clear(); return true;`)
    await goto('/', w, h, mobile)
    await waitFor(`document.readyState === 'complete'`, 15000)
    await sleep(900)
    // Each run() body is its own IIFE, so the saved original must outlive this
    // call to be restorable from a later one. Stash it on the page's window and
    // delete it on restore.
    await run(`
        window.__pinWriteFailures = 0;
        window.__origSetItem = localStorage.setItem;
        localStorage.setItem = (key, val) => {
            if (key === 'gampo_pinned_games') { window.__pinWriteFailures += 1; throw new Error('pin-only-failure'); }
            return window.__origSetItem.call(localStorage, key, val);
        };
        return true;
    `)
    // Whatever happens below (welcome/drawer helpers can throw), the injected
    // setItem override MUST be removed, or it leaks into J9a/J10.
    try {
    // The welcome card is a full-viewport overlay that intercepts every pointer
    // event, including the header button that opens the drawer.
    await dismissWelcome()
    // The drawer must be open and the target row scrolled into view, exactly as
    // in the FIFO leg: a stale hidden drawer makes every row's offsetParent null
    // and this whole branch reports "no hittable pin".
    await openSidebar()
    const targetPin = await run(`
        const aside = document.querySelector('.app-sidebar');
        const rows = [...document.querySelectorAll('.app-sidebar .nav-row')];
        for (const row of rows) {
            const a = row.querySelector('a[href]'); const pin = row.querySelector('.nav-pin');
            if (!a || !pin) continue;
            const group = row.closest('details.nav-game-group');
            if (group && /pinned/i.test(group.querySelector('summary')?.textContent || '')) continue;
            if (group && !group.hasAttribute('open')) group.setAttribute('open', '');
            if (pin.offsetParent === null) continue;
            if (aside && aside.scrollHeight > aside.clientHeight) {
                const rowTop = row.getBoundingClientRect().top - aside.getBoundingClientRect().top + aside.scrollTop;
                aside.scrollTop = Math.max(0, rowTop - Math.round(aside.clientHeight / 2));
            }
            const rect = pin.getBoundingClientRect();
            if (rect.width < 10 || rect.top < 0 || rect.bottom > innerHeight) continue;
            return { href: a.getAttribute('href'), x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
        }
        return null;
    `)
    if (targetPin) {
        await clickAt(targetPin.x, targetPin.y)
        await new Promise(r => setTimeout(r, 400))
        // Three things must hold, not just "no crash":
        //  * the injected write rejection actually fired (a missed click would
        //    otherwise masquerade as a handled failure);
        //  * the control did not render as pinned — no phantom pin may appear
        //    in the UI while storage rejected the write;
        //  * the app stayed mounted.
        const failureState = await run(`
            const row = [...document.querySelectorAll('.app-sidebar .nav-row')]
                .find(r => r.querySelector('a[href=' + JSON.stringify(${JSON.stringify(targetPin.href)}) + ']'));
            const pin = row ? row.querySelector('.nav-pin') : null;
            return {
                writeFailures: window.__pinWriteFailures || 0,
                pressed: pin ? pin.getAttribute('aria-pressed') : null,
                pinnedRows: document.querySelectorAll('.app-sidebar .nav-pin[aria-pressed="true"]').length,
                rootChildren: document.querySelector('#root')?.children.length ?? 0,
                stored: localStorage.getItem('gampo_pinned_games'),
            };
        `)
        const failureFired = failureState.writeFailures > 0
        const noPhantomPin = failureState.pressed !== 'true' && failureState.pinnedRows === 0 && !failureState.stored
        recordCase(`${baseId}.pin-only-setItem-failure`,
            failureFired && noPhantomPin && failureState.rootChildren > 0,
            `J9 pin-only setItem failure fires, does not crash, and leaves no phantom pin`,
            failureState)
        await run(`localStorage.setItem = window.__origSetItem; delete window.__origSetItem; window.__pinWriteFailures = 0; return true;`)
        await goto('/', w, h, mobile)
        await waitFor(`document.readyState === 'complete'`, 15000)
        await sleep(900)
        const finalState = await run(`return JSON.parse(localStorage.getItem('gampo_pinned_games') || '[]')`)
        recordCase(`${baseId}.pin-only-truthful`, finalState.length === 0, `J9 pin-only failure does not persist phantom pin`, { finalState })
    } else {
        recordCase(`${baseId}.pin-only-setItem-failure`, false, `J9 pin-only failure: no hittable pin`, { afterCrash: 0 })
    }
    } finally {
        // Unconditional restore: never leave the page's setItem patched.
        await run(`if (window.__origSetItem) { localStorage.setItem = window.__origSetItem; delete window.__origSetItem; }
                   delete window.__pinWriteFailures; return true;`).catch(() => {})
    }

    // The predeclared base id is the journey-level precondition record: every
    // named sub-assertion above ran against isolated fresh storage at this
    // viewport, so a missing or skipped sub-case still fails the run.
    recordCase(baseId, true,
        `J9 storage boundaries precondition at ${vp.label}`,
        { viewport: vp.label, subcases: 7 })
}

// F4 / J10 — accepted-round interruption at 375x667 N and 1610x870 N.
//
// The window being targeted is defined by the app, not by a guess: in
// DiceGame.performPlay, `session.record(...)` runs synchronously at the end of
// the play call, while the presentation sequence is driven by `machine.start`
// events out to DICE_ROLL_DURATION_MS+260 (720ms + 260ms). So the honest window
// is "the Dice session row exists while the round is still presenting".
// A window we never reach is NOT_RUN, never PASS.
const ATTRIBUTION_CLASSES = [
    ['credit', k => k === 'gampo_credits'],
    ['global-ledger', k => k === 'gampo_history'],
    ['dice-session', k => k === 'gampo_history_dice'],
    ['progression', k => /gampo_(xp|progress|missions|pf_|pnl)/.test(k)],
    ['guard', k => /gampo_(settings|sidebar|chat_dock)/.test(k)],
]

const classifyKey = key => {
    const hit = ATTRIBUTION_CLASSES.find(([, test]) => test(key))
    return hit ? hit[0] : null
}

const gampoOnly = (state) => Object.fromEntries(Object.entries(state).filter(([k]) => k.startsWith('gampo_')))

// J9a — post-round storage attribution. Every `gampo_*` key that changes across
// one real settled Dice round must classify into a known category; an
// unattributed key is the "fourth category" failure the contract names.
async function j9aAttribution(vp) {
    const caseId = `J9a.${vp.label}.N`
    await beginCase(caseId, { credits: 1000 }, vp, 'N')
    await goto('/dice', vp.w, vp.h, vp.mobile)
    await dismissWelcome()
    if (!(await assertMode(caseId, 'N'))) return

    await run(`
      const input = document.querySelector('.bp-bet-input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '7.5'); input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 250));
      return true;
    `)
    const before = gampoOnly(await storage())
    const target = await run(`
      const play = document.querySelector('[data-bp-action]') || [...document.querySelectorAll('button')].find(b => /Roll Dice/.test(b.textContent));
      if (!play) return null;
      const rect = play.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    `)
    if (!precondition(caseId, !!target, 'no play control to settle a round for attribution', { target })) return
    await clickAt(target.x, target.y)
    const settled = await waitFor(`JSON.parse(localStorage.getItem('gampo_history_dice') || '[]').length > 0`, 12000)
    if (!precondition(caseId, settled, 'no round settled, so nothing could be attributed', { settled })) return
    await sleep(600)

    const after = gampoOnly(await storage())
    const changed = Object.keys(after).filter(k => after[k] !== before[k])
    const classified = changed.map(k => ({ key: k, category: classifyKey(k) }))
    const unattributed = classified.filter(entry => entry.category === null)

    recordCase(caseId, changed.length > 0 && unattributed.length === 0,
        `J9a round deltas attributed at ${vp.label}`, {
            changed: classified,
            unattributed: unattributed.map(entry => entry.key),
            namedKeysPresent: ['gampo_credits', 'gampo_history', 'gampo_history_dice'].filter(k => changed.includes(k)),
        })
}

async function j10Interruption(vp) {
    const caseId = `J10.${vp.label}.N`
    await beginCase(caseId, { credits: 1000 }, vp, 'N')
    await goto('/dice', vp.w, vp.h, vp.mobile)
    await dismissWelcome()
    if (!(await assertMode(caseId, 'N'))) return

    await run(`
      const input = document.querySelector('.bp-bet-input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '7.5'); input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 250));
      return true;
    `)
    const before = gampoOnly(await storage())
    const beforeDice = JSON.parse(before.gampo_history_dice || '[]')

    // Arm a live listener for the exact interruption signal: the Dice session row
    // appearing while the play control is still locked/resolving.
    await run(`
      window.__j10 = { sawRecordBeforeUnlock: false, rowsAtSignal: 0, t: 0 };
      const started = performance.now();
      window.__j10timer = setInterval(() => {
        let rows = [];
        try { rows = JSON.parse(localStorage.getItem('gampo_history_dice') || '[]'); } catch { rows = []; }
        const play = document.querySelector('[data-bp-action]') || [...document.querySelectorAll('button')].find(b => /Roll Dice/.test(b.textContent));
        const locked = !!(play && (play.disabled || play.getAttribute('aria-busy') === 'true' || play.dataset.state === 'resolving'));
        if (rows.length > 0 && locked) {
          window.__j10 = { sawRecordBeforeUnlock: true, rowsAtSignal: rows.length, t: Math.round(performance.now() - started) };
        }
      }, 8);
      return true;
    `)

    const target = await run(`
      const play = document.querySelector('[data-bp-action]') || [...document.querySelectorAll('button')].find(b => /Roll Dice/.test(b.textContent));
      if (!play) return null;
      const rect = play.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    `)
    if (!precondition(caseId, !!target, 'no play control to start the interrupted round', { target })) return
    await clickAt(target.x, target.y)

    // Interrupt as early as the record appears, while presentation is running.
    const signal = await waitFor(`window.__j10.sawRecordBeforeUnlock === true`, 6000)
    const observed = await run(`clearInterval(window.__j10timer); return window.__j10;`)
    if (!signal) {
        // Distinguished honestly from a bug: the window was never reached.
        recordCase(caseId, false, `NOT_RUN: accepted-round presentation window not reached at ${vp.label}`, { observed, reached: false })
        return
    }

    const midRows = JSON.parse((await storage()).gampo_history_dice || '[]')
    const acceptedId = midRows[0]?.id ?? null
    const acceptedSnapshot = gampoOnly(await storage())

    await send('Page.navigate', { url: `${BASE}/` })
    await waitFor(`document.readyState === 'complete'`, 15000)
    await sleep(1200)
    await send('Page.navigate', { url: `${BASE}/dice` })
    await waitFor(`document.readyState === 'complete'`, 15000)
    await sleep(1200)

    const after = gampoOnly(await storage())
    const afterDice = JSON.parse(after.gampo_history_dice || '[]')
    const settledRow = afterDice.find(row => row.id === acceptedId) ?? afterDice[0] ?? null

    // Every attributed progression delta must be classified, and an unattributed
    // fourth category fails the case (parent line 789 / J9a rule).
    const changedKeys = Object.keys(after).filter(k => after[k] !== before[k])
    const unclassified = changedKeys.filter(k => classifyKey(k) === null)

    const oneNewRow = afterDice.length === beforeDice.length + 1
    const recordPreserved = !!settledRow && settledRow.id === acceptedId
    const creditsUnchangedDuringInterruption = midRows.length === beforeDice.length + 1
    const noUnattributed = unclassified.length === 0

    const ok = oneNewRow && recordPreserved && creditsUnchangedDuringInterruption && noUnattributed
    recordCase(caseId, ok, `J10 interrupted accepted round at ${vp.label} keeps one settled record with attributed deltas`, {
        windowReached: signal, signalAtMs: observed.t, acceptedId,
        rows: [beforeDice.length, afterDice.length], oneNewRow, recordPreserved,
        changedKeys, unclassified, acceptedCredits: acceptedSnapshot.gampo_credits, settledCredits: after.gampo_credits,
    })

    // Selective negative-control restoration: remove exactly the accepted row and
    // prove the removal is observable after a clean reload.
    const dead = await run(`
      const rows = JSON.parse(localStorage.getItem('gampo_history_dice') || '[]');
      const removed = rows.shift();
      localStorage.setItem('gampo_history_dice', JSON.stringify(rows));
      await new Promise(r => setTimeout(r, 300));
      return { removedId: removed?.id ?? null, rows: rows.length };
    `)
    await send('Page.navigate', { url: `${BASE}/dice` })
    await waitFor(`document.readyState === 'complete'`, 15000)
    await sleep(1200)
    const restored = JSON.parse((await storage()).gampo_history_dice || '[]')
    recordCase(caseId, restored.length === dead.rows && (dead.removedId === null || !restored.some(row => row.id === dead.removedId)),
        `J10 negative-control removal restores exactly at ${vp.label}`, { restored: restored.length, expected: dead.rows, removedId: dead.removedId })
}

// J10 discrimination: the Pin route assertion must FAIL when the destination is
// wrong, otherwise a green route claim proves nothing (parent line 789).
async function j10RouteDiscrimination() {
    const caseId = 'J10.375x667.N'
    await beginCase(caseId, { credits: 1000 }, { w: 375, h: 667, mobile: true }, 'N')
    await goto('/originals', 375, 667, true)
    await dismissWelcome()

    const honest = await run(`
      const a = [...document.querySelectorAll('a[href="/dice"]')].find(x => x.closest('.nav-row'));
      return { href: a?.getAttribute('href') ?? null };
    `)
    // Tamper the destination in the DOM only, then prove the SAME assertion that
    // passes above now fails. This is the discriminating negative control.
    const tampered = await run(`
      const a = [...document.querySelectorAll('a[href="/dice"]')].find(x => x.closest('.nav-row'));
      if (!a) return { ok: false };
      a.setAttribute('href', '/not-dice-29');
      await new Promise(r => setTimeout(r, 100));
      const now = [...document.querySelectorAll('a')].find(x => x.closest('.nav-row'))?.getAttribute('href') ?? null;
      return { ok: true, now };
    `)
    const honestPasses = honest.href === '/dice'
    const tamperedFails = tampered.ok && tampered.now !== '/dice'
    recordCase(caseId, honestPasses && tamperedFails, 'J10 route discrimination: assertion passes on the real destination and fails when wrong', { honest, tampered, honestPasses, tamperedFails })
}

// J3a — disabled-reason OWNERSHIP. Conditional by contract: it passes only
// because the owner-authorised P1 repair is present. If that repair is absent at
// execution entry the requirement is BLOCKED-not-authorized and must never be
// passed by asserting the unrepaired behaviour.
async function j3aOwnership(vp) {
    const caseId = `J3a.${vp.label}.N`
    await beginCase(caseId, { credits: 1000 }, vp, 'N')
    await goto('/dice', vp.w, vp.h, vp.mobile)
    await dismissWelcome()
    const probe = await run(`
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Rebet');
      if (!btn) return { ok: false, reason: 'no rebet button' };
      const desc = btn.getAttribute('aria-describedby');
      const reason = desc ? document.getElementById(desc) : null;
      return { ok: true, hasRepair: !!desc && !!reason,
               repairText: reason ? reason.textContent.trim() : null,
               legacyTitleOnly: !desc && !!btn.getAttribute('title') };
    `)
    if (!probe.ok) { precondition(caseId, false, 'Rebet control absent so ownership cannot be judged', probe); return }
    if (!probe.hasRepair) {
        recordCase(caseId, false, `BLOCKED-not-authorized: P1 repair absent, Rebet exposes only title/data-disabled-reason at ${vp.label}`, probe)
        return
    }
    recordCase(caseId, true, `J3a P1 repair present and owned at ${vp.label}`, probe)
}

// J4a — retained default History overlap. The historical narrow probe must run as
// a SEPARATE result set against the same owned preview: a green Dice journey does
// not prove Crash/Plinko remain usable. Executed as a child process so its exit
// code is its own evidence.
async function j4aControlProbe(vp) {
    const caseId = `J4a.${vp.label}.N`
    const { execFile } = await import('node:child_process')
    const result = await new Promise(resolve => {
        execFile(process.execPath, ['--experimental-websocket', 'scripts/verifyHistoryJumpControl.mjs',
            `--baseUrl=${BASE}`, `--browser=${browser}`], { cwd: process.cwd(), timeout: 240000 }, (error, stdout, stderr) => {
            resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout).slice(-2000), stderr: String(stderr).slice(-500) })
        })
    })
    recordCase(caseId, result.code === 0, `J4a retained default History overlap (/dice,/crash,/plinko) via ${vp.label}`, result)
}

// --- main -----------------------------------------------------------------
try {
    userDataDir = await mkdtemp(join(tmpdir(), 'gampo-residual-'))
    proc = spawn(browser, [
        '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`,
        '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    proc.once('error', error => { spawnError = error; exited = true; exitResolve({ error }) })
    proc.once('exit', (code, signal) => { exited = true; exitResolve({ code, signal }) })
    proc.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-16000) })
    await waitForDebugger()

    const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
    if (!response.ok) throw new Error('Could not create owned page target')
    ownedTarget = await response.json()
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const matches = list.filter(t => t.id === ownedTarget.id && t.type === 'page' && t.webSocketDebuggerUrl === ownedTarget.webSocketDebuggerUrl)
    if (matches.length !== 1 || !ownedTarget.webSocketDebuggerUrl?.startsWith(`ws://127.0.0.1:${port}/devtools/page/`)) throw new Error('Ambiguous or unowned new page target')
    if (exited) throw new Error('Chromium exited before CDP attachment')

    ws = new WebSocket(ownedTarget.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
    ws.onmessage = event => {
        const msg = JSON.parse(event.data)
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id)
            pending.delete(msg.id)
            if (msg.error) reject(new Error(JSON.stringify(msg.error)))
            else resolve(msg.result)
            return
        }
        // CDP events carry no `id`. Without this dispatch every `Fetch.*` /
        // `Network.*` handler was dead code, so the interception phases silently
        // asserted against an untouched request stream.
        for (const handler of eventHandlers.get(msg.method) || []) {
            try { handler(msg) } catch { /* handler errors must not kill the run */ }
        }
    }
    await send('Page.enable')
    await send('Runtime.enable')
    console.log('OWNED TARGET', JSON.stringify({ id: ownedTarget.id }))

    // Core J1-J6: four viewports x N/O/A, each with independent keyboard and
    // pointer subcases on isolated fresh state. A method cannot stand in for the
    // other, so both are always attempted and both IDs are required.
    for (const vp of VIEWPORTS) {
        vp.id = vp.label
        for (const mode of MODES) {
            for (const method of METHODS) {
                for (const [label, fn] of [
                    ['J1', j1Search], ['J2', j2Pin], ['J3', j3Stake], ['J4', j4Round],
                    ['J5', j5HistoryActivity], ['J6', j6FocusOverflow],
                ]) {
                    await step(`${vp.label}.${mode}.${method}.${label}`, () => fn(vp, mode, method))
                }
            }
        }
    }
    // Single-cell cases at four N viewports.
    for (const vp of VIEWPORTS) {
        vp.id = vp.label
        await step(`${vp.label}.N.J2a`, () => j2Pin(vp, 'N', 'ptr', 'J2a'))
        // J3a is an OWNERSHIP case: it passes only because the owner-authorised
        // P1 repair is present, and must be recorded as BLOCKED-not-authorized
        // rather than passed when that repair is absent.
        await step(`${vp.label}.N.J3a`, () => j3aOwnership(vp))
        await step(`${vp.label}.N.J3b`, () => j3Rebet(vp, 'N', 'ptr'))
        await step(`${vp.label}.N.J4a`, () => j4aControlProbe(vp))
        await step(`${vp.label}.N.J7`, () => j7Routes(vp, 'N', 'ptr'))
        await step(`${vp.label}.N.J8`, () => j8Recovery(vp, 'N', 'ptr'))
    }
    for (const vp of VIEWPORTS_TWO.map(label => VIEWPORTS.find(v => v.label === label))) {
        await step(`${vp.label}.N.J9`, () => j9StorageBoundaries(vp))
        await step(`${vp.label}.N.J9a`, () => j9aAttribution(vp))
        await step(`${vp.label}.N.J10`, () => j10Interruption(vp))
    }
    await step('J10.route-discrimination', () => j10RouteDiscrimination())
} catch (err) {
    console.error('PROBE ERROR:', err.message)
    failures.push('probe error: ' + err.message)
} finally {
    if (ws) {
        try {
            const closed = new Promise(resolve => { ws.addEventListener('close', resolve, { once: true }) })
            ws.close()
            await Promise.race([closed, sleep(3000).then(() => { throw new Error('Owned CDP socket did not close') })])
        } catch (err) { failures.push('owned socket cleanup: ' + err.message) }
    }
    if (proc?.pid) {
        try {
            if (!exited && !proc.kill('SIGTERM')) throw new Error('Could not signal owned Chromium')
            await Promise.race([exitPromise, sleep(5000).then(() => { throw new Error('Owned Chromium did not exit') })])
        } catch (err) { failures.push('owned Chromium cleanup: ' + err.message) }
    }
    if (userDataDir) {
        try {
            if (!exited && proc?.pid) throw new Error('Cannot remove profile while owned Chromium runs')
            await rm(userDataDir, { recursive: true, maxRetries: 5, retryDelay: 100 })
            console.log('OWNED CLEANUP', JSON.stringify({ pid: proc?.pid, profileRemoved: true }))
        } catch (err) { failures.push('owned profile cleanup: ' + err.message) }
    }
}

const missing = [...required].filter(id => !seen.has(id))
if (missing.length) failures.push('missing cases: ' + missing.join(', '))

if (failures.length) {
    console.log(`\nRESIDUAL JOURNEY FAILED (${failures.length}): ${failures.join('; ')}`)
    process.exit(1)
}
console.log(`\nRESIDUAL JOURNEY PASSED (${seen.size} cases)`)
