import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const proxySource = readFileSync(new URL('../../server/sportsbookProviderProxy.js', import.meta.url), 'utf8')

describe('sportsbook provider proxy source contract', () => {
    it('applies marquee filtering server-side before odds fanout and exposes metrics', () => {
        expect(proxySource).toContain("import { curateTopSportsbookItems, mergeMarqueeMetrics }")
        expect(proxySource).toContain('const filtered = curateTopSportsbookItems(events, { perSport: 20, minimumVisible: 50, maximumVisible: 100 })')
        expect(proxySource).toContain('const eventIds = filtered.items.map')
        expect(proxySource).toContain('marquee: mergeMarqueeMetrics')
        expect(proxySource).toContain('fetchJsonWithRotatingKeys')
        expect(proxySource).toContain("url.searchParams.set('per_page', '100')")
        expect(proxySource).toContain('Array.from({ length: 7 }')
        expect(proxySource).toContain('API_SPORTS_MULTI_SPORTS')
        expect(proxySource).toContain("host: 'v1.basketball.api-sports.io'")
        expect(proxySource).toContain("host: 'v1.formula-1.api-sports.io'")
        expect(proxySource).toContain('multiSport: multiSportFiltered.items.slice')
    })
})
