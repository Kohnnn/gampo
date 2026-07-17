// WCAG 2.1 contrast audit. Renders routes in headless Chrome, walks visible
// text nodes, computes the effective background (compositing through ancestors
// + the page background), and flags text whose contrast ratio falls below the
// WCAG AA threshold (4.5:1 normal, 3:1 for large/bold text).
//
// Pure CDP over Node's global WebSocket (no extra deps). Reports the worst
// offenders per route; exits non-zero if any AA failure is found.

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertBaseReachable, classifyPage } from './pagePreflight.mjs'

const BASE = (process.argv.find(a => a.startsWith('--baseUrl='))?.split('=')[1] || 'http://127.0.0.1:4173').replace(/\/$/, '')
const ROUTES = (process.argv.find(a => a.startsWith('--routes='))?.split('=')[1] || '/,/settings,/insights,/sandbox,/dice,/poker').split(',')
const LIMIT = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || 8)
const EDGE = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
const browser = process.argv.find(a => a.startsWith('--browser='))?.split('=')[1] || EDGE.find(c => existsSync(c))
if (!browser) throw new Error('No Edge/Chrome found')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const port = 9850 + Math.floor(Math.random() * 120)
let proc

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

async function waitForRenderedPage(sessionId) {
    const start = Date.now()
    while (Date.now() - start < 8000) {
        if (await evalExpr("Boolean(document.querySelector('#root')?.children.length) && ((document.body.innerText || '').trim().length > 20 || document.querySelector('.route-error'))", sessionId)) return
        await sleep(120)
    }
}

const auditExpr = route => `
(() => {
  const route = ${JSON.stringify(route)};
  const requiredSelectors = {
    '/': '.casino-page',
    '/settings': '.settings-page',
    '/insights': '.insights-page',
    '/sandbox': '.sandbox-page',
    '/dice': '.game-shell',
    '/poker': '.poker-page',
    '/collections': '.collections-page',
    '/sicbo': '.game-shell',
    '/war': '.game-shell',
    '/lottery': '.game-shell',
    '/darts': '.game-shell',
    '/tarot': '.game-shell',
  };
  const LIMIT = ${LIMIT};
  const parseColor = (str) => {
    const m = str.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const parts = m[1].split(',').map(s => parseFloat(s.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  // Composite a (possibly translucent) color over a solid backdrop.
  const over = (fg, bg) => {
    const a = fg.a;
    return {
      r: fg.r * a + bg.r * (1 - a),
      g: fg.g * a + bg.g * (1 - a),
      b: fg.b * a + bg.b * (1 - a),
      a: 1,
    };
  };
  const lum = ({ r, g, b }) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
  const pageBg = { r: 11, g: 22, b: 30, a: 1 }; // app dark base fallback

  // effective background by compositing opaque-ish ancestor backgrounds
  const effectiveBg = (el) => {
    let node = el;
    let acc = null; // from nearest to farthest
    const stack = [];
    while (node && node.nodeType === 1) {
      const s = getComputedStyle(node);
      const bg = parseColor(s.backgroundColor);
      if (bg && bg.a > 0) stack.push(bg);
      node = node.parentElement;
    }
    let base = { ...pageBg };
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  };

  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05 && r.bottom >= 0 && r.top <= innerHeight + 400;
  };

  // Text sitting on a gradient/image background can't be measured by reading a
  // flat backgroundColor, so skip it (would otherwise false-positive on accent
  // buttons whose own background is a linear-gradient over transparent).
  const onGradient = (el) => {
    let node = el;
    while (node && node.nodeType === 1) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== 'none' && /gradient|url\\(/.test(s.backgroundImage)) return true;
      const bg = parseColor(s.backgroundColor);
      if (bg && bg.a >= 0.95) return false; // reached an opaque flat layer
      node = node.parentElement;
    }
    return false;
  };

  const offenders = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const text = n.nodeValue.trim();
    if (text.length < 2) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (!isVisible(el)) continue;
    if (onGradient(el)) continue;
    const s = getComputedStyle(el);
    const fg = parseColor(s.color);
    if (!fg) continue;
    const bg = effectiveBg(el);
    const fgComposited = fg.a < 1 ? over(fg, bg) : fg;
    const cr = ratio(fgComposited, bg);
    const fontSize = parseFloat(s.fontSize) || 16;
    const bold = (parseInt(s.fontWeight, 10) || 400) >= 700;
    const large = fontSize >= 24 || (bold && fontSize >= 18.66);
    const threshold = large ? 3.0 : 4.5;
    if (cr < threshold) {
      offenders.push({
        text: text.slice(0, 42),
        ratio: Math.round(cr * 100) / 100,
        threshold,
        color: s.color,
        size: Math.round(fontSize),
        bold,
        cls: typeof el.className === 'string' ? el.className.split(/\\s+/).slice(0, 2).join('.') : '',
      });
    }
  }
  offenders.sort((a, b) => a.ratio - b.ratio);
   const ready = document.readyState === 'complete';
   const rootChildren = document.querySelector('#root')?.children.length || 0;
   const routeErrors = Array.from(document.querySelectorAll('.route-error')).filter(isVisible).map(el => el.innerText.trim()).filter(Boolean);
  const required = document.querySelector(requiredSelectors[route]);
  const hasBodyText = (document.body.innerText || '').trim().length > 0;
  const hasSurface = Array.from(document.querySelectorAll('[data-ux-surface]')).some(isVisible);
  const requiredContent = requiredSelectors[route] ? Boolean(required && isVisible(required) && hasBodyText) : hasBodyText && hasSurface;
   return { count: offenders.length, worst: offenders.slice(0, LIMIT), ready, rootChildren, routeErrors, requiredContent };
})()
`

async function main() {
    await assertBaseReachable(BASE)
    proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), `gampo-contrast-${process.pid}`)}`, 'about:blank'], { stdio: 'ignore' })
    proc.unref()
    const v = await waitDbg()
    ws = new WebSocket(v.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
    ws.onmessage = (ev) => {
        const d = JSON.parse(ev.data)
        if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result) }
    }
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    await send('Page.enable', {}, sessionId)
    await send('Runtime.enable', {}, sessionId)
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId)

    let totalFail = 0
    for (const route of ROUTES) {
        await send('Page.navigate', { url: `${BASE}${route}` }, sessionId)
        await waitForRenderedPage(sessionId)
        await sleep(1600)
        let r
        try { r = await evalExpr(auditExpr(route), sessionId) } catch (e) { r = { count: -1, worst: [{ text: String(e).slice(0, 60) }], ready: false, rootChildren: 0, routeErrors: [], requiredContent: false } }
        const preflight = classifyPage(r)
        if (!preflight.ok || r.count > 0) totalFail += Math.max(1, r.count)
        const status = preflight.ok && r.count === 0 ? 'PASS' : 'FAIL'
        console.log(`${status} ${route} :: ${r.count} AA contrast issue(s) preflight=${JSON.stringify(preflight.reasons)}`)
        for (const o of r.worst || []) {
            console.log(`   ${o.ratio}:1 (need ${o.threshold}) "${o.text}" [${o.cls}] ${o.color} ${o.size}px${o.bold ? ' bold' : ''}`)
        }
    }

    await send('Target.closeTarget', { targetId })
    ws.close(); proc.kill()
    console.log(totalFail === 0 ? '\\nWCAG AA CONTRAST PASSED' : `\\n${totalFail} contrast issue(s) found`)
    process.exit(totalFail === 0 ? 0 : 1)
}
main().catch(e => { console.error(e); proc?.kill(); process.exit(1) })
