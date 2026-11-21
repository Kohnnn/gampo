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

import { existsSync, promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'

const BASE = (process.argv.find(a => a.startsWith('--baseUrl='))?.slice('--baseUrl='.length) || 'http://127.0.0.1:4173').replace(/\/$/, '')
const EDGE_CANDIDATES = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
]
const browser = process.argv.find(a => a.startsWith('--browser='))?.slice('--browser='.length)
    || EDGE_CANDIDATES.find(c => existsSync(c))
if (!browser || !isAbsolute(browser) || !existsSync(browser)) throw new Error('Pass an existing absolute Chromium executable with --browser=')
if (!/^https?:\/\//.test(BASE)) throw new Error('Pass an HTTP preview URL with --baseUrl=')

const sleep = ms => new Promise(r => setTimeout(r, ms))
let port
let userDataDir

const failures = []
const record = (ok, label, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label} :: ${JSON.stringify(detail)}`)
    if (!ok) failures.push(label)
}

let proc
let ws
let ownedTarget
let exitPromise
let spawnError
let exited = false
let stderr = ''
let nextId = 1
const pending = new Map()

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

async function waitForDebugger() {
    const started = Date.now()
    while (Date.now() - started < 15000) {
        if (spawnError) throw spawnError
        if (exited) throw new Error(`Chromium exited before debugger ownership: ${stderr}`)
        const file = await fs.readFile(join(userDataDir, 'DevToolsActivePort'), 'utf8').catch(() => null)
        const announcement = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+(\/devtools\/browser\/[\w-]+))/)
        if (file && announcement) {
            const [number, path, ...extra] = file.trim().split(/\r?\n/)
            if (!/^\d+$/.test(number) || !/^\/devtools\/browser\/[\w-]+$/.test(path) || extra.length || Number(number) !== Number(new URL(announcement[1]).port) || announcement[2] !== path) {
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
  // Check EVERY label, and test real rendered visibility (width AND
  // visibility/opacity) — a width-only check passes while a label is hidden
  // with visibility:hidden.
  const labels = [...sb.querySelectorAll('.nav-item span:not(.nav-icon)')];
  const rendered = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width === 0 || r.height === 0
      || cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0;
  };
  const hiddenLabels = labels.filter(rendered);
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
const welcomeState = `(() => {
  const card = document.querySelector('.welcome-card[role="dialog"]');
  const cta = card?.querySelector('.welcome-cta');
  const close = card?.querySelector('.welcome-close');
  const content = card?.querySelector('.welcome-content');
  const measure = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, rect: [r.left, r.top, r.right, r.bottom], visible: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !!r.width && !!r.height, hit: hit === el || el.contains(hit) };
  };
  return { present: !!card, active: document.activeElement === close ? 'close' : document.activeElement === cta ? 'cta' : document.activeElement?.id || document.activeElement?.tagName,
    cta: measure(cta), close: measure(close), scroll: content ? { top: content.scrollTop, max: content.scrollHeight - content.clientHeight, end: content.scrollTop + content.clientHeight >= content.scrollHeight - 2 } : null,
    horizontal: document.documentElement.scrollWidth > innerWidth, seen: (() => { try { return JSON.parse(localStorage.getItem('gampo_onboarding_v1'))?.seen === true } catch { return false } })(), viewport: [innerWidth, innerHeight] };
})()`

async function key(key, shift = false) {
    const code = key === ' ' ? 'Space' : key
    const virtual = { Tab: 9, Enter: 13, ' ': 32, Escape: 27, PageDown: 34, End: 35 }[key]
    const params = { key, code, windowsVirtualKeyCode: virtual, ...(shift ? { modifiers: 8 } : {}) }
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params, ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : key === ' ' ? { text: ' ', unmodifiedText: ' ' } : {}) })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
}

async function navigate(url) {
    await send('Page.navigate', { url })
    await sleep(1400)
}

async function freshWelcome(width, height) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true })
    await navigate(BASE + '/')
    await evalExpr("localStorage.removeItem('gampo_onboarding_v1')")
    await navigate(BASE + '/')
    const state = await evalExpr(welcomeState)
    record(state.present && state.active === 'close', `W1/W2 fresh auto-open focus Close ${width}x${height}`, { ...state, opener: 'none (automatic)' })
    if (!state.present) throw new Error(`Welcome missing at ${width}x${height}`)
    return state
}

async function assertDismissed(label) {
    await sleep(300)
    const result = await evalExpr(welcomeState)
    record(!result.present && result.seen, `${label} dismisses and persists seen`, result)
    await navigate(BASE + locationPath)
    const reload = await evalExpr(welcomeState)
    record(!reload.present && reload.seen, `${label} stays dismissed after reload`, reload)
}

let locationPath = '/'
async function verifyWelcomeAtViewport(width, height) {
    const label = `${width}x${height}`
    let state = await freshWelcome(width, height)
    record(!state.horizontal && state.cta?.visible && state.cta.hit && state.close?.visible && state.close.hit, `W1 geometry and controls ${label}`, state)
    if (state.scroll.max > 1) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: width / 2, y: height / 2 })
        await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: width / 2, y: height / 2, deltaX: 0, deltaY: Math.max(600, state.scroll.max * 2) })
        await sleep(450)
        state = await evalExpr(welcomeState)
        record(state.scroll.top > 0 && state.scroll.end, `W1 real wheel reaches content end ${label}`, state.scroll)
        const detailsFocused = await evalExpr("(() => { const details = document.querySelector('.welcome-content'); details.scrollTop = 0; details.focus(); return document.activeElement === details })()")
        record(detailsFocused, `W1 keyboard focuses details region ${label}`, { focused: detailsFocused })
        await key('PageDown')
        await sleep(450)
        state = await evalExpr(welcomeState)
        if (!state.scroll.end) {
            await key('End')
            await sleep(250)
            state = await evalExpr(welcomeState)
        }
        record(state.scroll.top > 0 && state.scroll.end, `W1 real keyboard reaches content end ${label}`, state.scroll)
        const bounds = await evalExpr("(() => { const r = document.querySelector('.welcome-content').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()")
        await evalExpr("document.querySelector('.welcome-content').scrollTop = 0")
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x, y: bounds.y, id: 1 }] })
        await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bounds.x, y: bounds.y - Math.max(600, state.scroll.max * 2), id: 1 }] })
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        await sleep(450)
        state = await evalExpr(welcomeState)
        record(state.scroll.top > 0 && state.scroll.end, `W1 real touch reaches content end ${label}`, state.scroll)
    } else record(state.scroll.end, `W1 content fits without scrolling ${label}`, state.scroll)
    record(state.cta?.visible && state.cta.hit && state.close?.visible && state.close.hit, `W1 controls remain hit-testable after scroll ${label}`, state)
    if (width <= 740) {
        await evalExpr("document.querySelector('.welcome-cta').focus()")
        record((await evalExpr(welcomeState)).active === 'cta', `W2 exact CTA focus setup ${label}`, await evalExpr(welcomeState))
        await key('Tab')
        record((await evalExpr(welcomeState)).active === 'close', `W2 Tab CTA to exact Close ${label}`, await evalExpr(welcomeState))
        await key('Tab', true)
        record((await evalExpr(welcomeState)).active === 'cta', `W2 Shift+Tab Close to exact CTA ${label}`, await evalExpr(welcomeState))
    }
    await key('Escape')
    await assertDismissed(`W3 Escape ${label}`)
    for (const control of ['cta', 'close']) {
        for (const activation of ['pointer', 'Enter', ' ']) {
            state = await freshWelcome(width, height)
            if (activation === 'pointer') await clickAt(state[control].x, state[control].y)
            else {
                await evalExpr(`document.querySelector('.welcome-${control}').focus()`)
                record((await evalExpr(welcomeState)).active === control, `W3 ${control} keyboard setup ${label}`, { activation })
                await key(activation)
            }
            await assertDismissed(`W3 ${control} ${activation === ' ' ? 'Space' : activation} ${label}`)
        }
    }
    await verifyReplay(width, height)
}

async function verifyReplay(width, height) {
    const label = `${width}x${height}`
    for (const dismissal of ['cta', 'close', 'Escape', 'backdrop']) {
        await navigate(BASE + '/settings')
        locationPath = '/settings'
        const opener = await evalExpr(`(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('Replay welcome intro')); b?.focus(); return !!b && document.activeElement === b && b.isConnected })()`)
        record(opener, `W4 mounted Settings opener focus ${dismissal} ${label}`, { opener })
        if (!opener) throw new Error('Settings replay opener missing')
        await key('Enter')
        await sleep(400)
        let state = await evalExpr(welcomeState)
        record(state.present && state.active === 'close', `W4 keyboard replay opens ${dismissal} ${label}`, state)
        if (!state.present) throw new Error('Settings replay failed')
        if (dismissal === 'Escape') await key('Escape')
        else if (dismissal === 'backdrop') {
            const point = await evalExpr(`(() => { const r = document.querySelector('.welcome-card').getBoundingClientRect(); const x = r.left > 5 ? r.left / 2 : innerWidth - 3; const y = Math.max(2, r.top / 2); return { x, y, hit: document.elementFromPoint(x,y)?.classList.contains('welcome-backdrop') } })()`)
            record(point.hit, `W4 backdrop hit test ${label}`, point)
            if (!point.hit) throw new Error('Backdrop is not hit-testable')
            await clickAt(point.x, point.y)
        } else {
            await evalExpr(`document.querySelector('.welcome-${dismissal}').focus()`)
            await key('Enter')
        }
        await sleep(350)
        const returned = await evalExpr(`(() => { const b = [...document.querySelectorAll('button')].find(el => el.textContent.includes('Replay welcome intro')); return { gone: !document.querySelector('.welcome-card'), connected: !!b?.isConnected, exact: document.activeElement === b, seen: JSON.parse(localStorage.getItem('gampo_onboarding_v1') || '{}').seen === true } })()`)
        record(returned.gone && returned.connected && returned.exact && returned.seen, `W4 focus returns to exact replay opener via ${dismissal} ${label}`, returned)
        await assertDismissed(`W4 replay ${dismissal} ${label}`)
    }
    locationPath = '/'
}

// The wrapper observes registrations and their real boundary-event behavior.
// It never changes native Tab or supplies focus; only the selected invocation is omitted.
const w5Hook = `(() => {
  const add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document);
  const wrappers = new Map(), events = [];
  let id = 0;
  window.__w5 = { events, registrations: [], selected: null, direction: null };
  document.addEventListener = function(type, listener, options) {
    if (type !== 'keydown' || !(options === true || options?.capture === true) || typeof listener !== 'function') return add(type, listener, options);
    const registration = { id: ++id, stack: new Error().stack, source: Function.prototype.toString.call(listener).slice(0, 300) };
    window.__w5.registrations.push(registration);
    const wrapped = function(event) {
      const active = document.activeElement;
      const direction = event.key === 'Tab' && active?.classList.contains('welcome-cta') && !event.shiftKey ? 'forward'
        : event.key === 'Tab' && active?.classList.contains('welcome-close') && event.shiftKey ? 'reverse' : null;
      const skip = !!direction && window.__w5.selected === registration.id && window.__w5.direction === direction;
      if (!skip) listener.call(this, event);
      if (direction) events.push({ id: registration.id, direction, skip, prevented: event.defaultPrevented });
    };
    wrappers.set(listener, wrapped);
    return add(type, wrapped, options);
  };
  document.removeEventListener = function(type, listener, options) {
    const wrapped = wrappers.get(listener);
    if (wrapped) wrappers.delete(listener);
    return remove(type, wrapped || listener, options);
  };
})()`

async function verifyNegative(width, height, direction) {
    const label = `${width}x${height} ${direction}`
    const registration = await send('Page.addScriptToEvaluateOnNewDocument', { source: w5Hook })
    try {
        await freshWelcome(width, height)
        const setup = direction === 'forward' ? 'cta' : 'close'
        const expected = direction === 'forward' ? 'close' : 'cta'
        const opposite = direction === 'forward' ? 'reverse' : 'forward'
        await evalExpr(`document.querySelector('.welcome-${setup}').focus()`)
        await key('Tab', direction === 'reverse')
        let witness = await evalExpr(`({ state: (${welcomeState}), hook: window.__w5 })`)
        const matching = witness.hook?.events.filter(e => e.direction === direction && e.prevented && !e.skip) || []
        record(witness.state.active === expected && matching.length === 1 && witness.hook.registrations.some(r => r.id === matching[0].id), `W5 baseline actual capture listener ${label}`, witness)
        if (matching.length !== 1) throw new Error(`Ambiguous Welcome capture listener ${label}`)
        const selected = matching[0].id
        const sentinels = await evalExpr(`(() => {
          const backdrop = document.querySelector('.welcome-backdrop');
          if (!backdrop || !window.__w5) return null;
          for (const el of [...document.body.children]) if (el !== backdrop) el.inert = true;
          const before = document.createElement('button'), after = document.createElement('button');
          before.id = 'w5-before'; after.id = 'w5-after';
          before.textContent = 'Before'; after.textContent = 'After';
          for (const [el, top] of [[before, '2px'], [after, 'auto']]) {
            Object.assign(el.style, { position:'fixed', top, bottom:el === after ? '2px' : 'auto', left:'3px', zIndex:'2147483647' });
          }
          backdrop.before(before); backdrop.after(after);
          return [before, after].map(el => { const r = el.getBoundingClientRect(); return { id:el.id, rect:[r.left,r.top,r.right,r.bottom], visible:r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2) === el }; });
        })()`)
        record(sentinels?.length === 2 && sentinels.every(s => s.visible && s.hit), `W5 native outside controls visible and hit-testable ${label}`, sentinels)
        if (!sentinels?.every(s => s.visible && s.hit)) throw new Error(`W5 sentinel geometry failed ${label}`)
        await evalExpr(`window.__w5.selected = ${selected}; window.__w5.direction = ${JSON.stringify(direction)}; document.querySelector('.welcome-${setup}').focus()`)
        await key('Tab', direction === 'reverse')
        witness = await evalExpr(`({ state: (${welcomeState}), events: window.__w5.events })`)
        const destination = direction === 'forward' ? 'w5-after' : 'w5-before'
        record(witness.state.active === destination && witness.state.active !== expected && witness.events.some(e => e.id === selected && e.direction === direction && e.skip && !e.prevented), `W5 expected exact endpoint FAIL with native ${destination} ${label}`, witness)
        if (witness.state.active !== destination) throw new Error(`Native Tab destination ambiguous ${label}`)
        await evalExpr(`document.querySelector('.welcome-${expected}').focus()`)
        await key('Tab', opposite === 'reverse')
        witness = await evalExpr(`({ state: (${welcomeState}), events: window.__w5.events })`)
        record(witness.state.active === setup && witness.events.some(e => e.id === selected && e.direction === opposite && !e.skip && e.prevented), `W5 opposite direction remains functional ${label}`, witness)
    } finally {
        await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: registration.identifier })
    }
    await navigate(BASE + '/')
    const clean = await evalExpr(`({ state: (${welcomeState}), hook: !!window.__w5, sentinels: !!document.querySelector('#w5-before, #w5-after') })`)
    record(clean.state.present && !clean.hook && !clean.sentinels && clean.state.active === 'close', `W5 clean reload restores unmodified page ${label}`, clean)
    await evalExpr("document.querySelector('.welcome-cta').focus()")
    await key('Tab')
    record((await evalExpr(welcomeState)).active === 'close', `W5 clean forward endpoint ${label}`, await evalExpr(welcomeState))
    await key('Tab', true)
    record((await evalExpr(welcomeState)).active === 'cta', `W5 clean reverse endpoint ${label}`, await evalExpr(welcomeState))
}


try {
    userDataDir = await fs.mkdtemp(join(tmpdir(), 'gampo-mobilenav-'))
    proc = spawn(browser, [
        '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`,
        '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    exitPromise = new Promise(resolveExit => {
        proc.once('error', error => { spawnError = error; exited = true; resolveExit({ error }) })
        proc.once('exit', (code, signal) => { exited = true; resolveExit({ code, signal }) })
    })
    proc.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-16000) })
    await waitForDebugger()
    const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
    if (!response.ok) throw new Error('Could not create owned page target')
    ownedTarget = await response.json()
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    if (list.filter(t => t.id === ownedTarget.id && t.type === 'page' && t.webSocketDebuggerUrl === ownedTarget.webSocketDebuggerUrl).length !== 1 || !ownedTarget.webSocketDebuggerUrl?.startsWith(`ws://127.0.0.1:${port}/devtools/page/`)) throw new Error('Ambiguous or unowned new page target')
    if (exited) throw new Error('Chromium exited before CDP attachment')
    ws = new WebSocket(ownedTarget.webSocketDebuggerUrl)
    await new Promise((resolveOpen, rejectOpen) => { ws.onopen = resolveOpen; ws.onerror = rejectOpen })
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id)
            pending.delete(msg.id)
            if (msg.error) reject(new Error(JSON.stringify(msg.error)))
            else resolve(msg.result)
        }
    }
    ws.onclose = () => {
        for (const request of pending.values()) request.reject(new Error('Owned CDP socket closed'))
        pending.clear()
    }
    await send('Page.enable')
    await send('Runtime.enable')
    await verifyWelcomeAtViewport(375, 667)
    await verifyWelcomeAtViewport(740, 360)
    await verifyWelcomeAtViewport(768, 1024)
    await verifyWelcomeAtViewport(1610, 870)
    for (const [width, height] of [[375, 667], [740, 360]]) {
        for (const direction of ['forward', 'reverse']) await verifyNegative(width, height, direction)
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 1, mobile: true })
    await navigate(BASE + '/')
    await evalExpr("localStorage.removeItem('gampo_onboarding_v1')")
    await navigate(BASE + '/')
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
    // Restore the independent closure assertion (round 3, defect 2): the exact
    // path check below cannot detect a drawer that navigates but stays open, so
    // assert closure separately rather than only printing it in the details.
    record(afterTap.drawerClosed === true, 'drawer closes after navigating', afterTap)

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
    if (ws) {
        try {
            const closed = new Promise(resolveClosed => { ws.addEventListener('close', resolveClosed, { once: true }) })
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
            await fs.rm(userDataDir, { recursive: true, maxRetries: 5, retryDelay: 100 })
            console.log('OWNED CLEANUP', JSON.stringify({ pid: proc?.pid, profileRemoved: true }))
        } catch (err) { failures.push('owned profile cleanup: ' + err.message) }
    }
}

if (failures.length) {
    console.log(`\nMOBILE NAV FAILED (${failures.length}): ${failures.join('; ')}`)
    process.exit(1)
}
console.log('\nMOBILE NAV PASSED')
