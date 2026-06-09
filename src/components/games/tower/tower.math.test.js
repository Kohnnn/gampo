import { describe, it, expect } from 'vitest'

// A-P3-2: Tower house-edge lock.
//
// Source of truth: src/components/games/tower/TowerGame.jsx:30-37,66.
// Per-step EV = safe × growth = TOWER_RTP, so each climb carries the house edge
// regardless of preset. Multiplier at level L = growth^L.

const TOWER_RTP = 0.96
const RISK = {
    easy: { safe: 0.85, growth: Number((TOWER_RTP / 0.85).toFixed(4)) },
    medium: { safe: 0.7, growth: Number((TOWER_RTP / 0.7).toFixed(4)) },
    hard: { safe: 0.55, growth: Number((TOWER_RTP / 0.55).toFixed(4)) },
}

// TowerGame.jsx:66
function multiplierAtLevel(growth, level) {
    return Number(Math.pow(growth, level).toFixed(2))
}

// EV of stopping at a chosen level: P(reach) × multiplier = safe^L × growth^L.
function evAtLevel(cfg, level) {
    return Math.pow(cfg.safe, level) * Math.pow(cfg.growth, level)
}

// Monte-Carlo: a bettor that always targets `targetLevel` then cashes.
function simulateRtp(cfg, targetLevel, trials, rng = Math.random) {
    let totalReturn = 0
    for (let i = 0; i < trials; i += 1) {
        let level = 0
        let alive = true
        while (alive && level < targetLevel) {
            if (rng() < cfg.safe) level += 1
            else alive = false
        }
        if (alive) totalReturn += multiplierAtLevel(cfg.growth, targetLevel)
    }
    return totalReturn / trials
}

describe('tower payout math', () => {
    it('starts at 1× before any climb', () => {
        expect(multiplierAtLevel(RISK.medium.growth, 0)).toBe(1)
    })

    it('multiplier is monotonic in level for each preset', () => {
        for (const cfg of Object.values(RISK)) {
            let prev = 0
            for (let l = 0; l <= 8; l += 1) {
                const m = multiplierAtLevel(cfg.growth, l)
                expect(m).toBeGreaterThanOrEqual(prev)
                prev = m
            }
        }
    })

    it('harder presets grow faster per level', () => {
        expect(RISK.hard.growth).toBeGreaterThan(RISK.medium.growth)
        expect(RISK.medium.growth).toBeGreaterThan(RISK.easy.growth)
    })

    it('per-step EV equals TOWER_RTP for every preset (house edge baked in)', () => {
        for (const cfg of Object.values(RISK)) {
            expect(cfg.safe * cfg.growth).toBeCloseTo(TOWER_RTP, 3)
        }
    })

    it('analytic EV of any target level is ~RTP^level (always ≤ 1, never +EV)', () => {
        for (const cfg of Object.values(RISK)) {
            for (let l = 1; l <= 6; l += 1) {
                const ev = evAtLevel(cfg, l)
                expect(ev).toBeCloseTo(Math.pow(TOWER_RTP, l), 2)
                expect(ev).toBeLessThan(1)
            }
        }
    })

    it('simulated RTP holds the house edge over 20k trials', () => {
        for (const [name, cfg] of Object.entries(RISK)) {
            const target = 3
            const rtp = simulateRtp(cfg, target, 20000)
            const expected = Math.pow(TOWER_RTP, target)
            // eslint-disable-next-line no-console
            console.log(`tower[${name}] target=${target} RTP=${rtp.toFixed(4)} (expected ~${expected.toFixed(4)})`)
            expect(rtp).toBeLessThan(1)
            expect(rtp).toBeGreaterThan(expected * 0.85)
            expect(rtp).toBeLessThan(expected * 1.15)
        }
    })
})
