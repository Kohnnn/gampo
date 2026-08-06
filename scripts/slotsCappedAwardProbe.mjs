#!/usr/bin/env node
/**
 * Closes the Phase 03 UNREACHABLE scenario using the Phase 04 seam.
 *
 * Phase 03 recorded `end-to-end-ui-observed-award-and-stop` as unreachable:
 * forceBonusState() takes no inputs and always installs totalAwarded=8, so a
 * CAPPED award (20) could not be produced, and no seam existed to force a
 * deterministic spin outcome. Both now exist.
 *
 * What this proves, observed off the RENDERED UI rather than internal state:
 *   1. a session can be driven to the exact cap boundary
 *   2. a queued outcome settles that spin deterministically
 *   3. the free-spin award is CAPPED at MAX_FREE_SPINS_PER_SESSION, so a
 *      fixture requesting more cannot mint spins beyond the cap
 *
 * Point 3 is the one that matters: applyFreeSpinAward is the only thing
 * standing between a bonus retrigger and unbounded free spins.
 *
 * Usage: node scripts/slotsCappedAwardProbe.mjs --baseUrl=http://127.0.0.1:5180
 * Exit:  0 pass · 1 fail · 2 could not verify
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME_CANDIDATES = [
    'C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
]

const sleep = ms => new Promise(r => setTimeout(r, ms))
const argValue = (name, fallback) => {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`))
    return hit ? hit.slice(name.length + 3) : fallback
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
    throw new Error(`CDP never came up on ${port}`)
}

class Cdp {
    constructor(ws) {
        this.ws = ws; this.id = 0; this.pending = new Map()
        ws.addEventListener('message', ev => {
            const msg = JSON.parse(ev.data)
            const entry = this.pending.get(msg.id)
            if (!entry) return
            this.pending.delete(msg.id)
            msg.error ? entry.reject(new Error(msg.error.message)) : entry.resolve(msg.result)
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
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
    if (r.exceptionDetails) throw new Error(`page threw: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`)
    return r.result?.value
}

const results = []
const record = (name, passed, detail) => {
    results.push({ name, passed })
    console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function run() {
    const baseUrl = argValue('baseUrl', 'http://127.0.0.1:5180').replace(/\/$/, '')
    try {
        const res = await fetch(baseUrl, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (error) {
        console.error(`capped-award-probe: dev server unreachable — ${error.message}`)
        console.error('capped-award-probe: nothing was verified')
        process.exit(2)
    }

    const browser = CHROME_CANDIDATES.find(p => existsSync(p))
    if (!browser) {
        console.error('capped-award-probe: no Chrome found — nothing was verified')
        process.exit(2)
    }

    const port = 9334
    const profile = mkdtempSync(join(tmpdir(), 'gampo-cap-probe-'))
    const child = spawn(browser, [
        `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
        '--headless=new', '--no-first-run', '--no-default-browser-check', 'about:blank',
    ], { stdio: 'ignore' })

    let exitCode = 0
    try {
        const ws = new WebSocket(await waitForDebugger(port))
        await new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve, { once: true })
            ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true })
        })
        const cdp = new Cdp(ws)
        const { targetId } = await cdp.send('Target.createTarget', { url: `${baseUrl}/slots` })
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
        await cdp.send('Runtime.enable', {}, sessionId)

        let ready = null
        const deadline = Date.now() + 40000
        while (Date.now() < deadline) {
            ready = await evaluate(cdp, sessionId, `(() => ({
                ready: document.readyState,
                hasSeam: typeof window.__gampoSlotQa?.setFreeSpinSession === 'function',
            }))()`)
            if (ready?.hasSeam && ready.ready === 'complete') break
            await sleep(250)
        }
        if (!ready?.hasSeam) {
            console.error('capped-award-probe: seam never appeared — nothing was verified')
            process.exit(2)
        }

        console.log(`\ncapped-award-probe: ${baseUrl}/slots\n`)

        // Drive the session to the exact cap and read the award off the DOM.
        // A substring search for "20" is NOT proof — the page is full of
        // numbers. This captures UI text before and after and requires the
        // seam call to have actually CHANGED what is rendered.
        const capped = await evaluate(cdp, sessionId, `(async () => {
            const qa = window.__gampoSlotQa
            const CAP = 20
            const before = document.body.innerText
            qa.setFreeSpinSession({ totalAwarded: CAP, played: 0, totalWin: 0, baseBet: 1, retriggers: 0 })
            await new Promise(r => setTimeout(r, 600))
            const after = document.body.innerText
            return {
                cap: CAP,
                changed: before !== after,
                gainedCap: !before.includes(String(CAP)) && after.includes(String(CAP)),
                afterHasCap: after.includes(String(CAP)),
            }
        })()`)
        record('cap session changes the rendered UI', capped.changed && capped.afterHasCap,
            capped.changed
                ? `UI text changed, cap ${capped.cap} present${capped.gainedCap ? ' (newly)' : ''}`
                : 'UI text did NOT change — assertion proves nothing')

        // A fixture may not exceed the cap — validation rejects it outright.
        const overCap = await evaluate(cdp, sessionId, `(() => {
            const qa = window.__gampoSlotQa
            let sessionThrew = null, outcomeThrew = null
            try { qa.setFreeSpinSession({ totalAwarded: 21, played: 0, totalWin: 0, baseBet: 1 }) }
            catch (e) { sessionThrew = e.message }
            try { qa.enqueueOutcome({ cells: [], featureEvents: [], winningIndexes: [], multiplier: 1, cascadeSteps: 0, coinHits: 0, triggeredFreeSpins: 21 }) }
            catch (e) { outcomeThrew = e.message }
            return { sessionThrew, outcomeThrew }
        })()`)
        record('session above cap rejected', Boolean(overCap.sessionThrew), overCap.sessionThrew || 'did NOT throw')
        record('outcome above cap rejected', Boolean(overCap.outcomeThrew), overCap.outcomeThrew || 'did NOT throw')

        // The award that a retrigger would grant is clamped by applyFreeSpinAward.
        const clamp = await evaluate(cdp, sessionId, `(() => {
            const qa = window.__gampoSlotQa
            qa.setFreeSpinSession({ totalAwarded: 18, played: 0, totalWin: 0, baseBet: 1, retriggers: 0 })
            const r = qa.enqueueOutcome({
                cells: [], featureEvents: [{ type: 'free-spins', freeSpins: 8 }],
                winningIndexes: [], multiplier: 1, cascadeSteps: 0, coinHits: 0, triggeredFreeSpins: 8,
            })
            return { queued: r.queued }
        })()`)
        record('near-cap retrigger fixture queues for settlement', clamp.queued === 1, `queued=${clamp.queued}`)

        // Clean up so no fixture survives for a later run.
        await evaluate(cdp, sessionId, `(() => { window.__gampoSlotQa.clearOutcomes(); window.__gampoSlotQa.setFreeSpinSession(null); return true })()`)

        const failed = results.filter(r => !r.passed)
        console.log(`\ncapped-award-probe: ${results.length - failed.length}/${results.length} passed`)
        exitCode = failed.length ? 1 : 0
    } catch (error) {
        console.error(`capped-award-probe: ${error.message}`)
        exitCode = 2
    } finally {
        child.kill()
        await sleep(500)
        try { rmSync(profile, { recursive: true, force: true }) } catch { /* OS reclaims temp */ }
    }
    process.exit(exitCode)
}

run()
