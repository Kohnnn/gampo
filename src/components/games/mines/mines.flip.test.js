import { describe, it, expect } from 'vitest'

// Mines payout = (C(N, k)) / (C(N - bombs, k)) * (1 - house edge) where N=25.
// Replicates the formula in MinesGame.jsx so the multiplier ladder stays sane.

const GRID = 25
const HOUSE_EDGE = 0.01

function multiplierFor(picks, bombs) {
    if (picks <= 0) return 1
    let m = 1
    for (let i = 0; i < picks; i++) {
        m *= (GRID - i) / (GRID - bombs - i)
    }
    return Number((m * (1 - HOUSE_EDGE)).toFixed(4))
}

describe('mines multiplier ladder', () => {
    it('stays at ~1× before any picks', () => {
        expect(multiplierFor(0, 3)).toBe(1)
    })

    it('is strictly monotonic in picks for a fixed bomb count', () => {
        let prev = 0
        for (let k = 0; k <= 10; k++) {
            const m = multiplierFor(k, 3)
            expect(m).toBeGreaterThan(prev)
            prev = m
        }
    })

    it('grows faster with more bombs', () => {
        const a = multiplierFor(3, 3)
        const b = multiplierFor(3, 8)
        const c = multiplierFor(3, 15)
        expect(b).toBeGreaterThan(a)
        expect(c).toBeGreaterThan(b)
    })

    it('respects the 1% house edge for k=1', () => {
        // With 1 bomb and 1 pick, fair multiplier is 25/24. With 1% edge it
        // must drop just below that.
        const fair = 25 / 24
        const m = multiplierFor(1, 1)
        expect(m).toBeLessThan(fair)
        expect(m).toBeGreaterThan(fair * 0.985)
    })
})
