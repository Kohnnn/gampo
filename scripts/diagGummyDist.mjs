// Diagnostic: measure the player-facing WIN DISTRIBUTION for one or more slot
// templates (default gummy-drops). Quantifies risk #1 in the 2026-06-11 handoff:
// an extreme rtpScalar can round typical small wins to 0 after scaling, so the
// displayed RTP is "real" but the felt experience is mostly zero-wins punctuated
// by rare huge hits. We report: hit rate, % of wins that round to 0 AFTER scalar,
// orb landing stats, and a multiplier histogram (player-facing, post-cap).
//
// Run: node --loader ./scripts/extResolve.mjs scripts/diagGummyDist.mjs
import { SLOT_TEMPLATES, resolveSlotSpin, __setSlotCalibrationRng } from '../src/components/games/slots/slotFactory.js'
import { MAX_FREE_SPINS_PER_SESSION } from '../src/components/games/slots/slotConstants.js'

const SPINS = Number(process.env.DIAG_SPINS) || 200000
const ONLY = (process.env.DIAG_ONLY || 'gummy-drops').split(',').map(s => s.trim()).filter(Boolean)
const ONLY_SET = new Set(ONLY)

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

// Buckets for the player-facing per-base-round multiplier (incl. its FS session).
const BUCKETS = [
    [0, 0, '== 0 (rounded to nothing)'],
    [0, 0.5, '(0, 0.5)'],
    [0.5, 1, '[0.5, 1)'],
    [1, 2, '[1, 2)'],
    [2, 5, '[2, 5)'],
    [5, 10, '[5, 10)'],
    [10, 50, '[10, 50)'],
    [50, 200, '[50, 200)'],
    [200, 1000, '[200, 1000)'],
    [1000, 5000, '[1000, 5000)'],
    [5000, Infinity, '>= 5000 (cap)'],
]

for (const config of SLOT_TEMPLATES) {
    if (!ONLY_SET.has(config.id)) continue
    const rng = makeRng(0xc0ffee ^ hashId(config.id))
    __setSlotCalibrationRng(rng)

    const award = config.features?.scatter?.awardFreeSpins || 0
    const hasPersistent = Boolean(config.features?.persistentMultiplier)
    const cap = config.features?.persistentMultiplierCap || 10

    const counts = BUCKETS.map(() => 0)
    let nonZeroRounds = 0          // rounds where the player-facing total > 0
    let baseWinSpins = 0           // base spins that produced any raw win pre-scalar
    let baseWinRoundedToZero = 0   // base spins with raw win > 0 but scaled to 0
    let orbSpins = 0               // base spins where >=1 orb landed
    let orbOnWinSpins = 0          // base spins where orbs landed AND there was a win
    let orbTotalSum = 0, orbCount = 0
    let grandTotal = 0
    let maxSeen = 0

    for (let i = 0; i < SPINS; i += 1) {
        let total = 0
        const base = resolveSlotSpin(config, { persistentMultiplier: 1 })
        total += base.multiplier
        if (base.multiplier > 0) baseWinSpins += 1
        // orb diagnostics (orbValues always returned regardless of paid result)
        if (base.orbValues && base.orbValues.length) {
            orbSpins += 1
            const sum = base.orbValues.reduce((a, o) => a + o.value, 0)
            orbTotalSum += sum; orbCount += base.orbValues.length
            if (base.wins && base.wins.length) orbOnWinSpins += 1
        }
        // detect "raw win existed but final multiplier rounded to 0"
        if ((base.wins && base.wins.length) && base.multiplier === 0) baseWinRoundedToZero += 1

        let fs = base.triggeredFreeSpins ? award : 0
        if (!fs) {
            const burst = base.featureEvents?.find(e => e.type === 'coin-meter-fill')
            if (burst) fs = burst.freeSpins || 0
        }
        let played = 0
        let persistent = 1
        while (fs > 0 && played < MAX_FREE_SPINS_PER_SESSION) {
            fs -= 1; played += 1
            const spin = resolveSlotSpin(config, { persistentMultiplier: persistent })
            total += spin.multiplier
            if (hasPersistent && spin.cascadeSteps > 0) persistent = Math.min(cap, persistent + 1)
            if (spin.triggeredFreeSpins && played + fs < MAX_FREE_SPINS_PER_SESSION) {
                fs += award
                if (hasPersistent) persistent = Math.min(cap, persistent + 1)
            }
        }
        grandTotal += total
        if (total > maxSeen) maxSeen = total
        if (total > 0) nonZeroRounds += 1
        for (let b = 0; b < BUCKETS.length; b += 1) {
            const [lo, hi] = BUCKETS[b]
            if (b === 0) { if (total === 0) { counts[0] += 1; break } continue }
            if (total >= lo && total < hi) { counts[b] += 1; break }
        }
    }

    const rtp = grandTotal / SPINS
    console.log(`\n=== ${config.id} ===`)
    console.log(`scalar in use         : ${config.rtpScalar}`)
    console.log(`maxWinMultiplier      : ${config.features?.maxWinMultiplier}`)
    console.log(`spins                 : ${SPINS}`)
    console.log(`realized RTP          : ${(rtp * 100).toFixed(2)}%`)
    console.log(`hit rate (round > 0)  : ${(nonZeroRounds / SPINS * 100).toFixed(2)}%`)
    console.log(`base raw-win spins    : ${(baseWinSpins / SPINS * 100).toFixed(2)}%`)
    console.log(`raw win -> 0 after scalar (base spins): ${(baseWinRoundedToZero / SPINS * 100).toFixed(2)}%`)
    console.log(`orb landing rate      : ${(orbSpins / SPINS * 100).toFixed(2)}%  (avg orbs/landing ${(orbCount / Math.max(1, orbSpins)).toFixed(2)}, avg orbSum ${(orbTotalSum / Math.max(1, orbSpins)).toFixed(1)})`)
    console.log(`orbs landed on a win  : ${(orbOnWinSpins / SPINS * 100).toFixed(2)}%`)
    console.log(`max round seen        : ${maxSeen.toFixed(2)}`)
    console.log(`--- player-facing multiplier histogram ---`)
    for (let b = 0; b < BUCKETS.length; b += 1) {
        const pct = counts[b] / SPINS * 100
        console.log(`  ${BUCKETS[b][2].padEnd(28)} ${pct.toFixed(3).padStart(8)}%  (${counts[b]})`)
    }
}
