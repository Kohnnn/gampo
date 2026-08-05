// Negative-fixture tests for the RNG intent validator (Layer B of the RNG guard).
//
// The point of Phase 04 is that a payout-path `Math.random()` dropped into an
// ESLint-exempt file must FAIL. A validator that only ever passes proves nothing, so
// every rule below gets a fixture that MUST fail, plus one fixture that MUST pass.
//
// NEG-1 unannotated call            -> rule 1 (annotation required)
// NEG-2 reason too short            -> rule 2 (reason required)
// NEG-3 kind outside the closed set -> rule 3 (kind closed set)
// NEG-4 hoisted file-header comment -> rule 4 (narrow scope / orphan)
// NEG-5 count lock broken           -> rule 5 (count lock)
// NEG-6 stale entry, zero calls     -> rule 6 (no stale entries)
// NEG-7 exempt but unreviewed       -> rule 7 (no unreviewed exempt files)
// POS-1 fully annotated file        -> must produce zero failures
//
// Run: node scripts/lintRngIntent.test.mjs

import { strict as assert } from 'node:assert'
import {
    validateFileSource,
    crossCheckEslintExemptions,
    rngIntentAllowlist,
    ALLOWED_KINDS,
    MIN_REASON_LENGTH,
} from './lintRngIntent.mjs'

let passed = 0
function check(label, condition, detail) {
    assert.equal(condition, true, `${label}: ${detail}`)
    console.log(`  ok  ${label}`)
    passed += 1
}

const entry = (over = {}) => ({
    file: 'fixture.js',
    calls: 1,
    review: 'Fixture entry with a sufficiently long review note.',
    ...over,
})

// ---------------------------------------------------------------- NEG-1
// The defect this phase closes: a new, unannotated call in an exempt file.
{
    const source = [
        '// gampo:allow-math-random-visual — decorative sparkle offset for the win banner.',
        'const sparkle = Math.random() * 10',
        '',
        'export const payout = bet * (Math.random() < 0.5 ? 2 : 0)',
    ].join('\n')
    const failures = validateFileSource(entry({ calls: 2 }), source)
    check(
        'NEG-1 unannotated payout call fails',
        failures.some((f) => /:4:\d+: Math\.random has no adjacent/.test(f)),
        `expected an annotation-required failure on line 4, got ${JSON.stringify(failures)}`,
    )
    check(
        'NEG-1 failure names nextRoll as the remedy',
        failures.some((f) => f.includes('nextRoll()')),
        'failure message should point the author at nextRoll()',
    )
}

// ---------------------------------------------------------------- NEG-2
{
    const source = [
        '// gampo:allow-math-random-visual — ok',
        'const jitter = Math.random()',
    ].join('\n')
    const failures = validateFileSource(entry(), source)
    check(
        'NEG-2 too-short reason fails',
        failures.some((f) => f.includes('annotation reason is missing or too short')),
        `expected a reason-length failure, got ${JSON.stringify(failures)}`,
    )
}

// ---------------------------------------------------------------- NEG-3
{
    const source = [
        '// gampo:allow-math-random-payout — this is deliberately not an allowed kind.',
        'const roll = Math.random()',
    ].join('\n')
    const failures = validateFileSource(entry(), source)
    check(
        'NEG-3 disallowed kind fails',
        failures.some((f) => f.includes('is not allowed')),
        `expected a kind failure, got ${JSON.stringify(failures)}`,
    )
    check(
        'NEG-3 failure lists the allowed kinds',
        failures.some((f) => ALLOWED_KINDS.every((k) => f.includes(k))),
        'failure message should enumerate the closed set',
    )
}

// ---------------------------------------------------------------- NEG-4
// The file-level-immunity attack: one annotation at the top, calls far below.
{
    const source = [
        '// gampo:allow-math-random-visual — this file is all cosmetic, honest.',
        '',
        'function a() {',
        '    return Math.random()',
        '}',
    ].join('\n')
    const failures = validateFileSource(entry(), source)
    check(
        'NEG-4 hoisted annotation cannot cover a distant call',
        failures.some((f) => /:4:\d+: Math\.random has no adjacent/.test(f)),
        `expected the distant call to be unannotated, got ${JSON.stringify(failures)}`,
    )
    check(
        'NEG-4 hoisted annotation is reported as an orphan',
        failures.some((f) => f.includes('orphan annotation')),
        `expected an orphan failure, got ${JSON.stringify(failures)}`,
    )
    check(
        'NEG-4 orphan message rejects file-wide hoisting explicitly',
        failures.some((f) => f.includes('cannot be hoisted to cover a file')),
        'orphan message should explain why hoisting is refused',
    )
}

// ---------------------------------------------------------------- NEG-5
{
    const source = [
        '// gampo:allow-math-random-visual — decorative confetti origin, cosmetic only.',
        'const a = Math.random()',
        '// gampo:allow-math-random-visual — decorative confetti spread, cosmetic only.',
        'const b = Math.random()',
    ].join('\n')
    const failures = validateFileSource(entry({ calls: 1 }), source)
    check(
        'NEG-5 count lock breaks when a reviewed file grows a call',
        failures.some((f) => f.includes('count lock broken') && f.includes('declares 1') && f.includes('found 2')),
        `expected a count-lock failure, got ${JSON.stringify(failures)}`,
    )
}

// ---------------------------------------------------------------- NEG-6
{
    const failures = validateFileSource(entry({ calls: 0 }), 'export const id = crypto.randomUUID()\n')
    check(
        'NEG-6 stale entry with zero calls fails',
        failures.some((f) => f.includes('stale allowlist entry')),
        `expected a stale-entry failure, got ${JSON.stringify(failures)}`,
    )
}

// ---------------------------------------------------------------- NEG-7
{
    const forward = crossCheckEslintExemptions(['src/some/exempt/file.js'], [])
    check(
        'NEG-7 ESLint-exempt but unreviewed file fails',
        forward.some((f) => f.includes('no reviewed allowlist entry')),
        `expected a forward-drift failure, got ${JSON.stringify(forward)}`,
    )

    const backward = crossCheckEslintExemptions([], [entry({ file: 'src/reviewed/only.js' })])
    check(
        'NEG-7 reviewed but non-exempt entry fails (reverse drift)',
        backward.some((f) => f.includes('the two lists have drifted')),
        `expected a reverse-drift failure, got ${JSON.stringify(backward)}`,
    )
}

// ---------------------------------------------------------------- NEG-8
// legacyUnannotated is an escape hatch, but it must NOT disable the count lock —
// otherwise the poker carve-out would become the very blanket exemption we removed.
{
    const source = 'const a = Math.random()\nconst b = Math.random()\n'
    const failures = validateFileSource(entry({ calls: 1, legacyUnannotated: true }), source)
    check(
        'NEG-8 legacyUnannotated still obeys the count lock',
        failures.some((f) => f.includes('count lock broken')),
        `expected a count-lock failure even for a legacy file, got ${JSON.stringify(failures)}`,
    )
}

// ---------------------------------------------------------------- POS-1
{
    const source = [
        'export function confetti() {',
        '    // gampo:allow-math-random-visual — confetti burst angle, purely decorative.',
        '    const angle = Math.random() * Math.PI',
        '    const speed = Math.random() * 4 // gampo:allow-math-random-visual — confetti speed, decorative only.',
        '    return { angle, speed }',
        '}',
    ].join('\n')
    const failures = validateFileSource(entry({ calls: 2 }), source)
    check(
        'POS-1 correctly annotated file passes (above-line and trailing forms)',
        failures.length === 0,
        `expected zero failures, got ${JSON.stringify(failures)}`,
    )
}

// ---------------------------------------------------------------- invariants
{
    check(
        'MIN_REASON_LENGTH is a meaningful threshold',
        MIN_REASON_LENGTH >= 10,
        `expected >= 10, got ${MIN_REASON_LENGTH}`,
    )
    check(
        'no allowlist entry lacks a count lock',
        rngIntentAllowlist.every((e) => typeof e.calls === 'number'),
        'every reviewed entry must declare a numeric `calls` lock',
    )
    check(
        'legacy escape hatch stays rare',
        rngIntentAllowlist.filter((e) => e.legacyUnannotated).length <= 1,
        'more than one legacy-unannotated file means the guard is eroding',
    )
}

console.log(`rng-intent-test: ${passed} assertion(s) passed`)
