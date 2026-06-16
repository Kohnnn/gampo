import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const proxySource = readFileSync(new URL('../../server/sportsbookProviderProxy.js', import.meta.url), 'utf8')

describe('sportsbook provider proxy source contract', () => {
    it('applies marquee filtering server-side before odds fanout and exposes metrics', () => {
        expect(proxySource).toContain("import { curateTopSportsbookItems, mergeMarqueeMetrics }")
        expect(proxySource).toContain('const filtered = curateTopSportsbookItems(events, { perSport: 5, minimumVisible: 16, maximumVisible: 28 })')
        expect(proxySource).toContain('const eventIds = filtered.items.map')
        expect(proxySource).toContain('marquee: mergeMarqueeMetrics')
    })
})
