import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const env = { SPORTSGAMEODDS_TOKEN: 'fixture-token' }
const START = Date.parse('2026-07-14T00:00:00.000Z')
const FIVE_MINUTES = 5 * 60 * 1000
const providerEnvNames = [
    'SPORTSGAMEODDS_TOKEN', 'SportsGameOdds_token', 'sportsGameOdds_token',
    'PANDASCORE_TOKEN', 'pandascore_token',
    'ODDS_API_IO_TOKEN', 'odds-api_token', 'ODDS_API_TOKEN',
    'API_FOOTBALL_TOKEN', 'api-football_token',
]

function providerResponse(event) {
    return Response.json({ data: [event] })
}

function deferProviderResponse(fetchMock) {
    const { promise, resolve } = Promise.withResolvers()
    fetchMock.mockImplementation(async () => providerResponse(await promise))
    return resolve
}

describe('loadProviderFeed', () => {
    beforeEach(() => {
        for (const name of providerEnvNames) vi.stubEnv(name, undefined)
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(START)
    })

    afterEach(() => {
        vi.resetModules()
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
        vi.useRealTimers()
    })

    it('shares each in-flight refresh and expires the cache five minutes after refresh start', async () => {
        const fetchMock = vi.fn()
        const finishColdRefresh = deferProviderResponse(fetchMock)
        vi.stubGlobal('fetch', fetchMock)
        const { loadProviderFeed } = await import('../../server/sportsbookProviderProxy.js')

        const first = loadProviderFeed(env)
        vi.setSystemTime(START + 1_000)
        const followers = [loadProviderFeed(env), loadProviderFeed(env)]
        vi.setSystemTime(START + 2_000)
        finishColdRefresh({ eventID: 'first-fixture', sportID: 'BASKETBALL' })

        const [fresh, ...joined] = await Promise.all([first, ...followers])
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fresh).toMatchObject({
            cached: false,
            generatedAt: '2026-07-14T00:00:02.000Z',
            sources: { sportsGameOdds: { configured: true, primary: true, eventCount: 1 } },
            sportsGameOdds: { events: [{ eventID: 'first-fixture' }] },
            errors: [],
        })
        expect(joined).toEqual([fresh, fresh])

        vi.setSystemTime(START + FIVE_MINUTES - 1)
        expect(await loadProviderFeed(env)).toEqual({ ...fresh, cached: true })
        expect(fetchMock).toHaveBeenCalledTimes(1)

        vi.setSystemTime(START + FIVE_MINUTES)
        const finishExpiredRefresh = deferProviderResponse(fetchMock)
        const expiredRequests = [loadProviderFeed(env), loadProviderFeed(env)]
        vi.setSystemTime(START + FIVE_MINUTES + 2_000)
        finishExpiredRefresh({ eventID: 'next-fixture', sportID: 'BASKETBALL' })

        const [refreshed, joinedRefresh] = await Promise.all(expiredRequests)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(refreshed).toMatchObject({
            cached: false,
            generatedAt: '2026-07-14T00:05:02.000Z',
            sources: { sportsGameOdds: { configured: true, primary: true, eventCount: 1 } },
            sportsGameOdds: { events: [{ eventID: 'next-fixture' }] },
            errors: [],
        })
        expect(joinedRefresh).toEqual(refreshed)
    })

    it('allows another refresh immediately after an aggregation rejection', async () => {
        // This is valid JSON, but curation cannot convert this malformed sport ID to a string.
        const fetchMock = vi.fn()
            .mockImplementationOnce(async () => providerResponse({ eventID: 'bad-fixture', sportID: { toString: null } }))
            .mockImplementationOnce(async () => providerResponse({ eventID: 'retry-fixture', sportID: 'BASKETBALL' }))
        vi.stubGlobal('fetch', fetchMock)
        const { loadProviderFeed } = await import('../../server/sportsbookProviderProxy.js')

        await expect(loadProviderFeed(env)).rejects.toThrow(TypeError)
        await expect(loadProviderFeed(env)).resolves.toMatchObject({
            cached: false,
            sportsGameOdds: { events: [{ eventID: 'retry-fixture' }] },
            errors: [],
        })
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })
})
