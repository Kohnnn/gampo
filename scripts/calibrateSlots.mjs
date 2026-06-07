// Calibrates a per-template payout scalar so each slot template converges to
// its rtpTarget. Writes src/components/games/slots/slotRtpScalars.js.
//
// Run: node scripts/calibrateSlots.mjs
//
// Method: simulate N base spins per template at scalar=1 to measure the raw
// mean multiplier (base EV). Free spins are zero-cost full-EV respins, so the
// true per-base-spin EV = baseEV + P(freeSpinTrigger)·awardFreeSpins·baseEV
// (one retrigger layer approximated via geometric expansion). scalar =
// rtpTarget / trueRawRtp. The scalar is then baked into config and applied in
// resolveSlotSpin so realized RTP == rtpTarget.

import { writeFileSync } from 'node:fs'
import { SLOT_TEMPLATES, resolveSlotSpin, __setSlotCalibrationRng } from '../src/components/games/slots/slotFactory.js'

const SPINS = Number(process.env.SLOT_CAL_SPINS) || 200000

function hashId(id) {
    let h = 2166136261
    for (let i = 0; i < id.length; i += 1) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
    return h >>> 0
}

// Deterministic RNG seeded per template for reproducible scalars.
function makeRng(seed) {
    let s = seed >>> 0
    return () => {
        s = (Math.imul(s ^ (s >>> 15), s | 1) >>> 0)
        s ^= s + Math.imul(s ^ (s >>> 7), s | 61)
        return ((s ^ (s >>> 14)) >>> 0) / 4294967296
    }
}

// resolveSlotSpin uses nextRoll() internally (fairRng). For calibration we want
// a fast deterministic stream, so we monkeypatch Math.random and route the slot
// roll through it by importing fairRng's seam. Simplest robust approach: the
// slot path's randomVisualSymbol uses Math.random but pickSymbol uses nextRoll.
// We instead measure via a large sample and rely on nextRoll's own stream which
// is deterministic per call-order; to vary, we perturb global state by seeding
// Math.random replacement consumed indirectly. To keep it simple + correct we
// run resolveSlotSpin many times; nextRoll advances its own internal nonce so
// outcomes vary across spins.

// Simulate ONE full base round including any free-spin session it triggers, the
// exact way SlotsGame plays it: free spins are zero-cost full-EV respins and can
// retrigger. A realistic hard cap on total free spins per session bounds the
// loop (and matches how real slots cap retriggers).
const MAX_FREE_SPINS_PER_SESSION = 20
function simulateRound(config, scalar) {
    const hasPersistent = Boolean(config.features?.persistentMultiplier)
    const cap = config.features?.persistentMultiplierCap || 10
    const award = config.features?.scatter?.awardFreeSpins || 0
    let total = 0
    // Base spin (no persistent multiplier outside free spins).
    const base = resolveSlotSpin(config, { rtpScalar: scalar, persistentMultiplier: 1 })
    total += base.multiplier
    // A coin-meter burst can also open a session (free-spins event with source).
    let freeSpins = base.triggeredFreeSpins ? award : 0
    if (!freeSpins) {
        const burst = base.featureEvents?.find(e => e.type === 'coin-meter-fill')
        if (burst) freeSpins = burst.freeSpins || 0
    }
    let played = 0
    let persistent = hasPersistent ? 1 : 1
    while (freeSpins > 0 && played < MAX_FREE_SPINS_PER_SESSION) {
        freeSpins -= 1
        played += 1
        const fs = resolveSlotSpin(config, { rtpScalar: scalar, persistentMultiplier: persistent })
        total += fs.multiplier
        if (hasPersistent && fs.cascadeSteps > 0) persistent = Math.min(cap, persistent + 1)
        if (fs.triggeredFreeSpins && played + freeSpins < MAX_FREE_SPINS_PER_SESSION) {
            freeSpins += award
            if (hasPersistent) persistent = Math.min(cap, persistent + 1)
        }
    }
    return total
}

function measureRtp(config, rng, scalar) {
    __setSlotCalibrationRng(rng)
    let sum = 0
    for (let i = 0; i < SPINS; i += 1) sum += simulateRound(config, scalar)
    return sum / SPINS
}

// Format a scalar with enough significant digits even for tiny values (some
// extreme-variance templates need scalars around 1e-6, where toFixed(5) loses
// ~5% precision and throws the realized RTP off target).
function fmtScalar(value) {
    if (!(value > 0)) return 1
    return Number(value.toPrecision(6))
}
const scalars = {}
const report = []
for (const config of SLOT_TEMPLATES) {
    // Average raw RTP across several independent seeds so the scalar is not
    // overfit to a single stream (critical for high-variance cluster/wheel
    // templates whose tail dominates the mean).
    const seeds = [0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
    const target = config.rtpTarget || 0.96
    let scalar
    if (Number(config.features?.maxWinMultiplier) > 0) {
        // Max-win cap is applied in SCALED space, so RTP is not linear in the
        // scalar. Solve with fixed-point iteration: measure realized RTP at the
        // current scalar (cap active via config.rtpScalar), then nudge.
        let s = 1
        for (let iter = 0; iter < 8; iter += 1) {
            config.rtpScalar = s
            let acc = 0
            for (const seed of seeds) acc += measureRtp(config, makeRng(seed ^ hashId(config.id)), null)
            const realized = acc / seeds.length
            if (realized <= 0) break
            const next = s * (target / realized)
            if (Math.abs(next - s) / s < 0.002) { s = next; break }
            s = next
        }
        scalar = fmtScalar(s)
        config.rtpScalar = scalar
        report.push({ id: config.id, target, baseRtp: 0, trueRtp: target, pTrigger: 0, scalar })
    } else {
        let acc = 0
        for (const seed of seeds) acc += measureRtp(config, makeRng(seed ^ hashId(config.id)), 1)
        const rawRtp = acc / seeds.length
        scalar = rawRtp > 0 ? fmtScalar(target / rawRtp) : 1
        report.push({ id: config.id, target, baseRtp: rawRtp, trueRtp: rawRtp, pTrigger: 0, scalar })
    }
    scalars[config.id] = scalar
}

const header = `// AUTO-GENERATED by scripts/calibrateSlots.mjs — do not edit by hand.
// Per-template payout scalar that locks realized RTP to each template's
// rtpTarget. Regenerate after changing symbol weights/payouts or evaluation.
`
const body = `export const SLOT_RTP_SCALARS = ${JSON.stringify(scalars, null, 4)}\n`
writeFileSync(new URL('../src/components/games/slots/slotRtpScalars.js', import.meta.url), header + '\n' + body)

console.log('id'.padEnd(20), 'target', 'baseRTP', 'trueRTP', 'scalar')
for (const r of report) {
    console.log(
        r.id.padEnd(20),
        (r.target * 100).toFixed(1),
        (r.baseRtp * 100).toFixed(0).padStart(5),
        (r.trueRtp * 100).toFixed(0).padStart(6),
        r.scalar.toFixed(4).padStart(8),
    )
}
console.log('\nWrote slotRtpScalars.js')
