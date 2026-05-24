// Heuristic poker bot. Uses local strength/position heuristics and post-flop
// equity sampling only. It intentionally does not fetch or read GTO chart data.
// Trades correctness for speed: ~150 random rollouts per decision.

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
        // pocket pair
        if (high >= 10) return 0.95
        if (high >= 7) return 0.78
        return 0.62
    }
    const gap = high - low
    let s = (high + low) / 24
    if (suited) s += 0.06
    if (gap === 1) s += 0.04
    if (gap >= 4 && !suited) s -= 0.06
    if (high === 12) s += 0.05 // contains an Ace
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

// Estimate post-flop win probability via Monte Carlo against random opponents.
function postflopEquity(hole, community, opponents, samples = 120) {
    const known = [...hole, ...community]
    const remaining = buildDeck(known)
    let wins = 0, ties = 0
    for (let s = 0; s < samples; s++) {
        // Shuffle a small slice
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
    equity = Math.max(0.02, Math.min(0.98, equity + difficultyAdjust))
    equity = Math.max(0.02, Math.min(0.98, equity + texturePressure))
    const pressure = aggression * (equity - 0.5)
    // Decision tree
    const callAct = acts.find(a => a.type === 'call')
    const checkAct = acts.find(a => a.type === 'check')
    const raiseAct = acts.find(a => a.type === 'raise')
    if (checkAct && (!callAct || callAct.amount === 0)) {
        if (raiseAct && street !== 'preflop') {
            const cbetChance = Math.max(0.08, Math.min(0.42, aggression * 0.26 + Math.max(0, equity - 0.58)))
            if (equity > 0.72 || Math.random() < cbetChance) {
                const sizing = 0.22 + Math.min(0.38, equity * 0.32)
                const amount = Math.round(raiseAct.min + (raiseAct.max - raiseAct.min) * sizing)
                return { type: 'raise', amount }
            }
            return { type: 'check' }
        }
        if (raiseAct && equity > 0.72 + 0.08 * Math.random()) {
            const amount = Math.round(raiseAct.min + (raiseAct.max - raiseAct.min) * Math.min(0.45, equity * 0.42))
            return { type: 'raise', amount }
        }
        return { type: 'check' }
    }
    if (callAct) {
        if (equity < potOdds - 0.05) {
            return { type: 'fold' }
        }
        if (equity > 0.78 + 0.08 * Math.random() && raiseAct) {
            const amount = Math.round(raiseAct.min + (raiseAct.max - raiseAct.min) * Math.min(0.38, equity * 0.42))
            return { type: 'raise', amount }
        }
        if (equity < 0.35 && callAct.amount > state.bb * 4 && Math.random() > pressure + 0.5) {
            return { type: 'fold' }
        }
        return { type: 'call' }
    }
    return acts[0]
}
