import { describe, expect, it } from 'vitest'
import { resolveScrollPlan } from './useScrollActionIntoView'

describe('resolveScrollPlan', () => {
    it('returns null when inactive', () => {
        expect(resolveScrollPlan({ active: false, hasElement: true, reducedMotion: false })).toBeNull()
    })

    it('returns null when no element is mounted', () => {
        expect(resolveScrollPlan({ active: true, hasElement: false, reducedMotion: false })).toBeNull()
    })

    it('uses smooth scroll when motion is allowed', () => {
        expect(resolveScrollPlan({ active: true, hasElement: true, reducedMotion: false }))
            .toEqual({ behavior: 'smooth', block: 'center' })
    })

    it('uses instant scroll when reduced motion is preferred', () => {
        expect(resolveScrollPlan({ active: true, hasElement: true, reducedMotion: true }))
            .toEqual({ behavior: 'auto', block: 'center' })
    })

    it('honors a custom block alignment', () => {
        expect(resolveScrollPlan({ active: true, hasElement: true, reducedMotion: false, block: 'start' }))
            .toEqual({ behavior: 'smooth', block: 'start' })
    })
})
