// Real-money wording scanner for GamPo — Phase 3 Integrity and Language
// Guardrails. Deterministic, dependency-free, runs in <100ms.
//
// Purpose: structurally prevent the educational simulator from sliding
// into "real-money deposit", "withdraw to USD", "claim your cash bonus",
// "play with BTC", "1:1 wagering", etc. The marketing surfaces and UI
// copy must remain in the "practice credits / virtual balance / no real
// money at risk" register established by the WelcomeModal,
// FooterDisclaimer, the GameShell, the Header, and the FairnessDrawer.
//
// This is a STRUCTURAL guard, not a stylistic one. The lexicon below is
// the minimum closure needed for the educational guarantee; new entries
// must be added with intention and a justifying comment.
//
// Out of scope (intentional):
//   - node_modules, dist, output, .git, scripts/wordingScan.fixtures/**
//     (the fixtures deliberately contain violation samples).
//   - jest/vitest fixtures living in __fixtures__/ directories.
//
// CLI:
//   node scripts/wordingScan.mjs [--roots=src] [--allowlist=path1,path2]

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, isAbsolute, join, relative, sep } from 'node:path'

// ---------------------------------------------------------------------------
// Trigger matrix + real-money signal heuristics.
//
// Behaviour notes:
//   - The "REAL_MONEY_SIGNALS" set is the narrow set of phrases whose
//     presence alongside another trigger fires an additional context check
//     (when `requireRealMoneyContext: true`). Plain disclaimer words
//     ("real money", "deposit", "withdrawal") are NOT in the signal set;
//     they appear throughout the project's educational copy and are
//     matched against the trigger regex directly (with explicit exemption
//     patterns). The signal set is reserved for verbs and tokens that
//     cannot legitimately appear in an educational disclaimer
//     (e.g. "1:1 match", "playthrough x40", "instant withdrawal").
//
//   - `requireRealMoneyContext: true` triggers fire only when a signal
//     appears within a window of +/- 3 lines. Educational copy that
//     mentions both tokens in different lines does not produce a
//     violation.
//
//   - Per-trigger `exemptions` are regex patterns matched against the
//     containing line OR the +/- 3 line window. An exemption holds
//     unconditionally if no contradicting real-money signal is in the
//     window — this lets one line of educational copy carry "real money"
//     in its disclaimer without tripping the rule.
// ---------------------------------------------------------------------------

const REAL_MONEY_SIGNALS = [
    // Currency or symbol next to a digit (real-money claim of value).
    /\b(?:usd|eur|gbp|jpy|cad|aud)\b\s*(?:\d|\$)/i,
    /\$\s*\d/,
    // Crypto payment tokens (project has only one mention of "crypto" in
    // seeder; treated as a strict signal so it cannot pass through
    // disguise).
    /\bbtc\b|\bbitcoin\b|\bethereum\b|\busdt\b|\busdc\b/i,
    // Real-money verbs combined with a real-money action verb. These
    // cannot legitimately appear in an educational disclaimer.
    /\b(?:instant|fast|express|priority)\s+withdraw(?:al)?s?\b/i,
    /\b(?:cash\s+bonus|deposit\s+bonus|reload\s+bonus|welcome\s+bonus|sign[\s-]?up\s+bonus)\b/i,
    /\b(?:1\s*:\s*1\s+(?:match|wager|deposit)|100%\s*(?:match|deposit\s+bonus))\b/i,
    /\b(?:wagering\s+requirement|playthrough|x\s*40\s*wager|rollover\s*\d|rollover\s*[x×])\b/i,
    /\b(?:aml|ofac|sanctions)\b/i,
    /\b(?:curacao|malta|gambling\s+commission)\s+licen[sc]e[ds]?\b/i,
    /\b(?:provably[\s-]?fair\s+(?:with|using)\s+(?:bitcoin|crypto|usd))\b/i,
    // Real-money verbs in conjunction with action verbs.
    /\bplay\s+with\s+(?:real|actual)\s+(?:money|cash)\b/i,
]

const triggers = [
    {
        id: 'real-money-claim',
        regex: /\b(?:real\s+money|actual\s+money|play\s+with\s+(?:real|actual)\s+(?:money|cash))\b/i,
        severity: 'block',
        requireRealMoneyContext: false,
        exemptions: [
            /\bno\s+real\s+money\b/i,
            /\bnever\s+real\s+money\b/i,
            /\bvirtual\s+(?:balance|credits?|currency)\b/i,
            /\beducational\s+only\b/i,
            /\bno\s+real\s+(?:money|cash)\s+(?:at\s+risk|is\s+ever|is\s+wagered|or\s+payouts?)\b/i,
            /\bno\s+(?:real\s+)?money\s+is\s+(?:wagered|paid\s+out|at\s+risk)\b/i,
            // Educational claim that real-money IS None (e.g. lobby stat map).
            /['"]?real\s+money['"]?\s*[:,]\s*['"]?none['"]?/i,
            /['"]?cash\s+value['"]?\s*[:,]\s*['"]?none['"]?/i,
        ],
    },
    {
        id: 'deposit-button',
        regex: /\b(?:deposit\s+(?:now|today|today!)|deposit\s+to\s+play|claim\s+your\s+deposit|deposit\s+and\s+play)\b/i,
        severity: 'block',
        requireRealMoneyContext: false,
        exemptions: [
            /\bno\s+deposits?\b/i,
            /\b(?:no|fake|virtual)\s+deposit\b/i,
            /\bno\s+(?:cash\s+)?(?:value|deposit|entry\s+fee)\b/i,
        ],
    },
    {
        id: 'withdraw-button',
        regex: /\b(?:withdraw(?:al)?\s+(?:now|today|to|available)|instant\s+withdraw(?:al)?|fast\s+withdraw(?:al)?|priority\s+withdraw(?:al)?)\b/i,
        severity: 'block',
        requireRealMoneyContext: false,
        exemptions: [
            /\bno\s+withdraw(?:al)?s?\b/i,
            /\bno\s+real\s+(?:money|cash)\b/i,
            /\b(?:no|never)\s+(?:real|actual)\s+(?:withdrawals?|cash)\b/i,
        ],
    },
    {
        id: 'cash-bonus',
        regex: /\b(?:cash\s+bonus|deposit\s+bonus|crypto\s+bonus|reload\s+bonus|sign[\s-]?up\s+bonus|welcome\s+bonus)\b/i,
        severity: 'block',
        requireRealMoneyContext: false,
        exemptions: [
            /\bno\s+real\s+money\b/i,
            /\b(?:simulated|fake|virtual)\s+(?:badges?|rewards?)/i,
        ],
    },
    {
        id: 'wagering-requirement',
        regex: /\b(?:wagering\s+requirement|x\s*40\s*wager|rollover\s*(?:\d|[x×])|playthrough\s*(?:\d|[x×])|1\s*:\s*1\s+(?:match|wager|deposit)|100\s*%\s*(?:match|deposit\s+bonus))\b/i,
        severity: 'block',
        requireRealMoneyContext: false,
    },
    {
        id: 'crypto-payment',
        regex: /\b(?:deposit\s+(?:with|using)\s+(?:btc|bitcoin|crypto|usdt|ethereum))\b/i,
        severity: 'block',
        requireRealMoneyContext: false,
    },
    {
        id: 'real-currency-payout',
        regex: /\b(?:paid\s+in\s+(?:usd|eur|gbp|crypto)|payout(?:s)?\s+in\s+(?:usd|eur|gbp|crypto))\b/i,
        severity: 'block',
        requireRealMoneyContext: false,
    },
    {
        id: 'kyc-claim',
        regex: /\b(?:aml|kyc|ofac)\b/i,
        severity: 'block',
        requireRealMoneyContext: false,
        exemptions: [
            /\b(?:no|not)\s+kyc\b/i,
            /\bkyc\s+(?:bypass|skip|free)\b/i,
        ],
    },
    {
        id: 'gambling-license',
        regex: /\b(?:gambling\s+commission|curacao\s+licen[sc]e[ds]?|malta\s+gaming)\b/i,
        severity: 'block',
        requireRealMoneyContext: false,
    },
    {
        id: 'responsible-gambling',
        // Educational persona mention is allowed; "We are licensed under ..." is not.
        regex: /\bresponsible[\s-]?gambling\s+(?:policy|program|partner)/i,
        severity: 'block',
        requireRealMoneyContext: false,
        exemptions: [
            /\bplay\s+responsibly\b/i,
            /\bresponsible\s+(?:gambling|play)\s+(?:resources|help|sites?)\b/i,
        ],
    },
]

// ---------------------------------------------------------------------------
// Scanning helpers
// ---------------------------------------------------------------------------

const defaultRoots = ['src', 'public/index.html', 'README.md']
const skipDirs = new Set([
    'node_modules',
    'dist',
    'output',
    '.git',
    '.claude',
    '.codex',
    '.cursor',
    'process',
    'docs',
    'example',
    'rainbetclone',
    '__fixtures__',
    'scripts',
])
const scanExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.md', '.html', '.mjs', '.cjs', '.css'])

function* walk(root) {
    let stat
    try { stat = statSync(root) } catch { return }
    if (stat.isFile()) { yield root; return }
    if (!stat.isDirectory()) return
    for (const entry of readdirSync(root)) {
        const next = join(root, entry)
        if (skipDirs.has(entry)) continue
        yield* walk(next)
    }
}

function isScannable(path) {
    const ext = extname(path).toLowerCase()
    if (!scanExtensions.has(ext)) return false
    // Skip the scripts directory entirely (lint is its own concern).
    if (path.includes(`${sep}scripts${sep}`)) return false
    if (path.includes(`${sep}.claude${sep}`)) return false
    if (path.includes(`${sep}.codex${sep}`)) return false
    return true
}

function readLines(path) {
    const text = readFileSync(path, 'utf8')
    return text.split(/\r?\n/)
}

function lineHasRealMoneySignal(text) {
    return REAL_MONEY_SIGNALS.some((re) => re.test(text))
}

function findContextWindow(lines, idx, radius = 3) {
    const start = Math.max(0, idx - radius)
    const end = Math.min(lines.length, idx + radius + 1)
    return lines.slice(start, end).join(' / ')
}

function evaluate({ file, lines, allowlist }) {
    const violations = []
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        for (const trig of triggers) {
            const match = trig.regex.exec(line)
            if (!match) continue
            const context = findContextWindow(lines, i)
            if (trig.requireRealMoneyContext && !lineHasRealMoneySignal(context)) continue

            let exempt = false
            if (trig.exemptions) {
                for (const exemption of trig.exemptions) {
                    if (exemption.test(line) || exemption.test(context)) { exempt = true; break }
                }
            }
            // Pair-based exemption: when this trigger matches "real money" and
            // the same +/- 6 line window contains an explicit "None" mapping
            // (e.g. lobbyStat label "Cash value" → value "None" presented as
            // "Real money" = "None"), suppress the violation.
            if (educationalPairSuppressed(trig.id, lines, i)) exempt = true
            // Exemption holds unless the context carries a contradicting
            // real-money signal — for example, a line whose exemption says
            // "no real money" but whose +/- 3 line window contains "1:1
            // match" or "cash bonus".
            if (exempt && lineHasRealMoneySignal(context)) exempt = false
            if (allowlist.has(file)) exempt = true
            if (exempt) continue

            violations.push({
                file,
                line: i + 1,
                column: (match.index ?? 0) + 1,
                trigger: trig.id,
                severity: trig.severity,
                snippet: line.trim().slice(0, 160),
                contextSnippet: context.trim().slice(0, 240),
            })
        }
    }
    return violations
}

// Educational-pair exemption: when "real money" or "cash value" appears in
// the file as a label/key AND the same +/- 3 line window of the line under
// inspection (or any nearby line) carries an explicit "None" mapping,
// suppress the trigger. This protects the well-known lobby-stats pattern
// and similar pedagogical "real money → none" disclosures.
function educationalPairSuppressed(triggerId, lines, idx) {
    if (triggerId !== 'real-money-claim') return false
    const window = findContextWindow(lines, idx, 6)
    // Pair regexes cover the "Real money" → "None" disclosure pattern. The
    // windows allow spans across newlines because the label and value may
    // be comma-separated on different lines (e.g. lobby stat row).
    const pair = [
        /['"]?real\s+money['"]?[\s\S]{0,160}?['"]?none['"]?/i,
        /['"]?cash\s+value['"]?[\s\S]{0,160}?['"]?none['"]?/i,
        /['"]?real\s+money['"]?\s*:?\s*['"]?none['"]?/i,
    ]
    return pair.some((re) => re.test(window))
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
const flags = Object.fromEntries(
    argv.filter((a) => a.startsWith('--')).map((a) => {
        const [k, v] = a.split('=', 2)
        return [k.replace(/^--/, ''), v === undefined ? true : v]
    }),
)

const cwd = process.cwd()
const roots = flags.roots
    ? flags.roots.split(',').map((r) => isAbsolute(r) ? r : join(cwd, r))
    : defaultRoots.map((r) => join(cwd, r))
const allowlist = new Set(
    (flags.allowlist || '')
        .split(',')
        .filter(Boolean)
        .map((p) => join(cwd, p)),
)

const files = []
for (const root of roots) {
    for (const file of walk(root)) {
        if (isScannable(file)) files.push(file)
    }
}

let totalViolations = 0
const fileResults = []
for (const file of files) {
    let lines
    try { lines = readLines(file) } catch { continue }
    const violations = evaluate({ file, lines, allowlist })
    if (violations.length) {
        totalViolations += violations.length
        fileResults.push({ file, violations })
    }
}

if (totalViolations === 0) {
    console.log(`OK: ${files.length} file(s) scanned, 0 violation(s).`)
    process.exit(0)
}

console.log(`VIOLATIONS:`)
for (const { file, violations } of fileResults) {
    for (const v of violations) {
        console.log(`  ${relative(cwd, file)}:${v.line}:${v.column} [${v.trigger}/${v.severity}]`)
        console.log(`    ${v.snippet}`)
        if (v.contextSnippet !== v.snippet) {
            console.log(`    context: ${v.contextSnippet}`)
        }
    }
}
console.log(`\n${totalViolations} violation(s).`)
process.exit(1)
