import { describe, expect, it } from 'vitest'
import { SLOT_TEMPLATES } from './slotFactory'
import {
    getBonusCinematic,
    BONUS_CINEMATIC_IDS,
    BONUS_CINEMATIC_MS,
} from './slotBonusCinematics'

const VALID_FAMILIES = new Set(['open', 'rise', 'slash', 'burst', 'drift'])

describe('slot bonus-entry cinematics', () => {
    it('covers every slot template id', () => {
        for (const template of SLOT_TEMPLATES) {
            expect(BONUS_CINEMATIC_IDS).toContain(template.id)
        }
    })

    it('returns a complete, valid cinematic for every template', () => {
        for (const template of SLOT_TEMPLATES) {
            const cine = getBonusCinematic(template.id, {
                kind: 'free-spins',
                freeSpins: 8,
                accent: template.accent,
            })
            expect(VALID_FAMILIES.has(cine.family)).toBe(true)
            expect(cine.glyph).toBeTruthy()
            expect(cine.eyebrow).toBeTruthy()
            expect(cine.title).toBeTruthy()
            expect(cine.caption).toBeTruthy()
            expect(cine.spinsLabel).toBe('8 free spins')
            expect(cine.accent).toBe(template.accent)
        }
    })

    it('singularizes the spins label for a single free spin', () => {
        const cine = getBonusCinematic('bars', { freeSpins: 1 })
        expect(cine.spinsLabel).toBe('1 free spin')
    })

    it('falls back gracefully for an unknown template id', () => {
        const cine = getBonusCinematic('does-not-exist', { kind: 'free-spins' })
        expect(VALID_FAMILIES.has(cine.family)).toBe(true)
        expect(cine.title).toBe('Free Spins')
        expect(cine.spinsLabel).toBe('Free spins')
    })

    it('labels a vault-style burst entry without an explicit spin count', () => {
        const cine = getBonusCinematic('vault-rush', { kind: 'coin-meter-fill' })
        expect(cine.kind).toBe('coin-meter-fill')
        expect(cine.spinsLabel).toBe('Vault free spins')
    })

    it('exposes a positive cinematic duration', () => {
        expect(BONUS_CINEMATIC_MS).toBeGreaterThan(0)
    })
})
