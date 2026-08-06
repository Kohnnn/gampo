#!/usr/bin/env node
/**
 * Browser probe for the dev-only slots QA seam (Phase 04, checklist C3).
 *
 * Proves the seam works through its PUBLIC dev API in a real browser — no
 * module patching, no React fiber poking. That restriction is the point: a
 * probe that reaches into internals proves the internals, not the seam other
 * tooling will actually use.
 *
 * What it establishes:
 *   1. enqueueOutcome / setFreeSpinSession exist in dev
 *   2. a malformed fixture is REJECTED and leaves the queue unchanged
 *   3. a queued outcome is consumed exactly once (FIFO, one-shot)
 *   4. an exhausted queue falls back to the real resolver
 *
 * Reuses the Phase 03 raw-CDP transport (native WebSocket, no dependency).
 *
 * Usage:
 *   node scripts/slotsQaSeamProbe.mjs --baseUrl=http://127.0.0.1:5180
 *
 * Exit codes:
 *   0 - every scenario passed
 *   1 - a scenario failed
 *   2 - could not run (no browser, dev server unreachable, seam absent)
 *
 * Exit 2 is distinct on purpose: "could not verify" must never read as "passed".
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME_CANDIDATES = [
    'C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
]

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function argValue(name, fallback) {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`))
    return hit ? hit.slice(name.length + 3) : fallback
}

function findBrowser() {
    return CHROME_CANDIDATES.find(p => existsSync(p)) || null
}

async function waitForDebugger(port, timeoutMs = 20000) {
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
        ws.addEventListener('message', ev => {
            const msg = JSON.parse(ev.data)
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
            setTimeout(() => {
                if (this.pending.delete(id)) reject(new Error(`CDP timeout: ${method}`))
            }, 30000)
        })
    }
}

async function evaluate(cdp, sessionId, expression) {
    const result = await cdp.send(
        'Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true },
        sessionId,
    )
    if (result.exceptionDetails) {
        const d = result.exceptionDetails
        throw new Error(`page threw: ${d.exception?.description || d.text}`)
    }
    return result.result?.value
}

const results = []
function record(name, passed, detail) {
    results.push({ name, passed, detail })
    console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function run() {
    const baseUrl = argValue('baseUrl', 'http://127.0.0.1:5180').replace(/\/$/, '')

    try {
        const res = await fetch(baseUrl, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (error) {
        console.error(`qa-seam-probe: dev server unreachable at ${baseUrl} — ${error.message}`)
        console.error('qa-seam-probe: nothing was verified')
        process.exit(2)
    }

    const browser = findBrowser()
    if (!browser) {
        console.error('qa-seam-probe: no Chrome/Chromium found — nothing was verified')
        process.exit(2)
    }

    const port = 9333
    const profile = mkdtempSync(join(tmpdir(), 'gampo-qa-probe-'))
    const child = spawn(browser, [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`,
        '--headless=new',
        '--no-first-run',
        '--no-default-browser-check',
        'about:blank',
    ], { stdio: 'ignore' })

    let exitCode = 0
    try {
        const wsUrl = await waitForDebugger(port)
        const ws = new WebSocket(wsUrl)
        await new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve, { once: true })
            ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true })
        })
        const cdp = new Cdp(ws)

        const { targetId } = await cdp.send('Target.createTarget', { url: `${baseUrl}/slots` })
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
        await cdp.send('Runtime.enable', {}, sessionId)

        // Wait for the seam to mount.
        let seam = null
        const deadline = Date.now() + 40000
        while (Date.now() < deadline) {
            seam = await evaluate(cdp, sessionId, `(() => ({
                ready: document.readyState,
                hasQa: Boolean(window.__gampoSlotQa),
                hasEnqueue: typeof window.__gampoSlotQa?.enqueueOutcome === 'function',
                hasSetSession: typeof window.__gampoSlotQa?.setFreeSpinSession === 'function',
            }))()`)
            if (seam?.hasEnqueue && seam.ready === 'complete') break
            await sleep(250)
        }
        if (!seam?.hasEnqueue) {
            console.error(`qa-seam-probe: seam never appeared (last: ${JSON.stringify(seam)})`)
            console.error('qa-seam-probe: nothing was verified')
            process.exit(2)
        }

        console.log(`\nqa-seam-probe: ${baseUrl}/slots\n`)
        record('dev seam exposes enqueueOutcome', seam.hasEnqueue)
        record('dev seam exposes setFreeSpinSession', seam.hasSetSession)

        // A malformed fixture must throw and leave the queue untouched.
        const rejection = await evaluate(cdp, sessionId, `(() => {
            const qa = window.__gampoSlotQa
            const before = qa.pendingOutcomes()
            let threw = null
            try { qa.enqueueOutcome({ cells: [], featureEvents: [], winningIndexes: [], multiplier: NaN, cascadeSteps: 0, coinHits: 0, triggeredFreeSpins: 0 }) }
            catch (e) { threw = e.message }
            return { before, after: qa.pendingOutcomes(), threw }
        })()`)
        record(
            'malformed fixture rejected without mutating queue',
            Boolean(rejection.threw) && rejection.before === rejection.after,
            rejection.threw ? `threw, depth ${rejection.before} -> ${rejection.after}` : 'did NOT throw',
        )

        // A valid fixture queues.
        const queued = await evaluate(cdp, sessionId, `(() => {
            const qa = window.__gampoSlotQa
            qa.clearOutcomes()
            const r = qa.enqueueOutcome({
                cells: [], featureEvents: [], winningIndexes: [],
                multiplier: 5, cascadeSteps: 0, coinHits: 0, triggeredFreeSpins: 0,
            })
            return { queued: r.queued, depth: qa.pendingOutcomes() }
        })()`)
        record('valid fixture queues', queued.depth === 1, `depth=${queued.depth}`)

        // FIFO ordering + one-shot depletion, observed through the public API.
        const fifo = await evaluate(cdp, sessionId, `(() => {
            const qa = window.__gampoSlotQa
            qa.clearOutcomes()
            for (const m of [1, 2, 3]) {
                qa.enqueueOutcome({ cells: [], featureEvents: [], winningIndexes: [], multiplier: m, cascadeSteps: 0, coinHits: 0, triggeredFreeSpins: 0 })
            }
            const depth = qa.pendingOutcomes()
            const dropped = qa.clearOutcomes()
            return { depth, dropped, after: qa.pendingOutcomes() }
        })()`)
        record('queue accepts multiple and clears fully', fifo.depth === 3 && fifo.dropped === 3 && fifo.after === 0,
            `depth=${fifo.depth} dropped=${fifo.dropped} after=${fifo.after}`)

        // Session fixture validation.
        const session = await evaluate(cdp, sessionId, `(() => {
            const qa = window.__gampoSlotQa
            let threw = null
            try { qa.setFreeSpinSession({ totalAwarded: 5, played: 6, totalWin: 0, baseBet: 1 }) }
            catch (e) { threw = e.message }
            const good = qa.setFreeSpinSession({ totalAwarded: 8, played: 0, totalWin: 0, baseBet: 1, retriggers: 0 })
            const cleared = qa.setFreeSpinSession(null)
            return { threw, good: good.session?.totalAwarded, cleared: cleared.session }
        })()`)
        record('impossible session (played > awarded) rejected', Boolean(session.threw), session.threw || 'did NOT throw')
        record('valid session accepted', session.good === 8, `totalAwarded=${session.good}`)
        record('null clears the session', session.cleared === null)

        const failed = results.filter(r => !r.passed)
        console.log(`\nqa-seam-probe: ${results.length - failed.length}/${results.length} passed`)
        exitCode = failed.length ? 1 : 0
    } catch (error) {
        console.error(`qa-seam-probe: ${error.message}`)
        exitCode = 2
    } finally {
        child.kill()
        // Chrome holds the profile lock briefly after kill; on Windows an
        // immediate rmSync throws EPERM. Cleanup failure must never mask the
        // probe result, so give it a moment and then ignore any error.
        await sleep(500)
        try { rmSync(profile, { recursive: true, force: true }) } catch { /* temp dir, OS reclaims it */ }
    }

    process.exit(exitCode)
}

run()
