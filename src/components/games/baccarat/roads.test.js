import { describe, expect, it } from 'vitest'
import { buildBigRoad, latestBigRoadPosition, tailRoadColumns, tailRoadDots } from './roads'

describe('baccarat roads', () => {
    it('keeps the latest big-road columns in the tail window', () => {
        const outcomes = Array.from({ length: 40 }, (_, index) => index % 2 === 0 ? 'B' : 'P')
        const road = buildBigRoad(outcomes)
        const tail = tailRoadColumns(road, 12)
        const latest = latestBigRoadPosition(road)

        expect(tail.columns).toHaveLength(12)
        expect(tail.offset).toBe(28)
        expect(latest.colIndex).toBe(39)
        expect(latest.rowIndex).toBe(0)
    })

    it('attaches ties to the current cell instead of creating plain outcomes', () => {
        const road = buildBigRoad(['B', 'T', 'T', 'P'])

        expect(road[0].items[0]).toMatchObject({ type: 'B', tie: true })
        expect(road[1].items[0]).toMatchObject({ type: 'P', tie: false })
    })

    it('tail-windows derived road dots from the newest side', () => {
        const dots = Array.from({ length: 50 }, (_, index) => index % 2 ? 'blue' : 'red')
        const tail = tailRoadDots(dots, 10)

        expect(tail.dots).toHaveLength(10)
        expect(tail.offset).toBe(40)
        expect(tail.dots[0]).toBe('red')
    })
})
