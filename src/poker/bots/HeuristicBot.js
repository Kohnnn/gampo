// Heuristic poker bot. Uses local strength/position heuristics and post-flop
// equity sampling only. It intentionally does not fetch or read GTO chart data.
// Trades correctness for speed: ~150 random rollouts per decision.
//
// Wave 11 upgrades:
//  - ante-aware aggression boost when antes are in the pot
//  - smarter raise sizing tied to street / pot / SPR
//  - difficulty-based mistake injection (beginner over-calls, advanced bluff-catches)
//  - post-flop draw-aware semibluff weights via texture

import { Hand as SolverHand } from 'pokersolver'
import { legalActions } from '../engine/Game'
import { rolesForSeats } from '../util/positions'
import { classify } from '../util/textureClassify'

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
const SUITS = ['s', 'h', 'd', 'c']

function rankIdx(r) { return RANKS.indexOf(r.toUpperCase()) }

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

function postflopEquity(hole, community, opponents, samples = 120) {
    const known = [...hole, ...community]
    const remaining = buildDeck(known)
    let wins = 0, ties = 0
    for (let s = 0; s < samples; s++) {
        const pool = remaining.slice()
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
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

// Pot-relative raise sizing. Returns an integer chip amount within [r.min, r.max].
function chooseRaiseSize({ raiseAct, state, equity, street, aggression }) {
    if (!raiseAct) return null
    const pot = Math.max(1, state.pot)
    let frac
    if (street === 'preflop') {
        // Preflop: 2.5x BB open or 3x iso, 8-12bb if 3-bet.
        const facedRaise = state.history.some(h => h.type === 'raise')
        if (!facedRaise) {
            frac = (state.bb || 1) * 2.5 + Math.random() * (state.bb || 1) * 0.6
            return Math.round(Math.max(raiseAct.min, Math.min(raiseAct.max, frac)))
        }
        // 3-bet: target ~3.2x last bet
        const target = state.currentBet * 3.2
        return Math.round(Math.max(raiseAct.min, Math.min(raiseAct.max, target)))
    }
    // Postflop: size by equity and aggression. Strong = 80% pot, medium = 60%, polar = 110%.
    if (equity > 0.85) frac = 0.85 + Math.random() * 0.25
    else if (equity > 0.7) frac = 0.6 + Math.random() * 0.18
    else if (equity > 0.55) frac = 0.4 + Math.random() * 0.18
    else frac = 0.32 + Math.random() * 0.2
    if (aggression > 0.7) frac += 0.08
    if (street === 'river' && equity < 0.45) frac = 1.0 + Math.random() * 0.4 // overbet bluff
    const target = pot * frac + state.currentBet
    return Math.round(Math.max(raiseAct.min, Math.min(raiseAct.max, target)))
}

// Difficulty-based mistake injection. Returns null to keep the bot's decision,
// or a forced action object to override it.
function injectMistake({ acts, state, hole, equity, difficulty, street }) {
    const callAct = acts.find(a => a.type === 'call')
    const checkAct = acts.find(a => a.type === 'check')
    const raiseAct = acts.find(a => a.type === 'raise')
    const r = Math.random()

    if (difficulty === 'beginner') {
        // Over-calls weak holdings (~10%) and slow-plays monsters (~6%).
        if (r < 0.1 && callAct && equity < 0.32) return { type: 'call' }
        if (r < 0.06 && checkAct && equity > 0.78) return { type: 'check' }
    } else if (difficulty === 'advanced') {
        // Polarized bluff (~7%) on river when checked to and pot odds are wide.
        if (r < 0.07 && raiseAct && street === 'river' && equity < 0.3 && checkAct) {
            const amount = chooseRaiseSize({ raiseAct, state, equity: 0.5, street, aggression: 0.85 })
            return { type: 'raise', amount: Math.max(raiseAct.min, Math.min(raiseAct.max, amount)) }
        }
        // Hero call thin (~6%): call light when equity is borderline and pot is small.
        if (r < 0.06 && callAct && equity > 0.42 && callAct.amount < state.bb * 5) return { type: 'call' }
    }
    return null
}

export default function HeuristicBot({ state, seatIndex, aggression = 0.5, difficulty = 'intermediate' }) {
    const acts = legalActions(state)
    if (!acts.length) return { type: 'check' }
    const me = state.players[seatIndex]
    const hole = me.hole
    const street = state.street
    const opponents = state.players.filter(p => p !== me && p.status !== 'folded' && p.status !== 'sittingOut').length
    const potOdds = (() => {
        const callAct = acts.find(a => a.type === 'call')
        if (!callAct) return 0
        return callAct.amount / (state.pot + callAct.amount + 0.0001)
    })()
    let equity
    let texturePressure = 0
    if (street === 'preflop') {
        const role = rolesForSeats(state.players.length, state.buttonIndex)[seatIndex]
        const roleNudge = role === 'BTN' ? 0.05 : role === 'CO' ? 0.035 : role === 'SB' ? -0.01 : role === 'BB' ? -0.025 : -0.04
        const facedRaise = state.history.some(h => h.type === 'raise')
        equity = preflopStrength(hole) + roleNudge - (facedRaise ? 0.055 : 0)
    } else {
        equity = postflopEquity(hole, state.community, opponents)
        if (state.community?.length >= 3) {
            const texture = classify(state.community)
            texturePressure = texture?.wetness === 'wet' ? -0.05 : texture?.paired ? 0.035 : 0.01
        }
    }
    const difficultyAdjust = difficulty === 'beginner' ? -0.07 : difficulty === 'advanced' ? 0.06 : 0
    equity = Math.max(0.02, Math.min(0.98, equity + difficultyAdjust + texturePressure))
    // Wave 11: ante-aware aggression boost.
    const anteBoost = state.ante > 0 ? Math.min(0.08, (state.ante * state.players.length) / Math.max(1, state.bb) * 0.05) : 0
    const effectiveAggression = Math.min(0.98, aggression + anteBoost)
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
    const mistake = injectMistake({ acts, state, hole, equity, difficulty, street })
    if (mistake) return mistake

    const callAct = acts.find(a => a.type === 'call')
    const checkAct = acts.find(a => a.type === 'check')
    const raiseAct = acts.find(a => a.type === 'raise')

    if (checkAct && (!callAct || callAct.amount === 0)) {
        if (raiseAct && street !== 'preflop') {
            const cbetChance = Math.max(0.08, Math.min(0.46, effectiveAggression * 0.28 + Math.max(0, equity - 0.55)))
            if (equity > 0.7 || Math.random() < cbetChance) {
                const amount = chooseRaiseSize({ raiseAct, state, equity, street, aggression: effectiveAggression })
                return { type: 'raise', amount }
            }
            return { type: 'check' }
        }
        if (raiseAct && equity > 0.7 + 0.08 * Math.random()) {
            const amount = chooseRaiseSize({ raiseAct, state, equity, street, aggression: effectiveAggression })
            return { type: 'raise', amount }
        }
        return { type: 'check' }
    }

    if (callAct) {
        // Fold weak hands when pot odds disfavor the call.
        if (equity < potOdds - 0.05) {
            return { type: 'fold' }
        }
        // Re-raise (3-bet) with strong hands.
        if (equity > 0.78 + 0.08 * Math.random() && raiseAct) {
            const amount = chooseRaiseSize({ raiseAct, state, equity, street, aggression: effectiveAggression })
            return { type: 'raise', amount }
        }
        // Marginal hands fold against big bets, call against small ones.
        if (equity < 0.35 && callAct.amount > state.bb * 4 && Math.random() > pressure + 0.5) {
            return { type: 'fold' }
        }
        return { type: 'call' }
    }
    return acts[0]
}
