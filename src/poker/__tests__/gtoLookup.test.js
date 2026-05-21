import { describe, expect, it } from 'vitest'
import { buildPayload } from '../gto/lookup'

// Minimal preflop fixture: BTN raises 100% AA, folds 22.
const preflopFixture = {
    schemaVersion: 1,
    positions: {
        BTN: {
            rfi: {
                size: '2.5bb',
                ranges: {
                    AA: { raise: 1.0 },
                    KK: { raise: 0.7, call: 0.3 },
                    '22': { raise: 0.0 },
                },
            },
        },
        BB: {
            'vs-btn-open': {
                size: 'facing 2.5bb',
                ranges: {
                    AA: { raise: 1.0 },
                    KK: { raise: 0.4, call: 0.6 },
                    '72o': { call: 0.0 },
                },
            },
        },
    },
}

const postflopFixture = {
    schemaVersion: 1,
    matchup: {
        'BTN-vs-BB': {
            'rfi-call': {
                flop: {
                    'rainbow-high': {
                        advantage: { nut: 18, range: 6 },
                        mdf: 0.6,
                        sizings: [
                            { size: '33%', freq: 0.78 },
                            { size: 'check', freq: 0.22 },
                        ],
                        value: ['AA', 'KK', 'AKs'],
                        bluff: ['T9s', '98s'],
                        marginal: ['JTs'],
                    },
                    default: {
                        advantage: { nut: 0, range: 0 },
                        mdf: 0.5,
                        sizings: [{ size: '33%', freq: 1 }],
                        value: ['AA'],
                        bluff: [],
                        marginal: [],
                    },
                },
            },
        },
        default: {
            'rfi-call': {
                flop: {
                    default: {
                        advantage: { nut: 0, range: 0 },
                        mdf: 0.5,
                        sizings: [{ size: '33%', freq: 1 }],
                        value: ['AA'],
                        bluff: [],
                        marginal: [],
                    },
                },
            },
        },
    },
    exploits: {
        overfold: { label: 'Overfolder', delta: 'cbet more', evDelta: { gto: 0.4, exploit: 0.6, unit: 'bb' } },
    },
}

function fakeState({ street = 'preflop', community = [], heroSeat = 0, buttonIndex = 0, holeCards = ['As', 'Ad'], history = [] } = {}) {
    return {
        players: [
            { id: 'you', name: 'you', stack: 200, hole: holeCards, status: 'active', putIn: 0, lastAction: null, isHuman: true },
            { id: 'sb', name: 'sb', stack: 200, hole: [], status: 'active', putIn: 0, lastAction: null, isHuman: false },
            { id: 'bb', name: 'bb', stack: 200, hole: [], status: 'active', putIn: 0, lastAction: null, isHuman: false },
            { id: 'utg', name: 'utg', stack: 200, hole: [], status: 'active', putIn: 0, lastAction: null, isHuman: false },
            { id: 'mp', name: 'mp', stack: 200, hole: [], status: 'active', putIn: 0, lastAction: null, isHuman: false },
            { id: 'co', name: 'co', stack: 200, hole: [], status: 'active', putIn: 0, lastAction: null, isHuman: false },
        ].map((p, i) => i === heroSeat ? { ...p, isHuman: true } : { ...p, isHuman: false }),
        community,
        pot: 0,
        sidePots: [],
        sb: 1, bb: 2,
        buttonIndex,
        toAct: heroSeat,
        currentBet: 2,
        minRaise: 2,
        street,
        history,
        winners: [],
        showdownInfo: null,
    }
}

describe('GTO lookup', () => {
    it('returns null when no preflop data', () => {
        const out = buildPayload({ state: fakeState(), preflop: null })
        expect(out).toBeNull()
    })
    it('builds preflop payload for BTN RFI', () => {
        const state = fakeState({ heroSeat: 0, buttonIndex: 0, holeCards: ['As', 'Ad'] })
        const out = buildPayload({ state, preflop: preflopFixture, postflop: postflopFixture })
        expect(out.mode).toBe('preflop')
        expect(out.heroRole).toBe('BTN')
        expect(out.heroHand).toBe('AA')
        expect(out.grid.cells.AA.raise).toBe(1.0)
        expect(out.grid.cells['22'].fold).toBe(1.0)
    })
    it('detects BB vs BTN open context', () => {
        const state = fakeState({
            heroSeat: 2,
            buttonIndex: 0,
            holeCards: ['Ks', 'Kh'],
            history: [{ type: 'raise', player: 'you', amount: 5 }],
        })
        const out = buildPayload({ state, preflop: preflopFixture, postflop: postflopFixture })
        expect(out.mode).toBe('preflop')
        expect(out.heroRole).toBe('BB')
        expect(out.grid.cells.KK.call).toBeCloseTo(0.6, 5)
    })
    it('falls back to fold when cell missing', () => {
        const state = fakeState({ heroSeat: 0, buttonIndex: 0, holeCards: ['7s', '2c'] })
        const out = buildPayload({ state, preflop: preflopFixture, postflop: postflopFixture })
        expect(out.grid.cells['72o'].fold).toBe(1)
    })
    it('builds postflop payload on a flop', () => {
        const state = fakeState({
            street: 'flop',
            community: ['As', '7d', '2c'],
            heroSeat: 2, // BB
            buttonIndex: 0, // BTN
            history: [{ type: 'raise', player: 'you', amount: 5 }],
        })
        const out = buildPayload({ state, preflop: preflopFixture, postflop: postflopFixture })
        expect(out.mode).toBe('postflop')
        expect(out.advantages.nut).toBe(18)
        expect(out.mdf).toBeCloseTo(0.6)
        expect(out.sizings).toEqual([{ size: '33%', freq: 0.78 }, { size: 'check', freq: 0.22 }])
        expect(out.breakdown.value).toContain('AA')
    })
    it('exposes exploit delta when exploit selected', () => {
        const state = fakeState({
            street: 'flop',
            community: ['As', '7d', '2c'],
            heroSeat: 2,
            buttonIndex: 0,
            history: [{ type: 'raise', player: 'you', amount: 5 }],
        })
        const out = buildPayload({ state, preflop: preflopFixture, postflop: postflopFixture, exploit: 'overfold' })
        expect(out.exploit?.label).toBe('Overfolder')
        expect(out.exploit?.evDelta?.exploit).toBe(0.6)
    })
})
