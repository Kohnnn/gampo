#!/usr/bin/env node
// QA028: run the actual BetPanel and HotkeyHelp in an isolated browser.
// Usage: node scripts/qa028HotkeyDialogProbe.mjs /absolute/path/to/chromium
// ponytail: this checks the shared consumer, not every game or a deployed build.
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
const fixture = `
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import BetPanel from '/src/components/games/primitives/BetPanel.jsx'
import HotkeyHelp from '/src/components/games/primitives/HotkeyHelp.jsx'
import '/src/components/games/primitives/primitives.css'
const h = React.createElement
function Consumer() {
  const [plays, setPlays] = useState(0), [clicks, setClicks] = useState(0)
  const [help, setHelp] = useState(false), [other, setOther] = useState(false)
  const [running, setRunning] = useState(false)
  return h(React.Fragment, null,
    h('button', {id:'control', onClick:() => setClicks(n => n + 1)}, 'Native control'),
    h('button', {id:'help', onClick:() => setHelp(true)}, 'Open help'),
    h('button', {id:'other', onClick:() => setOther(v => !v)}, 'Toggle other dialog'),
    h('button', {id:'running', onClick:() => setRunning(v => !v)}, 'Toggle running'),
    h('div', {id:'playfield', tabIndex:0}, 'Playfield'),
    h('output', {id:'plays'}, plays), h('output', {id:'clicks'}, clicks),
    h(BetPanel, {balance:1000, initialBet:5, runningRound:running, onPlay:() => setPlays(n => n + 1)}),
    h(HotkeyHelp, {controlledOpen:help, onOpenChange:setHelp}),
    other && h('div', {role:'dialog', className:'test-enter'},
      'Other dialog', h('button', {id:'dialog-control', onClick:() => setClicks(n => n + 1)}, 'Dialog control')),
    h('div', {role:'dialog', style:{display:'none'}}, 'Hidden display'),
    h('div', {role:'dialog', style:{visibility:'hidden'}}, 'Hidden visibility'),
    h('div', {role:'dialog', style:{opacity:0}}, 'Invisible'),
    h('div', {role:'dialog', style:{opacity:0, pointerEvents:'none'}}, 'Collapsed'),
    h('div', {role:'dialog', 'aria-hidden':'true'}, 'Aria hidden'),
    h('dialog', {id:'native', tabIndex:-1}, 'Native modal'))
}
createRoot(document.querySelector('#root')).render(h(Consumer))
`
const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">' +
    '<style>.hotkey-card{animation-play-state:paused!important}.test-enter{animation:hotkeyPop 1s both paused}</style>' +
    '<div id="root"></div><script type="module" src="/qa028-fixture.js"></script>'
const plugin = {
    name: 'qa028-hotkey-consumer',
    configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
            if (req.url !== '/qa028') return next()
            try { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(await server.transformIndexHtml('/qa028', html)) }
            catch (error) { next(error) }
        })
    },
    resolveId(id) { if (id === '/qa028-fixture.js') return '\0qa028-fixture' },
    load(id) { if (id === '\0qa028-fixture') return fixture },
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
            const timer = setTimeout(() => { this.pending.delete(id); reject(Error(`CDP timeout: ${method}`)) }, 15000)
            this.pending.set(id, { resolve: resolveCall, reject, timer }); this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
        })
    }
    close() { for (const call of this.pending.values()) { clearTimeout(call.timer); call.reject(Error('CDP closed')) }; this.ws.close() }
}
async function until(fn, label) {
    const end = Date.now() + 15000
    while (Date.now() < end) { const value = await fn(); if (value) return value; await sleep(25) }
    throw Error(`Timed out: ${label}`)
}
const profile = await mkdtemp(join(tmpdir(), 'gampo-qa028-dialog-'))
let vite, proxy, child, exit, cdp
try {
    vite = await createVite({ root, configFile: false, plugins: [react(), plugin], server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
    await vite.listen()
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
    proxy = createServer((req, res) => { res.writeHead(403); res.end() })
    proxy.on('connect', (req, socket) => socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'))
    await new Promise((ok, fail) => { proxy.once('error', fail); proxy.listen(0, '127.0.0.1', ok) })
    child = spawn(browser, ['--headless=new', '--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions', '--disable-quic', '--mute-audio', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--proxy-server=http://127.0.0.1:${proxy.address().port}`, '--proxy-bypass-list=127.0.0.1', '--host-resolver-rules=MAP * ~NOTFOUND,EXCLUDE 127.0.0.1', 'about:blank'], { detached:true, stdio:'ignore' })
    exit = new Promise(done => { child.once('error', error => done({ error:String(error) })); child.once('exit', (code, signal) => done({ code, signal })) })
    const port = await until(async () => { try { return Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]) } catch { return 0 } }, 'browser debugger')
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    cdp = new Cdp(version.webSocketDebuggerUrl); await cdp.open()
    const { targetId } = await cdp.send('Target.createTarget', { url:'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten:true })
    const send = (method, params) => cdp.send(method, params, sessionId), errors = []
    cdp.listeners.push(event => {
        if (event.sessionId !== sessionId) return
        if (event.method === 'Fetch.requestPaused') {
            const url = new URL(event.params.request.url), allowed = url.origin === origin && !url.pathname.startsWith('/api/')
            if (!allowed) errors.push(`Unexpected request: ${url}`)
            send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId:event.params.requestId, ...(allowed ? {} : {errorReason:'BlockedByClient'}) }).catch(error => errors.push(String(error)))
        }
        if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text)
    })
    const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true }); assert(!r.exceptionDetails, r.exceptionDetails?.exception?.description || r.exceptionDetails?.text); return r.result?.value }
    const focus = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).focus(); document.activeElement.matches(${JSON.stringify(selector)})`)
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
    const count = selector => evaluate(`Number(document.querySelector(${JSON.stringify(selector)}).textContent)`)
    const pressSpace = async (repeat = false) => {
        const key = { key:' ', code:'Space', windowsVirtualKeyCode:32, nativeVirtualKeyCode:32, text:' ' }
        await send('Input.dispatchKeyEvent', { type:'keyDown', autoRepeat:repeat, ...key })
        await send('Input.dispatchKeyEvent', { type:'keyUp', ...key })
    }
    for (const method of ['Page.enable', 'Runtime.enable', 'Network.enable']) await send(method)
    await send('Fetch.enable', { patterns:[{urlPattern:'*'}] })
    await send('Emulation.setDeviceMetricsOverride', { width:1440, height:1100, deviceScaleFactor:1, mobile:false })
    await send('Page.navigate', { url:`${origin}/qa028` })
    await until(async () => { assert.deepEqual(errors, []); return evaluate('!!document.querySelector(".bp-play")') }, 'mounted consumer')

    assert(await focus('#playfield')); await pressSpace(true)
    assert.equal(await count('#plays'), 0, 'repeated Space must not play')
    assert(await focus('#control')); await pressSpace()
    assert.equal(await count('#clicks'), 1, 'focused button retains native Space activation')
    assert.equal(await count('#plays'), 0, 'focused button must not play')
    await click('#running'); await until(() => evaluate('document.querySelector(".bp-play").disabled'), 'round lock')
    assert(await focus('#playfield')); await pressSpace()
    assert.equal(await count('#plays'), 0, 'running round must remain locked')
    await click('#running'); await until(() => evaluate('!document.querySelector(".bp-play").disabled'), 'round unlock')
    assert(await focus('#playfield')); await pressSpace()
    assert.equal(await count('#plays'), 1, 'hidden and collapsed dialogs must not block the playfield')

    await click('#help'); await until(() => evaluate('!!document.querySelector(".hotkey-card")'), 'help open')
    const opening = await evaluate(`(() => { const d=document.querySelector('.hotkey-card'), s=getComputedStyle(d); return {opacity:s.opacity, pointer:s.pointerEvents, animation:s.animationName} })()`)
    assert.deepEqual(opening, { opacity:'0', pointer:'auto', animation:'hotkeyPop' }, 'help must be at its real opening frame')
    assert(await focus('#playfield')); await pressSpace()
    assert.equal(await count('#plays'), 1, 'opening HotkeyHelp must block a paid Space')
    await click('.hotkey-close'); await until(() => evaluate('!document.querySelector(".hotkey-card")'), 'help closed')
    assert(await focus('#playfield')); await pressSpace()
    assert.equal(await count('#plays'), 2, 'playfield Space must work after help closes')

    await click('#other'); await until(() => evaluate('!!document.querySelector(".test-enter")'), 'other dialog open')
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".test-enter")).opacity'), '0')
    assert(await focus('#playfield')); await pressSpace()
    assert.equal(await count('#plays'), 2, 'another opening dialog must block Space')
    assert(await focus('#dialog-control')); await pressSpace()
    assert.equal(await count('#clicks'), 2, 'focused dialog button retains native Space activation')
    assert.equal(await count('#plays'), 2, 'dialog button must not play')
    await click('#other'); await until(() => evaluate('!document.querySelector(".test-enter")'), 'other dialog closed')
    await evaluate('document.querySelector("#native").showModal()')
    assert(await focus('#native')); await pressSpace()
    assert.equal(await count('#plays'), 2, 'native open dialog must block Space')
    await evaluate('document.querySelector("#native").close()')
    assert(await focus('#playfield')); await pressSpace()
    assert.equal(await count('#plays'), 3, 'playfield Space must work after native dialog closes')

    // The actual mobile sheet is mounted even when collapsed. Pin its opening
    // transition to the first frame so opacity is zero while the sheet is open.
    await send('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:true })
    await until(() => evaluate('!!document.querySelector(".bp-content[role=dialog]")'), 'mobile sheet mounted')
    assert.deepEqual(await evaluate(`(() => { const s=getComputedStyle(document.querySelector('.bp-content')); return {opacity:s.opacity, pointer:s.pointerEvents} })()`), {opacity:'0', pointer:'none'})
    assert(await focus('#playfield')); await pressSpace()
    assert.equal(await count('#plays'), 4, 'collapsed mobile sheet must not block playfield Space')
    await evaluate(`(() => { const s=document.createElement('style'); s.textContent='.bp-content { transition-delay: 30s !important; }'; document.head.appendChild(s) })()`)
    await click('.bp-mobile-settings'); await until(() => evaluate('document.querySelector(".bp-content").getAttribute("aria-modal") === "true"'), 'mobile sheet open')
    assert.deepEqual(await evaluate(`(() => { const s=getComputedStyle(document.querySelector('.bp-content')); return {opacity:s.opacity, pointer:s.pointerEvents} })()`), {opacity:'0', pointer:'auto'})
    assert(await focus('#playfield')); await pressSpace()
    assert.equal(await count('#plays'), 4, 'opening mobile sheet must block playfield Space')
    await click('.bp-mobile-close'); await until(() => evaluate('!document.querySelector(".bp-content").hasAttribute("aria-modal")'), 'mobile sheet closed')
    assert(await focus('#playfield')); await pressSpace()
    assert.equal(await count('#plays'), 5, 'closed mobile sheet must release playfield Space')
    assert.deepEqual(errors, [])
    console.log('PASS: native controls, round lock, opening dialogs, hidden dialogs, and restored playfield')
} finally {
    if (cdp) { try { await cdp.send('Browser.close') } catch {} ; cdp.close() }
    if (child) {
        const signal = s => { try { process.kill(-child.pid, s) } catch (e) { if (e.code !== 'ESRCH') throw e } }
        let result = await Promise.race([exit, sleep(4000).then(() => null)])
        if (!result) { signal('SIGTERM'); result = await Promise.race([exit, sleep(2000).then(() => null)]) }
        if (!result) { signal('SIGKILL'); await exit }
        const gone = () => { try { process.kill(-child.pid, 0); return false } catch (e) { if (e.code === 'ESRCH') return true; throw e } }
        for (let i = 0; i < 80 && !gone(); i++) await sleep(50)
        if (!gone()) { signal('SIGKILL'); for (let i = 0; i < 80 && !gone(); i++) await sleep(50) }
        assert(gone(), `Browser process group ${child.pid} remains; profile retained: ${profile}`)
    }
    await rm(profile, { recursive:true, maxRetries:5, retryDelay:100 })
    if (vite) await vite.close()
    if (proxy) { proxy.closeAllConnections(); await new Promise(done => proxy.close(done)) }
}
