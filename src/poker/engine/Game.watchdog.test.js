import { describe, it, expect } from 'vitest'
import { applyAction, createInitialState, legalActions, startHand } from './Game'

// Simulate a 6-handed table. Verify the engine never lets a hand stall
// when a betting round closes with no active actor (e.g. everyone all-in).

function seat(id, opts = {}) {
    return { id, name: id, stack: opts.stack ?? 200, isHuman: false, ...opts }
}

describe('Game.advanceStreet — QA v4 watchdog', () => {
    it('skips through streets to showdown when only one live player remains', () => {
        const players = [seat('a'), seat('b'), seat('c')]
        let state = startHand(createInitialState({ players, sb: 1, bb: 2, buttonIndex: 0 }))
        // Force two players to fold so only one remains live.
        state = applyAction(state, { type: 'fold' })
        state = applyAction(state, { type: 'fold' })
        // One actor left; engine should conclude immediately.
        expect(state.street).toBe('showdown')
        expect(state.winners.length).toBe(1)
    })

    it('legalActions returns empty when toAct is -1', () => {
        const players = [seat('a'), seat('b')]
        const state = createInitialState({ players, sb: 1, bb: 2, buttonIndex: 0 })
        // toAct: -1 in idle state.
        expect(legalActions(state)).toEqual([])
    })

    it('does not crash when applying check after a hand ends', () => {
        const players = [seat('a'), seat('b')]
        let state = startHand(createInitialState({ players, sb: 1, bb: 2, buttonIndex: 0 }))
        state = applyAction(state, { type: 'fold' })
        // After fold, opponent wins by default.
        expect(state.street).toBe('showdown')
        // Re-applying any action should be a no-op (toAct === -1).
        const after = applyAction(state, { type: 'check' })
        expect(after.street).toBe('showdown')
    })

    it('preserves per-seat poker persona metadata through initial state and deal', () => {
        const players = [
            seat('you', { isHuman: true }),
            seat('bot-a', { persona: { pokerStyle: 'tight-passive', name: 'bot-a' }, pokerStyle: 'tight-passive' }),
            seat('bot-b', { persona: { pokerStyle: 'loose-aggressive', name: 'bot-b' }, pokerStyle: 'loose-aggressive' }),
        ]
        const initial = createInitialState({ players, sb: 1, bb: 2, buttonIndex: 0 })
        expect(initial.players[1].persona.pokerStyle).toBe('tight-passive')
        expect(initial.players[2].pokerStyle).toBe('loose-aggressive')

        const dealt = startHand(initial)
        expect(dealt.players[1].persona.pokerStyle).toBe('tight-passive')
        expect(dealt.players[2].pokerStyle).toBe('loose-aggressive')
    })
})
