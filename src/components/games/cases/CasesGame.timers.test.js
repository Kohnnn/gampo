import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./CasesGame.jsx', import.meta.url), 'utf8')

describe('CasesGame timer lifecycle', () => {
    it('clears the long-press auto-roll timer on unmount', () => {
        const unmount = src.slice(
            src.indexOf('useEffect(() => () => {'),
            src.indexOf('}, [clearRevealTimers])'),
        )
        expect(unmount).toContain('clearRevealTimers()')
        expect(unmount).toContain('if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current)')
        expect(unmount).toContain('if (celebrationTimerRef.current) window.clearTimeout(celebrationTimerRef.current)')
        expect(unmount).toContain('if (autoRollTimerRef.current) window.clearTimeout(autoRollTimerRef.current)')
    })

    it('tracks the results-scroll timer in the reveal-timer pool', () => {
        expect(src).toContain('revealTimersRef.current.push(scrollId)')
    })

    it('keeps the reveal-timer clear helper draining both pools', () => {
        expect(src).toContain('revealTimersRef.current.forEach(id => window.clearTimeout(id))')
        expect(src).toContain('tickRef.current.ids.forEach(id => window.clearTimeout(id))')
        expect(src).toContain('if (tickRef.current.landId) window.clearTimeout(tickRef.current.landId)')
    })
})

describe('CasesGame settle rounding is handled at source', () => {
    it('rounds totalReturn and profit inside summarizeCaseSettlement', () => {
        const anim = readFileSync(new URL('./casesAnimation.js', import.meta.url), 'utf8')
        expect(anim).toContain('const totalReturn = Math.max(0, Math.round(safePicks.reduce((sum, pick) => sum + (Number(pick?.valueGc) || 0), 0) * 100) / 100)')
        expect(anim).toContain('const profit = Math.round((totalReturn - safeStake) * 100) / 100')
    })

    it('credits the rounded settlement total', () => {
        expect(src).toContain("if (returnAmount > 0) addWinnings(returnAmount, 'Cases return')")
    })
})
