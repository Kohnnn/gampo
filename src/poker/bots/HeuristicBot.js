// Heuristic poker bot. Uses local strength/position heuristics, post-flop
// equity sampling, persona biases, and an optional already-loaded GTO chart
// anchor. It never fetches chart data directly.
// Trades correctness for speed: ~150 random rollouts, bumped to 250 in low-SPR pots.
//
// Wave 11 upgrades:
//  - ante-aware aggression boost when antes are in the pot
//  - smarter raise sizing tied to street / pot / SPR
//  - difficulty-based mistake injection (beginner over-calls, advanced bluff-catches)
//  - post-flop draw-aware semibluff weights via texture

import { Hand as SolverHand } from 'pokersolver'
import { legalActions } from '../engine/Game'
import { canonical } from '../util/handCanonicalize'
import { rolesForSeats } from '../util/positions'
import { classify } from '../util/textureClassify'

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
const SUITS = ['s', 'h', 'd', 'c']
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value))

export const POKER_PERSONA_PROFILES = {
    'tight-passive': {
        id: 'tight-passive',
        vpip: -0.08,
        pfr: -0.12,
        cbet: 0.18,
        foldTo3Bet: 0.78,
        riverBluff: 0.04,
        aggression: -0.16,
        callBias: -0.06,
        gtoWeight: 0.24,
    },
    'loose-aggressive': {
        id: 'loose-aggressive',
        vpip: 0.10,
        pfr: 0.13,
        cbet: 0.56,
        foldTo3Bet: 0.40,
        riverBluff: 0.18,
        aggression: 0.18,
        callBias: 0.03,
        gtoWeight: 0.30,
    },
    whale: {
        id: 'whale',
        vpip: 0.16,
        pfr: 0.04,
        cbet: 0.42,
        foldTo3Bet: 0.28,
        riverBluff: 0.25,
        aggression: 0.08,
        callBias: 0.12,
        gtoWeight: 0.18,
    },
    cautious: {
        id: 'cautious',
        vpip: -0.12,
        pfr: -0.14,
        cbet: 0.16,
        foldTo3Bet: 0.84,
        riverBluff: 0.06,
        aggression: -0.22,
        callBias: -0.09,
        gtoWeight: 0.22,
    },
    analyst: {
        id: 'analyst',
        vpip: 0.02,
        pfr: 0.04,
        cbet: 0.38,
        foldTo3Bet: 0.56,
        riverBluff: 0.10,
        aggression: 0.04,
        callBias: 0.00,
        gtoWeight: 0.48,
    },
}

function rankIdx(r) { return RANKS.indexOf(r.toUpperCase()) }

function hashSeed(seed) {
    let h = 2166136261
    const text = String(seed)
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    return h >>> 0
}

export function createSeededPokerRng(seed) {
    let t = hashSeed(seed)
    return function rng() {
        t += 0x6D2B79F5
        let x = t
        x = Math.imul(x ^ (x >>> 15), x | 1)
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296
    }
}

export function resolvePokerPersona(persona) {
    if (!persona) return POKER_PERSONA_PROFILES.analyst
    if (typeof persona === 'string') return POKER_PERSONA_PROFILES[persona] || POKER_PERSONA_PROFILES.analyst

    const keyed = persona.playStyle || persona.style || persona.botStyle || persona.pokerStyle || persona.persona
    if (keyed && POKER_PERSONA_PROFILES[keyed]) return POKER_PERSONA_PROFILES[keyed]

    const name = String(persona.name || '').toLowerCase()
    if (/nit|bubble|plinko|cautious/.test(name)) return POKER_PERSONA_PROFILES.cautious
    if (/crash|turn|donk|mtt|straddle|aggro/.test(name)) return POKER_PERSONA_PROFILES['loose-aggressive']
    if (/fish|lucky|whale/.test(name)) return POKER_PERSONA_PROFILES.whale
    if (/binary|odds|solver|range|analyst/.test(name)) return POKER_PERSONA_PROFILES.analyst

    const aggro = Number(persona.aggression)
    if (Number.isFinite(aggro)) {
        if (aggro <= 0.36) return POKER_PERSONA_PROFILES['tight-passive']
        if (aggro >= 0.72) return POKER_PERSONA_PROFILES['loose-aggressive']
    }
    return POKER_PERSONA_PROFILES.analyst
}

// Pre-flop hand strength heuristic on a 0-1 scale.
function preflopStrength(hole) {
    if (!hole || hole.length !== 2) return 0.4
    const r1 = rankIdx(hole[0][0]); const r2 = rankIdx(hole[1][0])
    const suited = hole[0][1] === hole[1][1]
    const high = Math.max(r1, r2); const low = Math.min(r1, r2)
    if (high === low) {
        if (high >= 10) return 0.95
        if (high >= 7) return 0.78
        return 0.62
    }
    const gap = high - low
    let s = (high + low) / 24
    if (suited) s += 0.06
    if (gap === 1) s += 0.04
    if (gap >= 4 && !suited) s -= 0.06
    if (high === 12) s += 0.05
    return Math.max(0.05, Math.min(0.95, s))
}

function buildDeck(exclude) {
    const out = []
    for (const r of RANKS) for (const s of SUITS) {
        const c = r + s
        if (!exclude.includes(c)) out.push(c)
    }
    return out
}

export function postflopEquity(hole, community, opponents, samples = 150, rng = Math.random) {
    const known = [...hole, ...community]
    const remaining = buildDeck(known)
    let wins = 0, ties = 0
    for (let s = 0; s < samples; s++) {
        const pool = remaining.slice()
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1))
            ;[pool[i], pool[j]] = [pool[j], pool[i]]
        }
        const need = 5 - community.length
        const board = [...community, ...pool.slice(0, need)]
        let cur = need
        const oppHands = []
        for (let o = 0; o < opponents; o++) {
            oppHands.push([pool[cur], pool[cur + 1]])
            cur += 2
        }
        const my = SolverHand.solve([...hole, ...board].map(c => c.toUpperCase()))
        const oppSolved = oppHands.map(h => SolverHand.solve([...h, ...board].map(c => c.toUpperCase())))
        const winners = SolverHand.winners([my, ...oppSolved])
        if (winners.includes(my)) {
            if (winners.length === 1) wins++
            else ties++
        }
    }
    return (wins + ties * 0.5) / samples
}

export function estimateSpr(state, player) {
    const pot = Math.max(1, Number(state?.pot) || 0)
    const opponents = (state?.players || [])
        .filter(p => p !== player && p.status !== 'folded' && p.status !== 'sittingOut')
        .map(p => Math.max(0, Number(p.stack || 0) + Number(p.putIn || 0)))
    const effective = opponents.length
        ? Math.min(Number(player?.stack || 0) + Number(player?.putIn || 0), Math.max(...opponents))
        : Number(player?.stack || 0) + Number(player?.putIn || 0)
    return effective / pot
}

export function postflopSampleCount(state, player) {
    return estimateSpr(state, player) < 4 ? 250 : 150
}

function normalizeTextureKeys(textureKey) {
    const out = [textureKey]
    if (textureKey === 'mono-middling') out.push('mono-mid')
    if (textureKey === 'rainbow-paired-high-conn') out.push('rainbow-paired-high')
    if (textureKey === 'two-tone-low') out.push('two-tone-low-conn')
    out.push('default')
    return [...new Set(out.filter(Boolean))]
}

function pickPostflopChartNode({ state, seatIndex, postflopChart }) {
    if (!postflopChart || state?.street === 'preflop' || !state?.community?.length) return null
    const roles = rolesForSeats(state.players.length, state.buttonIndex)
    const actorRole = roles[seatIndex]
    const buttonRole = roles[state.buttonIndex]
    const nextRole = roles[(state.buttonIndex + 1) % state.players.length]
    const matchupKeys = [
        `${buttonRole}-vs-${actorRole === buttonRole ? nextRole : actorRole}`,
        `${buttonRole}-vs-${actorRole}`,
        'default',
    ]
    const texture = classify(state.community)
    const textureKeys = normalizeTextureKeys(texture?.key)
    for (const matchupKey of matchupKeys) {
        const root = postflopChart.matchup?.[matchupKey] || (matchupKey === 'default' ? postflopChart.matchup?.default : null)
        if (!root) continue
        const ctx = root['rfi-call'] || Object.values(root)[0]
        const streetNode = ctx?.[state.street] || ctx?.flop
        if (!streetNode) continue
        for (const key of textureKeys) {
            if (streetNode[key]) return { node: streetNode[key], textureKey: key, matchupKey }
        }
    }
    return null
}

function listIncludesCode(list, code) {
    if (!code) return false
    return (list || []).some(item => item === code)
}

export function postflopGtoAnchor({ state, seatIndex, postflopChart }) {
    const picked = pickPostflopChartNode({ state, seatIndex, postflopChart })
    if (!picked) return null
    const handCode = canonical(state.players[seatIndex]?.hole || [])
    const { node, textureKey, matchupKey } = picked
    let anchor = null
    if (listIncludesCode(node.value, handCode)) anchor = { raise: 0.82, call: 0.16, check: 0.12, fold: 0.02, bucket: 'value' }
    else if (listIncludesCode(node.bluff, handCode)) anchor = { raise: 0.58, call: 0.04, check: 0.18, fold: 0.34, bucket: 'bluff' }
    else if (listIncludesCode(node.marginal, handCode)) anchor = { raise: 0.22, call: 0.54, check: 0.46, fold: 0.18, bucket: 'marginal' }

    if (!anchor) {
        const checkFreq = (node.sizings || []).reduce((sum, sizing) => {
            const label = String(sizing.size || '').toLowerCase()
            return sum + (label.includes('check') ? Number(sizing.freq || 0) : 0)
        }, 0)
        const betFreq = clamp(1 - checkFreq, 0.12, 0.78)
        anchor = { raise: betFreq, call: 0.28, check: checkFreq, fold: 0.22, bucket: 'texture' }
    }

    return {
        ...anchor,
        handCode,
        textureKey,
        matchupKey,
    }
}

function blendFrequency(base, target, weight) {
    return clamp(base * (1 - weight) + target * weight)
}

// Pot-relative raise sizing. Returns an integer chip amount within [r.min, r.max].
function chooseRaiseSize({ raiseAct, state, equity, street, aggression, rng = Math.random }) {
    if (!raiseAct) return null
    const pot = Math.max(1, state.pot)
    let frac
    if (street === 'preflop') {
        // Preflop: 2.5x BB open or 3x iso, 8-12bb if 3-bet.
        const facedRaise = state.history.some(h => h.type === 'raise')
        if (!facedRaise) {
            frac = (state.bb || 1) * 2.5 + rng() * (state.bb || 1) * 0.6
            return Math.round(Math.max(raiseAct.min, Math.min(raiseAct.max, frac)))
        }
        // 3-bet: target ~3.2x last bet
        const target = state.currentBet * 3.2
        return Math.round(Math.max(raiseAct.min, Math.min(raiseAct.max, target)))
    }
    // Postflop: size by equity and aggression. Strong = 80% pot, medium = 60%, polar = 110%.
    if (equity > 0.85) frac = 0.85 + rng() * 0.25
    else if (equity > 0.7) frac = 0.6 + rng() * 0.18
    else if (equity > 0.55) frac = 0.4 + rng() * 0.18
    else frac = 0.32 + rng() * 0.2
    if (aggression > 0.7) frac += 0.08
    if (street === 'river' && equity < 0.45) frac = 1.0 + rng() * 0.4 // overbet bluff
    const target = pot * frac + state.currentBet
    return Math.round(Math.max(raiseAct.min, Math.min(raiseAct.max, target)))
}

// Difficulty-based mistake injection. Returns null to keep the bot's decision,
// or a forced action object to override it.
function injectMistake({ acts, state, equity, difficulty, street, personaProfile, rng = Math.random }) {
    const callAct = acts.find(a => a.type === 'call')
    const checkAct = acts.find(a => a.type === 'check')
    const raiseAct = acts.find(a => a.type === 'raise')
    const r = rng()

    if (difficulty === 'beginner') {
        // Over-calls weak holdings (~10%) and slow-plays monsters (~6%).
        if (r < 0.1 && callAct && equity < 0.32) return { type: 'call' }
        if (r < 0.06 && checkAct && equity > 0.78) return { type: 'check' }
    } else if (difficulty === 'advanced') {
        // Polarized bluff (~7%) on river when checked to and pot odds are wide.
        if (r < Math.max(0.07, personaProfile.riverBluff * 0.45) && raiseAct && street === 'river' && equity < 0.3 && checkAct) {
            const amount = chooseRaiseSize({ raiseAct, state, equity: 0.5, street, aggression: 0.85, rng })
            return { type: 'raise', amount: Math.max(raiseAct.min, Math.min(raiseAct.max, amount)) }
        }
        // Hero call thin (~6%): call light when equity is borderline and pot is small.
        if (r < 0.06 && callAct && equity > 0.42 && callAct.amount < state.bb * 5) return { type: 'call' }
    }
    return null
}

export default function HeuristicBot({
    state,
    seatIndex,
    aggression = 0.5,
    difficulty = 'intermediate',
    persona = null,
    postflopChart = null,
    rng = Math.random,
    equityOverride = null,
}) {
    const acts = legalActions(state)
    if (!acts.length) return { type: 'check' }
    const me = state.players[seatIndex]
    const hole = me.hole
    const street = state.street
    const personaProfile = resolvePokerPersona(persona || me.persona || me.pokerStyle)
    const opponents = state.players.filter(p => p !== me && p.status !== 'folded' && p.status !== 'sittingOut').length
    const potOdds = (() => {
        const callAct = acts.find(a => a.type === 'call')
        if (!callAct) return 0
        return callAct.amount / (state.pot + callAct.amount + 0.0001)
    })()
    let equity
    let texturePressure = 0
    const gtoAnchor = street !== 'preflop' ? postflopGtoAnchor({ state, seatIndex, postflopChart }) : null
    if (street === 'preflop') {
        const role = rolesForSeats(state.players.length, state.buttonIndex)[seatIndex]
        const roleNudge = role === 'BTN' ? 0.05 : role === 'CO' ? 0.035 : role === 'SB' ? -0.01 : role === 'BB' ? -0.025 : -0.04
        const facedRaise = state.history.some(h => h.type === 'raise')
        const raiseCount = state.history.filter(h => h.type === 'raise').length
        const threeBetPenalty = raiseCount >= 2 ? (personaProfile.foldTo3Bet - 0.55) * 0.18 : 0
        equity = preflopStrength(hole) + roleNudge - (facedRaise ? 0.055 : 0) - threeBetPenalty + personaProfile.vpip
    } else {
        equity = equityOverride == null
            ? postflopEquity(hole, state.community, opponents, postflopSampleCount(state, me), rng)
            : equityOverride
        if (state.community?.length >= 3) {
            const texture = classify(state.community)
            texturePressure = texture?.wetness === 'wet' ? -0.05 : texture?.paired ? 0.035 : 0.01
        }
    }
    const difficultyAdjust = difficulty === 'beginner' ? -0.07 : difficulty === 'advanced' ? 0.06 : 0
    equity = clamp(equity + difficultyAdjust + texturePressure, 0.02, 0.98)
    // Wave 11: ante-aware aggression boost.
    const anteBoost = state.ante > 0 ? Math.min(0.08, (state.ante * state.players.length) / Math.max(1, state.bb) * 0.05) : 0
    const effectiveAggression = clamp(aggression + anteBoost + personaProfile.aggression, 0.02, 0.98)
    const pressure = effectiveAggression * (equity - 0.5)

    // Wave 12: short-stack push/fold ICM nudges. Below ~12 BB, advanced and
    // intermediate bots collapse to a clean push/fold spectrum on preflop.
    // Push threshold is hand-strength based: nut-strong jam, mid-strength jam
    // from late position, weak hands fold.
    const stackBb = (me.stack + (me.putIn || 0)) / Math.max(1, state.bb)
    if (street === 'preflop' && stackBb <= 12 && difficulty !== 'beginner') {
        const raiseAct = acts.find(a => a.type === 'raise')
        const role = rolesForSeats(state.players.length, state.buttonIndex)[seatIndex]
        const positionLate = role === 'BTN' || role === 'CO' || role === 'SB'
        const facedRaise = state.history.some(h => h.type === 'raise')
        let pushFloor
        if (stackBb <= 6) pushFloor = positionLate ? 0.42 : 0.5
        else if (stackBb <= 9) pushFloor = positionLate ? 0.48 : 0.58
        else pushFloor = positionLate ? 0.55 : 0.65
        // When facing a raise, we need stronger to call/jam.
        if (facedRaise) pushFloor += 0.07
        if (raiseAct && equity >= pushFloor) {
            return { type: 'raise', amount: raiseAct.max }
        }
        const callAct = acts.find(a => a.type === 'call')
        if (callAct && equity >= pushFloor - 0.05 && callAct.amount >= me.stack * 0.6) {
            return { type: 'call' }
        }
        if (acts.find(a => a.type === 'fold')) return { type: 'fold' }
    }

    // Difficulty-based mistake injection runs before the standard tree.
    const mistake = injectMistake({ acts, state, equity, difficulty, street, personaProfile, rng })
    if (mistake) return mistake

    const callAct = acts.find(a => a.type === 'call')
    const checkAct = acts.find(a => a.type === 'check')
    const raiseAct = acts.find(a => a.type === 'raise')

    if (checkAct && (!callAct || callAct.amount === 0)) {
        if (raiseAct && street !== 'preflop') {
            let cbetChance = clamp(effectiveAggression * 0.28 + Math.max(0, equity - 0.55), 0.08, 0.62)
            cbetChance = blendFrequency(cbetChance, personaProfile.cbet, 0.36)
            if (gtoAnchor) cbetChance = blendFrequency(cbetChance, gtoAnchor.raise, personaProfile.gtoWeight)
            if (street === 'river' && equity < 0.34) {
                cbetChance = gtoAnchor
                    ? blendFrequency(personaProfile.riverBluff, gtoAnchor.raise, personaProfile.gtoWeight)
                    : personaProfile.riverBluff
            }
            if (equity > 0.7 || rng() < cbetChance) {
                const amount = chooseRaiseSize({ raiseAct, state, equity, street, aggression: effectiveAggression, rng })
                return { type: 'raise', amount }
            }
            return { type: 'check' }
        }
        if (raiseAct && equity > 0.7 - personaProfile.pfr * 0.35 + 0.08 * rng()) {
            const amount = chooseRaiseSize({ raiseAct, state, equity, street, aggression: effectiveAggression, rng })
            return { type: 'raise', amount }
        }
        return { type: 'check' }
    }

    if (callAct) {
        // Fold weak hands when pot odds disfavor the call.
        let foldLine = potOdds - 0.05 - personaProfile.callBias
        if (gtoAnchor) foldLine = blendFrequency(foldLine, gtoAnchor.fold + potOdds * 0.55, personaProfile.gtoWeight)
        if (equity < foldLine) {
            return { type: 'fold' }
        }
        // Re-raise (3-bet) with strong hands.
        let raiseLine = 0.78 - personaProfile.pfr * 0.55 + 0.08 * rng()
        if (gtoAnchor) raiseLine = blendFrequency(raiseLine, 1 - gtoAnchor.raise * 0.72, personaProfile.gtoWeight)
        if (equity > raiseLine && raiseAct) {
            const amount = chooseRaiseSize({ raiseAct, state, equity, street, aggression: effectiveAggression, rng })
            return { type: 'raise', amount }
        }
        // Marginal hands fold against big bets, call against small ones.
        if (equity < 0.35 && callAct.amount > state.bb * 4 && rng() > pressure + 0.5 + personaProfile.callBias) {
            return { type: 'fold' }
        }
        return { type: 'call' }
    }
    return acts[0]
}
