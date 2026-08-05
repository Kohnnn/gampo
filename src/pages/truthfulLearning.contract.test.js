import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MISSIONS } from '../data/missions'

const expectedMissionRoutes = {
    'daily-spins-10': '/originals',
    'daily-wins-3': '/dice',
    'daily-multi-5': '/limbo',
    'daily-3-games': '/',
    'daily-profit-50': '/blackjack',
    'daily-wagered-250': '/slots',
    'weekly-spins-100': '/originals',
    'weekly-wagered-1000': '/slots',
    'weekly-streak-5': '/mines',
    'weekly-multi-25': '/wheel',
    'weekly-5-games': '/',
    'weekly-bigwin-500': '/crash',
    'lifetime-spins-1000': '/originals',
    'lifetime-wagered-10000': '/slots-lobby',
    'lifetime-multi-100': '/crash',
    'lifetime-games-15': '/',
    'lifetime-games-40': '/',
    'lifetime-wagered-100000': '/slots-lobby',
    'lifetime-multi-500': '/limbo',
}

const homeSource = readFileSync(new URL('./HomePage.jsx', import.meta.url), 'utf8')
const casinoSource = readFileSync(new URL('./CasinoPages.jsx', import.meta.url), 'utf8')
const insightsSource = readFileSync(new URL('./InsightsPage.jsx', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

function missionRoutesFromSource() {
    const start = casinoSource.indexOf('const MISSION_ROUTES = {')
    const end = casinoSource.search(/\r?\n}\r?\n\r?\nfunction missionRouteFor/)

    expect(start, 'MISSION_ROUTES declaration is missing').toBeGreaterThanOrEqual(0)
    expect(end, 'MISSION_ROUTES closing boundary is missing').toBeGreaterThan(start)
    return Object.fromEntries([...casinoSource.slice(start, end).matchAll(/'([^']+)':\s*'([^']+)'/g)].map(([, id, path]) => [id, path]))
}

function appRouteLiteralsFromSource() {
    return new Set([...appSource.matchAll(/path="([^"]+)"/g)].map(([, path]) => path === '/' ? '/' : `/${path.replace(/^\/+/, '')}`))
}

describe('truthful learning contract', () => {
    it('keeps the Home snapshot and Probability Lab labels on the existing learning route', () => {
        expect(homeSource).toContain('Progress Snapshot')
        expect(homeSource).toContain('Probability Lab')
        expect(homeSource).toMatch(/<Link className="casino-action" to="\/learn">[\s\S]*?Probability Lab[\s\S]*?<\/Link>/)
    })

    it('keeps LearnPage educational and free from reward claims', () => {
        const learnPage = casinoSource.slice(casinoSource.indexOf('export function LearnPage()'), casinoSource.indexOf('export function ActivityPage()'))

        expect(learnPage).toContain('Educational probability')
        expect(learnPage).toContain('Probability Lab')
        expect(learnPage).toContain('Educational probability material for exploring game rules, probability, and house-edge concepts with local practice credits.')
        expect(learnPage).toContain('Explore practice games')
        expect(learnPage).toMatch(/to="\/originals"/)
        expect(learnPage).not.toMatch(/\b(rakeback|bonuses?|earnings?|rewards?)\b/i)
    })

    it('maps every current mission exactly and every destination to a static App route literal', () => {
        const missionRoutes = missionRoutesFromSource()
        const appRouteLiterals = appRouteLiteralsFromSource()
        const missionIds = MISSIONS.map(({ id }) => id)
        const expectedIds = Object.keys(expectedMissionRoutes)
        const missingMissionIds = expectedIds.filter(id => !missionIds.includes(id))
        const unexpectedMissionIds = missionIds.filter(id => !expectedIds.includes(id))
        const missingLocalEntries = expectedIds.filter(id => !(id in missionRoutes))
        const extraLocalEntries = Object.keys(missionRoutes).filter(id => !(id in expectedMissionRoutes))
        const routeValueMismatches = expectedIds.filter(id => missionRoutes[id] !== expectedMissionRoutes[id])
        const missingDestinations = [...new Set(Object.values(expectedMissionRoutes))].filter(path => !appRouteLiterals.has(path))

        expect({ missingMissionIds, unexpectedMissionIds }).toEqual({ missingMissionIds: [], unexpectedMissionIds: [] })
        expect({ missingLocalEntries, extraLocalEntries, routeValueMismatches }).toEqual({ missingLocalEntries: [], extraLocalEntries: [], routeValueMismatches: [] })
        expect(missionRoutes).toEqual(expectedMissionRoutes)
        expect(missingDestinations).toEqual([])

        for (const [missionId, mappedPath] of Object.entries(expectedMissionRoutes)) {
            expect(appRouteLiterals.has(mappedPath), `mission route mismatch: ${missionId} maps to ${mappedPath}; available App.jsx route literals: ${[...appRouteLiterals].sort().join(', ')}`).toBe(true)
        }
    })

    it('keeps unknown mission fallback local to /originals', () => {
        expect(casinoSource).toMatch(/return MISSION_ROUTES\[mission\.id\] \|\| '\/originals'/)
    })

    it('qualifies the Insights estimate while preserving its formatting, range, calculation, and comparison', () => {
        const paragraph = insightsSource.match(/<p className="insights-band">([\s\S]*?)<\/p>/)?.[1]
        expect(paragraph, 'insights-band paragraph is missing').toBeTruthy()
        const normalized = paragraph.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

        expect(normalized).toContain('Illustrative 95% estimate')
        expect(normalized).toContain('simplified variance model')
        expect(normalized.indexOf('Illustrative 95% estimate')).toBeLessThan(normalized.indexOf('results between'))
        expect(paragraph).toMatch(/\{pct\(theoretical\.band\.lower\)\}[\s\S]*?and[\s\S]*?\{pct\(theoretical\.band\.upper\)\}/)
        expect(insightsSource).toContain('return `${(v * 100).toFixed(1)}%`')
        expect(insightsSource).toContain('const band = rtp != null ? rtpConfidenceBand(rtp, allTime.count) : null')
        expect(insightsSource).toContain('allTime.realizedRtp < theoretical.band.lower || allTime.realizedRtp > theoretical.band.upper')
    })
})
