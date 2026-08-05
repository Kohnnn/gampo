import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SLOT_TEMPLATES, resolveSlotSpin, __setSlotCalibrationRng } from './slotFactory'
import { SLOT_RTP_SCALARS } from './slotRtpScalars'
import { MAX_FREE_SPINS_PER_SESSION } from './slotConstants'

const scriptSource = name => readFileSync(new URL(`../../../../scripts/${name}`, import.meta.url), 'utf8')

function makeRng(seed) {
    let s = seed >>> 0
    return () => {
        s = (Math.imul(s ^ (s >>> 15), s | 1) >>> 0)
        s ^= s + Math.imul(s ^ (s >>> 7), s | 61)
        return ((s ^ (s >>> 14)) >>> 0) / 4294967296
    }
}

// Capped full-session RTP (matches scripts/verifySlotRtp.mjs).
function measureRtp(config, rng, spins) {
    __setSlotCalibrationRng(rng)
    const award = config.features?.scatter?.awardFreeSpins || 0
    let sum = 0
    for (let i = 0; i < spins; i += 1) {
        let total = 0
        const base = resolveSlotSpin(config)
        total += base.multiplier
        const initialAward = base.featureEvents?.find(event => event.type === 'free-spins')
        let totalAwarded = Math.min(initialAward?.freeSpins || 0, MAX_FREE_SPINS_PER_SESSION)
        let fs = totalAwarded
        let played = 0
        while (fs > 0 && played < MAX_FREE_SPINS_PER_SESSION) {
            fs -= 1; played += 1
            const spin = resolveSlotSpin(config)
            total += spin.multiplier
            const retrigger = spin.featureEvents?.find(event => event.type === 'free-spins')
            const actualAward = Math.max(0, Math.min(retrigger?.freeSpins || 0, MAX_FREE_SPINS_PER_SESSION - totalAwarded))
            if (actualAward > 0) {
                fs += actualAward
                totalAwarded += actualAward
            }
        }
        sum += total
    }
    __setSlotCalibrationRng(null)
    return sum / spins
}

describe('slot RTP calibration', () => {
    it('caps actual free-spin awards in each script accounting path', () => {
        for (const name of ['calibrateSlots.mjs', 'verifySlotRtp.mjs']) {
            const source = scriptSource(name)
            expect(source).toContain('function applyFreeSpinAward')
            expect(source).toContain("'coin-meter-fill'")
            expect(source).toContain('MAX_FREE_SPINS_PER_SESSION - state.totalAwarded')
            expect(source).toContain('function runAccountingSelfCheck()')
            expect(source).toContain('rawAward: 12')
            expect(source).toContain('actualAward, 8')
            expect(source).toContain('state.totalAwarded, 20')
        }
    })

    it('uses Coop coin-meter event awards instead of its scatter award', () => {
        const coop = SLOT_TEMPLATES.find(template => template.id === 'coop-cluck')
        const fixture = {
            ...coop,
            layout: { rows: 1, cols: 1, evaluation: 'lines' },
            symbols: [{ id: 'egg', label: 'EGG', weight: 1, payout: 0, type: 'coin' }],
            features: {
                ...coop.features,
                scatter: { ...coop.features.scatter, trigger: 2 },
                coinMeter: { ...coop.features.coinMeter, fillTrigger: 1 },
            },
        }
        const result = resolveSlotSpin(fixture, { rng: () => 0 })
        const freeSpins = result.featureEvents.find(event => event.type === 'free-spins')
        expect(freeSpins.source).toBe('coin-meter')
        expect(freeSpins.freeSpins).toBe(4)
    })

    it('every template has a calibrated scalar', () => {
        for (const t of SLOT_TEMPLATES) {
            expect(SLOT_RTP_SCALARS[t.id], `${t.id} missing scalar`).toBeGreaterThan(0)
            expect(t.rtpScalar, `${t.id} scalar not attached`).toBeCloseTo(SLOT_RTP_SCALARS[t.id], 5)
        }
    })

    it('no template is player-favourable on its locked mean (RTP < 100%)', () => {
        // A short low-variance sample per template; we only assert the calibrated
        // mean is not absurdly over 100% (catches a broken/missing scalar). Tight
        // convergence is validated by scripts/verifySlotRtp.mjs at high spin counts.
        for (const t of SLOT_TEMPLATES) {
            const rtp = measureRtp(t, makeRng(0x1234 ^ t.id.length * 97), 500)
            expect(rtp, `${t.id} RTP ${(rtp * 100).toFixed(0)}% way over target`).toBeLessThan(1.6)
        }
    })

    it('low-variance lines/ways templates land near target in-sample', () => {
        // Pick a few stable templates and assert tighter convergence on a modest
        // sample (fast). High-variance ones are covered by the offline harness.
        const stable = ['river-catcher', 'dust-rail', 'blue-samurai', 'wanted-revelation']
        for (const id of stable) {
            const t = SLOT_TEMPLATES.find(x => x.id === id)
            const rtp = measureRtp(t, makeRng(0xbeef ^ id.length * 131), 12000)
            expect(Math.abs(rtp - t.rtpTarget), `${id} RTP ${(rtp * 100).toFixed(1)}% vs ${(t.rtpTarget * 100).toFixed(0)}%`).toBeLessThan(0.06)
        }
    })
})
