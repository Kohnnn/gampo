// Verifies the calibrated non-slot RTP fixes by simulation. Pure JS, no deps.
// Run: node scripts/verifyOddsRtp.mjs
import { kenoPayout } from '../src/utils/simulationMath.js'

function rng() { return Math.random() }
const N = 500000
const results = []

// Wheel — normalized shapes should average ~0.96.
function normalizeWheel(shape, rtp = 0.96) {
    const mean = shape.reduce((s, v) => s + v, 0) / shape.length
    const scale = rtp / mean
    return shape.map(v => (v > 0 ? Number((v * scale).toFixed(2)) : 0))
}
for (const [name, shape] of Object.entries({
    low: [0, 1.2, 1.2, 1.5, 0, 2, 1.2, 1.5, 0, 2, 1.2, 3],
    medium: [0, 0, 1.5, 0, 2, 0, 3, 0, 1.5, 0, 5, 0],
    high: [0, 0, 0, 2, 0, 0, 5, 0, 0, 10, 0, 25],
})) {
    const seg = normalizeWheel(shape)
    let ret = 0
    for (let i = 0; i < N; i++) ret += seg[Math.floor(rng() * seg.length)]
    results.push([`wheel-${name}`, ret / N])
}

// RPS — payout 1.91, push refunds. RTP = win/3*payout + 1/3.
{
    const payout = 0.97 * 3 - 1
    let ret = 0
    for (let i = 0; i < N; i++) {
        const r = Math.floor(rng() * 3) // 0 win, 1 push, 2 lose
        ret += r === 0 ? payout : r === 1 ? 1 : 0
    }
    results.push(['rps', ret / N])
}

// Hi-Lo — average across all current-card ranks, higher/lower mixed.
{
    let ret = 0, count = 0
    const target = 0.96 - 1 / 13
    for (let trial = 0; trial < N; trial++) {
        const cur = 1 + Math.floor(rng() * 13)
        const higher = rng() < 0.5
        const winChance = higher ? (13 - cur) / 13 : (cur - 1) / 13
        const payout = winChance > 0 ? Math.max(1.01, target / winChance) : 0
        const next = 1 + Math.floor(rng() * 13)
        const tie = next === cur
        const won = higher ? next > cur : next < cur
        ret += tie ? 1 : won ? payout : 0
        count++
    }
    results.push(['hilo', ret / count])
}

// Keno — calibrated table, draw 10 of 40.
for (const picks of [1, 3, 5, 8, 10]) {
    let ret = 0
    for (let i = 0; i < 200000; i++) {
        const pool = Array.from({ length: 40 }, (_, k) => k + 1)
        for (let j = pool.length - 1; j > 0; j--) { const t = Math.floor(rng() * (j + 1)); [pool[j], pool[t]] = [pool[t], pool[j]] }
        const drawn = new Set(pool.slice(0, 10))
        // pick `picks` distinct numbers 1..40
        const sel = new Set()
        while (sel.size < picks) sel.add(1 + Math.floor(rng() * 40))
        let hits = 0
        sel.forEach(n => { if (drawn.has(n)) hits++ })
        ret += kenoPayout(picks, hits)
    }
    results.push([`keno-${picks}`, ret / 200000])
}

// Drill — multipliers locked to TARGET_RTP / cumulative-survival, so the
// cash-out EV at every depth is ~0.96. Simulate a "drill to bedrock" greedy
// player (the previously-exploitable strategy) to confirm it no longer wins.
{
    const TARGET = 0.96
    const bust = [0.06, 0.10, 0.14, 0.18, 0.22, 0.26, 0.32, 0.38]
    let survival = 1
    const mult = bust.map(b => { survival *= (1 - b); return Math.round((TARGET / survival) * 100) / 100 })
    let ret = 0
    for (let i = 0; i < N; i++) {
        let depth = 0
        let alive = true
        while (alive && depth < bust.length) {
            if (rng() < bust[depth]) { alive = false; break }
            depth++
        }
        ret += alive ? mult[depth - 1] : 0 // cash out at deepest reached (bedrock-greedy)
    }
    results.push(['drill-greedy', ret / N])
}

// Dino — growth locked to TARGET_RTP / safe per preset, so the EV of each
// surviving step is exactly TARGET_RTP (~0.99, Dino's advertised RTP). Measure
// that per-step invariant directly. (A multi-step commit naturally compounds
// the edge, e.g. 0.99^n, so it is NOT a valid "too easy/low" signal.)
{
    const TARGET = 0.99
    const presets = { easy: 0.86, medium: 0.72, hard: 0.58, extreme: 0.42 }
    for (const [name, safe] of Object.entries(presets)) {
        const growth = Number((TARGET / safe).toFixed(4))
        let ret = 0
        for (let i = 0; i < N; i++) {
            ret += rng() < safe ? growth : 0 // single-step EV
        }
        results.push([`dino-${name}`, ret / N])
    }
}

// Lottery — pick-5 draw-5 of 36, calibrated prize table. EV should be ~0.90.
{
    const TABLE = [0, 0, 4, 25, 250, 5000]
    let ret = 0
    for (let i = 0; i < N; i++) {
        const pool = Array.from({ length: 36 }, (_, k) => k + 1)
        for (let j = pool.length - 1; j > 0; j--) { const t = Math.floor(rng() * (j + 1)); [pool[j], pool[t]] = [pool[t], pool[j]] }
        const drawn = new Set(pool.slice(0, 5))
        const sel = new Set()
        while (sel.size < 5) sel.add(1 + Math.floor(rng() * 36))
        let hits = 0
        sel.forEach(n => { if (drawn.has(n)) hits++ })
        ret += TABLE[hits]
    }
    results.push(['lottery', ret / N])
}

console.log('Game           RTP')
for (const [name, rtp] of results) {
    const pct = (rtp * 100).toFixed(1)
    const flag = rtp > 1.02 ? ' !! TOO EASY' : rtp < 0.85 ? ' !! TOO LOW' : ' ok'
    console.log(`${name.padEnd(14)} ${pct}%${flag}`)
}
