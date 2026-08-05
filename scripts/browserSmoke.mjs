import { mkdir, rm, writeFile } from 'node:fs/promises'
import { closeSync, existsSync, openSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { assertBaseReachable, classifyPage, isFailure } from './pagePreflight.mjs'

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
    '/collections',
    '/settings',
    '/insights',
    '/sicbo',
    '/war',
    '/lottery',
    '/darts',
    '/tarot',
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
    '/learn': /practice games|risk academy|probability|originals/i,
    '/vip': /practice games|vip|tier|originals/i,
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
    '/collections': /open|cases|collection|search/i,
    '/settings': /export|import|settings|audio/i,
    '/insights': /browse games|try the challenges|insights/i,
    '/sicbo': /roll dice|roll|clear|repeat/i,
    '/war': /draw cards|go to war|surrender/i,
    '/lottery': /draw lottery|quick pick|draw/i,
    '/darts': /throw dart|bullseye|sector/i,
    '/tarot': /pull|wands|cups|swords|pentacles/i,
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

function uxStatus(value) {
    if (value === true) return 'yes'
    if (value === false) return 'no'
    return 'n/a'
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

function debuggerHostForBrowser(browser) {
    const explicit = argValue('debuggerHost', '')
    if (explicit) return explicit
    const normalized = browser.replaceAll('\\', '/')
    if (!normalized.startsWith('/mnt/c/')) return '127.0.0.1'
    try {
        const resolv = readFileSync('/etc/resolv.conf', 'utf8')
        const match = resolv.match(/^nameserver\s+(\S+)/m)
        if (match?.[1]) return match[1]
    } catch {
        // Fall back to localhost for non-WSL environments.
    }
    return '127.0.0.1'
}

function routeSlug(route) {
    if (route === '/') return 'home'
    return route.replace(/^\//, '').replace(/[^a-z0-9-]+/gi, '-')
}

async function waitForDebugger(port, host = '127.0.0.1', timeoutMs = 8000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(`http://${host}:${port}/json/version`)
            if (res.ok) return await res.json()
        } catch {
            // Browser is still starting.
        }
        await sleep(120)
    }
    throw new Error(`Timed out waiting for browser debugger on ${host}:${port}`)
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
              && (!!document.querySelector('[data-ux-surface], .app-layout, .game-shell, .casino-page, .sb-page')
                || (document.body.innerText || '').trim().length > 20)
               && !document.querySelector('.route-fallback')
               && !document.querySelector('.route-error')
               && !document.querySelector('.core-stage.is-loading')
              && !/LOADING\\s+(LAB|STAGE)/i.test(document.body.innerText || '')`,
            returnByValue: true,
        }, sessionId)
        if (result.result?.value) return true
        await sleep(120)
    }
    return false
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

const REQUIRED_CONTENT_SELECTORS = {
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
}

async function evaluatePage(client, sessionId, route) {
    const actionPattern = (KEY_ACTIONS[route] || /bet|spin|deal|roll|play|drop|cashout|open|hit|stand|draw|start|search/i).source
    const requiredSelector = REQUIRED_CONTENT_SELECTORS[route] || ''
    const expression = `
(() => {
   const requiredSelector = ${JSON.stringify(requiredSelector)};
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
   const visibleRect = el => {
     if (!el) return null;
     const rect = el.getBoundingClientRect();
     const style = getComputedStyle(el);
     if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') return null;
     let left = Math.max(rect.left, 0);
     let right = Math.min(rect.right, viewportWidth);
     let top = Math.max(rect.top, 0);
     let bottom = Math.min(rect.bottom, viewportHeight);
     for (let parent = el.parentElement; parent; parent = parent.parentElement) {
       const parentStyle = getComputedStyle(parent);
       const parentRect = parent.getBoundingClientRect();
       const clipsX = ['hidden', 'clip', 'auto', 'scroll'].includes(parentStyle.overflowX);
       const clipsY = ['hidden', 'clip', 'auto', 'scroll'].includes(parentStyle.overflowY);
       if (clipsX) {
         left = Math.max(left, parentRect.left);
         right = Math.min(right, parentRect.right);
       }
       if (clipsY) {
         top = Math.max(top, parentRect.top);
         bottom = Math.min(bottom, parentRect.bottom);
       }
       if (right <= left || bottom <= top) return null;
     }
     return right <= left || bottom <= top ? null : { left, right, top, bottom };
   };
   const isVisible = el => Boolean(visibleRect(el));
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
  const uxPrimary = Array.from(document.querySelectorAll('[data-ux-primary-action]'))
    .find(el => isVisible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
  const action = controls.find(control => pattern.test(control.text));
  const mobilePrimarySelector = [
    '[data-mobile-hit-target="primary"]',
    '[data-mobile-primary-action]',
    '[data-slot-mobile-dock] [data-slot-action="spin"]',
    '[data-poker-action="sit-down"]',
    '[data-poker-action="fold"]',
    '[data-poker-action="call"]',
    '[data-poker-action="check"]',
    '[data-poker-action="raise"]',
    '[data-ux-primary-action]'
  ].join(',');
  const primaryTarget = viewportWidth < 768
    ? [
        '[data-mobile-hit-target="primary"]',
        '[data-mobile-primary-action]',
        '[data-slot-mobile-dock] [data-slot-action="spin"]',
        '[data-poker-action="sit-down"]',
        '[data-poker-action="fold"]',
        '[data-poker-action="call"]',
        '[data-poker-action="check"]',
        '[data-poker-action="raise"]',
        '[data-ux-primary-action]',
      ]
        .map(selector => Array.from(document.querySelectorAll(selector)).find(el => isVisible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true'))
        .find(Boolean)
    : null;
   const mobileActionHit = (() => {
     const rect = visibleRect(primaryTarget);
     if (!rect) return { checked: false, blocked: false };
     const x = Math.max(0, Math.min(viewportWidth - 1, (rect.left + rect.right) / 2));
     const y = Math.max(0, Math.min(viewportHeight - 1, (rect.top + rect.bottom) / 2));
    const top = document.elementFromPoint(x, y);
    const clean = !!top && (top === primaryTarget || primaryTarget.contains(top) || top.closest?.(mobilePrimarySelector) === primaryTarget);
    return {
      checked: true,
      blocked: !clean,
      target: describe(primaryTarget),
      top: top ? describe(top) : null,
      point: { x: Math.round(x), y: Math.round(y) },
    };
  })();
  const titleEl = document.querySelector('h1, .game-badge, .game-title, [data-game-title]');
  const loadingBlocking = Boolean(document.querySelector('.core-stage.is-loading')) || /LOADING\\s+(LAB|STAGE)/i.test(document.body.innerText || '');
  const scrollOwners = [
    document.querySelector('.app-main-wrapper'),
    document.querySelector('.main-content'),
    document.querySelector('.game-shell'),
    document.querySelector('.gs-playfield'),
    document.querySelector('.casino-page'),
    document.querySelector('.collections-page'),
    document.querySelector('.sb-page'),
    document.querySelector('.sb-main'),
    document.querySelector('.sandbox-page'),
    document.querySelector('.settings-page'),
    document.querySelector('.insights-page'),
    document.scrollingElement,
  ].filter(Boolean);
  const scrollableSurfaces = scrollOwners
    .filter((el, index, arr) => arr.indexOf(el) === index)
    .map(el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        tag: el === document.scrollingElement ? 'document' : describe(el).tag,
        scrollHeight: Math.round(el.scrollHeight || 0),
        clientHeight: Math.round(el.clientHeight || rect.height || 0),
        overflowY: style.overflowY,
        visible: isVisible(el) || el === document.scrollingElement,
        scrollable: (el.scrollHeight || 0) > (el.clientHeight || rect.height || 0) + 6,
      };
    });
  const needsScroll = docHeight > viewportHeight + 6 || scrollableSurfaces.some(item => item.scrollable);
  const scrollReachable = !needsScroll || scrollableSurfaces.some(item => item.visible && item.scrollable && item.overflowY !== 'hidden' && item.overflowY !== 'clip');
  const playfield = document.querySelector('.gs-playfield, [data-game-stage], [data-mobile-critical-surface]');
  const controlsPanel = document.querySelector('.gs-panel');
  const playfieldPriority = (() => {
    if (viewportWidth >= 768 || !document.querySelector('.game-shell')) return null;
    if (!playfield || !controlsPanel || !isVisible(controlsPanel)) return true;
    const playRect = playfield.getBoundingClientRect();
    const panelRect = controlsPanel.getBoundingClientRect();
    return playRect.top <= panelRect.top + 2;
  })();
   const uxSurfaces = Array.from(document.querySelectorAll('[data-ux-surface]'))
     .filter(isVisible)
     .map(el => el.getAttribute('data-ux-surface'));
   const uniqueUxSurfaces = [...new Set(uxSurfaces)];
   const rootChildren = document.querySelector('#root')?.children.length || 0;
   const routeErrors = Array.from(document.querySelectorAll('.route-error'))
     .filter(isVisible)
     .map(el => (el.innerText || el.textContent || '').trim())
     .filter(Boolean);
   const requiredElement = requiredSelector ? document.querySelector(requiredSelector) : null;
   const requiredContent = requiredSelector
     ? Boolean(requiredElement && isVisible(requiredElement))
     : uniqueUxSurfaces.length > 0;
  const uxPrimaryVisible = Boolean(uxPrimary);
  const uxScore = Math.max(0, 100
    - (docWidth > viewportWidth + 1 ? 20 : 0)
    - (loadingBlocking ? 15 : 0)
    - (brokenImages.length ? 15 : 0)
    - (!action && !uxPrimary ? 15 : 0)
    - (!scrollReachable ? 15 : 0)
    - (mobileActionHit.blocked ? 20 : 0)
    - (playfieldPriority === false ? 10 : 0)
    - (uniqueUxSurfaces.length === 0 ? 5 : 0));
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
    keyActionVisible: Boolean(action || uxPrimary),
    keyAction: action || null,
    uxPrimaryAction: uxPrimary ? describe(uxPrimary) : null,
     loadingBlocking,
     rootChildren,
     routeErrors,
     requiredContent,
     mobileActionHit,
    ux: {
      score: uxScore,
      surfaces: uniqueUxSurfaces,
      primaryActionVisible: uxPrimaryVisible,
      scrollReachable,
      scrollableSurfaces,
      playfieldPriority,
    },
  };
})()`
    const result = await client.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: false,
    }, sessionId)
    return result.result?.value
}

async function runMobileInteraction(client, sessionId, route, viewport) {
    if (viewport.width >= 768 && route !== '/poker') return { status: 'skipped', reason: 'desktop viewport' }
    const expression = `
(async () => {
  const route = ${JSON.stringify(route)};
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
   const visibleRect = el => {
     if (!el) return null;
     const rect = el.getBoundingClientRect();
     const style = getComputedStyle(el);
     if (rect.width <= 0 || rect.height <= 0 || style.display === 'none' || style.visibility === 'hidden') return null;
     let left = Math.max(rect.left, 0);
     let right = Math.min(rect.right, innerWidth);
     let top = Math.max(rect.top, 0);
     let bottom = Math.min(rect.bottom, innerHeight);
     for (let parent = el.parentElement; parent; parent = parent.parentElement) {
       const parentStyle = getComputedStyle(parent);
       const parentRect = parent.getBoundingClientRect();
       const clipsX = ['hidden', 'clip', 'auto', 'scroll'].includes(parentStyle.overflowX);
       const clipsY = ['hidden', 'clip', 'auto', 'scroll'].includes(parentStyle.overflowY);
       if (clipsX) {
         left = Math.max(left, parentRect.left);
         right = Math.min(right, parentRect.right);
       }
       if (clipsY) {
         top = Math.max(top, parentRect.top);
         bottom = Math.min(bottom, parentRect.bottom);
       }
       if (right <= left || bottom <= top) return null;
     }
     return right <= left || bottom <= top ? null : { left, right, top, bottom };
   };
   const visible = el => Boolean(visibleRect(el));
  const describe = el => {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\\s+/g, ' ').slice(0, 70),
      className: typeof el.className === 'string' ? el.className.split(/\\s+/).slice(0, 4).join(' ') : '',
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  };
  const findTarget = selector => Array.from(document.querySelectorAll(selector))
    .find(el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
  const clickTarget = selector => {
    const el = findTarget(selector);
    if (!el) return { clicked: false, missing: true, selector };
     const rect = visibleRect(el);
     if (!rect) return { clicked: false, missing: true, selector };
     const x = Math.max(0, Math.min(innerWidth - 1, (rect.left + rect.right) / 2));
     const y = Math.max(0, Math.min(innerHeight - 1, (rect.top + rect.bottom) / 2));
    const top = document.elementFromPoint(x, y);
    const clean = !!top && (top === el || el.contains(top) || top.closest?.(selector) === el);
    if (!clean) return { clicked: false, blocked: true, selector, target: describe(el), top: describe(top), point: { x: Math.round(x), y: Math.round(y) } };
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    el.click();
    return { clicked: true, selector, target: describe(el) };
  };
  const primary = '[data-mobile-hit-target="primary"], [data-mobile-primary-action], [data-ux-primary-action]';
  const textIncludes = value => (document.body.innerText || '').toLowerCase().includes(value.toLowerCase());
  const ok = (message, extra = {}) => ({ status: 'passed', message, ...extra });
  const fail = (message, extra = {}) => ({ status: 'failed', message, ...extra });

  if (document.querySelector('[data-slot-mobile-dock]')) {
    const click = clickTarget('[data-slot-mobile-dock] [data-slot-action="spin"]');
    if (!click.clicked) return fail('slot spin target was not clickable', click);
    await sleep(700);
    const cells = document.querySelectorAll('.slot-reel-grid .slot-cell, .slot-reel-grid .slot-symbol-card').length;
    const active = Boolean(document.querySelector('.slot-stage-v2[data-slot-spinning="true"], .slot-stage-v2.spinning, .slot-mobile-spin:disabled, .slot-result-banner'));
    return cells > 0 && active ? ok('slot spin entered active state', { cells }) : fail('slot spin did not mutate visible state', { cells, active });
  }

  if (route === '/poker') {
    const click = clickTarget('[data-poker-action="sit-down"]');
    if (!click.clicked) return fail('poker sit-down target was not clickable', click);
    // After sit-down, bots left of the blinds act first (BOT_THINK_MS each), so
    // the human's action bar appears after a variable delay. Poll for the seated
    // table and retired-advice absence, then wait up to ~8s for the human turn
    // (enabled action button) rather than a fixed sleep that races the bots.
    await sleep(500);
    const table = Boolean(document.querySelector('.poker-layout'));
    // The retired mobile advice panels must stay gone.
    const retiredAbsent = !document.querySelector('.poker-mobile-gto-now, [data-poker-mobile-panel="gto"]');
    // The coach is behind the Coach tab (sidebar defaults to History), so open it
    // before asserting. Checking only the retired selectors above is vacuously true
    // and proves nothing; this exercises the real coach surface instead.
    const coachTab = [...document.querySelectorAll('.poker-tab')].find(b => /coach/i.test(b.textContent || ''));
    if (coachTab) { coachTab.click(); await sleep(350); }
    const coach = document.querySelector('[data-poker-coach-state]');
    const coachState = coach ? coach.getAttribute('data-poker-coach-state') : null;
    // With no reviewed source wired, the coach must never claim exact/prescriptive play.
    const truthfulState = coachState !== null && coachState !== 'supported';
    // If frequencies are shown without a supported source, the not-reviewed note is required.
    const freqShown = Boolean(document.querySelector('.pk-coach-actions'));
    const noteShown = Boolean(document.querySelector('.pk-coach-note'));
    const freqHonest = !freqShown || coachState === 'supported' || noteShown;
    const adviceAbsent = retiredAbsent && truthfulState && freqHonest;
    let action = false;
    for (let i = 0; i < 40; i += 1) {
      action = Boolean(document.querySelector(
        '[data-poker-action="fold"]:not(:disabled), [data-poker-action="call"]:not(:disabled), [data-poker-action="check"]:not(:disabled), [data-poker-action="raise"]:not(:disabled)',
      ));
      if (action) break;
      await sleep(200);
    }
    const details = { table, adviceAbsent, action, coachMounted: Boolean(coach), coachState, retiredAbsent, truthfulState, freqShown, freqHonest };
    return table && adviceAbsent && action
      ? ok('poker seated; coach truthful; human action reachable', details)
      : fail('poker did not reach seated table, truthful-coach human action state', details);
  }

  if (route === '/cases') {
    const click = clickTarget('[data-cases-mobile-open]');
    if (!click.clicked) return fail('cases mobile open target was not clickable', click);
    let reel = false;
    let inView = false;
    for (let i = 0; i < 30; i += 1) {
      await sleep(160);
      const area = document.querySelector('.cases-reel-area');
      reel = Boolean(document.querySelector('.cases-carousel-frame, .cases-multi-open-grid'));
      const r = area ? area.getBoundingClientRect() : null;
      inView = Boolean(r && r.top < innerHeight && r.bottom > 0 && r.height > 0);
      if (reel && inView) break;
    }
    return reel && inView ? ok('cases open spun reel in view') : fail('cases open did not surface reel in view', { reel, inView });
  }

  if (route === '/baccarat') {
    const chip = clickTarget('.bac-bet-cell.banker, .bac-bet-cell.player');
    if (!chip.clicked) return fail('baccarat bet cell was not clickable', chip);
    await sleep(150);
    const stakeReady = Boolean(document.querySelector('.bac-ticket-chip')) || /banker|player/i.test(document.body.innerText || '');
    const deal = clickTarget(primary);
    if (!deal.clicked) return fail('baccarat deal target was not clickable', deal);
    await sleep(900);
    const road = Boolean(document.querySelector('.bac-road-cell.latest, .bac-road-cell'));
    return stakeReady && road ? ok('baccarat bet/deal updated road') : fail('baccarat did not record visible result', { stakeReady, road });
  }

  if (route === '/blackjack') {
    const click = clickTarget(primary);
    if (!click.clicked) return fail('blackjack deal target was not clickable', click);
    await sleep(700);
    const cards = document.querySelectorAll('.bj-card, .gampo-card, .bj-hand-card').length;
    const actions = Boolean(document.querySelector('.bj-actions button, [data-mobile-primary-action]'));
    return cards > 0 && actions ? ok('blackjack dealt visible cards/actions', { cards }) : fail('blackjack did not expose cards/actions', { cards, actions });
  }

  if (route === '/videopoker') {
    const click = clickTarget(primary);
    if (!click.clicked) return fail('video poker deal target was not clickable', click);
    await sleep(700);
    const cards = document.querySelectorAll('.vp-card-slot, .vp-card').length;
    const paytable = Boolean(document.querySelector('.vp-paytable-shell, .vp-paytable'));
    return cards >= 5 && paytable ? ok('video poker dealt with paytable reachable', { cards }) : fail('video poker did not expose hand/paytable', { cards, paytable });
  }

  if (route === '/rps') {
    clickTarget('.rps-stage-choices button:nth-child(2), .rps-choice:nth-child(2)');
    const click = clickTarget(primary);
    if (!click.clicked) return fail('rps play target was not clickable', click);
    await sleep(650);
    const settled = Boolean(document.querySelector('.rrs-chip')) || /win|loss|tie|paper/i.test(document.body.innerText || '');
    return settled ? ok('rps selected choice settled') : fail('rps did not settle after selected choice');
  }

  if (route === '/coinflip') {
    const click = clickTarget(primary);
    if (!click.clicked) return fail('coin flip target was not clickable', click);
    await sleep(1000);
    const settled = Boolean(document.querySelector('.rrs-chip, .coinflip-stage.win-flash, .coinflip-stage.loss-flash')) || /win|loss/i.test(document.body.innerText || '');
    return settled ? ok('coin flip settled visibly') : fail('coin flip did not settle visibly');
  }

  if (route === '/keno') {
    const click = clickTarget(primary);
    if (!click.clicked) return fail('keno draw target was not clickable', click);
    await sleep(1000);
    const drawn = Boolean(document.querySelector('.keno-grid .drawn, .rrs-chip'));
    return drawn ? ok('keno draw started/settled visibly') : fail('keno did not draw visible numbers');
  }

  if (route === '/wheel') {
    const click = clickTarget(primary);
    if (!click.clicked) return fail('wheel spin target was not clickable', click);
    await sleep(1000);
    const active = Boolean(document.querySelector('.wheel-disc.spinning, .wheel-stage.win-flash, .wheel-stage.loss-flash, .rrs-chip')) || !/Last\\s+0(?:\\.00)?x/i.test(document.body.innerText || '');
    return active ? ok('wheel spin mutated state') : fail('wheel spin did not mutate state');
  }

  if (route === '/hilo') {
    const click = clickTarget(primary);
    if (!click.clicked) return fail('hilo draw target was not clickable', click);
    await sleep(700);
    const cards = document.querySelectorAll('.hilo-card, .gampo-card').length;
    const settled = Boolean(document.querySelector('.rrs-chip, .hilo-stage.win-flash, .hilo-stage.loss-flash'));
    return cards >= 2 || settled ? ok('hi-lo draw updated visible cards') : fail('hi-lo did not update visible cards', { cards, settled });
  }

  if (route === '/crash') {
    const click = clickTarget(primary);
    if (!click.clicked) return fail('crash bet target was not clickable', click);
    await sleep(650);
    const active = Boolean(document.querySelector('.crash-stage.phase-betting, .crash-stage.phase-running, .crash-stage.phase-cashed, .crash-stage.phase-crashed')) || /BETTING OPEN|Live|BUST|CASH/i.test(document.body.innerText || '');
    return active ? ok('crash entered round state') : fail('crash did not enter round state');
  }

  if (['/sicbo', '/roulette', '/dice', '/limbo', '/plinko', '/mines', '/dino'].includes(route)) {
    const click = clickTarget(primary);
    if (!click.clicked) return fail('primary target was not clickable', click);
    await sleep(500);
    return ok('primary target accepted pointer hit', click);
  }

  return { status: 'skipped', reason: 'no route interaction contract' };
})()`
    const result = await client.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
    }, sessionId)
    return result.result?.value || { status: 'failed', message: 'interaction script returned no result' }
}

async function run() {
    // Default to the preview port, matching auditA11y/auditContrast/verifyBetSheet.
    // `npm run dev` users can still pass --baseUrl=http://127.0.0.1:5173 explicitly.
    const baseUrl = argValue('baseUrl', 'http://127.0.0.1:4173').replace(/\/$/, '')
    const origin = new URL(baseUrl).origin
    const mode = argValue('mode', 'smoke')
    const isUxMode = mode === 'ux'
    const outDir = resolve(argValue('out', isUxMode ? 'output/ux-benchmark' : 'output/browser-smoke'))
    const label = argValue('label', new Date().toISOString().replace(/[:.]/g, '-'))
    const clean = process.argv.includes('--clean') || process.env.npm_config_clean === 'true'
    const routes = parseListArg('routes', DEFAULT_ROUTES)
    const viewports = parseViewportArg(argValue('viewports', ''))
    const browser = findBrowser()
    const debuggerHost = debuggerHostForBrowser(browser)
    const port = Number(argValue('port', String(9300 + Math.floor(Math.random() * 400))))
    const readyTimeoutMs = Number(argValue('readyTimeoutMs', '12000'))
    const settleMs = Number(argValue('settleMs', '700'))
    const userDataDir = join(tmpdir(), `gampo-smoke-${process.pid}`)
    const runDir = join(outDir, label)
    const screenshotDir = join(runDir, 'screenshots')

    await assertBaseReachable(baseUrl)

    if (clean) await rm(runDir, { recursive: true, force: true })
    await mkdir(screenshotDir, { recursive: true })

    const browserLogPath = join(runDir, 'browser-startup.log')
    const browserLogFd = openSync(browserLogPath, 'a')
    const proc = spawn(browser, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--mute-audio',
        '--remote-debugging-address=0.0.0.0',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        'about:blank',
    ], { stdio: ['ignore', browserLogFd, browserLogFd] })
    proc.unref()

    let client
    try {
        let version
        try {
            version = await waitForDebugger(port, debuggerHost)
        } catch (error) {
            let details = ''
            try { details = readFileSync(browserLogPath, 'utf8').trim() } catch {}
            throw new Error(`${error.message}${details ? `\nBrowser startup log (${browserLogPath}):\n${details}` : ''}`)
        }
        if (debuggerHost !== '127.0.0.1') {
            version.webSocketDebuggerUrl = version.webSocketDebuggerUrl.replace('127.0.0.1', debuggerHost)
        }
        client = new CdpClient(version.webSocketDebuggerUrl)
        await client.open()

        const results = []
        for (const viewport of viewports) {
            for (const route of routes) {
                const url = `${baseUrl}${route}`
                const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' })
                const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true })
                try {
                    await client.send('Page.enable', {}, sessionId)
                    await client.send('Runtime.enable', {}, sessionId)
                    await client.send('Log.enable', {}, sessionId)

                    // Pre-seed first-visit onboarding as already seen so the one-time
                    // WelcomeModal doesn't gate every route during steady-state benchmarking
                    // (the modal is verified separately). Runs before any page script on
                    // each fresh navigation, surviving the per-route storage clear.
                    try {
                        await client.send('Page.addScriptToEvaluateOnNewDocument', {
                            source: "try { localStorage.setItem('gampo_onboarding_v1', JSON.stringify({ seen: true, seenAt: new Date().toISOString() })); } catch (e) {}",
                        }, sessionId)
                    } catch {
                        // Older Chromium may reject; harness still works, modal may show.
                    }

                    await client.send('Emulation.setDeviceMetricsOverride', {
                        width: viewport.width,
                        height: viewport.height,
                        deviceScaleFactor: 1,
                        mobile: viewport.width < 768,
                    }, sessionId)
                    client.drainEvents(sessionId)
                    try {
                        await client.send('Storage.clearDataForOrigin', {
                            origin,
                            storageTypes: 'local_storage,session_storage,indexeddb',
                        }, sessionId)
                    } catch {
                        // Older Chromium builds can reject Storage.clearDataForOrigin
                        // before a target is fully warmed. The route still gets a hard
                        // navigation below, so this is a best-effort isolation step.
                    }
                    await client.send('Page.navigate', { url }, sessionId)
                    await waitForLoad(client, sessionId)
                    let ready = await waitForReady(client, sessionId, readyTimeoutMs)
                    if (!ready) {
                        await client.send('Page.reload', { ignoreCache: true }, sessionId)
                        await waitForLoad(client, sessionId)
                        ready = await waitForReady(client, sessionId, Math.max(readyTimeoutMs, 12000))
                    }
                    await sleep(settleMs)
                    const events = client.drainEvents(sessionId)
                    const metrics = await evaluatePage(client, sessionId, route)
                    const interaction = await runMobileInteraction(client, sessionId, route, viewport)
                    const interactionEvents = client.drainEvents(sessionId)
                    const preflight = classifyPage({ ready, rootChildren: metrics.rootChildren, routeErrors: metrics.routeErrors, requiredContent: metrics.requiredContent })
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
                        errors: collectErrors([...events, ...interactionEvents]),
                        interaction,
                        ready,
                        rootChildren: metrics.rootChildren,
                        routeErrors: metrics.routeErrors,
                        requiredContent: metrics.requiredContent,
                        preflightReasons: preflight.reasons,
                        ...metrics,
                    })
                    const blocked = metrics.mobileActionHit?.blocked ? ' blocked' : ''
                    const score = isUxMode && metrics.ux ? ` ux=${metrics.ux.score}` : ''
                    console.log(`${viewport.width}x${viewport.height} ${route} ready=${ready ? 'yes' : 'no'} root=${metrics.rootChildren} routeErrors=${metrics.routeErrors.length} required=${metrics.requiredContent ? 'yes' : 'no'} preflight=${preflight.reasons.length} overflow=${metrics.overflowDelta}px action=${metrics.keyActionVisible ? 'yes' : 'no'}${blocked}${score} interaction=${interaction.status} errors=${collectErrors([...events, ...interactionEvents]).length}`)
                } finally {
                    try {
                        await client.send('Target.closeTarget', { targetId })
                    } catch {
                        // Browser shutdown will reclaim the target if route cleanup races.
                    }
                }
            }
        }

        const failures = results.filter(item => (
            item.overflowX
            || item.loadingBlocking
            || item.brokenImages.length
            || item.errors.length
            || !item.ready
            || isFailure(item)
            || !item.keyActionVisible
            || item.mobileActionHit?.blocked
            || item.interaction?.status === 'failed'
        ))
        const report = {
            baseUrl,
            browser,
            mode,
            generatedAt: new Date().toISOString(),
            viewports,
            routes,
            total: results.length,
            failureCount: failures.length,
            failures,
            results,
        }
        await writeFile(join(runDir, 'report.json'), JSON.stringify(report, null, 2))
        const summaryRows = results.map(item => {
            const common = `| ${item.viewport.width}x${item.viewport.height} | ${item.route} | ${item.ready ? 'yes' : 'no'} | ${item.rootChildren} | ${item.routeErrors.length} | ${item.requiredContent ? 'yes' : 'no'} | ${item.preflightReasons.map(reason => reason.code).join(', ') || 'none'} | ${item.overflowDelta}px | ${item.loadingBlocking ? 'yes' : 'no'} | ${item.keyActionVisible ? 'yes' : 'no'} | ${item.mobileActionHit?.checked ? (item.mobileActionHit.blocked ? 'blocked' : 'clean') : 'n/a'} | ${item.interaction?.status || 'n/a'} | ${item.brokenImages.length} | ${item.errors.length}`
            if (!isUxMode) return `${common} | ${item.screenshot.replaceAll('\\', '/')} |`
            return `${common} | ${item.ux?.score ?? 'n/a'} | ${uxStatus(item.ux?.scrollReachable)} | ${uxStatus(item.ux?.playfieldPriority)} | ${item.ux?.surfaces?.join(', ') || 'none'} | ${item.screenshot.replaceAll('\\', '/')} |`
        })
        await writeFile(join(runDir, 'summary.md'), [
            `# GamPo ${isUxMode ? 'UX Benchmark' : 'Browser Smoke'} ${label}`,
            '',
            `Base URL: ${baseUrl}`,
            `Mode: ${mode}`,
            `Total checks: ${results.length}`,
            `Failures: ${failures.length}`,
            '',
            isUxMode
                ? '| Viewport | Route | Ready | Root | Route Errors | Required Content | Preflight | Overflow | Loading | Key Action | Hit Test | Interaction | Broken Images | Errors | UX Score | Scroll | Playfield First | UX Surfaces | Screenshot |'
                : '| Viewport | Route | Ready | Root | Route Errors | Required Content | Preflight | Overflow | Loading | Key Action | Hit Test | Interaction | Broken Images | Errors | Screenshot |',
            isUxMode
                ? '| --- | --- | --- | ---: | ---: | --- | --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |'
                : '| --- | --- | --- | ---: | ---: | --- | --- | ---: | --- | --- | --- | --- | ---: | ---: | --- |',
            ...summaryRows,
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
        try { closeSync(browserLogFd) } catch {}
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
