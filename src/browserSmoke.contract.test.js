import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'scripts/browserSmoke.mjs'), 'utf8')

describe('browserSmoke CDP route isolation', () => {
    it('creates and closes a fresh target for every route check', () => {
        const routeLoop = source.indexOf('for (const route of routes)')
        const createAfterRouteLoop = source.indexOf("Target.createTarget", routeLoop)
        const navigateAfterRouteLoop = source.indexOf("Page.navigate", routeLoop)
        const closeAfterRouteLoop = source.indexOf("Target.closeTarget", routeLoop)

        expect(routeLoop, 'route loop exists').toBeGreaterThan(-1)
        expect(createAfterRouteLoop, 'create target inside route loop').toBeGreaterThan(routeLoop)
        expect(createAfterRouteLoop, 'target is created before route navigation').toBeLessThan(navigateAfterRouteLoop)
        expect(closeAfterRouteLoop, 'target is closed after route check').toBeGreaterThan(navigateAfterRouteLoop)
    })
})
