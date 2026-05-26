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
        expect(analysis.metrics.find(metric => metric.label === 'Fair odds')?.value).toBe('1.85')
        expect(analysis.metrics.find(metric => metric.label === 'Model edge')?.value).toBe('4.0%')
        expect(analysis.metrics.find(metric => metric.label === 'Move')?.value).toBe('Up 0.10')
        expect(analysis.insights.find(insight => insight.id === 'selection-movement')?.body).toContain('moved up')
        expect(analysis.insights.some(insight => insight.tier === 'beginner')).toBe(true)
        expect(analysis.insights.some(insight => insight.title.includes('Source caveat'))).toBe(true)
    })

    it('explains odds-down movement as a shorter price', () => {
        const analysis = analyzeSelection(marketGroup.selections[1], marketGroup)

        expect(analysis.metrics.find(metric => metric.label === 'Move')?.value).toBe('Down 0.15')
        expect(analysis.insights.find(insight => insight.id === 'selection-movement')?.body).toContain('Shorter decimal odds')
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
        expect(singles.metrics.find(metric => metric.label === 'Stake/leg')?.value).toBe('GC 10.00')
        expect(multi.insights.find(insight => insight.id === 'ticket-break-even')?.metricValue).toBe('26.3%')
        expect(multi.insights.some(insight => insight.id === 'ticket-same-game')).toBe(true)
        expect(system.insights.find(insight => insight.id === 'ticket-mode')?.body).toContain('2-of-N system')
        expect(system.metrics.find(metric => metric.label === '2-leg combos')?.value).toBe('3')
        expect(system.insights.find(insight => insight.id === 'ticket-system-combos')?.body).toContain('3 two-leg combos')
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
            selections: [
                { selectionId: 'home', label: 'Harbor United', acceptedOdds: 2, currentOdds: 2.2 },
                { selectionId: 'over', label: 'Over 2.5', acceptedOdds: 1.9, currentOdds: 1.84 },
            ],
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
        expect(analysis.legRows).toHaveLength(2)
        expect(analysis.legRows?.[0]).toMatchObject({
            label: 'Harbor United',
            acceptedOdds: 2,
            probability: 0.54,
            result: 'won',
            returnRole: 'won leg, ticket blocked',
        })
        expect(analysis.insights.find(insight => insight.id === 'settlement-rolls')?.body).toContain('roll 0.32')
        expect(analysis.insights.find(insight => insight.id === 'settlement-rolls')?.body).toContain('accepted 2.00')
        expect(analysis.insights.find(insight => insight.id === 'settlement-rolls')?.body).toContain('return role')
        expect(analysis.insights.find(insight => insight.id === 'settlement-accepted-price')?.body).toContain('Accepted odds')
        expect(analysis.insights.find(insight => insight.id === 'settlement-price-movement')?.body).toContain('accepted 2.00')
        expect(analysis.insights.find(insight => insight.id === 'settlement-price-movement')?.body).toContain('later price moved higher')
    })
})
