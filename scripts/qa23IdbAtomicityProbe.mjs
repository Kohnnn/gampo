// #28 feasibility probe — real-browser IndexedDB atomicity for the authority design.
//
// The authority's core claim (src/authority/authority.js:105-160) is that ONE
// readwrite transaction makes "read balance -> check stake -> write wallet +
// operation + round + final" atomic. Unit tests prove the protocol's SHAPE via
// `fake-indexeddb`; src/authority/idb.js:4-8 says plainly that this never proves
// durability, crash atomicity or real quota behaviour.
//
// This probe tests the part that is actually testable in a real browser without
// a crash: does an aborted or failed transaction leave the prior committed
// wallet row intact, and does a completed one become visible to a second
// connection. It does NOT test power loss, and a pass here must never be cited
// as crash durability.
//
// Exit codes: 0 = observations recorded (see report), 1 = harness invalid.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const FLAGS = ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--disable-background-networking', '--no-proxy-server', '--mute-audio',
    '--remote-debugging-port=0']
// Resolve Chromium from the environment: an explicit override, else whatever
// Playwright already installed for this user. No absolute home path is committed.
function resolveBrowser() {
    if (process.env.GAMPO_CHROMIUM) return process.env.GAMPO_CHROMIUM
    const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), '.cache', 'ms-playwright')]
        .filter(Boolean)
    for (const root of roots) {
        if (!existsSync(root)) continue
        const dirs = readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()
        for (const d of dirs) {
            const candidate = join(root, d, 'chrome-linux', 'chrome')
            if (existsSync(candidate)) return candidate
        }
    }
    throw new Error('No Chromium found. Set GAMPO_CHROMIUM to the browser binary.')
}
const browserPath = resolveBrowser()
const outArg = process.argv.find(a => a.startsWith('--out='))
const outDir = outArg ? outArg.slice('--out='.length) : null

class Cdp {
    constructor(url) { this.socket = new WebSocket(url); this.id = 0; this.pending = new Map() }
    async open() {
        await once(this.socket, 'open')
        this.socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data))
            const pending = this.pending.get(message.id)
            if (!pending) return
            this.pending.delete(message.id)
            clearTimeout(pending.timer)
            message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result)
        })
    }
    send(method, params = {}, sessionId) {
        const id = ++this.id
        const payload = sessionId ? { id, method, params, sessionId } : { id, method, params }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 20000)
            this.pending.set(id, { resolve, reject, timer })
            this.socket.send(JSON.stringify(payload))
        })
    }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

const PAGE = `<!doctype html><meta charset="utf-8"><title>idb probe</title>
<script>
const DB = 'gampo_authority_probe'
function open() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1)
    rq.onupgradeneeded = () => {
      const db = rq.result
      if (!db.objectStoreNames.contains('wallet')) db.createObjectStore('wallet', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('operations')) db.createObjectStore('operations', { keyPath: 'id' })
    }
    rq.onsuccess = () => res(rq.result)
    rq.onerror = () => rej(rq.error)
  })
}
function tx(db, stores, mode, body) {
  return new Promise((res, rej) => {
    const t = db.transaction(stores, mode)
    let out
    let bodyError = null
    // The body's promise can settle on a later microtask than oncomplete, so the
    // completion handler awaits it instead of reading a half-set variable.
    const bodyPromise = Promise.resolve().then(() => body(t)).then(
      v => { out = v },
      e => { bodyError = e },
    )
    t.oncomplete = () => { bodyPromise.then(() => (bodyError ? rej(bodyError) : res(out))) }
    t.onerror = () => rej(t.error)
    t.onabort = () => { bodyPromise.then(() => rej(bodyError || t.error || new Error('aborted'))) }
  })
}
function req(rq) { return new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error) }) }

window.__probe = {
  async reset(seedBalance) {
    await new Promise(r => { const d = indexedDB.deleteDatabase(DB); d.onsuccess = d.onerror = d.onblocked = () => r() })
    const db = await open()
    await tx(db, ['wallet'], 'readwrite', t => req(t.objectStore('wallet').put({ id: 'wallet:main', balance: seedBalance, revision: 1 })))
    db.close()
    return 'reset'
  },
  async readBalance() {
    const db = await open()
    const row = await tx(db, ['wallet'], 'readonly', t => req(t.objectStore('wallet').get('wallet:main')))
    db.close()
    return row ?? null
  },
  // Commit a settled round the way authority.js does: one transaction, all stores.
  async settle(stake, payout) {
    const db = await open()
    const result = await tx(db, ['wallet', 'operations'], 'readwrite', async t => {
      const walletStore = t.objectStore('wallet')
      const opStore = t.objectStore('operations')
      const row = await req(walletStore.get('wallet:main'))
      const balance = row?.balance ?? 0
      if (stake > balance) return { kind: 'rejected', code: 'insufficient-funds', balance }
      const next = Math.max(0, Number((balance - stake + payout).toFixed(2)))
      const revision = (row?.revision ?? 0) + 1
      await req(walletStore.put({ id: 'wallet:main', balance: next, revision }))
      await req(opStore.put({ id: 'op:' + revision, revision }))
      return { kind: 'committed', balanceAfter: next, revision }
    })
    db.close()
    return result
  },
  // Force an abort AFTER the wallet write inside the same transaction.
  async settleThenAbort(stake) {
    const db = await open()
    let sawWrote = false
    try {
      await tx(db, ['wallet'], 'readwrite', async t => {
        const store = t.objectStore('wallet')
        const row = await req(store.get('wallet:main'))
        const next = Math.max(0, (row?.balance ?? 0) - stake)
        await req(store.put({ id: 'wallet:main', balance: next, revision: (row?.revision ?? 0) + 1 }))
        sawWrote = true
        t.abort()
      })
      return { wrote: sawWrote, aborted: false }
    } catch (error) {
      return { wrote: sawWrote, aborted: true, error: error?.name || String(error) }
    } finally {
      db.close()
    }
  },
  // Two connections writing concurrently: IDB serialises readwrite transactions.
  async concurrentPair(stakeEach) {
    const [a, b] = await Promise.all([open(), open()])
    const body = db => tx(db, ['wallet'], 'readwrite', async t => {
      const store = t.objectStore('wallet')
      const row = await req(store.get('wallet:main'))
      const balance = row?.balance ?? 0
      // No artificial delay: a timer would let the transaction auto-commit and
      // prove nothing. IDB queues readwrite transactions on the same store, and
      // that queueing is exactly what this arm observes.
      if (stakeEach > balance) return { kind: 'rejected', balance }
      const next = Math.max(0, balance - stakeEach)
      await req(store.put({ id: 'wallet:main', balance: next, revision: (row?.revision ?? 0) + 1 }))
      return { kind: 'committed', balanceAfter: next }
    })
    const results = await Promise.all([body(a), body(b)])
    a.close(); b.close()
    return results
  },
}
</script>`

async function main() {
    const profile = await mkdtemp(join(tmpdir(), 'gampo-idb-probe-'))
    const server = createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(PAGE)
    })
    await new Promise(r => server.listen(0, '127.0.0.1', r))
    const port = server.address().port
    const pageOrigin = `http://127.0.0.1:${port}`

    const child = spawn(browserPath, [...FLAGS, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'pipe' })
    const report = { arms: [], environment: {}, cleanup: {} }
    try {
        const activePort = join(profile, 'DevToolsActivePort')
        let target = null
        for (let i = 0; i < 200; i += 1) {
            try {
                const text = await readFile(activePort, 'utf8')
                const [dp, path] = text.split('\n')
                target = `ws://127.0.0.1:${dp.trim()}${path.trim()}`
                break
            } catch { await sleep(50) }
        }
        assert(target, 'browser did not expose DevToolsActivePort')
        const cdp = new Cdp(target)
        await cdp.open()
        const { targetInfos } = await cdp.send('Target.getTargets')
        const pageTarget = targetInfos.find(t => t.type === 'page')
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true })
        await cdp.send('Page.enable', {}, sessionId)
        await cdp.send('Runtime.enable', {}, sessionId)
        await cdp.send('Page.navigate', { url: `${pageOrigin}/` }, sessionId)
        const evaluate = async expression => {
            const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
                expression, awaitPromise: true, returnByValue: true,
            }, sessionId)
            if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || 'evaluate failed')
            return result.value
        }
        for (let i = 0; i < 100; i += 1) {
            try { if (await evaluate('typeof window.__probe === "object"')) break } catch { /* not ready */ }
            await sleep(50)
        }
        report.environment = {
            origin: pageOrigin,
            browser: await evaluate('navigator.userAgent'),
        }

        // Arm A — the authority's happy path commits atomically and is visible
        // to a SEPARATE connection afterwards.
        await evaluate('window.__probe.reset(1000)')
        const settle = await evaluate('window.__probe.settle(600, 0)')
        const readBack = await evaluate('window.__probe.readBalance()')
        report.arms.push({ arm: 'settle commits and is visible to a new connection', settle, readBack })

        // Arm B — an abort after the wallet write must leave the PRIOR value.
        await evaluate('window.__probe.reset(800)')
        const abort = await evaluate('window.__probe.settleThenAbort(300)')
        const afterAbort = await evaluate('window.__probe.readBalance()')
        report.arms.push({ arm: 'abort after write leaves prior balance', abort, afterAbort })

        // Arm C — two connections, interleaved read->write. IDB serialises
        // readwrite transactions, so the second must see the first's balance.
        await evaluate('window.__probe.reset(1000)')
        const pair = await evaluate('window.__probe.concurrentPair(600)')
        const afterPair = await evaluate('window.__probe.readBalance()')
        report.arms.push({ arm: 'two connections cannot double-spend', pair, afterPair })

        // Arm D — the localStorage authority this design replaces, for contrast.
        // The defect needs a genuinely interleaved read->write, not two
        // sequential writes: writing 400 then 400 coincidentally ends correct and
        // would be a misleading control. This models the real shape — both
        // documents read the same 1000, then each publishes its own absolute
        // result. A is 600, B's ref is still 1000 so B publishes 400.
        const lsResult = await evaluate(`(() => {
            localStorage.setItem('gampo_credits', '1000')
            const readRef = () => Number(localStorage.getItem('gampo_credits'))
            const aRef = readRef()                 // document A caches 1000
            const bRef = readRef()                 // document B caches 1000
            const aAccepts = aRef >= 600
            const bAccepts = bRef >= 600           // accepted against a stale ref
            if (aAccepts) localStorage.setItem('gampo_credits', String(aRef - 600))
            if (bAccepts) localStorage.setItem('gampo_credits', String(bRef - 600))
            return { staked: 1200, accepted: (aAccepts ? 600 : 0) + (bAccepts ? 600 : 0), balance: readRef() }
        })()`)
        report.arms.push({ arm: 'localStorage contrast (absolute writes)', lsResult })

        await cdp.send('Target.closeTarget', { targetId: pageTarget.targetId })
        report.cleanup = { profile: 'removed', server: true }
    } finally {
        child.kill('SIGKILL')
        server.close()
        await rm(profile, { recursive: true, force: true }).catch(() => {})
    }

    const [settleArm, abortArm, pairArm, lsArm] = report.arms
    report.conclusion = {
        settleCommitted: settleArm.settle?.kind === 'committed' && settleArm.readBack?.balance === 400,
        abortPreservedPrior: abortArm.afterAbort?.balance === 800,
        concurrencySerialised: pairArm.pair?.filter(r => r.kind === 'committed').length === 1
            && pairArm.afterPair?.balance === 400,
        lsObserved: lsArm.lsResult,
        localStorageDoubleSpend: lsArm.lsResult?.balance === 400 && lsArm.lsResult?.staked === 1200,
        interpretation: 'Observation only. A pass shows IndexedDB serialises readwrite transactions and preserves the prior value on abort in this browser. It does NOT show crash durability, power-loss atomicity, quota behaviour under a full disk, or any hosted behaviour.',
    }
    const text = JSON.stringify(report, null, 2)
    if (outDir) { await mkdir(outDir, { recursive: true }); await writeFile(join(outDir, 'idb-atomicity.json'), text) }
    console.log(text)
    // Harness validity, not a tautology: every arm must have produced a shaped
    // observation. A hung or crashed page still yields four entries if only the
    // array length is checked, which would report success with null data.
    const c = report.conclusion
    const armsShaped = settleArm.settle && abortArm.abort && Array.isArray(pairArm.pair)
        && pairArm.pair.length === 2 && lsArm.lsResult && typeof lsArm.lsResult.balance === 'number'
    // The localStorage arm is the positive control for the defect under test: if
    // it stops double-spending, this probe no longer demonstrates the contrast
    // and must fail loudly instead of quietly reporting a pass.
    const controlHeld = c.localStorageDoubleSpend === true
    const valid = armsShaped && controlHeld
    console.log(`HARNESS VALID: ${valid} (armsShaped=${Boolean(armsShaped)} controlHeld=${controlHeld})`)
    process.exit(valid ? 0 : 1)
}

main().catch(error => { console.error(error.stack || error); process.exit(1) })
