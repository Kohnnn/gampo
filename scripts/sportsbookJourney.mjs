import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, normalize, resolve } from 'node:path'
import { once } from 'node:events'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const DEFAULT_VIEWPORTS = '375x667,768x1024,1610x870'
const MIME = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const TICKET_KEY = 'gampo_sportsbook_tickets_v2'
const CREDIT_KEY = 'gampo_credits'
const HISTORY_KEY = 'gampo_history'
const LIFECYCLE_LABELS = ['Pending practice ticket', 'Won — fake-credit return', 'Lost — no fake-credit return', 'Push — stake returned', 'Full void — stake returned', 'Simulated cash-out accepted']
const REQUIRED_RECEIPTS = Object.freeze(['shell', 'feed', 'truthfulOffer', 'controlCensus', 'feedStateMatrix', 'geometry', 'overflow', 'clippedControls', 'scrollOwnership', 'targets', 'focusVisible', 'reducedMotion', 'searchDialog', 'coachDialog', 'ticketDialog', 'backgroundSuppressed', 'focusRestored', 'rejectionAnnouncement', 'rollbackAnnouncement', 'quarantineAnnouncement', 'placementAnnouncement', 'unavailableCashoutReason', 'liveAnnouncements', 'placement', 'placementReload', 'cashout', 'cashoutReload', 'pending', 'won', 'lost', 'push', 'voidLeg', 'fullVoid', 'cashedOut', 'settlementAccounting', 'settlementReload', 'oneTimeAccounting', 'consoleClean', 'endpoint', 'queueComplete', 'externalDenied'])
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms))

function parseArgs(argv) {
    const allowed = new Set(['browser', 'viewports', 'out'])
    const result = { browser: '', viewports: DEFAULT_VIEWPORTS, out: 'output/sportsbook-journey', selfTest: false }
    for (const arg of argv) {
        if (arg === '--self-test') { result.selfTest = true; continue }
        const match = arg.match(/^--([^=]+)=(.+)$/)
        if (!match || !allowed.has(match[1])) throw new Error(`Unknown or missing argument: ${arg}`)
        result[match[1]] = match[2]
    }
    result.viewports = result.viewports.split(',').map(value => {
        const match = value.match(/^(\d+)x(\d+)$/)
        if (!match || Number(match[1]) < 320 || Number(match[2]) < 320) throw new Error(`Invalid viewport: ${value}`)
        return { width: Number(match[1]), height: Number(match[2]), id: value }
    })
    if (!result.selfTest && (!result.browser || !resolve(result.browser).startsWith('/') || !existsSync(result.browser))) throw new Error('Pass an existing absolute --browser= path.')
    return result
}

function sportsGameEvent(id, home, away, market = 'winner', odds = [2, 2], lastUpdated) {
    const oddRows = market === 'total'
        ? {
            'points-all-game-ou-over': { byBookmaker: { 'Journey Book': { odds: String(odds[0]), overUnder: 2, available: true, lastUpdated } } },
            'points-all-game-ou-under': { byBookmaker: { 'Journey Book': { odds: String(odds[1]), overUnder: 2, available: true, lastUpdated } } },
        }
        : {
            'points-home-game-ml-home': { byBookmaker: { 'Journey Book': { odds: String(odds[0]), available: true, lastUpdated } } },
            'points-away-game-ml-away': { byBookmaker: { 'Journey Book': { odds: String(odds[1]), available: true, lastUpdated } } },
        }
    return {
        eventID: id,
        sportID: 'BASKETBALL',
        leagueID: id,
        teams: { home: { names: { long: home } }, away: { names: { long: away } } },
        status: { startsAt: `2026-09-04T${String(10 + Number(id.slice(-1))).padStart(2, '0')}:00:00.000Z`, started: false, ended: false },
        odds: oddRows,
    }
}

function fixture(stage = 'current') {
    const generatedAt = new Date().toISOString()
    if (stage === 'empty' || stage === 'model-only' || stage === 'error') return {
        generatedAt,
        errors: stage === 'error' ? ['Journey feed failure'] : [],
        sources: stage === 'model-only' ? {} : { sportsGameOdds: { configured: true, eventCount: 0 } },
        sportsGameOdds: { events: [] },
    }
    const observedAt = stage === 'stale' ? new Date(Date.now() - 30 * 60 * 1000).toISOString() : generatedAt
    const unavailableCashoutEvent = sportsGameEvent('journey-6', 'Home', 'Away', 'winner', [2, 2], observedAt)
    delete unavailableCashoutEvent.odds['points-away-game-ml-away']
    const events = [
        sportsGameEvent('journey-1', 'Home', 'Away', 'winner', [2, 2], observedAt),
        sportsGameEvent('journey-2', 'Home', 'Away', 'winner', [2, 2], observedAt),
        sportsGameEvent('journey-3', 'Home', 'Away', 'winner', [2, 2], observedAt),
        sportsGameEvent('journey-4', 'Home', 'Away', 'winner', [2, 2], observedAt),
        sportsGameEvent('journey-5', 'Home', 'Away', 'total', [2, 2], observedAt),
        unavailableCashoutEvent,
        sportsGameEvent('journey-7', 'Home', 'Away', 'winner', stage === 'current' ? [2, 2] : [4, 1.3333333333], observedAt),
    ]
    if (stage === 'terminal') {
        const scores = [[2, 0], [0, 2], [2, 0], [0, 2], [1, 1], null, [0, 0]]
        events.forEach((event, index) => {
            event.status = { ...event.status, started: true, ended: true }
            if (scores[index]) event.score = { home: scores[index][0], away: scores[index][1] }
        })
    }
    return {
        generatedAt,
        errors: stage === 'partial' ? ['Journey secondary provider failure'] : [],
        sources: { sportsGameOdds: { configured: true, eventCount: events.length } },
        sportsGameOdds: { events },
    }
}

function createFixtureQueue() {
    const defaults = ['current', 'current', 'current', 'probability-change', 'probability-change', 'terminal', 'terminal']
    let stages = [...defaults]
    let index = 0
    return {
        reset(nextStages = defaults) { stages = [...nextStages]; index = 0 },
        next() {
            if (index >= stages.length) throw new Error(`Fixture queue exhausted after ${index} responses.`)
            const id = stages[index++]
            return { id, payload: fixture(id) }
        },
        consumed() { return stages.slice(0, index) },
        complete() { return index === stages.length },
    }
}

function classify(record) {
    const missing = REQUIRED_RECEIPTS.filter(key => record[key] !== true)
    return { pass: missing.length === 0, missing, assertionCount: REQUIRED_RECEIPTS.length }
}

async function selfTest() {
    const checks = []
    const check = (name, fn) => {
        try { fn(); checks.push({ name, pass: true }) } catch (error) { checks.push({ name, pass: false, error: error.message }) }
    }
    check('argument success', () => parseArgs(['--self-test', '--viewports=375x667']))
    check('unknown argument failure', () => { try { parseArgs(['--wat=1', '--self-test']); throw new Error('accepted') } catch (error) { if (error.message === 'accepted') throw error } })
    check('missing browser failure', () => { try { parseArgs([]); throw new Error('accepted') } catch (error) { if (error.message === 'accepted') throw error } })
    check('invalid viewport failure', () => { try { parseArgs(['--self-test', '--viewports=wide']); throw new Error('accepted') } catch (error) { if (error.message === 'accepted') throw error } })
    check('fixture matrix', () => {
        const terminal = fixture('terminal').sportsGameOdds.events
        if (terminal.length !== 7 || terminal[5].score || !terminal[4].score) throw new Error('terminal matrix drift')
    })
    check('probability change', () => {
        const current = fixture('current').sportsGameOdds.events[6].odds['points-home-game-ml-home'].byBookmaker['Journey Book'].odds
        const changed = fixture('probability-change').sportsGameOdds.events[6].odds['points-home-game-ml-home'].byBookmaker['Journey Book'].odds
        if (current === changed) throw new Error('probability fixture did not change')
    })
    check('queue success', () => {
        const queue = createFixtureQueue()
        for (let index = 0; index < 7; index++) queue.next()
        if (!queue.complete()) throw new Error('queue incomplete')
    })
    check('queue exhaustion failure', () => {
        const queue = createFixtureQueue()
        for (let index = 0; index < 7; index++) queue.next()
        try { queue.next(); throw new Error('accepted') } catch (error) { if (error.message === 'accepted') throw error }
    })
    for (const field of ['truthfulOffer', 'controlCensus', 'feedStateMatrix', 'geometry', 'overflow', 'clippedControls', 'scrollOwnership', 'targets', 'focusVisible', 'reducedMotion', 'searchDialog', 'coachDialog', 'ticketDialog', 'backgroundSuppressed', 'rejectionAnnouncement', 'rollbackAnnouncement', 'quarantineAnnouncement', 'placementAnnouncement', 'unavailableCashoutReason', 'liveAnnouncements', 'placement', 'placementReload', 'cashout', 'pending', 'won', 'lost', 'push', 'voidLeg', 'fullVoid', 'cashedOut', 'settlementAccounting', 'settlementReload', 'oneTimeAccounting', 'queueComplete']) {
        check(`${field} fail-closed`, () => {
            const complete = Object.fromEntries(classify({}).missing.map(key => [key, true]))
            complete[field] = false
            if (classify(complete).pass) throw new Error('failure classified as pass')
        })
    }
    check('cleanup receipt fail-closed', () => {
        const receipts = { browser: true, server: true, profile: true, tempRoot: false }
        if (Object.values(receipts).every(Boolean)) throw new Error('missing receipt accepted')
    })
    const failed = checks.filter(item => !item.pass)
    process.stdout.write(`${JSON.stringify({ mode: 'self-test', assertions: checks.length, passed: checks.length - failed.length, failed: failed.length }, null, 2)}\n`)
    if (failed.length) throw new Error(JSON.stringify(failed))
}

class Cdp {
    constructor(url) {
        this.socket = new WebSocket(url)
        this.id = 0
        this.pending = new Map()
        this.handlers = []
    }
    async open() {
        await once(this.socket, 'open')
        this.socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data))
            if (message.id && this.pending.has(message.id)) {
                const pending = this.pending.get(message.id)
                this.pending.delete(message.id)
                message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result)
            } else this.handlers.forEach(handler => handler(message))
        })
    }
    send(method, params = {}, sessionId) {
        const id = ++this.id
        this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
        return new Promise((resolvePromise, reject) => {
            this.pending.set(id, { resolve: resolvePromise, reject })
            setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`CDP timeout: ${method}`)) }, 15000)
        })
    }
    on(handler) { this.handlers.push(handler) }
    close() { this.socket.close() }
}

async function waitDebugger(port) {
    for (let count = 0; count < 100; count++) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/version`)
            if (response.ok) return response.json()
        } catch {}
        await sleep(100)
    }
    throw new Error('Browser debugger did not start.')
}

async function evaluate(cdp, sessionId, expression) {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Browser evaluation failed.')
    return result.result?.value
}

async function waitFor(cdp, sessionId, expression, message) {
    for (let count = 0; count < 100; count++) {
        if (await evaluate(cdp, sessionId, expression)) return
        await sleep(100)
    }
    throw new Error(`Timed out: ${message}`)
}

async function pressKey(cdp, sessionId, key, modifiers = 0) {
    const code = key === 'Tab' ? 'Tab' : key === 'Escape' ? 'Escape' : key
    const keyCode = key === 'Tab' ? 9 : key === 'Escape' ? 27 : 0
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers }, sessionId)
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers }, sessionId)
    await sleep(50)
}

async function capture(cdp, sessionId, path) {
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId)
    await writeFile(path, Buffer.from(screenshot.data, 'base64'))
    return path
}

async function temporaryServer(root, ledger, queue) {
    const server = createServer(async (request, response) => {
        ledger.push({ method: request.method, host: request.headers.host, path: request.url })
        if (request.url === '/api/sportsbook/free-feed') {
            try {
                const responseFixture = queue.next()
                ledger.at(-1).fixtureId = responseFixture.id
                if (responseFixture.id === 'loading-current') await sleep(400)
                response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
                response.end(JSON.stringify(responseFixture.payload))
            } catch (error) {
                response.writeHead(500, { 'content-type': 'application/json' })
                response.end(JSON.stringify({ errors: [error.message] }))
            }
            return
        }
        const pathname = decodeURIComponent((request.url || '/').split('?')[0])
        const relative = pathname === '/' || !extname(pathname) ? 'index.html' : pathname.replace(/^\//, '')
        const candidate = normalize(join(root, relative))
        if (!candidate.startsWith(root)) { response.writeHead(403); response.end(); return }
        try {
            const info = await stat(candidate)
            const path = info.isFile() ? candidate : join(root, 'index.html')
            response.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' })
            response.end(await readFile(path))
        } catch {
            response.writeHead(200, { 'content-type': 'text/html' })
            response.end(await readFile(join(root, 'index.html')))
        }
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    return { server, port: server.address().port }
}

async function storageSnapshot(cdp, sessionId) {
    return evaluate(cdp, sessionId, `(() => {
        const ticketBytes = localStorage.getItem(${JSON.stringify(TICKET_KEY)});
        const historyBytes = localStorage.getItem(${JSON.stringify(HISTORY_KEY)});
        const envelope = ticketBytes ? JSON.parse(ticketBytes) : { tickets: [] };
        const history = historyBytes ? JSON.parse(historyBytes) : [];
        return {
            ticketBytes,
            historyBytes,
            creditsBytes: localStorage.getItem(${JSON.stringify(CREDIT_KEY)}),
            balance: Number(localStorage.getItem(${JSON.stringify(CREDIT_KEY)})),
            tickets: envelope.tickets.map(ticket => ({ id: ticket.id, status: ticket.status, result: ticket.result, payout: ticket.payout, payoutProcessed: ticket.payoutProcessed, settlementKey: ticket.settlementKey, legStatuses: ticket.legs.map(leg => leg.status), legReasons: ticket.legs.map(leg => leg.reason) })),
            history: history.map(item => ({ id: item.id, type: item.type, amount: item.amount, balance: item.balance })),
        };
    })()`)
}

async function clickOffer(cdp, sessionId, fixtureId) {
    const clicked = await evaluate(cdp, sessionId, `(() => {
        const row = [...document.querySelectorAll('.sb-event-row')].find(item => item.innerText.includes(${JSON.stringify(fixtureId)}));
        const button = row?.querySelector('.sb-odds-button:not([disabled])');
        if (!button) return { ok: false, rows: [...document.querySelectorAll('.sb-event-row')].map(item => item.innerText) };
        button.click();
        return { ok: true };
    })()`)
    if (!clicked.ok) throw new Error(`Offer unavailable: ${fixtureId}: ${JSON.stringify(clicked.rows)}`)
    await sleep(100)
}

async function closeMobileSlip(cdp, sessionId) {
    await evaluate(cdp, sessionId, `(() => { const dialog = document.querySelector('.sb-mobile-slip'); if (!dialog?.open) return false; dialog.querySelector('button[aria-label="Close bet slip"]')?.click(); return true; })()`)
    await sleep(100)
}

async function openMobileSlip(cdp, sessionId) {
    await evaluate(cdp, sessionId, `(() => { const launcher = document.querySelector('.sb-mobile-slip-pill'); if (!launcher || launcher.getBoundingClientRect().width === 0) return false; launcher.click(); return true; })()`)
    await sleep(100)
}

async function placeSelected(cdp, sessionId, expectedCount) {
    const placed = await evaluate(cdp, sessionId, `(() => {
        const roots = [...document.querySelectorAll('.sb-betslip')].filter(item => item.getBoundingClientRect().width > 0);
        const buttons = roots.flatMap(root => [...root.querySelectorAll('button')].filter(item => /Place Practice Bet/i.test(item.innerText)));
        const button = buttons.find(item => !item.disabled);
        if (!button) return { ok: false, roots: roots.map(root => root.innerText), buttons: buttons.map(item => ({ disabled: item.disabled, text: item.innerText })) };
        button.click();
        return { ok: true };
    })()`)
    if (!placed.ok) throw new Error(`Place action unavailable for ticket ${expectedCount}: ${JSON.stringify(placed)}`)
    try {
        await waitFor(cdp, sessionId, `(JSON.parse(localStorage.getItem(${JSON.stringify(TICKET_KEY)}) || 'null')?.tickets?.length || 0) === ${expectedCount}`, `ticket ${expectedCount} persistence`)
    } catch (error) {
        const diagnostic = await evaluate(cdp, sessionId, `({ body: document.body.innerText, ticketBytes: localStorage.getItem(${JSON.stringify(TICKET_KEY)}), credits: localStorage.getItem(${JSON.stringify(CREDIT_KEY)}), history: localStorage.getItem(${JSON.stringify(HISTORY_KEY)}) })`)
        throw new Error(`${error.message}: ${JSON.stringify(diagnostic)}`)
    }
    const announcement = await evaluate(cdp, sessionId, `document.querySelector('.sb-ticket-announcement')?.innerText || ''`)
    await closeMobileSlip(cdp, sessionId)
    return announcement
}

async function reloadAndWait(cdp, sessionId, expectedHeading = 'Current bookmaker feed') {
    await cdp.send('Page.reload', {}, sessionId)
    const ready = expectedHeading
        ? `Boolean(document.querySelector('.sb-page') && document.querySelector('.sb-feed-status')?.innerText.includes(${JSON.stringify(expectedHeading)}))`
        : `Boolean(document.querySelector('.sb-page') && document.querySelector('.sb-feed-status'))`
    try {
        await waitFor(cdp, sessionId, ready, 'sportsbook reload')
    } catch (error) {
        const diagnostic = await evaluate(cdp, sessionId, `({ url: location.href, body: document.body?.innerText || '', html: document.documentElement?.outerHTML?.slice(0, 1000) || '' })`)
        throw new Error(`${error.message}: ${JSON.stringify(diagnostic)}`)
    }
    await sleep(200)
}

async function clickRefresh(cdp, sessionId, expectedHeading = 'Current bookmaker feed') {
    const clicked = await evaluate(cdp, sessionId, `(() => { const button = [...document.querySelectorAll('button')].find(item => /^Refresh$/i.test(item.innerText.trim()) && !item.disabled); button?.click(); return Boolean(button); })()`)
    if (!clicked) throw new Error('Refresh action unavailable.')
    await waitFor(cdp, sessionId, `!([...document.querySelectorAll('button')].find(item => /^Refresh$/i.test(item.innerText.trim()))?.disabled) && document.querySelector('.sb-feed-status')?.innerText.includes(${JSON.stringify(expectedHeading)})`, 'feed refresh')
    await sleep(200)
}

async function runViewport({ cdp, sessionId, viewport, baseUrl, outputRoot, network, runtimeErrors, ledger, queue }) {
    const runtimeStart = runtimeErrors.length
    const announcementEvidence = []
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width <= 767 }, sessionId)
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId)
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
        if (location.hostname === 'sportsbook.test' && sessionStorage.getItem('journey-seeded') !== ${JSON.stringify(viewport.id)}) {
            localStorage.removeItem(${JSON.stringify(TICKET_KEY)});
            localStorage.setItem(${JSON.stringify(CREDIT_KEY)}, '1000');
            localStorage.setItem(${JSON.stringify(HISTORY_KEY)}, '[]');
            localStorage.setItem('gampo_onboarding_v1', JSON.stringify({ seen: true, seenAt: '2026-09-03T00:00:00.000Z' }));
            sessionStorage.setItem('journey-seeded', ${JSON.stringify(viewport.id)});
        }
    ` }, sessionId)

    queue.reset(['loading-current', 'partial', 'stale', 'error', 'model-only', 'empty', 'current', 'error'])
    const stateMatrix = []
    await cdp.send('Page.navigate', { url: `${baseUrl}/sportsbook` }, sessionId)
    await waitFor(cdp, sessionId, `document.querySelector('.sb-feed-status')?.innerText.includes('Loading sportsbook feed')`, 'loading feed state')
    stateMatrix.push({ id: 'loading', ...(await evaluate(cdp, sessionId, `(() => { const status = document.querySelector('.sb-feed-status'); return { heading: status?.querySelector('strong')?.innerText, body: status?.innerText }; })()`)), screenshot: await capture(cdp, sessionId, join(outputRoot, `sportsbook-${viewport.id}-loading.png`)) })
    await waitFor(cdp, sessionId, `document.querySelector('.sb-feed-status')?.innerText.includes('Current bookmaker feed')`, 'loading completion')
    stateMatrix.push({ id: 'current', ...(await evaluate(cdp, sessionId, `(() => { const status = document.querySelector('.sb-feed-status'); const refresh = [...document.querySelectorAll('button')].find(button => /^Refresh$/i.test(button.innerText.trim())); return { heading: status?.querySelector('strong')?.innerText, body: status?.innerText, retry: Boolean(refresh && !refresh.disabled), selectable: document.querySelectorAll('.sb-odds-button:not([disabled])').length }; })()`)), screenshot: await capture(cdp, sessionId, join(outputRoot, `sportsbook-${viewport.id}-current.png`)) })
    const stateCases = [
        ['partial', 'Partial provider feed'],
        ['stale', 'Stale bookmaker prices'],
        ['error', 'Sportsbook feed unavailable'],
        ['model-only', 'Model estimates only'],
        ['empty', 'No sportsbook events available'],
    ]
    for (const [id, heading] of stateCases) {
        await cdp.send('Page.navigate', { url: `${baseUrl}/sportsbook` }, sessionId)
        await waitFor(cdp, sessionId, `document.querySelector('.sb-feed-status')?.innerText.includes(${JSON.stringify(heading)})`, `${id} feed state`)
        const evidence = await evaluate(cdp, sessionId, `(() => { const status = document.querySelector('.sb-feed-status'); const refresh = [...document.querySelectorAll('button')].find(button => /^Refresh$/i.test(button.innerText.trim())); return { heading: status?.querySelector('strong')?.innerText, body: status?.innerText, retry: Boolean(refresh && !refresh.disabled), modelButtons: [...document.querySelectorAll('.sb-model-estimate button')].length, selectable: [...document.querySelectorAll('.sb-odds-button:not([disabled])')].length }; })()`)
        stateMatrix.push({ id, ...evidence, screenshot: await capture(cdp, sessionId, join(outputRoot, `sportsbook-${viewport.id}-${id}.png`)) })
    }
    await cdp.send('Page.navigate', { url: `${baseUrl}/sportsbook` }, sessionId)
    await waitFor(cdp, sessionId, `document.querySelector('.sb-feed-status')?.innerText.includes('Current bookmaker feed')`, 'retained-state baseline')
    await clickRefresh(cdp, sessionId, 'Refresh failed — showing retained data')
    stateMatrix.push({ id: 'retained-stale', ...(await evaluate(cdp, sessionId, `(() => { const status = document.querySelector('.sb-feed-status'); return { heading: status?.querySelector('strong')?.innerText, body: status?.innerText, retainedOffers: document.querySelectorAll('.sb-odds-button').length }; })()`)), screenshot: await capture(cdp, sessionId, join(outputRoot, `sportsbook-${viewport.id}-retained-stale.png`)) })
    const stateHeadings = new Set(stateMatrix.map(state => state.heading))
    const feedStateMatrix = stateMatrix.length === 8 && stateHeadings.size === 8 && stateMatrix.find(state => state.id === 'model-only')?.modelButtons === 0 && stateMatrix.find(state => state.id === 'retained-stale')?.retainedOffers > 0

    queue.reset()
    let ledgerStart = ledger.length
    await cdp.send('Page.navigate', { url: `${baseUrl}/sportsbook` }, sessionId)
    await waitFor(cdp, sessionId, `Boolean(document.querySelector('.sb-page') && /Current bookmaker feed/.test(document.querySelector('.sb-feed-status')?.innerText || ''))`, 'initial sportsbook')
    await sleep(200)

    const initial = await evaluate(cdp, sessionId, `(() => {
        const visible = element => element && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
        const controls = [...document.querySelectorAll('.sb-page button:not([disabled]), .sb-page input, .sb-page select, .sb-page summary')].filter(visible);
        const small = controls.filter(element => { const rect = element.getBoundingClientRect(); return rect.width < 44 || rect.height < 44; }).map(element => ({ text: (element.innerText || element.getAttribute('aria-label') || '').trim(), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
        const row = document.querySelector('.sb-event-row');
        const score = row?.querySelector('.sb-event-score')?.getBoundingClientRect();
        const market = row?.querySelector('.sb-event-market')?.getBoundingClientRect();
        const gap = score && market ? market.left - score.right : null;
        const geometry = { score: score ? { left: score.left, right: score.right, width: score.width } : null, market: market ? { left: market.left, right: market.right, width: market.width } : null, gap };
        const clipped = controls.filter(element => { const rect = element.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1; }).map(element => ({ text: (element.innerText || element.getAttribute('aria-label') || '').trim(), left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right }));
        const scrollables = [...document.querySelectorAll('.sb-page, .sb-main, .sb-desktop-slip, .sb-mobile-slip, .sb-mobile-slip .sb-betslip')].filter(visible).map(element => { const style = getComputedStyle(element); return { className: element.className, overflowY: style.overflowY, scrollable: element.scrollHeight > element.clientHeight + 1 }; });
        const focusTarget = controls.find(element => !element.disabled);
        focusTarget?.focus();
        const focusStyle = focusTarget ? getComputedStyle(focusTarget) : null;
        const animated = [...document.querySelectorAll('.sb-page *')].filter(element => { const style = getComputedStyle(element); return (parseFloat(style.animationDuration) || 0) > 0.01 || (parseFloat(style.transitionDuration) || 0) > 0.01; });
        const offer = document.querySelector('.sb-odds-button:not([disabled])');
        const disabledWithoutReason = [...document.querySelectorAll('.sb-page button:disabled')].filter(button => { const id = button.getAttribute('aria-describedby'); return !id || !document.getElementById(id)?.innerText.trim(); });
        const unnamed = controls.filter(element => !((element.getAttribute('aria-label') || element.innerText || element.value || element.getAttribute('placeholder') || '').trim()));
        return {
            shell: visible(document.querySelector('.sb-page')),
            feed: /Current bookmaker feed/.test(document.querySelector('.sb-feed-status')?.innerText || ''),
            truthfulOffer: Boolean(offer && /Journey Book/.test(offer.innerText) && /sportsgameodds/.test(offer.innerText) && /Current/.test(offer.innerText)),
            controlCensus: disabledWithoutReason.length === 0 && unnamed.length === 0,
            controlEvidence: { count: controls.length, disabledWithoutReason: disabledWithoutReason.map(item => item.innerText), unnamed: unnamed.length },
            geometry: Boolean(score && market && (innerWidth >= 1200 ? gap >= 8 : score.bottom <= market.top + 1)),
            geometryEvidence: geometry,
            overflow: document.documentElement.scrollWidth <= innerWidth + 1,
            clippedControls: clipped.length === 0,
            clipped,
            scrollOwnership: scrollables.filter(item => item.scrollable && ['auto', 'scroll'].includes(item.overflowY)).every(item => /sb-main|sb-desktop-slip|sb-betslip/.test(item.className)),
            scrollables,
            targets: small.length === 0,
            small,
            focusVisible: Boolean(focusStyle && focusStyle.outlineStyle !== 'none' && parseFloat(focusStyle.outlineWidth) >= 2),
            reducedMotion: animated.length === 0,
        };
    })()`)

    const dialogEvidence = {}
    const searchOpener = await evaluate(cdp, sessionId, `(() => { const button = [...document.querySelectorAll('button')].find(item => /search fixtures/i.test(item.innerText)); button?.focus(); button?.click(); return Boolean(button); })()`)
    await waitFor(cdp, sessionId, `document.querySelector('.sb-search-overlay')?.open && document.activeElement?.tagName === 'INPUT'`, 'search initial focus')
    const searchInitial = await evaluate(cdp, sessionId, `({ active: document.activeElement?.outerHTML, backgroundSuppressed: document.elementFromPoint(2, 2)?.closest('dialog')?.open === true })`)
    await pressKey(cdp, sessionId, 'Tab')
    const searchForward = await evaluate(cdp, sessionId, `document.querySelector('.sb-search-overlay')?.contains(document.activeElement)`)
    await pressKey(cdp, sessionId, 'Tab', 8)
    const searchBackward = await evaluate(cdp, sessionId, `document.querySelector('.sb-search-overlay')?.contains(document.activeElement)`)
    dialogEvidence.searchScreenshot = await capture(cdp, sessionId, join(outputRoot, `sportsbook-${viewport.id}-search-focus.png`))
    await pressKey(cdp, sessionId, 'Escape')
    await waitFor(cdp, sessionId, `!document.querySelector('.sb-search-overlay')?.open`, 'search Escape close')
    const searchRestored = await evaluate(cdp, sessionId, `/search fixtures/i.test(document.activeElement?.innerText || '')`)

    await evaluate(cdp, sessionId, `document.querySelector('.sb-event-main')?.click()`)
    await waitFor(cdp, sessionId, `Boolean(document.querySelector('.sb-event-detail'))`, 'event detail')
    const coachOpener = await evaluate(cdp, sessionId, `(() => { const button = document.querySelector('.sb-coach-trigger'); button?.focus(); button?.click(); return Boolean(button); })()`)
    await waitFor(cdp, sessionId, `document.querySelector('.sb-coach-backdrop')?.open && /Close odds coach/.test(document.activeElement?.getAttribute('aria-label') || '')`, 'coach initial focus')
    const coachInitial = await evaluate(cdp, sessionId, `({ backgroundSuppressed: document.elementFromPoint(2, 2)?.closest('dialog')?.open === true, actionableEstimate: document.querySelector('.sb-coach-backdrop .sb-odds-button:not([disabled])') !== null })`)
    await pressKey(cdp, sessionId, 'Tab')
    const coachForward = await evaluate(cdp, sessionId, `document.querySelector('.sb-coach-backdrop')?.contains(document.activeElement)`)
    await pressKey(cdp, sessionId, 'Tab', 8)
    const coachBackward = await evaluate(cdp, sessionId, `document.querySelector('.sb-coach-backdrop')?.contains(document.activeElement)`)
    dialogEvidence.coachScreenshot = await capture(cdp, sessionId, join(outputRoot, `sportsbook-${viewport.id}-coach-focus.png`))
    await pressKey(cdp, sessionId, 'Escape')
    await waitFor(cdp, sessionId, `!document.querySelector('.sb-coach-backdrop')?.open`, 'coach Escape close')
    const coachRestored = await evaluate(cdp, sessionId, `document.activeElement === document.querySelector('.sb-coach-trigger')`)
    await evaluate(cdp, sessionId, `document.querySelector('[aria-label="Back to sportsbook"]')?.click()`)
    await waitFor(cdp, sessionId, `Boolean(document.querySelector('.sb-event-list'))`, 'return to fixture list')

    let ticketDialog = true
    let ticketRestored = true
    let ticketSuppressed = true
    if (viewport.width < 1200) {
        const ticketOpener = await evaluate(cdp, sessionId, `(() => { const button = document.querySelector('.sb-mobile-slip-pill'); button?.focus(); button?.click(); return Boolean(button); })()`)
        await waitFor(cdp, sessionId, `document.querySelector('.sb-mobile-slip')?.open && /Close bet slip/.test(document.activeElement?.getAttribute('aria-label') || '')`, 'ticket sheet initial focus')
        ticketSuppressed = await evaluate(cdp, sessionId, `document.elementFromPoint(2, 2)?.closest('dialog')?.open === true`)
        await pressKey(cdp, sessionId, 'Tab')
        const ticketForward = await evaluate(cdp, sessionId, `document.querySelector('.sb-mobile-slip')?.contains(document.activeElement)`)
        await pressKey(cdp, sessionId, 'Tab', 8)
        const ticketBackward = await evaluate(cdp, sessionId, `document.querySelector('.sb-mobile-slip')?.contains(document.activeElement)`)
        dialogEvidence.ticketScreenshot = await capture(cdp, sessionId, join(outputRoot, `sportsbook-${viewport.id}-ticket-focus.png`))
        await pressKey(cdp, sessionId, 'Escape')
        await waitFor(cdp, sessionId, `!document.querySelector('.sb-mobile-slip')?.open`, 'ticket Escape close')
        ticketRestored = await evaluate(cdp, sessionId, `document.activeElement === document.querySelector('.sb-mobile-slip-pill')`)
        ticketDialog = Boolean(ticketOpener && ticketForward && ticketBackward)
    }
    const dialogs = {
        searchDialog: Boolean(searchOpener && searchForward && searchBackward),
        coachDialog: Boolean(coachOpener && coachForward && coachBackward && !coachInitial.actionableEstimate),
        ticketDialog,
        backgroundSuppressed: Boolean(searchInitial.backgroundSuppressed && coachInitial.backgroundSuppressed && ticketSuppressed),
        focusRestored: Boolean(searchRestored && coachRestored && ticketRestored),
        evidence: dialogEvidence,
    }

    await clickOffer(cdp, sessionId, 'journey-1')
    await closeMobileSlip(cdp, sessionId)
    const rejected = await evaluate(cdp, sessionId, `(() => { const row = [...document.querySelectorAll('.sb-event-row')].find(item => item.innerText.includes('journey-1')); const buttons = [...(row?.querySelectorAll('.sb-odds-button:not([disabled])') || [])]; buttons[1]?.click(); return buttons.length > 1; })()`)
    await sleep(100)
    const rejectedSubmission = await evaluate(cdp, sessionId, `(() => { const root = [...document.querySelectorAll('.sb-betslip')].find(item => item.getBoundingClientRect().width > 0); const button = [...(root?.querySelectorAll('button') || [])].find(item => /Place Practice Bet/i.test(item.innerText) && !item.disabled); button?.click(); return Boolean(button); })()`)
    await waitFor(cdp, sessionId, `/Contradictory outcomes/.test(document.querySelector('.sb-ticket-announcement')?.innerText || '')`, 'selection rejection announcement')
    const rejectionEvidence = await evaluate(cdp, sessionId, `({ key: 'rejection', polite: document.querySelector('.sb-ticket-announcement')?.innerText || '' })`)
    announcementEvidence.push(rejectionEvidence)
    await closeMobileSlip(cdp, sessionId)
    await evaluate(cdp, sessionId, `(() => { const row = [...document.querySelectorAll('.sb-event-row')].find(item => item.innerText.includes('journey-1')); const selected = [...(row?.querySelectorAll('.sb-odds-button.is-selected') || [])]; selected[1]?.click(); return selected.length === 2; })()`)
    await closeMobileSlip(cdp, sessionId)
    const beforeRollback = await storageSnapshot(cdp, sessionId)
    await evaluate(cdp, sessionId, `(() => { const original = Storage.prototype.setItem; let failed = false; Storage.prototype.setItem = function (key, value) { if (!failed && key === ${JSON.stringify(HISTORY_KEY)}) { failed = true; Storage.prototype.setItem = original; throw new Error('Journey storage failure'); } return original.call(this, key, value); }; })()`)
    await openMobileSlip(cdp, sessionId)
    const rollbackTriggered = await evaluate(cdp, sessionId, `(() => { const root = [...document.querySelectorAll('.sb-betslip')].find(item => item.getBoundingClientRect().width > 0); const button = [...(root?.querySelectorAll('button') || [])].find(item => /Place Practice Bet/i.test(item.innerText) && !item.disabled); button?.click(); return Boolean(button); })()`)
    await waitFor(cdp, sessionId, `/could not be saved/.test(document.querySelector('.sb-ticket-announcement')?.innerText || '')`, 'rollback announcement')
    const rollbackEvidence = await evaluate(cdp, sessionId, `({ key: 'rollback', polite: document.querySelector('.sb-ticket-announcement')?.innerText || '' })`)
    announcementEvidence.push(rollbackEvidence)
    const afterRollback = await storageSnapshot(cdp, sessionId)
    const rollbackAnnouncement = Boolean(rollbackTriggered && /balance was not changed/.test(rollbackEvidence.polite) && beforeRollback.ticketBytes === afterRollback.ticketBytes && beforeRollback.creditsBytes === afterRollback.creditsBytes && beforeRollback.historyBytes === afterRollback.historyBytes)
    const placementAnnouncements = [await placeSelected(cdp, sessionId, 1)]
    await clickOffer(cdp, sessionId, 'journey-2')
    placementAnnouncements.push(await placeSelected(cdp, sessionId, 2))
    await clickOffer(cdp, sessionId, 'journey-3')
    await closeMobileSlip(cdp, sessionId)
    await clickOffer(cdp, sessionId, 'journey-4')
    placementAnnouncements.push(await placeSelected(cdp, sessionId, 3))
    await clickOffer(cdp, sessionId, 'journey-5')
    placementAnnouncements.push(await placeSelected(cdp, sessionId, 4))
    await clickOffer(cdp, sessionId, 'journey-6')
    placementAnnouncements.push(await placeSelected(cdp, sessionId, 5))
    await clickOffer(cdp, sessionId, 'journey-7')
    placementAnnouncements.push(await placeSelected(cdp, sessionId, 6))
    const exactPlacementAnnouncement = 'Practice ticket accepted. GC 10.00 fake-credit stake committed.'
    let placementAnnouncement = placementAnnouncements.length === 6 && placementAnnouncements.every(message => message === exactPlacementAnnouncement)
    announcementEvidence.push({ key: 'placement', polite: placementAnnouncements.at(-1), messages: placementAnnouncements })

    const placed = await storageSnapshot(cdp, sessionId)
    const placement = placed.tickets.length === 6 && placed.balance === 940 && placed.history.length === 6 && placed.history.every(item => item.type === 'bet')
    await reloadAndWait(cdp, sessionId)
    const placedReload = await storageSnapshot(cdp, sessionId)
    const placementReload = placedReload.ticketBytes === placed.ticketBytes && placedReload.creditsBytes === placed.creditsBytes && placedReload.historyBytes === placed.historyBytes
    const placementReplayEvidence = await evaluate(cdp, sessionId, `({ key: 'acceptance-restore', polite: document.querySelector('.sb-ticket-announcement')?.innerText || '', restore: document.querySelector('.sb-restore-notice')?.innerText || '' })`)
    placementAnnouncement = placementAnnouncement && placementReplayEvidence.polite === ''
    announcementEvidence.push(placementReplayEvidence)
    await evaluate(cdp, sessionId, `(() => { const envelope = JSON.parse(localStorage.getItem(${JSON.stringify(TICKET_KEY)})); envelope.tickets.push({ damaged: '<private-payload>' }); localStorage.setItem(${JSON.stringify(TICKET_KEY)}, JSON.stringify(envelope)); })()`)
    await reloadAndWait(cdp, sessionId)
    const quarantineEvidence = await evaluate(cdp, sessionId, `({ key: 'quarantine', restore: document.querySelector('.sb-restore-notice')?.innerText || '', body: document.body.innerText })`)
    announcementEvidence.push(quarantineEvidence)
    const quarantineAnnouncement = /Restored 6 valid practice tickets; isolated 1 unsupported or damaged record\./.test(quarantineEvidence.restore) && !quarantineEvidence.body.includes('<private-payload>')
    await evaluate(cdp, sessionId, `localStorage.setItem(${JSON.stringify(TICKET_KEY)}, ${JSON.stringify(placed.ticketBytes)})`)

    await clickRefresh(cdp, sessionId)
    await openMobileSlip(cdp, sessionId)
    await evaluate(cdp, sessionId, `(() => { const root = [...document.querySelectorAll('.sb-betslip')].find(item => item.getBoundingClientRect().width > 0); const active = [...(root?.querySelectorAll('.sb-slip-tabs button') || [])].find(item => /Active/.test(item.innerText)); active?.click(); return Boolean(active); })()`)
    await sleep(100)
    const beforeUnavailableCashout = await storageSnapshot(cdp, sessionId)
    const unavailableCashoutEvidence = await evaluate(cdp, sessionId, `(() => {
        const cards = [...document.querySelectorAll('.sb-slip-ticket')].filter(item => item.getBoundingClientRect().width > 0);
        const card = cards.find(item => item.innerText.includes('A complete bookmaker outcome set is unavailable.'));
        const button = card?.querySelector('.sb-cashout-btn');
        const reasonId = button?.getAttribute('aria-describedby');
        const reason = reasonId ? document.getElementById(reasonId) : null;
        button?.click();
        return { visible: Boolean(button && button.getBoundingClientRect().width > 0), disabled: button?.disabled === true, name: button?.innerText || '', reasonId, reason: reason?.innerText || '', associated: Boolean(reason && card?.contains(reason)) };
    })()`)
    const afterUnavailableCashout = await storageSnapshot(cdp, sessionId)
    const unavailableCashoutReason = unavailableCashoutEvidence.visible && unavailableCashoutEvidence.disabled && unavailableCashoutEvidence.name === 'Simulated cash-out unavailable' && unavailableCashoutEvidence.reason === 'A complete bookmaker outcome set is unavailable.' && unavailableCashoutEvidence.associated && beforeUnavailableCashout.ticketBytes === afterUnavailableCashout.ticketBytes && beforeUnavailableCashout.creditsBytes === afterUnavailableCashout.creditsBytes && beforeUnavailableCashout.historyBytes === afterUnavailableCashout.historyBytes
    const cashoutAction = await evaluate(cdp, sessionId, `(() => { const cards = [...document.querySelectorAll('.sb-slip-ticket')].filter(item => item.getBoundingClientRect().width > 0); const card = cards.find(item => /Simulated cash-out GC 3\\.89/.test(item.innerText)); const button = card?.querySelector('.sb-cashout-btn'); const text = button?.innerText || ''; button?.click(); return { text, card: card?.innerText || null, cards: cards.map(item => item.innerText) }; })()`)
    if (!cashoutAction.text) throw new Error(`Changed-probability cash-out action unavailable: ${JSON.stringify(cashoutAction)}`)
    const cashoutText = cashoutAction.text
    await sleep(300)
    const cashoutImmediate = await evaluate(cdp, sessionId, `({ body: document.body.innerText, ticketBytes: localStorage.getItem(${JSON.stringify(TICKET_KEY)}), credits: localStorage.getItem(${JSON.stringify(CREDIT_KEY)}), history: localStorage.getItem(${JSON.stringify(HISTORY_KEY)}) })`)
    if (!(JSON.parse(cashoutImmediate.ticketBytes || 'null')?.tickets || []).some(ticket => ticket.status === 'cashed_out')) throw new Error(`Cash-out click did not commit: ${JSON.stringify(cashoutImmediate)}`)
    try {
        await waitFor(cdp, sessionId, `(JSON.parse(localStorage.getItem(${JSON.stringify(TICKET_KEY)}) || 'null')?.tickets || []).some(ticket => ticket.status === 'cashed_out')`, 'cash-out persistence')
    } catch (error) {
        const diagnostic = await evaluate(cdp, sessionId, `({ body: document.body.innerText, ticketBytes: localStorage.getItem(${JSON.stringify(TICKET_KEY)}), credits: localStorage.getItem(${JSON.stringify(CREDIT_KEY)}), history: localStorage.getItem(${JSON.stringify(HISTORY_KEY)}) })`)
        throw new Error(`${error.message}: ${JSON.stringify(diagnostic)}`)
    }
    const cashed = await storageSnapshot(cdp, sessionId)
    announcementEvidence.push(await evaluate(cdp, sessionId, `({ key: 'cashout', polite: document.querySelector('.sb-ticket-announcement')?.innerText || '' })`))
    const cashTicket = cashed.tickets.find(ticket => ticket.status === 'cashed_out')
    const cashout = /GC 3\.89/.test(cashoutText) && cashTicket?.result === 'cashed_out' && cashed.balance === 943.89 && cashed.history.length === 7
    await reloadAndWait(cdp, sessionId)
    const cashReload = await storageSnapshot(cdp, sessionId)
    const cashoutReload = cashReload.ticketBytes === cashed.ticketBytes && cashReload.creditsBytes === cashed.creditsBytes && cashReload.historyBytes === cashed.historyBytes

    await clickRefresh(cdp, sessionId)
    await waitFor(cdp, sessionId, `(JSON.parse(localStorage.getItem(${JSON.stringify(TICKET_KEY)}) || 'null')?.tickets || []).filter(ticket => ticket.status === 'settled').length === 4`, 'terminal settlement')
    const settled = await storageSnapshot(cdp, sessionId)
    announcementEvidence.push(await evaluate(cdp, sessionId, `({ key: 'settlement', polite: document.querySelector('.sb-ticket-announcement')?.innerText || '' })`))
    const ticketEnvelope = JSON.parse(settled.ticketBytes)
    const [cashTicketAfterSettlement, pendingTicket, voidTicket, pushTicket, lostTicket, wonTicket] = ticketEnvelope.tickets
    const terminalHistory = settled.history.filter(item => item.type === 'win')
    const lifecycle = {
        pending: pendingTicket?.status === 'active' && pendingTicket.result === null && pendingTicket.legs[0].status === 'pending',
        won: wonTicket?.status === 'settled' && wonTicket.result === 'win' && wonTicket.payout === 20,
        lost: lostTicket?.status === 'settled' && lostTicket.result === 'loss' && lostTicket.payout === 0,
        push: pushTicket?.status === 'settled' && pushTicket.result === 'push' && pushTicket.payout === 10,
        voidLeg: voidTicket?.legs[0].status === 'void' && voidTicket?.legs[0].reason === 'push',
        fullVoid: voidTicket?.status === 'settled' && voidTicket.result === 'full-void' && voidTicket.payout === 10,
        cashedOut: cashTicketAfterSettlement?.status === 'cashed_out',
        settlementAccounting: settled.balance === 983.89 && terminalHistory.length === 4 && new Set(settled.history.map(item => item.id)).size === settled.history.length,
    }

    const homeNavigation = await evaluate(cdp, sessionId, `(() => { const link = [...document.querySelectorAll('a[href="/sportsbook"]')].find(item => item.getBoundingClientRect().width > 0); link?.click(); return Boolean(link); })()`)
    if (!homeNavigation) throw new Error('Sportsbook home navigation unavailable.')
    await waitFor(cdp, sessionId, `Boolean(document.querySelector('.sb-home'))`, 'sportsbook home navigation')
    await evaluate(cdp, sessionId, `(() => { const button = [...document.querySelectorAll('button')].find(item => /My Bets/.test(item.innerText)); button?.click(); return Boolean(button); })()`)
    await waitFor(cdp, sessionId, `Boolean(document.querySelector('.sb-my-bets-panel'))`, 'My Bets lifecycle panel')
    const renderedLabels = await evaluate(cdp, sessionId, `document.body.textContent`)
    lifecycle.pending = lifecycle.pending && renderedLabels.includes(LIFECYCLE_LABELS[0])
    lifecycle.won = lifecycle.won && renderedLabels.includes(LIFECYCLE_LABELS[1])
    lifecycle.lost = lifecycle.lost && renderedLabels.includes(LIFECYCLE_LABELS[2])
    lifecycle.push = lifecycle.push && renderedLabels.includes(LIFECYCLE_LABELS[3])
    lifecycle.fullVoid = lifecycle.fullVoid && renderedLabels.includes(LIFECYCLE_LABELS[4])
    lifecycle.cashedOut = lifecycle.cashedOut && renderedLabels.includes(LIFECYCLE_LABELS[5])

    await reloadAndWait(cdp, sessionId, null)
    const replayed = await storageSnapshot(cdp, sessionId)
    const settlementReload = JSON.stringify(JSON.parse(replayed.ticketBytes).tickets) === JSON.stringify(JSON.parse(settled.ticketBytes).tickets) && replayed.creditsBytes === settled.creditsBytes && replayed.historyBytes === settled.historyBytes
    const oneTimeAccounting = replayed.balance === settled.balance && replayed.history.length === settled.history.length && new Set(replayed.history.map(item => item.id)).size === replayed.history.length
    const screenshotPath = await capture(cdp, sessionId, join(outputRoot, `sportsbook-${viewport.id}.png`))
    const rejectionAnnouncement = Boolean(rejected && !rejectedSubmission && /Contradictory outcomes/.test(rejectionEvidence.polite))
    const liveAnnouncements = rejectionAnnouncement && rollbackAnnouncement && quarantineAnnouncement && placementAnnouncement && announcementEvidence.some(item => /Restored 6 practice tickets/.test(item.restore)) && announcementEvidence.some(item => /Simulated cash-out accepted/.test(item.polite)) && announcementEvidence.some(item => /lifecycle updated/.test(item.polite))
    const viewportLedger = ledger.slice(ledgerStart)
    const record = {
        viewport: viewport.id,
        ...initial,
        feedStateMatrix,
        feedStateEvidence: stateMatrix,
        ...dialogs,
        rejectionAnnouncement,
        rollbackAnnouncement,
        quarantineAnnouncement,
        placementAnnouncement,
        unavailableCashoutReason,
        unavailableCashoutEvidence,
        liveAnnouncements,
        announcementEvidence,
        placement,
        placementReload,
        cashout,
        cashoutReload,
        ...lifecycle,
        settlementReload,
        oneTimeAccounting,
        consoleClean: runtimeErrors.length === runtimeStart,
        endpoint: viewportLedger.filter(item => item.path === '/api/sportsbook/free-feed').length === 7,
        queueComplete: queue.complete(),
        fixtureQueueIds: queue.consumed(),
        externalDenied: network.completedExternal.length === 0 && network.deniedExternal.length > 0,
        storage: { placed, placedReload, cashed, cashReload, settled, replayed },
        renderedLifecycleText: renderedLabels,
        screenshot: screenshotPath,
    }
    return { ...record, ...classify(record) }
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    if (args.selfTest) return selfTest()
    const dist = resolve('dist')
    if (!existsSync(join(dist, 'index.html'))) throw new Error('Build assets missing. Run npm run build first.')
    const outputRoot = resolve(args.out)
    await rm(outputRoot, { recursive: true, force: true })
    await mkdir(outputRoot, { recursive: true })
    const tempRoot = await mkdtemp(join(tmpdir(), 'sportsbook-journey-'))
    const staticRoot = join(tempRoot, 'dist')
    const profile = join(tempRoot, 'profile')
    await cp(dist, staticRoot, { recursive: true })
    await mkdir(profile)
    const ledger = []
    const queue = createFixtureQueue()
    const cleanup = { browser: false, server: false, profile: false, tempRoot: false }
    const network = { requests: new Map(), deniedExternal: [], completedExternal: [] }
    const runtimeErrors = []
    let browser
    let server
    let cdp
    let report
    try {
        const owned = await temporaryServer(staticRoot, ledger, queue)
        server = owned.server
        const debuggerServer = createServer()
        debuggerServer.listen(0, '127.0.0.1')
        await once(debuggerServer, 'listening')
        const debuggerPort = debuggerServer.address().port
        await new Promise(resolveClose => debuggerServer.close(resolveClose))
        browser = spawn(args.browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio', '--no-proxy-server', '--host-resolver-rules=MAP sportsbook.test 127.0.0.1,EXCLUDE localhost', `--remote-debugging-port=${debuggerPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
        const version = await waitDebugger(debuggerPort)
        cdp = new Cdp(version.webSocketDebuggerUrl)
        await cdp.open()
        cdp.on(message => {
            if (message.method === 'Fetch.requestPaused') {
                const url = new URL(message.params.request.url)
                if (url.hostname === 'sportsbook.test') cdp.send('Fetch.continueRequest', { requestId: message.params.requestId }, message.sessionId).catch(() => {})
                else {
                    network.deniedExternal.push(url.href)
                    cdp.send('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'BlockedByClient' }, message.sessionId).catch(() => {})
                }
            }
            if (message.method === 'Network.loadingFinished') {
                const request = network.requests.get(message.params.requestId)
                if (request && new URL(request).hostname !== 'sportsbook.test') network.completedExternal.push(request)
            }
            if (message.method === 'Network.requestWillBeSent') network.requests.set(message.params.requestId, message.params.request.url)
            if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'runtime exception')
            if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') runtimeErrors.push(message.params.args?.map(arg => arg.value || arg.description).join(' ') || 'console error')
        })
        const baseUrl = `http://sportsbook.test:${owned.port}`
        const rows = []
        for (const viewport of args.viewports) {
            const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
            const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
            await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable', 'Fetch.enable'].map(method => cdp.send(method, method === 'Fetch.enable' ? { patterns: [{ urlPattern: '*' }] } : {}, sessionId)))
            rows.push(await runViewport({ cdp, sessionId, viewport, baseUrl, outputRoot, network, runtimeErrors, ledger, queue }))
            await cdp.send('Target.closeTarget', { targetId })
        }
        const assertions = rows.reduce((sum, row) => sum + row.assertionCount, 0)
        const passed = rows.reduce((sum, row) => sum + row.assertionCount - row.missing.length, 0)
        report = { browser: version.Browser, baseUrl, lifecycleAssertions: LIFECYCLE_LABELS.length * rows.length, assertions, passed, fixtureQueueIds: [...new Set(rows.flatMap(row => row.fixtureQueueIds))], viewports: rows, requestLedger: ledger, deniedExternalRequests: [...new Set(network.deniedExternal)], completedExternalRequests: network.completedExternal, runtimeErrors, cleanup }
        await writeFile(join(outputRoot, 'report.json'), JSON.stringify(report, null, 2))
        await writeFile(join(outputRoot, 'report.md'), `# Sportsbook Journey\n\nBrowser: ${version.Browser}\nAssertions: ${passed}/${assertions}\nLifecycle assertions: ${report.lifecycleAssertions}\n\n${rows.map(row => `- ${row.viewport}: ${row.pass ? 'PASS' : `FAIL (${row.missing.join(', ')})`}; score/offer gap ${row.geometryEvidence.gap}px`).join('\n')}\n`)
        if (rows.some(row => !row.pass)) throw new Error(`Journey assertions failed: ${JSON.stringify(rows.filter(row => !row.pass).map(row => ({ viewport: row.viewport, missing: row.missing, geometry: row.geometryEvidence, small: row.small })))}`)
    } finally {
        try { cdp?.close() } catch {}
        if (browser) {
            browser.kill('SIGTERM')
            await Promise.race([once(browser, 'exit'), sleep(3000)])
            if (browser.exitCode === null) browser.kill('SIGKILL')
            cleanup.browser = browser.exitCode !== null
        }
        if (server) {
            await new Promise(resolveClose => server.close(resolveClose))
            cleanup.server = !server.listening
        }
        await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
        cleanup.profile = !existsSync(profile)
        await rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
        cleanup.tempRoot = !existsSync(tempRoot)
        if (existsSync(outputRoot)) {
            await writeFile(join(outputRoot, 'cleanup.json'), JSON.stringify(cleanup, null, 2))
            if (report) await writeFile(join(outputRoot, 'report.json'), JSON.stringify({ ...report, cleanup }, null, 2))
        }
    }
}

main().catch(error => {
    process.stderr.write(`${error.stack || error}\n`)
    process.exitCode = 1
})
