// evCoach — a generalized educational "EV coach" surface.
//
// Poker has a bespoke GTO coach; this provides the equivalent teaching layer
// for every other game by combining the game's STATIC math metadata (from
// gameDefinitions: rtp, houseEdge, volatility, lesson) with the player's LIVE
// session stats (from useGameSession: count, wagered, returned, rtp, profit).
//
// It returns a plain, render-agnostic object so any surface (aside panel,
// popup, mobile sheet) can present it consistently:
//   { theoretical: { rtp, edge, evPerUnit }, observed: { ... }, verdict, note }
//
// "EV per play" is expressed per 1 unit staked so it scales to any bet size:
//   evPerUnit = rtp - 1  (a -0.02 means you lose 2% of stake on average).

import { round2 } from './simulationMath'

// Games where a single headline RTP doesn't describe every bet on the table —
// the house edge varies by which bet you pick (e.g. roulette straight-up vs
// even-money, sic bo specifics, keno spot counts). For these the coach adds a
// clarifying line so the player doesn't read one number as the whole story.
const MULTI_BET_GAMES = new Set(['roulette', 'sicbo', 'keno', 'baccarat', 'war', 'craps'])

function isMultiBet(definition) {
    if (definition.multiBet === true) return true
    if (definition.id && MULTI_BET_GAMES.has(definition.id)) return true
    // Fall back to matching on path/name slug.
    const slug = (definition.id || definition.path || definition.name || '').toString().toLowerCase()
    for (const g of MULTI_BET_GAMES) { if (slug.includes(g)) return true }
    return false
}

function clamp01(v) {
    if (!Number.isFinite(v)) return 0
    return Math.min(1, Math.max(0, v))
}

/**
 * @param {object} definition - game definition (rtp, houseEdge, volatility, lesson, name)
 * @param {object} stats - useGameSession stats (count, wagered, returned, rtp, profit, biggestWin)
 * @param {number} betAmount - current stake, for EV-per-play in credits
 */
export function buildEvCoach(definition = {}, stats = {}, betAmount = 0) {
    const rtp = Number.isFinite(definition.rtp) ? definition.rtp : 0.99
    const edge = Number.isFinite(definition.houseEdge) ? definition.houseEdge : round2(1 - rtp)
    const evPerUnit = round2(rtp - 1)
    const evPerPlay = round2(evPerUnit * (Number(betAmount) || 0))

    const count = Number(stats.count) || 0
    const wagered = Number(stats.wagered) || 0
    const returned = Number(stats.returned) || 0
    const observedRtp = wagered > 0 ? returned / wagered : null
    // Confidence grows with sample size; 200+ rounds is treated as "settled".
    const confidence = clamp01(count / 200)
    const reliable = count >= 20

    // How far the player's luck is from the math, in RTP points.
    const luckDeltaPts = observedRtp != null ? round2((observedRtp - rtp) * 100) : null

    let verdict = 'even'
    if (observedRtp != null && reliable) {
        if (observedRtp > rtp + 0.02) verdict = 'running-hot'
        else if (observedRtp < rtp - 0.02) verdict = 'running-cold'
        else verdict = 'on-model'
    }

    const note = buildNote({ rtp, edge, reliable, verdict, luckDeltaPts, count, multiBet: isMultiBet(definition) })

    return {
        name: definition.name || 'This game',
        theoretical: {
            rtp: round2(rtp),
            edge: round2(edge),
            evPerUnit,
            evPerPlay,
            volatility: definition.volatility || null,
        },
        observed: {
            count,
            wagered: round2(wagered),
            returned: round2(returned),
            rtp: observedRtp != null ? round2(observedRtp) : null,
            profit: round2(Number(stats.profit) || 0),
            reliable,
            confidence: round2(confidence),
            luckDeltaPts,
        },
        verdict,
        note,
        multiBet: isMultiBet(definition),
        lesson: definition.lesson || null,
    }
}

function buildNote({ rtp, edge, reliable, verdict, luckDeltaPts, count, multiBet }) {
    const edgePct = (edge * 100).toFixed(1)
    const multiBetTail = multiBet
        ? ' Note: this game has several bet types — the house edge shown is for the standard bet and varies with your bet choice.'
        : ''
    if (!reliable) {
        return `The house edge here is ${edgePct}%. Play at least 20 rounds (${count} so far) before your results mean much — small samples are mostly luck.${multiBetTail}`
    }
    if (verdict === 'running-hot') {
        return `You're ${Math.abs(luckDeltaPts)} pts above the ${(rtp * 100).toFixed(0)}% expected return — that's variance in your favour, not an edge. The math still expects a ${edgePct}% loss long-run.${multiBetTail}`
    }
    if (verdict === 'running-cold') {
        return `You're ${Math.abs(luckDeltaPts)} pts below expected return. That's normal downside variance around the ${edgePct}% house edge, not a "due" correction.${multiBetTail}`
    }
    return `Your results are tracking the model: ~${(rtp * 100).toFixed(0)}% returned, a ${edgePct}% house edge. This is what the long run looks like.${multiBetTail}`
}

export const EV_VERDICT_LABELS = {
    'even': 'Gathering data',
    'on-model': 'On the math',
    'running-hot': 'Running hot (variance)',
    'running-cold': 'Running cold (variance)',
}
