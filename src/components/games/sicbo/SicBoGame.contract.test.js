import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { canAddSicBoBet } from './SicBoGame'

const source = readFileSync(new URL('./SicBoGame.jsx', import.meta.url), 'utf8')

describe('Sic Bo native wager contract', () => {
    it('should make every Sic Bo wager native and unavailable when its next chip exceeds balance', () => {
        expect(canAddSicBoBet(false, 5, 5, 10)).toBe(true)
        expect(canAddSicBoBet(true, 0, 5, 100)).toBe(false)
        expect(canAddSicBoBet(false, 0, 5, 0)).toBe(false)
        expect(canAddSicBoBet(false, 0, 5, -5)).toBe(false)
        expect(canAddSicBoBet(false, 0, 5, 4.5)).toBe(false)
        expect(canAddSicBoBet(false, 5, 5, 9)).toBe(false)
        expect(source).not.toMatch(/<div[^>]*className={`sb-cell/)
        expect(source.match(/<button[\s\S]*?className={`sb-cell/g)).toHaveLength(7)
        expect(source).toContain('type="button"')
        expect(source).toContain('aria-pressed={cellOn(')
        expect(source).toContain('disabled={!canAddBet}')
        expect(source).toContain('if (!canAddSicBoBet(running, totalStake, chip, balance)) return')
    })

    it('preserves Sic Bo wager identities, payouts, settlement, and RNG wiring', () => {
        for (const key of ['small', 'big', 'odd', 'even', 'total-${t}', 'single-${n}', 'pair-${n}', 'triple-any', 'triple-${n}', 'combo-${a}-${b}']) {
            expect(source).toContain(key)
        }
        for (const literal of ['2×', '11×', '31×', '181×', '6×', "placeBet(stake, 'Sic Bo')", "nextRoll('sicbo').roll", 'settleBet(k, next)']) {
            expect(source).toContain(literal)
        }
    })
})
