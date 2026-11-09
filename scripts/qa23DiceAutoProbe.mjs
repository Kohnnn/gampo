#!/usr/bin/env node
// QA027: real React consumer, native controls, deferred results, real timers.
// Run: node scripts/qa23DiceAutoProbe.mjs /absolute/path/to/installed/chrome
// ponytail: this checks shared Auto ownership, not every game or hosted build.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createVite } from 'vite'
import react from '@vitejs/plugin-react'

const browser = process.argv[2]
assert(browser && isAbsolute(browser), 'Supply an absolute installed Chromium path')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(done => setTimeout(done, ms))
// The test owns the consumer and its promises. BetPanel, React and timers are real.
const fixture = `
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import BetPanel from '/src/components/games/primitives/BetPanel.jsx'
const root = createRoot(document.querySelector('#root'))
let props, id = 0
const pending = new Map(), attempts = [], receipts = [], completions = [], quotes = []
const callback = identity => ({betAmount, mode}) => {
  const attempt = {id: ++id, identity, betAmount, mode}; attempts.push(attempt)
  return new Promise(resolve => pending.set(id, {attempt, resolve}))
}
function render(patch = {}) { props = {...props, ...patch}; flushSync(() => root.render(React.createElement(BetPanel, props))) }
window.consumer = {
  mount(options = {}) { props = {balance:100, initialBet:1, autoIntervalMs:120, autoTimeoutMs:1000, ...options}; props.onPlay = callback(options.identity || 'A'); render() },
  update(options) { if(options.identity) options.onPlay = callback(options.identity); if(options.quote !== undefined) { const q=options.quote; options.ticketStake=({mode,betAmount}) => { quotes.push({q,mode,betAmount}); return q }; delete options.quote }; render(options) },
  release(n, result) { const item=pending.get(n); if(!item) throw Error('No pending '+n); pending.delete(n); completions.push(item.attempt); if(!result.kind || result.kind==='committed') receipts.push({...item.attempt,profit:result.profit}); item.resolve(result) },
  unmount() { flushSync(() => root.render(null)) },
  snapshot() { return structuredClone({attempts,receipts,completions,quotes}) }
}
consumer.mount()
`
const html = '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><style>body{font:16px sans-serif}.bp-mobile-layer,.bp-mobile-close{display:none}button,input{padding:8px;margin:5px}.bp-panel{max-width:440px}</style><div id="root"></div><script type="module" src="/qa027-fixture.js"></script>'
const plugin = {
    name: 'qa027-consumer',
    configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
            if (req.url !== '/qa027') return next()
            try { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(await server.transformIndexHtml('/qa027', html)) }
            catch (error) { next(error) }
        })
    },
    resolveId(id) { if (id === '/qa027-fixture.js') return '\0qa027-fixture' },
    load(id) { if (id === '\0qa027-fixture') return fixture },
}
class Cdp {
    constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.listeners = [] }
    async open() {
        await once(this.ws, 'open')
        this.ws.addEventListener('message', event => {
            const message = JSON.parse(String(event.data)), call = this.pending.get(message.id)
            if (call) { clearTimeout(call.timer); this.pending.delete(message.id); message.error ? call.reject(Error(JSON.stringify(message.error))) : call.resolve(message.result) }
            else if (!message.id) for (const listener of this.listeners) listener(message)
        })
    }
    send(method, params = {}, sessionId) {
        const id = ++this.id
        return new Promise((resolveCall, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(Error(`CDP timeout: ${method}`)) }, 20000)
            this.pending.set(id, { resolve: resolveCall, reject, timer }); this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
        })
    }
    close() { for (const call of this.pending.values()) { clearTimeout(call.timer); call.reject(Error('CDP closed')) }; this.ws.close() }
}
async function until(fn, label) {
    const end = Date.now() + 25000
    while (Date.now() < end) { const value = await fn(); if (value) return value; await sleep(25) }
    throw Error(`Timed out: ${label}`)
}
const profile = await mkdtemp(join(tmpdir(), 'gampo-qa027-check-'))
let vite, proxy, child, exit, cdp
try {
    vite = await createVite({ root, configFile: false, plugins: [react(), plugin], server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
    await vite.listen()
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
    proxy = createServer((req, res) => { res.writeHead(403); res.end() })
    proxy.on('connect', (req, socket) => socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'))
    await new Promise((ok, fail) => { proxy.once('error', fail); proxy.listen(0, '127.0.0.1', ok) })
    child = spawn(browser, ['--headless=new', '--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions', '--disable-quic', '--mute-audio', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--proxy-server=http://127.0.0.1:${proxy.address().port}`, '--proxy-bypass-list=127.0.0.1', '--host-resolver-rules=MAP * ~NOTFOUND,EXCLUDE 127.0.0.1', 'about:blank'], { detached: true, stdio: 'ignore' })
    exit = new Promise(done => { child.once('error', error => done({ error: String(error) })); child.once('exit', (code, signal) => done({ code, signal })) })
    await once(child, 'spawn')
    const port = await until(async () => { try { return Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]) } catch { return 0 } }, 'browser debugger')
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    cdp = new Cdp(version.webSocketDebuggerUrl); await cdp.open()
    for (const name of ['funded', 'exhausted', 'pending', 'cadence', 'retry', 'timeout', 'late', 'unmount-pending', 'unmount-cadence', 'unmount-retry', 'ticket', 'cadence-500']) {
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
        const send = (method, params) => cdp.send(method, params, sessionId), errors = [], warnings = []
        const listener = event => {
            if (event.sessionId !== sessionId) return
            if (event.method === 'Fetch.requestPaused') {
                const url = new URL(event.params.request.url), allowed = url.origin === origin && !url.pathname.startsWith('/api/')
                if (!allowed) errors.push(`Unexpected request: ${url}`)
                send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId: event.params.requestId, ...(allowed ? {} : { errorReason: 'BlockedByClient' }) }).catch(error => errors.push(String(error)))
            }
            if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text)
            if (event.method === 'Runtime.consoleAPICalled') {
                const text = event.params.args.map(arg => arg.value ?? arg.description).join(' ')
                if (event.params.type === 'error') errors.push(text)
                if (event.params.type === 'warning') warnings.push(text)
            }
        }
        cdp.listeners.push(listener)
        const evalPage = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); assert(!r.exceptionDetails, r.exceptionDetails?.text); return r.result?.value }
        const snap = () => evalPage('consumer.snapshot()')
        const click = async selector => {
            const r = await evalPage(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e || e.disabled) throw Error('Missing enabled control'); e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height} })()`)
            assert(r.w > 0 && r.h > 0)
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 })
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 })
        }
        const advance = async ms => {
            const expired = new Promise(done => { const f = e => { if (e.sessionId === sessionId && e.method === 'Emulation.virtualTimeBudgetExpired') { cdp.listeners.splice(cdp.listeners.indexOf(f), 1); done() } }; cdp.listeners.push(f) })
            await send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: ms, maxVirtualTimeTaskStarvationCount: 10000 })
            await Promise.race([expired, sleep(15000).then(() => { throw Error('Virtual time deadline') })]); await send('Emulation.setVirtualTimePolicy', { policy: 'pause' })
        }
        const release = (id, result) => evalPage(`consumer.release(${id},${JSON.stringify(result)})`), commit = profit => ({ kind: 'committed', profit })
        for (const method of ['Page.enable', 'Runtime.enable', 'Network.enable']) await send(method)
        await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }) // before navigation
        await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
        await send('Page.navigate', { url: `${origin}/qa027` }); await until(async () => { assert.deepEqual(errors, []); return evalPage('!!window.consumer') }, 'mounted React consumer')
        await evalPage(`consumer.mount(${JSON.stringify({ balance: name === 'exhausted' ? 1 : 100, autoIntervalMs: name === 'cadence-500' ? 500 : 120 })})`)
        if (name === 'ticket') await evalPage('consumer.update({quote:2})')
        await click('.bp-tab:nth-child(2)') // default count 10; Stop/affordability bound each case
        await send('Emulation.setVirtualTimePolicy', { policy: 'pause' }); await click('.bp-content .bp-play')
        await until(async () => (await snap()).attempts.length === 1, 'first attempt')
        if (name === 'funded' || name === 'exhausted' || name === 'ticket' || name === 'cadence-500') {
            if (name === 'ticket') await evalPage('consumer.update({identity:"B",quote:3})')
            else if (name !== 'cadence-500') await evalPage(`consumer.update({identity:"B",balance:${name === 'exhausted' ? 0 : 100}})`)
            await release(1, commit(-1))
            if (name === 'cadence-500') { await advance(499); assert.equal((await snap()).attempts.length, 1); await advance(1) } else await advance(120)
            const middle = await snap()
            assert.deepEqual(middle.attempts.map(a => a.identity), name === 'exhausted' ? ['A'] : name === 'cadence-500' ? ['A', 'A'] : ['A', 'B'])
            if (name === 'ticket') assert(middle.quotes.some(q => q.mode === 'auto' && q.q === 3))
            if (name !== 'exhausted') { await click('.bp-content .bp-play'); await release(2, commit(-1)) }
            await advance(1240)
            assert.equal((await snap()).attempts.length, name === 'exhausted' ? 1 : 2)
        } else {
            const waiting = name.includes('cadence') || name.includes('retry'), refused = name.includes('retry')
            if (waiting) { await release(1, refused ? {kind:'rejected',code:'in-round',profit:0} : commit(-1)); await advance(50) }
            if (name === 'timeout') await advance(500)
            if (name === 'late') await advance(1000)
            if (name.startsWith('unmount')) { await evalPage('consumer.unmount()'); await advance(1); await evalPage('consumer.mount({identity:"B"})'); await click('.bp-tab:nth-child(2)') }
            else { if (name !== 'late') await click('.bp-content .bp-play'); await evalPage('consumer.update({identity:"B"})') }
            await click('.bp-content .bp-play')
            assert.deepEqual((await snap()).attempts.map(a => a.identity), ['A', 'B'])
            if (waiting) await advance(70); else if (name === 'timeout') await advance(500); else await release(1, commit(-1))
            assert.deepEqual((await snap()).attempts.map(a => a.identity), ['A', 'B'])
            await release(2, commit(1)); await advance(120)
            assert.deepEqual((await snap()).attempts.map(a => a.identity), ['A', 'B', 'B'])
            await click('.bp-content .bp-play'); await release(3, commit(1)); if (name === 'timeout') await release(1, commit(-1))
            await advance(1240)
            const result = await snap()
            assert.deepEqual(result.attempts.map(a => a.identity), ['A', 'B', 'B'])
            assert.deepEqual(result.receipts.filter(a => a.identity === 'B').map(a => [a.betAmount, a.profit]), [[1, 1], [1, 1]])
            assert.equal(result.completions.filter(a => a.identity === 'A').length, 1)
            assert.equal(result.receipts.filter(a => a.identity === 'A').length, refused ? 0 : 1)
        }
        assert.deepEqual(errors, [])
        assert.deepEqual(warnings, name === 'late' ? ['[BetPanel] autoplay round timed out after 1000 ms'] : [])
        await cdp.send('Target.closeTarget', { targetId }); cdp.listeners.splice(cdp.listeners.indexOf(listener), 1)
        console.log(`PASS ${name}`)
    }
} finally {
    if (cdp) { try { await cdp.send('Browser.close') } catch {} ; cdp.close() }
    if (child?.pid) {
        const signal = s => { try { process.kill(-child.pid, s) } catch (e) { if (e.code !== 'ESRCH') throw e } }
        let result = await Promise.race([exit, sleep(4000).then(() => null)])
        if (!result) { signal('SIGTERM'); result = await Promise.race([exit, sleep(2000).then(() => null)]) }
        if (!result) { signal('SIGKILL'); await exit }
        const gone = () => { try { process.kill(-child.pid, 0); return false } catch (e) { if (e.code === 'ESRCH') return true; throw e } }
        for (let i = 0; i < 80 && !gone(); i++) await sleep(50)
        if (!gone()) { signal('SIGKILL'); for (let i = 0; i < 80 && !gone(); i++) await sleep(50) }
        assert(gone(), `Browser process group ${child.pid} remains; profile retained: ${profile}`)
    }
    await rm(profile, { recursive: true, maxRetries: 5, retryDelay: 100 })
    if (vite) await vite.close()
    if (proxy) { proxy.closeAllConnections(); await new Promise(done => proxy.close(done)) }
}
