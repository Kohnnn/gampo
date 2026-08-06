// Generated guard for Mines: pins the settle arithmetic against float drift.
// The component is read as source text where the settle body cannot be imported
// in isolation; the mirrors below are kept identical to the real expressions.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { round2 } from '../../../utils/simulationMath'

const GRID = 25
const HOUSE_EDGE = 0.01

// Mirror of multiplierFor in MinesGame.jsx.
function multiplierFor(picks, bombs) {
    if (picks <= 0) return 1
    let m = 1
    for (let i = 0; i < picks; i++) m *= (GRID - i) / (GRID - bombs - i)
    return Number((m * (1 - HOUSE_EDGE)).toFixed(4))
}

// Mirror of both settle bodies (auto cashout and manual cashOut).
const settle = (stake, m) => {
    const totalReturn = round2(stake * m)
    const profit = round2(totalReturn - stake)
    return { totalReturn, profit }
}

describe('Mines payout rounding', () => {
    it('books a 2dp return and profit across the bomb/pick grid', () => {
        for (let bombs = 1; bombs <= 12; bombs += 1) {
            for (let picks = 1; picks <= Math.min(6, GRID - bombs); picks += 1) {
                const m = multiplierFor(picks, bombs)
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
        const m = 1.0313
        const raw = stake * m
        expect(raw).not.toBe(round2(raw))
        expect(settle(stake, m).totalReturn).toBe(0.01)
    })

    it('carries the house edge in the multiplier', () => {
        expect(multiplierFor(0, 3)).toBe(1)
        expect(multiplierFor(1, 3)).toBe(1.125)
        expect(multiplierFor(3, 5)).toBe(1.9974)
    })
})

describe('MinesGame settle source', () => {
    const src = readFileSync(new URL('./MinesGame.jsx', import.meta.url), 'utf8')

    it('rounds the auto-cashout return', () => {
        expect(src).toContain("const totalReturn = round2(betAmount * m)")
    })

    it('rounds the manual cashout return', () => {
        expect(src).toContain("const totalReturn = round2(stake * m)")
    })

    it('credits the rounded auto return', () => {
        expect(src).toContain("addWinnings(totalReturn, 'Mines auto return')")
    })

    it('credits the rounded manual return', () => {
        expect(src).toContain("addWinnings(totalReturn, 'Mines return')")
    })

    it('pins the house edge in source', () => {
        expect(src).toContain("const HOUSE_EDGE = 0.01")
    })

    it('applies the house edge to the multiplier', () => {
        expect(src).toContain("return Number((m * (1 - HOUSE_EDGE)).toFixed(4))")
    })

    it('rounds the auto-cashout profit', () => {
        expect(src).toContain("const profit = round2(totalReturn - betAmount)")
    })

    it('rounds the manual cashout profit', () => {
        expect(src).toContain("const profit = round2(totalReturn - stake)")
    })
})

describe('MinesGame component parses', () => {
    it('imports without a syntax error', async () => {
        const mod = await import('./MinesGame.jsx')
        expect(typeof mod.default).toBe('function')
    })
})
