// Slots accounting browser probe — Phase 03 (slots-test-durability).
//
// Runs deterministic slots-accounting scenarios against the REAL committed
// accounting module inside a real browser, on the existing raw-CDP + native
// Node WebSocket stack. No dependency, no React fiber traversal, no module
// monkey-patching, no temporary dev-server patch.
//
// Scenario driver: Vite dev serves `src/components/games/slots/slotAccounting.js`
// as plain ESM, so a page-context dynamic import() gives us the same module the
// running app imports, including the real MAX_FREE_SPINS_PER_SESSION constant.
//
// Storage discipline: only `gampo_`-prefixed localStorage keys are ever written
// or removed. The snapshot is restored in `finally` and verified for SEMANTIC
// equality after a reload. Byte equality is intentionally NOT asserted: managed
// JSON values are compared as parsed data, non-JSON managed values as exact
// strings. A value that round-trips through JSON.parse/JSON.stringify may differ
// byte-for-byte (key order, whitespace, number formatting) while being
// semantically identical, so byte comparison would produce false failures.

import { existsSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { assertBaseReachable } from './pagePreflight.mjs'

const MANAGED_PREFIX = 'gampo_'
const ACCOUNTING_MODULE = '/src/components/games/slots/slotAccounting.js'
const CONSTANTS_MODULE = '/src/components/games/slots/slotConstants.js'
const SENTINEL_UNMANAGED_KEY = 'probe_unmanaged_sentinel'
const WATCHDOG_MS = 180000

const BROWSER_CANDIDATES = [
    'C:\\Users\\Admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

function sleep(ms) {
    return new Promise(done => setTimeout(done, ms))
}

function argValue(name, fallback) {
    const prefix = `--${name}=`
    const match = process.argv.find(arg => arg.startsWith(prefix))
    return match ? match.slice(prefix.length) : fallback
}

// ---------------------------------------------------------------------------
// Pure semantic comparator (browser-independent; unit-tested natively)
// ---------------------------------------------------------------------------

/** Classify one raw stored string as parsed JSON or an opaque exact string. */
export function semanticValue(value) {
    if (typeof value !== 'string') return { kind: 'absent', value: null }
    try {
        return { kind: 'json', value: JSON.parse(value) }
    } catch {
        return { kind: 'string', value }
    }
}

function managedEntries(entries) {
    return Object.entries(entries || {})
        .filter(([key]) => key.startsWith(MANAGED_PREFIX))
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
}

/** Managed-only, key-sorted semantic view of a raw storage snapshot. */
export function semanticSnapshot(entries) {
    return Object.fromEntries(managedEntries(entries).map(([key, value]) => [key, semanticValue(value)]))
}

/** Managed keys present in a raw storage snapshot, sorted. */
export function managedKeys(entries) {
    return managedEntries(entries).map(([key]) => key)
}

/**
 * Compare two raw storage snapshots over managed keys only.
 * - managed key SET must match exactly
 * - JSON values compare by parsed deep equality
 * - non-JSON values compare as exact strings
 * Serialized bytes are never compared after a parse/stringify transformation.
 */
export function compareManagedStorage(left, right) {
    const leftKeys = managedKeys(left)
    const rightKeys = managedKeys(right)
    const missing = leftKeys.filter(key => !rightKeys.includes(key))
    const unexpected = rightKeys.filter(key => !leftKeys.includes(key))
    const mismatched = []

    for (const key of leftKeys) {
        if (!rightKeys.includes(key)) continue
        const a = semanticValue(left[key])
        const b = semanticValue(right[key])
        const same = a.kind === b.kind
            && (a.kind === 'string' ? a.value === b.value : isDeepStrictEqual(a.value, b.value))
        if (!same) mismatched.push({ key, kind: [a.kind, b.kind], before: a.value, after: b.value })
    }

    return {
        equal: missing.length === 0 && unexpected.length === 0 && mismatched.length === 0,
        keySetEqual: missing.length === 0 && unexpected.length === 0,
        missing,
        unexpected,
        mismatched,
        comparedKeys: leftKeys,
        byteEqualityAsserted: false,
    }
}

/** Boolean convenience wrapper over compareManagedStorage. */
export function equalSemanticManagedStorage(left, right) {
    return compareManagedStorage(left, right).equal
}

/** Compare non-managed keys as exact strings — used to prove C3 (no collateral mutation). */
export function compareUnmanagedStorage(left, right) {
    const pick = entries => Object.fromEntries(Object.entries(entries || {}).filter(([key]) => !key.startsWith(MANAGED_PREFIX)))
    const before = pick(left)
    const after = pick(right)
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    const changed = keys.filter(key => before[key] !== after[key])
    return {
        equal: changed.length === 0,
        changed,
        keySetBefore: Object.keys(before).sort(),
        keySetAfter: Object.keys(after).sort(),
    }
}

// ---------------------------------------------------------------------------
// Raw CDP client (native WebSocket, no dependency)
// ---------------------------------------------------------------------------

function findBrowser() {
    const explicit = argValue('browser', '')
    if (explicit) {
        if (!existsSync(explicit)) throw new Error(`Browser not found at --browser=${explicit}`)
        return explicit
    }
    const found = BROWSER_CANDIDATES.find(existsSync)
    if (!found) throw new Error('Chrome/Edge executable not found. Pass --browser=/absolute/path.')
    return found
}

async function waitForDebugger(port, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/version`)
            if (response.ok) return await response.json()
        } catch {
            // browser still starting
        }
        await sleep(120)
    }
    throw new Error(`Timed out waiting for raw CDP debugger on 127.0.0.1:${port}`)
}

class CdpClient {
    constructor(url) {
        this.ws = new WebSocket(url)
        this.nextId = 1
        this.pending = new Map()
        this.events = []
        this.closed = false
    }

    async open() {
        await new Promise((done, fail) => {
            const onOpen = () => done()
            const onError = () => fail(new Error('CDP WebSocket failed to open'))
            this.ws.addEventListener('open', onOpen, { once: true })
            this.ws.addEventListener('error', onError, { once: true })
        })
        this.ws.addEventListener('close', () => {
            this.closed = true
            for (const [, pending] of this.pending) pending.reject(new Error('CDP WebSocket closed'))
            this.pending.clear()
        })
        this.ws.addEventListener('message', event => {
            const message = JSON.parse(String(event.data))
            if (message.id && this.pending.has(message.id)) {
                const { resolve: done, reject: fail } = this.pending.get(message.id)
                this.pending.delete(message.id)
                if (message.error) fail(new Error(message.error.message || JSON.stringify(message.error)))
                else done(message.result)
                return
            }
            if (message.method) this.events.push(message)
        })
    }

    send(method, params = {}, sessionId) {
        if (this.closed) return Promise.reject(new Error(`CDP closed before ${method}`))
        const id = this.nextId++
        this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }))
        return new Promise((done, fail) => {
            this.pending.set(id, { resolve: done, reject: fail })
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id)
                    fail(new Error(`CDP command timed out: ${method}`))
                }
            }, 20000)
        })
    }

    drain(sessionId) {
        const selected = this.events.filter(event => event.sessionId === sessionId)
        this.events = this.events.filter(event => event.sessionId !== sessionId)
        return selected
    }

    close() {
        try { this.ws.close() } catch { /* best effort */ }
    }
}

async function evaluate(client, sessionId, expression) {
    const result = await client.send(
        'Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true },
        sessionId,
    )
    if (result.exceptionDetails) {
        const detail = result.exceptionDetails
        throw new Error(`Page evaluation threw: ${detail.exception?.description || detail.text}`)
    }
    return result.result?.value
}

const READ_ALL_STORAGE = `Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]))`

async function waitForSlotsQa(client, sessionId, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs
    let lastSeen = null
    while (Date.now() < deadline) {
        lastSeen = await evaluate(client, sessionId, `(() => ({
            ready: document.readyState,
            qa: Boolean(window.__gampoSlotQa && typeof window.__gampoSlotQa.forceBonusState === 'function'),
            keys: Object.keys(window.__gampoSlotQa || {}).sort(),
        }))()`)
        if (lastSeen?.qa && lastSeen.ready === 'complete') return lastSeen
        await sleep(150)
    }
    throw new Error(`Missing QA precondition window.__gampoSlotQa.forceBonusState() after /slots render (last seen: ${JSON.stringify(lastSeen)})`)
}

function collectPageErrors(client, sessionId) {
    return client.drain(sessionId)
        .filter(event => event.method === 'Runtime.exceptionThrown'
            || (event.method === 'Runtime.consoleAPICalled' && event.params?.type === 'error')
            || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error'))
        .map(event => event.params?.exceptionDetails?.text
            || event.params?.entry?.text
            || (event.params?.args || []).map(arg => arg.value ?? arg.description ?? '').join(' ')
            || event.method)
        // Vite dev sourcemap/HMR noise is not a probe failure signal.
        .filter(text => text && !/favicon|sourcemap/i.test(text))
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

/**
 * Runs the five deterministic scenarios inside the page against the REAL
 * committed accounting module, imported dynamically from the Vite dev server.
 * Expectations are asserted in-page and re-checked here.
 */
const SCENARIO_SCRIPT = `(async () => {
    const accounting = await import(${JSON.stringify(ACCOUNTING_MODULE)})
    const constants = await import(${JSON.stringify(CONSTANTS_MODULE)})
    const { applyFreeSpinAward, shouldStopAutoplay } = accounting
    const cap = constants.MAX_FREE_SPINS_PER_SESSION
    const noStops = {
        stopOnFeature: false, stopOnBigWin: false, stopOnLoss: false, stopOnGain: false,
        stopOnLossAbs: false, stopOnGainAbs: false, stopOnSingleWin: false,
    }
    const live = window.__gampoSlotQa.forceBonusState()
    const scenarios = []

    // B1 — near-cap: totalAwarded 18, raw award 12 -> award 2 (cap 20).
    {
        const session = { totalAwarded: 18, played: 1 }
        const actual = applyFreeSpinAward(session, 12)
        scenarios.push({
            id: 'B1-near-cap-plus-2',
            description: 'totalAwarded 18 with raw award 12 yields exactly +2 at the session cap',
            driver: 'real-module-in-browser',
            uiDriven: false,
            inputs: { session, rawAward: 12, cap },
            expected: { award: 2 },
            actual: { award: actual },
            passed: actual === 2 && cap === 20,
        })
    }

    // B2 — exhausted suppression: totalAwarded 20, raw 12 -> no award, no retrigger claim.
    {
        const session = { totalAwarded: 20, played: 5 }
        const award = applyFreeSpinAward(session, 12)
        // Mirrors SlotsGame.jsx:733-736 — a zero award drops the free-spins event
        // entirely, so no retrigger/award is claimed to the player.
        const rawEvents = [{ type: 'free-spins', freeSpins: 12 }, { type: 'retrigger', amount: 5 }]
        const displayed = rawEvents.flatMap(event => {
            if (event.type !== 'free-spins') return [event]
            return award > 0 ? [{ ...event, freeSpins: award }] : []
        })
        const claimsFreeSpins = displayed.some(event => event.type === 'free-spins')
        scenarios.push({
            id: 'B2-exhausted-suppression',
            description: 'totalAwarded 20 with raw award 12 adds nothing and claims no free-spin award',
            driver: 'real-module-in-browser',
            uiDriven: false,
            inputs: { session, rawAward: 12, cap, rawEvents },
            expected: { award: 0, claimsFreeSpins: false },
            actual: { award, claimsFreeSpins, displayed },
            passed: award === 0 && claimsFreeSpins === false,
        })
    }

    // B3a — settled absolute-loss stop (settled balance, not mid-spin balance).
    {
        const input = {
            baseline: 100,
            settledBalance: 90,
            outcome: { profit: -10, featureEvents: [], multiplier: 0 },
            stops: { ...noStops, stopOnLossAbs: true, lossAbs: 10 },
        }
        const stopped = shouldStopAutoplay(input)
        const nearMiss = shouldStopAutoplay({ ...input, settledBalance: 91, outcome: { profit: -9, featureEvents: [], multiplier: 0 } })
        scenarios.push({
            id: 'B3a-settled-absolute-loss-stop',
            description: 'settled net -10 trips stopOnLossAbs 10 while net -9 does not',
            driver: 'real-module-in-browser',
            uiDriven: false,
            inputs: input,
            expected: { stopped: true, nearMissStopped: false },
            actual: { stopped, nearMissStopped: nearMiss },
            passed: stopped === true && nearMiss === false,
        })
    }

    // B3b — settled absolute-gain stop.
    {
        const input = {
            baseline: 100,
            settledBalance: 115,
            outcome: { profit: 15, featureEvents: [], multiplier: 0 },
            stops: { ...noStops, stopOnGainAbs: true, gainAbs: 15 },
        }
        const stopped = shouldStopAutoplay(input)
        const nearMiss = shouldStopAutoplay({ ...input, settledBalance: 114, outcome: { profit: 14, featureEvents: [], multiplier: 0 } })
        scenarios.push({
            id: 'B3b-settled-absolute-gain-stop',
            description: 'settled net +15 trips stopOnGainAbs 15 while net +14 does not',
            driver: 'real-module-in-browser',
            uiDriven: false,
            inputs: input,
            expected: { stopped: true, nearMissStopped: false },
            actual: { stopped, nearMissStopped: nearMiss },
            passed: stopped === true && nearMiss === false,
        })
    }

    // B4 — unchanged non-monetary feature stop, driven by LIVE feature events
    // produced by the running component via forceBonusState().
    {
        const featureEvents = live.featureEvents
        const input = {
            baseline: 100,
            settledBalance: 100,
            outcome: { profit: 0, multiplier: 0, featureEvents },
            stops: { ...noStops, stopOnFeature: true },
        }
        const stopped = shouldStopAutoplay(input)
        const monetaryStopsIdle = shouldStopAutoplay({
            baseline: 100,
            settledBalance: 100,
            outcome: { profit: 0, multiplier: 0, featureEvents },
            stops: { ...noStops, stopOnLossAbs: true, lossAbs: 10, stopOnGainAbs: true, gainAbs: 10 },
        })
        scenarios.push({
            id: 'B4-non-monetary-feature-stop',
            description: 'live feature events trip stopOnFeature at zero net change and leave monetary stops idle',
            driver: 'real-module-in-browser + live forceBonusState() feature events',
            uiDriven: false,
            inputs: { baseline: 100, settledBalance: 100, net: 0, featureEventTypes: featureEvents.map(e => e.type) },
            expected: { stopped: true, monetaryStopsIdle: false },
            actual: { stopped, monetaryStopsIdle },
            passed: stopped === true && monetaryStopsIdle === false && featureEvents.length > 0,
        })
    }

    return {
        cap,
        moduleExports: Object.keys(accounting).sort(),
        qaObservable: {
            templateId: live.templateId,
            featureEventTypes: live.featureEvents.map(event => event.type),
            qaKeys: Object.keys(window.__gampoSlotQa || {}).sort(),
            visibleText: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 400),
        },
        scenarios,
    }
})()`

/** Perturb managed storage so the restore assertion is non-vacuous, and plant an unmanaged sentinel. */
const PERTURB_SCRIPT = `(() => {
    const managed = Object.keys(localStorage).filter(key => key.startsWith(${JSON.stringify(MANAGED_PREFIX)})).sort()
    const mutated = managed[0] ?? null
    if (mutated) localStorage.setItem(mutated, JSON.stringify({ probeMutated: true, at: Date.now() }))
    const removed = managed[1] ?? null
    if (removed) localStorage.removeItem(removed)
    const added = 'gampo_probe_injected_key'
    localStorage.setItem(added, JSON.stringify({ injectedByProbe: true }))
    localStorage.setItem(${JSON.stringify(SENTINEL_UNMANAGED_KEY)}, 'must-survive-restore-untouched')
    return { mutated, removed, added, sentinel: ${JSON.stringify(SENTINEL_UNMANAGED_KEY)} }
})()`

function buildRestoreScript(snapshot) {
    return `(() => {
        const snapshot = ${JSON.stringify(snapshot)}
        const prefix = ${JSON.stringify(MANAGED_PREFIX)}
        const removed = []
        const written = []
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith(prefix) && !Object.prototype.hasOwnProperty.call(snapshot, key)) {
                localStorage.removeItem(key)
                removed.push(key)
            }
        }
        for (const [key, value] of Object.entries(snapshot)) {
            localStorage.setItem(key, value)
            written.push(key)
        }
        return { removed: removed.sort(), written: written.sort(), touchedOnlyManaged: [...removed, ...written].every(key => key.startsWith(prefix)) }
    })()`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
    const baseUrl = argValue('baseUrl', 'http://127.0.0.1:5180').replace(/\/$/, '')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const outputPath = resolve(argValue('out', join('output', `slots-accounting-probe-${stamp}.json`)))
    const browser = findBrowser()
    const debuggerPort = Number(argValue('debuggerPort', String(9400 + Math.floor(Math.random() * 400))))
    const profile = join(tmpdir(), `gampo-slots-accounting-${process.pid}-${Date.now()}`)

    const report = {
        phase: 'phase-03-reproducible-browser-probe',
        generatedAt: new Date().toISOString(),
        baseUrl,
        browser,
        automation: 'raw CDP over native Node WebSocket (no dependency)',
        managedPrefix: MANAGED_PREFIX,
        scenarioDriver: {
            technique: `page-context dynamic import() of ${ACCOUNTING_MODULE} served by Vite dev`,
            prohibitedTechniquesUsed: [],
            note: 'The real committed accounting module runs in the real browser. No React fiber traversal, no module monkey-patching, no temporary dev-server patch, no dependency.',
        },
        byteEqualityAsserted: false,
        byteEqualityNote: 'Byte equality is intentionally NOT asserted. Managed JSON values compare as parsed data; non-JSON managed values compare as exact strings. A JSON value round-tripped through parse/stringify can differ byte-for-byte (key order, whitespace, number formatting) while being semantically identical, so a byte assertion would report false failures.',
        coverage: {
            uiDrivenEndToEnd: false,
            uiDrivenNote: 'Scenarios reach the accounting decision layer in the real browser runtime. Driving a forced spin outcome end-to-end and reading the capped award / autoplay stop back off the rendered UI still requires a deterministic resolver injection seam (Phase 04).',
        },
        scenarios: [],
        unreachableScenarios: [],
        pageErrors: [],
        storage: {},
        restoration: { attempted: false, status: 'not-run' },
        errors: [],
        result: 'not-run',
    }

    let client
    let targetId
    let sessionId
    let browserProc
    let originalFailure
    let snapshotBefore = null
    let allBefore = null

    try {
        await assertBaseReachable(baseUrl)

        browserProc = spawn(browser, [
            '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
            '--mute-audio', '--disable-extensions', '--disable-background-networking',
            '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debuggerPort}`,
            `--user-data-dir=${profile}`, 'about:blank',
        ], { stdio: 'ignore' })
        report.browserPid = browserProc.pid

        const version = await waitForDebugger(debuggerPort)
        report.browserVersion = version.Browser
        client = new CdpClient(version.webSocketDebuggerUrl)
        await client.open()
        ;({ targetId } = await client.send('Target.createTarget', { url: 'about:blank' }))
        ;({ sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true }))
        await client.send('Page.enable', {}, sessionId)
        await client.send('Runtime.enable', {}, sessionId)
        await client.send('Log.enable', {}, sessionId)

        await client.send('Page.navigate', { url: `${baseUrl}/slots` }, sessionId)
        const qaReady = await waitForSlotsQa(client, sessionId)
        report.qaPrecondition = qaReady

        allBefore = await evaluate(client, sessionId, READ_ALL_STORAGE)
        snapshotBefore = Object.fromEntries(managedEntries(allBefore))
        report.storage = {
            managedKeysBefore: Object.keys(snapshotBefore).sort(),
            unmanagedKeysBefore: Object.keys(allBefore).filter(key => !key.startsWith(MANAGED_PREFIX)).sort(),
            managedSemanticBefore: semanticSnapshot(allBefore),
        }

        // Perturb managed storage and plant the unmanaged sentinel BEFORE the
        // scenarios run. Doing it first means the restore verification in
        // `finally` is non-vacuous on the failure path too, not just on success.
        report.storage.perturbation = await evaluate(client, sessionId, PERTURB_SCRIPT)

        const outcome = await evaluate(client, sessionId, SCENARIO_SCRIPT)
        report.accountingCap = outcome.cap
        report.moduleExports = outcome.moduleExports
        report.qaObservable = outcome.qaObservable
        report.scenarios = outcome.scenarios
        report.unreachableScenarios = [{
            id: 'end-to-end-ui-observed-award-and-stop',
            status: 'unreachable-without-phase-04',
            reason: 'forceBonusState() accepts no inputs and always installs totalAwarded=8; there is no seam to force a deterministic spin outcome, so a capped award and an autoplay stop cannot be observed off the rendered UI without the Phase 04 resolver injection seam.',
            wouldRequire: 'deterministic resolver injection seam (Phase 04)',
        }]

        report.pageErrors = collectPageErrors(client, sessionId)

        const failed = report.scenarios.filter(scenario => !scenario.passed)
        if (report.scenarios.length !== 5) {
            throw new Error(`Expected 5 scenario results, received ${report.scenarios.length}`)
        }
        if (failed.length > 0) {
            throw new Error(`Scenario failure: ${failed.map(scenario => scenario.id).join(', ')}`)
        }
        if (report.pageErrors.length > 0) {
            throw new Error(`Page reported ${report.pageErrors.length} error(s): ${report.pageErrors.join(' | ')}`)
        }
    } catch (error) {
        originalFailure = error
        report.errors.push({ stage: 'probe', message: error.message })
    } finally {
        // C1 — restoration runs on success AND failure.
        try {
            if (!client || !sessionId || !snapshotBefore || !allBefore) {
                throw new Error('Restoration precondition missing: storage was never snapshotted')
            }
            report.restoration.attempted = true
            const applied = await evaluate(client, sessionId, buildRestoreScript(snapshotBefore))

            // C2 — re-read after a real reload, not just after the write.
            await client.send('Page.reload', { ignoreCache: true }, sessionId)
            await waitForSlotsQa(client, sessionId)
            const allAfter = await evaluate(client, sessionId, READ_ALL_STORAGE)

            const managed = compareManagedStorage(allBefore, allAfter)
            // C3 — the sentinel is unmanaged and planted by the probe, so it must
            // still be present and untouched; every other unmanaged key must be
            // byte-identical to the pre-probe reading.
            const sentinelPresent = allAfter[SENTINEL_UNMANAGED_KEY] === 'must-survive-restore-untouched'
            const unmanaged = compareUnmanagedStorage(
                { ...allBefore, [SENTINEL_UNMANAGED_KEY]: 'must-survive-restore-untouched' },
                allAfter,
            )

            report.restoration = {
                attempted: true,
                status: managed.equal && unmanaged.equal && sentinelPresent ? 'passed' : 'failed',
                appliedRestore: applied,
                reloadedBeforeCompare: true,
                managedComparison: managed,
                managedSemanticBefore: semanticSnapshot(allBefore),
                managedSemanticAfter: semanticSnapshot(allAfter),
                unmanagedComparison: unmanaged,
                unmanagedSentinelPreserved: sentinelPresent,
                byteEqualityAsserted: false,
                proof: [
                    'Restore only removes/writes keys with the gampo_ prefix (see appliedRestore.touchedOnlyManaged).',
                    'Managed storage was deliberately perturbed (mutate + delete + add) before restore, so equality is not vacuous.',
                    'A non-gampo_ sentinel key planted before restore is still present and unchanged afterwards.',
                    'All other non-gampo_ keys are exact-string compared before and after.',
                ],
            }

            if (!applied.touchedOnlyManaged) throw new Error('Restore path touched a non-managed key')
            if (!sentinelPresent) throw new Error('Restore path destroyed the unmanaged sentinel key')
            if (!unmanaged.equal) throw new Error(`Restore path mutated non-managed keys: ${unmanaged.changed.join(', ')}`)
            if (!managed.equal) {
                throw new Error(`Managed semantic restore mismatch: missing=[${managed.missing}] unexpected=[${managed.unexpected}] mismatched=[${managed.mismatched.map(item => item.key)}]`)
            }
        } catch (error) {
            report.errors.push({ stage: 'restore', message: error.message })
            report.restoration.status = 'failed'
            if (originalFailure) report.restorationFailure = error.message
            else originalFailure = error
        }

        // C4 — tear down ONLY the browser this probe spawned. No broad process kill.
        try { if (client && targetId) await client.send('Target.closeTarget', { targetId }) } catch { /* best effort */ }
        try { if (client) await client.send('Browser.close') } catch { /* best effort */ }
        client?.close()
        try { browserProc?.kill() } catch { /* best effort */ }
        report.teardown = {
            killedPids: browserProc?.pid ? [browserProc.pid] : [],
            note: 'Only the browser process spawned by this probe is terminated. The Vite dev server is launcher-owned and is never started or stopped here.',
        }

        report.result = originalFailure ? 'failed' : 'passed'
        if (originalFailure) report.failureReason = originalFailure.message
        await mkdir(resolve(outputPath, '..'), { recursive: true })
        await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
        console.log(`Slots accounting probe evidence: ${outputPath}`)
    }

    if (originalFailure) throw originalFailure

    for (const scenario of report.scenarios) console.log(`  PASS ${scenario.id}`)
    for (const scenario of report.unreachableScenarios) console.log(`  UNREACHABLE ${scenario.id} — ${scenario.wouldRequire}`)
    console.log('Managed gampo_ storage semantically restored after reload (byte equality intentionally unasserted).')
}

const invokedDirectly = process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (invokedDirectly) {
    // The cancelled first attempt hung; a watchdog guarantees a fail-closed exit.
    const watchdog = setTimeout(() => {
        console.error(`Slots accounting probe exceeded ${WATCHDOG_MS}ms watchdog; failing closed.`)
        process.exit(1)
    }, WATCHDOG_MS)
    watchdog.unref()

    run().then(() => {
        clearTimeout(watchdog)
        process.exit(0)
    }).catch(error => {
        clearTimeout(watchdog)
        console.error(`Slots accounting probe FAILED: ${error.message}`)
        process.exit(1)
    })
}
