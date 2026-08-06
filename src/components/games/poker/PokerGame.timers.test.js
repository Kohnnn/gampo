import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./PokerGame.jsx', import.meta.url), 'utf8')

describe('PokerGame timer lifecycle', () => {
    it('imports both cancellable scheduling hooks', () => {
        expect(src).toContain("import { useCancellableFrames, useCancellableTimeouts } from '../../../utils/scheduling'")
    })

    it('instantiates both hooks', () => {
        expect(src).toContain('const { schedule } = useCancellableTimeouts()')
        expect(src).toContain('const { requestFrame } = useCancellableFrames()')
    })

    it('routes the chip-motion cleanup through the scheduler', () => {
        // fired 1100ms after a bet; previously ran setChipMotions on a dead component
        expect(src).toContain('schedule(() => {')
        expect(src).toContain('setChipMotions(prev => prev.filter(m => !ids.includes(m.id)))')
    })

    it('routes the chat-bubble expiry through the scheduler', () => {
        expect(src).toContain('schedule(() => setBubbles(prev => {')
    })

    it('routes both exit hand-offs through the scheduler', () => {
        expect(src).toContain('if (afterCashout) schedule(afterCashout, 0)')
        expect(src).toContain('schedule(() => completePendingExit(target), 0)')
    })

    it('routes the table scroll through the cancellable frame helper', () => {
        expect(src).toContain('requestFrame(() => {')
        expect(src).not.toContain('window.requestAnimationFrame(() => {')
    })

    it('declares schedule in both affected dep arrays', () => {
        expect(src).toContain('}, [schedule, state])')
        expect(src).toContain('}, [state, playSound, postflopChart, schedule])')
    })

    it('keeps the bot-turn effect cleanup clearing its own timers and frame', () => {
        expect(src).toContain('window.clearTimeout(decideTimer)')
        expect(src).toContain('window.clearTimeout(escapeTimer)')
        expect(src).toContain('if (thinkRafRef.current) window.cancelAnimationFrame(thinkRafRef.current)')
        expect(src).toContain('return () => window.clearTimeout(stepTimerId)')
    })

    it('leaves no untracked fire-and-forget timer', () => {
        const bare = src.split(/\r?\n/).filter(l => /window\.setTimeout\(/.test(l))
        // only the two locally-cleared timers inside the bot-turn effect remain
        expect(bare).toHaveLength(3)
        for (const line of bare) {
            expect(line).toMatch(/const (stepTimerId|decideTimer|escapeTimer) =/)
        }
    })
})

describe('PokerGame payouts are chip-integer', () => {
    it('rounds the SNG prize to a whole chip', () => {
        expect(src).toContain('const prize = Math.round(pool * payoutFrac)')
    })

    it('credits the prize and the cash-out stack directly', () => {
        expect(src).toContain('if (prize > 0) addWinnings(prize,')
        expect(src).toContain("if (finalStack > 0) addWinnings(finalStack, 'Poker cashout')")
    })

    it('derives blinds with floor so stacks never go fractional', () => {
        expect(src).toContain('sb: Math.floor(bb / 2)')
        expect(src).toContain('ante: level >= 3 ? Math.max(1, Math.floor(bb / 10)) : 0')
    })
})
