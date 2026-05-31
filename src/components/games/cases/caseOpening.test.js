import { describe, expect, it } from 'vitest'
import {
    STANDARD_WEARS,
    buildCaseOutcome,
    buildCaseReelTrack,
    createCaseOpeningRound,
    finalCaseReelOffset,
} from './caseOpening'
import { CASE_PRIZE_INDEX, CASE_TILE_GAP_PX, CASE_TILE_PX } from './casesAnimation'

const sampleItems = [
    { id: 'skin-a', name: 'AK-47 | Redline', image: '/a.png', rarity: 'Classified', color: '#d32ce6', valueGc: 18 },
    { id: 'skin-b', name: 'P250 | Sand Dune', image: '/b.png', rarity: 'Mil-Spec Grade', color: '#4b69ff', valueGc: 0.8 },
    { id: 'skin-c', name: 'M4A1-S | Cyrex', image: '/c.png', rarity: 'Covert', color: '#eb4b4b', valueGc: 42 },
]

const sampleCase = {
    id: 'case-test',
    name: 'Test Case',
    items: sampleItems,
}

describe('case opening source of truth', () => {
    it.each([1, 3, 5, 10])('puts the exact %i-row outcomes into the pointer tiles', rows => {
        const round = createCaseOpeningRound({
            caseData: sampleCase,
            rows,
            stake: rows * 2,
            unitPrice: 2,
        })

        expect(round.entries).toHaveLength(rows)
        expect(round.outcomes).toHaveLength(rows)
        expect(round.tracks).toHaveLength(rows)

        round.entries.forEach(entry => {
            expect(entry.reelTrack[entry.targetIndex]).toBe(entry.outcome)
            expect(entry.reelTrack[entry.targetIndex].variantKey).toBe(entry.outcome.variantKey)
            expect(entry.reelTrack[entry.targetIndex].valueGc).toBe(entry.outcome.valueGc)
            expect(entry.reelTrack[entry.targetIndex].rarity).toBe(entry.outcome.rarity)
            expect(entry.reelTrack[entry.targetIndex].wear).toBe(entry.outcome.wear)
            expect(entry.reelTrack[entry.targetIndex].float).toBe(entry.outcome.float)
            expect(entry.reelTrack[entry.targetIndex].statTrak).toBe(entry.outcome.statTrak)
            expect(entry.reelTrack[entry.targetIndex].souvenir).toBe(entry.outcome.souvenir)
            expect(entry.reelTrack[entry.targetIndex].profitGc).toBe(entry.outcome.profitGc)
        })
    })

    it('preserves variant details on the reel target tile', () => {
        const outcome = buildCaseOutcome(sampleItems[0], {
            float: 0.031,
            statTrak: true,
            souvenir: false,
            unitPrice: 10,
            wear: STANDARD_WEARS[0],
        })
        const track = buildCaseReelTrack(sampleItems, outcome, { length: 12, targetIndex: 5 })

        expect(track[5]).toMatchObject({
            float: 0.031,
            openPriceGc: 10,
            rarity: 'Classified',
            skinId: 'skin-a',
            statTrak: true,
            souvenir: false,
            valueGc: 31.68,
            wear: 'Factory New',
            wearShort: 'FN',
        })
        expect(track[5].variantKey).toContain('skin-a:FN:0.031:ST')
    })

    it('centers the target using shared tile width and gap', () => {
        expect(finalCaseReelOffset({ jitter: 0, targetIndex: 2, tilePx: 118, gapPx: 4 })).toBe(-303)
        expect(finalCaseReelOffset({ jitter: 6, targetIndex: CASE_PRIZE_INDEX })).toBe(
            -((CASE_PRIZE_INDEX * (CASE_TILE_PX + CASE_TILE_GAP_PX)) + (CASE_TILE_PX / 2)) + 6,
        )
    })
})
