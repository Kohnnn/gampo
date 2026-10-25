// Native rendered-geometry regression, not a raster/round-outcome acceptance suite.
// Node 22+: node --experimental-websocket scripts/verifyVisualLayout.mjs --browser=/usr/bin/google-chrome
import { existsSync, promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { SLOT_TEMPLATE_ROUTES } from '../src/data/slotRoutes.js'
import { SLOT_TEMPLATES, getCellPositions } from '../src/components/games/slots/slotFactory.js'

const arg = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const base = arg('baseUrl', 'http://127.0.0.1:4173').replace(/\/$/, '')
const out = resolve(arg('out', 'output/visual-layout'))
const browser = arg('browser', ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync))
const originalRoutes = ['/limbo', '/plinko', '/wheel', '/rps']
const defaults = [...originalRoutes, ...SLOT_TEMPLATE_ROUTES.map(route => route.path), '/slots']
const routes = arg('routes', defaults.join(',')).split(',').map(value => value.trim())
const viewportArgs = arg('viewports', '375x667,1610x870').split(',')
const viewports = viewportArgs.map(value => {
    const match = /^(\d+)x(\d+)$/.exec(value)
    return match ? { width: Number(match[1]), height: Number(match[2]) } : null
})
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms))
const report = { startedAt: new Date().toISOString(), baseUrl: base, browser, routes, viewports, mode: 'normal motion, normal speed, Fun off', scopeComplete: defaults.every(route => routes.includes(route)) && ['375x667', '1610x870'].every(viewport => viewportArgs.includes(viewport)), rows: [], failures: [] }
let proc, ws, profile, exitPromise, spawnError, target, port
let exited = false
let stderr = ''
let nextId = 1
const pending = new Map()
const runtimeErrors = []
let interrupted = false
const interrupt = signal => {
    if (interrupted) return
    interrupted = true
    fail('interrupted', signal)
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(signal)) }
    pending.clear()
    if (proc?.pid && !exited) proc.kill('SIGTERM')
}
process.once('SIGINT', () => interrupt('SIGINT'))
process.once('SIGTERM', () => interrupt('SIGTERM'))

function fail(label, detail) { report.failures.push({ label, detail }); console.error(`FAIL ${label}`) }
function check(row, ok, label, detail) {
    row.checks.push({ label, ok: Boolean(ok), detail })
    if (!ok) fail(`${row.route} ${row.viewport} ${row.mode}: ${label}`, detail)
}
function send(method, params = {}) {
    return new Promise((resolveCommand, reject) => {
        if (ws?.readyState !== WebSocket.OPEN) return reject(new Error('Owned CDP socket is not open'))
        const id = nextId++
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 15000)
        pending.set(id, { resolve: resolveCommand, reject, timer })
        ws.send(JSON.stringify({ id, method, params }))
    })
}
async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result?.value
}
async function until(expression, label, timeout = 15000) {
    const started = Date.now()
    while (Date.now() - started < timeout) {
        if (await evaluate(expression)) return
        await sleep(100)
    }
    throw new Error(`Timed out waiting for ${label}`)
}
async function click(selector) {
    const point = await evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return null;
        const r = element.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return { x, y, usable: !element.disabled && r.width > 0 && r.height > 0 && x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && (hit === element || element.contains(hit)) };
    })()`)
    if (!point?.usable) throw new Error(`Native pointer cannot reach ${selector}: ${JSON.stringify(point)}`)
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 })
}
async function key(name) {
    const virtual = { Escape: 27, Enter: 13, Tab: 9 }[name]
    for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: name, code: name, windowsVirtualKeyCode: virtual, ...(name === 'Enter' && type === 'keyDown' ? { text: '\r', unmodifiedText: '\r' } : {}) })
}
async function screenshot(row, suffix = '') {
    const filename = `${row.route.slice(1)}-${row.viewport}-${row.mode}${suffix}.png`
    try {
        const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        await fs.writeFile(join(out, filename), Buffer.from(data, 'base64'))
        row.screenshots.push(filename)
    } catch (error) { fail(`Screenshot ${filename}`, error.message) }
}

// Runs in the page, without installing globals or changing application geometry.
function measurePage(expected, fullscreen = false, original = 'limbo') {
    const rect = element => {
        if (!element) return null
        const r = element.getBoundingClientRect()
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
    }
    const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
    const contains = (outer, inner) => !!outer && !!inner && inner.width > 0 && inner.height > 0 && inner.left >= outer.left - 0.5 && inner.top >= outer.top - 0.5 && inner.right <= outer.right + 0.5 && inner.bottom <= outer.bottom + 0.5
    const intersection = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
    const shown = element => {
        if (document.fullscreenElement && !document.fullscreenElement.contains(element)) return false
        if (!element || !rect(element)?.width || !rect(element)?.height) return false
        for (let parent = element; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent)
            if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return false
            if (parent === document.fullscreenElement) break
        }
        return true
    }
    const player = document.querySelector('.gs-playfield')
    const blockers = [...document.querySelectorAll('.slot-mobile-dock, .bp-mobile-dock, .mobile-bottom-nav')].filter(shown)
    const inspect = (element, name, inPlayer = true, actionable = false) => {
        const r = rect(element), clips = [], collisions = []
        if (element && r) {
            for (let parent = element.parentElement; parent; parent = parent.parentElement) {
                const style = getComputedStyle(parent), p = rect(parent)
                const clipX = /^(hidden|clip|scroll|auto)$/.test(style.overflowX), clipY = /^(hidden|clip|scroll|auto)$/.test(style.overflowY)
                if (clipX || clipY) {
                    const sx = parent.offsetWidth ? p.width / parent.offsetWidth : 1, sy = parent.offsetHeight ? p.height / parent.offsetHeight : 1
                    const left = p.left + parent.clientLeft * sx, top = p.top + parent.clientTop * sy
                    const boundary = { left: clipX ? left : -Infinity, right: clipX ? left + parent.clientWidth * sx : Infinity, top: clipY ? top : -Infinity, bottom: clipY ? top + parent.clientHeight * sy : Infinity }
                    clips.push({ ancestor: parent.tagName + '.' + String(parent.className), rect: boundary, contained: contains(boundary, r) })
                }
                if (parent === document.fullscreenElement) break
            }
            for (const blocker of blockers) {
                if (blocker === element || blocker.contains(element) || element.contains(blocker)) continue
                const area = intersection(r, rect(blocker))
                if (area > 0) collisions.push({ blocker: String(blocker.className), area, rect: rect(blocker) })
            }
        }
        const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null
        return { name, rect: r, shown: shown(element), viewportContained: contains(viewport, r), playerContained: !inPlayer || fullscreen || contains(rect(player), r), clippingContained: clips.every(clip => clip.contained), clips, collisions, hit: !!element && (hit === element || element.contains(hit)), enabled: !!element && !element.disabled, text: element?.textContent?.trim().slice(0, 180) || '', actionable }
    }
    const targets = []
    let topology = null
    let artwork = null
    if (!expected) {
        if (original === 'plinko') {
            const canvas = document.querySelector('.plinko-canvas'), bins = document.querySelector('.plinko-bins')
            targets.push(inspect(canvas, 'Plinko board canvas'), inspect(bins, 'complete Plinko bins'))
            for (const bin of bins?.children || []) targets.push(inspect(bin, 'Plinko bin ' + bin.textContent.trim()))
            artwork = { canvas: rect(canvas), bins: rect(bins), binCount: bins?.children.length || 0 }
        } else if (original === 'wheel') {
            const disc = document.querySelector('.wheel-disc')
            targets.push(inspect(disc, 'whole Wheel disc'))
            const labels = [...disc?.querySelectorAll('span') || []].map(label => {
                const range = document.createRange(); range.selectNodeContents(label)
                return { text: label.textContent.trim(), rect: rect(range), fontSize: parseFloat(getComputedStyle(label).fontSize) }
            })
            artwork = { disc: rect(disc), labels }
        } else if (original === 'rps') {
            const stageChoices = [...document.querySelectorAll('.rps-stage-choices button')].filter(shown)
            const choices = stageChoices.length ? stageChoices : [...document.querySelectorAll('.rps-choices button')].filter(shown)
            for (const choice of choices) targets.push(inspect(choice, 'RPS ' + choice.textContent.trim(), player.contains(choice), true))
            const versus = document.querySelector('.rps-versus')
            const hands = [...document.querySelectorAll('.rps-side > span:last-child')]
            targets.push(inspect(versus, 'RPS outcome versus'))
            for (const hand of hands) targets.push(inspect(hand, 'RPS outcome ' + hand.parentElement.querySelector('span')?.textContent))
            artwork = { choiceCount: choices.length, hands: hands.map(hand => ({ rect: rect(hand), label: hand.getAttribute('aria-label'), text: hand.textContent.trim() })), settled: !!document.querySelector('.rps-versus.phase-won, .rps-versus.phase-lost, .rps-versus.phase-push') }
        } else {
            const ring = document.querySelector('.limbo-ring')
            targets.push(inspect(ring, 'full Limbo ring'), inspect(ring?.querySelector('span'), 'Limbo result'))
        }
    } else {
        const stage = document.querySelector('.slot-stage-v2'), frame = stage?.querySelector('.slot-reel-frame-v2')
        const grid = frame?.querySelector('.slot-megaways-grid, .slot-reel-grid')
        const cells = [...(frame?.querySelectorAll('[data-slot-cell-index]') || [])]
        const columns = [...(frame?.querySelectorAll('.slot-megaways-col') || [])]
        topology = {
            templateMatches: !!stage?.classList.contains('slot-template-' + expected.id), advertised: frame?.getAttribute('aria-label'),
            count: cells.length, indexes: cells.map(cell => Number(cell.dataset.slotCellIndex)), columns: columns.map(col => col.querySelectorAll('[data-slot-cell-index]').length),
            empty: cells.filter(cell => !cell.textContent.trim() && !cell.querySelector('img[alt], [role="img"][aria-label]')).map(cell => cell.dataset.slotCellIndex),
            brokenImages: [...(grid?.querySelectorAll('img') || [])].filter(img => !img.complete || !img.naturalWidth).map(img => img.currentSrc || img.src),
            positions: cells.map(cell => ({ index: Number(cell.dataset.slotCellIndex), rect: rect(cell) })),
            croppedRanks: [...(grid?.querySelectorAll('.slot-rank-crop') || [])].map(crop => ({ rect: rect(crop), cell: rect(crop.closest('[data-slot-cell-index]')), alt: crop.querySelector('img')?.alt, loaded: !!crop.querySelector('img')?.naturalWidth })),
            persistentBoardNotices: [...(frame?.querySelectorAll('.slot-feature-callouts, .slot-cascade-overlay, .slot-collect-overlay, .slot-bonus-banner-strip, .slot-free-spin-counter') || [])].filter(shown).map(element => String(element.className)),
        }
        targets.push(inspect(frame, 'complete reel frame'), inspect(grid, 'complete advertised grid'))
        for (const cell of cells) targets.push(inspect(cell, 'cell ' + cell.dataset.slotCellIndex))
        const dock = [...document.querySelectorAll('.slot-mobile-dock')].find(shown)
        const controls = fullscreen || !dock ? stage?.querySelector('.slot-controls-v2') : dock
        if (controls === dock && dock) {
            targets.push(inspect(dock.querySelector('.slot-mobile-bet'), 'Bet', false, true), inspect(dock.querySelector('.slot-mobile-readout:not(.slot-mobile-bet)'), 'Win', false), inspect(dock.querySelector('[data-slot-action="spin"]'), 'Spin', false, true))
        } else {
            targets.push(inspect(controls?.querySelector('.slot-control-readout:not(.right)'), 'Bet'), inspect(controls?.querySelector('.slot-control-readout.right'), 'Win'), inspect(controls?.querySelector('[data-slot-action="spin"]'), 'Spin', true, true))
        }
    }
    return { path: location.pathname, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, fullscreen: !!document.fullscreenElement, normal: !document.documentElement.classList.contains('gampo-reduce-motion') && !document.documentElement.classList.contains('gampo-no-animations') && document.documentElement.dataset.quickSpin !== 'on' && !matchMedia('(prefers-reduced-motion: reduce)').matches, fun: localStorage.getItem('gampo_fun_mode'), player: rect(player), blockers: blockers.map(element => ({ name: String(element.className), rect: rect(element) })), targets, topology, artwork, js: [...document.scripts].map(script => script.src).filter(Boolean), css: [...document.styleSheets].map(sheet => sheet.href).filter(Boolean) }
}

async function geometry(row, config, fullscreen = false) {
    const expected = config ? { id: config.id } : null
    const result = await evaluate(`(${measurePage.toString()})(${JSON.stringify(expected)}, ${fullscreen}, ${JSON.stringify(row.route.slice(1))})`)
    row.geometry = result
    row.observedAt = new Date().toISOString()
    check(row, result.path === row.route, 'requested route rendered', result.path)
    check(row, result.normal && result.fun === 'serious', 'normal motion/speed and Fun off applied', { normal: result.normal, fun: result.fun })
    check(row, result.targets.length > 0 && result.targets.every(item => item.shown && item.viewportContained && item.playerContained && item.clippingContained && item.collisions.length === 0 && (!item.actionable || item.hit && item.enabled)), 'whole essentials contained, unclipped and clear of dock/nav', result.targets.filter(item => !item.shown || !item.viewportContained || !item.playerContained || !item.clippingContained || item.collisions.length || item.actionable && (!item.hit || !item.enabled)))
    if (!config) {
        if (row.route === '/limbo') check(row, result.targets.length === 2 && result.targets[1].text.length > 0, 'Limbo ring and nonempty result target present', result.targets.map(item => ({ name: item.name, text: item.text })))
        if (row.route === '/plinko') {
            const { canvas, bins, binCount } = result.artwork
            check(row, canvas?.width >= 160 && canvas?.height >= 120 && Math.abs(canvas.width / canvas.height - 4 / 3) < 0.02 && bins?.width >= canvas.width - 1 && binCount >= 9, 'Plinko native canvas and every payout bin retain usable board geometry', result.artwork)
        }
        if (row.route === '/wheel') {
            const { disc, labels } = result.artwork
            const nodes = await send('DOM.getDocument', { depth: 0 })
            const spans = await send('DOM.querySelectorAll', { nodeId: nodes.root.nodeId, selector: '.wheel-disc span' })
            const quads = []
            for (const nodeId of spans.nodeIds) {
                const { node } = await send('DOM.describeNode', { nodeId, depth: 1 })
                const fragments = node.children?.filter(child => child.nodeType === 3 && child.nodeValue.trim()) || []
                const labelQuads = []
                for (const text of fragments) {
                    const geometry = await send('DOM.getContentQuads', { backendNodeId: text.backendNodeId })
                    labelQuads.push(...(geometry.quads?.length ? geometry.quads : [null]))
                }
                quads.push(labelQuads)
            }
            const overlaps = (a, b) => {
                const points = quad => Array.from({ length: 4 }, (_, index) => ({ x: quad[index * 2], y: quad[index * 2 + 1] }))
                const left = points(a), right = points(b)
                for (const polygon of [left, right]) for (let index = 0; index < 4; index++) {
                    const p = polygon[index], q = polygon[(index + 1) % 4]
                    const length = Math.hypot(q.x - p.x, q.y - p.y)
                    const axis = { x: -(q.y - p.y) / length, y: (q.x - p.x) / length }
                    const project = vertices => vertices.map(point => point.x * axis.x + point.y * axis.y)
                    const x = project(left), y = project(right)
                    if (Math.min(Math.max(...x), Math.max(...y)) - Math.max(Math.min(...x), Math.min(...y)) <= 0.5) return false
                }
                return true
            }
            result.artwork.quads = quads
            result.artwork.overlaps = quads.flatMap((label, index) => quads.slice(index + 1).flatMap((other, offset) => label.some(quad => quad && other.some(candidate => candidate && overlaps(quad, candidate))) ? [[index, index + offset + 1]] : []))
            check(row, disc?.width >= 110 && disc?.height >= 110 && labels.length === 12 && labels.every(label => label.text && label.fontSize >= 10 && label.rect.width >= 8 && label.rect.height >= 8) && quads.length === 12 && quads.every(label => label.length > 0 && label.every(quad => quad?.length === 8)) && result.artwork.overlaps.length === 0, 'Wheel disc and all twelve readable labels remain distinct', result.artwork)
        }
        if (row.route === '/rps') {
            check(row, result.artwork.choiceCount === 3 && result.targets.filter(target => target.actionable).every(target => target.rect.width >= 44 && target.rect.height >= 44), 'all three RPS choices retain native reachable touch targets', result.artwork)
            check(row, result.artwork.hands.length === 2 && result.artwork.hands.every(hand => hand.text && hand.rect.width >= 24 && hand.rect.height >= 24) && (row.mode !== 'settled' || result.artwork.settled && result.artwork.hands.every(hand => hand.label)), 'RPS versus and both actual outcome hands remain visible', result.artwork)
        }
    } else {
        const positions = getCellPositions(config), topology = result.topology
        const indexes = [...topology.indexes].sort((a, b) => a - b)
        const columnCounts = config.layout.columnRows || []
        check(row, topology.templateMatches && topology.advertised === `Slot reels, ${config.layout.cols} by ${config.layout.rows}` && topology.count === positions.length && indexes.every((value, index) => value === index) && topology.empty.length === 0 && topology.brokenImages.length === 0 && (config.layout.evaluation !== 'megaways' || JSON.stringify(topology.columns) === JSON.stringify(columnCounts)), 'canonical advertised topology, every cell and symbol present', { expected: { ...config.layout, count: positions.length }, actual: topology })
        check(row, topology.persistentBoardNotices.length === 0, 'persistent feature information stays outside the settled board', topology.persistentBoardNotices)
        if (fullscreen) check(row, topology.croppedRanks.every(crop => {
            const side = Math.min(crop.cell.width, crop.cell.height)
            return crop.loaded && crop.alt && crop.rect.width >= 10 && crop.rect.height >= 18 && crop.rect.width * crop.rect.height >= 240 && crop.rect.width >= side * 0.24 && crop.rect.height >= side * 0.45
        }), 'rank glyph crops retain readable native fullscreen area', topology.croppedRanks)
        const cells = new Map(topology.positions.map(cell => [cell.index, cell.rect]))
        const gaps = positions.flatMap((position, index) => {
            const current = cells.get(index)
            const rightIndex = positions.findIndex(candidate => candidate.row === position.row && candidate.col === position.col + 1)
            const belowIndex = positions.findIndex(candidate => candidate.col === position.col && candidate.row === position.row + 1)
            const right = cells.get(rightIndex), below = cells.get(belowIndex)
            return [right && current && current.right > right.left + 0.5 ? { index, rightIndex } : null, below && current && current.bottom > below.top + 0.5 ? { index, belowIndex } : null].filter(Boolean)
        })
        check(row, gaps.length === 0, 'advertised rows and columns do not overlap', gaps)
        check(row, result.targets.filter(item => ['Bet', 'Win', 'Spin'].includes(item.name)).every(item => item.name === 'Spin' || item.text.length > 0), 'Bet and Win values are nonempty', result.targets.slice(-3))
    }
    await screenshot(row)
    return result
}

async function stable(selector) {
    await until(`document.readyState === 'complete' && document.querySelector(${JSON.stringify(selector)}) && !document.querySelector('[data-route-fallback="loading"], .slot-stage-v2.is-loading, .core-stage.is-loading, .core-stage-body[aria-busy="true"]')`, 'rendered assets and stage')
    await evaluate(`(async () => {
        await document.fonts.ready;
        for (const img of document.querySelectorAll('.slot-stage-v2 img, .limbo-stage-frame img')) { if (!img.complete) await new Promise(resolve => { img.addEventListener('load', resolve, { once:true }); img.addEventListener('error', resolve, { once:true }); }); }
    })()`)
    await until(`!document.getAnimations().some(animation => animation.playState === 'running' && animation.effect?.getComputedTiming().iterations !== Infinity && !animation.effect?.target?.closest?.('.sim-bet-strip, .rrs-strip'))`, 'finite page-entry animations')
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
}

async function options(row) {
    const opener = '[data-mobile-settings-toggle]'
    const state = () => evaluate(`(() => {
        const button = document.querySelector('${opener}'), dialog = document.querySelector('.bp-content[role="dialog"]'), field = dialog?.querySelector('#limbo-target-multiplier'), close = dialog?.querySelector('.bp-mobile-close');
        const visible = element => { const r = element?.getBoundingClientRect(); return !!r?.width && !!r?.height && getComputedStyle(element).visibility === 'visible'; };
        return { label: button?.getAttribute('aria-label'), controls: button?.getAttribute('aria-controls'), dialogId: dialog?.id, expanded: button?.getAttribute('aria-expanded'), modal: dialog?.getAttribute('aria-modal'), dialogLabel: dialog?.getAttribute('aria-label'), fieldLabeled: !!field?.labels?.length, fieldFocused: document.activeElement === field, fieldValue: field?.value, closeVisible: visible(close), focusOnOpener: document.activeElement === button, hintCount: document.querySelectorAll('[data-mobile-setup-hint]').length };
    })()`)
    await click(opener)
    await until(`document.querySelector('${opener}')?.getAttribute('aria-expanded') === 'true'`, 'native options open')
    await sleep(350)
    let result = await state()
    check(row, result.label === 'Bet & options' && result.modal === 'true' && result.dialogLabel === result.label && result.dialogId === result.controls && result.fieldLabeled && result.closeVisible && result.hintCount === 0, 'labeled options opens real dialog with field/close and no hint', result)
    await click('.bp-content[role="dialog"] #limbo-target-multiplier')
    result = await state()
    check(row, result.fieldFocused, 'native pointer focuses labeled game option', result)
    await key('Escape')
    await until(`document.querySelector('${opener}')?.getAttribute('aria-expanded') === 'false'`, 'Escape closes options')
    await sleep(100)
    result = await state()
    check(row, result.expanded === 'false' && result.focusOnOpener, 'Escape closes options and restores opener focus', result)
    await key('Enter')
    await until(`document.querySelector('${opener}')?.getAttribute('aria-expanded') === 'true'`, 'keyboard options open')
    await sleep(350)
    await screenshot(row, '-options')
    await click('.bp-mobile-close[aria-label="Close betting controls"]')
    await until(`document.querySelector('${opener}')?.getAttribute('aria-expanded') === 'false'`, 'normal options close')
    await sleep(100)
    result = await state()
    check(row, result.expanded === 'false' && result.focusOnOpener, 'normal close restores options opener focus', result)
}

async function fullscreen(row, config) {
    const full = { route: row.route, viewport: row.viewport, mode: 'fullscreen', checks: [], screenshots: [] }
    report.rows.push(full)
    try {
        const snapshot = `(() => ({ cells: [...document.querySelectorAll('[data-slot-cell-index]')].map(cell => cell.textContent.trim()), win: document.querySelector('.slot-control-readout.right')?.textContent.trim() }))()`
        const before = await evaluate(snapshot)
        await click('[data-slot-fullscreen]')
        await until(`document.fullscreenElement?.classList.contains('slot-stage-v2')`, 'native reel fullscreen')
        await stable('.slot-stage-v2')
        await geometry(full, config, true)
        const after = await evaluate(snapshot)
        check(full, JSON.stringify(before) === JSON.stringify(after), 'fullscreen retains mounted board identities', { before, after })
        await key('Escape')
        await until('!document.fullscreenElement', 'native fullscreen Escape')
        const returned = await evaluate(`document.activeElement === document.querySelector('[data-slot-fullscreen]')`)
        check(full, returned, 'native Escape exits fullscreen and restores opener focus', { returned })
        const restored = { route: row.route, viewport: row.viewport, mode: 'fullscreen-return', checks: [], screenshots: [] }
        report.rows.push(restored)
        await stable('.slot-stage-v2')
        await geometry(restored, config)
        const rail = await evaluate(`(() => {
            if (!matchMedia('(min-width: 561px) and (max-width: 768px) and (max-height: 520px) and (orientation: landscape)').matches) return null;
            const dock = document.querySelector('[data-slot-mobile-dock]'), title = document.querySelector('.gs-titlebar');
            const field = document.querySelector('.gs-playfield'), nav = document.querySelector('.mobile-bottom-nav');
            if (!dock || !title || !field || !nav) return { matches: false };
            const d = dock.getBoundingClientRect(), t = title.getBoundingClientRect(), p = field.getBoundingClientRect(), n = nav.getBoundingClientRect();
            return { matches: dock.hasAttribute('data-primary-landscape-dock') && Math.abs(d.left - t.left) < 0.5 && Math.abs(d.width - t.width) < 0.5 && d.right <= p.left && d.bottom <= n.top,
                dock: { left: d.left, top: d.top, width: d.width, bottom: d.bottom }, rail: { left: t.left, width: t.width }, playerLeft: p.left, navTop: n.top,
                leftVariable: dock.style.getPropertyValue('--gs-controls-left'), widthVariable: dock.style.getPropertyValue('--gs-controls-width') };
        })()`)
        if (rail) check(restored, rail.matches && rail.leftVariable && rail.widthVariable, 'recreated dock returns to measured landscape controls rail', rail)
    } catch (error) {
        check(full, false, 'native dense fullscreen path', error.message)
        await screenshot(full, '-failure')
    } finally {
        try { if (await evaluate('!!document.fullscreenElement')) await evaluate('document.exitFullscreen()') }
        catch (error) { check(full, false, 'fullscreen cleanup', error.message) }
    }
}

async function startBrowser() {
    profile = await fs.mkdtemp(join(tmpdir(), 'gampo-visual-layout-'))
    proc = spawn(browser, ['--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
    exitPromise = new Promise(resolveExit => {
        proc.once('error', error => { spawnError = error; exited = true; resolveExit() })
        proc.once('exit', () => { exited = true; resolveExit() })
    })
    proc.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16000) })
    const started = Date.now()
    while (Date.now() - started < 15000) {
        if (spawnError) throw spawnError
        if (exited) throw new Error(`Owned Chromium exited: ${stderr}`)
        const file = await fs.readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => null)
        const announcement = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+(\/devtools\/browser\/[\w-]+))/)
        if (file && announcement) {
            const [number, path, ...extra] = file.trim().split(/\r?\n/)
            if (!/^\d+$/.test(number) || extra.length || Number(number) !== Number(new URL(announcement[1]).port) || path !== announcement[2]) throw new Error('Ambiguous owned debugger endpoint')
            port = Number(number)
            const version = await (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(3000) })).json()
            if (version.webSocketDebuggerUrl !== announcement[1]) throw new Error('Unowned debugger endpoint UUID')
            report.debugger = { pid: proc.pid, port, uuid: path, browser: version.Browser }
            break
        }
        await sleep(100)
    }
    if (!report.debugger) throw new Error('Owned Chromium debugger not ready')
    const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(3000) })
    if (!response.ok) throw new Error('Cannot create owned page target')
    target = await response.json()
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) })).json()
    if (!target.webSocketDebuggerUrl?.startsWith(`ws://127.0.0.1:${port}/devtools/page/`) || pages.filter(page => page.id === target.id && page.type === 'page' && page.webSocketDebuggerUrl === target.webSocketDebuggerUrl).length !== 1) throw new Error('Ambiguous or unowned page target')
    ws = new WebSocket(target.webSocketDebuggerUrl)
    await Promise.race([new Promise((resolveOpen, reject) => { ws.addEventListener('open', resolveOpen, { once: true }); ws.addEventListener('error', reject, { once: true }) }), sleep(10000).then(() => { throw new Error('CDP socket open timeout') })])
    ws.onmessage = event => {
        const message = JSON.parse(String(event.data))
        const request = pending.get(message.id)
        if (request) {
            pending.delete(message.id); clearTimeout(request.timer)
            if (message.error) request.reject(new Error(JSON.stringify(message.error)))
            else request.resolve(message.result)
        } else if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails)
    }
    ws.onclose = () => { for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Owned CDP socket closed')) } pending.clear() }
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
    // Fresh owned profile only: supported persisted preferences, no outcome/credit forcing.
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('gampo_onboarding_v1', JSON.stringify({ seen:true, seenAt:new Date().toISOString() })); localStorage.setItem('gampo_settings_v1', JSON.stringify({ reduceMotion:false, animations:true, quickSpin:false })); localStorage.setItem('gampo_fun_mode', 'serious');` })
}

try {
    await fs.mkdir(out, { recursive: true })
    if (!browser || !isAbsolute(browser) || !existsSync(browser)) throw new Error('Pass an existing absolute Chromium executable with --browser=')
    if (typeof WebSocket === 'undefined') throw new Error('Node native WebSocket required; use --experimental-websocket')
    if (!/^https?:$/.test(new URL(base).protocol)) throw new Error('Pass HTTP(S) --baseUrl=')
    if (!viewports.length || viewports.some(viewport => !viewport || viewport.width < 200 || viewport.height < 200) || new Set(viewportArgs).size !== viewports.length) throw new Error('Pass unique --viewports=WIDTHxHEIGHT values of at least 200px')
    if (routes.length === 0 || new Set(routes).size !== routes.length || routes.some(route => !defaults.includes(route))) throw new Error('Routes must be nonempty, unique canonical slot or admitted Original routes')
    if (!report.scopeComplete) fail('incomplete acceptance scope', { omittedRoutes: defaults.filter(route => !routes.includes(route)), omittedCoreViewports: ['375x667', '1610x870'].filter(viewport => !viewportArgs.includes(viewport)), note: 'Scoped flags are diagnostic only; omissions cannot produce acceptance PASS' })
    if (SLOT_TEMPLATE_ROUTES.length !== SLOT_TEMPLATES.length || SLOT_TEMPLATES.some(config => !SLOT_TEMPLATE_ROUTES.some(route => route.id === config.id))) throw new Error('Canonical slot route/catalog mismatch; refusing incomplete census')
    const reachable = await fetch(base, { signal: AbortSignal.timeout(10000) })
    if (!reachable.ok) throw new Error(`Base URL returned HTTP ${reachable.status}`)
    await startBrowser()
    for (const viewport of viewports) {
        await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: viewport.width <= 768 })
        for (const route of routes) {
            const row = { route, viewport: `${viewport.width}x${viewport.height}`, mode: 'normal', checks: [], screenshots: [] }
            report.rows.push(row)
            const errorOffset = runtimeErrors.length
            try {
                const config = originalRoutes.includes(route) ? null : SLOT_TEMPLATES.find(template => template.id === (SLOT_TEMPLATE_ROUTES.find(item => item.path === route)?.id || SLOT_TEMPLATES[0].id))
                if (interrupted) throw new Error('Probe interrupted')
                const navigation = await send('Page.navigate', { url: base + route })
                if (navigation.errorText) throw new Error(navigation.errorText)
                await stable(config ? '.slot-stage-v2' : route === '/limbo' ? '.limbo-ring' : `.${route.slice(1)}-stage`)
                if (await evaluate(`!!document.querySelector('.slot-intro-overlay')`)) {
                    await screenshot(row, '-intro')
                    await click('.slot-intro-overlay button')
                    await until(`!document.querySelector('.slot-intro-overlay')`, 'intro dismissed without a spin')
                }
                await geometry(row, config)
                check(row, viewport.width > 768 || row.geometry.blockers.some(blocker => blocker.name.includes('mobile-bottom-nav')) && row.geometry.blockers.some(blocker => blocker.name.includes(config ? 'slot-mobile-dock' : 'bp-mobile-dock')), 'phone dock and navigation are rendered, not omitted', row.geometry.blockers)
                if (route === '/limbo' && viewport.width <= 768) await options(row)
                if (route === '/rps') {
                    await click(viewport.width <= 768 ? '.bp-mobile-play' : '.bp-play')
                    await until(`!!document.querySelector('.rps-versus.phase-won, .rps-versus.phase-lost, .rps-versus.phase-push')`, 'native RPS outcome')
                    await sleep(500)
                    const settled = { route, viewport: row.viewport, mode: 'settled', checks: [], screenshots: [] }
                    report.rows.push(settled)
                    await geometry(settled, null)
                }
                if (config && config.layout.rows >= 6) await fullscreen(row, config)
            } catch (error) {
                check(row, false, 'scenario completed', error.message)
                await screenshot(row, '-failure')
            }
            check(row, runtimeErrors.length === errorOffset, 'no uncaught runtime exception', runtimeErrors.slice(errorOffset))
            await fs.writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2))
            if (interrupted) throw new Error('Probe interrupted')
        }
    }
} catch (error) { fail('probe setup/execution', error.message) }
finally {
    if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.close()
        await Promise.race([new Promise(resolveClose => ws.addEventListener('close', resolveClose, { once: true })), sleep(2000)])
    }
    if (proc?.pid && !exited) {
        proc.kill('SIGTERM')
        await Promise.race([exitPromise, sleep(3000)])
        if (!exited) { proc.kill('SIGKILL'); await Promise.race([exitPromise, sleep(3000)]) }
    }
    if (proc?.pid && !exited) fail('owned browser cleanup', 'Chromium did not exit; profile retained')
    if (profile && exited) {
        try { await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
        catch (error) { fail('owned profile cleanup', error.message) }
    }
    report.finishedAt = new Date().toISOString()
    report.failureCount = report.failures.length
    report.checkCount = report.rows.reduce((count, row) => count + row.checks.length, 0)
    report.coverage = report.scopeComplete ? 'all canonical templates + factory + Limbo for requested viewports' : 'explicit scoped routes only; not full acceptance'
    report.expectedNormalScenarios = routes.length * viewports.length
    report.completedNormalScenarios = report.rows.filter(row => row.mode === 'normal').length
    try { await fs.mkdir(out, { recursive: true }); await fs.writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2)); await fs.writeFile(join(out, 'browser.log'), stderr) }
    catch (error) { console.error(`Evidence write failed: ${error.message}`); report.failureCount += 1 }
    console.log(`VISUAL LAYOUT ${report.failureCount ? 'FAILED' : 'PASSED'}: ${report.failureCount} failures, ${report.checkCount} checks, ${report.rows.length} scenarios; ${join(out, 'results.json')}`)
    process.exitCode = report.failureCount ? 1 : 0
}
