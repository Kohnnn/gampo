import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { BIN_PAYOUTS, ROW_COUNT_OPTIONS } from './engine/constants'

const TARGET_RTP = 0.99
const RTP_TOLERANCE = 0.005
const RISK_LEVELS = ['low', 'medium', 'high']
const source = readFileSync(new URL('./PlinkoGame.jsx', import.meta.url), 'utf8')

function binomialCoefficient(n, k) {
    let coeff = 1
    for (let j = 1; j <= k; j += 1) coeff *= (n - j + 1) / j
    return coeff
}

function expectedPlinkoRtp(payouts) {
    const rows = payouts.length - 1
    return payouts.reduce((total, multiplier, bin) => {
        const probability = binomialCoefficient(rows, bin) / (2 ** rows)
        return total + probability * multiplier
    }, 0)
}

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
                const rtp = expectedPlinkoRtp(BIN_PAYOUTS[rowCount][risk])
                expect(rtp, `${rowCount}/${risk}`).toBeGreaterThanOrEqual(TARGET_RTP - RTP_TOLERANCE)
                expect(rtp, `${rowCount}/${risk}`).toBeLessThanOrEqual(TARGET_RTP + RTP_TOLERANCE)
            }
        }
    })

    it('does not apply a second house edge after selecting a payout-table bin', () => {
        expect(source).toContain('const mult = Number((rawMult * ball.bonus).toFixed(4))')
        expect(source).not.toContain('const HOUSE_EDGE = 0.01')
        expect(source).not.toMatch(/rawMult\s*\*\s*ball\.bonus\s*\*\s*\(1\s*-\s*HOUSE_EDGE\)/)
    })
})
