// Verifies that calibrated slot scalars bring each template within tolerance of
// its rtpTarget. Run: node --loader ./scripts/extResolve.mjs scripts/verifySlotRtp.mjs
import assert from 'node:assert/strict'
import { SLOT_TEMPLATES, resolveSlotSpin, __setSlotCalibrationRng } from '../src/components/games/slots/slotFactory.js'
import { MAX_FREE_SPINS_PER_SESSION } from '../src/components/games/slots/slotConstants.js'

const SPINS = Number(process.env.SLOT_VER_SPINS) || 200000
// Optional allowlist (comma-separated template ids). When set, only those
// templates are verified — useful after a scoped recalibration so the gate runs
// in minutes instead of the full grid. Usage: SLOT_VER_ONLY=gummy-drops node ...
const ONLY = (process.env.SLOT_VER_ONLY || '').split(',').map(s => s.trim()).filter(Boolean)
const ONLY_SET = ONLY.length ? new Set(ONLY) : null
// High-variance slots (wheels, big clusters, megaways, single-payline jackpots)
// legitimately swing in finite samples even when the mean RTP is locked. The
// verify gate now averages multiple seeds for the heaviest titles (see below),
// which sharply reduces estimator noise — so the tolerance bands are tighter
// than before. The scalar still pins the true long-run mean.
const BASE_TOL = 0.02
const HIGH_VOL_TOL = 0.04
const HIGH_VAR_IDS = new Set(['bars']) // single-payline jackpot tail
const EXTREME_VAR_IDS = new Set(['iron-fist', 'gummy-drops']) // multiplier/cluster fat tail
function tolFor(config) {
    const v = String(config.volatility || '').toLowerCase()
    if (EXTREME_VAR_IDS.has(config.id)) return 0.05
    if (HIGH_VAR_IDS.has(config.id) || v.includes('very') || v.includes('extreme')) return HIGH_VOL_TOL
    return BASE_TOL
}

function makeRng(seed) {
    let s = seed >>> 0
    return () => {
        s = (Math.imul(s ^ (s >>> 15), s | 1) >>> 0)
        s ^= s + Math.imul(s ^ (s >>> 7), s | 61)
        return ((s ^ (s >>> 14)) >>> 0) / 4294967296
    }
}
function hashId(id) {
    let h = 2166136261
    for (let i = 0; i < id.length; i += 1) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
    return h >>> 0
}

function applyFreeSpinAward(state, { source, rawAward, persistentAward = false }) {
    const actualAward = Math.max(0, Math.min(rawAward, MAX_FREE_SPINS_PER_SESSION - state.totalAwarded))
    if (actualAward > 0) {
        state.queued += actualAward
        state.totalAwarded += actualAward
        if (persistentAward) state.persistent = Math.min(state.persistentCap, state.persistent + 1)
    }
    return { source, rawAward, actualAward, zeroSideEffect: actualAward === 0 }
}

function runAccountingSelfCheck() {
    const state = { queued: 0, totalAwarded: 0, played: 0, persistent: 2, persistentCap: 10 }
    const initial = applyFreeSpinAward(state, { source: 'scatter', rawAward: 12 })
    state.queued -= 1
    state.played += 1
    const retrigger = applyFreeSpinAward(state, { source: 'free-spins', rawAward: 12, persistentAward: true })
    const exhausted = applyFreeSpinAward(state, { source: 'free-spins', rawAward: 12, persistentAward: true })
    const coinMeterState = { queued: 0, totalAwarded: 0, played: 0, persistent: 1, persistentCap: 10 }
    const coinMeter = applyFreeSpinAward(coinMeterState, { source: 'coin-meter-fill', rawAward: 12 })
    assert.equal(initial.source, 'scatter')
    assert.equal(initial.actualAward, 12)
    assert.equal(retrigger.actualAward, 8)
    assert.equal(state.totalAwarded, 20)
    assert.equal(state.played, 1)
    assert.equal(state.queued, 19)
    assert.equal(exhausted.actualAward, 0)
    assert.equal(exhausted.zeroSideEffect, true)
    assert.equal(state.persistent, 3)
    assert.equal(coinMeter.source, 'coin-meter-fill')
    assert.equal(coinMeter.rawAward, 12)
    assert.equal(coinMeter.actualAward, 12)
}

runAccountingSelfCheck()

let allPass = true
console.log('id'.padEnd(20), 'target', 'realRTP', 'verdict')
for (const config of SLOT_TEMPLATES) {
    if (ONLY_SET && !ONLY_SET.has(config.id)) continue
    // Extreme-variance titles (huge cluster boards, persistent multipliers) have
    // a tail so heavy that a single stream is a poor RTP estimator even at large
    // N. Average several independent seeds for these — matching how calibration
    // pins the mean — so the gate measures the locked mean, not stream noise.
    const v = String(config.volatility || '').toLowerCase()
    const heavy = config.id === 'gummy-drops' || config.id === 'iron-fist'
        || config.id === 'dust-rail' || config.id === 'gates-ascent'
        || config.id === 'storm-banner' || config.id === 'ghostblade-strike'
        || v.includes('very') || v.includes('extreme') || v.includes('high')
    const seeds = heavy
        ? [0xc0ffee, 0x1234abcd, 0x9e3779b9, 0x51ed270b, 0xfeedface]
        : [0xc0ffee]
    const MAX_FS = MAX_FREE_SPINS_PER_SESSION
    const award = config.features?.scatter?.awardFreeSpins || 0
    const hasPersistent = Boolean(config.features?.persistentMultiplier)
    const cap = config.features?.persistentMultiplierCap || 10
    let grand = 0
    for (const seed of seeds) {
        const rng = makeRng(seed ^ hashId(config.id))
        __setSlotCalibrationRng(rng)
        let sum = 0
        for (let i = 0; i < SPINS; i += 1) {
            let total = 0
            const base = resolveSlotSpin(config, { persistentMultiplier: 1 })
            total += base.multiplier
            const state = { queued: 0, totalAwarded: 0, played: 0, persistent: 1, persistentCap: cap }
            const initialAward = base.featureEvents?.find(event => event.type === 'free-spins')
            if (initialAward) {
                applyFreeSpinAward(state, {
                    source: initialAward.source === 'coin-meter' ? 'coin-meter-fill' : 'scatter',
                    rawAward: initialAward.freeSpins || award,
                })
            }
            while (state.queued > 0 && state.played < MAX_FS) {
                state.queued -= 1; state.played += 1
                const spin = resolveSlotSpin(config, { persistentMultiplier: state.persistent })
                total += spin.multiplier
                if (hasPersistent && spin.cascadeSteps > 0) state.persistent = Math.min(cap, state.persistent + 1)
                const retriggerAward = spin.featureEvents?.find(event => event.type === 'free-spins')
                if (retriggerAward) {
                    applyFreeSpinAward(state, {
                        source: retriggerAward.source === 'coin-meter' ? 'coin-meter-fill' : 'free-spins',
                        rawAward: retriggerAward.freeSpins || award,
                        persistentAward: hasPersistent,
                    })
                }
            }
            sum += total
        }
        grand += sum / SPINS
    }
    const realRtp = grand / seeds.length
    const target = config.rtpTarget || 0.96
    const pass = Math.abs(realRtp - target) <= tolFor(config)
    if (!pass) allPass = false
    console.log(
        config.id.padEnd(20),
        (target * 100).toFixed(1),
        (realRtp * 100).toFixed(1).padStart(6),
        pass ? 'ok' : '!! OFF',
    )
}
console.log(allPass ? '\nALL TEMPLATES WITHIN TOLERANCE' : '\nSOME TEMPLATES OFF — recalibrate')
process.exit(allPass ? 0 : 1)
