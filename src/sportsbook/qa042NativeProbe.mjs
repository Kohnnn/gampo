// QA042 native geometry regression. Requires a built app (npm run build).
//   node --experimental-websocket src/sportsbook/qa042NativeProbe.mjs --browser=/absolute/chrome
// Run in an owned Linux network namespace with only loopback up and no
// network-administration capabilities, using a disposable HOME and TMPDIR.
// The interface preflight complements the namespace: CDP interception only
// covers page requests, not browser-level connections made before interception.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const browser = process.argv.find(a => a.startsWith('--browser='))?.slice('--browser='.length)
if (!browser || !isAbsolute(browser) || !existsSync(browser)) throw new Error('Pass an existing absolute Chromium executable with --browser=')
const dist = join(root, 'dist')
if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/index.html missing: build the app first')

async function assertLoopbackOnly() {
    if (process.platform !== 'linux') throw new Error('Loopback-only preflight requires Linux')
    const dev = await fs.readFile('/proc/net/dev', 'utf8')
    const interfaces = dev.split('\n').slice(2).map(line => line.split(':')[0].trim()).filter(Boolean)
    if (interfaces.length !== 1 || interfaces[0] !== 'lo') throw new Error(`Loopback-only preflight failed: interfaces ${interfaces.join(',')}`)
    const fib = await fs.readFile('/proc/net/fib_trie', 'utf8')
    if (!fib.includes('127.0.0.1')) throw new Error('Loopback-only preflight failed: 127.0.0.1 not active')
}
await assertLoopbackOnly()

const appHost = 'qa042.test'
const longSources = Array.from({ length: 18 }, (_, i) => `International Bookmaker ${String(i + 1).padStart(2, '0')} Trading and Sports Markets`)
const UNBROKEN = 'ProviderNameWithoutSpaces'.repeat(20)
const CURRENT_AT = new Date(Date.now() - 60_000).toISOString()
const STALE_AT = new Date(Date.now() - 30 * 60_000).toISOString()
const REFERENCE_AT = new Date(Date.now() + 60_000).toISOString()
const STARTS_AT = new Date(Date.now() + 3_600_000).toISOString()

function feed(sources, updated, { configured = false, errors = [] } = {}) {
    return {
        generatedAt: configured || sources.length ? REFERENCE_AT : null,
        errors,
        // configured provider makes the empty case suppress synthetic events
        sources: configured ? { apiFootball: { configured: true } } : {},
        apiFootball: {
            fixtures: sources.map((_, id) => ({
                fixture: { id: 8200 + id, date: STARTS_AT, status: { short: 'NS' } },
                league: { name: 'QA042 Lab League' },
                teams: { home: { name: `Home Team ${id}` }, away: { name: `Away Team ${id}` } },
                goals: { home: null, away: null },
            })),
            odds: sources.map((source, id) => ({
                fixture: { id: 8200 + id },
                update: updated,
                bookmakers: [{ name: source, bets: [{ id: 1, values: [{ value: 'Home', odd: '1.90', updatedAt: updated }, { value: 'Away', odd: '2.10', updatedAt: updated }] }] }],
            })),
        },
    }
}

// One event, one odds entry, eighteen named bookmakers: matches the recognizable
// stress fixture from prior mounted evidence and avoids per-sport curation drops.
function longListFixture() {
    return {
        generatedAt: REFERENCE_AT,
        errors: [],
        sources: {},
        apiFootball: {
            fixtures: [{
                fixture: { id: 8299, date: STARTS_AT, status: { short: 'NS' } },
                league: { name: 'QA042 Lab League' },
                teams: { home: { name: 'Home Team 99' }, away: { name: 'Away Team 99' } },
                goals: { home: null, away: null },
            }],
            odds: [{
                fixture: { id: 8299 },
                update: CURRENT_AT,
                bookmakers: longSources.map(source => ({ name: source, bets: [{ id: 1, values: [{ value: 'Home', odd: '1.90', updatedAt: CURRENT_AT }, { value: 'Away', odd: '2.10', updatedAt: CURRENT_AT }] }] })),
            }],
        },
    }
}

const scenarios = [
    { name: 'current', state: 'current', sources: ['Desk Book'], data: feed(['Desk Book'], CURRENT_AT) },
    { name: 'stale', state: 'stale', sources: ['Stale Desk'], data: feed(['Stale Desk'], STALE_AT) },
    { name: 'empty', state: 'empty', sources: [], data: feed([], null, { configured: true }) },
    { name: 'error', state: 'error', sources: [], data: feed([], null, { errors: ['QA042 synthetic provider failure'] }) },
    { name: 'long-list', state: 'current', sources: longSources, data: longListFixture() },
    { name: 'unbroken', state: 'current', sources: [UNBROKEN], data: feed([UNBROKEN], CURRENT_AT) },
]
const viewports = [{ width: 1610, height: 870, mobile: false }, { width: 1024, height: 768, mobile: false }, { width: 390, height: 844, mobile: true }]
const fonts = new Set(['fonts.googleapis.com', 'fonts.gstatic.com'])
const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function bounded(promise, ms, label) {
    let timer
    try {
        return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms) })])
    } finally { clearTimeout(timer) }
}

let server, profile, proc, ws, exitPromise, spawnError, exited = false, stderr = '', seq = 1
let origin = '', currentId = '', currentData = scenarios[0].data
const pending = new Map()
const servedIds = []
const deniedFonts = new Set()
const externalRequests = []
const cdpErrors = []
const welcomeDismissals = []
const welcomeFailures = []

function send(method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = seq++
        if (!ws || ws.readyState !== WebSocket.OPEN) return reject(new Error('owned page socket not open'))
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 10000)
        pending.set(id, { resolve, reject, timer })
        ws.send(JSON.stringify({ id, method, params }))
    })
}
async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
}
async function fetchJson(url, options) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
        const response = await fetch(url, { ...options, signal: controller.signal })
        if (!response.ok) throw new Error(`loopback ${response.status}: ${url}`)
        return await response.json()
    } finally { clearTimeout(timer) }
}
async function waitOwnedDebugger() {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
        if (spawnError) throw spawnError
        if (exited) throw new Error(`owned Chrome exited: ${stderr}`)
        const file = await fs.readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => null)
        const announced = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:(\d+)(\/devtools\/browser\/[\w-]+))/)
        if (file && announced) {
            const [number, uuidPath, ...extra] = file.trim().split(/\r?\n/)
            if (!/^\d+$/.test(number) || !/^\/devtools\/browser\/[\w-]+$/.test(uuidPath) || extra.length || Number(number) !== Number(announced[2]) || announced[3] !== uuidPath) throw new Error('Ambiguous DevToolsActivePort/child announcement')
            const version = await fetchJson(`http://127.0.0.1:${number}/json/version`)
            if (version.webSocketDebuggerUrl !== announced[1]) throw new Error('Unowned debugger endpoint UUID')
            return { port: Number(number), browser: version.Browser }
        }
        await sleep(100)
    }
    throw new Error('Owned debugger not ready')
}
async function until(fn, label) {
    const deadline = Date.now() + 20000
    while (Date.now() < deadline) {
        const result = await fn().catch(() => false)
        if (result) return result
        await sleep(100)
    }
    throw new Error(`Timed out waiting for ${label}`)
}

try {
    profile = await fs.mkdtemp(join(tmpdir(), 'gampo-qa042-'))
    server = createServer((req, res) => {
        const url = new URL(req.url, origin || 'http://127.0.0.1')
        if (url.pathname === '/api/sportsbook/free-feed') {
            servedIds.push(currentId)
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify(currentData))
            return
        }
        if (req.method !== 'GET' || url.pathname.includes('.')) {
            const file = resolve(dist, `.${decodeURIComponent(url.pathname)}`)
            if (!file.startsWith(`${dist}/`) || !existsSync(file)) { res.writeHead(404); res.end(); return }
            fs.readFile(file).then(body => {
                res.writeHead(200, { 'content-type': mimeTypes[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream', 'cache-control': 'no-store' })
                res.end(body)
            }).catch(() => { res.writeHead(404); res.end() })
            return
        }
        fs.readFile(join(dist, 'index.html')).then(body => {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
            res.end(body)
        }).catch(() => { res.writeHead(500); res.end() })
    })
    await new Promise(r => server.listen(0, '127.0.0.1', r))
    origin = `http://${appHost}:${server.address().port}`

    proc = spawn(browser, [
        '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
        '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-background-networking',
        '--no-proxy-server', `--host-resolver-rules=MAP ${appHost} 127.0.0.1`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    exitPromise = new Promise(resolveExit => {
        proc.once('error', error => { spawnError = error; exited = true; resolveExit({ error }) })
        proc.once('exit', (code, signal) => { exited = true; resolveExit({ code, signal }) })
    })
    proc.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-16000) })
    const owned = await waitOwnedDebugger()
    const target = await fetchJson(`http://127.0.0.1:${owned.port}/json/new?about:blank`, { method: 'PUT' })
    if (target.type !== 'page' || !target.webSocketDebuggerUrl?.startsWith(`ws://127.0.0.1:${owned.port}/devtools/page/`)) throw new Error('Unowned or ambiguous page target')
    const list = await fetchJson(`http://127.0.0.1:${owned.port}/json/list`)
    if (list.filter(item => item.id === target.id && item.webSocketDebuggerUrl === target.webSocketDebuggerUrl).length !== 1 || exited) throw new Error('Page target ownership check failed')
    ws = new WebSocket(target.webSocketDebuggerUrl)
    await bounded(new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject }), 10000, 'Owned page socket open timeout')
    ws.onmessage = event => {
        const message = JSON.parse(event.data)
        if (message.id && pending.has(message.id)) {
            const request = pending.get(message.id)
            pending.delete(message.id)
            clearTimeout(request.timer)
            message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result)
        }
        if (message.method === 'Fetch.requestPaused') {
            const { requestId, request } = message.params
            const url = request.url
            if (url.startsWith(`${origin}/`) || url.startsWith('about:') || url.startsWith('data:')) {
                send('Fetch.continueRequest', { requestId }).catch(error => cdpErrors.push(`continue: ${error.message}`))
                return
            }
            try {
                const host = new URL(url).hostname
                if (fonts.has(host)) deniedFonts.add(host)
                else externalRequests.push(url)
            } catch { externalRequests.push(url) }
            send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(error => cdpErrors.push(`fail: ${error.message}`))
        }
    }
    ws.onclose = () => { for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Owned page socket closed')) } pending.clear() }
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })

    const rows = []
    for (const { width, height, mobile } of viewports) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
        for (const scenario of scenarios) {
            const id = `${width}x${height}-${scenario.name}`
            const cursor = servedIds.length
            currentId = id
            currentData = scenario.data
            const query = `qa042=${encodeURIComponent(id)}`
            await send('Page.navigate', { url: `${origin}/sportsbook?${query}` })
            await until(async () => evaluate(`(() => {
                const root = document.querySelector('.sb-feed-status')
                return location.pathname === '/sportsbook' && location.search === '?${query}'
                    && document.readyState === 'complete' && root && root.className.includes('is-${scenario.state}')
                    && !!document.querySelector('[data-sportsbook-view]')
            })()`), id)
            // First visit can show the Welcome dialog. Dismiss it natively only;
            // never seed or write app state. Hit-test the accessible Close button.
            const welcome = await evaluate(`(() => {
                const card = document.querySelector('.welcome-card[role="dialog"]')
                if (!card) return { present: false }
                const close = card.querySelector('button.welcome-close')
                if (!close) return { present: true }
                const r = close.getBoundingClientRect()
                const x = r.left + r.width / 2, y = r.top + r.height / 2
                const hit = document.elementFromPoint(x, y)
                return { present: true, target: hit === close || close.contains(hit) ? { x, y } : null }
            })()`)
            const closeTarget = welcome.target
            if (closeTarget) {
                await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: closeTarget.x, y: closeTarget.y, button: 'left', clickCount: 1 })
                await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: closeTarget.x, y: closeTarget.y, button: 'left', clickCount: 1 })
                await until(async () => evaluate('!document.querySelector(".welcome-card[role=\\"dialog\\"]")'), 'welcome dialog dismissal')
                welcomeDismissals.push(id)
            }
            if (welcome.present && !closeTarget) welcomeFailures.push(`${id}: Welcome present but Close not natively hit-testable`)
            await evaluate('document.fonts.ready.then(() => true)')
            await sleep(120)
            const geometry = await evaluate(`(() => {
                const root = document.querySelector('.sb-feed-status')
                const copy = root.querySelector(':scope > div')
                const heading = copy.querySelector('strong')
                const body = copy.querySelector('#sportsbook-feed-status-copy')
                const metadata = root.querySelector('dl')
                const fields = [...metadata.querySelectorAll('dt, dd')]
                const box = el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height } }
                const rectsOf = el => { const range = document.createRange(); range.selectNodeContents(el); return [...range.getClientRects()].map(r => ({ left:r.left, right:r.right, top:r.top, bottom:r.bottom })) }
                const hasReadableText = el => Boolean(el.textContent.trim())
                    && getComputedStyle(el).visibility === 'visible'
                    && rectsOf(el).some(r => r.right > r.left && r.bottom > r.top)
                const a = box(copy), b = box(metadata)
                const rects = [heading, body, ...fields].flatMap(rectsOf)
                return {
                    viewport: { width: innerWidth, height: innerHeight }, state: root.className,
                    sourceText: fields[3].textContent,
                    copyReadable: [heading, body].every(hasReadableText),
                    labels: [...metadata.querySelectorAll('dt')].map(dt => ({ text: dt.textContent, readable: hasReadableText(dt) })),
                    copy: a, metadata: b,
                    stageOwned: Boolean(root.closest('.sb-main[data-ux-surface="stage"]')) && document.querySelectorAll('.sb-feed-status').length === 1,
                    headingBodyGap: box(body).top - box(heading).bottom,
                    overlap: a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5,
                    outsideBanner: rects.some(r => r.right > box(root).right + 1 || r.left < box(root).left - 1),
                    contained: rects.every(r => r.left >= -0.5 && r.right <= innerWidth + 0.5),
                    sourceLines: new Set(rectsOf(fields[3]).map(r => Math.round(r.top))).size,
                    clipped: fields.some(field => field.scrollWidth > field.clientWidth + 1),
                    documentScrollWidth: document.documentElement.scrollWidth,
                    welcomeAtMeasurement: !!document.querySelector('.welcome-card[role="dialog"]'),
                }
            })()`)
            rows.push({
                id, requested: { width, height }, scenario: scenario.name, expectedState: scenario.state,
                fixtureRequests: servedIds.slice(cursor).filter(value => value === id).length,
                expectedSources: scenario.sources, ...geometry,
            })
        }
    }

    const failures = []
    if (rows.length !== viewports.length * scenarios.length) failures.push(`row count ${rows.length}`)
    for (const row of rows) {
        const label = row.id
        const stacked = row.requested.width === 390
        if (row.viewport.width !== row.requested.width || row.viewport.height !== row.requested.height) failures.push(`${label}: measured viewport ${row.viewport.width}x${row.viewport.height}`)
        if (!row.state.includes(`is-${row.expectedState}`)) failures.push(`${label}: state ${row.state}`)
        if (row.fixtureRequests < 1) failures.push(`${label}: fixture not observed for this row`)
        if (!row.copyReadable) failures.push(`${label}: unreadable copy`)
        if (row.copy.width < 160) failures.push(`${label}: copy width ${Math.round(row.copy.width)} < 160`)
        if (row.labels.map(({ text }) => text).join('|') !== 'Last refresh|Sources' || row.labels.some(({ readable }) => !readable)) failures.push(`${label}: unreadable metadata labels`)
        if (row.welcomeAtMeasurement) welcomeFailures.push(`${label}: Welcome still present at measurement`)
        if (!row.stageOwned) failures.push(`${label}: expected one status banner owned by the stage`)
        if (row.overlap || row.outsideBanner || !row.contained || row.clipped) failures.push(`${label}: geometry defect`)
        if (row.documentScrollWidth > row.requested.width + 1) failures.push(`${label}: horizontal overflow`)
        if (stacked ? row.copy.bottom > row.metadata.top + 1 : row.copy.right >= row.metadata.left) failures.push(`${label}: stacking/split defect`)
        if (row.scenario === 'empty' || row.scenario === 'error') {
            if (row.sourceText !== 'No attributable source') failures.push(`${label}: fallback source`)
        } else if (row.expectedSources.some(source => !row.sourceText.includes(source))) {
            failures.push(`${label}: full source text missing`)
        }
        if ((row.scenario === 'long-list' || row.scenario === 'unbroken') && row.sourceLines < 2) failures.push(`${label}: no wrap (${row.sourceLines})`)
    }
    if (welcomeFailures.length) failures.push(...welcomeFailures)
    if (externalRequests.length || cdpErrors.length) failures.push(`external ${externalRequests.join(',')}; interception ${cdpErrors.join(',')}`)
    const summary = rows.map(row => ({
        id: row.id, requested: `${row.requested.width}x${row.requested.height}`, measured: `${row.viewport.width}x${row.viewport.height}`,
        scenario: row.scenario, state: row.expectedState, fixtureRequests: row.fixtureRequests,
        copyWidth: Math.round(row.copy.width), metadataLeft: Math.round(row.metadata.left),
        copyTop: Math.round(row.copy.top), metadataTop: Math.round(row.metadata.top), overlap: row.overlap,
        headingBodyGap: Math.round(row.headingBodyGap), stageOwned: row.stageOwned,
        sourceLines: row.sourceLines, sourceCharacters: row.sourceText.length, documentScrollWidth: row.documentScrollWidth,
    }))
    console.log(JSON.stringify({
        browser: owned.browser, origin,
        scope: 'Mounted built /sportsbook SPA in a loopback-only namespace; synthetic feed fixtures; Google Fonts requests denied by the probe',
        rows: summary, deniedFonts: [...deniedFonts], externalRequests, cdpErrors, welcomeDismissals, failures,
    }, null, 2))
    if (failures.length) process.exitCode = 1
} finally {
    if (ws?.readyState === WebSocket.OPEN) {
        try {
            const closed = new Promise(r => ws.addEventListener('close', r, { once: true }))
            ws.close()
            await bounded(closed, 3000, 'owned socket close timeout')
        } catch (error) { process.exitCode = 1; console.error(`owned socket cleanup: ${error.message}`) }
    }
    if (proc?.pid) {
        try {
            if (!exited && !proc.kill('SIGTERM')) throw new Error('could not signal owned Chrome')
            try { await bounded(exitPromise, 5000, 'owned Chrome exit timeout') }
            catch {
                if (!exited && proc.pid && proc.kill('SIGKILL')) await bounded(exitPromise, 3000, 'owned Chrome SIGKILL timeout')
                else throw new Error('could not SIGKILL owned Chrome')
            }
        } catch (error) { process.exitCode = 1; console.error(`owned Chrome cleanup: ${error.message}`) }
    }
    if (profile) {
        try {
            if (!exited && proc?.pid) throw new Error('profile still held by owned Chrome')
            await fs.rm(profile, { recursive: true, maxRetries: 5, retryDelay: 100 })
        } catch (error) { process.exitCode = 1; console.error(`owned profile cleanup: ${error.message}`) }
    }
    if (server) {
        const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
        server.closeAllConnections()
        await bounded(closed, 3000, 'owned server close timeout')
    }
}
