// Confirm ESLint 9 is installed in the project tree.
// Prints ESLINT_PRESENT to stdout on success, ESLINT_MISSING otherwise.
//
// Caller: scripts/lintRngGuard.test.mjs spawns this to decide whether to run
// the RNG-guard payout-integrity gate or soft-SKIP when the ESLint dev-dep is
// absent (CI without `npm ci`). Retained deliberately when the other cycle-3
// verifier probes were deleted — do not remove without rewiring that caller.
import { statSync } from 'node:fs'
import { join } from 'node:path'

const candidates = [
    join(process.cwd(), 'node_modules', 'eslint'),
    join(process.cwd(), '..', 'node_modules', 'eslint'),
]

let found = false
for (const c of candidates) {
    try {
        const s = statSync(c)
        if (s.isDirectory() || s.isFile()) { found = true; break }
    } catch { /* retry next */ }
}

process.stdout.write(found ? 'ESLINT_PRESENT\n' : 'ESLINT_MISSING\n')
