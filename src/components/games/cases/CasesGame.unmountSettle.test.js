// QA040 (#29): an accepted Cases round must not lose its return when the component
// unmounts before the reveal timers finish.
//
// `performPlay` debits the stake (`placeBet`) and only then records
// `pendingRoundRef`. Settlement — credit, collection, progress, history and round
// finish — ran only from `finishPendingRound`, reached by reveal timers. The
// unmount effect cleared those timers and never settled, so leaving mid-reveal
// debited the stake and dropped the return. The picks are drawn at debit time, so
// this pays a return already determined; it does not choose a payout.
//
// The end-to-end behavioural proof lives in CasesGame.manifest.test.jsx
// ("Cases unmount settlement"). This file pins the accounting seam's contract:
// idempotent, no presentation side effects, and the sinks it needs.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { applyCaseAccounting } from './casesAnimation.js'

const src = readFileSync(new URL('./CasesGame.jsx', import.meta.url), 'utf8')

const makePending = (overrides = {}) => ({
    settled: false,
    stake: 5,
    rows: 1,
    caseData: { id: 'case-a', name: 'Case A' },
    picks: [{ name: 'Skin', valueGc: 12.5, openPriceGc: 5 }],
    ...overrides,
})

const makeSink = () => ({
    addWinnings: vi.fn(),
    collection: { recordDrop: vi.fn() },
    recordProgressCaseDrop: vi.fn(),
    session: { record: vi.fn() },
    machine: { finish: vi.fn() },
})

const settle = (pending, sink = makeSink()) => applyCaseAccounting(pending, sink)

describe('Cases unmount settlement seam (QA040)', () => {
    it('pays the frozen return and records the drop once', () => {
        const pending = makePending()
        const sink = makeSink()

        const settlement = settle(pending, sink)

        expect(settlement.returnAmount).toBe(12.5)
        expect(settlement.profit).toBe(7.5)
        expect(sink.addWinnings).toHaveBeenCalledWith(12.5, 'Cases return')
        expect(sink.collection.recordDrop).toHaveBeenCalledTimes(1)
        expect(sink.recordProgressCaseDrop).toHaveBeenCalledTimes(1)
        expect(sink.session.record).toHaveBeenCalledTimes(1)
        expect(sink.machine.finish).toHaveBeenCalledTimes(1)
    })

    it('cannot pay twice when a reveal timer and an unmount both fire', () => {
        const pending = makePending()
        const sink = makeSink()

        expect(settle(pending, sink)).not.toBeNull()
        expect(settle(pending, sink)).toBeNull()
        expect(sink.addWinnings).toHaveBeenCalledTimes(1)
        expect(sink.session.record).toHaveBeenCalledTimes(1)
        expect(sink.machine.finish).toHaveBeenCalledTimes(1)
    })

    it('pays a full loss as nothing while still writing history and inventory', () => {
        const pending = makePending({ picks: [{ name: 'Blank', valueGc: 0 }] })
        const sink = makeSink()

        const settlement = settle(pending, sink)

        expect(settlement.returnAmount).toBe(0)
        expect(settlement.profit).toBe(-5)
        expect(sink.addWinnings).not.toHaveBeenCalled()
        // A zero-value drop is a legitimate loss, but it still happened.
        expect(sink.collection.recordDrop).toHaveBeenCalledTimes(1)
        expect(sink.session.record).toHaveBeenCalledTimes(1)
    })

    it('needs no React state and schedules no work of its own', () => {
        const anim = readFileSync(new URL('./casesAnimation.js', import.meta.url), 'utf8')
        const helper = anim.slice(anim.indexOf('export function applyCaseAccounting'), anim.indexOf('export function summarizeCaseSettlement'))
        // Nothing that would keep a torn-down component alive or run after unmount.
        expect(helper).not.toMatch(/setTimeout|setInterval|requestAnimationFrame|document\.|window\./)
        expect(helper).not.toMatch(/\bset[A-Z]\w*\(/)
        expect(helper).not.toMatch(/\bsfx\b|\bhaptic|\.play\(/)
    })

    it('teardown reaches accounting without re-crediting an already settled round', () => {
        const teardown = src.slice(src.indexOf('settleOnUnmountRef.current?.()'), src.indexOf('}, [clearRevealTimers])'))
        expect(teardown).toContain('settleOnUnmountRef.current?.()')

        const settleFn = src.slice(
            src.indexOf('settleOnUnmountRef.current = () => {'),
            src.indexOf('}, [addWinnings, collection, recordProgressCaseDrop, session, machine])'),
        )
        expect(settleFn).toContain('applyCaseAccounting(')
        // A second claim returns null, so no path can pay a round twice.
        expect(settleFn).not.toMatch(/addWinnings\(/)
    })
})