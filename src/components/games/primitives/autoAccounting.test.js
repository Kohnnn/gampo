// QA021 (#30): the shared Auto loop must count accepted rounds, not attempts.
// A refusal is not a round: it must not spend the configured count, must not
// move session profit, and must not trip a stop limit. Plinko resolves
// `{profit: 0}` immediately after an accepted debit (settlement arrives later),
// so "profit === 0" can never be the discriminator — the kind is.
import { describe, expect, it } from 'vitest'
import {
    acceptedResult,
    accountAutoRound,
    normalizeBetResult,
    notAdmittedResult,
    rejectedResult,
} from './autoAccounting'

const state = (overrides = {}) => ({ rounds: 0, refusals: 0, sessionProfit: 0, lastProfit: 0, lastKind: null, ...overrides })

describe('normalizeBetResult', () => {
    it('keeps an explicit six-kind envelope and its top-level profit', () => {
        expect(normalizeBetResult(rejectedResult('insufficient-funds'))).toMatchObject({ kind: 'rejected', profit: 0 })
        expect(normalizeBetResult(notAdmittedResult('locked'))).toMatchObject({ kind: 'not-admitted', profit: 0 })
        expect(normalizeBetResult(acceptedResult(12.5))).toMatchObject({ kind: 'committed', profit: 12.5 })
    })

    it('reads profit from a committed authority envelope carried under value', () => {
        expect(normalizeBetResult({ kind: 'committed', value: { profit: 7.25 } }).profit).toBe(7.25)
    })

    it('treats a legacy untyped result as committed, preserving current behaviour', () => {
        expect(normalizeBetResult({ profit: 3 }).kind).toBe('committed')
        expect(normalizeBetResult({ profit: 0 }).kind).toBe('committed')
    })
})

describe('accountAutoRound', () => {
    it('counts an accepted round and accumulates its profit', () => {
        const { state: next, accepted, stop } = accountAutoRound(state(), acceptedResult(4))
        expect(accepted).toBe(true)
        expect(stop).toBe(false)
        expect(next.rounds).toBe(1)
        expect(next.refusals).toBe(0)
        expect(next.sessionProfit).toBe(4)
    })

    it('does not count, accumulate or stop on a refusal', () => {
        const { state: next, accepted, stop } = accountAutoRound(state({ rounds: 2, sessionProfit: 10, limitLoss: 5 }), rejectedResult('insufficient-funds'))
        expect(accepted).toBe(false)
        expect(stop).toBe(false)
        expect(next.rounds).toBe(2)
        expect(next.refusals).toBe(1)
        expect(next.sessionProfit).toBe(10)
        expect(next.lastKind).toBe('rejected')
    })

    it('counts an accepted zero-profit push while leaving profit unchanged', () => {
        const { state: next, accepted } = accountAutoRound(state(), acceptedResult(0))
        expect(accepted).toBe(true)
        expect(next.rounds).toBe(1)
        expect(next.sessionProfit).toBe(0)
    })

    it('stops on accumulated accepted session profit, never on a refusal', () => {
        const { stop: profitStop } = accountAutoRound(state({ sessionProfit: 9, limitProfit: 10 }), acceptedResult(1))
        expect(profitStop).toBe(true)
        const { stop: lossStop } = accountAutoRound(state({ sessionProfit: -9, limitLoss: 10 }), acceptedResult(-1))
        expect(lossStop).toBe(true)
        const { stop: refusalStop } = accountAutoRound(state({ sessionProfit: 10, limitProfit: 10 }), rejectedResult('x'))
        expect(refusalStop).toBe(true) // already at the limit before the refusal
    })

    it('fires a per-win stop only on an accepted round at or above the threshold', () => {
        expect(accountAutoRound(state({ limitBigWin: 5 }), acceptedResult(5)).stop).toBe(true)
        expect(accountAutoRound(state({ limitBigWin: 5 }), acceptedResult(4.99)).stop).toBe(false)
    })
})
