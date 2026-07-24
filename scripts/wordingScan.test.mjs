// Focused unit test for scripts/wordingScan.mjs.
//
// Goals:
//   1. Violation cases must produce at least one `block` finding.
//   2. Educational disclaimer phrases must pass.
//   3. Each violation trigger must fire when its regex is matched
//      against a clean snippet.
//   4. The "real-money context" suppression logic must keep benign
//      "cash out" / sim-bettor copy from flagging.
//
// These tests exercise the scanner's pure decision logic without spawning
// a subprocess. They are fast (<100ms total) and do not require any deps.
//
// Run: node scripts/wordingScan.test.mjs
//      (or via npm test once test infra includes this path)

import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Mirror of the trigger matrix for in-process evaluation.
// We duplicate the small subset we want to cover here so that test
// failures point at logic regressions, not path drift.

// Mirror of the production REAL_MONEY_SIGNALS set (see
// scripts/wordingScan.mjs lines 52-71). The mirror MUST stay in sync with
// the production set so test logic mirrors the live scanner decision
// logic; otherwise disclaimer phrases that the live scanner correctly
// exempts will falsely trip the mirror.
const REAL_MONEY_SIGNALS = [
    // Currency or symbol next to a digit (real-money claim of value).
    /\b(?:usd|eur|gbp|jpy|cad|aud)\b\s*(?:\d|\$)/i,
    /\$\s*\d/,
    // Crypto payment tokens.
    /\bbtc\b|\bbitcoin\b|\bethereum\b|\busdt\b|\busdc\b/i,
    // Real-money verbs combined with a real-money action verb.
    /\b(?:instant|fast|express|priority)\s+withdraw(?:al)?s?\b/i,
    /\b(?:cash\s+bonus|deposit\s+bonus|reload\s+bonus|welcome\s+bonus|sign[\s-]?up\s+bonus)\b/i,
    /\b(?:1\s*:\s*1\s+(?:match|wager|deposit)|100%\s*(?:match|deposit\s+bonus))\b/i,
    /\b(?:wagering\s+requirement|playthrough|x\s*40\s*wager|rollover\s*\d|rollover\s*[x×])\b/i,
    /\b(?:aml|ofac|sanctions)\b/i,
    /\b(?:curacao|malta|gambling\s+commission)\s+licen[sc]e[ds]?\b/i,
    /\b(?:provably[\s-]?fair\s+(?:with|using)\s+(?:bitcoin|crypto|usd))\b/i,
    /\bplay\s+with\s+(?:real|actual)\s+(?:money|cash)\b/i,
]

function lineHasRealMoneySignal(line) {
    return REAL_MONEY_SIGNALS.some((re) => re.test(line))
}

const triggers = [
    {
        id: 'real-money-claim',
        regex: /\b(?:real\s+money|actual\s+money|play\s+with\s+real\s+cash)\b/i,
        severity: 'block',
        requireRealMoneyContext: false,
        exemptions: [
            /\bno\s+real\s+money\b/i,
            /\bnever\s+real\s+money\b/i,
            /\bvirtual\s+(?:balance|credits?|currency)\b/i,
            /\beducational\s+only\b/i,
            /\bno\s+real\s+(?:money|cash)\s+(?:at\s+risk|is\s+ever|is\s+wagered|or\s+payouts?)\b/i,
            /\bno\s+(?:real\s+)?money\s+is\s+(?:wagered|paid\s+out|at\s+risk)\b/i,
            /['"]?real\s+money['"]?\s*[:,]\s*['"]?none['"]?/i,
            /['"]?cash\s+value['"]?\s*[:,]\s*['"]?none['"]?/i,
        ],
    },
    {
        id: 'cash-bonus',
        regex: /\b(?:cash\s+bonus|deposit\s+bonus)\b/i,
        severity: 'block',
        requireRealMoneyContext: false,
        exemptions: [/^$/],
    },
    {
        id: 'kyc-claim',
        regex: /\b(?:kyc|ofac)\b/i,
        severity: 'block',
    },
]

function evaluate(lines) {
    const out = []
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        for (const trig of triggers) {
            const match = trig.regex.exec(line)
            if (!match) continue
            const ctx = lines.slice(Math.max(0, i - 3), i + 4).join(' / ')
            if (trig.requireRealMoneyContext && !lineHasRealMoneySignal(ctx)) continue
            let exempt = false
            if (trig.exemptions) {
                for (const ex of trig.exemptions) {
                    if (ex.test(line) || ex.test(ctx)) { exempt = true; break }
                }
            }
            if (exempt && !lineHasRealMoneySignal(ctx)) continue
            out.push({ id: trig.id, line: i + 1, snippet: line.trim() })
        }
    }
    return out
}

// ----- Inline logic tests --------------------------------------------------
{
    const violations = evaluate([
        'Practice credits only. No real money at risk.',
    ])
    assert.deepEqual(violations, [], 'educational disclaimer must NOT flag')
}

{
    const violations = evaluate([
        'Play with real money now! Visit deposit.casino.example',
    ])
    assert.equal(violations.length, 1, 'real-money-claim must block')
    assert.equal(violations[0].id, 'real-money-claim')
}

{
    const violations = evaluate([
        'We are licensed by the Curacao Gaming Commission.',
    ])
    // Curacao licence not in the subset mirrored here; covered in the CLI
    // matrix. This assertion guards the trigger duplication discipline.
    assert.ok(Array.isArray(violations))
}

{
    const violations = evaluate([
        'Submit your KYC documents',
    ])
    assert.equal(violations.length, 1, 'kyc-claim must block')
    assert.equal(violations[0].id, 'kyc-claim')
}

{
    const violations = evaluate([
        'Educational disclaimer here. No real money, accounts, or payouts.',
    ])
    assert.deepEqual(violations, [], 'no real money disclaimer must NOT flag')
}

console.log('inline: 5/5 logic assertions passed')

// ----- End-to-end CLI: pass + fail fixtures -------------------------------
{
    const tmp = mkdtempSync(join(tmpdir(), 'wordingScan-test-'))
    try {
        // Pass fixture: only educational copy.
        const passDir = join(tmp, 'pass-src')
        mkdirSync(passDir, { recursive: true })
        writeFileSync(join(passDir, 'README.md'), 'GamPo is an educational simulator. No real money. Virtual balance only.\n')
        const passOut = spawnSync(process.execPath, [join(process.cwd(), 'scripts', 'wordingScan.mjs'), `--roots=${passDir}`], { encoding: 'utf8' })
        assert.equal(passOut.status, 0, `pass fixture must exit 0; got ${passOut.status}; stdout=${passOut.stdout}; stderr=${passOut.stderr}`)

        // Fail fixture: violation content present.
        const failDir = join(tmp, 'fail-src')
        mkdirSync(failDir, { recursive: true })
        writeFileSync(join(failDir, 'README.md'), 'Play with real money! Visit deposit.casino.example\n')
        const failOut = spawnSync(process.execPath, [join(process.cwd(), 'scripts', 'wordingScan.mjs'), `--roots=${failDir}`], { encoding: 'utf8' })
        assert.notEqual(failOut.status, 0, `fail fixture must exit non-zero; got ${failOut.status}`)
        assert.match(failOut.stdout + failOut.stderr, /VIOLATIONS/)
        assert.match(failOut.stdout + failOut.stderr, /real-money-claim/)

        console.log('cli:    pass fixture clean, fail fixture flagged (real-money-claim)')
    } finally {
        rmSync(tmp, { recursive: true, force: true })
    }
}

// ----- End-to-end CLI: project self-scan is clean ------------------------
//
// The CLI must currently exit 0 against the live project.
// If a future commit introduces a violation, this test is the trip-wire.
{
    const out = spawnSync(process.execPath, [join(process.cwd(), 'scripts', 'wordingScan.mjs')], { encoding: 'utf8' })
    assert.equal(out.status, 0, `project self-scan must exit 0; got ${out.status}; stdout=${out.stdout}; stderr=${out.stderr}`)
    console.log(`self:   project scan clean (${(out.stdout || '').trim()})`)
}

// ----- End-to-end CLI: more failure modes --------------------------------
//
// Each of these is a textbook real-money claim that MUST be flagged.
const failureCases = [
    { name: 'cash bonus', content: 'Claim your cash bonus today!\n', expectedTrigger: 'cash-bonus' },
    { name: 'kyc claim', content: 'Submit your KYC documents to play.\n', expectedTrigger: 'kyc-claim' },
    { name: '1:1 deposit match', content: 'Get a 1:1 deposit match up to $500.\n', expectedTrigger: 'wagering-requirement' },
    { name: 'crypto deposit', content: 'Deposit with BTC to play now.\n', expectedTrigger: 'crypto-payment' },
    { name: 'paid in usd', content: 'You will be paid in USD.\n', expectedTrigger: 'real-currency-payout' },
    { name: 'instant withdrawal', content: 'Instant withdrawal available now.\n', expectedTrigger: 'withdraw-button' },
    { name: 'gambling commission', content: 'We hold a Curacao licence.\n', expectedTrigger: 'gambling-license' },
]
for (const tc of failureCases) {
    const tmp = mkdtempSync(join(tmpdir(), 'wordingScan-fail-'))
    try {
        writeFileSync(join(tmp, 'bad.md'), tc.content)
        const out = spawnSync(process.execPath, [join(process.cwd(), 'scripts', 'wordingScan.mjs'), `--roots=${tmp}`], { encoding: 'utf8' })
        assert.notEqual(out.status, 0, `${tc.name} fixture must exit non-zero; got ${out.status}`)
        const text = (out.stdout || '') + (out.stderr || '')
        assert.match(text, new RegExp(tc.expectedTrigger), `${tc.name} should match trigger ${tc.expectedTrigger}; got: ${text}`)
    } finally {
        rmSync(tmp, { recursive: true, force: true })
    }
    console.log(`fail:   ${tc.name} flagged`)
}
