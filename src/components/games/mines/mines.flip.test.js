import { describe, it, expect } from 'vitest'

import { multiplierFor } from './MinesGame'

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

    it('returns null instead of Infinity when picks exceed safe cells', () => {
        expect(multiplierFor(2, 24)).toBeNull()
        expect(multiplierFor(1, 24)).toBe(24.75)
    })
})
