import { describe, expect, it } from 'vitest'
import { nextStepQuote } from '../primitives/autoAccounting'

// QA030 across the step-ladder originals. All three rendered the same panel:
//   Tower  `{ settled: true }` once the round ended, so the conditional quote
//          vanished the moment it became informative.
//   Dino   same `{ settled: true }` arm.
//   Pump   base `STEP_BUST_CHANCE` / `STEP_RAMP` constants in every state.
// Each now builds its quote through `nextStepQuote`, keyed to live round state.
// The rendered prop for all three games is asserted in
// EducationPanel.games.test.jsx; this file covers only the pure contract.

describe('nextStepQuote contract', () => {
    it('omits a cash-out below one banked step', () => {
        expect(nextStepQuote({ probability: 0.5, payoutMultiplier: 2, cashoutMultiplier: 0 })).toEqual({ probability: 0.5, payoutMultiplier: 2 })
    })

    it('keeps a real cash-out alternative', () => {
        expect(nextStepQuote({ probability: 0.5, payoutMultiplier: 2, cashoutMultiplier: 1.5 }))
            .toEqual({ probability: 0.5, payoutMultiplier: 2, cashoutMultiplier: 1.5 })
    })

    it('rejects a negative or non-finite figure rather than quoting it', () => {
        expect(nextStepQuote({ probability: -0.1, payoutMultiplier: 2 })).toBeNull()
        expect(nextStepQuote({ probability: 0.5, payoutMultiplier: Infinity })).toBeNull()
    })
})
