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
// Adding a new file that needs Math.random:
//
//   1. Confirm the use is NOT payout-affecting (does not select a winning
//      board cell, drop position, or roll that settles a ticket).
//   2. Add the file path under `rngAllowVisual` below so the guard knows
//      it is intentional. Do NOT add a blanket disable.
//   3. Annotate each load-bearing call site with
//      `// gampo:allow-math-random-visual — <why>` on the line directly
//      above the call so future readers see the intent.
//
// Run via `npm run lint` from package.json.

import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'

// ---------------------------------------------------------------------------
// RNG guard scope + narrow visual/sim allowlist.
//
// Audit results (2026-07-13, Phase 3 entry):
//  - Payout-affecting paths (slots, plinko-bucket, roulette-wheel, dice,
//    limbo, crash, mines, baccarat-shuffle, casino-war-shuffle, fairRng)
//    all consume `nextRoll` from src/utils/fairRng.js. ZERO hits in those
//    engine modules.
//
//  - Visual / persona / sim uses (slot idle prefill, plinko ball-id and
//    physics jitter, dino obstacle spacing, crash sim-crowd targets,
//    roulette sim bettors, poker persona chat — see PHASE-3-REPORT for
//    the full inventory) live in the files below and are deliberately
//    NOT payout-affecting. They are allowlisted.
//
// Adding a new payout-affecting RNG source must NOT be added here; the
// guard must REMAIN `error` for src/components/games/** excluding the
// allowlist and excluding `*.test.js(x)`. All RNG sources of truth must
// trace to src/utils/fairRng.js#nextRoll.
// ---------------------------------------------------------------------------
const rngAllowVisual = [
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
    // roulette sim-bettor rows (purely atmospheric)
    'src/components/games/roulette/RouletteGame.jsx',
    // poker persona chat + bubble rate (atmospheric; bot equity is bounded)
    'src/components/games/poker/PokerGame.jsx',
    // plinko drop delay jitter (visual; settlement via per-ball map)
    'src/components/games/plinko/PlinkoGame.jsx',
    // chickencross car cadence is visual sim only
    'src/components/games/chickencross/ChickenCrossGame.jsx',
    // fairness-random fallback when crypto is absent (NOT payout path)
    'src/utils/fairRng.js',
    // blackjack hand DOM id (NOT payout path — payout is determined by scoreBlackjackHand)
    'src/components/games/blackjack/blackjackRules.js',
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
    {
        files: ['src/components/games/**/*.{js,jsx}'],
        ignores: [
            'src/**/*.test.js',
            'src/**/*.test.jsx',
            ...rngAllowVisual,
        ],
        rules: {
            'no-restricted-properties': [
                'error',
                {
                    object: 'Math',
                    property: 'random',
                    message:
                        'Math.random is reserved for non-payout visual/sim noise only. Payout paths MUST consume nextRoll() from src/utils/fairRng.js. See eslint.config.js for the narrow allowlist.',
                },
            ],
        },
    },

    // ------ RNG guard override: visual/sim allowlist (off) ----------------
    {
        files: rngAllowVisual,
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
