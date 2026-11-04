// #28 candidate probe - drives the REAL authority module in a real browser.
//
// The earlier probe (qa23IdbAtomicityProbe.mjs) reimplemented a transaction and
// a settle; it observed the platform, not the candidate. This one bundles
// src/authority/authority.js with esbuild and imports it into the page, so every
// arm exercises the production settleRound and inspects all five stores.
//
// Arms:
//   A  settle commits wallet + operations + rounds + finals + meta together
//   B  multi-store rollback: all five puts queued, then abort -> all five revert
//   C  two Authority instances (separate connections) cannot overdraw
//   D  replay of identical bytes charges nothing and returns replay: true
//
// Scope: local Chromium, loopback origin, disposable profile, simulated GC.
// NOT crash durability, NOT power loss, NOT quota exhaustion, NOT hosted.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const outArg = process.argv.find(a => a.startsWith('--out='))
const outDir = outArg ? outArg.slice('--out='.length) : null

function resolveBrowser() {
    if (process.env.GAMPO_CHROMIUM) return process.env.GAMPO_CHROMIUM
    const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), '.cache', 'ms-playwright')].filter(Boolean)
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

/** Bundle the real authority module for the page. */
async function bundle(dir) {
    await writeFile(join(dir, 'entry.js'), [
        `import { Authority, makeSettleRequest, canonical } from ${JSON.stringify(join(repoRoot, 'src/authority/authority.js'))}`,
        `import { Idb, openAuthorityDb } from ${JSON.stringify(join(repoRoot, 'src/authority/idb.js'))}`,
        'window.Authority = Authority',
        'window.Idb = Idb',
        'window.openAuthorityDb = openAuthorityDb',
        'window.makeSettleRequest = makeSettleRequest',
    ].join('\n'))
    await build({
        entryPoints: [join(dir, 'entry.js')],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        outfile: join(dir, 'bundle.js'),
    })
}

/** Minimal CDP client. */
async function connect(wsUrl) {
    const socket = new WebSocket(wsUrl)
    await once(socket, 'open')
    let id = 0
    const pending = new Map()
    const events = []
    socket.addEventListener('message', event => {
        const msg = JSON.parse(event.data)
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id)
            pending.delete(msg.id)
            msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
        } else if (msg.method) events.push(msg)
    })
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const next = ++id
        pending.set(next, { resolve, reject })
        socket.send(JSON.stringify({ id: next, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
    return { send, events, close: () => socket.close() }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
    const work = await mkdtemp(join(tmpdir(), 'qa23-authority-'))
    const profile = join(work, 'profile')
    await mkdir(profile, { recursive: true })
    const site = join(work, 'site')
    await mkdir(site, { recursive: true })
    await bundle(site)
    await writeFile(join(site, 'index.html'), '<!doctype html><meta charset="utf-8"><title>probe</title><script type="module" src="/bundle.js"></script>')

    const server = createServer(async (req, res) => {
        const name = req.url === '/' ? 'index.html' : req.url.slice(1)
        try {
            const body = await readFile(join(site, name))
            res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html' })
            res.end(body)
        } catch { res.writeHead(404); res.end('nope') }
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const origin = `http://127.0.0.1:${server.address().port}`

    const child = spawn(resolveBrowser(), [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
        `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    const report = { arms: [], origin }
    try {
        const activePort = join(profile, 'DevToolsActivePort')
        let text = null
        for (let i = 0; i < 200 && !text; i += 1) {
            try { text = await readFile(activePort, 'utf8') } catch { await sleep(100) }
        }
        if (!text) throw new Error('browser did not expose DevToolsActivePort')
        const [port, wsPath] = text.trim().split('\n')
        const cdp = await connect(`ws://127.0.0.1:${port}${wsPath}`)

        const { targetInfos } = await cdp.send('Target.getTargets')
        const pageTarget = targetInfos.find(t => t.type === 'page')
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true })
        const send = (method, params) => cdp.send(method, params, sessionId)

        await send('Page.enable')
        await send('Runtime.enable')
        await send('Page.navigate', { url: origin + '/' })
        for (let i = 0; i < 200; i += 1) {
            const ready = await send('Runtime.evaluate', { expression: 'typeof window.Authority', returnByValue: true })
            if (ready.result.value === 'function') break
            await sleep(50)
        }

        const evaluate = async expression => {
            const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
            if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
            return result.result.value
        }

        report.browser = (await evaluate('navigator.userAgent'))

        // Arm A + B + C + D run in one page, each on a fresh database name by
        // deleting the whole DB between arms.
        const armResults = await evaluate(`(async () => {
            const { Authority, Idb, openAuthorityDb } = window
            // ONE database for the whole run. deleteDatabase would block behind a
            // live Authority connection, so arms use distinct operation ids and
            // assert store deltas instead of resetting.
            const seed = async (balance) => {
                const db = await openAuthorityDb(indexedDB)
                const idb = new Idb(db)
                await idb.readwrite(['wallet', 'meta'], async stores => {
                    await stores.wallet.put({ id: 'current', balance, revision: 0 })
                    await stores.meta.put({ id: 'current', nextSequence: 0 })
                })
                db.close()
            }
            const db = await openAuthorityDb(indexedDB)
            const idb = new Idb(db)
            const dump = async () => ({
                wallet: await idb.read('wallet', 'current'),
                operations: (await idb.all('operations')).length,
                rounds: (await idb.all('rounds')).length,
                finals: (await idb.all('finals')).length,
                meta: await idb.read('meta', 'current'),
            })

            await seed(1000)
            const zeros = await dump()
            const arms = []

            // ---- Arm A: settle commits across all five stores.
            const auth = await Authority.open(indexedDB)
            const a1 = await auth.settleRound('op-a', { exitKind: 'cashout', stake: 100, payout: 250, label: 'A' })
            const aState = await dump()
            arms.push({
                arm: 'A settle commits all five stores',
                result: { kind: a1.kind, milestone: a1.milestone, replay: a1.replay ?? false },
                before: zeros,
                state: aState,
            })

            // ---- Arm D: replay of identical bytes charges nothing.
            const d1 = await auth.settleRound('op-a', { exitKind: 'cashout', stake: 100, payout: 250, label: 'A' })
            const dState = await dump()
            arms.push({
                arm: 'D replay is idempotent',
                result: { kind: d1.kind, replay: d1.replay === true },
                balanceAfter: dState.wallet?.balance,
                operationsUnchanged: dState.operations === aState.operations,
                nextSequenceUnchanged: dState.meta?.nextSequence === aState.meta?.nextSequence,
            })

            // Conflicting bytes under the same id must be refused, not charged.
            const d2 = await auth.settleRound('op-a', { exitKind: 'cashout', stake: 999, payout: 0, label: 'A' })
            arms.push({
                arm: 'D2 conflicting bytes under one id refused',
                result: { kind: d2.kind, code: d2.code },
                balanceAfter: (await dump()).wallet?.balance,
            })

            // ---- Arm B: multi-store rollback through the REAL settleRound.
            // Wrap the production Idb so the body queues all five puts and the
            // transaction then aborts. Every store must revert to its prior value.
            const beforeB = await dump()
            const abortingIdb = {
                read: (s, k) => idb.read(s, k),
                all: s => idb.all(s),
                readwrite: (stores, fn) => idb.readwrite(stores, async (handles, tx) => {
                    await fn(handles, tx)
                    throw Object.assign(new Error('forced abort after all puts'), { aborted: true })
                }),
            }
            const authB = new Authority(abortingIdb)
            const b1 = await authB.settleRound('op-b', { exitKind: 'cashout', stake: 100, payout: 250, label: 'B' })
            const bState = await dump()
            arms.push({
                arm: 'B multi-store abort rolls back all five stores',
                result: { kind: b1.kind, code: b1.code },
                before: beforeB,
                state: bState,
            })

            // ---- Arm C: two instances on separate connections cannot overdraw.
            const beforeC = await dump()
            const authC1 = await Authority.open(indexedDB, { writerSessionId: 'tab-1' })
            const authC2 = await Authority.open(indexedDB, { writerSessionId: 'tab-2' })
            const [c1, c2] = await Promise.all([
                authC1.settleRound('op-c1', { exitKind: 'cashout', stake: 600, payout: 0, label: 'C1' }),
                authC2.settleRound('op-c2', { exitKind: 'cashout', stake: 600, payout: 0, label: 'C2' }),
            ])
            const cState = await dump()
            arms.push({
                arm: 'C two connections cannot overdraw',
                results: [c1.kind, c2.kind],
                // One committed result is not enough: the loser must be a durable
                // refusal, not an abort or unknown that would leave the player
                // without a decided outcome.
                loser: [c1, c2].find(r => r.kind !== 'committed'),
                before: beforeC,
                state: cState,
            })

            db.close()
            return arms
        })()`)
        report.arms.push(...armResults)

        await cdp.send('Target.closeTarget', { targetId: pageTarget.targetId })
        report.cleanup = { profile: 'removed', server: true }
    } finally {
        child.kill('SIGKILL')
        server.close()
        await rm(work, { recursive: true, force: true }).catch(() => {})
    }

    const byArm = prefix => report.arms.find(a => a.arm.startsWith(prefix))
    const A = byArm('A '), B = byArm('B '), C = byArm('C '), D = byArm('D '), D2 = byArm('D2')

    report.conclusion = {
        settleCommitsAllStores: A?.result.kind === 'committed'
            && A.state.wallet?.balance === 1150
            && A.state.operations === A.before.operations + 1
            && A.state.rounds === A.before.rounds + 1
            && A.state.finals === A.before.finals + 1
            && A.state.meta?.nextSequence === (A.before.meta?.nextSequence ?? 0) + 1,
        multiStoreAbortReverts: B?.result.kind === 'aborted'
            && B.state.wallet?.balance === B.before.wallet?.balance
            && B.state.wallet?.revision === B.before.wallet?.revision
            && B.state.operations === B.before.operations
            && B.state.rounds === B.before.rounds
            && B.state.finals === B.before.finals
            && B.state.meta?.nextSequence === B.before.meta?.nextSequence,
        concurrentNoOverdraw: C?.results.filter(k => k === 'committed').length === 1
            && C.state.wallet?.balance === (C.before.wallet?.balance ?? 0) - 600
            && C.loser?.kind === 'rejected'
            && C.loser?.code === 'insufficient-funds',
        replayIdempotent: D?.result.replay === true
            && D?.balanceAfter === 1150
            && D?.operationsUnchanged === true
            && D?.nextSequenceUnchanged === true,
        idConflictRefused: D2?.result.kind === 'not-admitted' && D2?.result.code === 'id-conflict' && D2?.balanceAfter === 1150,
        interpretation: 'Drives the real src/authority module (settleRound over all five stores) in this browser. Covers the transaction boundary the design relies on. Does NOT cover crash durability, power loss, quota exhaustion, migration, legacy callers, or any hosted behaviour.',
    }

    const text = JSON.stringify(report, null, 2)
    if (outDir) { await mkdir(outDir, { recursive: true }); await writeFile(join(outDir, 'authority-atomicity.json'), text) }
    console.log(text)

    const c = report.conclusion
    const valid = report.arms.length === 5
        && c.settleCommitsAllStores && c.multiStoreAbortReverts
        && c.concurrentNoOverdraw && c.replayIdempotent && c.idConflictRefused
    console.log(`HARNESS VALID: ${valid}`)
    process.exit(valid ? 0 : 1)
}

main().catch(error => { console.error(error.stack || error); process.exit(1) })
