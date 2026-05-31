import { describe, expect, it } from 'vitest'
import {
    CASE_TILE_GAP_PX,
    CASE_PRIZE_INDEX,
    CASE_TILE_PX,
    CASE_OPEN_PHASES,
    casePhaseLabel,
    claimCaseSettlement,
    finalPrizeOffset,
    hasReachedCasePhase,
    pickCelebrationDrop,
    shouldCelebrateDrop,
    summarizeCaseSettlement,
} from './casesAnimation'

describe('cases animation helpers', () => {
    it('keeps the carousel prize offset centered on the pointer', () => {
        expect(CASE_TILE_PX).toBe(118)
        expect(CASE_TILE_GAP_PX).toBe(4)
        expect(finalPrizeOffset(0)).toBe(-((CASE_PRIZE_INDEX * (CASE_TILE_PX + CASE_TILE_GAP_PX)) + (CASE_TILE_PX / 2)))
        expect(finalPrizeOffset(6)).toBe(finalPrizeOffset(0) + 6)
    })

    it('labels the visible phase for the lock overlay', () => {
        expect(CASE_OPEN_PHASES).toEqual(['idle', 'arming', 'lid', 'spin', 'slowdown', 'land', 'reveal', 'settled'])
        expect(casePhaseLabel('arming', 1)).toBe('Preparing drop...')
        expect(casePhaseLabel('lid', 1)).toBe('Lifting lid...')
        expect(casePhaseLabel('spin', 3)).toBe('Rolling 3 rows...')
        expect(casePhaseLabel('land', 5)).toBe('Pointer locked...')
        expect(casePhaseLabel('settled', 5)).toBe('Drop recorded')
        expect(hasReachedCasePhase('reveal', 'spin')).toBe(true)
        expect(hasReachedCasePhase('lid', 'land')).toBe(false)
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

    it.each([1, 3, 5, 10])('summarizes %i-row case settlement with every result', rows => {
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
