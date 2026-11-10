#!/usr/bin/env node
// Exercise the unchanged module source with only in-VM fakes, never real probes.
// Run: node --experimental-vm-modules scripts/qa23UnsafeProbeFailClosed.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const probes = [
    'qa23D1NativeProbe.mjs',
    'qa23D2PairedControl.mjs',
    'qa23IdbAtomicityProbe.mjs',
]

async function invoke(name, mode, configured) {
    const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
    const argv = mode === 'cli'
        ? ['node', `/sandbox/${name}`, ...(configured ? ['--out=/fake/evidence', '--baseUrl=https://example.invalid'] : [])]
        : ['node', '/sandbox/importer.mjs']
    const env = configured ? {
        CHROME_BIN: '/fake/chrome', GAMPO_CHROMIUM: '/fake/chrome',
        PLAYWRIGHT_BROWSERS_PATH: '/fake/browsers', GAMPO_D2_OUT: '/fake/evidence',
    } : {}
    const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } })
    // Create functions and data in the VM itself: the evaluated module receives
    // no host functions, builtins, process object, timers, or network handles.
    const state = vm.runInContext(`(() => {
        const state = { effects: [], output: [], exitCode: undefined, stop: {} }
        const deny = name => (...args) => { state.effects.push(name); throw state.stop }
        const capture = (...args) => state.output.push(args.map(String).join(' '))
        const fs = Object.fromEntries([
            'mkdtemp', 'mkdir', 'readFile', 'rm', 'writeFile', 'existsSync', 'readdirSync',
        ].map(name => [name, deny('fs.' + name)]))
        const process = {
            argv: ${JSON.stringify(argv)}, env: ${JSON.stringify(env)},
            cwd: () => '/sandbox', kill: deny('process.kill'),
            exit: code => { state.exitCode = code; throw state.stop },
            get exitCode() { return state.exitCode },
            set exitCode(code) { state.exitCode = code },
            stdout: { write: capture }, stderr: { write: capture },
        }
        Object.assign(globalThis, {
            process, console: { log: capture, error: capture, warn: capture, info: capture },
            fetch: deny('fetch'),
            WebSocket: class { constructor() { deny('WebSocket')() } },
            setTimeout: deny('setTimeout'), setInterval: deny('setInterval'),
        })
        state.modules = {
            'node:child_process': { spawn: deny('child_process.spawn') },
            'node:events': { once: deny('events.once') },
            'node:fs/promises': fs,
            'node:fs': fs,
            'node:os': { tmpdir: deny('os.tmpdir'), homedir: deny('os.homedir') },
            'node:path': { join: (...parts) => parts.join('/') },
            'node:http': { createServer: deny('http.createServer') },
            'node:assert/strict': { default: deny('assert') },
        }
        return state
    })()`, context)

    let unexpected
    try {
        const module = new vm.SourceTextModule(source, {
            context, identifier: `file:///sandbox/${name}`,
            initializeImportMeta(meta) { meta.url = `file:///sandbox/${name}` },
            importModuleDynamically(specifier) {
                state.effects.push(`dynamic import ${specifier}`)
                throw new Error(`dynamic import denied: ${specifier}`)
            },
        })
        await module.link(specifier => {
            const exports = state.modules[specifier]
            if (!exports) throw new Error(`import denied: ${specifier}`)
            return new vm.SyntheticModule(Object.keys(exports), function () {
                for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
            }, { context })
        })
        await module.evaluate({ timeout: 1000 })
        // Drain continuations already queued by the module before observing it.
        await Promise.resolve()
    } catch (error) {
        if (error !== state.stop) unexpected = error
    }
    return { effects: Array.from(state.effects), output: Array.from(state.output).join('\n'), exitCode: state.exitCode, unexpected }
}

let failures = 0
for (const name of probes) {
    for (const [mode, configured] of [['cli', false], ['cli', true], ['import', true]]) {
        const label = `${name} ${mode}${configured ? ' configured' : ' default'}`
        const result = await invoke(name, mode, configured)
        try {
            assert.deepEqual(result.effects, [], 'must not acquire or signal anything')
            assert.ifError(result.unexpected)
            assert.doesNotMatch(result.output, /\b(?:pass(?:ed)?|success(?:ful(?:ly)?)?)\b/i, 'must not claim success')
            assert.equal(result.exitCode, 2, 'must exit with unavailable status')
            assert.match(result.output, /unavailable/i, 'must say unavailable')
            assert.match(result.output, /(?:not verified|nothing (?:was|is) verified)/i, 'must say not verified')
            console.log(`PASS ${label}`)
        } catch (error) {
            failures += 1
            console.error(`FAIL ${label}: ${error.message}`)
        }
    }
}
if (failures) process.exitCode = 1
