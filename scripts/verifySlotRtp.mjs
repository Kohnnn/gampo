// Verifies that calibrated slot scalars bring each template within tolerance of
// its rtpTarget. Run: node --loader ./scripts/extResolve.mjs scripts/verifySlotRtp.mjs
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
            let fs = base.triggeredFreeSpins ? award : 0
            if (!fs) {
                const burst = base.featureEvents?.find(e => e.type === 'coin-meter-fill')
                if (burst) fs = burst.freeSpins || 0
            }
            let played = 0
            let persistent = 1
            while (fs > 0 && played < MAX_FS) {
                fs -= 1; played += 1
                const spin = resolveSlotSpin(config, { persistentMultiplier: persistent })
                total += spin.multiplier
                if (hasPersistent && spin.cascadeSteps > 0) persistent = Math.min(cap, persistent + 1)
                if (spin.triggeredFreeSpins && played + fs < MAX_FS) {
                    fs += award
                    if (hasPersistent) persistent = Math.min(cap, persistent + 1)
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
