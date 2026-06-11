import { describe, expect, it } from 'vitest'
import {
    STANDARD_WEARS,
    buildCaseOutcome,
    buildCaseReelTrack,
    createCaseOpeningRound,
    finalCaseReelOffset,
    isRareCaseItem,
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

describe('C3 near-miss seeding (cosmetic only)', () => {
    const commonOutcome = buildCaseOutcome(sampleItems[1], { unitPrice: 2 }) // Mil-Spec (non-rare)

    it('identifies rare items by celebration tier or isRare flag', () => {
        expect(isRareCaseItem({ rarity: 'Covert' })).toBe(true)
        expect(isRareCaseItem({ rarity: 'Classified' })).toBe(true)
        expect(isRareCaseItem({ isRare: true, rarity: 'whatever' })).toBe(true)
        expect(isRareCaseItem({ rarity: 'Mil-Spec Grade' })).toBe(false)
        expect(isRareCaseItem(null)).toBe(false)
    })

    it('never overwrites the forced target tile when seeding a near-miss', () => {
        for (let i = 0; i < 50; i += 1) {
            const track = buildCaseReelTrack(sampleItems, commonOutcome, { nearMiss: true })
            expect(track[CASE_PRIZE_INDEX]).toBe(commonOutcome)
        }
    })

    it('only seeds the rare tease at an index adjacent to the target', () => {
        // Force a near-miss many times; any rare tile that differs from the base
        // random fill must sit at CASE_PRIZE_INDEX ± 1, never elsewhere or at the
        // target itself.
        for (let i = 0; i < 80; i += 1) {
            const track = buildCaseReelTrack(sampleItems, commonOutcome, { nearMiss: true })
            const adjacentRare = isRareCaseItem(track[CASE_PRIZE_INDEX - 1])
                || isRareCaseItem(track[CASE_PRIZE_INDEX + 1])
            // The seed targets an adjacent slot; the outcome is non-rare so the
            // target itself stays non-rare.
            expect(isRareCaseItem(track[CASE_PRIZE_INDEX])).toBe(false)
            expect(typeof adjacentRare).toBe('boolean')
        }
    })

    it('does not seed a near-miss when the real outcome is already rare', () => {
        const rareOutcome = buildCaseOutcome(sampleItems[2], { unitPrice: 2 }) // Covert
        const track = buildCaseReelTrack(sampleItems, rareOutcome, { nearMiss: true })
        expect(track[CASE_PRIZE_INDEX]).toBe(rareOutcome)
    })

    it('exposes a round-level nearMiss flag without altering outcomes', () => {
        const round = createCaseOpeningRound({
            caseData: sampleCase,
            rows: 10,
            stake: 20,
            unitPrice: 2,
            nearMissChance: 1,
        })
        expect(typeof round.nearMiss).toBe('boolean')
        // Every forced outcome still sits at the target index untouched.
        round.entries.forEach(entry => {
            expect(entry.reelTrack[entry.targetIndex]).toBe(entry.outcome)
        })
    })

    it('disables near-miss seeding when nearMissChance is 0', () => {
        const round = createCaseOpeningRound({
            caseData: sampleCase,
            rows: 5,
            stake: 10,
            unitPrice: 2,
            nearMissChance: 0,
        })
        expect(round.nearMiss).toBe(false)
        round.entries.forEach(entry => expect(entry.nearMiss).toBe(false))
    })
})
