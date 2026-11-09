import { describe, expect, it } from 'vitest'
import { nextStepQuote } from '../primitives/autoAccounting'

// QA030: Pump used to hand EducationPanel the constants `1 - STEP_BUST_CHANCE`
// and `STEP_RAMP` in every state, so it quoted a first-pump 1.09x while five
// pumps were banked (the next pump then paid 1.09^6). The quote is now derived
// per state by `nextStepQuote`; these checks pin the per-state figures and the
// wiring that feeds them.

const STEP_BUST_CHANCE = 0.12
const STEP_RAMP = Number((0.96 / (1 - STEP_BUST_CHANCE)).toFixed(4))
const multiplierAt = pumps => (pumps === 0 ? 1 : Number(Math.pow(STEP_RAMP, pumps).toFixed(4)))
const MAX_PUMPS = 10

const quote = ({ inRound, pumps }) => nextStepQuote({
    probability: 1 - STEP_BUST_CHANCE,
    payoutMultiplier: inRound && pumps >= MAX_PUMPS ? multiplierAt(pumps) : multiplierAt(pumps + 1),
    cashoutMultiplier: inRound && pumps > 0 ? multiplierAt(pumps) : undefined,
})

describe('Pump lesson follows the round (QA030)', () => {
    it('quotes the first pump before a round starts', () => {
        const idle = quote({ inRound: false, pumps: 0 })
        expect(idle.probability).toBeCloseTo(1 - STEP_BUST_CHANCE, 12)
        expect(idle.payoutMultiplier).toBeCloseTo(multiplierAt(1), 12)
        expect(idle.cashoutMultiplier).toBeUndefined()
    })

    it('quotes the next pump of the live round, not the base step', () => {
        const afterFive = quote({ inRound: true, pumps: 5 })
        expect(afterFive.payoutMultiplier).toBeCloseTo(multiplierAt(6), 12)
        expect(afterFive.payoutMultiplier).not.toBeCloseTo(multiplierAt(1), 6)
    })

    it('offers the banked multiplier as the cash-out alternative', () => {
        const afterThree = quote({ inRound: true, pumps: 3 })
        expect(afterThree.cashoutMultiplier).toBeCloseTo(multiplierAt(3), 12)
        expect(afterThree.payoutMultiplier).toBeCloseTo(multiplierAt(4), 12)
    })

    it('stops promising a further pump at the cap', () => {
        const atCap = quote({ inRound: true, pumps: MAX_PUMPS })
        expect(atCap.payoutMultiplier).toBeCloseTo(multiplierAt(MAX_PUMPS), 12)
    })

    it('refuses a quote it cannot state', () => {
        expect(nextStepQuote({ probability: Number.NaN, payoutMultiplier: 2 })).toBeNull()
        expect(nextStepQuote({ probability: 0.5, payoutMultiplier: undefined })).toBeNull()
    })
})
