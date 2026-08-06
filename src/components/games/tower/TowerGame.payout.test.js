// Generated guard for Tower: pins the settle arithmetic against float drift.
// The component is read as source text where the settle body cannot be imported
// in isolation; the mirrors below are kept identical to the real expressions.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { round2 } from '../../../utils/simulationMath'

const TOWER_RTP = 0.96
const PRESETS = {
    easy: { safe: 0.85, growth: Number((TOWER_RTP / 0.85).toFixed(4)) },
    medium: { safe: 0.7, growth: Number((TOWER_RTP / 0.7).toFixed(4)) },
    hard: { safe: 0.55, growth: Number((TOWER_RTP / 0.55).toFixed(4)) },
}
const HEIGHT = 8
const multiplierAt = (growth, level) => Number(Math.pow(growth, level).toFixed(2))

// Mirror of the cashout body in TowerGame.jsx.
const settle = (activeBet, multiplier) => {
    const returnAmount = round2(activeBet * multiplier)
    const profit = round2(returnAmount - activeBet)
    return { returnAmount, profit }
}

describe('Tower payout rounding', () => {
    it('books a 2dp return and profit for every preset, level and stake', () => {
        for (const { growth } of Object.values(PRESETS)) {
            for (let level = 1; level <= HEIGHT; level += 1) {
                const m = multiplierAt(growth, level)
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
        const multiplier = 1.13
        const raw = stake * multiplier
        expect(raw).not.toBe(round2(raw))
        expect(settle(stake, multiplier).returnAmount).toBe(0.01)
    })

    it('keeps the RTP-locked growth constants', () => {
        expect(PRESETS.easy.growth).toBe(1.1294)
        expect(PRESETS.medium.growth).toBe(1.3714)
        expect(PRESETS.hard.growth).toBe(1.7455)
    })
})

describe('TowerGame settle source', () => {
    const src = readFileSync(new URL('./TowerGame.jsx', import.meta.url), 'utf8')

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
        expect(src).toContain("const TOWER_RTP = 0.96")
    })

    it('pins the RTP-locked growth derivation', () => {
        expect(src).toContain("easy: { safe: 0.85, growth: Number((TOWER_RTP / 0.85).toFixed(4)), label: 'Easy' }")
    })
})

describe('TowerGame component parses', () => {
    it('imports without a syntax error', async () => {
        const mod = await import('./TowerGame.jsx')
        expect(typeof mod.default).toBe('function')
    })
})
