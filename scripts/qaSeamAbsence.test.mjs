// Self-test for the QA-seam production-absence guard (scripts/qaSeamAbsence.mjs).
//
// A guard is only worth its runtime if it fails on the thing it claims to catch.
// These fixtures prove three properties:
//
// POS-1 clean output                  -> exit 0
// NEG-1 realistic minified leak       -> exit 1, names file + token
// NEG-2 each forbidden token alone    -> exit 1 (no token is dead weight)
// NEG-3 absent target                 -> exit 2, NOT a silent pass
// NEG-4 empty target                  -> exit 2, NOT a silent pass
//
// NEG-3/NEG-4 are the subtle ones. A guard that reports success when it had
// nothing to inspect claims an absence it never verified — worse than no guard.
//
// Run: node scripts/qaSeamAbsence.test.mjs

import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const GUARD = join(ROOT, 'scripts', 'qaSeamAbsence.mjs')

let passed = 0
const tempDirs = []

function check(label, condition, detail) {
    assert.ok(condition, `${label}${detail ? ` — ${detail}` : ''}`)
    passed += 1
}

function makeFakeDist(files) {
    const dir = mkdtempSync(join(tmpdir(), 'gampo-qa-seam-'))
    tempDirs.push(dir)
    const assets = join(dir, 'assets')
    mkdirSync(assets, { recursive: true })
    for (const [name, contents] of Object.entries(files)) {
        writeFileSync(join(assets, name), contents, 'utf8')
    }
    return dir
}

// execFileSync on Windows + Node 24 throws EINVAL for .cmd shims and trips
// DEP0190 with shell:true. Invoking process.execPath with the script path
// avoids both.
function runGuard(target) {
    try {
        const stdout = execFileSync(process.execPath, [GUARD, target], {
            cwd: ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        return { status: 0, output: stdout }
    } catch (error) {
        return { status: error.status ?? 1, output: `${error.stdout || ''}${error.stderr || ''}` }
    }
}

try {
    // POS-1
    {
        const dist = makeFakeDist({
            'index-abc123.js': 'const a=1;export{a};',
            'SlotsGame-abc123.js': 'function performSpin(){return 1}',
        })
        const { status, output } = runGuard(dist)
        check('POS-1 clean output exits 0', status === 0, `got exit ${status}: ${output.trim()}`)
        check('POS-1 reports zero violations', output.includes('0 violations'), output.trim())
    }

    // NEG-1 — shape copied from the leak that really shipped.
    {
        const dist = makeFakeDist({
            'SlotsGame-abc123.js': 'const r={forceBonusState:a};return window.__gampoSlotQa={...window.__gampoSlotQa||{},[u.id]:r,forceBonusState:a}',
        })
        const { status, output } = runGuard(dist)
        check('NEG-1 real leak shape exits 1', status === 1, `got exit ${status}`)
        check('NEG-1 names the token', output.includes('__gampoSlotQa'), output.trim())
        check('NEG-1 names the file', output.includes('SlotsGame-abc123.js'), output.trim())
    }

    // NEG-2 — every token in the list must be individually load-bearing.
    for (const [token, snippet] of [
        ['__gampoSlotQa', 'window.__gampoSlotQa={}'],
        ['forceBonusState', 'const x={forceBonusState:f}'],
        ['gampo:slot-qa-ready', 'new CustomEvent("gampo:slot-qa-ready")'],
        ['enqueueOutcome', 'const x={enqueueOutcome:f}'],
        ['pendingOutcomes', 'const x={pendingOutcomes:f}'],
        ['clearOutcomes', 'const x={clearOutcomes:f}'],
        ['outcome must be a plain object', 'return ce("outcome must be a plain object")'],
        ['session must be a plain object or null', 'return ce("session must be a plain object or null")'],
        ['enqueueOutcome rejected', 'throw new Error(`enqueueOutcome rejected: ${r}`)'],
        ['setFreeSpinSession rejected', 'throw new Error(`setFreeSpinSession rejected: ${r}`)'],
    ]) {
        const dist = makeFakeDist({ 'chunk-1.js': snippet })
        const { status, output } = runGuard(dist)
        check(`NEG-2 detects ${token}`, status === 1 && output.includes(token), `got exit ${status}`)
    }

    // NEG-2b — regression for a real miss.
    //
    // The first version of the token list contained bare function names
    // (createOutcomeQueue, validateQueuedOutcome). Against a genuinely leaking
    // production bundle esbuild had renamed them to `Ql`/`Yl`, so the guard
    // reported 0 violations while the entire validator sat in the chunk. This
    // fixture is that exact minified shape: every identifier mangled, only
    // string literals intact. It must still be caught.
    {
        const minified = 'function Ia(t){return typeof t=="object"}function Vl(t){return typeof t=="number"&&Number.isFinite(t)}const ql=["cells","featureEvents"];function Yl(t){if(!Ia(t))return ce("outcome must be a plain object");return ok(t)}'
        const dist = makeFakeDist({ 'SlotsGame-CtjihWBC.js': minified })
        const { status, output } = runGuard(dist)
        check('NEG-2b catches a fully minified leak via literals', status === 1, `got exit ${status}`)
        check('NEG-2b names the literal', output.includes('outcome must be a plain object'), output.trim())
    }

    // NEG-3
    {
        const { status, output } = runGuard(join(tmpdir(), 'gampo-definitely-absent-dist'))
        check('NEG-3 absent target exits 2', status === 2, `got exit ${status}`)
        check('NEG-3 says nothing was verified', output.includes('nothing was verified'), output.trim())
    }

    // NEG-4
    {
        const dist = makeFakeDist({})
        const { status, output } = runGuard(dist)
        check('NEG-4 empty target exits 2', status === 2, `got exit ${status}`)
        check('NEG-4 says nothing was verified', output.includes('nothing was verified'), output.trim())
    }
} finally {
    for (const dir of tempDirs) {
        rmSync(dir, { recursive: true, force: true })
    }
}

console.log(`qa-seam-absence-test: ${passed} assertion(s) passed`)
