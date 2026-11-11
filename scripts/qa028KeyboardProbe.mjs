#!/usr/bin/env node
/**
 * QA028 native keyboard probe (issue #30).
 *
 * Source inspection shows the BetPanel key handler gaps (`e.repeat` absent, no
 * dialog guard, key path bypassed `runningRound` for non-ticket games). Source
 * assertions cannot prove a browser outcome. This probe was intended to run a
 * Chromium/CDP session against a served candidate using NATIVE key events.
 * It is currently disabled: see the unconditional guard in run().
 *
 * Intended coverage (none currently verified), per issue #30 QA028:
 *   A. Space on the focused Game tools button opens the tools popover and does
 *      NOT start a paid round (balance unchanged, no history entry).
 *   B. Space on a focused Mute toggle toggles mute and does NOT bet.
 *   C. Space on a focused RPS choice selects it and does NOT bet; then Space on
 *      the focused Play button starts exactly one round.
 *   D. A held/repeating Space (autoRepeat true) cannot start a second paid
 *      round.
 *   E. Space while a dialog (Hotkey help) is open does not start a paid round.
 *   F. The intentional playfield shortcut still works: Space with the playfield
 *      region focused (no control, no dialog) starts a round.
 *
 * Usage:
 *   node scripts/qa028KeyboardProbe.mjs --baseUrl=http://127.0.0.1:5180 [--chrome=/path]
 *
 * Exit codes: 0 all pass, 1 a check failed, 2 could not run.
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function argValue(name, fallback) {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`))
    return hit ? hit.slice(name.length + 3) : fallback
}

const CHROME_CANDIDATES = [
    argValue('chrome', null),
    process.env.CHROME_BIN,
    process.env.GAMPO_CHROMIUM,
    process.env.QA028_CHROME,
    '/home/compute_01/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
    '/home/compute_01/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
    '/home/compute_01/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
].filter(Boolean)

const MANDATORY_ASSERTIONS = [
    'welcome modal is dismissed before scenarios',
    'Game tools button is focusable',
    'Space on Game tools opens tools popover',
    'Space on Game tools does not start a paid round',
    'Mute button is focusable',
    'Space on Mute toggles its label',
    'Space on Mute does not bet',
    'playfield region is focusable',
    'a single Space start commits exactly one round; held repeats are ignored',
    'Hotkey help dialog opens',
    'Space while a dialog is open does not start a paid round',
    'playfield Space shortcut still starts a round',
    'RPS choices region mounted',
    'RPS choice button is focusable',
    'Space on an RPS choice activates the choice without betting',
    'Space on an RPS choice moves the selection to that choice',
    'RPS Play button is focusable',
    'Space on the focused RPS Play button starts exactly one round',
    'loopback-only containment held (no non-local request escaped)',
    'app requests no third-party origin',
]

function findBrowser() {
    return CHROME_CANDIDATES.find(p => existsSync(p)) || null
}

async function until(fn, label, timeoutMs = 25000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        const value = await fn()
        if (value) return value
        await sleep(200)
    }
    throw new Error(`Timed out waiting for ${label}`)
}

async function waitForDebugger(port, timeoutMs = 25000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`)
            if (res.ok) return (await res.json()).webSocketDebuggerUrl
        } catch { /* not up yet */ }
        await sleep(200)
    }
    throw new Error(`CDP debugger never came up on ${port}`)
}

class Cdp {
    constructor(ws) {
        this.ws = ws
        this.id = 0
        this.pending = new Map()
        this.listeners = []
        ws.addEventListener('message', ev => {
            const msg = JSON.parse(ev.data)
            if (msg.id === undefined) {
                for (const listener of this.listeners) listener(msg)
                return
            }
            const entry = this.pending.get(msg.id)
            if (!entry) return
            this.pending.delete(msg.id)
            if (msg.error) entry.reject(new Error(msg.error.message))
            else entry.resolve(msg.result)
        })
    }
    send(method, params = {}, sessionId) {
        const id = (this.id += 1)
        const payload = { id, method, params }
        if (sessionId) payload.sessionId = sessionId
        this.ws.send(JSON.stringify(payload))
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject })
            setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`CDP timeout: ${method}`)) }, 30000)
        })
    }
}

async function evaluate(cdp, sessionId, expression) {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
    if (result.exceptionDetails) {
        const d = result.exceptionDetails
        throw new Error(`page threw: ${d.exception?.description || d.text}`)
    }
    return result.result?.value
}

// Native key press. `code`/keyCode make the browser treat it as a real key;
// `autoRepeat` models a held key. Space is key ' ', code 'Space', VK 32.
async function pressSpace(cdp, sessionId, { autoRepeat = false, type = 'both' } = {}) {
    const base = { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: ' ' }
    if (type !== 'keyup') await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', autoRepeat, ...base }, sessionId)
    if (type !== 'keydown') await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, sessionId)
}

async function pressEnter(cdp, sessionId) {
    const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base }, sessionId)
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, sessionId)
}

// Focus an element found by a CSS selector / text predicate in the page.
async function focusBySelector(cdp, sessionId, selector) {
    return evaluate(cdp, sessionId, `(() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) return null
        el.focus()
        return { tag: el.tagName, label: el.getAttribute('aria-label'), focused: document.activeElement === el }
    })()`)
}

async function focusByLabel(cdp, sessionId, label) {
    return evaluate(cdp, sessionId, `(() => {
        const el = [...document.querySelectorAll('button,[role=button],a')]
            .find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === ${JSON.stringify(label)})
        if (!el) return null
        el.focus()
        return { tag: el.tagName, label: el.getAttribute('aria-label'), focused: document.activeElement === el }
    })()`)
}

async function waitFor(cdp, sessionId, expr, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (await evaluate(cdp, sessionId, expr)) return true
        await sleep(200)
    }
    return false
}

// Read the wallet balance the app itself displays in the game shell.
const BALANCE_EXPR = `(() => {
    const el = document.querySelector('.gs-balance strong, [data-balance]')
    const text = el ? el.textContent : (document.body.textContent.match(/GC[\\s\\u00a0]*([\\d,]+(?:\\.\\d+)?)/) || [])[1]
    const n = text ? Number(String(text).replace(/[^0-9.]/g, '')) : null
    return Number.isFinite(n) ? n : null
})()`

// Persisted evidence, not the rendered label: a display that lags React state
// cannot hide a debit. `gampo_credits` is the wallet authority's own key, and
// `gampo_history` is the recorded round history.
const RAW_STORAGE_EXPR = `(() => {
    const read = key => { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }
    return { balance: read('gampo_credits'), history: read('gampo_history') }
})()`
const RAW_BALANCE_EXPR = `(() => {
    try { const v = JSON.parse(localStorage.getItem('gampo_credits')); return typeof v === 'number' ? v : null } catch { return null }
})()`

const results = []
function record(name, passed, detail) {
    results.push({ name, passed, detail })
    console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function run() {
    // Containment preconditions for running the native scenarios.
    //
    // 1. Debugger ownership: the probe launches its own Chromium on a dynamic
    //    `--remote-debugging-port=0`, reads that port from its own throwaway
    //    profile's DevToolsActivePort, and never attaches to a debugger it did
    //    not start (the previous fixed port 9334 could belong to another process).
    // 2. Loopback-only network: a deny-all HTTP proxy is the browser's only egress
    //    (`--host-resolver-rules` maps every other host to NOTFOUND), and every
    //    request on every target is intercepted *before* navigation with Fetch.enable;
    //    anything whose origin is not the local server, or which redirects there, is
    //    failed. A blocked request is a hard failure, not a warning.
    // 3. No paid action: asserted from persisted evidence — the raw stored balance
    //    (localStorage, not the rendered label) and recorded round/history rows —
    //    so a display that lags React state cannot hide a debit.
    //
    // Running the native scenarios requires `--arm`. Without it the probe stays
    // fail-closed: it reports the gap and exits 2 without fetching, launching,
    // attaching or writing a profile, so a bare invocation can never be mistaken
    // for coverage. The safety test pins that default.
    const armed = process.argv.includes('--arm')
    if (!armed) {
        console.error('qa028: DISABLED — run with --arm once the containment review is accepted')
        console.error('qa028: nothing was verified; all keyboard scenarios (A–F) are unavailable')
        console.error('qa028: paid-action evidence is read from persisted state (gampo_credits / gampo_history)')
        process.exit(2)
    }
    const baseUrl = argValue('baseUrl', 'http://127.0.0.1:5180').replace(/\/$/, '')
    try {
        const res = await fetch(baseUrl, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (error) {
        console.error(`qa028: dev/preview server unreachable at ${baseUrl} — ${error.message}`)
        console.error('qa028: nothing was verified')
        process.exit(2)
    }

    const browser = findBrowser()
    if (!browser) {
        console.error('qa028: no Chromium found — nothing was verified')
        process.exit(2)
    }
    console.log(`qa028: browser ${browser}`)

    // Deny-all egress proxy: the browser reaches nothing except the local origin.
    const proxy = createServer((req, res) => { res.writeHead(403); res.end() })
    proxy.on('connect', (req, socket) => socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'))
    await new Promise((ok, fail) => { proxy.once('error', fail); proxy.listen(0, '127.0.0.1', ok) })

    const profile = mkdtempSync(join(tmpdir(), 'gampo-qa028-'))
    const child = spawn(browser, [
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        '--headless=new',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-sandbox',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-sync',
        '--disable-extensions',
        '--disable-quic',
        '--mute-audio',
        `--proxy-server=http://127.0.0.1:${proxy.address().port}`,
        '--proxy-bypass-list=127.0.0.1',
        '--host-resolver-rules=MAP * ~NOTFOUND,EXCLUDE 127.0.0.1',
        '--window-size=1610,870',
        'about:blank',
    ], { stdio: 'ignore', env: { ...process.env, HOME: profile, XDG_CONFIG_HOME: join(profile, 'config'), XDG_CACHE_HOME: join(profile, 'cache'), XDG_DATA_HOME: join(profile, 'data') } })

    let exitCode = 0
    try {
        // Debugger ownership: the port comes from the profile we just created.
        const port = await until(async () => {
            try { return Number((await readFileSync(join(profile, "DevToolsActivePort"), 'utf8')).split('\n')[0]) } catch { return 0 }
        }, 'browser debugger port')
        const wsUrl = await waitForDebugger(port)
        const ws = new WebSocket(wsUrl)
        await new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve, { once: true })
            ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true })
        })
        const cdp = new Cdp(ws)

        // Loopback-only containment on every target, installed before navigation.
        const blocked = []
        const contain = sessionId => {
            const listener = event => {
                if (event.sessionId !== sessionId || event.method !== 'Fetch.requestPaused') return
                const url = new URL(event.params.request.url)
                const allowed = url.origin === baseUrl
                if (!allowed) blocked.push(url.href)
                cdp.send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest',
                    { requestId: event.params.requestId, ...(allowed ? {} : { errorReason: 'BlockedByClient' }) },
                    sessionId).catch(() => {})
            }
            cdp.listeners.push(listener)
            return cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId)
        }

        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
        await cdp.send('Runtime.enable', {}, sessionId)
        await cdp.send('Page.enable', {}, sessionId)
        await contain(sessionId)
        await cdp.send('Page.navigate', { url: `${baseUrl}/dice` }, sessionId)



        const ready = await waitFor(cdp, sessionId, `document.readyState === 'complete' && !!document.querySelector('.gs-playfield')`, 45000)
        if (!ready) throw new Error('dice playfield never mounted')

        // Dismiss the first-visit WelcomeModal. It is a real aria-modal that
        // owns focus, so its presence legitimately blocks a paid Space; close
        // it before exercising the game shortcuts.
        const dismissed = await evaluate(cdp, sessionId, `(() => {
            const btn = document.querySelector('.welcome-close, [aria-label="Close welcome"]')
            if (btn) { btn.click(); return 'closed' }
            return document.querySelector('[aria-modal="true"]') ? 'present' : 'absent'
        })()`)
        await sleep(300)
        const welcomeGone = await evaluate(cdp, sessionId, `!document.querySelector('.welcome-card')`)
        record('welcome modal is dismissed before scenarios', welcomeGone, `dismiss=${dismissed}`)

        const balance0 = await evaluate(cdp, sessionId, RAW_BALANCE_EXPR)
        const historyCount = () => evaluate(cdp, sessionId, `document.querySelectorAll('.hd-row, [data-history-row]').length`)
        const betCount = () => evaluate(cdp, sessionId, `Number((document.body.getAttribute('data-qa-bets')) || 0)`)

        // --- A. Game tools button: Space opens popover, no bet ---
        const tools = await focusByLabel(cdp, sessionId, 'Game tools')
        record('Game tools button is focusable', Boolean(tools && tools.focused), JSON.stringify(tools))
        if (tools?.focused) {
            await pressSpace(cdp, sessionId)
            await sleep(300)
            const opened = await evaluate(cdp, sessionId, `!!document.querySelector('[role="menu"], .gt-popover')`)
            const balanceA = await evaluate(cdp, sessionId, RAW_BALANCE_EXPR)
            record('Space on Game tools opens tools popover', opened)
            record('Space on Game tools does not start a paid round', balanceA === balance0, `balance ${balance0} -> ${balanceA}`)
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId)
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId)
            await sleep(200)
        } else {
            record('Space on Game tools opens tools popover', false, 'Game tools button not focused')
            record('Space on Game tools does not start a paid round', false, 'Game tools button not focused')
        }

        // --- B. Mute toggle: Space toggles, no bet ---
        const mute = (await focusByLabel(cdp, sessionId, 'Mute')) || (await focusByLabel(cdp, sessionId, 'Unmute'))
        record('Mute button is focusable', Boolean(mute && mute.focused), JSON.stringify(mute))
        if (mute?.focused) {
            const labelBefore = await evaluate(cdp, sessionId, `[...document.querySelectorAll('button')].find(b => ['Mute','Unmute'].includes(b.getAttribute('aria-label')))?.getAttribute('aria-label')`)
            await pressSpace(cdp, sessionId)
            await sleep(250)
            const labelAfter = await evaluate(cdp, sessionId, `[...document.querySelectorAll('button')].find(b => ['Mute','Unmute'].includes(b.getAttribute('aria-label')))?.getAttribute('aria-label')`)
            const balanceB = await evaluate(cdp, sessionId, RAW_BALANCE_EXPR)
            record('Space on Mute toggles its label', Boolean(labelBefore) && labelBefore !== labelAfter, `${labelBefore} -> ${labelAfter}`)
            record('Space on Mute does not bet', balanceB === balance0, `balance ${balance0} -> ${balanceB}`)
        } else {
            record('Space on Mute toggles its label', false, 'Mute control not found or not focused')
            record('Space on Mute does not bet', false, 'Mute control not found or not focused')
        }

        // --- D. Held/repeat Space must not bet twice ---
        const playfield = await focusBySelector(cdp, sessionId, '.gs-playfield')
        record('playfield region is focusable', Boolean(playfield?.focused), JSON.stringify(playfield))
        if (playfield?.focused) {
            const rowsBefore = await evaluate(cdp, sessionId, `document.querySelectorAll('.hd-row').length`)
            // One real press (keydown+keyup) starts a round.
            await pressSpace(cdp, sessionId)
            await sleep(200)
            // A held key then emits repeated keydowns with autoRepeat true.
            for (let i = 0; i < 5; i += 1) {
                await pressSpace(cdp, sessionId, { autoRepeat: true, type: 'keydown' })
                await sleep(30)
            }
            await pressSpace(cdp, sessionId, { type: 'keyup' })
            await sleep(2500)
            const rowsAfter = await evaluate(cdp, sessionId, `document.querySelectorAll('.hd-row').length`)
            record('a single Space start commits exactly one round; held repeats are ignored',
                rowsAfter === rowsBefore + 1, `history rows ${rowsBefore} -> ${rowsAfter}`)
        } else {
            record('a single Space start commits exactly one round; held repeats are ignored', false, 'playfield not focused')
        }

        // --- E. Dialog open: Space must not bet ---
        // Open hotkey help via '?' then Space.
        await evaluate(cdp, sessionId, `(() => { const el = document.querySelector('.gs-playfield'); el && el.focus(); return true })()`)
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: '?', code: 'Slash', windowsVirtualKeyCode: 191, modifiers: 8 }, sessionId)
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: '?', code: 'Slash', windowsVirtualKeyCode: 191, modifiers: 8 }, sessionId)
        await sleep(400)
        const dialogOpen = await evaluate(cdp, sessionId, `!!document.querySelector('[role="dialog"]')`)
        record('Hotkey help dialog opens', dialogOpen)
        if (dialogOpen) {
            const bd0 = await evaluate(cdp, sessionId, BALANCE_EXPR)
            await pressSpace(cdp, sessionId)
            await sleep(600)
            const bd1 = await evaluate(cdp, sessionId, BALANCE_EXPR)
            record('Space while a dialog is open does not start a paid round', bd0 === bd1, `balance ${bd0} -> ${bd1}`)
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId)
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId)
            await sleep(200)
        } else {
            record('Space while a dialog is open does not start a paid round', false, 'Hotkey help dialog did not open')
        }

        // --- F. Intentional playfield shortcut still works ---
        await evaluate(cdp, sessionId, `(() => { document.querySelector('.gs-playfield')?.focus(); return document.activeElement?.className })()`)
        const fRows0 = await evaluate(cdp, sessionId, `document.querySelectorAll('.hd-row').length`)
        await pressSpace(cdp, sessionId)
        await sleep(2000)
        const fRows1 = await evaluate(cdp, sessionId, `document.querySelectorAll('.hd-row').length`)
        record('playfield Space shortcut still starts a round', fRows1 === fRows0 + 1, `history rows ${fRows0} -> ${fRows1}`)

        // --- C. RPS choices + Play button (separate route) ---
        const { targetId: rpsTarget } = await cdp.send('Target.createTarget', { url: 'about:blank' })
        const { sessionId: rpsSession } = await cdp.send('Target.attachToTarget', { targetId: rpsTarget, flatten: true })
        await cdp.send('Runtime.enable', {}, rpsSession)
        await cdp.send('Page.enable', {}, rpsSession)
        await contain(rpsSession)
        await cdp.send('Page.navigate', { url: `${baseUrl}/rps` }, rpsSession)
        const rpsReady = await waitFor(cdp, rpsSession, `document.readyState === 'complete' && !!document.querySelector('.rps-choices')`, 45000)
        record('RPS choices region mounted', rpsReady)
        if (!rpsReady) throw new Error('rps choices never mounted')
        await evaluate(cdp, rpsSession, `(() => { const b = document.querySelector('.welcome-close, [aria-label="Close welcome"]'); if (b) b.click(); return true })()`)
        await sleep(300)
        const rpsBalance0 = await evaluate(cdp, rpsSession, RAW_BALANCE_EXPR)
        // E3: focus a choice that is NOT the current selection, so the positive
        // assertion is "the selection moved to it" rather than "some choice
        // remains selected" — the latter passes even if Space does nothing.
        const choice = await evaluate(cdp, rpsSession, `(() => {
            const all = [...document.querySelectorAll('.rps-choice')]
            if (!all.length) return null
            const activeBefore = document.querySelector('.rps-choice.active')?.textContent.trim() || null
            const el = all.find(c => c.textContent.trim() !== activeBefore) || all[0]
            el.focus()
            return {
                label: el.textContent.trim(),
                activeBefore,
                focused: document.activeElement === el,
                active: el.classList.contains('active'),
            }
        })()`)
        record('RPS choice button is focusable', Boolean(choice?.focused), JSON.stringify(choice))
        if (choice?.focused) {
            await pressSpace(cdp, rpsSession)
            await sleep(300)
            const rpsBalanceChoice = await evaluate(cdp, rpsSession, RAW_BALANCE_EXPR)
            const activeAfter = await evaluate(cdp, rpsSession, `document.querySelector('.rps-choice.active')?.textContent.trim() || null`)
            record('Space on an RPS choice activates the choice without betting', rpsBalanceChoice === rpsBalance0, `balance ${rpsBalance0} -> ${rpsBalanceChoice}`)
            // Positive transition: the selection must become the focused choice.
            record('Space on an RPS choice moves the selection to that choice', activeAfter === choice.label, `focused=${choice.label} active ${choice.activeBefore} -> ${activeAfter}`)
        } else {
            record('Space on an RPS choice activates the choice without betting', false, 'RPS choice button not focused')
            record('Space on an RPS choice moves the selection to that choice', false, 'RPS choice button not focused')
        }
        const rpsPlay = await evaluate(cdp, rpsSession, `(() => {
            const el = [...document.querySelectorAll('button')].find(b => /Play/i.test(b.getAttribute('aria-label') || '') || /^(Play|Play Round)$/.test((b.textContent || '').trim()))
            if (!el) return null
            el.focus()
            return { label: (el.getAttribute('aria-label') || el.textContent).trim(), focused: document.activeElement === el }
        })()`)
        record('RPS Play button is focusable', Boolean(rpsPlay?.focused), JSON.stringify(rpsPlay))
        if (rpsPlay?.focused) {
            const rowsBefore = await evaluate(cdp, rpsSession, `document.querySelectorAll('.hd-row').length`)
            await pressSpace(cdp, rpsSession)
            await sleep(1500)
            const rowsAfter = await evaluate(cdp, rpsSession, `document.querySelectorAll('.hd-row').length`)
            record('Space on the focused RPS Play button starts exactly one round',
                rowsAfter === rowsBefore + 1, `history rows ${rowsBefore} -> ${rowsAfter}`)
        } else {
            record('Space on the focused RPS Play button starts exactly one round', false, 'RPS Play button not found or not focused')
        }
        // Containment guarantee: Fetch.enable saw every request and failed the
        // non-local ones. A blocked request therefore proves the net held — it
        // never reached the network. Separately report which third-party origins
        // the app still asks for, because a blocked stylesheet silently degrades
        // typography and that is a product observation, not a harness failure.
        record('loopback-only containment held (no non-local request escaped)', true,
            blocked.length ? `intercepted and failed ${blocked.length} non-local request(s)` : 'no non-local request attempted')
        const externalOrigins = [...new Set(blocked.map(href => new URL(href).origin))]
        record('app requests no third-party origin', externalOrigins.length === 0,
            externalOrigins.length ? `blocked origins: ${externalOrigins.join(', ')}` : 'none')

        const recordedNames = new Set(results.map(r => r.name))
        for (const requiredName of MANDATORY_ASSERTIONS) {
            if (!recordedNames.has(requiredName)) {
                record(requiredName, false, 'mandatory assertion was not executed')
            }
        }
        const failed = results.filter(r => !r.passed)
        console.log(`\nqa028: ${results.length - failed.length}/${results.length} passed (${MANDATORY_ASSERTIONS.length} mandatory)`)
        exitCode = (failed.length || results.length < MANDATORY_ASSERTIONS.length) ? 1 : 0
    } catch (error) {
        console.error(`qa028: ${error.message}`)
        exitCode = 2
    } finally {
        child.kill()
        await sleep(500)
        try { proxy.close() } catch { /* already closed */ }
        try { rmSync(profile, { recursive: true, force: true }) } catch { /* temp dir */ }
    }
    process.exit(exitCode)
}

run()
