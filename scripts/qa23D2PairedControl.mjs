// §6.1 paired control: does a value written through CDP `DOMStorage` become
// visible to the renderer's own `localStorage.getItem`?
//
// The D-2 question is narrower than the whole import UI. `restoreGampoState`
// detects an independent change by re-reading the store and comparing
// (`src/utils/storage.js:230-232`). So the only thing that decides whether
// `native-conflict-diag-03` was a real cross-document staleness or a harness
// artifact is: after an external writer commits, does the importing document's
// next `getItem` observe it?
//
// Two arms, differing ONLY in how the external write is performed:
//   Arm 1 (CDP):      DOMStorage.setDOMStorageItem — reproduces the harness
//   Arm 2 (renderer): the same document's own localStorage.setItem
//
// Each arm is repeated. A single pass settles nothing: one green CDP run does
// not prove CDP is synchronously visible on every machine, and one red run does
// not exclude a rare race. This controls the SEEDING CHANNEL only. It does not
// test, and must not be cited about, crash atomicity, durability, other
// browsers, or D-1.
//
// Exit codes: 0 = both arms agreed with the renderer-visible model, 1 = they
// disagreed (see the report), 2 = harness failure.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

const REPEATS = Number(process.env.GAMPO_D2_REPEATS || 5)
const FLAGS = ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-features=MediaRouter,OptimizationHints', '--no-proxy-server', '--mute-audio', '--remote-debugging-port=0']
const browserPath = process.env.GAMPO_CHROMIUM || '/home/compute_01/.cache/ms-playwright/chromium-1187/chrome-linux/chrome'

class Cdp {
    constructor(url) { this.socket = new WebSocket(url); this.id = 0; this.pending = new Map() }
    async open() {
        await once(this.socket, 'open')
        this.socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data))
            const pending = this.pending.get(message.id)
            if (!pending) return
            this.pending.delete(message.id); clearTimeout(pending.timer)
            message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result)
        })
    }
    send(method, params = {}, sessionId) {
        const id = ++this.id
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout ${method}`)) }, 15000)
            this.pending.set(id, { resolve, reject, timer })
            this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
        })
    }
    close() { try { this.socket.close() } catch { /* already closed */ } }
}

const sleep = ms => new Promise(done => setTimeout(done, ms))
const until = async (fn, label, ms = 20000) => {
    const deadline = Date.now() + ms
    for (;;) {
        const value = await Promise.race([
            Promise.resolve().then(fn).catch(() => false),
            new Promise(resolve => setTimeout(() => resolve(false), Math.max(0, deadline - Date.now()))),
        ])
        if (value) return value
        if (Date.now() > deadline) throw new Error(`timeout waiting for ${label}`)
        await sleep(50)
    }
}
const evaluate = async (cdp, session, expression) => {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session)
    assert(!result.exceptionDetails, result.exceptionDetails?.exception?.description || result.exceptionDetails?.text)
    return result.result.value
}

const startedAt = Date.now()
const temp = await mkdtemp(join(tmpdir(), 'gampo-d2-control-'))
const profile = join(temp, 'profile')
await mkdir(profile)
// Outside `temp`: the report is evidence and must outlive cleanup.
const outDir = process.env.GAMPO_D2_OUT || join(process.cwd(), 'output', 'd2-paired-control')
await mkdir(outDir, { recursive: true })

let browser, cdp, server
const report = { arms: [], environment: {}, cleanup: { outDir } }

try {
    // A real same-origin page: an error page or opaque origin denies
    // localStorage entirely, which would test nothing.
    server = createServer((request, response) => {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        response.end('<!doctype html><meta charset="utf-8"><title>d2</title><body>d2 control</body>')
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const pageOrigin = `http://127.0.0.1:${server.address().port}`
    report.environment.pageOrigin = pageOrigin

    browser = spawn(browserPath, [...FLAGS, `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], detached: true })
    const port = await until(async () => {
        try { return Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]) } catch { return false }
    }, 'browser debugger')
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    report.environment.browser = version.Browser
    report.environment.browserLaunchedMs = Date.now() - startedAt
    report.environment.userAgent = version['User-Agent'] || null
    report.environment.protocolVersion = version['Protocol-Version'] || null
    cdp = new Cdp(version.webSocketDebuggerUrl)
    await cdp.open()

    // An opaque origin keeps the control off any real app storage. `data:` and
    // `about:blank` have their own storage; a blob-less blank page is enough for
    // a localStorage visibility question.
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.id, flatten: true })
    for (const method of ['Page.enable', 'Runtime.enable', 'DOMStorage.enable']) await cdp.send(method, {}, sessionId)
    // Navigate to a stable https-less origin so localStorage is permitted.
    await cdp.send('Page.navigate', { url: `${pageOrigin}/` }, sessionId)
    await until(async () => {
        try { return await evaluate(cdp, sessionId, 'location.protocol') === 'http:' } catch { return false }
    }, 'http origin for storage').catch(() => {})
    const origin = await evaluate(cdp, sessionId, 'location.origin')
    report.environment.origin = origin

    const storageId = { securityOrigin: origin, isLocalStorage: true }
    const getItem = key => evaluate(cdp, sessionId, `localStorage.getItem(${JSON.stringify(key)})`)

    const arm = async (name, write) => {
        const rows = []
        for (let attempt = 1; attempt <= REPEATS; attempt += 1) {
            const key = `d2_${name}_${attempt}`
            const value = `v${attempt}`
            // Known state: no key. Then the external writer commits.
            await evaluate(cdp, sessionId, `localStorage.removeItem(${JSON.stringify(key)})`)
            const writeAt = Date.now()
            await write(key, value)
            const seen = await getItem(key)
            rows.push({ attempt, key, wrote: value, readBack: seen, visible: seen === value, latencyMs: Date.now() - writeAt })
        }
        return { arm: name, repeats: REPEATS, rows, allVisible: rows.every(row => row.visible) }
    }

    // Arm 1 — CDP DOMStorage write, the channel the harness used.
    report.arms.push(await arm('cdp', async (key, value) => {
        await cdp.send('DOMStorage.setDOMStorageItem', { storageId, key, value }, sessionId)
    }))

    // Arm 3 — the S9 shape exactly: the key already EXISTS and the renderer has
    // already read it, then CDP overwrites it. A fresh key proves nothing about
    // a cached one, which is the case an importer actually hits.
    const cachedRows = []
    for (let attempt = 1; attempt <= REPEATS; attempt += 1) {
        const key = `d2_cached_${attempt}`
        const before = `old${attempt}`
        const after = `new${attempt}`
        await evaluate(cdp, sessionId, `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(before)})`)
        // Renderer reads it, so the value is genuinely in play.
        const firstRead = await getItem(key)
        await cdp.send('DOMStorage.setDOMStorageItem', { storageId, key, value: after }, sessionId)
        const secondRead = await getItem(key)
        const viaRemoval = await evaluate(cdp, sessionId, `(() => { const v = (${JSON.stringify(before)}); return v })()`)
        cachedRows.push({
            attempt, key, firstRead, wrote: after, secondRead,
            sawOld: secondRead === before,
            sawNew: secondRead === after,
            sentinel: viaRemoval,
        })
    }
    report.arms.push({ arm: 'cdp-over-cached-key', repeats: REPEATS, rows: cachedRows, allVisible: cachedRows.every(row => row.sawNew), sawStale: cachedRows.some(row => row.sawOld) })

    // Arm 2 — the renderer's own write, the control. Same document, same
    // storage, same instant of reading back; only the writer differs.
    report.arms.push(await arm('renderer', async (key, value) => {
        await evaluate(cdp, sessionId, `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)})`)
    }))

    await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {})
} finally {
    if (cdp) cdp.close()
    if (browser) { try { process.kill(-browser.pid, 'SIGKILL') } catch { /* gone */ } report.cleanup.browser = true }
    if (server) { server.close(); report.cleanup.server = true }
    await rm(temp, { recursive: true, force: true }).catch(() => {})
    report.cleanup.temp = true
}

const [cdpArm, cachedArm, rendererArm] = report.arms
report.environment.totalMs = Date.now() - startedAt
report.environment.attemptsRun = report.arms.reduce((sum, a) => sum + a.rows.length, 0)
report.conclusion = {
    cdpVisible: cdpArm.allVisible,
    cdpOverCachedKeyVisible: cachedArm.allVisible,
    cachedKeySawStaleValue: cachedArm.sawStale,
    rendererVisible: rendererArm.allVisible,
    channelDiffers: cdpArm.allVisible !== rendererArm.allVisible || !cachedArm.allVisible,
    interpretation: cdpArm.allVisible && rendererArm.allVisible
        ? cachedArm.sawStale
            ? 'A CDP write to an already-cached key was NOT observed on the next renderer read, while a fresh key and renderer writes were. This is the S9 shape: candidate A survives for cached keys and needs the UI-level trace.'
            : 'Both channels are visible for fresh AND already-cached keys. The S9 staleness was NOT a CDP seeding artifact; D-2 remains unexplained and needs the UI-level trace.'
        : !cdpArm.allVisible && rendererArm.allVisible
            ? 'CDP writes are not reliably visible to the renderer while renderer writes are. S9 staleness is consistent with a CDP seeding artifact; the hosted defect is still unproven either way.'
            : 'Unexpected: renderer writes also failed to read back. Treat the harness as invalid before drawing any conclusion.',
}

await writeFile(join(outDir, 'd2-paired-control.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 1))

if (!rendererArm.allVisible) {
    console.error('Control arm failed: renderer writes are not visible to the renderer. Harness invalid.')
    process.exit(2)
}
// Exit 1 = at least one CDP visibility arm disagreed with the renderer control.
process.exit(report.conclusion.channelDiffers ? 1 : 0)
