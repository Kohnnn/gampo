import { describe, expect, it } from 'vitest'
import HeuristicBot, {
    createSeededPokerRng,
    postflopGtoAnchor,
    postflopSampleCount,
    resolvePokerPersona,
} from './HeuristicBot'

function basePlayers() {
    return [
        { id: 'btn', name: 'btn', stack: 1000, hole: ['As', 'Kc'], status: 'active', putIn: 240, lastAction: 'raise', isHuman: false },
        { id: 'sb', name: 'sb', stack: 1000, hole: ['2s', '2c'], status: 'folded', putIn: 10, lastAction: 'fold', isHuman: false },
        { id: 'bot', name: 'bot', stack: 980, hole: ['Ts', '8d'], status: 'active', putIn: 20, lastAction: null, isHuman: false },
        { id: 'utg', name: 'utg', stack: 1000, hole: ['3s', '4c'], status: 'folded', putIn: 0, lastAction: 'fold', isHuman: false },
        { id: 'mp', name: 'mp', stack: 1000, hole: ['5s', '6c'], status: 'folded', putIn: 0, lastAction: 'fold', isHuman: false },
        { id: 'co', name: 'co', stack: 1000, hole: ['7s', '8c'], status: 'folded', putIn: 0, lastAction: 'fold', isHuman: false },
    ]
}

function preflopFacingOpenState() {
    return {
        players: basePlayers(),
        deck: [],
        community: [],
        pot: 300,
        sidePots: [],
        sb: 10,
        bb: 20,
        ante: 0,
        buttonIndex: 0,
        toAct: 2,
        currentBet: 240,
        minRaise: 80,
        street: 'preflop',
        history: [
            { type: 'blind', player: 'sb', amount: 10 },
            { type: 'blind', player: 'bot', amount: 20 },
            { type: 'raise', player: 'btn', amount: 240 },
        ],
        winners: [],
        showdownInfo: null,
    }
}

function riverCheckState() {
    return {
        players: [
            { id: 'btn', name: 'btn', stack: 900, hole: ['As', 'Kc'], status: 'active', putIn: 0, lastAction: null, isHuman: false },
            { id: 'bot', name: 'bot', stack: 900, hole: ['7s', '2d'], status: 'active', putIn: 0, lastAction: null, isHuman: false },
        ],
        deck: [],
        community: ['Ah', 'Kd', '8c', '4s', '3h'],
        pot: 240,
        sidePots: [],
        sb: 10,
        bb: 20,
        ante: 0,
        buttonIndex: 0,
        toAct: 1,
        currentBet: 0,
        minRaise: 20,
        street: 'river',
        history: [{ type: 'street', street: 'river' }],
        winners: [],
        showdownInfo: null,
    }
}

const postflopFixture = {
    matchup: {
        'BTN-vs-BB': {
            'rfi-call': {
                flop: {
                    'rainbow-high': {
                        sizings: [{ size: '33%', freq: 0.72 }, { size: 'check', freq: 0.28 }],
                        value: ['AA'],
                        bluff: ['T9s'],
                        marginal: ['JTs'],
                    },
                },
            },
        },
    },
}

function postflopChartState() {
    const players = basePlayers()
    players[2] = { ...players[2], hole: ['As', 'Ad'], status: 'active', putIn: 0 }
    return {
        ...preflopFacingOpenState(),
        players,
        community: ['Kh', '7d', '2c'],
        pot: 180,
        toAct: 2,
        currentBet: 0,
        street: 'flop',
        history: [{ type: 'street', street: 'flop' }],
    }
}

function actionDistribution({ persona, stateFactory, count = 40, extra = {} }) {
    const actions = { fold: 0, call: 0, check: 0, raise: 0 }
    for (let i = 0; i < count; i += 1) {
        const state = stateFactory()
        const action = HeuristicBot({
            state,
            seatIndex: state.toAct,
            aggression: 0.5,
            difficulty: 'intermediate',
            persona,
            rng: createSeededPokerRng(`${persona}:${i}`),
            ...extra,
        })
        actions[action.type] += 1
    }
    return actions
}

describe('HeuristicBot persona model', () => {
    it('pins deterministic preflop action distributions by persona', () => {
        expect(actionDistribution({ persona: 'tight-passive', stateFactory: preflopFacingOpenState })).toEqual({
            fold: 40,
            call: 0,
            check: 0,
            raise: 0,
        })
        expect(actionDistribution({ persona: 'cautious', stateFactory: preflopFacingOpenState })).toEqual({
            fold: 40,
            call: 0,
            check: 0,
            raise: 0,
        })
        expect(actionDistribution({ persona: 'analyst', stateFactory: preflopFacingOpenState })).toEqual({
            fold: 0,
            call: 40,
            check: 0,
            raise: 0,
        })
        expect(actionDistribution({ persona: 'whale', stateFactory: preflopFacingOpenState })).toEqual({
            fold: 0,
            call: 40,
            check: 0,
            raise: 0,
        })
    })

    it('uses the requested river bluff bands by persona', () => {
        expect(resolvePokerPersona('whale').riverBluff).toBeCloseTo(0.25)
        expect(resolvePokerPersona('loose-aggressive').riverBluff).toBeCloseTo(0.18)
        expect(resolvePokerPersona('tight-passive').riverBluff).toBeCloseTo(0.04)

        const whale = actionDistribution({
            persona: 'whale',
            stateFactory: riverCheckState,
            count: 120,
            extra: { equityOverride: 0.22 },
        })
        const tight = actionDistribution({
            persona: 'tight-passive',
            stateFactory: riverCheckState,
            count: 120,
            extra: { equityOverride: 0.22 },
        })
        expect(whale.raise).toBeGreaterThan(tight.raise * 2)
    })

    it('bumps postflop equity rollouts to 250 when SPR is below 4', () => {
        const lowSpr = postflopChartState()
        lowSpr.players[2].stack = 300
        lowSpr.pot = 120
        const deepSpr = postflopChartState()
        deepSpr.players[2].stack = 1000
        deepSpr.pot = 120

        expect(postflopSampleCount(lowSpr, lowSpr.players[2])).toBe(250)
        expect(postflopSampleCount(deepSpr, deepSpr.players[2])).toBe(150)
    })

    it('uses matching postflop GTO chart frequencies as a soft anchor', () => {
        const state = postflopChartState()
        const anchor = postflopGtoAnchor({ state, seatIndex: 2, postflopChart: postflopFixture })

        expect(anchor.bucket).toBe('value')
        expect(anchor.handCode).toBe('AA')
        expect(anchor.textureKey).toBe('rainbow-high')
        expect(anchor.raise).toBeGreaterThan(0.8)
    })
})
