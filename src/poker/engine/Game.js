// No-Limit Texas Hold'em engine for GamPo. JavaScript reimplementation, browser-only.
// Inspired by rlcard's clean state machine (Game / Round / Player / Judger).
// Hand evaluation delegated to pokersolver.

import { Hand as SolverHand } from 'pokersolver'
import { nextRoll } from '../../utils/fairRng'

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
const SUITS = ['s', 'h', 'd', 'c']

export function buildDeck() {
    const deck = []
    for (const r of RANKS) for (const s of SUITS) deck.push(r + s)
    return shuffle(deck)
}

function shuffle(arr) {
    const out = arr.slice()
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(nextRoll('poker-shuffle').roll * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
}

// Player state: { id, name, stack, hole, status, putIn, lastAction, isHuman, persona }
// status: active | folded | allin | sittingOut

export const STREETS = ['preflop', 'flop', 'turn', 'river', 'showdown']

export function createInitialState({ players, sb = 1, bb = 2, ante = 0, buttonIndex = 0 }) {
    return {
        players: players.map(p => ({
            id: p.id, name: p.name, stack: p.stack, hole: [],
            status: p.stack > 0 ? 'active' : 'sittingOut',
            putIn: 0, committed: 0, lastAction: null, isHuman: !!p.isHuman, avatar: p.avatar || null,
            persona: p.persona || p.pokerStyle || null,
            pokerStyle: p.pokerStyle || p.persona?.pokerStyle || p.persona?.style || null,
        })),
        deck: [],
        community: [],
        pot: 0,
        sidePots: [],
        sb, bb, ante,
        buttonIndex,
        toAct: -1,
        currentBet: 0,
        minRaise: bb,
        street: 'idle',
        history: [],
        winners: [],
        showdownInfo: null,
    }
}

function nextActiveIndex(state, fromIndex) {
    const n = state.players.length
    for (let i = 1; i <= n; i++) {
        const idx = (fromIndex + i) % n
        const p = state.players[idx]
        if (p.status === 'active') return idx
    }
    return -1
}

function activeCount(state) {
    return state.players.filter(p => p.status === 'active').length
}

function liveCount(state) {
    return state.players.filter(p => p.status !== 'folded' && p.status !== 'sittingOut').length
}

export function startHand(state) {
    const next = structuredClone(state)
    next.deck = buildDeck()
    next.community = []
    next.pot = 0
    next.sidePots = []
    next.history = []
    next.winners = []
    next.showdownInfo = null
    next.currentBet = 0
    next.minRaise = next.bb
    next.street = 'preflop'
    for (const p of next.players) {
        p.hole = []
        p.putIn = 0
        p.committed = 0
        p.lastAction = null
        p.status = p.stack > 0 ? 'active' : 'sittingOut'
    }
    // Move button to next eligible seat
    next.buttonIndex = nextActiveIndex(next, next.buttonIndex)
    if (next.buttonIndex < 0) return next
    // Post antes before blinds so tournament-style levels can be simulated.
    if (next.ante > 0) {
        for (let a = 0; a < next.players.length; a++) {
            if (next.players[a].status === 'active') postBlind(next, a, next.ante, 'ante')
        }
    }
    // Post blinds (heads-up: button posts SB)
    const live = next.players.filter(p => p.status === 'active')
    let sbIdx, bbIdx
    if (live.length === 2) {
        sbIdx = next.buttonIndex
        bbIdx = nextActiveIndex(next, sbIdx)
    } else {
        sbIdx = nextActiveIndex(next, next.buttonIndex)
        bbIdx = nextActiveIndex(next, sbIdx)
    }
    postBlind(next, sbIdx, next.sb)
    postBlind(next, bbIdx, next.bb)
    next.currentBet = next.bb
    // Deal 2 hole cards to each active player, starting left of button
    let i = nextActiveIndex(next, next.buttonIndex)
    for (let r = 0; r < 2; r++) {
        let cur = i
        for (let n = 0; n < live.length; n++) {
            const p = next.players[cur]
            if (p.status === 'active') p.hole.push(next.deck.shift())
            cur = nextActiveIndex(next, cur)
        }
    }
    // First to act preflop is left of BB
    next.toAct = nextActiveIndex(next, bbIdx)
    return next
}

function postBlind(state, idx, amount, type = 'blind') {
    const p = state.players[idx]
    const pay = Math.min(p.stack, amount)
    p.stack -= pay
    p.putIn += pay
    p.committed += pay
    state.pot += pay
    if (p.stack === 0) p.status = 'allin'
    state.history.push({ type, player: p.id, amount: pay })
}

export function legalActions(state) {
    if (state.toAct < 0) return []
    const p = state.players[state.toAct]
    if (!p || p.status !== 'active') return []
    const toCall = state.currentBet - p.putIn
    const acts = []
    if (toCall <= 0) acts.push({ type: 'check' })
    else acts.push({ type: 'call', amount: Math.min(toCall, p.stack) })
    if (toCall > 0) acts.push({ type: 'fold' })
    // Bet/raise
    const minBet = state.currentBet === 0 ? state.bb : state.currentBet + state.minRaise
    if (p.stack > 0) {
        const max = p.stack + p.putIn
        if (max > state.currentBet) {
            acts.push({ type: 'raise', min: Math.min(minBet, max), max })
        }
    }
    return acts
}

export function applyAction(state, action) {
    const next = structuredClone(state)
    const p = next.players[next.toAct]
    if (!p) return next
    const toCall = next.currentBet - p.putIn
    if (action.type === 'fold') {
        p.status = 'folded'
        p.lastAction = 'fold'
        next.history.push({ type: 'fold', player: p.id })
    } else if (action.type === 'check') {
        p.lastAction = 'check'
        next.history.push({ type: 'check', player: p.id })
    } else if (action.type === 'call') {
        const pay = Math.min(toCall, p.stack)
        p.stack -= pay
        p.putIn += pay
        p.committed += pay
        next.pot += pay
        if (p.stack === 0) p.status = 'allin'
        p.lastAction = 'call'
        next.history.push({ type: 'call', player: p.id, amount: pay })
    } else if (action.type === 'raise') {
        const target = Math.min(action.amount, p.stack + p.putIn)
        const pay = target - p.putIn
        p.stack -= pay
        p.putIn += pay
        p.committed += pay
        next.pot += pay
        const oldBet = next.currentBet
        if (target > next.currentBet) {
            next.minRaise = Math.max(next.minRaise, target - oldBet)
            next.currentBet = target
        }
        if (p.stack === 0) p.status = 'allin'
        p.lastAction = 'raise'
        next.history.push({ type: 'raise', player: p.id, amount: target })
    }
    // Determine if betting round is complete
    if (liveCount(next) === 1) {
        return concludeHand(next)
    }
    if (bettingClosed(next)) {
        return advanceStreet(next)
    }
    next.toAct = nextActiveIndex(next, next.toAct)
    return next
}

function bettingClosed(state) {
    const live = state.players.filter(p => p.status === 'active' || p.status === 'allin')
    if (live.length === 0) return true
    const active = state.players.filter(p => p.status === 'active')
    if (active.length === 0) return true
    // All active players have matched currentBet and have acted at least once
    const allMatched = active.every(p => p.putIn === state.currentBet)
    const allActed = active.every(p => p.lastAction !== null)
    return allMatched && allActed
}

function advanceStreet(state) {
    const next = structuredClone(state)
    // Reset put-in on street transition
    for (const p of next.players) {
        p.putIn = 0
        if (p.status === 'active') p.lastAction = null
    }
    next.currentBet = 0
    next.minRaise = next.bb
    if (next.street === 'preflop') {
        next.community.push(next.deck.shift(), next.deck.shift(), next.deck.shift())
        next.street = 'flop'
    } else if (next.street === 'flop') {
        next.community.push(next.deck.shift())
        next.street = 'turn'
    } else if (next.street === 'turn') {
        next.community.push(next.deck.shift())
        next.street = 'river'
    } else if (next.street === 'river') {
        return concludeHand(next)
    }
    // Mark street transition in history so panels can split action by street.
    next.history.push({ type: 'street', street: next.street })
    next.toAct = nextActiveIndex(next, next.buttonIndex)

    // QA v4: when no one is active to act (everyone all-in / folded), keep
    // burning streets until showdown so the hand can never freeze waiting on
    // a phantom turn.
    if (next.toAct < 0) {
        const stillLive = next.players.filter(p => p.status !== 'folded' && p.status !== 'sittingOut')
        if (stillLive.length <= 1 || next.street === 'river') {
            return concludeHand(next)
        }
        return advanceStreet(next)
    }
    return next
}

function concludeHand(state) {
    const next = structuredClone(state)
    next.street = 'showdown'
    const live = next.players.filter(p => p.status !== 'folded' && p.status !== 'sittingOut')
    if (live.length === 1) {
        live[0].stack += next.pot
        next.winners = [{ id: live[0].id, share: next.pot, hand: null }]
        next.pot = 0
        next.toAct = -1
        return next
    }
    // Showdown: solve hands for every player still in the hand.
    const ranked = live.map(p => {
        const cards = [...p.hole, ...next.community].map(c => c.toUpperCase().replace('T', 'T'))
        const hand = SolverHand.solve(cards)
        return { player: p, hand }
    })
    const handById = new Map(ranked.map(r => [r.player.id, r.hand]))

    // Build layered main/side pots from every seat's total committed chips.
    // Folded players' committed chips are dead money that still fills lower
    // layers; only non-folded seats can win a layer they are eligible for.
    const contributors = next.players.filter(p => p.committed > 0)
    const levels = [...new Set(contributors.map(p => p.committed))].sort((a, b) => a - b)
    const wonById = new Map()
    const pots = []
    let prevLevel = 0
    for (const level of levels) {
        const layerContributors = contributors.filter(p => p.committed >= level)
        const amount = (level - prevLevel) * layerContributors.length
        prevLevel = level
        if (amount <= 0) continue
        // Eligible = non-folded seats who reached this layer.
        const eligible = ranked.filter(r => r.player.committed >= level)
        if (eligible.length === 0) continue
        const bestHands = SolverHand.winners(eligible.map(r => r.hand))
        const potWinners = eligible.filter(r => bestHands.includes(r.hand))
        // Split with odd chips assigned by seat order (left of button first).
        const ordered = potWinners
            .map(r => ({ r, seat: next.players.indexOf(r.player) }))
            .sort((a, b) => a.seat - b.seat)
        const base = Math.floor(amount / ordered.length)
        let remainder = amount - base * ordered.length
        for (const { r } of ordered) {
            const give = base + (remainder > 0 ? 1 : 0)
            if (remainder > 0) remainder--
            r.player.stack += give
            wonById.set(r.player.id, (wonById.get(r.player.id) || 0) + give)
        }
        pots.push({ amount, eligible: eligible.map(r => r.player.id) })
    }

    next.sidePots = pots
    next.winners = [...wonById.entries()].map(([id, share]) => ({
        id, share, hand: handById.get(id)?.descr ?? null,
    }))
    next.pot = 0
    next.showdownInfo = ranked.map(r => ({ id: r.player.id, descr: r.hand.descr, hand: r.hand.cards.map(c => c.toString()) }))
    next.toAct = -1
    return next
}

export function dealNext(state) {
    return startHand(state)
}
