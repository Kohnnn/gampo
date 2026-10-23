import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import EducationPanel from './EducationPanel'

const definition = {
    name: 'Wheel',
    id: 'wheel',
    rtp: 0.96,
    houseEdge: 0.04,
    volatility: 'Preset dependent',
}

describe('EducationPanel effective RTP', () => {
    it('uses static definition math by default', () => {
        const html = renderToStaticMarkup(
            <EducationPanel definition={definition} betAmount={5} winProbability={0.5} payoutMultiplier={2} />,
        )

        expect(html).toContain('96.00%')
        expect(html).toContain('4.00%')
    })

    it('keeps RTP, edge, and EV aligned with runtime payout math', () => {
        const html = renderToStaticMarkup(
            <EducationPanel
                definition={definition}
                effectiveRtp={1}
                betAmount={5}
                winProbability={5 / 12}
                payoutMultiplier={1}
            />,
        )

        expect(html).toContain('100.00%')
        expect(html).toContain('0.00%')
        expect(html).toContain('GC 0.00')
        expect(html).not.toContain('96.00%')
        expect(html).not.toContain('4.00%')
    })

    it('preserves sub-one-percent runtime house edges', () => {
        const html = renderToStaticMarkup(
            <EducationPanel definition={definition} effectiveRtp={0.9964} betAmount={5} />,
        )

        expect(html).toContain('99.64%')
        expect(html).toContain('0.36%')
        expect(html).toContain('GC -0.02')
    })

    it('uses a distribution mean without inventing binary odds', () => {
        const html = renderToStaticMarkup(
            <EducationPanel definition={definition} betAmount={5} expectedGrossMultiplier={0.99} />,
        )

        expect(html).toContain('GC -0.05')
        expect(html).toContain('Variable')
        expect(html).not.toContain('50.00%')
        expect(html).not.toContain('20-play risk')
    })

    it('compares the next conditional return with the available cashout', () => {
        const html = renderToStaticMarkup(
            <EducationPanel
                definition={definition}
                betAmount={10}
                conditionalDecision={{ label: 'Next jump', probability: 0.72, payoutMultiplier: 1.89, cashoutMultiplier: 1.38 }}
            />,
        )

        expect(html).toContain('Next jump success')
        expect(html).toContain('72.00%')
        expect(html).toContain('GC 18.90')
        expect(html).toContain('GC 13.80')
        expect(html).toContain('EV vs cashout')
        expect(html).toContain('GC -0.19')
        expect(html).not.toContain('20-play risk')
    })

    it('uses the rounded payable return for a conditional cent-stake decision', () => {
        const html = renderToStaticMarkup(
            <EducationPanel definition={definition} betAmount={0.03} conditionalDecision={{ label: 'Next climb', probability: 0.7, payoutMultiplier: 1.37 }} />,
        )

        expect(html).toContain('GC 0.04')
        expect(html).toContain('First action EV')
        expect(html).toContain('GC 0.00')
    })

    it('does not advertise a next decision after settlement', () => {
        const html = renderToStaticMarkup(
            <EducationPanel definition={definition} conditionalDecision={{ settled: true }} />,
        )

        expect(html).toContain('Round settled')
        expect(html).not.toContain('EV per play')
        expect(html).not.toContain('Win chance')
    })

    it('labels nominal RTP separately from the decision model', () => {
        const html = renderToStaticMarkup(
            <EducationPanel definition={definition} effectiveRtp={0.97} rtpLabel="Configured nominal RTP" rtpNote="Selected template" />,
        )

        expect(html).toContain('Configured nominal RTP')
        expect(html).toContain('97.00%')
        expect(html).toContain('Selected template')
    })
})
