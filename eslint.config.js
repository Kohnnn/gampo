// ESLint flat config for GamPo.
//
// Phase 3 — Integrity and Language Guardrails.
// Goal: structurally separate RNG sources of truth (nextRoll / Web Crypto)
// from every "outcome-affecting" path under src/**/games/**. Payouts may
// only ever be driven by the provably-fair nextRoll pipeline. Visual and
// simulation noise (cosmetics, persona tags, ball IDs) is intentionally
// allowlisted via the file-glob matrix below — never blanket-suppressed.
//
// Vocabulary used in the matrix:
//   @gampo/rng-strict   = error on Math.random (default for src/**/games/** excluding tests + allowlist)
//   @gampo/rng-allow    = off (visual + sim layers — see allowlist below)
//
// Phase 4 — RNG Guard Intent Split (2026-08-05).
// The old `rngAllowVisual` list disabled the guard for EVERY call in a listed
// file. Mixed-purpose components got blanket immunity, so a real payout-path
// Math.random() in one of them would lint clean forever. That list is gone.
//
// Exemption is now a two-layer contract:
//   Layer A (here)  — `rngIntentExemptFiles` turns the ESLint rule off for a
//                     small reviewed set of files.
//   Layer B (script)— `scripts/lintRngIntent.mjs` then enforces, inside each of
//                     those files, that EVERY Math.random has an adjacent
//                     annotation with a valid kind and a real reason, that no
//                     annotation is orphaned/hoisted, and that the call count
//                     matches a reviewed lock. Adding a new call to an exempted
//                     file FAILS the gate.
//
// Neither layer alone can grant blanket immunity. Layer A without Layer B is the
// old defect; Layer B is enforced by `npm run lint:rng-intent` and its test.
//
// Adding a new file that needs Math.random:
//
//   1. Confirm the use is NOT payout-affecting (does not select a winning
//      board cell, drop position, or roll that settles a ticket).
//   2. Add the file path to `rngIntentExemptFiles` below AND add a reviewed
//      entry (with a `calls` count lock and a `review` note) to
//      `rngIntentAllowlist` in scripts/lintRngIntent.mjs. The two lists are
//      cross-checked; drift fails the gate.
//   3. Annotate EVERY Math.random call site in the file with
//      `// gampo:allow-math-random-<kind> — <reason>` on the call's own line or
//      the line directly above it. Valid kinds: visual, sim, id, fallback.
//      The reason must be at least 12 characters. Unannotated, orphaned, or
//      short-reason annotations fail.
//
// Run via `npm run lint` and `npm run lint:rng-intent` from package.json.

import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'

// ---------------------------------------------------------------------------
// RNG guard scope + narrow reviewed exemption list.
//
// Audit results (2026-07-13, Phase 3 entry; re-verified 2026-08-05, Phase 4):
//  - Payout-affecting paths (slots, plinko-bucket, roulette-wheel, dice,
//    limbo, crash, mines, baccarat-shuffle, casino-war-shuffle, fairRng)
//    all consume `nextRoll` from src/utils/fairRng.js. ZERO hits in those
//    engine modules.
//
//  - Visual / persona / sim uses (slot idle prefill, plinko ball-id and
//    physics jitter, dino obstacle spacing, crash sim-crowd targets,
//    roulette sim bettors, poker persona chat) live in the files below.
//    Phase 4 verified each remaining call site individually and annotated it;
//    see scripts/lintRngIntent.mjs for the per-file count lock and review note.
//
//  - Phase 4 removed war/CasinoWarGame.jsx and mines/MinesGame.jsx from any
//    consideration for exemption. Their flagged calls were `session.record`
//    history-key ids and were migrated to crypto.randomUUID() instead, so the
//    strict guard stays fully armed on both files.
//
// Adding a new payout-affecting RNG source must NOT be added here; the
// guard must REMAIN `error` for src/components/games/** excluding this list
// and excluding `*.test.js(x)`. All RNG sources of truth must trace to
// src/utils/fairRng.js#nextRoll.
//
// This list is exported so scripts/lintRngIntent.mjs can cross-check it against
// the reviewed allowlist. Drift between the two fails the gate.
// ---------------------------------------------------------------------------
export const rngIntentExemptFiles = [
    // slot idle-grid visual pre-fill (slotFactory.js#randomVisualSymbol)
    'src/components/games/slots/slotFactory.js',
    // plinko ball-id + visual physics jitter; payout via nextRoll + outcomes table
    'src/components/games/plinko/engine/PlinkoEngine.js',
    'src/components/games/plinko/engine/Ball.js',
    'src/components/games/plinko/engine/constants.js',
    // dino demo spawn + obstacle spacing (visual)
    'src/components/games/dino/engine/DinoEngine.js',
    // crash sim crowd + targets (purely atmospheric)
    'src/components/games/crash/CrashGame.jsx',
    // roulette sim-bettor rows + local chip ids (purely atmospheric)
    'src/components/games/roulette/RouletteGame.jsx',
    // poker persona chat + bubble rate (atmospheric; carried as legacy-unannotated
    // in Phase 04 because poker is live WIP — the call-count lock still applies)
    'src/components/games/poker/PokerGame.jsx',
    // plinko drop delay jitter (visual; settlement via per-ball map)
    'src/components/games/plinko/PlinkoGame.jsx',
    // chickencross car cadence is visual sim only
    'src/components/games/chickencross/ChickenCrossGame.jsx',
    // fairness-random fallback when crypto is absent (NOT payout path)
    'src/utils/fairRng.js',
]

export default [
    // Ignore generated / vendored / harness paths.
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'output/**',
            'public/**',
            'example/**',
            'rainbetclone/**',
            'docs/**',
            '.claude/**',
            '.codex/**',
            '.cursor/**',
            'process/**',
            'scripts/**',          // scripts are tested by their own focused tests
            'src/**/*.test.js',     // test-only Math.random fixture seeding
            'src/**/*.test.jsx',
            'src/**/*.test.ts',
            'src/**/*.test.tsx',
        ],
    },

    // Base JS recommendations (scoped to source files only).
    {
        files: ['src/**/*.{js,jsx}'],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
            globals: { ...globals.browser },
        },
    },

    {
        files: ['src/**/*.jsx'],
        plugins: { react },
        rules: {
            'react/jsx-uses-vars': 'error',
        },
    },

    // Phase 3 RNG guard. Applies only to source (non-test) files under
    // src/**/games/** — the strict default for the payout boundary.
    // Phase 4: the exemption list is now paired with per-call-site annotation
    // enforcement in scripts/lintRngIntent.mjs.
    {
        files: ['src/components/games/**/*.{js,jsx}'],
        ignores: [
            'src/**/*.test.js',
            'src/**/*.test.jsx',
            ...rngIntentExemptFiles,
        ],
        rules: {
            'no-restricted-properties': [
                'error',
                {
                    object: 'Math',
                    property: 'random',
                    message:
                        'Math.random is reserved for non-payout visual/sim noise only. Payout paths MUST consume nextRoll() from src/utils/fairRng.js. Internal record ids should use crypto.randomUUID(). See eslint.config.js for the narrow reviewed exemption list.',
                },
            ],
        },
    },

    // ------ RNG guard override: reviewed exemption list (off in ESLint, but
    // every call site inside these files is enforced by
    // scripts/lintRngIntent.mjs — annotation + reason + adjacency + count lock).
    {
        files: rngIntentExemptFiles,
        rules: {
            'no-restricted-properties': 'off',
        },
    },

    // ------ Tests: project-wide node globals + es2024 --------------------
    {
        files: ['src/**/*.test.{js,jsx}', 'src/**/*.test.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: { ...globals.node, ...globals.browser },
        },
    },

    // ------ ESLint config self-reference passes ---------------------------
    {
        files: ['eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: { ...globals.node },
        },
    },
]
