import { describe, expect, it } from 'vitest'
import { SLOT_TEMPLATE_ROUTES, SLOT_TEMPLATE_ROUTE_ALIASES, slotPath } from './slotRoutes'

describe('slot route aliases', () => {
    it('gives the first themed slot templates direct public routes', () => {
        expect(slotPath('vault-rush')).toBe('/vault-rush')
        expect(slotPath('river-catcher')).toBe('/river-catcher')
        expect(slotPath('dust-rail')).toBe('/dust-rail')
        expect(slotPath('storm-banner')).toBe('/storm-banner')
        expect(slotPath('bassline-bonus')).toBe('/bassline-bonus')
    })

    it('keeps every slot template route unique', () => {
        const paths = SLOT_TEMPLATE_ROUTES.map(route => route.path)
        expect(new Set(paths).size).toBe(paths.length)
    })

    it('keeps full-title aliases pointed at canonical playable routes', () => {
        expect(SLOT_TEMPLATE_ROUTE_ALIASES).toContainEqual({ path: '/bass-bayou-collect', target: '/bass-bayou' })
        expect(SLOT_TEMPLATE_ROUTE_ALIASES).toContainEqual({ path: '/miko-spirit-lanterns', target: '/miko-spirit' })
        expect(SLOT_TEMPLATE_ROUTE_ALIASES).toContainEqual({ path: '/forge-of-the-anvil', target: '/forge-anvil' })
    })

    it('falls back to the slot factory route for unknown ids', () => {
        expect(slotPath('missing-template')).toBe('/slots')
    })
})
