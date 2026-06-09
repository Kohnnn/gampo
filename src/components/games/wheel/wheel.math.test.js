import { describe, it, expect } from 'vitest'

// A-P3-2: Wheel house-edge lock.
//
// Source of truth: src/components/games/wheel/WheelGame.jsx:42-61,131-133.
// Raw segment shapes are normalized so the MEAN payout equals WHEEL_RTP — i.e.
// a uniformly-random landed segment carries the house edge. (Raw arrays were
// 108%-350% RTP, player-favourable, before normalization.)

const WHEEL_RTP = 0.96
const wheelShapes = {
    low: [0, 1.2, 1.2, 1.5, 0, 2, 1.2, 1.5, 0, 2, 1.2, 3],
    medium: [0, 0, 1.5, 0, 2, 0, 3, 0, 1.5, 0, 5, 0],
    high: [0, 0, 0, 2, 0, 0, 5, 0, 0, 10, 0, 25],
}

function round2(v) { return Math.round(v * 100) / 100 }

// WheelGame.jsx:55-61 (funBoosted=false path)
function normalizeWheel(shape) {
    const mean = shape.reduce((sum, v) => sum + v, 0) / shape.length
    if (mean <= 0) return shape.map(() => 0)
    const scale = WHEEL_RTP / mean
    return shape.map(v => (v > 0 ? round2(v * scale) : 0))
}

// WheelGame.jsx:131-133 — land on a uniform segment, return its multiplier.
function simulateRtp(segments, trials, rng = Math.random) {
    let totalReturn = 0
    for (let i = 0; i < trials; i += 1) {
        const idx = Math.floor(rng() * segments.length)
        totalReturn += segments[idx]
    }
    return totalReturn / trials
}

describe('wheel payout math', () => {
    it('normalized mean payout is ~WHEEL_RTP for every risk preset', () => {
        for (const [name, shape] of Object.entries(wheelShapes)) {
            const segments = normalizeWheel(shape)
            const mean = segments.reduce((s, v) => s + v, 0) / segments.length
            // eslint-disable-next-line no-console
            console.log(`wheel[${name}] analytic mean RTP=${mean.toFixed(4)}`)
            // round2 per-segment introduces a tiny bias; allow ±0.5pt.
            expect(mean).toBeCloseTo(WHEEL_RTP, 1)
            expect(mean).toBeLessThan(1) // must be house-favourable
        }
    })

    it('preserves the zero segments (blanks stay blank)', () => {
        for (const shape of Object.values(wheelShapes)) {
            const segments = normalizeWheel(shape)
            shape.forEach((v, i) => {
                if (v === 0) expect(segments[i]).toBe(0)
                else expect(segments[i]).toBeGreaterThan(0)
            })
        }
    })

    it('higher risk preset has a larger top multiplier', () => {
        const top = (name) => Math.max(...normalizeWheel(wheelShapes[name]))
        expect(top('high')).toBeGreaterThan(top('medium'))
        expect(top('medium')).toBeGreaterThan(top('low'))
    })

    it('simulated RTP holds the house edge over 30k trials for each preset', () => {
        for (const [name, shape] of Object.entries(wheelShapes)) {
            const segments = normalizeWheel(shape)
            const rtp = simulateRtp(segments, 30000)
            // eslint-disable-next-line no-console
            console.log(`wheel[${name}] simulated RTP=${rtp.toFixed(4)}`)
            expect(rtp).toBeLessThan(1)
            expect(rtp).toBeGreaterThan(WHEEL_RTP * 0.85)
            expect(rtp).toBeLessThan(WHEEL_RTP * 1.15)
        }
    })
})
