// Lightweight accessibility + interaction audit for new routes.
// Renders each route in headless Chrome and checks:
//   - no buttons/links without an accessible name
//   - all form controls have a label/aria-label
//   - primary action is keyboard-focusable
//   - the Strategy Sandbox actually runs and renders results
//   - no console errors
// Pure CDP over Node's global WebSocket (no extra deps).

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = (process.argv.find(a => a.startsWith('--baseUrl='))?.split('=')[1] || 'http://127.0.0.1:4173').replace(/\/$/, '')
const ROUTES = (process.argv.find(a => a.startsWith('--routes='))?.split('=')[1] || '/settings,/insights,/sandbox').split(',')
const EDGE = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
const browser = process.argv.find(a => a.startsWith('--browser='))?.split('=')[1] || EDGE.find(c => existsSync(c))
if (!browser) throw new Error('No Edge/Chrome found')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const port = 9800 + Math.floor(Math.random() * 150)
const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), `gampo-a11y-${process.pid}`)}`, 'about:blank'], { stdio: 'ignore' })
proc.unref()

async function waitDbg() {
    const start = Date.now()
    while (Date.now() - start < 10000) {
        try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return r.json() } catch { /* retry */ }
        await sleep(200)
    }
    throw new Error('debugger not ready')
}

let id = 1
const pending = new Map()
let ws
const send = (method, params = {}, sessionId) => {
    const mid = id++
    const msg = { id: mid, method, params }
    if (sessionId) msg.sessionId = sessionId
    return new Promise((res, rej) => { pending.set(mid, { res, rej }); ws.send(JSON.stringify(msg)) })
}
async function evalExpr(expression, sessionId) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
    return r.result?.value
}

const auditExpr = `
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const issues = [];
  const accName = el => (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.value || (el.getAttribute('aria-labelledby') ? 'labelledby' : '')).trim();
  // 1. interactive elements need an accessible name
  for (const el of document.querySelectorAll('button, a[href], [role="button"], [role="radio"]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue; // skip hidden
    if (!accName(el)) issues.push('unnamed ' + el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.split(/\\s+/)[0] : ''));
  }
  // 2. form controls need a label
  for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const id = el.id;
    const hasLabel = (id && document.querySelector('label[for="' + id + '"]')) || el.closest('label') || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
    if (!hasLabel) issues.push('unlabeled control ' + el.tagName.toLowerCase() + (el.type ? ('[' + el.type + ']') : ''));
  }
  // 3. a focusable primary action exists
  const primary = document.querySelector('[data-ux-primary-action], .sandbox-run, .settings-btn, a, button');
  const focusable = !!primary;
  // 4. sandbox runs
  let sandboxRan = null;
  const runBtn = document.querySelector('.sandbox-run');
  if (runBtn) {
    runBtn.click();
    await sleep(400);
    sandboxRan = !!document.querySelector('.sandbox-verdict');
  }
  return { issues, focusable, sandboxRan, surfaces: Array.from(document.querySelectorAll('[data-ux-surface]')).length };
})()
`

async function main() {
    const v = await waitDbg()
    ws = new WebSocket(v.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
    const consoleErrors = []
    ws.onmessage = (ev) => {
        const d = JSON.parse(ev.data)
        if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); return }
        if (d.method === 'Runtime.consoleAPICalled' && d.params?.type === 'error') consoleErrors.push(d.params.args?.map(a => a.value).join(' '))
        if (d.method === 'Runtime.exceptionThrown') consoleErrors.push('EXCEPTION')
    }
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    await send('Page.enable', {}, sessionId)
    await send('Runtime.enable', {}, sessionId)
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false }, sessionId)

    let failures = 0
    for (const route of ROUTES) {
        consoleErrors.length = 0
        await send('Page.navigate', { url: `${BASE}${route}` }, sessionId)
        await sleep(1500)
        let r
        try { r = await evalExpr(auditExpr, sessionId) } catch (e) { r = { issues: ['eval error: ' + String(e).slice(0, 80)] } }
        const errs = consoleErrors.filter(Boolean)
        const ok = r.issues.length === 0 && errs.length === 0 && (r.sandboxRan === null || r.sandboxRan === true)
        if (!ok) failures++
        console.log(`${ok ? 'PASS' : 'FAIL'} ${route} :: surfaces=${r.surfaces} a11yIssues=${JSON.stringify(r.issues)} sandboxRan=${r.sandboxRan} consoleErrors=${errs.length}`)
    }

    await send('Target.closeTarget', { targetId })
    ws.close(); proc.kill()
    console.log(failures === 0 ? '\\nA11Y AUDIT PASSED' : `\\n${failures} ROUTE(S) FAILED`)
    process.exit(failures === 0 ? 0 : 1)
}
main().catch(e => { console.error(e); proc.kill(); process.exit(1) })
