// Import smoke test for the five games hardened in the final batch.
//
// The settle/timer tests read each component as *text*, so a file that no longer
// parses would still pass them. This test actually imports every touched module,
// which fails on a syntax error, a bad import specifier, or a missing export.
// No DOM is needed — importing is enough to catch the failure modes those
// text-based tests are blind to.

import { describe, expect, it } from 'vitest'

const modules = {
    'sicbo/SicBoGame.jsx': () => import('./sicbo/SicBoGame.jsx'),
    'war/CasinoWarGame.jsx': () => import('./war/CasinoWarGame.jsx'),
    'cases/CasesGame.jsx': () => import('./cases/CasesGame.jsx'),
    'blackjack/BlackjackGame.jsx': () => import('./blackjack/BlackjackGame.jsx'),
    'poker/PokerGame.jsx': () => import('./poker/PokerGame.jsx'),
}

describe('hardened games import cleanly', () => {
    for (const [name, load] of Object.entries(modules)) {
        it(`${name} parses and exports a component`, async () => {
            const mod = await load()
            expect(typeof mod.default).toBe('function')
        })
    }
})

describe('scheduling helpers are importable and shaped correctly', () => {
    it('exposes both cancellable hooks and withTimeout', async () => {
        const mod = await import('../../utils/scheduling.js')
        expect(typeof mod.useCancellableTimeouts).toBe('function')
        expect(typeof mod.useCancellableFrames).toBe('function')
        expect(typeof mod.withTimeout).toBe('function')
    })

    it('exposes round2 from simulationMath', async () => {
        const mod = await import('../../utils/simulationMath.js')
        expect(typeof mod.round2).toBe('function')
        expect(mod.round2(0.03 * 11)).toBe(0.33)
        expect(mod.round2(0.07 * 181)).toBe(12.67)
    })
})
