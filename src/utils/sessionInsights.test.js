import { describe, it, expect } from 'vitest'
import { buildSessionInsights } from './sessionInsights'

const entries = [
    { ts: 1, gameId: 'dice', profit: 10, betAmount: 10 },
    { ts: 2, gameId: 'dice', profit: -10, betAmount: 10 },
    { ts: 3, gameId: 'dice', profit: -10, betAmount: 10 },
    { ts: 4, gameId: 'crash', profit: 40, betAmount: 20 },
    { ts: 5, gameId: 'crash', profit: -20, betAmount: 20 },
]

describe('buildSessionInsights', () => {
    it('aggregates totals and realized RTP', () => {
        const r = buildSessionInsights(entries)
        expect(r.count).toBe(5)
        expect(r.wins).toBe(2)
        expect(r.losses).toBe(3)
        expect(r.profit).toBe(10)
        expect(r.wagered).toBe(70)
        // returned = wagered + profit = 80; rtp = 80/70
        expect(r.realizedRtp).toBeCloseTo(80 / 70, 2)
    })

    it('tracks biggest win/loss and streaks', () => {
        const r = buildSessionInsights(entries)
        expect(r.biggestWin).toBe(40)
        expect(r.biggestLoss).toBe(-20)
        expect(r.streaks.bestLoss).toBe(2)
        expect(r.streaks.bestWin).toBe(1)
    })

    it('breaks down per game sorted by impact', () => {
        const r = buildSessionInsights(entries)
        expect(r.games.length).toBe(2)
        // crash net +20 vs dice net -10 → crash first by |profit|
        expect(r.games[0].gameId).toBe('crash')
        expect(r.games[0].profit).toBe(20)
        expect(r.games.find(g => g.gameId === 'dice').profit).toBe(-10)
    })

    it('applies a real-stakes multiplier', () => {
        const r = buildSessionInsights(entries, { realStakeMultiplier: 0.5 })
        expect(r.realStakes.wagered).toBe(35)
        expect(r.realStakes.net).toBe(5)
    })

    it('marks small samples unreliable and handles empty input', () => {
        expect(buildSessionInsights(entries).reliable).toBe(false)
        const empty = buildSessionInsights([])
        expect(empty.count).toBe(0)
        expect(empty.realizedRtp).toBeNull()
    })

    it('flags 20+ rounds as reliable', () => {
        const many = Array.from({ length: 25 }, (_, i) => ({ ts: i, gameId: 'dice', profit: i % 2 ? 5 : -5, betAmount: 5 }))
        expect(buildSessionInsights(many).reliable).toBe(true)
    })
})
