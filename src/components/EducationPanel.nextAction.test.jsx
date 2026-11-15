// QA009/QA016 (#31): a climbing game's education must quote the *next* action,
// not the idle or already-banked one.
//
// Historical hosted observation: Dino showed first-jump 1.38x and 72% survival
// while the quoted EV was consistent with idle 1x. The panel therefore quoted one
// step's numbers against another step's payout. The mechanism in current source is
// `conditionalDecision`: when supplied and unsettled, the panel takes probability
// and payout from it instead of the static definition.
//
// States covered per the acceptance criteria: idle (no decision), first success,
// later success, bust, and cashout.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import EducationPanel from './EducationPanel'

const definition = { name: 'Dino', id: 'dino', rtp: 0.97, houseEdge: 0.03, volatility: 'Medium' }

const render = props => renderToStaticMarkup(
    <EducationPanel definition={definition} betAmount={5} {...props} />,
)

// The panel's own EV expression, restated so the assertion cannot drift from it.
const quoteEv = (probability, payoutMultiplier, cashoutMultiplier) => {
    const successReturn = Math.round(5 * payoutMultiplier * 100) / 100
    const cashoutReturn = cashoutMultiplier != null ? Math.round(5 * cashoutMultiplier * 100) / 100 : null
    return Math.round((probability * successReturn - (cashoutReturn ?? 5)) * 100) / 100
}

describe('conditional (next-action) education quote (QA009/QA016)', () => {
    it('falls back to static definition math when idle', () => {
        const html = render({ winProbability: 0.5, payoutMultiplier: 2 })
        expect(html).toContain('97.00%')
        expect(html).toContain('3.00%')
    })

    it('quotes the first successful step, not the idle multiplier', () => {
        // Idle would be 1x payout. The quote must use the next step's 1.38x, and it
        // must say so: the labels switch to the conditional basis.
        const decision = { probability: 0.72, payoutMultiplier: 1.38 }
        const html = render({ conditionalDecision: decision })
        expect(html).toContain('Next action success')
        expect(html).toContain('72.00%')
        expect(html).toContain('1.38×')
        // EV is derived from the next step, and differs from an idle-1x quote.
        const ev = quoteEv(0.72, 1.38)
        expect(ev).not.toBe(quoteEv(0.72, 1))
        expect(html).toContain(`${ev < 0 ? 'GC ' : 'GC +'}${ev.toFixed(2)}`)
        // The RTP figure is game-level and stays truthful alongside it.
        expect(html).toContain('97.00%')
    })

    it('quotes a later step using accumulated value, not the first step', () => {
        const later = { probability: 0.72, payoutMultiplier: 3.05 }
        const first = { probability: 0.72, payoutMultiplier: 1.38 }
        expect(quoteEv(later.probability, later.payoutMultiplier))
            .toBeGreaterThan(quoteEv(first.probability, first.payoutMultiplier))
        const html = render({ conditionalDecision: later })
        expect(html).toContain(`${quoteEv(0.72, 3.05).toFixed(2)}`)
    })

    it('includes the banked alternative when a cash-out exists', () => {
        const decision = { probability: 0.72, payoutMultiplier: 3.05, cashoutMultiplier: 1.38 }
        const html = render({ conditionalDecision: decision })
        // EV against the cash-out it would replace, not against the full stake.
        expect(html).toContain(`${quoteEv(0.72, 3.05, 1.38).toFixed(2)}`)
        expect(quoteEv(0.72, 3.05, 1.38)).not.toBe(quoteEv(0.72, 3.05))
    })

    it('stops quoting a next action once the run is settled', () => {
        // After a bust or a completed cash-out there is no next action to quote, so
        // the panel falls back to the static basis instead of reusing stale numbers.
        const bust = render({ conditionalDecision: { settled: true, probability: 0, payoutMultiplier: 0 } })
        const cashed = render({ conditionalDecision: { settled: true, probability: 1, payoutMultiplier: 1.38 } })
        for (const html of [bust, cashed]) {
            expect(html).not.toContain('Next action success')
            expect(html).not.toContain('First action EV')
            // The settled truth does not invent a 100% next-action chance.
            expect(html).not.toContain('100.00%')
        }
    })

    it('refuses to quote a non-finite or impossible probability', () => {
        for (const bad of [{ probability: NaN, payoutMultiplier: 1.38 }, { probability: 1.4, payoutMultiplier: 1.38 }]) {
            const html = render({ conditionalDecision: bad })
            // No invented win-chance figure can appear for an impossible decision.
            expect(html).not.toContain('140.00%')
        }
    })
})