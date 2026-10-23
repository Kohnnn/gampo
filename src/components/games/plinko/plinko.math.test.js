import { describe, it, expect } from 'vitest'
import { BIN_PAYOUTS, ROW_COUNT_OPTIONS } from './engine/constants'
import { expectedReturn } from './PlinkoGame'

const TARGET_RTP = 0.99
const RTP_TOLERANCE = 0.005
const RISK_LEVELS = ['low', 'medium', 'high']

describe('plinko payout math', () => {
    it('declares a payout for every visible row count and risk level', () => {
        for (const rowCount of ROW_COUNT_OPTIONS) {
            expect(BIN_PAYOUTS[rowCount]).toBeTruthy()
            for (const risk of RISK_LEVELS) {
                expect(BIN_PAYOUTS[rowCount][risk], `${rowCount}/${risk}`).toHaveLength(rowCount + 1)
            }
        }
    })

    it('keeps every row/risk payout table near the documented 99% RTP', () => {
        for (const rowCount of ROW_COUNT_OPTIONS) {
            for (const risk of RISK_LEVELS) {
                const rtp = expectedReturn(BIN_PAYOUTS[rowCount][risk])
                expect(rtp, `${rowCount}/${risk}`).toBeGreaterThanOrEqual(TARGET_RTP - RTP_TOLERANCE)
                expect(rtp, `${rowCount}/${risk}`).toBeLessThanOrEqual(TARGET_RTP + RTP_TOLERANCE)
            }
        }
    })

    it('weights every bin rather than treating the mean as a binary win payoff', () => {
        expect(expectedReturn([4, 0, 0, 0, 4])).toBe(0.5)
        expect(expectedReturn(BIN_PAYOUTS[12].medium)).toBeCloseTo(0.989892578125, 12)
        expect((expectedReturn(BIN_PAYOUTS[12].medium) - 1) * 5).toBeCloseTo(-0.050537109375, 12)
    })
})
