// Executes the actual probe source with only in-memory process, filesystem,
// HTTP and CDP doubles: no browser, profile, server or network is started.
import assert from 'node:assert/strict'
import { EventEmitter, once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import vm from 'node:vm'

const directory = new URL('.', import.meta.url)
const names = {
    d1: 'qa23D1NativeProbe.mjs',
    d2: 'qa23D2PairedControl.mjs',
    idb: 'qa23IdbAtomicityProbe.mjs',
}
const selected = process.argv.slice(2)
const cases = selected.length ? selected : ['counts', 'd1', 'd2', 'idb']

async function simulate(name, { repeats = '1', failCleanup = [], failProbe = false, survivors = false } = {}) {
    let source = await readFile(new URL(names[name], directory), 'utf8')
    source = source.replace(/^import .* from ['"]node:[^'"\n]+['"]\s*$/gm, '')
        .replace('const report = {', 'const report = globalThis.__probeReport = {')
        .replace('main().catch(error => { console.error(error.stack || error); process.exit(1) })', 'await main()')
    const calls = { spawned: 0, removed: false, logs: [], groups: [], detached: [] }
    let browser, server, balanceReads = 0
    class Child extends EventEmitter {
        constructor(vite) {
            super()
            this.pid = vite ? 2222 : 1111
            this.exitCode = null
            this.signalCode = null
            this.stdout = { on: (event, callback) => { if (vite && event === 'data') callback('ready in 1ms on 5199') } }
            this.stderr = { on() {} }
        }
        kill(signal) {
            if (failCleanup.includes(this.pid === 2222 ? 'vite' : 'browser')) return false
            queueMicrotask(() => { this.signalCode = signal; this.emit('exit', null, signal) })
            return true
        }
    }
    class Server extends EventEmitter {
        constructor() { super(); this.listening = false }
        listen(port, host, callback) {
            this.listening = true
            queueMicrotask(() => { this.emit('listening'); callback?.() })
        }
        address() { return { port: 12345 } }
        close(callback) {
            queueMicrotask(() => {
                if (!failCleanup.includes('server')) this.listening = false
                callback?.(failCleanup.includes('server') ? new Error('SIMULATED_SERVER_CLOSE_FAILURE') : undefined)
            })
        }
        closeAllConnections() {}
    }
    class Socket extends EventEmitter {
        constructor() { super(); queueMicrotask(() => this.emit('open')) }
        addEventListener(type, callback) { this.on(type, callback) }
        send(payload) {
            const { id, method, params } = JSON.parse(payload)
            let result = {}
            let error
            if (failProbe && method === 'Target.getTargets') error = { message: 'ORIGINAL_PROBE_FAILURE' }
            else if (method === 'Target.getTargets') result = { targetInfos: [{ type: 'page', targetId: 'page' }] }
            else if (method === 'Target.attachToTarget') result = { sessionId: 'session' }
            else if (method === 'Runtime.evaluate') {
                const expression = params.expression
                let value = null
                if (expression === 'location.protocol') value = 'http:'
                else if (expression === 'location.origin') value = 'http://127.0.0.1:12345'
                else if (expression.includes('typeof window.__probe')) value = true
                else if (expression === 'navigator.userAgent') value = 'in-memory control'
                else if (expression.includes('window.__probe.settleThenAbort')) value = { kind: 'aborted' }
                else if (expression.includes('window.__probe.settle(')) value = { kind: 'committed' }
                else if (expression.includes('window.__probe.concurrentPair')) value = [{ kind: 'committed' }, { kind: 'rejected' }]
                else if (expression.includes('window.__probe.readBalance')) value = { balance: [400, 800, 400][balanceReads++] }
                else if (expression.includes('localStorage.setItem(\'gampo_credits\'')) value = { accepted: 1200, balance: 400 }
                result = { result: { value } }
            }
            queueMicrotask(() => this.emit('message', { data: JSON.stringify({ id, result, ...(error ? { error } : {}) }) }))
        }
        close() {}
    }
    let exitStatus
    const fakeProcess = {
        env: { GAMPO_D2_REPEATS: repeats, CHROME_BIN: '/virtual/chromium' },
        argv: ['node', names[name]], cwd: () => '/virtual',
        kill(pid, signal) {
            if (signal === 0) {
                const child = pid === -2222 ? vite : browser
                if (child?.signalCode && !(survivors && child === browser)) throw Object.assign(new Error('gone'), { code: 'ESRCH' })
                return true
            }
            calls.groups.push(pid)
            if (failCleanup.includes(pid === -2222 ? 'vite' : 'browser')) throw Object.assign(new Error('SIMULATED_GROUP_KILL_FAILURE'), { code: 'EPERM' })
            const child = pid === -2222 ? vite : browser
            child?.kill(signal)
            return true
        },
        exit(status) { exitStatus = status; throw new Error(`SIMULATED_EXIT_${status}`) },
    }
    let vite
    const context = {
        assert, once, join,
        process: fakeProcess,
        console: { log: (...args) => calls.logs.push(args.join(' ')), error: (...args) => calls.logs.push(args.join(' ')) },
        spawn: (_command, _args, _options) => {
            calls.spawned += 1
            calls.detached.push(Boolean(_options?.detached))
            const child = new Child(_command === 'npx')
            if (_command === 'npx') vite = child
            else browser = child
            return child
        },
        createServer: () => { server = new Server(); return server },
        mkdtemp: async () => '/virtual/probe-temp', mkdir: async () => {},
        readFile: async () => '12345\n/devtools/browser/fake',
        writeFile: async () => {},
        rm: async () => { if (failCleanup.includes('remove')) throw new Error('SIMULATED_REMOVE_FAILURE'); calls.removed = true },
        lstat: async () => { if (calls.removed) throw Object.assign(new Error('gone'), { code: 'ENOENT' }); return {} },
        existsSync: path => path === '/virtual/chromium' || !calls.removed,
        readdirSync: () => [], homedir: () => '/virtual', tmpdir: () => '/virtual',
        fetch: async url => {
            if (failProbe && String(url).includes('/json/version')) throw new Error('ORIGINAL_PROBE_FAILURE')
            return { json: async () => String(url).includes('/json/version')
                ? { Browser: 'fake', webSocketDebuggerUrl: 'ws://fake' } : { id: 'page' } }
        },
        WebSocket: Socket,
        setTimeout: (callback, ms) => setTimeout(callback, ms <= 50 ? 0 : 10),
        clearTimeout, queueMicrotask,
    }
    let error
    try { await vm.runInNewContext(`(async () => {\n${source}\n})()`, context) } catch (caught) { error = caught }
    return { report: context.__probeReport, error, exitStatus, calls }
}

let failures = 0
async function check(label, run) {
    try { await run(); console.log(`PASS ${label}`) }
    catch (error) { failures += 1; console.error(`FAIL ${label}: ${error.message}`) }
}
for (const selectedCase of cases) {
    if (selectedCase === 'counts') {
        await check('D2 rejects invalid repeat counts before starting resources', async () => {
            for (const repeats of ['0', '-1', 'NaN', 'Infinity', '1.5', '']) {
                const result = await simulate('d2', { repeats })
                assert(result.error || (result.exitStatus !== undefined && result.exitStatus !== 0), `${JSON.stringify(repeats)} was accepted`)
                assert.notEqual(result.exitStatus, 0, `${JSON.stringify(repeats)} reported success`)
                assert.equal(result.calls.spawned, 0, `${JSON.stringify(repeats)} started a browser`)
            }
        })
    } else if (selectedCase in names) {
        for (const failed of selectedCase === 'd1' ? ['browser', 'vite', 'remove', 'descendant'] : ['browser', 'server', 'remove', 'descendant']) {
            await check(`${selectedCase} reports ${failed} cleanup failure honestly`, async () => {
                const result = await simulate(selectedCase, { failCleanup: failed === 'descendant' ? [] : [failed], survivors: failed === 'descendant', failProbe: true })
                const cleanup = result.report?.cleanup
                assert(cleanup, 'missing cleanup report')
                if (failed === 'descendant') {
                    assert.notEqual(cleanup.browser, true, 'claimed browser closed while its group survives')
                    assert.notEqual(cleanup[selectedCase === 'idb' ? 'profile' : 'temp'], selectedCase === 'idb' ? 'removed' : true, 'deleted profile while browser descendants survive')
                } else if (failed === 'remove') {
                    if (selectedCase === 'idb') assert.notEqual(cleanup.profile, 'removed', 'claimed profile removal despite error')
                    else assert.notEqual(cleanup.temp, true, 'claimed temp removal despite error')
                } else assert.notEqual(cleanup[failed], true, `claimed ${failed} closed without observation`)
                assert.match(String(result.error?.stack || result.error), /ORIGINAL_PROBE_FAILURE/, 'original failure was lost')
                assert.match(result.calls.logs.join('\n'), /cleanup/i, 'cleanup failure was not reported')
            })
        }
        await check(`${selectedCase} reports confirmed cleanup on original failure`, async () => {
            const result = await simulate(selectedCase, { failProbe: true })
            const cleanup = result.report?.cleanup
            assert(cleanup, 'missing cleanup report')
            assert.equal(cleanup.browser, true, 'browser exit was not confirmed')
            assert(result.calls.detached.every(Boolean), 'a signalled process was not spawned in its own group')
            assert(result.calls.groups.includes(-1111), 'owned browser group was not signalled')
            if (selectedCase === 'd1') assert(result.calls.groups.includes(-2222), 'owned vite group was not signalled')
            assert.equal(cleanup[selectedCase === 'd1' ? 'vite' : 'server'], true, 'other resource was not confirmed closed')
            assert.equal(cleanup[selectedCase === 'idb' ? 'profile' : 'temp'], selectedCase === 'idb' ? 'removed' : true)
            assert.match(String(result.error?.stack || result.error), /ORIGINAL_PROBE_FAILURE/)
        })
    } else throw new Error(`Unknown case: ${selectedCase}`)
}
if (failures) process.exitCode = 1
