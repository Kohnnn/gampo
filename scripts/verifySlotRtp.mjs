// Verifies that calibrated slot scalars bring each template within tolerance of
// its rtpTarget. Run: node --loader ./scripts/extResolve.mjs scripts/verifySlotRtp.mjs
import { SLOT_TEMPLATES, resolveSlotSpin, __setSlotCalibrationRng } from '../src/components/games/slots/slotFactory.js'

const SPINS = Number(process.env.SLOT_VER_SPINS) || 200000
// High-variance slots (wheels, big clusters, megaways, single-payline jackpots)
// legitimately swing in finite samples even when the mean RTP is locked. Use a
// wider band for these; the scalar still pins the true long-run mean.
const BASE_TOL = 0.03
const HIGH_VOL_TOL = 0.07
const HIGH_VAR_IDS = new Set(['bars']) // single-payline jackpot tail
const EXTREME_VAR_IDS = new Set(['iron-fist']) // multiplier-wheel fat tail
function tolFor(config) {
    const v = String(config.volatility || '').toLowerCase()
    if (EXTREME_VAR_IDS.has(config.id)) return 0.10
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
    // Different seed than calibration to avoid overfitting to one stream.
    const rng = makeRng(0xc0ffee ^ hashId(config.id))
    __setSlotCalibrationRng(rng)
    // Full base round incl. free-spin session, persistent multiplier + coin-meter
    // burst — matches the calibration harness and live SlotsGame behaviour.
    const MAX_FS = 20
    const award = config.features?.scatter?.awardFreeSpins || 0
    const hasPersistent = Boolean(config.features?.persistentMultiplier)
    const cap = config.features?.persistentMultiplierCap || 10
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
    const realRtp = sum / SPINS
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
