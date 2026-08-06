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
})
