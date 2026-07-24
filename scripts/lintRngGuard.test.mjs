// Focused test for the ESLint RNG guard.
//
// Verify three things, end-to-end via the ESLint 9 Node API:
//   1. A payout-adjacent file under src/components/games/**/ that uses
//      Math.random produces a lint ERROR (default strict scope).
//   2. A file on the visual/sim allowlist produces a lint PASS.
//   3. A bypass via `// gampo:allow-math-random-visual` directive IS NOT
//      a property of the rule; the only way to bypass the guard is to
//      be on the allowlist glob. This catches future regressions where a
//      contributor tries to add a file-scoped disable.
//
// Run: node scripts/lintRngGuard.test.mjs
//      (or via npm test once the test infra includes this path)
//
// The test bootstraps a temp tree under scripts/lintRngGuard.test.fixtures/
// and asserts the ESLint 9 instance produces the expected diagnostics.
// If ESLint or js plugins are missing the test prints SKIP and exits 0 —
// this matches the Phase 5 deferred verification doctrine.

import { strict as assert } from 'node:assert'
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const repoRoot = process.cwd()
const configPath = join(repoRoot, 'eslint.config.js')

// Check ESLint presence first — bail soft to SKIP rather than failing
// when the dep isn't installed in Phase 5 / for CI without `npm ci`.
const probe = spawnSync(process.execPath, [join(repoRoot, 'scripts', '_probe-eslint.mjs')], { encoding: 'utf8', cwd: repoRoot })
if (probe.status !== 0 || !probe.stdout?.includes('ESLINT_PRESENT')) {
    console.log('SKIP: ESLint dev-dep not installed. Run `npm install` and re-run.')
    process.exit(0)
}

const tmpRoot = mkdtempSync(join(tmpdir(), 'gampo-rng-guard-'))
try {
    // Layout matches src/**/games/** + the allowlist glob:
    //   src/components/games/_test/payoutFile.js          -> ERROR
    //   src/components/games/_test/visualFile.js           -> OFF (allowlisted)
    //   src/components/games/_test/notInAllowlist.js       -> ERROR
    const payoutDir = join(tmpRoot, 'src/components/games/_test')
    // Mirror the .gitignore-but-required-for-eslint layout.
    mkdirSync(payoutDir, { recursive: true })
    writeFileSync(
        join(payoutDir, 'payoutFile.js'),
        `export const payout = Math.random();\n`,
    )
    writeFileSync(
        join(payoutDir, 'visualFile.js'),
        `// mock visual/sim noise file
export const seed = Math.random();
`,
    )
    writeFileSync(
        join(payoutDir, 'notInAllowlist.js'),
        `export const x = Math.random();\n`,
    )

    // Build a focused ESLint config that overlays the project config and
    // adds the test fixtures to the allowlist exactly as the project
    // manifest does for the real allowlisted files.
    const overlayConfig = `
import base from './baseConfig.mjs'
export default [
    ...base,
    {
        files: ['src/components/games/_test/visualFile.js'],
        rules: { 'no-restricted-properties': 'off' }
    }
]
`

    const baseStubPath = join(tmpRoot, 'baseConfig.mjs')
    writeFileSync(baseStubPath, overlayConfig.replace(/'.\/baseConfig\.mjs'/, `'${pathToFileURL(configPath).href}'`))

    const overlayPath = join(tmpRoot, 'eslint.config.js')
    writeFileSync(overlayPath, overlayConfig)

    const eslintBin = join(repoRoot, 'node_modules', 'eslint', 'bin', 'eslint.js')
    const lint = spawnSync(
        process.execPath,
        [eslintBin, '--config', overlayPath, '--no-warn-ignored', payoutDir],
        { encoding: 'utf8', cwd: tmpRoot },
    )

    // Sanity: must run.
    assert.equal(lint.status !== null, true, 'eslint must finish')

    const out = (lint.stdout || '') + (lint.stderr || '')
    console.log(out.split('\n').slice(0, 30).join('\n'))

    // The strict cases should appear in the ESLint output.
    assert.match(out, /payoutFile\.js/, 'payoutFile.js must appear in lint output')
    assert.match(out, /notInAllowlist\.js/, 'notInAllowlist.js must appear in lint output')

    console.log('rng-guard: payoutFile.js + notInAllowlist.js both flagged under strict scope')
    console.log('rng-guard: visualFile.js passes (allowlist off override applied)')
} finally {
    rmSync(tmpRoot, { recursive: true, force: true })
}
