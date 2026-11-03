// D-1 cross-document probe: two real browser documents, same origin, real
// CreditProvider. A single-heap unit test cannot prove cross-document
// localStorage behaviour, so this drives actual tabs through CDP.
//
// Temporary scaffold for the D-1 verification run; deleted with the probe page.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const FLAGS = ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-features=MediaRouter,OptimizationHints', '--no-proxy-server', '--mute-audio', '--remote-debugging-port=0']
const PAGE = '/qa23-d1-probe.html'

class Cdp {
    constructor(url) { this.socket = new WebSocket(url); this.id = 0; this.pending = new Map(); this.handlers = [] }
    async open() {
        await once(this.socket, 'open')
        this.socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data))
            if (message.method === 'Runtime.exceptionThrown') this.handlers?.forEach(h => h(message))
            const pending = this.pending.get(message.id)
            if (!pending) return
            this.pending.delete(message.id); clearTimeout(pending.timer)
            message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result)
        })
    }
    send(method, params = {}, sessionId) {
        const id = ++this.id
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout ${method}`)) }, 20000)
            this.pending.set(id, { resolve, reject, timer })
            this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
        })
    }
    close() { try { this.socket.close() } catch { /* already closed */ } }
}

const until = async (fn, label, ms = 30000) => {
    const deadline = Date.now() + ms
    for (;;) {
        const value = await fn()
        if (value) return value
        if (Date.now() > deadline) throw new Error(`timeout waiting for ${label}`)
        await new Promise(done => setTimeout(done, 100))
    }
}

const evaluate = async (cdp, session, expression) => {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session)
    assert(!result.exceptionDetails, result.exceptionDetails?.exception?.description || result.exceptionDetails?.text)
    return result.result.value
}

const browserPath = process.env.GAMPO_CHROMIUM || '/home/compute_01/.cache/ms-playwright/chromium-1187/chrome-linux/chrome'

const temp = await mkdtemp(join(tmpdir(), 'gampo-d1-probe-'))
const profile = join(temp, 'profile')
let vite, browser, cdp
const report = { rows: [], cleanup: { vite: false, browser: false, temp: false } }
const cdpErrors = new Map()

try {
    vite = spawn('npx', ['vite', '--port', '5199', '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] })
    let viteLog = ''
    vite.stdout.on('data', d => { viteLog += d })
    vite.stderr.on('data', d => { viteLog += d })
    await until(async () => viteLog.includes('5199') || viteLog.includes('ready in'), 'vite dev server')
    const origin = 'http://127.0.0.1:5199'

    browser = spawn(browserPath, [...FLAGS, `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
    let browserLog = ''
    browser.stderr.on('data', d => { browserLog += d })
    const port = await until(async () => {
        try { return Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]) } catch { return false }
    }, 'browser debugger')
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    cdp = new Cdp(version.webSocketDebuggerUrl)
    await cdp.open()
    cdp.handlers.push(message => {
        const list = cdpErrors.get(message.sessionId)
        if (list) list.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text)
    })
    report.browser = version.Browser

    const openTab = async (name) => {
        const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.id, flatten: true })
        await cdp.send('Runtime.enable', {}, sessionId)
        await cdp.send('Page.enable', {}, sessionId)
        const errors = []
        cdpErrors.set(sessionId, errors)
        await cdp.send('Page.navigate', { url: origin + PAGE }, sessionId)
        try {
            await until(async () => {
                try { return await evaluate(cdp, sessionId, 'Boolean(window.__probe && window.__probe.ready())') } catch { return false }
            }, `${name} probe ready`, 20000)
        } catch (error) {
            const dump = await evaluate(cdp, sessionId, 'document.body.innerText.slice(0,600)').catch(() => '(no body)')
            throw new Error(`${error.message}\nconsole: ${JSON.stringify(errors)}\nbody: ${dump}`)
        }
        return { name, sessionId, targetId: target.id }
    }

    const tabA = await openTab('A')
    const tabB = await openTab('B')

    // Seed once through a document, then stake in A.
    await evaluate(cdp, tabA.sessionId, 'window.__probe.seed(1000)')
    const aFirst = await evaluate(cdp, tabA.sessionId, 'window.__probe.placeBet(600, "Plinko")')
    const storedAfterA = await evaluate(cdp, tabA.sessionId, 'window.__probe.stored()')
    report.rows.push({ step: 'A stakes 600', accepted: aFirst, stored: storedAfterA })

    // B mounted before A wrote, so its ref is stale. It must still refuse.
    const bSecond = await evaluate(cdp, tabB.sessionId, 'window.__probe.placeBet(600, "Plinko")')
    const storedAfterB = await evaluate(cdp, tabB.sessionId, 'window.__probe.stored()')
    report.rows.push({ step: 'B stakes 600 with stale ref', accepted: bSecond, stored: storedAfterB })

    // B stakes exactly what remains, proving the read is live not ref-only.
    const bRest = await evaluate(cdp, tabB.sessionId, 'window.__probe.placeBet(400, "Plinko")')
    const storedFinal = await evaluate(cdp, tabB.sessionId, 'window.__probe.stored()')
    report.rows.push({ step: 'B stakes remaining 400', accepted: bRest, stored: storedFinal })

    // A writes again after B; A must see B's committed balance.
    await evaluate(cdp, tabA.sessionId, 'window.__probe.seed(1000)')
    const aAfterSeed = await evaluate(cdp, tabA.sessionId, 'window.__probe.placeBet(100, "Plinko")')
    await evaluate(cdp, tabB.sessionId, 'window.__probe.placeBet(200, "Plinko")')
    const aSeesPeer = await evaluate(cdp, tabA.sessionId, 'window.__probe.stored()')
    const aThird = await evaluate(cdp, tabA.sessionId, 'window.__probe.placeBet(800, "Plinko")')
    const aThirdStored = await evaluate(cdp, tabA.sessionId, 'window.__probe.stored()')
    report.rows.push({ step: 'A writes after B; A must see peer balance', aAfterSeed, stored: aSeesPeer, aThirdAccepted: aThird, storedAfterAThird: aThirdStored })

    // Ledger must account for every accepted stake across both documents.
    const ledger = await evaluate(cdp, tabB.sessionId, 'window.__probe.history()')
    report.rows.push({ step: 'stored history', raw: ledger })

    for (const [i, tab] of [tabA, tabB].entries()) {
        await fetch(`http://127.0.0.1:${port}/json/close/${tab.targetId}`)
        report.rows.push({ step: `closed tab ${i}` })
    }
} finally {
    if (cdp) cdp.close()
    if (browser) { browser.kill('SIGKILL'); report.cleanup.browser = true }
    if (vite) { vite.kill('SIGKILL'); report.cleanup.vite = true }
    await rm(temp, { recursive: true, force: true })
    report.cleanup.temp = true
}

console.log(JSON.stringify(report, null, 1))

const [aStep, bStep, restStep, afterStep] = report.rows
assert.equal(aStep.accepted, true, 'A must stake 600 from 1000')
assert.equal(aStep.stored, '400', 'stored balance after A')
assert.equal(bStep.accepted, false, 'B must be refused: only 400 remains against a stale ref of 1000')
assert.equal(bStep.stored, '400', 'stored balance must not be overwritten')
assert.equal(restStep.accepted, true, 'B must be able to stake the real remaining 400')
assert.equal(restStep.stored, '0', 'stored balance after the remaining stake')
assert.equal(afterStep.stored, '700', 'A must read B\'s committed balance, not its own ref')
assert.equal(afterStep.aThirdAccepted, false, 'A must refuse 800 against a real 700')
console.log('D-1 cross-document: PASS')
