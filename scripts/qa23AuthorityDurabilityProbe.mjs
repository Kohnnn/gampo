// AC08 restart durability for the authority wallet — genuinely missing before now.
//
// The save-concurrency plan's own gap table says: "crash/restart durability of the
// chosen authority: no runner on either option. `qa23AuthorityAtomicityProbe.mjs`
// reloads nothing." This is that runner.
//
// What it measures, and what it refuses to claim:
//   - real Chromium, real IndexedDB, real profile directory
//   - a committed settlement must survive (a) a page reload and (b) the browser
//     process being SIGKILLed and relaunched on the same profile
//   - an aborted settlement must be absent after the restart, not merely
//     invisible in the closing page
//   - it does NOT test power loss, OS crash, cross-device sync, quota exhaustion
//     or a second browser engine. Owner decision 9 scopes durability to current
//     stable desktop Chromium, ordinary reload and browser restart only.
//
// A `fake-indexeddb` shim can never satisfy this (owner decision 11); that is why
// the browser is killed rather than mocked.
//
// Usage: node scripts/qa23AuthorityDurabilityProbe.mjs [--out=<dir>]

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const outArg = process.argv.find(a => a.startsWith('--out='))
const outDir = outArg ? outArg.slice('--out='.length) : null

const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.error('[durability]', ...a)
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

function resolveBrowser() {
    if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN
    if (process.env.GAMPO_CHROMIUM && existsSync(process.env.GAMPO_CHROMIUM)) return process.env.GAMPO_CHROMIUM
    const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), '.cache', 'ms-playwright'), '/home/compute_01/.cache/ms-playwright'].filter(Boolean)
    for (const root of roots) {
        if (!existsSync(root)) continue
        const dirs = readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()
        for (const d of dirs) {
            for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
                const candidate = join(root, d, rel)
                if (existsSync(candidate)) return candidate
            }
        }
    }
    throw new Error('No Chromium found. Set CHROME_BIN or GAMPO_CHROMIUM to the browser binary.')
}

function identity(bundleBytes) {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src/authority'], { cwd: repoRoot, encoding: 'utf8' }).trim()
    const sources = ['src/authority/authority.js', 'src/authority/idb.js', 'src/authority/resultContract.js']
        .map(path => ({ path, sha256: sha256(readFileSync(join(repoRoot, path))) }))
    return { head, authoritySourcesDirty: dirty.length > 0, bundle: { bytes: bundleBytes.length, sha256: sha256(bundleBytes) }, sources }
}

async function bundle(dir) {
    await writeFile(join(dir, 'entry.js'), [
        `import { Authority } from ${JSON.stringify(join(repoRoot, 'src/authority/authority.js'))}`,
        `import { Idb, openAuthorityDb } from ${JSON.stringify(join(repoRoot, 'src/authority/idb.js'))}`,
        'window.Authority = Authority',
        'window.Idb = Idb',
        'window.openAuthorityDb = openAuthorityDb',
    ].join('\n'))
    await build({
        entryPoints: [join(dir, 'entry.js')],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        outfile: join(dir, 'bundle.js'),
    })
}

async function connect(wsUrl) {
    const socket = new WebSocket(wsUrl)
    await once(socket, 'open')
    let id = 0
    const pending = new Map()
    socket.addEventListener('message', event => {
        const msg = JSON.parse(event.data)
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id)
            pending.delete(msg.id)
            msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
        }
    })
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const next = ++id
        pending.set(next, { resolve, reject })
        socket.send(JSON.stringify({ id: next, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
    return { send, close: () => socket.close() }
}

/** Launch the browser on `profile` and attach to its first page. */
async function launch(browser, profile) {
    log('launch', profile)
    const child = spawn(browser, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    // A bad GAMPO_CHROMIUM surfaces as an uncaught 'error' event, which kills the
    // process before the caller's finally can remove the temp profile. Turn it
    // into a rejection the caller can clean up after.
    await new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('spawn', resolve)
    }).catch((error) => {
        throw new Error(`could not start the browser at ${browser}: ${error.message}`)
    })

    const activePort = join(profile, 'DevToolsActivePort')
    // A relaunch reuses the profile, so a stale DevToolsActivePort from the
    // previous process is present before the new one is listening. Wait for the
    // file to mention a port that actually accepts a connection.
    let wsUrl = null
    for (let i = 0; i < 300 && !wsUrl; i += 1) {
        try {
            const text = await readFile(activePort, 'utf8')
            const [port, wsPath] = text.trim().split('\n')
            if (port && wsPath) {
                const probe = await fetch(`http://127.0.0.1:${port}/json/version`).catch(() => null)
                if (probe?.ok) wsUrl = `ws://127.0.0.1:${port}${wsPath}`
            }
        } catch { /* not up yet */ }
        if (!wsUrl) await sleep(100)
    }
    if (!wsUrl) {
        try { child.kill('SIGKILL') } catch {}
        throw new Error('browser did not expose a reachable DevToolsActivePort')
    }

    log('cdp connect', wsUrl)
    const cdp = await connect(wsUrl)
    const { targetInfos } = await cdp.send('Target.getTargets')
    const pageTarget = targetInfos.find(t => t.type === 'page')
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true })
    const send = (method, params) => cdp.send(method, params, sessionId)

    log('attached')
    await send('Page.enable')
    await send('Runtime.enable')

    const evaluate = async expression => {
        const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
        return result.result.value
    }

    const ready = async (origin) => {
        log('navigate', origin)
        await send('Page.navigate', { url: origin + '/' })
        for (let i = 0; i < 300; i += 1) {
            const t = await evaluate('typeof window.Authority').catch(() => '')
            if (t === 'function') return
            await sleep(50)
        }
        throw new Error('authority bundle never loaded')
    }

    const kill = async () => {
        log('kill')

        try { cdp.close() } catch {}
        // `once` after an already-exited child never resolves, and a SIGKILLed
        // Chromium can take a moment to reap. Bound the wait.
        if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL')
            await Promise.race([once(child, 'exit'), sleep(5000)]).catch(() => {})
        }
        // The profile is only safely reusable once the process is gone.
        await sleep(400)
    }

    return { evaluate, ready, kill, child }
}

// Reads the WHOLE transaction scope through the production modules. Asserting
// only the wallet and an operation id would pass even if the round/final writes
// were dropped, or if an aborted round left an orphan behind.
const READ_STATE = `(async () => {
    const db = await window.openAuthorityDb(indexedDB)
    const idb = new window.Idb(db)
    const wallet = await idb.read('wallet', 'current')
    const meta = await idb.read('meta', 'current')
    const rows = async name => (await idb.all(name)).map(r => JSON.stringify(r)).sort()
    const operations = await rows('operations')
    const rounds = await rows('rounds')
    const finals = await rows('finals')
    db.close()
    return { wallet, meta, operations, rounds, finals }
})()`

async function main() {
    const work = await mkdtemp(join(tmpdir(), 'qa23-durability-'))
    const profile = join(work, 'profile')
    const site = join(work, 'site')
    let server = null
    let session = null
    const closed = []
    const report = { arms: [] }
    try {
        // Everything from here on can throw. Bundling, browser resolution and
        // server startup used to sit outside the try, so a failure there leaked
        // the temp profile and (for a half-launched browser) a live process.
        await mkdir(profile, { recursive: true })
        await mkdir(site, { recursive: true })
        await bundle(site)
        await writeFile(join(site, 'index.html'), '<!doctype html><meta charset="utf-8"><title>probe</title><script type="module" src="/bundle.js"></script>')

        report.identity = identity(await readFile(join(site, 'bundle.js')))
        const browser = resolveBrowser()

        server = createServer(async (req, res) => {
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
        log('run1 start')
        // ---- Run 1: seed, commit one round, abort another --------------------
        session = await launch(browser, profile)
        await session.ready(origin)
        report.browser = await session.evaluate('navigator.userAgent')

        const first = await session.evaluate(`(async () => {
            const db = await window.openAuthorityDb(indexedDB)
            const idb = new window.Idb(db)
            await idb.readwrite(['wallet', 'meta'], async stores => {
                await stores.wallet.put({ id: 'current', balance: 1000, revision: 0 })
                await stores.meta.put({ id: 'current', nextSequence: 0 })
            })
            db.close()

            const auth = await window.Authority.open(indexedDB, { epoch: 'e1', writerSessionId: 'durability-1' })
            const committed = await auth.settleRound('op-durable', { exitKind: 'cashout', stake: 100, payout: 250, label: 'Durable' })

            // An abort AFTER the body queued every write: nothing may survive.
            const base = await window.openAuthorityDb(indexedDB)
            const baseIdb = new window.Idb(base)
            const aborting = {
                read: (s, k) => baseIdb.read(s, k),
                all: s => baseIdb.all(s),
                readwrite: (stores, fn) => baseIdb.readwrite(stores, async (handles, tx) => {
                    await fn(handles, tx)
                    throw Object.assign(new Error('forced abort after all puts'), { aborted: true })
                }),
            }
            const authAbort = new window.Authority(aborting)
            const aborted = await authAbort.settleRound('op-aborted', { exitKind: 'win', stake: 5, payout: 9, label: 'Aborted' })
            base.close()

            return {
                committed: { kind: committed.kind, milestone: committed.milestone, balanceAfter: committed.value?.balanceAfter },
                aborted: { kind: aborted.kind, code: aborted.code },
            }
        })()`)

        const beforeKill = await session.evaluate(READ_STATE)
        report.arms.push({ arm: 'A commit then forced abort, before restart', first, state: beforeKill })

        log('run1b reload')
        // ---- Run 1b: ordinary reload must not lose or duplicate anything -----
        await session.ready(origin)
        const afterReload = await session.evaluate(READ_STATE)
        report.arms.push({ arm: 'B ordinary reload', state: afterReload })

        log('kill + relaunch')
        // ---- Kill the process, relaunch on the same profile ------------------
        await session.kill()
        closed.push(true)
        session = await launch(browser, profile)
        await session.ready(origin)
        const afterRestart = await session.evaluate(READ_STATE)
        report.arms.push({ arm: 'C browser process killed and relaunched', state: afterRestart })

        log('run2 commit')
        // A second restart after a further commit also has to hold: one lucky
        // flush is not durability.
        const second = await session.evaluate(`(async () => {
            const auth = await window.Authority.open(indexedDB, { epoch: 'e1', writerSessionId: 'durability-2' })
            const r = await auth.settleRound('op-durable-2', { exitKind: 'win', stake: 50, payout: 120, label: 'Durable 2' })
            return { kind: r.kind, balanceAfter: r.value?.balanceAfter, replay: r.replay ?? false }
        })()`)
        await session.kill()
        session = await launch(browser, profile)
        await session.ready(origin)
        const afterSecondRestart = await session.evaluate(READ_STATE)
        report.arms.push({ arm: 'D second commit then second restart', second, state: afterSecondRestart })
        await session.kill()
    } finally {
        if (session) { try { await session.kill() } catch {} }
        if (server?.listening) await new Promise(done => server.close(done))
        let profileRemoved = false
        for (let attempt = 0; attempt < 10; attempt += 1) {
            await rm(work, { recursive: true, force: true }).catch(() => {})
            if (!existsSync(work)) { profileRemoved = true; break }
            await sleep(200)
        }
        report.cleanup = {
            restartsObserved: closed.length,
            serverClosed: !(server?.listening ?? false),
            workRemoved: profileRemoved,
            errors: [],
        }
        if (!report.cleanup.serverClosed) report.cleanup.errors.push('server still listening')
        if (!profileRemoved) report.cleanup.errors.push('work directory not removed')
    }

    const by = p => report.arms.find(a => a.arm.startsWith(p))
    const A = by('A'), B = by('B'), C = by('C'), D = by('D')

    // Assert the WHOLE committed record, not just the wallet. A dropped operation,
    // round, final or meta write must fail this gate, and an orphaned aborted
    // round must too.
    const committedRecord = (state, { opId, roundId, exitKind, sequence, revision, balanceAfter, nextSequence }) => {
        const ops = (state?.operations ?? []).map(r => JSON.parse(r))
        const rounds = (state?.rounds ?? []).map(r => JSON.parse(r))
        const finals = (state?.finals ?? []).map(r => JSON.parse(r))
        const op = ops.find(o => o.id === opId && o.roundId === roundId)
        const round = rounds.find(r => r.id === roundId && r.exitKind === exitKind && r.status === exitKind)
        const final = finals.find(f => f.roundId === roundId && f.exitKind === exitKind)
        return Boolean(op && round && final)
            && op.sequence === sequence
            && op.revision === revision
            && op.result?.kind === 'committed'
            && op.result?.milestone === 'settled-result'
            && op.result?.sequence === sequence
            && op.result?.revision === revision
            && op.result?.value?.balanceAfter === balanceAfter
            && round.revision === revision
            && final.createdAt === sequence
            && final.requestBytes === op.requestBytes
            && final.result?.value?.balanceAfter === balanceAfter
            && (nextSequence === undefined || state?.meta?.nextSequence === nextSequence)
    }
    const sameSnapshot = (left, right) => Boolean(left && right) && JSON.stringify(left) === JSON.stringify(right)
    const nothingForRound = (state, roundId) => {
        const rounds = (state?.rounds ?? []).map(r => JSON.parse(r))
        const finals = (state?.finals ?? []).map(r => JSON.parse(r))
        const ops = (state?.operations ?? []).map(r => JSON.parse(r))
        return !rounds.some(r => r.id === roundId)
            && !finals.some(r => r.roundId === roundId)
            && !ops.some(o => o.roundId === roundId)
    }

    const op1Spec = {
        opId: 'e1\u0000op-durable',
        roundId: 'e1:round:op-durable',
        exitKind: 'cashout',
        sequence: 0,
        revision: 1,
        balanceAfter: 1150,
        nextSequence: 1,
    }
    const op2Spec = {
        opId: 'e1\u0000op-durable-2',
        roundId: 'e1:round:op-durable-2',
        exitKind: 'win',
        sequence: 1,
        revision: 2,
        balanceAfter: 1220,
        nextSequence: 2,
    }

    report.conclusion = {
        committedBeforeRestart: A?.first.committed.kind === 'committed' && A?.first.committed.balanceAfter === 1150,
        abortedBeforeRestart: A?.first.aborted.kind === 'aborted' && A?.first.aborted.code === 'transaction-error',
        committedRecordComplete: A?.state.wallet?.balance === 1150
            && A?.state.wallet?.revision === 1
            && committedRecord(A?.state, op1Spec),
        abortedLeavesNothing: nothingForRound(A?.state, 'e1:round:op-aborted'),
        survivesReload: B?.state.wallet?.balance === 1150
            && committedRecord(B?.state, op1Spec)
            && sameSnapshot(A?.state, B?.state),
        survivesProcessKill: C?.state.wallet?.balance === 1150
            && committedRecord(C?.state, op1Spec)
            && sameSnapshot(A?.state, C?.state),
        noResurrectedAbort: nothingForRound(C?.state, 'e1:round:op-aborted'),
        secondCommitDurable: D?.second.kind === 'committed'
            && D.second.balanceAfter === 1220
            && D?.state.wallet?.balance === 1220
            && D?.state.wallet?.revision === 2
            && D?.state.meta?.nextSequence === 2
            && D?.state.meta?.writerSessionId === 'durability-2'
            && committedRecord(D?.state, op2Spec)
            && committedRecord(D?.state, { ...op1Spec, nextSequence: 2 }),
        // The second commit uses a new id, so this proves the fresh operation was
        // not silently replayed from a stale cache - not that an id replays
        // idempotently across a restart. Replay-across-restart is unproven here.
        freshOperationAfterRestart: D?.second.replay === false,
        interpretation: 'Real Chromium, real IndexedDB, real profile directory. A committed settlement - wallet, operation, round, retained final and metadata sequence - survives ordinary reload and a SIGKILLed browser process relaunched on the same profile; a transaction aborted after every write queued leaves no operation, round or final behind. Owner decision 9 scope: current stable desktop Chromium, reload and browser restart only. NOT power loss, NOT OS crash, NOT cross-device sync, NOT quota exhaustion, NOT a second engine. NOT idempotent replay of a pre-restart operation.',
    }

    const text = JSON.stringify(report, null, 2)
    if (outDir) { await mkdir(outDir, { recursive: true }); await writeFile(join(outDir, 'authority-durability.json'), text) }
    console.log(text)

    const c = report.conclusion
    const cleanupOk = report.cleanup.serverClosed && report.cleanup.workRemoved && report.cleanup.errors.length === 0
    const valid = cleanupOk
        && c.committedBeforeRestart && c.abortedBeforeRestart
        && c.committedRecordComplete && c.abortedLeavesNothing
        && c.survivesReload && c.survivesProcessKill && c.noResurrectedAbort
        && c.secondCommitDurable && c.freshOperationAfterRestart
    console.log(`HARNESS VALID: ${valid} (cleanup=${Boolean(cleanupOk)})`)
    process.exit(valid ? 0 : 1)
}

main().catch(error => { console.error(error.stack || error); process.exit(1) })
