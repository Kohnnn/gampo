import { describe, it, expect } from 'vitest'
import { buildSparkline } from './slotSparkline'

describe('buildSparkline', () => {
    it('returns an empty path for no history', () => {
        const s = buildSparkline([])
        expect(s.path).toBe('')
        expect(s.net).toBe(0)
        expect(s.points).toEqual([])
    })

    it('accumulates net profit oldest->newest (history is newest-first)', () => {
        // newest-first: [+5 (latest), -3, +10 (oldest)] → cumulative 10,7,12
        const s = buildSparkline([{ profit: 5 }, { profit: -3 }, { profit: 10 }])
        expect(s.net).toBe(12)
        expect(s.last).toBe(12)
        expect(s.points.length).toBe(3)
    })

    it('maps points within the box bounds', () => {
        const s = buildSparkline([{ profit: 5 }, { profit: -10 }, { profit: 20 }], { width: 100, height: 40 })
        for (const p of s.points) {
            expect(p.x).toBeGreaterThanOrEqual(0)
            expect(p.x).toBeLessThanOrEqual(100)
            expect(p.y).toBeGreaterThanOrEqual(0)
            expect(p.y).toBeLessThanOrEqual(40)
        }
    })

    it('caps to maxPoints', () => {
        const many = Array.from({ length: 100 }, (_, i) => ({ profit: i % 2 ? 1 : -1 }))
        const s = buildSparkline(many, { maxPoints: 20 })
        expect(s.points.length).toBe(20)
    })

    it('produces a valid SVG move/line path', () => {
        const s = buildSparkline([{ profit: 1 }, { profit: 2 }])
        expect(s.path.startsWith('M')).toBe(true)
        expect(s.path).toContain('L')
    })
})
