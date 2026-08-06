import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./BlackjackGame.jsx', import.meta.url), 'utf8')

describe('BlackjackGame timer lifecycle', () => {
    it('routes every deferred phase advance through the cancellable scheduler', () => {
        expect(src).toContain('const { schedule } = useCancellableTimeouts()')
        expect(src).toContain('schedule(() => finishRound(finalHands, nextDealer), 220)')
        expect(src).toContain('schedule(() => finishRound(initialHands, initialDealer), 320)')
        expect(src).toContain('schedule(() => advanceFromHand(nextHands, nextShoe), 300)')
        expect(src).toContain('schedule(work, 30)')
    })

    it('imports the scheduling hook', () => {
        expect(src).toContain("import { useCancellableTimeouts } from '../../../utils/scheduling'")
    })

    it('leaves no bare setTimeout except the explicitly-cleared chip slide', () => {
        const bare = src.split(/\r?\n/).filter(l => /window\.setTimeout\(/.test(l))
        expect(bare).toHaveLength(1)
        expect(bare[0]).toContain('chipSlideTimer.current')
    })

    it('still clears the chip-slide timer on unmount', () => {
        expect(src).toContain('if (chipSlideTimer.current) window.clearTimeout(chipSlideTimer.current)')
    })

    it('declares schedule in the settle effect dep array', () => {
        expect(src).toContain('}, [dealer, finishRound, hitsSoft17, schedule, shoe])')
    })
})

describe('BlackjackGame settle rounding is handled at source', () => {
    it('delegates rounding to blackjackRules', () => {
        const rules = readFileSync(new URL('./blackjackRules.js', import.meta.url), 'utf8')
        expect(rules).toContain('Math.round(')
        expect(src).toContain("addWinnings(settlement.totalReturn, 'Blackjack return')")
    })
})
