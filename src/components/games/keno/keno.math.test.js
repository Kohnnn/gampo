import { describe, it, expect } from 'vitest'
import { kenoPayout } from '../../../utils/simulationMath'

// A-P3-2: Keno house-edge lock.
//
// Source of truth: src/utils/simulationMath.js:128-182 (kenoPayout) and
// KenoGame.jsx:105-107. Engine draws 10 of 40 balls; each pick-row's paytable
// is pre-scaled so Σ P(hits)·payout(hits) == KENO_RTP (0.92) under the true
// hypergeometric distribution. We import kenoPayout (the real engine fn) and
// simulate the draw to confirm realized RTP matches.

const KENO_N = 40
const KENO_DRAWN = 10
const KENO_RTP_TARGET = 0.92

// Hypergeometric simulation: player picks `picks` of 40, engine draws 10 of 40,
// hits = overlap. Independent reservoir-style sampling of the drawn balls.
function drawHits(picks, rng = Math.random) {
    const pool = Array.from({ length: KENO_N }, (_, i) => i)
    // Player picks: first `picks` numbers (any fixed set works by symmetry).
    const playerSet = new Set(pool.slice(0, picks))
    // Fisher-Yates partial shuffle for the first KENO_DRAWN positions.
    for (let i = 0; i < KENO_DRAWN; i += 1) {
        const j = i + Math.floor(rng() * (KENO_N - i))
        const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp
    }
    let hits = 0
    for (let i = 0; i < KENO_DRAWN; i += 1) if (playerSet.has(pool[i])) hits += 1
    return hits
}

function simulateRtp(picks, trials, rng = Math.random) {
    let totalReturn = 0
    for (let i = 0; i < trials; i += 1) {
        totalReturn += kenoPayout(picks, drawHits(picks, rng))
    }
    return totalReturn / trials
}

// Analytic RTP via hypergeometric probabilities (mirrors the pre-scaling math).
function logFactorial(n) { let a = 0; for (let i = 2; i <= n; i += 1) a += Math.log(i); return a }
function logChoose(n, k) { if (k < 0 || k > n) return -Infinity; return logFactorial(n) - logFactorial(k) - logFactorial(n - k) }
function hitProb(picks, hits) {
    const v = Math.exp(logChoose(picks, hits) + logChoose(KENO_N - picks, KENO_DRAWN - hits) - logChoose(KENO_N, KENO_DRAWN))
    return Number.isFinite(v) ? v : 0
}
function analyticRtp(picks) {
    let rtp = 0
    for (let h = 0; h <= picks; h += 1) rtp += hitProb(picks, h) * kenoPayout(picks, h)
    return rtp
}

describe('keno payout math', () => {
    it('pays more for more hits at a fixed pick count (monotonic in hits)', () => {
        for (const picks of [5, 8, 10]) {
            let prevNonzero = 0
            for (let h = 0; h <= picks; h += 1) {
                const pay = kenoPayout(picks, h)
                if (pay > 0) {
                    expect(pay).toBeGreaterThanOrEqual(prevNonzero)
                    prevNonzero = pay
                }
            }
        }
    })

    it('analytic RTP equals ~0.92 for every pick count (house edge locked)', () => {
        for (let picks = 1; picks <= 10; picks += 1) {
            const rtp = analyticRtp(picks)
            // eslint-disable-next-line no-console
            console.log(`keno picks=${picks} analytic RTP=${rtp.toFixed(4)}`)
            expect(rtp).toBeCloseTo(KENO_RTP_TARGET, 2)
            expect(rtp).toBeLessThan(1) // house-favourable
        }
    })

    it('simulated RTP matches the target over 30k trials', () => {
        // Deterministic seeded RNG (mulberry32) so this convergence check is
        // stable run-to-run. Keno's top-pick payouts are extremely tail-heavy,
        // so unseeded Math.random can spike a single run well above the mean;
        // the analytic test above is the exact house-edge lock (RTP=0.92).
        const mulberry32 = (seed) => () => {
            seed |= 0; seed = (seed + 0x6D2B79F5) | 0
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
        for (const picks of [3, 6, 10]) {
            const rng = mulberry32(0x5eed * (picks + 1))
            const rtp = simulateRtp(picks, 30000, rng)
            // eslint-disable-next-line no-console
            console.log(`keno picks=${picks} simulated RTP=${rtp.toFixed(4)}`)
            expect(rtp).toBeGreaterThan(KENO_RTP_TARGET * 0.6)
            expect(rtp).toBeLessThan(KENO_RTP_TARGET * 1.4) // tail-heavy variance band
        }
    })
})
