import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'scripts/browserSmoke.mjs'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))

describe('browserSmoke CDP route isolation', () => {
    it('uses experimental WebSocket support for Node 20 raw-CDP package scripts', () => {
        for (const name of ['smoke:browser', 'ux:benchmark', 'audit:a11y', 'audit:contrast', 'verify:betsheet']) {
            expect(packageJson.scripts[name]).toContain('--experimental-websocket')
        }
        expect(packageJson.scripts['audit:scroll']).not.toContain('--experimental-websocket')
        expect(packageJson.scripts['audit:all']).toBe('npm run audit:a11y && npm run audit:contrast && npm run audit:scroll && npm run verify:betsheet')
    })

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

    it('uses shared preflight diagnostics and covers the reliability route matrix', () => {
        expect(source).toContain("from './pagePreflight.mjs'")
        expect(source).toContain('await assertBaseReachable(baseUrl)')
        expect(source).toMatch(/classifyPage\(\{ ready, rootChildren: metrics\.rootChildren, routeErrors: metrics\.routeErrors, requiredContent: metrics\.requiredContent \}\)/)
        expect(source).toContain('preflightReasons')
        expect(source).toContain('routeErrors')
        expect(source).toContain('rootChildren')
        expect(source).toContain('requiredContent')
        expect(source).toContain('!item.ready')
        expect(source).toContain('isFailure(item)')
        for (const route of ['/collections', '/settings', '/insights', '/sicbo', '/war', '/lottery', '/darts', '/tarot']) {
            expect(source).toContain(`'${route}'`)
        }
    })

    it('requires clipped-aware visibility in both smoke selection paths', () => {
        const visibleRectCount = (source.match(/const visibleRect = el =>/g) || []).length
        expect(visibleRectCount).toBe(2)
        expect(source).toMatch(/parentElement[\s\S]*overflowX[\s\S]*overflowY/)
        expect(source).toContain("['hidden', 'clip', 'auto', 'scroll']")
        expect(source).toMatch(/Math\.max\([\s\S]*Math\.min\(/)
        expect(source).toMatch(/return right <= left \|\| bottom <= top \? null/)
    })

    it('requires seated table, truthful coach, and enabled human action in the Poker smoke branch', () => {
        const pokerStart = source.indexOf("if (route === '/poker')")
        const pokerEnd = source.indexOf("if (route === '/cases')", pokerStart)
        const pokerBranch = source.slice(pokerStart, pokerEnd)

        // The retired mobile advice panels must still be asserted gone.
        expect(pokerBranch).toContain("const retiredAbsent = !document.querySelector('.poker-mobile-gto-now, [data-poker-mobile-panel=\"gto\"]');")
        // But retired-selector absence alone is vacuously true, so the gate must also
        // observe the live coach and its truthfulness.
        expect(pokerBranch).toContain("const coach = document.querySelector('[data-poker-coach-state]');")
        expect(pokerBranch).toContain("const truthfulState = coachState !== null && coachState !== 'supported';")
        expect(pokerBranch).toContain('const adviceAbsent = retiredAbsent && truthfulState && freqHonest')
        // The coach sits behind the Coach tab, so the gate must open it before asserting.
        expect(pokerBranch).toMatch(/coachTab[\s\S]*click\(\)/)
        expect(pokerBranch).toContain('return table && adviceAbsent && action')
        expect(pokerBranch).toContain("? ok('poker seated; coach truthful; human action reachable', details)")
        expect(pokerBranch).not.toContain('const gto =')
        expect(pokerBranch).not.toContain('table && gto && action')
        expect(source).toContain("if (viewport.width >= 768 && route !== '/poker') return { status: 'skipped', reason: 'desktop viewport' }")
    })

    it('defaults the smoke base URL to the preview port used by sibling audit scripts', () => {
        expect(source).toContain("argValue('baseUrl', 'http://127.0.0.1:4173')")
        expect(source).not.toContain("argValue('baseUrl', 'http://127.0.0.1:5173')")
    })

    it('uses the clipped rectangle center while retaining visible blocked-target failures', () => {
        expect(source).toContain('const visible = el => Boolean(visibleRect(el));')
        expect(source).toContain('const visible = el => Boolean(visibleRect(el));')
        expect(source).toContain('document.elementFromPoint')
        expect(source).toContain('item.mobileActionHit?.blocked')
    })
})
