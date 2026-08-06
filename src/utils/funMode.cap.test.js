import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import {
    setFunMode,
    funBoostedRtp,
    funBoostFactor,
    rtpLockedMultiplier,
    FUN_MAX_RTP,
    FUN_PAYOUT_BOOST,
} from './funMode'

const GAME_RTPS = [
    ['wheel', 0.96],
    ['hilo', 0.96],
    ['rps', 0.97],
    ['diamonds', 0.96],
    ['moles', 0.96],
]

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')

afterAll(() => setFunMode('serious'))

describe('funBoostedRtp / funBoostFactor — FUN_MAX_RTP cap', () => {
    beforeEach(() => setFunMode('serious'))

    it('is a pure no-op when Fun Mode is off', () => {
        for (const [, rtp] of GAME_RTPS) {
            expect(funBoostedRtp(rtp)).toBe(rtp)
            expect(funBoostFactor(rtp)).toBe(1)
        }
    })

    it('never exceeds FUN_MAX_RTP for any shipped game base RTP', () => {
        setFunMode('fun')
        for (const [game, rtp] of GAME_RTPS) {
            expect(funBoostedRtp(rtp), game).toBeLessThanOrEqual(FUN_MAX_RTP)
            expect(rtp * funBoostFactor(rtp), game).toBeLessThanOrEqual(FUN_MAX_RTP + 1e-9)
        }
    })

    it('would exceed 100% without the cap (regression guard)', () => {
        for (const [game, rtp] of GAME_RTPS) {
            expect(rtp * FUN_PAYOUT_BOOST, game).toBeGreaterThan(1)
        }
    })

    it('still boosts in Fun Mode (cap does not disable the feature)', () => {
        setFunMode('fun')
        for (const [game, rtp] of GAME_RTPS) {
            expect(funBoostedRtp(rtp), game).toBeGreaterThan(rtp)
            expect(funBoostFactor(rtp), game).toBeGreaterThan(1)
        }
    })

    it('multiplicative and absolute forms agree exactly', () => {
        setFunMode('fun')
        for (const [game, rtp] of GAME_RTPS) {
            expect(rtp * funBoostFactor(rtp), game).toBeCloseTo(funBoostedRtp(rtp), 12)
        }
    })

    it('applies the raw boost when it stays under the cap', () => {
        setFunMode('fun')
        expect(funBoostedRtp(0.5)).toBeCloseTo(0.5 * FUN_PAYOUT_BOOST, 12)
        expect(funBoostFactor(0.5)).toBeCloseTo(FUN_PAYOUT_BOOST, 12)
    })

    it('handles non-numeric and zero input without NaN', () => {
        setFunMode('fun')
        expect(funBoostedRtp(undefined)).toBe(0)
        expect(funBoostedRtp('nope')).toBe(0)
        expect(funBoostFactor(0)).toBe(1)
        expect(funBoostFactor(undefined)).toBe(1)
    })

    it('leaves RTP above the Fun Mode cap untouched in serious mode', () => {
        setFunMode('serious')
        expect(funBoostFactor(1.5)).toBe(1)
        expect(funBoostedRtp(1.5)).toBe(1.5)
    })

    it('rtpLockedMultiplier keeps its capped behaviour after refactor', () => {
        setFunMode('fun')
        expect(rtpLockedMultiplier(0.5, 0.96)).toBe(2)
        setFunMode('serious')
        expect(rtpLockedMultiplier(0.5, 0.96)).toBe(1.92)
    })
})

describe('source pins — games must route through the capped helper', () => {
    const CASES = [
        ['wheel', '../components/games/wheel/WheelGame.jsx', 'funBoostedRtp'],
        ['hilo', '../components/games/hilo/HiloGame.jsx', 'funBoostedRtp'],
        ['rps', '../components/games/rps/RpsGame.jsx', 'funBoostedRtp'],
        ['diamonds', '../components/games/diamonds/DiamondsGame.jsx', 'funBoostFactor'],
        ['moles', '../components/games/moles/MolesGame.jsx', 'funBoostFactor'],
    ]

    it.each(CASES)('%s imports and uses the capped helper', (game, path, helper) => {
        const src = read(path)
        expect(src).toContain(`${helper} }`)
        expect(src).toContain(`${helper}(`)
    })

    it.each(CASES)('%s no longer multiplies RTP by the raw boost', (game, path) => {
        const src = read(path)
        expect(src).not.toMatch(/_RTP\s*\*\s*FUN_PAYOUT_BOOST/)
        expect(src).not.toMatch(/isFunMode\(\)\s*\?\s*FUN_PAYOUT_BOOST\s*:\s*1/)
    })

    it.each(CASES)('%s exposes effective RTP to both shared stat surfaces', (game, path) => {
        const src = read(path)
        expect(src).toContain('effectiveRtp={effectiveRtp}')
        expect(src.match(/effectiveRtp=\{effectiveRtp\}/g)).toHaveLength(2)
    })

    it('the cap is applied inside funMode.js, not at call sites', () => {
        const src = read('./funMode.js')
        expect(src).toContain('Math.min(FUN_MAX_RTP, base * FUN_PAYOUT_BOOST)')
        expect(src).toContain('export function funBoostedRtp(rtp)')
        expect(src).toContain('export function funBoostFactor(baseRtp)')
    })
})
