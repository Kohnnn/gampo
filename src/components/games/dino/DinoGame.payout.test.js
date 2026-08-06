// Generated guard for Dino: pins the settle arithmetic against float drift.
// The component is read as source text where the settle body cannot be imported
// in isolation; the mirrors below are kept identical to the real expressions.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { round2 } from '../../../utils/simulationMath'

const TARGET_RTP = 0.99
const lockGrowth = safe => Number((TARGET_RTP / safe).toFixed(4))
const PRESETS = {
    easy: { safe: 0.86 }, medium: { safe: 0.72 }, hard: { safe: 0.58 }, extreme: { safe: 0.42 },
}
const multiplierAt = (safe, steps) => Number(Math.pow(lockGrowth(safe), steps).toFixed(2))

// Mirror of the cashOut body in DinoGame.jsx.
const settle = (stake, m) => {
    const totalReturn = round2(stake * m)
    const profit = round2(totalReturn - stake)
    return { totalReturn, profit }
}

describe('Dino payout rounding', () => {
    it('books a 2dp return and profit for every preset, step and stake', () => {
        for (const { safe } of Object.values(PRESETS)) {
            for (let steps = 1; steps <= 10; steps += 1) {
                const m = multiplierAt(safe, steps)
                for (const stake of [0.01,0.1,0.25,0.5,1,2.5,5,7,12.5,25,33,100,140]) {
                    const { totalReturn, profit } = settle(stake, m)
                    expect(totalReturn).toBe(round2(totalReturn))
                    expect(profit).toBe(round2(profit))
                    expect(round2(profit + stake)).toBe(totalReturn)
                }
            }
        }
    })

    it('corrects a stake/multiplier pair that drifts without rounding', () => {
        const stake = 0.01
        const m = 1.15
        const raw = stake * m
        expect(raw).not.toBe(round2(raw))
        expect(settle(stake, m).totalReturn).toBe(0.01)
    })

    it('credits the same rounded figure it books as profit', () => {
        const { totalReturn, profit } = settle(0.1, multiplierAt(0.42, 3))
        expect(round2(profit + 0.1)).toBe(totalReturn)
    })
})

describe('DinoGame settle source', () => {
    const src = readFileSync(new URL('./DinoGame.jsx', import.meta.url), 'utf8')

    it('rounds the return', () => {
        expect(src).toContain("const totalReturn = round2(stake * m)")
    })

    it('rounds the profit', () => {
        expect(src).toContain("const profit = round2(totalReturn - stake)")
    })

    it('credits the rounded return', () => {
        expect(src).toContain("addWinnings(totalReturn, 'Dino return')")
    })

    it('pins the RTP constant in source', () => {
        expect(src).toContain("const TARGET_RTP = 0.99")
    })

    it('pins the RTP-locked growth derivation', () => {
        expect(src).toContain("const lockGrowth = safe => Number((TARGET_RTP / safe).toFixed(4))")
    })
})

describe('DinoGame component parses', () => {
    it('imports without a syntax error', async () => {
        const mod = await import('./DinoGame.jsx')
        expect(typeof mod.default).toBe('function')
    })
})
