import { describe, expect, it } from 'vitest'
import { classifyPage, isFailure } from '../scripts/pagePreflight.mjs'

describe('pagePreflight', () => {
    it('rejects empty, error, missing-content, and final-not-ready snapshots', () => {
        expect(classifyPage({ ready: true, rootChildren: 0, routeErrors: [], requiredContent: true }).ok).toBe(false)
        expect(classifyPage({ ready: true, rootChildren: 1, routeErrors: ['render failed'], requiredContent: true }).ok).toBe(false)
        expect(classifyPage({ ready: true, rootChildren: 1, routeErrors: [], requiredContent: false }).ok).toBe(false)
        expect(isFailure({ ready: false, rootChildren: 1, routeErrors: [], requiredContent: true })).toBe(true)
    })

    it('requires an explicit ready state with a stable not-ready reason', () => {
        const result = classifyPage({ rootChildren: 1, routeErrors: [], requiredContent: true })

        expect(result).toEqual({
            ok: false,
            reasons: [{ code: 'not-ready', message: 'page did not reach ready state' }],
        })
        expect(classifyPage({ ready: true, rootChildren: 1, routeErrors: [], requiredContent: true }))
            .toEqual({ ok: true, reasons: [] })
        for (const ready of [false, null, 'true']) {
            expect(classifyPage({ ready, rootChildren: 1, routeErrors: [], requiredContent: true }).reasons)
                .toContainEqual(expect.objectContaining({ code: 'not-ready' }))
        }
        expect(classifyPage({ ready: false, rootChildren: 0, routeErrors: ['render failed'], requiredContent: false }).reasons)
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ code: 'not-ready' }),
                expect.objectContaining({ code: 'empty-root' }),
                expect.objectContaining({ code: 'route-error' }),
                expect.objectContaining({ code: 'missing-content' }),
            ]))
    })
})
