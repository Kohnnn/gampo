import { describe, expect, it } from 'vitest'
import {
    caseCategoryCounts,
    caseCategoryStats,
    caseDropOdds,
    caseExpectedValueGc,
    caseOpenStakeGc,
    caseRarePreview,
    caseVolatilityScore,
    deriveOpenPriceGc,
    fallbackOpenPriceGc,
    filterCasesByCategory,
    inferCaseCategory,
    normalizeCaseForRuntime,
    rarityDropWeight,
    roundSignedGc,
} from './caseEconomy'
import { rarityWeight } from './caseOpening'

const weaponCase = {
    id: 'case-a',
    name: 'Dreams & Nightmares Case',
    type: 'Case',
    items: [
        { id: 'a', name: 'AK Test', rarity: 'Mil-Spec Grade', multiplier: 1.4 },
        { id: 'b', name: 'M4 Rare', rarity: 'Restricted', multiplier: 4 },
    ],
}

describe('case economy helpers', () => {
    it('prefers csmarket aggregate prices for open price', () => {
        const price = deriveOpenPriceGc(weaponCase, {
            'Dreams & Nightmares Case': {
                csmarket: { median_price: 2.45, min_price: 2.1 },
            },
        })

        expect(price).toEqual({ value: 2.45, source: 'csmarket' })
    })

    it('falls back to weighted contained-item EV when no market price exists', () => {
        expect(fallbackOpenPriceGc(weaponCase)).toBeGreaterThanOrEqual(1)
        expect(deriveOpenPriceGc(weaponCase, {}).source).toBe('fallback-ev')
    })

    it('normalizes items with direct item values and case price', () => {
        const normalized = normalizeCaseForRuntime(weaponCase, {
            'AK Test': { csmarket: { min_price: 0.7 } },
            'Dreams & Nightmares Case': { csmarket: { median_price: 2 } },
        })

        expect(normalized.openPriceGc).toBe(2)
        expect(normalized.items[0].valueGc).toBe(0.7)
        expect(normalized.category).toBe('weapon')
        expect(normalized.evGc).toBeGreaterThan(0)
        expect(normalized.volatility.label).toBeTruthy()
        expect(normalized.rarePreview[0].name).toBe('M4 Rare')
    })

    it('prices multi-row opens as case price times rows', () => {
        expect(caseOpenStakeGc(weaponCase, 5, {
            'Dreams & Nightmares Case': { csmarket: { median_price: 2.25 } },
        })).toBe(11.25)
    })

    it('keeps signed profit/loss values instead of clamping losses', () => {
        expect(roundSignedGc(1.193 - 2.4)).toBe(-1.21)
        expect(roundSignedGc(3.618 - 2.4)).toBe(1.22)
    })

    it('groups cases by value/type categories', () => {
        const cases = [
            { ...weaponCase, openPriceGc: 2 },
            { id: 'sv', name: 'Souvenir Package', type: 'Souvenir', openPriceGc: 4, items: [weaponCase.items[0]] },
            { id: 'st', name: 'Sticker Capsule', type: 'Sticker Capsule', openPriceGc: 1, items: [weaponCase.items[0]] },
            { id: 'au-2025', name: 'Austin 2025 Champions Autograph Capsule', type: 'Autograph Capsule', openPriceGc: 1.5, items: [weaponCase.items[0]] },
            { id: 'mk', name: 'Music Kit Box', type: 'Music Kit Box', openPriceGc: 3, items: [weaponCase.items[0]] },
        ]

        expect(inferCaseCategory(cases[1])).toBe('souvenir')
        expect(inferCaseCategory(cases[2])).toBe('stickers')
        expect(inferCaseCategory(cases[3])).toBe('autographs')
        expect(inferCaseCategory(cases[4])).toBe('music')
        expect(filterCasesByCategory(cases, 'weapon')).toHaveLength(1)
        expect(filterCasesByCategory(cases, 'trending')[0].id).toBe('au-2025')
        expect(caseCategoryCounts(cases)).toMatchObject({
            popular: 5,
            trending: 5,
            weapon: 1,
            souvenir: 1,
            stickers: 1,
            autographs: 1,
            music: 1,
            highValue: 5,
        })
        expect(caseCategoryStats(cases).popular).toMatchObject({
            count: 5,
            minPriceGc: 1,
            maxPriceGc: 4,
            band: 'Budget',
        })
    })

    it('summarizes expected value, volatility, and rare preview for cards', () => {
        const caseData = {
            ...weaponCase,
            items: [
                { id: 'base', name: 'Pistol', rarity: 'Mil-Spec Grade', valueGc: 1 },
                { id: 'rare', name: 'Knife', rarity: 'Covert', valueGc: 55, isRare: true },
                { id: 'mid', name: 'Rifle', rarity: 'Classified', valueGc: 10 },
            ],
        }

        expect(caseExpectedValueGc(caseData)).toBeGreaterThan(1)
        expect(caseVolatilityScore(caseData).label).not.toBe('Stable')
        expect(caseRarePreview(caseData, 1)).toEqual([
            expect.objectContaining({ id: 'rare', name: 'Knife' }),
        ])
    })

    it('shares one rarity weight source between economy and roll picker', () => {
        const samples = [
            { rarity: 'Mil-Spec Grade' },
            { rarity: 'Restricted' },
            { rarity: 'Classified' },
            { rarity: 'Covert' },
            { rarity: 'Extraordinary' },
            { rarity: 'Contraband' },
            { rarity: '★' },
            { rarity: 'Unknown rarity' },
            { isRare: true },
        ]
        samples.forEach(item => {
            expect(rarityWeight(item)).toBe(rarityDropWeight(item))
        })
        expect(rarityDropWeight({ rarity: 'Mil-Spec Grade' })).toBe(78.92)
        expect(rarityDropWeight({ isRare: true })).toBe(0.4)
        expect(rarityDropWeight({ rarity: 'Unknown rarity' })).toBe(12)
    })

    it('derives per-rarity drop odds normalized to 100%', () => {
        const caseData = {
            items: [
                { id: 'm1', rarity: 'Mil-Spec Grade', valueGc: 1, color: '#4b69ff' },
                { id: 'm2', rarity: 'Mil-Spec Grade', valueGc: 1.2, color: '#4b69ff' },
                { id: 'r1', rarity: 'Restricted', valueGc: 6, color: '#8847ff' },
                { id: 'c1', rarity: 'Covert', valueGc: 40, color: '#eb4b4b' },
                { id: 'k1', rarity: 'Covert', valueGc: 220, isRare: true, color: '#e4ae39' },
            ],
        }
        const odds = caseDropOdds(caseData)
        const total = odds.reduce((sum, row) => sum + row.pct, 0)
        expect(total).toBeCloseTo(100, 6)
        // Two Mil-Spec items combine into one bucket with double the weight.
        const milspec = odds.find(row => row.rarity === 'Mil-Spec Grade')
        expect(milspec.count).toBe(2)
        // The flagged rare item collapses into a dedicated special bucket.
        const special = odds.find(row => row.isRare)
        expect(special.label).toBe('Rare special')
        // Highest-weight bucket sorts first.
        expect(odds[0].rarity).toBe('Mil-Spec Grade')
        expect(caseDropOdds({ items: [] })).toEqual([])
    })
})
