// RNG intent validator — Phase 04 of repo-quality-gates.
//
// WHY THIS EXISTS
// ---------------
// `eslint.config.js` previously carried an `rngAllowVisual` file-glob override that
// set `no-restricted-properties: 'off'` for a whole file. That gave mixed-purpose
// components (notably war/CasinoWarGame.jsx and mines/MinesGame.jsx) blanket
// immunity: a genuine payout-path `Math.random()` added to such a file would lint
// clean forever.
//
// ESLint alone cannot express "this ONE call site is allowed" without a custom rule
// plugin, and this phase is explicitly not allowed to add a lint dependency. So the
// enforcement is split into two layers:
//
//   Layer A (eslint.config.js) — the strict `no-restricted-properties` error stays on
//     for all of src/components/games/**. A small reviewed set of files is exempted.
//   Layer B (THIS FILE) — for every exempted file, enforce per-call-site intent.
//
// Layer B is what makes the exemption narrow. It enforces, per call site:
//
//   1. ANNOTATION REQUIRED — every `Math.random` needs
//        gampo:allow-math-random-<kind> — <reason>
//      on the same line (trailing comment) or the line immediately above.
//   2. REASON REQUIRED — <reason> must be >= MIN_REASON_LENGTH non-space chars.
//   3. KIND CLOSED SET — <kind> must be one of ALLOWED_KINDS.
//   4. NARROW SCOPE — an annotation is credited only to a call on its own line or the
//      next line. An annotation in a file header, or anywhere else non-adjacent, is an
//      ORPHAN and fails. This is what makes a file-level annotation impossible: you
//      cannot write one comment at the top and cover the whole file.
//   5. COUNT LOCK — each allowlist entry declares `calls: <n>`. The actual number of
//      `Math.random` occurrences must equal <n> exactly. Adding a new call to an
//      already-reviewed file breaks the lock and fails, which is the specific defect
//      this phase closes.
//   6. NO STALE ENTRIES — an entry whose file has zero calls fails.
//   7. NO UNREVIEWED EXEMPT FILES — a file ESLint exempts but the allowlist omits fails.
//
// One escape hatch exists and is deliberately loud: `legacyUnannotated: true` marks a
// file as reviewed-but-not-yet-annotated. It still obeys the COUNT LOCK (rule 5), so a
// new call in a legacy file still fails. It is used only for live-WIP files that this
// phase is not permitted to edit.
//
// Run: node scripts/lintRngIntent.mjs
//      node scripts/lintRngIntent.mjs --json

import { readFileSync, existsSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ALLOWED_KINDS = ['visual', 'sim', 'id', 'fallback']
export const MIN_REASON_LENGTH = 12
export const ANNOTATION_TAG = 'gampo:allow-math-random'

// Reviewed allowlist. Every file here is exempted from the ESLint
// `no-restricted-properties` error and therefore MUST satisfy the per-call-site rules
// above. `calls` is the count lock. Do not edit a count without re-reviewing the file.
export const rngIntentAllowlist = [
    {
        file: 'src/components/games/slots/slotFactory.js',
        calls: 1,
        review: 'Idle-grid visual pre-fill only; reel payouts run through nextRoll + the paytable.',
    },
    {
        file: 'src/components/games/plinko/engine/PlinkoEngine.js',
        calls: 4,
        review: 'Ball DOM ids + spawn-x jitter; the payout bin comes from the precomputed outcomes table.',
    },
    {
        file: 'src/components/games/plinko/engine/Ball.js',
        calls: 1,
        review: 'Ball DOM id only; settlement is keyed off the per-ball map, not this id.',
    },
    {
        file: 'src/components/games/plinko/engine/constants.js',
        calls: 1,
        review: 'Generic visual range helper used for physics jitter.',
    },
    {
        file: 'src/components/games/plinko/PlinkoGame.jsx',
        calls: 1,
        review: 'Drop-cadence jitter only; settlement is keyed by per-ball id.',
    },
    {
        file: 'src/components/games/dino/engine/DinoEngine.js',
        calls: 5,
        review: 'Demo spawn cadence and obstacle spacing/kind; the dino stake outcome is driven by nextRoll.',
    },
    {
        file: 'src/components/games/crash/CrashGame.jsx',
        calls: 12,
        review: 'Atmospheric sim-crowd roster, personas, and fake bet sizes. The real bust point comes from nextRoll.',
    },
    {
        file: 'src/components/games/roulette/RouletteGame.jsx',
        calls: 8,
        review: 'Atmospheric sim-bettor rows plus local chip-row ids. The landed number comes from nextRoll.',
    },
    {
        file: 'src/components/games/chickencross/ChickenCrossGame.jsx',
        calls: 1,
        review: 'Cosmetic car-flyby cadence only; lane outcome comes from nextRoll.',
    },
    {
        file: 'src/utils/fairRng.js',
        calls: 1,
        review: 'Web Crypto absence fallback for seed bytes in non-browser test envs. Real gameplay takes crypto.getRandomValues.',
    },
    {
        // Live user WIP during Phase 04 — this phase is not permitted to edit poker source,
        // so the file is reviewed but not yet annotated. The count lock still applies, so a
        // new Math.random here fails the gate.
        file: 'src/components/games/poker/PokerGame.jsx',
        calls: 12,
        legacyUnannotated: true,
        review: 'Persona chat cadence and bubble rate. Carried as legacy-unannotated: poker is live WIP in Phase 04; annotate when poker work lands.',
    },
]

function toPosix(value) {
    return value.split(sep).join('/').replace(/\\/g, '/')
}

function findOccurrences(source) {
    const lines = source.split(/\r?\n/)
    const hits = []
    lines.forEach((text, index) => {
        // Count every occurrence, not just the first — a line can hold several.
        let from = 0
        for (;;) {
            const at = text.indexOf('Math.random', from)
            if (at === -1) break
            hits.push({ line: index + 1, column: at + 1 })
            from = at + 'Math.random'.length
        }
    })
    return hits
}

function parseAnnotation(text) {
    const at = text.indexOf(ANNOTATION_TAG)
    if (at === -1) return null
    const rest = text.slice(at + ANNOTATION_TAG.length)
    // Expected shape: `-<kind> <separator> <reason>`
    const match = /^-([a-zA-Z-]*)\s*(.*)$/.exec(rest)
    if (!match) return { kind: '', reason: '' }
    const kind = match[1] || ''
    // Accept em dash, en dash, hyphen or colon as the reason separator.
    const reason = match[2].replace(/^\s*[—–\-:]\s*/, '').trim()
    return { kind, reason }
}

function findAnnotationLines(source) {
    const lines = source.split(/\r?\n/)
    const found = []
    lines.forEach((text, index) => {
        if (text.includes(ANNOTATION_TAG)) found.push({ line: index + 1, text })
    })
    return found
}

/**
 * Validate a single file's call sites against the per-call-site intent rules.
 * Pure function over source text so tests can drive it without a temp tree.
 */
export function validateFileSource(entry, source) {
    const failures = []
    const file = entry.file
    const occurrences = findOccurrences(source)
    const annotations = findAnnotationLines(source)

    // Rule 5 — COUNT LOCK. Checked first: it is the cheapest signal that a reviewed
    // file grew a new, unreviewed call site.
    if (typeof entry.calls !== 'number') {
        failures.push(`${file}: allowlist entry is missing a numeric \`calls\` count lock.`)
    } else if (occurrences.length !== entry.calls) {
        failures.push(
            `${file}: count lock broken — allowlist declares ${entry.calls} Math.random call(s) but found ${occurrences.length}. ` +
            `If the new call is payout-affecting it must use nextRoll(). If it is genuinely visual, annotate it and update the reviewed count.`,
        )
    }

    // Rule 6 — NO STALE ENTRIES.
    if (occurrences.length === 0) {
        failures.push(`${file}: stale allowlist entry — no Math.random remains in this file. Remove the entry.`)
    }

    // Every entry needs a human review note.
    if (!entry.review || entry.review.trim().length < MIN_REASON_LENGTH) {
        failures.push(`${file}: allowlist entry needs a \`review\` note of at least ${MIN_REASON_LENGTH} characters.`)
    }

    if (entry.legacyUnannotated) {
        // Legacy files still obey the count lock above, but skip per-site annotation
        // checks. They are the only files allowed to carry unannotated calls.
        return failures
    }

    const lines = source.split(/\r?\n/)
    const creditedAnnotationLines = new Set()

    for (const hit of occurrences) {
        const sameLine = lines[hit.line - 1] ?? ''
        const above = lines[hit.line - 2] ?? ''

        // Rule 4 — NARROW SCOPE. Only the call's own line or the line directly above
        // can carry its annotation.
        let source_line = null
        let annotationLine = 0
        if (sameLine.includes(ANNOTATION_TAG)) {
            source_line = sameLine
            annotationLine = hit.line
        } else if (above.includes(ANNOTATION_TAG)) {
            source_line = above
            annotationLine = hit.line - 1
        }

        if (source_line === null) {
            // Rule 1 — ANNOTATION REQUIRED. This is the check that catches a payout-path
            // Math.random dropped into an otherwise-annotated file.
            failures.push(
                `${file}:${hit.line}:${hit.column}: Math.random has no adjacent \`${ANNOTATION_TAG}-<kind> — <reason>\` annotation. ` +
                `Payout paths must use nextRoll() from src/utils/fairRng.js instead.`,
            )
            continue
        }

        creditedAnnotationLines.add(annotationLine)
        const parsed = parseAnnotation(source_line)

        // Rule 3 — KIND CLOSED SET.
        if (!ALLOWED_KINDS.includes(parsed.kind)) {
            failures.push(
                `${file}:${hit.line}: annotation kind "${parsed.kind || '(missing)'}" is not allowed. ` +
                `Use one of: ${ALLOWED_KINDS.join(', ')}.`,
            )
        }

        // Rule 2 — REASON REQUIRED.
        const reasonLength = parsed.reason.replace(/\s+/g, '').length
        if (reasonLength < MIN_REASON_LENGTH) {
            failures.push(
                `${file}:${hit.line}: annotation reason is missing or too short (${reasonLength} chars, need >= ${MIN_REASON_LENGTH}). ` +
                `State why this call cannot affect a payout.`,
            )
        }
    }

    // Rule 4 (second half) — ORPHAN ANNOTATIONS. An annotation that was never credited to
    // an adjacent call is either stale or an attempt to grant file-wide immunity.
    for (const annotation of annotations) {
        if (creditedAnnotationLines.has(annotation.line)) continue
        failures.push(
            `${file}:${annotation.line}: orphan annotation — no Math.random on this line or the line below. ` +
            `Annotations only cover a single adjacent call site; they cannot be hoisted to cover a file.`,
        )
    }

    return failures
}

export function validateAllowlist(allowlist, root = process.cwd()) {
    const failures = []
    const seen = new Set()

    for (const entry of allowlist) {
        const key = toPosix(entry.file)
        if (seen.has(key)) {
            failures.push(`${key}: duplicate allowlist entry.`)
            continue
        }
        seen.add(key)

        const absolute = resolve(root, entry.file)
        if (!existsSync(absolute)) {
            failures.push(`${key}: allowlist entry points at a file that does not exist.`)
            continue
        }
        failures.push(...validateFileSource(entry, readFileSync(absolute, 'utf8')))
    }

    return failures
}

/**
 * Rule 7 — NO UNREVIEWED EXEMPT FILES. Cross-check the ESLint config's exemption list
 * against the reviewed allowlist so the two can never drift apart.
 */
export function crossCheckEslintExemptions(eslintExempt, allowlist) {
    const failures = []
    const reviewed = new Set(allowlist.map((entry) => toPosix(entry.file)))
    for (const file of eslintExempt.map(toPosix)) {
        if (!reviewed.has(file)) {
            failures.push(`${file}: ESLint exempts this file from the RNG guard but it has no reviewed allowlist entry.`)
        }
    }
    const exempt = new Set(eslintExempt.map(toPosix))
    for (const file of reviewed) {
        if (!exempt.has(file)) {
            failures.push(`${file}: reviewed allowlist entry is not in the ESLint exemption list — the two lists have drifted.`)
        }
    }
    return failures
}

async function main() {
    const json = process.argv.includes('--json')
    const failures = validateAllowlist(rngIntentAllowlist)

    // Pull the live exemption list straight out of eslint.config.js so drift is impossible.
    const configUrl = new URL('../eslint.config.js', import.meta.url)
    const { rngIntentExemptFiles } = await import(configUrl.href)
    failures.push(...crossCheckEslintExemptions(rngIntentExemptFiles ?? [], rngIntentAllowlist))

    const annotated = rngIntentAllowlist.filter((entry) => !entry.legacyUnannotated)
    const legacy = rngIntentAllowlist.filter((entry) => entry.legacyUnannotated)
    const lockedCalls = rngIntentAllowlist.reduce((sum, entry) => sum + (entry.calls || 0), 0)

    if (json) {
        console.log(JSON.stringify({ failures, entries: rngIntentAllowlist.length, lockedCalls }, null, 2))
    } else {
        console.log(
            `rng-intent: ${rngIntentAllowlist.length} reviewed file(s), ${lockedCalls} locked call site(s), ` +
            `${annotated.length} annotated, ${legacy.length} legacy-unannotated`,
        )
        for (const failure of failures) console.log(`FAIL: ${failure}`)
        if (!failures.length) console.log('rng-intent: all call sites carry a narrow, reasoned, adjacent annotation')
    }

    process.exitCode = failures.length ? 1 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main()
