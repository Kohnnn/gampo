// QA033 (#29 Plinko half): an accepted drop must not be abandoned on navigation.
//
// Historical hosted observation: drop 5 debited the wallet, Hub navigation
// discarded the in-flight ball, and returning showed no result, no refund and no
// history entry. Current source already drains `settleByIdRef` in the mount
// effect's cleanup and settles each pending ball with `background: true`, so the
// wallet and history are written even though no presentation runs.
//
// This file pins the parts of that which are provable without a browser:
//   - teardown settles every pending ball exactly once, with background:true;
//   - the bin used is the one the fair RNG walk selected at drop time;
//   - settlement does no presentation work (no machine finish, no toast);
//   - a ball that already settled is gone from the map, so teardown cannot
//     pay it twice.
//
// It deliberately does NOT decide whether an interrupted ball should pay its
// preselected Galton bin or its physical bin. That is a payout election, and it
// stays open.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./PlinkoGame.jsx', import.meta.url), 'utf8')

// The mount effect's cleanup, from its `return () => {` to the drain loop's end.
const cleanupStart = src.indexOf('return () => {\n            cancelled = true')
const cleanup = src.slice(cleanupStart, src.indexOf('}, [])', cleanupStart))

// The settle handler's own body, up to the presentation branch.
const settleStart = src.indexOf('const settle = ({ binIndex: bi')
const settleBody = src.slice(settleStart, src.indexOf('const now = Date.now()', settleStart))

describe('Plinko accepted-drop settlement on navigation (QA033)', () => {
    it('drains every pending ball on teardown instead of abandoning it', () => {
        expect(cleanupStart).toBeGreaterThan(-1)
        expect(cleanup).toMatch(/for \(const \[ballId, pending\] of settleByIdRef\.current\)/)
        // Each pending ball is settled, and removed first so a second drain is a
        // no-op rather than a double credit.
        expect(cleanup).toMatch(/settleByIdRef\.current\.delete\(ballId\)\s*\n\s*pending\.settle\(/)
        expect(cleanup).toMatch(/background: true/)
    })

    it('pays the bin the fair walk already selected at drop time', () => {
        // `pending.binIndex` / `pending.multiplier` are the preselected outcome, not
        // whatever the physics had reached when the component unmounted.
        expect(cleanup).toMatch(/binIndex: pending\.binIndex/)
        expect(cleanup).toMatch(/multiplier: pending\.multiplier/)
    })

    it('credits the wallet and writes history even when settling in the background', () => {
        // These run before the `background` early-return, so navigation still pays.
        const creditAt = settleBody.indexOf("addWinnings(returnAmount, 'Plinko return')")
        const historyAt = settleBody.indexOf('session.record(')
        const backgroundAt = settleBody.indexOf('if (background)')
        expect(creditAt).toBeGreaterThan(-1)
        expect(historyAt).toBeGreaterThan(-1)
        expect(backgroundAt).toBeGreaterThan(-1)
        expect(creditAt).toBeLessThan(backgroundAt)
        expect(historyAt).toBeLessThan(backgroundAt)
    })

    it('does no presentation work when settling in the background', () => {
        // A torn-down component must not finish the round machine or raise a toast.
        const backgroundBranch = settleBody.slice(settleBody.indexOf('if (background)'))
        expect(backgroundBranch).not.toMatch(/machine\.finish/)
        expect(backgroundBranch).not.toMatch(/showToast/)
        expect(backgroundBranch).not.toMatch(/setBigWin/)
    })

    it('cannot pay a ball twice when it already left the map', () => {
        // The normal path deletes before settling, exactly as teardown does, so the
        // same ball cannot be reached by both the engine callback and the drain.
        expect(src).toMatch(/const pending = settleByIdRef\.current\.get\(ballId\)\s*\n\s*if \(pending\) \{\s*\n\s*settleByIdRef\.current\.delete\(ballId\)/)
    })

    it('cancelled drops release the stake instead of settling it', () => {
        // A cancelled ball is a row-count change, not a loss: it must not be credited.
        const cancelledBranch = settleBody.slice(settleBody.indexOf('if (cancelled)'), settleBody.indexOf('const mult ='))
        expect(cancelledBranch).toMatch(/setActiveDrops/)
        expect(cancelledBranch).not.toMatch(/addWinnings/)
        expect(cancelledBranch).not.toMatch(/session\.record/)
    })
})