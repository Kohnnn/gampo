// Generated guard for Chicken Cross: pins the settle arithmetic against float drift.
// The component is read as source text where the settle body cannot be imported
// in isolation; the mirrors below are kept identical to the real expressions.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { round2 } from '../../../utils/simulationMath'

const CHICKEN_RTP = 0.98
const PRESETS = {
    easy: { safe: 0.85, growth: Number((CHICKEN_RTP / 0.85).toFixed(4)) },
    medium: { safe: 0.72, growth: Number((CHICKEN_RTP / 0.72).toFixed(4)) },
    hard: { safe: 0.58, growth: Number((CHICKEN_RTP / 0.58).toFixed(4)) },
}
const LANES = 12
const multiplierAt = (growth, lane) => Number(Math.pow(growth, lane).toFixed(2))

// Mirror of the cashout body in ChickenCrossGame.jsx.
const settle = (activeBet, multiplier) => {
    const returnAmount = round2(activeBet * multiplier)
    const profit = round2(returnAmount - activeBet)
    return { returnAmount, profit }
}

describe('Chicken Cross payout rounding', () => {
    it('books a 2dp return and profit for every preset, lane and stake', () => {
        for (const { growth } of Object.values(PRESETS)) {
            for (let lane = 1; lane <= LANES; lane += 1) {
                const m = multiplierAt(growth, lane)
                for (const stake of [0.01,0.1,0.25,0.5,1,2.5,5,7,12.5,25,33,100,140]) {
                    const { returnAmount, profit } = settle(stake, m)
                    expect(returnAmount).toBe(round2(returnAmount))
                    expect(profit).toBe(round2(profit))
                    expect(round2(profit + stake)).toBe(returnAmount)
                }
            }
        }
    })

    it('corrects a stake/multiplier pair that drifts without rounding', () => {
        const stake = 0.01
        const multiplier = 1.15
        const raw = stake * multiplier
        expect(raw).not.toBe(round2(raw))
        expect(settle(stake, multiplier).returnAmount).toBe(0.01)
    })

    it('keeps the RTP-locked growth constants', () => {
        expect(PRESETS.easy.growth).toBe(1.1529)
        expect(PRESETS.medium.growth).toBe(1.3611)
        expect(PRESETS.hard.growth).toBe(1.6897)
    })
})

describe('ChickenCrossGame settle source', () => {
    const src = readFileSync(new URL('./ChickenCrossGame.jsx', import.meta.url), 'utf8')

    it('rounds the return', () => {
        expect(src).toContain("const returnAmount = round2(activeBet * multiplier)")
    })

    it('rounds the profit', () => {
        expect(src).toContain("const profit = round2(returnAmount - activeBet)")
    })

    it('cancels its timers', () => {
        expect(src).toContain("const { schedule, cancelAll } = useCancellableTimeouts()")
    })

    it('pins the RTP constant in source', () => {
        expect(src).toContain("const CHICKEN_RTP = 0.98")
    })

    it('pins the RTP-locked growth derivation', () => {
        expect(src).toContain("easy: { safe: 0.85, growth: Number((CHICKEN_RTP / 0.85).toFixed(4)), label: 'Easy' }")
    })
})

describe('ChickenCrossGame component parses', () => {
    it('imports without a syntax error', async () => {
        const mod = await import('./ChickenCrossGame.jsx')
        expect(typeof mod.default).toBe('function')
    })
})
