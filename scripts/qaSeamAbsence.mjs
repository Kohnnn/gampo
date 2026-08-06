#!/usr/bin/env node
/**
 * Guard: the dev-only slots QA seam must never ship in a production build.
 *
 * Background. SlotsGame.jsx exposes window.__gampoSlotQa so local probes can
 * drive bonus state. That API sets freeSpins, and a free spin takes the
 * `stake === 0` path in performSpin which skips placeBet entirely. Shipped, it
 * is free credits for anyone who opens a console. It DID ship until this guard
 * was added.
 *
 * The seam is removed from production by an `import.meta.env.DEV` check, which
 * Vite statically replaces so the block dead-code eliminates. That is an easy
 * thing to break invisibly: swapping the guard for a runtime check (hostname,
 * a runtime env read, a plain boolean) still *works* in dev and still passes
 * every unit test, while quietly re-emitting the seam into the bundle. Source
 * inspection cannot catch that. Only the built artifact can.
 *
 * So this runs against real build output. Usage:
 *
 *   node scripts/qaSeamAbsence.mjs [targetDir]   # default: dist
 *
 * Exit codes are distinct on purpose so the self-test can tell apart "found a
 * leak" from "had nothing to look at":
 *   0 - scanned a non-empty target, found no forbidden tokens
 *   1 - forbidden token present in build output
 *   2 - target missing or contained no scannable files (guard could not run)
 *
 * Exit 2 matters as much as exit 1. A guard that silently succeeds when there
 * is nothing to inspect is worse than no guard, because it reports safety it
 * never verified.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const DEFAULT_TARGET = 'dist'

// Tokens that only exist to support the dev QA seam. These survive minification
// because they are object property names and event-name string literals, not
// local bindings — the observed leak contained `__gampoSlotQa` and
// `forceBonusState:a` verbatim in minified output.
//
// If you rename part of the seam, rename it here too. A stale token list is a
// guard that passes for the wrong reason.
const FORBIDDEN_TOKENS = [
    '__gampoSlotQa',
    'forceBonusState',
    'gampo:slot-qa-ready',
]

const SCANNED_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.html', '.css'])

function collectFiles(dir, acc = []) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            collectFiles(full, acc)
        } else if (SCANNED_EXTENSIONS.has(extname(entry))) {
            acc.push(full)
        }
    }
    return acc
}

function main() {
    const target = process.argv[2] || DEFAULT_TARGET

    if (!existsSync(target)) {
        console.error(`qa-seam-absence: target directory not found: ${target}`)
        console.error('qa-seam-absence: run `npm run build` first — nothing was verified')
        process.exit(2)
    }

    const files = collectFiles(target)
    if (files.length === 0) {
        console.error(`qa-seam-absence: no scannable files under ${target} — nothing was verified`)
        process.exit(2)
    }

    const violations = []
    for (const file of files) {
        const contents = readFileSync(file, 'utf8')
        for (const token of FORBIDDEN_TOKENS) {
            if (contents.includes(token)) {
                violations.push({ file: relative(process.cwd(), file), token })
            }
        }
    }

    if (violations.length > 0) {
        console.error('qa-seam-absence: dev-only QA seam leaked into production output')
        for (const { file, token } of violations) {
            console.error(`  VIOLATION ${token} in ${file}`)
        }
        console.error('')
        console.error('The seam must be behind `if (!import.meta.env.DEV) return undefined` so')
        console.error('Vite can eliminate it. A runtime-only check is not sufficient.')
        process.exit(1)
    }

    console.log(`qa-seam-absence: scanned ${files.length} files in ${target} — 0 violations`)
}

main()
