import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import BetSlip from './components/BetSlip'
import { BET_MODES, quoteTicket } from './sportsbookMath'
import { DEFAULT_BETSLIP_SETTINGS } from './sportsbookState'

const selections = [2, 3, 4].map((acceptedOdds, index) => ({
    selectionId: `pick-${index}`,
    eventId: `event-${index}`,
    marketId: 'winner',
    outcome: 'home',
    label: ['Harbor', 'River', 'Valley'][index],
    eventLabel: `Fixture ${index + 1}`,
    marketLabel: 'Match winner',
    acceptedOdds,
    currentOdds: acceptedOdds,
    trueProbability: 0.5,
}))

function renderSlip(mode, overrides = {}) {
    return renderToStaticMarkup(<BetSlip
        selections={selections}
        stake={30}
        mode={mode}
        settings={DEFAULT_BETSLIP_SETTINGS}
        balance={100}
        {...overrides}
    />)
}

function systemSection(html) {
    return html.match(/<section class="sb-slip-section">([\s\S]*?)<\/section>/)[1]
}

describe('rendered sportsbook ticket disclosures', () => {
    it('shows each System 2 pair instead of the all-leg odds product', () => {
        const html = renderSlip(BET_MODES.SYSTEM_2)
        const section = systemSection(html)
        expect(section).toContain('3 two-leg pairs · GC 10.00 per pair')
        const pairs = [...section.matchAll(/<article class="sb-slip-leg">([\s\S]*?)<\/article>/g)].map(match => match[1])
        expect(pairs).toHaveLength(3)
        for (const [index, [label, odds, amount]] of [
            ['Harbor + River', '6.00', '60.00'],
            ['Harbor + Valley', '8.00', '80.00'],
            ['River + Valley', '12.00', '120.00'],
        ].entries()) {
            expect(pairs[index]).toContain(label)
            expect(pairs[index]).toContain(`Pair odds: ${odds}`)
            expect(pairs[index]).toContain(`Return if both win: GC ${amount}`)
        }
        expect(html).not.toContain('Total Odds')
        expect(section).toContain('Total return below assumes all legs win.')
        expect(html).toContain('<span>Total return if all legs win</span><strong>GC 260.00</strong>')
    })

    it('keeps pairs and their odds visible with a zero stake but never shows paid returns', () => {
        const html = renderSlip(BET_MODES.SYSTEM_2, { stake: 0 })
        const section = systemSection(html)
        expect(section).toContain('3 two-leg pairs · GC 0.00 per pair')
        expect(section).toContain('Pair odds: 12.00')
        expect(section.match(/Return if both win: GC 0.00/g)).toHaveLength(3)
        expect(html).toContain('<span>Total return if all legs win</span><strong>GC 0.00</strong>')
    })

    it('shows the one pair in a two-selection System 2 and respects the chosen odds format', () => {
        const html = renderSlip(BET_MODES.SYSTEM_2, {
            selections: selections.slice(0, 2),
            settings: { ...DEFAULT_BETSLIP_SETTINGS, oddsFormat: 'american' },
        })
        expect(systemSection(html)).toContain('1 two-leg pair · GC 30.00 per pair')
        expect(systemSection(html)).toContain('Pair odds: +500')
        expect(systemSection(html)).toContain('Return if both win: GC 180.00')
        expect(html).not.toContain('Total Odds')
    })

    it('renders System coach break-even per pair, not as an all-leg win requirement', () => {
        const html = renderSlip(BET_MODES.SYSTEM_2)
        expect(html).toContain('Each pair has its own break-even rate')
        expect(html).toContain('Break-even: per pair')
        expect(html).toContain('two winning legs do not guarantee a profit')
        expect(html).toContain('Model all-leg chance: 12.5%')
        expect(html).toContain('not the chance of any return or of recovering the system stake')
        expect(html).not.toContain('This combined ticket needs to win')
        expect(html).not.toContain('Combined break-even chance')
    })

    it('preserves Multi Total Odds and its combined break-even explanation', () => {
        const html = renderSlip(BET_MODES.MULTI)
        expect(html).toContain('<span>Total Odds</span><strong>24.00</strong>')
        expect(html).toContain('<span>Est. Return</span><strong>GC 720.00</strong>')
        expect(html).toContain('This combined ticket needs to win about 4.2%')
        expect(html).not.toContain('Pair odds:')
    })

    it('preserves Singles returns and the per-leg teaching model', () => {
        const html = renderSlip(BET_MODES.SINGLES)
        expect(html).toContain('<span>Est. Return</span><strong>GC 90.00</strong>')
        expect(html).toContain('Singles use per-leg break-even rates')
        expect(html).not.toContain('Total Odds')
        expect(html).not.toContain('Pair odds:')
        expect(quoteTicket({ selections, stake: 30, mode: BET_MODES.SYSTEM_2 }).totalOdds).toBe(24)
    })
})
