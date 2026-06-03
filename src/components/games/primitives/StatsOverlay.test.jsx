import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import StatsOverlay from './StatsOverlay'

function makeStats(count, rtp = 1.12) {
    return {
        count,
        wins: Math.floor(count / 2),
        profit: 0,
        rtp,
        biggestWin: 0,
        streakWin: 0,
        streakLoss: 0,
        wagered: count * 5,
        lastResults: [],
    }
}

describe('StatsOverlay', () => {
    it('hides noisy observed RTP before 20 rounds', () => {
        const html = renderToStaticMarkup(<StatsOverlay stats={makeStats(12)} definition={{ rtp: 0.96 }} />)
        expect(html).toContain('Too few samples')
        expect(html).toContain('Stabilizes after ~100 rounds')
        expect(html).not.toContain('112.0%')
    })

    it('shows observed RTP once the sample is large enough', () => {
        const html = renderToStaticMarkup(<StatsOverlay stats={makeStats(20)} definition={{ rtp: 0.96 }} />)
        expect(html).toContain('112.0%')
        expect(html).not.toContain('Too few samples')
    })
})
