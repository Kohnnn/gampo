import { describe, expect, it } from 'vitest'
import { BET_MODES, quoteTicket } from './sportsbookMath'
import {
    analyzeMarketGroup,
    analyzeSelection,
    analyzeSettlement,
    analyzeTicket,
    formatPercent,
} from './sportsbookEducation'

const marketGroup = {
    id: 'winner',
    label: '1x2',
    selections: [
        {
            id: 'home',
            label: 'Harbor United',
            decimalOdds: 2,
            previousOdds: 1.9,
            trueProbability: 0.54,
            suspended: false,
            status: 'odds-up',
            source: 'synthetic',
        },
        {
            id: 'draw',
            label: 'Draw',
            decimalOdds: 3.6,
            previousOdds: 3.75,
            trueProbability: 0.24,
            suspended: false,
            status: 'odds-down',
            source: 'synthetic',
        },
        {
            id: 'away',
            label: 'River City FC',
            decimalOdds: 3.2,
            previousOdds: 3.2,
            trueProbability: 0.3,
            suspended: false,
            status: 'available',
            source: 'synthetic',
        },
    ],
}

const ticketSelections = [
    {
        selectionId: 'home',
        eventId: 'event-1',
        marketId: 'winner',
        label: 'Harbor United',
        eventLabel: 'Harbor United - River City FC',
        marketLabel: '1x2',
        currentOdds: 2,
        acceptedOdds: 2,
        trueProbability: 0.54,
    },
    {
        selectionId: 'over',
        eventId: 'event-1',
        marketId: 'total',
        label: 'Over 2.5',
        eventLabel: 'Harbor United - River City FC',
        marketLabel: 'Total Goals',
        currentOdds: 1.9,
        acceptedOdds: 1.9,
        trueProbability: 0.52,
    },
]

describe('sportsbookEducation', () => {
    it('formats implied probability and odds-cell movement for a selection', () => {
        const analysis = analyzeSelection(marketGroup.selections[0], marketGroup)

        expect(formatPercent(0.5)).toBe('50.0%')
        expect(analysis.metrics.find(metric => metric.label === 'Break-even')?.value).toBe('50.0%')
        expect(analysis.metrics.find(metric => metric.label === 'Move')?.value).toBe('Up 0.10')
        expect(analysis.insights.some(insight => insight.tier === 'beginner')).toBe(true)
        expect(analysis.insights.some(insight => insight.title.includes('Source caveat'))).toBe(true)
    })

    it('explains market overround, vig, and de-vig probabilities', () => {
        const analysis = analyzeMarketGroup(marketGroup)

        expect(analysis.rows).toHaveLength(3)
        expect(analysis.rows.reduce((sum, row) => sum + row.noVigProbability, 0)).toBeCloseTo(1)
        expect(analysis.metrics.find(metric => metric.label === 'Overround')?.value).toBe('109.0%')
        expect(analysis.metrics.find(metric => metric.label === 'Vig')?.value).toBe('9.0%')
        expect(analysis.insights.some(insight => insight.id === 'market-devig')).toBe(true)
    })

    it('analyzes singles, multi, and system tickets with mode-specific copy', () => {
        const singles = analyzeTicket({
            selections: ticketSelections,
            stake: 20,
            mode: BET_MODES.SINGLES,
        })
        const multi = analyzeTicket({
            selections: ticketSelections,
            stake: 20,
            mode: BET_MODES.MULTI,
        })
        const system = analyzeTicket({
            selections: [...ticketSelections, { ...ticketSelections[1], selectionId: 'away', eventId: 'event-2', currentOdds: 2.4, trueProbability: 0.42 }],
            stake: 30,
            mode: BET_MODES.SYSTEM_2,
        })

        expect(singles.insights.find(insight => insight.id === 'ticket-mode')?.body).toContain('Singles split')
        expect(multi.insights.find(insight => insight.id === 'ticket-break-even')?.metricValue).toBe('26.3%')
        expect(multi.insights.some(insight => insight.id === 'ticket-same-game')).toBe(true)
        expect(system.insights.find(insight => insight.id === 'ticket-mode')?.body).toContain('2-of-N system')
    })

    it('summarizes settled ticket rolls and decision quality', () => {
        const quote = quoteTicket({ selections: ticketSelections, stake: 20, mode: BET_MODES.MULTI })
        const analysis = analyzeSettlement({
            id: 'ticket-1',
            mode: BET_MODES.MULTI,
            status: 'settled',
            result: 'loss',
            stake: 20,
            payout: 0,
            profit: -20,
            quote,
            legs: [
                {
                    label: 'Harbor United',
                    roll: 0.32,
                    trueProbability: 0.54,
                    won: true,
                },
                {
                    label: 'Over 2.5',
                    roll: 0.88,
                    trueProbability: 0.52,
                    won: false,
                },
            ],
        })

        expect(analysis.metrics.find(metric => metric.label === 'Profit')?.value).toBe('GC -20.00')
        expect(analysis.insights.find(insight => insight.id === 'settlement-rolls')?.body).toContain('roll 0.32')
        expect(analysis.insights.find(insight => insight.id === 'settlement-accepted-price')?.body).toContain('Accepted odds')
    })
})
