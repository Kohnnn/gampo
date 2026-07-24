import { describe, it, expect } from 'vitest'
import { applyAction, createInitialState } from './Game'

// Focused settlement test for layered main/side pots with unequal all-ins.
// Scenario (3-handed, short stack all-in):
//   a  all-in for 50  total committed 50
//   b  all-in for 100 total committed 100
//   c  calls to 100   total committed 100
// Main pot  = 50 * 3 = 150  (a, b, c eligible)
// Side pot  = 50 * 2 = 100  (b, c eligible; a locked out)
// Board KK 7 2 5 gives:
//   a = quad kings  -> wins main pot (150)
//   b = 7s full of kings, c = 2s full of kings -> b wins side pot (100)

function buildRiverState() {
    const state = createInitialState({
        players: [
            { id: 'a', name: 'a', stack: 1000 },
            { id: 'b', name: 'b', stack: 1000 },
            { id: 'c', name: 'c', stack: 1000 },
        ],
        sb: 1,
        bb: 2,
        buttonIndex: 0,
    })
    state.street = 'river'
    state.community = ['Ks', 'Kd', '7h', '2c', '5s']
    state.pot = 250
    state.currentBet = 50
    state.sidePots = []
    const [a, b, c] = state.players
    a.hole = ['Kh', 'Kc']; a.status = 'allin'; a.stack = 0; a.putIn = 0; a.committed = 50; a.lastAction = 'call'
    b.hole = ['7s', '7d']; b.status = 'allin'; b.stack = 0; b.putIn = 50; b.committed = 100; b.lastAction = 'raise'
    c.hole = ['2s', '2d']; c.status = 'active'; c.stack = 50; c.putIn = 0; c.committed = 50; c.lastAction = null
    state.toAct = 2 // c to act
    return state
}

describe('concludeHand — layered side pots', () => {
    it('settles main and side pots by eligibility with unequal all-ins', () => {
        const state = buildRiverState()
        // c calls the outstanding 50 and is now all-in; betting closes -> showdown.
        const done = applyAction(state, { type: 'call' })

        expect(done.street).toBe('showdown')

        const won = Object.fromEntries(done.winners.map(w => [w.id, w.share]))
        expect(won.a).toBe(150) // main pot only (locked out of side)
        expect(won.b).toBe(100) // side pot
        expect(won.c).toBeUndefined() // beaten everywhere

        // Two distinct layers recorded.
        expect(done.sidePots).toHaveLength(2)
        expect(done.sidePots[0]).toMatchObject({ amount: 150 })
        expect(done.sidePots[0].eligible.sort()).toEqual(['a', 'b', 'c'])
        expect(done.sidePots[1]).toMatchObject({ amount: 100 })
        expect(done.sidePots[1].eligible.sort()).toEqual(['b', 'c'])

        // Chips conserved: total awarded equals total committed.
        const totalAwarded = done.winners.reduce((s, w) => s + w.share, 0)
        expect(totalAwarded).toBe(250)

        const seatA = done.players.find(p => p.id === 'a')
        const seatB = done.players.find(p => p.id === 'b')
        expect(seatA.stack).toBe(150)
        expect(seatB.stack).toBe(100)
    })
})
