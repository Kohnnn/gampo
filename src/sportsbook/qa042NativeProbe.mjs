// QA042 native Chromium geometry probe. Run from the repository root:
// node --experimental-websocket src/sportsbook/qa042NativeProbe.mjs
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { presentFeedCondition } from './sportsbookPresentation.js'

const chromePath = '/home/compute_01/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome'
const flags = ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--no-proxy-server', '--remote-debugging-port=0']
const longSources = ['Very Long Bookmaker Name With Many Words That Should Wrap In The Source Field', 'Very Long Feed Provider Name For Stressing The Metadata Column In This Test', 'Another Attributable Source With A Long Name For The Ticket Feed']
const unbrokenSource = 'ProviderNameWithoutSpaces'.repeat(20)
const css = (await readFile('src/styles/sportsbook.css', 'utf8')).replaceAll('</style', '<\\/style')
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

// Same production shell hierarchy and feed-status markup, using its real
// presentFeedCondition and stylesheet; the empty slip supplies the grid track.
function page(state, sources) {
    const p = presentFeedCondition({ state, sources, generatedAt: '2026-10-20T12:00:00Z', errors: ['Provider unavailable'] })
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>* { box-sizing: border-box; } html,body { margin:0; height:100%; } body { font: 14px system-ui,sans-serif; } ${css}</style></head><body><div class="sb-page"><section class="sb-main"><section class="sb-feed-status is-${escapeHtml(p.state)}" role="status" aria-live="polite" aria-atomic="true"><div><strong>${escapeHtml(p.heading)}</strong><span id="sportsbook-feed-status-copy">${escapeHtml(p.body)}</span></div><dl><div><dt>Last refresh</dt><dd>${escapeHtml(p.refreshed)}</dd></div><div><dt>Sources</dt><dd>${escapeHtml(p.sources.join(', ') || 'No attributable source')}</dd></div></dl></section></section><aside class="sb-betslip"></aside></div></body></html>`
}
class Cdp {
    constructor(url) { this.socket = new WebSocket(url); this.id = 0; this.pending = new Map() }
    async open() {
        await once(this.socket, 'open')
        this.socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data)); const pending = this.pending.get(message.id)
            if (!pending) return
            this.pending.delete(message.id); clearTimeout(pending.timer)
            message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result)
        })
    }
    send(method, params = {}, sessionId) {
        const id = ++this.id
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 15000)
            this.pending.set(id, { resolve, reject, timer })
            this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
        })
    }
    close() { this.socket.close() }
}
async function until(fn, label) {
    const deadline = Date.now() + 20000
    while (Date.now() < deadline) {
        const result = await fn().catch(() => false)
        if (result) return result
        await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`Timed out waiting for ${label}`)
}
async function evaluate(cdp, session, expression) {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session)
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
}
const profile = await mkdtemp(join(tmpdir(), 'gampo-qa042-'))
let browser, cdp
try {
    browser = spawn(chromePath, [...flags, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
    const port = await until(async () => Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]), 'Chromium debugger')
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    cdp = new Cdp(version.webSocketDebuggerUrl)
    await cdp.open()
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.id, flatten: true })
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    const rows = []
    for (const [width, height] of [[1610, 870], [390, 844]]) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 }, sessionId)
        for (const [state, sources, fixture] of [...['current', 'stale', 'empty', 'error'].map(state => [state, longSources, 'long-words']), ['current', [unbrokenSource], 'unbroken']]) {
            const html = page(state, sources)
            const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
            await cdp.send('Page.navigate', { url }, sessionId)
            await until(() => evaluate(cdp, sessionId, `document.readyState === 'complete' && document.querySelector('.sb-feed-status')?.classList.contains('is-${state}')`), 'fixture')
            const geometry = await evaluate(cdp, sessionId, `(() => {
                const root = document.querySelector('.sb-feed-status')
                const copy = root.querySelector(':scope > div')
                const heading = copy.querySelector('strong')
                const body = copy.querySelector('span')
                const metadata = root.querySelector('dl')
                const fields = [...metadata.querySelectorAll('dt, dd')]
                const box = el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height, scrollWidth:el.scrollWidth, clientWidth:el.clientWidth } }
                const textBounds = el => { const range = document.createRange(); range.selectNodeContents(el); return [...range.getClientRects()].map(r => ({left:r.left,right:r.right,top:r.top,bottom:r.bottom})) }
                const a = box(copy), b = box(metadata)
                const overlap = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
                const textRects = [heading, body, ...fields].flatMap(textBounds)
                const contained = textRects.every(r => r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5)
                return { banner: box(root), copy: a, heading:box(heading), body:box(body), metadata:b, fields:fields.map(box), textRects, overlap, contained, viewport:{width:innerWidth,height:innerHeight}, documentScrollWidth:document.documentElement.scrollWidth }
            })()`)
            rows.push({ viewport: `${width}x${height}`, state, fixture, ...geometry })
        }
    }
    const summary = rows.map(row => ({ viewport: `${row.viewport.width}x${row.viewport.height}`, state: row.state, fixture: row.fixture, copyWidth: Math.round(row.copy.width), copyRight: Math.round(row.copy.right), metadataLeft: Math.round(row.metadata.left), overlap: row.overlap, contained: row.contained, bannerRight: Math.round(row.banner.right), documentScrollWidth: row.documentScrollWidth, clippedFields: row.fields.filter(field => field.scrollWidth > field.clientWidth + 0.5 || field.right > row.viewport.width + 0.5).length }))
    const failures = summary.filter(row => row.copyWidth <= 100 || row.overlap || !row.contained || row.clippedFields > 0)
    console.log(JSON.stringify({ browser: version.Browser, scope: 'Production CSS, feed markup and presentFeedCondition in isolated shell (not full app)', rows: summary, failures }, null, 2))
    if (failures.length) process.exitCode = 1
} finally {
    cdp?.close()
    if (browser) { browser.kill('SIGKILL'); await once(browser, 'exit').catch(() => {}) }
    await rm(profile, { recursive: true, force: true })
}
