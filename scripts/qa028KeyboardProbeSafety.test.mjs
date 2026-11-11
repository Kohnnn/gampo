#!/usr/bin/env node
// Runs the real CLI entrypoint in a VM whose network, browser, and filesystem
// boundaries are fakes; this check must never connect to or launch Chromium.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('./qa028KeyboardProbe.mjs', import.meta.url), 'utf8')
assert.match(source, /\brun\(\)\s*$/, 'CLI entrypoint must end in run()')
const entrypoint = source.replace(/\brun\(\)\s*$/, 'await run()')

async function invoke(args, { redirect = false } = {}) {
    const effects = []
    const output = []
    class Exit extends Error {
        constructor(code) { super(`exit ${code}`); this.code = code }
    }
    const context = vm.createContext({
        process: { argv: ['node', 'qa028KeyboardProbe.mjs', ...args], env: {}, exit: code => { throw new Exit(code) } },
        console: { log: (...v) => output.push(v.join(' ')), error: (...v) => output.push(v.join(' ')) },
        setTimeout: fn => { queueMicrotask(fn); return 0 },
        AbortSignal: { timeout: () => ({}) },
        fetch: async (url, options = {}) => {
            effects.push(`fetch ${url}`)
            if (redirect && !String(url).endsWith('/json/version')) {
                if (options.redirect === 'manual') return { ok: false, status: 302 }
                effects.push('fetch https://example.invalid/redirected')
                return { ok: true, redirected: true, url: 'https://example.invalid/redirected' }
            }
            return { ok: true, json: async () => ({ webSocketDebuggerUrl: 'ws://127.0.0.1:9334/devtools/browser/foreign' }) }
        },
        WebSocket: class { constructor(url) { effects.push(`WebSocket ${url}`); throw new Error('foreign debugger') } },
    })
    const modules = {
        'node:child_process': { spawn: (...args) => { effects.push(`spawn ${JSON.stringify(args)}`); return { kill: () => effects.push('kill') } } },
        'node:fs': {
            existsSync: () => true,
            mkdtempSync: () => { effects.push('mkdtemp'); return '/fake/profile' },
            rmSync: () => effects.push('rm'),
        },
        'node:os': { tmpdir: () => '/fake' },
        'node:path': { join: (...parts) => parts.join('/') },
    }
    const script = new vm.SourceTextModule(entrypoint, { context })
    await script.link(specifier => {
        const exports = modules[specifier]
        assert.ok(exports, `unexpected import ${specifier}`)
        return new vm.SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
        }, { context })
    })
    let exitCode
    try { await script.evaluate() } catch (error) {
        if (!(error instanceof Exit)) throw error
        exitCode = error.code
    }
    return { effects, output: output.join('\n'), exitCode }
}

let failures = 0
for (const [name, args, options] of [
    ['default and occupied debugger port', []],
    ['remote base URL', ['--baseUrl=https://example.invalid']],
    ['lookalike loopback URL', ['--baseUrl=http://127.0.0.1.example.invalid']],
    ['loopback URL with remote redirect', ['--baseUrl=http://127.0.0.1:5180'], { redirect: true }],
    // The gate is unconditional: arming must not be a way in. A future
    // re-enablement has to delete this case deliberately, with review.
    ['armed run still refuses', ['--arm', '--baseUrl=https://example.invalid']],
    ['armed loopback run still refuses', ['--arm', '--baseUrl=http://127.0.0.1:5180']],
]) {
    const result = await invoke(args, options)
    try {
        assert.deepEqual(result.effects, [], `${name}: must not fetch, launch, attach, or write a profile`)
        assert.equal(result.exitCode, 2, `${name}: must exit as not verified`)
        assert.match(result.output, /disabled/i, `${name}: must report disabled`)
        assert.match(result.output, /nothing was verified/i, `${name}: must not imply coverage`)
        assert.match(result.output, /persisted/i, `${name}: must report persisted-evidence gap`)
        console.log(`PASS ${name}`)
    } catch (error) {
        failures += 1
        console.error(`FAIL ${name}: ${error.message}`)
    }
}
if (failures) process.exitCode = 1
