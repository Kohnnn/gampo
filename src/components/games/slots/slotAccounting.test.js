import { describe, expect, it } from 'vitest'
import { applyFreeSpinAward, shouldStopAutoplay } from './slotAccounting'

describe('applyFreeSpinAward', () => {
    it('caps an initial raw award at the session limit', () => {
        expect(applyFreeSpinAward(null, 24)).toBe(20)
    })

    it('preserves allowance by total awarded, not spins played', () => {
        const session = { totalAwarded: 12, played: 11 }
        expect(applyFreeSpinAward(session, 12)).toBe(8)
        expect(applyFreeSpinAward({ totalAwarded: 18, played: 1 }, 12)).toBe(2)
        expect(applyFreeSpinAward({ ...session, totalAwarded: 20 }, 12)).toBe(0)
    })

    it('reproduces the archived capped award trace', () => {
        const initial = applyFreeSpinAward(null, 12)
        const retrigger = applyFreeSpinAward({ totalAwarded: initial, played: 1 }, 12)
        const totalAwarded = initial + retrigger

        expect([initial, retrigger, totalAwarded]).toEqual([12, 8, 20])
        expect(applyFreeSpinAward({ totalAwarded, played: 1 }, 12)).toBe(0)
    })
})

describe('shouldStopAutoplay', () => {
    const disabledStops = {
        stopOnFeature: false,
        stopOnBigWin: false,
        stopOnLoss: false,
        stopOnGain: false,
        stopOnLossAbs: false,
        stopOnGainAbs: false,
        stopOnSingleWin: false,
    }

    it('uses settled balance for percentage and absolute monetary stops', () => {
        expect(shouldStopAutoplay({
            baseline: 100,
            settledBalance: 70,
            outcome: { profit: -30 },
            stops: { ...disabledStops, stopOnLoss: true, lossPercent: 30 },
        })).toBe(true)
        expect(shouldStopAutoplay({
            baseline: 100,
            settledBalance: 150,
            outcome: { profit: 50 },
            stops: { ...disabledStops, stopOnGain: true, gainPercent: 50 },
        })).toBe(true)
        expect(shouldStopAutoplay({
            baseline: 100,
            settledBalance: 90,
            outcome: { profit: -10 },
            stops: { ...disabledStops, stopOnLossAbs: true, lossAbs: 10 },
        })).toBe(true)
        expect(shouldStopAutoplay({
            baseline: 100,
            settledBalance: 115,
            outcome: { profit: 15 },
            stops: { ...disabledStops, stopOnGainAbs: true, gainAbs: 15 },
        })).toBe(true)
    })

    it('keeps feature, big-win, and single-win stops unchanged', () => {
        expect(shouldStopAutoplay({
            baseline: 100,
            settledBalance: 100,
            outcome: { profit: 0, featureEvents: [{ type: 'free-spins' }], multiplier: 0 },
            stops: { ...disabledStops, stopOnFeature: true },
        })).toBe(true)
        expect(shouldStopAutoplay({
            baseline: 100,
            settledBalance: 100,
            outcome: { profit: 0, featureEvents: [], multiplier: 10 },
            stops: { ...disabledStops, stopOnBigWin: true, bigWinThreshold: 10 },
        })).toBe(true)
        expect(shouldStopAutoplay({
            baseline: 100,
            settledBalance: 100,
            outcome: { profit: 25, featureEvents: [], multiplier: 0 },
            stops: { ...disabledStops, stopOnSingleWin: true, singleWinAbs: 25 },
        })).toBe(true)
    })

    it('does not stop when no configured condition is met', () => {
        expect(shouldStopAutoplay({
            baseline: 100,
            settledBalance: 105,
            outcome: { profit: 5, featureEvents: [], multiplier: 1 },
            stops: { ...disabledStops, stopOnGain: true, gainPercent: 10 },
        })).toBe(false)
    })
})
