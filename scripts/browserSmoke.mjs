import { mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

const DEFAULT_ROUTES = [
    '/',
    '/originals',
    '/slots-lobby',
    '/cases',
    '/slots',
    '/poker',
    '/missions',
    '/sportsbook',
    '/mines',
    '/dice',
    '/plinko',
    '/limbo',
    '/wheel',
    '/keno',
    '/blackjack',
    '/roulette',
    '/baccarat',
    '/hilo',
    '/tower',
    '/chickencross',
    '/videopoker',
    '/crash',
]

const DEFAULT_VIEWPORTS = [
    { width: 375, height: 667 },
    { width: 480, height: 800 },
    { width: 1024, height: 768 },
    { width: 1610, height: 870 },
]

const EDGE_CANDIDATES = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
]

const KEY_ACTIONS = {
    '/': /search|add 500|reset lab|risk academy|verify|view all/i,
    '/originals': /play|open|view|start|learn|search|crash|dice|mines|blackjack/i,
    '/slots-lobby': /play|open|spin|search|view|vault|rush|rtp|slot/i,
    '/cases': /open|spin|reveal|select|bet/i,
    '/slots': /spin|bet|buy|auto|play/i,
    '/poker': /sit|deal|start|call|check|fold|raise|bet/i,
    '/missions': /claim|play|open|mission|reset/i,
    '/sports': /add|bet slip|odds|search|events|ticket|sports home|top matches/i,
    '/sportsbook': /add|bet slip|odds|search|events|ticket|sports home|top matches/i,
    '/sportsbook/soccer': /add|bet slip|odds|search|events|ticket|soccer|winner/i,
    '/risk-academy': /practice games|risk|academy|originals/i,
    '/vip-lab': /practice games|vip|tier|originals/i,
    '/slot-factory': /spin|bet|buy|auto|play/i,
    '/pnl-stats': /stats|profit|chat|add 500|reset lab/i,
    '/mines': /bet|start|cashout|pick|reveal/i,
    '/dice': /roll|bet|play/i,
    '/plinko': /drop|bet|play/i,
    '/limbo': /run|bet|play|limbo/i,
    '/wheel': /spin|bet|play/i,
    '/keno': /pick|draw|bet|play/i,
    '/blackjack': /deal|hit|stand|double|bet/i,
    '/roulette': /spin|bet|clear|repeat/i,
    '/baccarat': /deal|banker|player|tie|bet/i,
    '/hilo': /higher|lower|cashout|draw|bet|start/i,
    '/tower': /climb|cashout|bet|start|pick/i,
    '/chickencross': /cross|cashout|bet|start|go/i,
    '/videopoker': /deal|draw|hold|bet/i,
    '/crash': /bet|cashout|start/i,
    '/coinflip': /flip|heads|tails|bet|play/i,
}

function argValue(name, fallback) {
    const prefix = `--${name}=`
    const match = process.argv.find(arg => arg.startsWith(prefix))
    if (match) return match.slice(prefix.length)
    const envKey = `npm_config_${name.toLowerCase()}`
    return process.env[envKey] || fallback
}

function parseListArg(name, fallback) {
    const raw = argValue(name, '')
    return raw ? raw.split(/[,\s]+/).map(item => item.trim()).filter(Boolean) : fallback
}

function parseViewportArg(raw) {
    if (!raw) return DEFAULT_VIEWPORTS
    return raw.split(/[,\s]+/).filter(Boolean).map(item => {
        const [width, height] = item.split('x').map(Number)
        if (!Number.isFinite(width) || !Number.isFinite(height)) {
            throw new Error(`Invalid viewport "${item}". Use WIDTHxHEIGHT.`)
        }
        return { width, height }
    })
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function findBrowser() {
    const explicit = argValue('browser', '')
    if (explicit) return explicit
    const found = EDGE_CANDIDATES.find(candidate => existsSync(candidate))
    if (!found) {
        throw new Error('Could not find Edge/Chromium. Pass --browser=/absolute/path/to/browser.')
    }
    return found
}

function routeSlug(route) {
    if (route === '/') return 'home'
    return route.replace(/^\//, '').replace(/[^a-z0-9-]+/gi, '-')
}

async function waitForDebugger(port, timeoutMs = 8000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`)
            if (res.ok) return await res.json()
        } catch {
            // Browser is still starting.
        }
        await sleep(120)
    }
    throw new Error(`Timed out waiting for browser debugger on port ${port}`)
}

class CdpClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl)
        this.nextId = 1
        this.pending = new Map()
        this.events = []
    }

    async open() {
        if (this.ws.readyState === WebSocket.OPEN) return
        await new Promise((resolve, reject) => {
            this.ws.addEventListener('open', resolve, { once: true })
            this.ws.addEventListener('error', reject, { once: true })
        })
        this.ws.addEventListener('message', event => {
            const msg = JSON.parse(String(event.data))
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id)
                this.pending.delete(msg.id)
                if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)))
                else resolve(msg.result)
                return
            }
            if (msg.method) this.events.push(msg)
        })
    }

    send(method, params = {}, sessionId = undefined) {
        const id = this.nextId++
        const payload = sessionId ? { id, method, params, sessionId } : { id, method, params }
        this.ws.send(JSON.stringify(payload))
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject })
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id)
                    reject(new Error(`CDP command timed out: ${method}`))
                }
            }, 15000)
        })
    }

    drainEvents(sessionId) {
        const out = this.events.filter(event => !sessionId || event.sessionId === sessionId)
        this.events = this.events.filter(event => sessionId && event.sessionId !== sessionId)
        return out
    }

    close() {
        try { this.ws.close() } catch {
            // best effort
        }
    }
}

async function waitForLoad(client, sessionId, timeoutMs = 9000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        const events = client.drainEvents(sessionId)
        if (events.some(event => event.method === 'Page.loadEventFired')) return
        await sleep(80)
    }
}

async function waitForReady(client, sessionId, timeoutMs = 8000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        const result = await client.send('Runtime.evaluate', {
            expression: `document.readyState === 'complete'
              && !!document.querySelector('#root')
              && document.querySelector('#root').children.length > 0
              && !document.querySelector('.route-fallback')
              && !document.querySelector('.core-stage.is-loading')
              && !/LOADING\\s+(LAB|STAGE)/i.test(document.body.innerText || '')`,
            returnByValue: true,
        }, sessionId)
        if (result.result?.value) return
        await sleep(120)
    }
}

function collectErrors(events) {
    const errors = []
    for (const event of events) {
        if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
            errors.push(event.params.args?.map(arg => arg.value || arg.description || '').join(' ') || 'console error')
        }
        if (event.method === 'Runtime.exceptionThrown') {
            errors.push(event.params.exceptionDetails?.text || 'runtime exception')
        }
        if (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error') {
            errors.push(event.params.entry.text)
        }
    }
    return [...new Set(errors)].slice(0, 8)
}

async function evaluatePage(client, sessionId, route) {
    const actionPattern = (KEY_ACTIONS[route] || /bet|spin|deal|roll|play|drop|cashout|open|hit|stand|draw|start|search/i).source
    const expression = `
(() => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const body = document.body;
  const html = document.documentElement;
  const docWidth = Math.max(body.scrollWidth, html.scrollWidth);
  const docHeight = Math.max(body.scrollHeight, html.scrollHeight);
  const describe = (el) => {
    const rect = el.getBoundingClientRect();
    const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '';
    const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\\s+/g, ' ').slice(0, 70);
    return { tag: el.tagName.toLowerCase() + cls, text, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
  };
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && rect.bottom >= 0 && rect.top <= viewportHeight;
  };
  const overflowing = Array.from(document.querySelectorAll('body *'))
    .filter(el => {
      if (!isVisible(el)) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (style.position === 'fixed') return false;
      return rect.left < -2 || rect.right > viewportWidth + 2;
    })
    .slice(0, 10)
    .map(describe);
  const brokenImages = Array.from(document.images)
    .filter(img => img.complete && img.naturalWidth === 0)
    .map(img => img.currentSrc || img.src)
    .slice(0, 12);
  const pattern = new RegExp(${JSON.stringify(actionPattern)}, 'i');
  const controls = Array.from(document.querySelectorAll('button, a, input, select, [role="button"]'))
    .filter(isVisible)
    .map(el => {
      const rect = el.getBoundingClientRect();
      const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.value || '').trim().replace(/\\s+/g, ' ');
      return {
        tag: el.tagName.toLowerCase(),
        text,
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    });
  const action = controls.find(control => pattern.test(control.text));
  const titleEl = document.querySelector('h1, .game-badge, .game-title, [data-game-title]');
  const loadingBlocking = Boolean(document.querySelector('.core-stage.is-loading')) || /LOADING\\s+(LAB|STAGE)/i.test(document.body.innerText || '');
  return {
    title: titleEl ? titleEl.textContent.trim().replace(/\\s+/g, ' ').slice(0, 90) : document.title,
    viewport: { width: viewportWidth, height: viewportHeight },
    docWidth,
    docHeight,
    overflowX: docWidth > viewportWidth + 1,
    overflowDelta: Math.max(0, docWidth - viewportWidth),
    overflowing,
    brokenImages,
    visibleControlCount: controls.length,
    keyActionVisible: Boolean(action),
    keyAction: action || null,
    loadingBlocking,
  };
})()`
    const result = await client.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: false,
    }, sessionId)
    return result.result?.value
}

async function run() {
    const baseUrl = argValue('baseUrl', 'http://127.0.0.1:5173').replace(/\/$/, '')
    const outDir = resolve(argValue('out', 'output/browser-smoke'))
    const label = argValue('label', new Date().toISOString().replace(/[:.]/g, '-'))
    const clean = process.argv.includes('--clean') || process.env.npm_config_clean === 'true'
    const routes = parseListArg('routes', DEFAULT_ROUTES)
    const viewports = parseViewportArg(argValue('viewports', ''))
    const browser = findBrowser()
    const port = Number(argValue('port', String(9300 + Math.floor(Math.random() * 400))))
    const readyTimeoutMs = Number(argValue('readyTimeoutMs', '12000'))
    const settleMs = Number(argValue('settleMs', '700'))
    const userDataDir = join(tmpdir(), `gampo-smoke-${process.pid}`)
    const runDir = join(outDir, label)
    const screenshotDir = join(runDir, 'screenshots')

    if (clean) await rm(runDir, { recursive: true, force: true })
    await mkdir(screenshotDir, { recursive: true })

    const proc = spawn(browser, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--mute-audio',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        'about:blank',
    ], { stdio: 'ignore' })
    proc.unref()

    let client
    try {
        const version = await waitForDebugger(port)
        client = new CdpClient(version.webSocketDebuggerUrl)
        await client.open()
        const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' })
        const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true })
        await client.send('Page.enable', {}, sessionId)
        await client.send('Runtime.enable', {}, sessionId)
        await client.send('Log.enable', {}, sessionId)

        const results = []
        for (const viewport of viewports) {
            await client.send('Emulation.setDeviceMetricsOverride', {
                width: viewport.width,
                height: viewport.height,
                deviceScaleFactor: 1,
                mobile: viewport.width < 768,
            }, sessionId)
            for (const route of routes) {
                client.drainEvents(sessionId)
                const url = `${baseUrl}${route}`
                await client.send('Page.navigate', { url }, sessionId)
                await waitForLoad(client, sessionId)
                await waitForReady(client, sessionId, readyTimeoutMs)
                await sleep(settleMs)
                const events = client.drainEvents(sessionId)
                const metrics = await evaluatePage(client, sessionId, route)
                const screenshotName = `${viewport.width}x${viewport.height}-${routeSlug(route)}.png`
                const screenshotPath = join(screenshotDir, screenshotName)
                const shot = await client.send('Page.captureScreenshot', {
                    format: 'png',
                    fromSurface: true,
                }, sessionId)
                await writeFile(screenshotPath, Buffer.from(shot.data, 'base64'))
                results.push({
                    route,
                    url,
                    viewport,
                    screenshot: screenshotPath,
                    errors: collectErrors(events),
                    ...metrics,
                })
                console.log(`${viewport.width}x${viewport.height} ${route} overflow=${metrics.overflowDelta}px action=${metrics.keyActionVisible ? 'yes' : 'no'} errors=${collectErrors(events).length}`)
            }
        }

        const failures = results.filter(item => item.overflowX || item.loadingBlocking || item.brokenImages.length || item.errors.length || !item.keyActionVisible)
        const report = {
            baseUrl,
            browser,
            generatedAt: new Date().toISOString(),
            viewports,
            routes,
            total: results.length,
            failureCount: failures.length,
            failures,
            results,
        }
        await writeFile(join(runDir, 'report.json'), JSON.stringify(report, null, 2))
        await writeFile(join(runDir, 'summary.md'), [
            `# GamPo Browser Smoke ${label}`,
            '',
            `Base URL: ${baseUrl}`,
            `Total checks: ${results.length}`,
            `Failures: ${failures.length}`,
            '',
            '| Viewport | Route | Overflow | Loading | Key Action | Broken Images | Errors | Screenshot |',
            '| --- | --- | ---: | --- | --- | ---: | ---: | --- |',
            ...results.map(item => (
                `| ${item.viewport.width}x${item.viewport.height} | ${item.route} | ${item.overflowDelta}px | ${item.loadingBlocking ? 'yes' : 'no'} | ${item.keyActionVisible ? 'yes' : 'no'} | ${item.brokenImages.length} | ${item.errors.length} | ${item.screenshot.replaceAll('\\', '/')} |`
            )),
            '',
        ].join('\n'))

        if (failures.length) {
            console.error(`Browser smoke found ${failures.length} issue(s). See ${join(runDir, 'summary.md')}`)
            process.exitCode = 1
        } else {
            console.log(`Browser smoke passed. See ${join(runDir, 'summary.md')}`)
        }
    } finally {
        if (client) {
            try {
                await client.send('Browser.close')
            } catch {
                // The browser may already be gone after a failing smoke step.
            }
            client.close()
        }
        proc.kill()
        await sleep(500)
        try {
            await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 })
        } catch {
            // Edge can briefly hold a dictionary file after shutdown. The next run
            // uses a fresh temp profile, so this is non-fatal.
        }
    }
}

run().catch(error => {
    console.error(error)
    process.exit(1)
})
