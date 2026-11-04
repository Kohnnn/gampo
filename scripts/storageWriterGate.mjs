#!/usr/bin/env node
/**
 * Gate D1-4: no new unguarded direct `localStorage` writer.
 *
 * Background. `phase-01-save-concurrency_PLAN_03-11-26.md` D1-4 requires that
 * "every direct writer and wrapper caller joins one critical section". No gate
 * enforced that, so the claim was untestable — the PVL named this the missing
 * gate. This is the gate.
 *
 * Honest scope. This is a *ratchet on source shape*, not proof that the lock is
 * held at runtime:
 *   - `src/utils/storage.js` is the wrapper; its writes are the single
 *     chokepoint and are allowed.
 *   - Every other direct write site must be listed in the baseline with its
 *     count. Existing debt is tolerated; **new** debt fails.
 *   - Debt may only shrink. Adding a site, or raising a file's count, fails.
 *   - `--strict` fails while any debt remains (the state EXECUTE must reach).
 *
 * Usage:
 *   node scripts/storageWriterGate.mjs                     # ratchet check
 *   node scripts/storageWriterGate.mjs --strict            # require zero debt
 *   node scripts/storageWriterGate.mjs --update-baseline    # after removing debt
 *
 * Exit codes:
 *   0 - no new debt (and, with --strict, no debt at all)
 *   1 - new or grown debt, or --strict with debt remaining
 *   2 - the gate could not run (no scannable source)
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = 'src'
const BASELINE = 'scripts/storageWriterBaseline.json'
const WRAPPER = 'src/utils/storage.js'
// `setItem` / `removeItem` / `clear`. `getItem` is a read and is not a writer.
const WRITE_RE = /\blocalStorage\s*\.\s*(setItem|removeItem|clear)\s*\(/g

function collectFiles(dir, acc = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist') continue
            collectFiles(full, acc)
            continue
        }
        if (!/\.(js|jsx|mjs|cjs|ts|tsx)$/.test(entry.name)) continue
        if (/\.test\./.test(entry.name)) continue
        acc.push(full)
    }
    return acc
}

/**
 * Blank out comments and string/template literals.
 *
 * A regex cannot do this correctly: `//` inside `'https://…'` is not a comment,
 * and a writer-shaped token inside a string is not a writer. An earlier version
 * used `/\/\*…|(^|[^:])//…/` and miscounted both. This is a small scanner rather
 * than a dependency; it does not need to be a full JS parser, only to never
 * invent or hide a call site.
 *
 * Regex literals are not special-cased: a `/…/` containing an unbalanced quote
 * could desynchronise the scanner, but a false count there is caught by the
 * baseline diff instead of passing silently.
 */
function stripComments(source) {
    let out = ''
    let i = 0
    const n = source.length
    while (i < n) {
        const c = source[i]
        const next = source[i + 1]
        if (c === '/' && next === '/') {
            while (i < n && source[i] !== '\n') { out += ' '; i += 1 }
            continue
        }
        if (c === '/' && next === '*') {
            out += '  '
            i += 2
            while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
                out += source[i] === '\n' ? '\n' : ' '
                i += 1
            }
            if (i < n) { out += '  '; i += 2 }
            continue
        }
        if (c === '"' || c === "'" || c === '`') {
            const quote = c
            out += ' '
            i += 1
            while (i < n) {
                const d = source[i]
                if (d === '\\') { out += source[i] === '\n' ? '\n' : ' '; out += ' '; i += 2; continue }
                if (d === quote) { out += ' '; i += 1; break }
                out += d === '\n' ? '\n' : ' '
                i += 1
            }
            continue
        }
        out += c
        i += 1
    }
    return out
}

export function countWriterSites(files, root = process.cwd()) {
    const counts = {}
    for (const file of files) {
        const rel = relative(root, file).split('\\').join('/')
        if (rel === WRAPPER || /\.test\./.test(rel)) continue
        const source = stripComments(readFileSync(file, 'utf8'))
        const hits = source.match(WRITE_RE)
        if (!hits) continue
        // Reset lastIndex: WRITE_RE is global and reused across files.
        WRITE_RE.lastIndex = 0
        counts[rel] = hits.length
    }
    return counts
}

export function compareToBaseline(counts, baseline) {
    const problems = []
    for (const [file, count] of Object.entries(counts)) {
        const allowed = baseline[file]
        if (allowed == null) {
            problems.push(`NEW unguarded writer: ${file} (${count} site${count === 1 ? '' : 's'})`)
        } else if (count > allowed) {
            problems.push(`GREW: ${file} ${allowed} -> ${count}`)
        }
    }
    // Any file that only exists in the baseline is reduced debt — allowed, and
    // reported so the baseline can be refreshed.
    const reduced = Object.keys(baseline).filter((file) => (counts[file] ?? 0) < baseline[file])
    return { problems, reduced }
}

function main() {
    const strict = process.argv.includes('--strict')
    const update = process.argv.includes('--update-baseline')

    if (!existsSync(SRC)) {
        console.error(`storage-writer-gate: ${SRC}/ not found — nothing was verified`)
        process.exit(2)
    }

    const files = collectFiles(SRC)
    if (files.length === 0) {
        console.error(`storage-writer-gate: no scannable files under ${SRC}/ — nothing was verified`)
        process.exit(2)
    }

    const counts = countWriterSites(files)

    if (update) {
        const ordered = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
        writeFileSync(BASELINE, `${JSON.stringify(ordered, null, 4)}\n`)
        console.log(`storage-writer-gate: baseline rewritten with ${Object.keys(ordered).length} file(s)`)
        return
    }

    const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}
    const { problems, reduced } = compareToBaseline(counts, baseline)
    const debt = Object.values(counts).reduce((sum, n) => sum + n, 0)

    for (const file of reduced) {
        console.warn(`storage-writer-gate: debt reduced in ${file} — run --update-baseline`)
    }

    if (problems.length > 0) {
        console.error('storage-writer-gate: unguarded direct localStorage writer detected')
        for (const problem of problems) console.error(`  ${problem}`)
        console.error('')
        console.error(`Route the write through src/utils/storage.js, or through`)
        console.error(`withStorageLock/updateStorageUnderLock. Do not add a raw write.`)
        process.exit(1)
    }

    if (strict && debt > 0) {
        console.error(`storage-writer-gate: --strict requires zero debt; ${debt} site(s) remain in ${Object.keys(counts).length} file(s)`)
        for (const [file, count] of Object.entries(counts)) console.error(`  ${file}: ${count}`)
        process.exit(1)
    }

    console.log(`storage-writer-gate: scanned ${files.length} files — no new debt (${debt} known site(s), ${Object.keys(counts).length} file(s))`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
