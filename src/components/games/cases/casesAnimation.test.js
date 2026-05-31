import { describe, expect, it } from 'vitest'
import {
    CASE_PRIZE_INDEX,
    CASE_TILE_PX,
    casePhaseLabel,
    claimCaseSettlement,
    finalPrizeOffset,
    pickCelebrationDrop,
    shouldCelebrateDrop,
    summarizeCaseSettlement,
} from './casesAnimation'

describe('cases animation helpers', () => {
    it('keeps the carousel prize offset centered on the pointer', () => {
        expect(finalPrizeOffset(0)).toBe(-((CASE_PRIZE_INDEX * CASE_TILE_PX) - 50))
        expect(finalPrizeOffset(6)).toBe(finalPrizeOffset(0) + 6)
    })

    it('labels the visible phase for the lock overlay', () => {
        expect(casePhaseLabel('lid', 1)).toBe('Lifting lid...')
        expect(casePhaseLabel('zoom', 5)).toBe('Locking prize...')
        expect(casePhaseLabel('spinning', 3)).toBe('Unboxing 3 rows...')
    })

    it('celebrates Restricted+ and special variants', () => {
        expect(shouldCelebrateDrop({ rarity: 'Mil-Spec Grade' })).toBe(false)
        expect(shouldCelebrateDrop({ rarity: 'Restricted' })).toBe(true)
        expect(shouldCelebrateDrop({ rarity: 'Mil-Spec Grade', statTrak: true })).toBe(true)
        expect(shouldCelebrateDrop({ rarity: 'Mil-Spec Grade', souvenir: true })).toBe(true)
    })

    it('chooses the strongest celebratory drop for the center pop', () => {
        const drop = pickCelebrationDrop([
            { name: 'Blue', rarity: 'Mil-Spec Grade', multiplier: 1.2 },
            { name: 'Purple', rarity: 'Restricted', multiplier: 2.4 },
            { name: 'Gold', rarity: 'Covert', multiplier: 8.8 },
        ])
        expect(drop.name).toBe('Gold')
    })

    it.each([1, 5, 10])('summarizes %i-row case settlement with every result', rows => {
        const picks = Array.from({ length: rows }, (_, index) => ({
            name: `Drop ${index + 1}`,
            valueGc: 1.5 + index,
        }))
        const summary = summarizeCaseSettlement({ picks, stake: rows * 2, rows })

        expect(summary.rows).toBe(rows)
        expect(summary.resultCount).toBe(rows)
        expect(summary.perRow).toHaveLength(rows)
        expect(summary.totalReturn).toBe(picks.reduce((sum, pick) => sum + pick.valueGc, 0))
        expect(summary.profit).toBe(summary.totalReturn - rows * 2)
    })

    it('claims case settlement exactly once for normal and skipped paths', () => {
        const pending = { settled: false }

        expect(claimCaseSettlement(pending)).toBe(true)
        expect(claimCaseSettlement(pending)).toBe(false)
        expect(claimCaseSettlement(null)).toBe(false)
    })
})
