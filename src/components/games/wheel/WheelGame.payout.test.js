// Generated guard for Wheel: pins the settle arithmetic against float drift.
// The component is read as source text where the settle body cannot be imported
// in isolation; the mirrors below are kept identical to the real expressions.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { round2 } from '../../../utils/simulationMath'

const WHEEL_RTP = 0.96
const wheelShapes = {
    low: [0, 1.2, 1.2, 1.5, 0, 2, 1.2, 1.5, 0, 2, 1.2, 3],
    medium: [0, 0, 1.5, 0, 2, 0, 3, 0, 1.5, 0, 5, 0],
    high: [0, 0, 0, 2, 0, 0, 5, 0, 0, 10, 0, 25],
}

// Mirror of normalizeWheel in WheelGame.jsx.
function normalizeWheel(shape) {
    const mean = shape.reduce((sum, v) => sum + v, 0) / shape.length
    if (mean <= 0) return shape.map(() => 0)
    const scale = WHEEL_RTP / mean
    return shape.map(v => (v > 0 ? round2(v * scale) : 0))
}

// Mirror of the settle body in WheelGame.jsx.
const settle = (betAmount, multiplier) => {
    const returnAmount = round2(betAmount * multiplier)
    const profit = round2(returnAmount - betAmount)
    return { returnAmount, profit }
}

describe('Wheel payout rounding', () => {
    it('books a 2dp return and profit for every segment and stake', () => {
        for (const shape of Object.values(wheelShapes)) {
            for (const multiplier of normalizeWheel(shape)) {
                for (const stake of [0.01,0.1,0.25,0.5,1,2.5,5,7,12.5,25,33,100,140]) {
                    const { returnAmount, profit } = settle(stake, multiplier)
                    expect(returnAmount).toBe(round2(returnAmount))
                    expect(profit).toBe(round2(profit))
                    expect(round2(profit + stake)).toBe(returnAmount)
                }
            }
        }
    })

    it('corrects a stake/segment pair that drifts without rounding', () => {
        const stake = 0.01
        const multiplier = 0.93
        const raw = stake * multiplier
        expect(raw).not.toBe(round2(raw))
        expect(settle(stake, multiplier).returnAmount).toBe(0.01)
    })

    it('normalizes each shape to the target RTP', () => {
        for (const shape of Object.values(wheelShapes)) {
            const segs = normalizeWheel(shape)
            const mean = segs.reduce((s, v) => s + v, 0) / segs.length
            expect(Math.abs(mean - WHEEL_RTP)).toBeLessThan(0.02)
        }
    })

    it('produces the expected normalized segments', () => {
        expect(normalizeWheel(wheelShapes.low)).toEqual([0,0.93,0.93,1.17,0,1.56,0.93,1.17,0,1.56,0.93,2.34])
        expect(normalizeWheel(wheelShapes.high)).toEqual([0,0,0,0.55,0,0,1.37,0,0,2.74,0,6.86])
    })
})

describe('WheelGame settle source', () => {
    const src = readFileSync(new URL('./WheelGame.jsx', import.meta.url), 'utf8')

    it('rounds the return', () => {
        expect(src).toContain("const returnAmount = round2(betAmount * multiplier)")
    })

    it('rounds the profit', () => {
        expect(src).toContain("const profit = round2(returnAmount - betAmount)")
    })

    it('pins the RTP constant in source', () => {
        expect(src).toContain("const WHEEL_RTP = 0.96")
    })

    it('normalizes the segments to the target RTP', () => {
        expect(src).toContain("return shape.map(v => (v > 0 ? round2(v * scale) : 0))")
    })
})

describe('WheelGame component parses', () => {
    it('imports without a syntax error', async () => {
        const mod = await import('./WheelGame.jsx')
        expect(typeof mod.default).toBe('function')
    })
})
