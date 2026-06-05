import { describe, expect, it } from 'vitest'
import { levelRewardCredits, DAILY_CLAIM_CREDITS, STARTER_PACKS } from './rewards'

describe('rewards data', () => {
    it('level 1 grants nothing; rewards grow with level', () => {
        expect(levelRewardCredits(1)).toBe(0)
        expect(levelRewardCredits(2)).toBeGreaterThan(0)
        expect(levelRewardCredits(10)).toBeGreaterThan(levelRewardCredits(5))
    })

    it('milestone levels (x5, x10) pay a bonus', () => {
        expect(levelRewardCredits(5)).toBeGreaterThan(levelRewardCredits(4))
        expect(levelRewardCredits(10) - levelRewardCredits(9)).toBeGreaterThan(40)
    })

    it('daily claim is a fixed positive amount', () => {
        expect(DAILY_CLAIM_CREDITS).toBeGreaterThan(0)
    })

    it('offers a free-play option plus paid starter packs', () => {
        const free = STARTER_PACKS.find(p => p.credits === 0)
        expect(free).toBeTruthy()
        expect(STARTER_PACKS.some(p => p.credits > 0)).toBe(true)
    })
})

