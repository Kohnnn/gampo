import { describe, expect, it } from 'vitest'
import {
    CASE_TILE_GAP_PX,
    CASE_PRIZE_INDEX,
    CASE_TILE_PX,
    CASE_OPEN_PHASES,
    casePhaseLabel,
    claimCaseSettlement,
    finalPrizeOffset,
    getCaseReelMetrics,
    getCaseReelStartOffset,
    hasReachedCasePhase,
    pickCelebrationDrop,
    pickHighestRarityRole,
    shouldCelebrateDrop,
    shouldPlayRarityStinger,
    summarizeCaseSettlement,
    _resetRarityStingerCooldown,
} from './casesAnimation'

describe('cases animation helpers', () => {
    it('keeps the carousel prize offset centered on the pointer', () => {
        expect(CASE_TILE_PX).toBe(118)
        expect(CASE_TILE_GAP_PX).toBe(4)
        expect(finalPrizeOffset(0)).toBe(-((CASE_PRIZE_INDEX * (CASE_TILE_PX + CASE_TILE_GAP_PX)) + (CASE_TILE_PX / 2)))
        expect(finalPrizeOffset(6)).toBe(finalPrizeOffset(0) + 6)
    })

    it('reads reel metrics from rendered CSS custom properties', () => {
        const el = { nodeType: 1 }
        const originalWindow = globalThis.window
        globalThis.window = {
            getComputedStyle: () => ({
                getPropertyValue: (prop) => {
                    if (prop === '--case-tile-px') return '92px'
                    if (prop === '--case-tile-gap') return '6px'
                    return ''
                },
            }),
        }
        const metrics = getCaseReelMetrics(el)
        expect(metrics.tilePx).toBe(92)
        expect(metrics.gapPx).toBe(6)
        globalThis.window = originalWindow
    })

    it('falls back to constants when element is missing or properties are empty', () => {
        expect(getCaseReelMetrics(null)).toEqual({ tilePx: CASE_TILE_PX, gapPx: CASE_TILE_GAP_PX })
        expect(getCaseReelMetrics(undefined)).toEqual({ tilePx: CASE_TILE_PX, gapPx: CASE_TILE_GAP_PX })
        const el = { nodeType: 1 }
        const originalWindow = globalThis.window
        globalThis.window = {
            getComputedStyle: () => ({
                getPropertyValue: () => '',
            }),
        }
        expect(getCaseReelMetrics(el)).toEqual({ tilePx: CASE_TILE_PX, gapPx: CASE_TILE_GAP_PX })
        globalThis.window = originalWindow
    })

    it('computes start offset from tile and gap metrics', () => {
        expect(getCaseReelStartOffset(118, 4)).toBe(-488)
        expect(getCaseReelStartOffset(92, 4)).toBe(-384)
        expect(getCaseReelStartOffset()).toBe(-((CASE_TILE_PX + CASE_TILE_GAP_PX) * 4))
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

    it('settles a pending open once after the pending animation path resolves', () => {
        const pending = {
            picks: [{ name: 'Drop', valueGc: 3.25 }],
            rows: 1,
            settled: false,
            stake: 2,
        }
        const payouts = []
        const settle = (reason) => {
            if (!claimCaseSettlement(pending)) return { reason, settled: false }
            const summary = summarizeCaseSettlement(pending)
            payouts.push(summary.totalReturn)
            return {
                pendingCleared: true,
                phase: 'settled',
                running: false,
                settled: true,
                summary,
            }
        }

        const animationCompletion = settle('animation')
        const lateSkipCompletion = settle('skip')

        expect(animationCompletion).toMatchObject({
            pendingCleared: true,
            phase: 'settled',
            running: false,
            settled: true,
            summary: { profit: 1.25, resultCount: 1, totalReturn: 3.25 },
        })
        expect(lateSkipCompletion).toEqual({ reason: 'skip', settled: false })
        expect(payouts).toEqual([3.25])
    })

    it('keeps reduced-motion or rapid completion from double-settling or hanging pending', () => {
        const pending = { settled: false }
        const completionClaims = [
            claimCaseSettlement(pending),
            claimCaseSettlement(pending),
            claimCaseSettlement(pending),
        ]

        expect(completionClaims).toEqual([true, false, false])
        expect(pending.settled).toBe(true)
    })
})

describe('Wave 2 rarity stinger dispatch', () => {
    const drop = (rarity) => ({ rarity, valueGc: 1 })

    it('returns null for empty drops arrays', () => {
        expect(pickHighestRarityRole([])).toBe(null)
        expect(pickHighestRarityRole(null)).toBe(null)
    })

    it('picks the loudest rarity across a batch', () => {
        expect(pickHighestRarityRole([drop('Mil-Spec'), drop('Covert'), drop('Restricted')]))
            .toBe('rarityCovert')
        expect(pickHighestRarityRole([drop('Covert'), drop('Contraband')]))
            .toBe('rarityContraband')
        expect(pickHighestRarityRole([drop('Covert'), drop('★')]))
            .toBe('rarityStar')
    })

    it('falls back to quiet for low-tier batches', () => {
        expect(pickHighestRarityRole([drop('Mil-Spec'), drop('Industrial'), drop('Consumer')]))
            .toBe('rarityQuiet')
    })

    it('cooldown-gates the rarity stinger so bulk opens do not spam', () => {
        _resetRarityStingerCooldown()
        expect(shouldPlayRarityStinger(true, 1000)).toBe(true)
        expect(shouldPlayRarityStinger(true, 1100)).toBe(false) // 100ms later — within cooldown
        expect(shouldPlayRarityStinger(true, 1201)).toBe(true) // 201ms — outside cooldown
    })

    it('returns false when sfx is disabled in settings', () => {
        _resetRarityStingerCooldown()
        expect(shouldPlayRarityStinger(false, 5000)).toBe(false)
        expect(shouldPlayRarityStinger(undefined, 5000)).toBe(false)
    })
})
