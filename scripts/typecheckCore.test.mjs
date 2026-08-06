// Phase 05 — boundary test for the thin `typecheck:core` lane.
//
// `typecheck:core` is only trustworthy if it is BOTH:
//   1. real   — it actually reports errors in the modules it covers, and
//   2. narrow — it does not silently expand into JSX / DOM / repo-wide checking.
//
// A config that checks nothing would pass an "is it green?" test forever, so
// green alone proves nothing. Each case below forces the checker to prove one
// of those two properties by construction.
//
// Run: npm run typecheck:core-test

import { execFileSync } from 'node:child_process'
import { writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const CONFIG = 'tsconfig.core.json'
let failures = 0
let checks = 0

function check(label, condition, detail) {
    checks++
    if (condition) {
        console.log(`  ok   ${label}`)
    } else {
        failures++
        console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
    }
}

function runChecker() {
    // Run TypeScript's own JS entrypoint with the current Node binary.
    //
    // Two Windows traps avoided here: `npx ... { shell: true }` concatenates
    // rather than escapes args (DEP0190), and Node 24 refuses to spawn the
    // `.cmd` shim without a shell at all (EINVAL). Calling the .js directly
    // needs no shell, so neither applies.
    const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
    try {
        execFileSync(process.execPath, [tsc, '-p', CONFIG], {
            cwd: ROOT, encoding: 'utf8', stdio: 'pipe',
        })
        return { exit: 0, out: '' }
    } catch (err) {
        return { exit: err.status ?? 1, out: `${err.stdout || ''}${err.stderr || ''}` }
    }
}

console.log('typecheck:core boundary tests\n')

// --- 1. Baseline: the lane is green right now. -----------------------------
const baseline = runChecker()
check('baseline typecheck:core passes', baseline.exit === 0, baseline.out.slice(0, 300))

// --- 2. The checker is REAL: a planted type error in a covered file fails. --
// Without this, an empty/misconfigured include list would look identical to a
// clean pass.
const covered = join(ROOT, 'src/components/games/crash/crashMath.js')
const originalCovered = readFileSync(covered, 'utf8')
try {
    writeFileSync(covered, `${originalCovered}\n/** @type {number} */\nexport const __sentinel = 'definitely-not-a-number'\n`)
    const planted = runChecker()
    check('planted type error in a COVERED file fails the lane', planted.exit !== 0)
    check('failure names the covered file', planted.out.includes('crashMath'), planted.out.slice(0, 300))
} finally {
    writeFileSync(covered, originalCovered)
}

// --- 3. The checker is NARROW: an error in an UNCOVERED file is ignored. ----
// This is the anti-cascade guarantee. If this ever fails, checkJs has escaped
// its include list and the phase's core promise is broken.
const uncovered = join(ROOT, 'src/__typecheck_scope_sentinel.js')
try {
    writeFileSync(uncovered, '/** @type {number} */\nexport const nope = "also-not-a-number"\n')
    const outside = runChecker()
    check('type error OUTSIDE the include list does NOT fail the lane', outside.exit === 0, outside.out.slice(0, 300))
} finally {
    rmSync(uncovered, { force: true })
}

// --- 4. JSX stays out of scope. --------------------------------------------
// A .jsx file with a blatant type error must not be picked up, and the DOM lib
// must not be implicitly available.
const jsxSentinel = join(ROOT, 'src/__typecheck_jsx_sentinel.jsx')
try {
    writeFileSync(jsxSentinel, 'export const El = () => <div>{/** @type {number} */ ("nope")}</div>\n')
    const jsx = runChecker()
    check('JSX file is not pulled into the lane', jsx.exit === 0, jsx.out.slice(0, 300))
} finally {
    rmSync(jsxSentinel, { force: true })
}

// --- 5. Restoration actually happened. -------------------------------------
// Cases 2-4 mutate the working tree. If a finally block failed to restore, the
// repo is dirty and every later gate is suspect, so assert it explicitly.
check('covered file restored byte-for-byte', readFileSync(covered, 'utf8') === originalCovered)
const restored = runChecker()
check('lane is green again after all sentinels removed', restored.exit === 0, restored.out.slice(0, 300))

console.log(`\n${checks - failures}/${checks} checks passed`)
if (failures > 0) {
    console.error(`typecheck:core boundary tests FAILED (${failures})`)
    process.exit(1)
}
console.log('typecheck:core is both real (catches covered errors) and narrow (ignores everything else)')
