import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const proxySource = readFileSync(new URL('../../server/sportsbookProviderProxy.js', import.meta.url), 'utf8')

describe('sportsbook provider proxy source contract', () => {
    it('applies marquee filtering server-side before odds fanout and exposes metrics', () => {
        expect(proxySource).toContain("import { curateTopSportsbookItems, mergeMarqueeMetrics }")
        expect(proxySource).toContain('const MAX_EVENTS_PER_SPORT = 12')
        expect(proxySource).toContain('const MIN_EVENTS_PER_SPORT = 5')
        expect(proxySource).toContain('const MAX_VISIBLE_EVENTS = 120')
        expect(proxySource).toContain('const filtered = curateTopSportsbookItems(events, { perSport: MAX_EVENTS_PER_SPORT, minimumVisible: MIN_EVENTS_PER_SPORT, maximumVisible: MAX_VISIBLE_EVENTS })')
        expect(proxySource).toContain('const eventIds = filtered.items.map')
        expect(proxySource).toContain('marquee: mergeMarqueeMetrics')
        expect(proxySource).toContain('fetchJsonWithRotatingKeys')
        expect(proxySource).toContain("url.searchParams.set('per_page', '100')")
        expect(proxySource).toContain('Array.from({ length: 3 }')
        expect(proxySource).toContain('if (sportCount >= MIN_EVENTS_PER_SPORT) break')
        expect(proxySource).toContain('API_SPORTS_MULTI_SPORTS')
        expect(proxySource).toContain("host: 'v1.basketball.api-sports.io'")
        expect(proxySource).toContain("host: 'v1.formula-1.api-sports.io'")
        expect(proxySource).toContain('multiSport: multiSportFiltered.items.slice')
    })
})
