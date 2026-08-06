import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { makeBet } from './layout'
import { round2 } from '../../../utils/simulationMath'

const source = readFileSync(new URL('./RouletteGame.jsx', import.meta.url), 'utf8')

// Mirror of the settle block in RouletteGame.performPlay. The component cannot
// be rendered here (no DOM-renderer dependency in this repo), so the money math
// is duplicated and then locked to the component by the pinning tests below:
// if the component's settle math changes, those tests fail and force this
// mirror to be updated in the same commit.
function settle({ bets, landed }) {
    let rawReturn = 0
    for (const bet of bets) {
        const m = makeBet(bet.type, bet.params)
        if (m.numbers.includes(landed)) rawReturn += bet.amount * m.payout
    }
    const totalReturn = round2(rawReturn)
    const profit = round2(totalReturn - bets.reduce((s, b) => s + b.amount, 0))
    return { totalReturn, profit }
}

describe('roulette component parses', () => {
    // The settle/lifecycle tests above read RouletteGame.jsx as text, so a
    // syntax error in the component would not fail them -- nothing imports it.
    // This test imports the module so a broken component fails the suite
    // instead of only failing `npm run build`.
    it('imports without a syntax or module-resolution error', async () => {
        const mod = await import('./RouletteGame.jsx')
        expect(typeof mod.default).toBe('function')
    })
})

describe('roulette settlement math', () => {
    it('pays a straight-up hit at 36x decimal (35:1 plus stake back)', () => {
        const { totalReturn, profit } = settle({
            bets: [{ type: 'straight', params: { n: 17 }, amount: 5 }],
            landed: 17,
        })
        expect(totalReturn).toBe(180)
        expect(profit).toBe(175)
    })

    it('loses the whole stake when nothing is covered', () => {
        const { totalReturn, profit } = settle({
            bets: [{ type: 'straight', params: { n: 17 }, amount: 5 }],
            landed: 18,
        })
        expect(totalReturn).toBe(0)
        expect(profit).toBe(-5)
    })

    it('returns exactly the stake on an even-money hit, so profit is the stake', () => {
        const { totalReturn, profit } = settle({
            bets: [{ type: 'red', params: {}, amount: 10 }],
            landed: 1, // red
        })
        expect(totalReturn).toBe(20)
        expect(profit).toBe(10)
    })

    it('treats zero as a loss for even-money bets', () => {
        const { profit } = settle({
            bets: [{ type: 'red', params: {}, amount: 10 }, { type: 'black', params: {}, amount: 10 }],
            landed: 0,
        })
        // The house edge on a single-zero wheel lives entirely in this case.
        expect(profit).toBe(-20)
    })

    it('rounds racetrack payouts to cents instead of leaking binary fractions', () => {
        // Voisins covers 17 numbers and pays 36/17 = 2.1176470588...
        const voisins = makeBet('voisins', {})
        expect(voisins.numbers).toHaveLength(17)
        expect(voisins.payout).not.toBe(round2(voisins.payout))

        const landed = voisins.numbers[0]
        const { totalReturn, profit } = settle({
            bets: [{ type: 'voisins', params: {}, amount: 17 }],
            landed,
        })
        // 17 * (36/17) = 36 exactly in real arithmetic; the point is that the
        // credited value and the recorded profit are both clean 2dp numbers.
        expect(totalReturn).toBe(36)
        expect(profit).toBe(19)
        expect(totalReturn).toBe(round2(totalReturn))
        expect(profit).toBe(round2(profit))
    })

    it('produces a 2dp-clean profit for an awkward racetrack stake', () => {
        const { totalReturn, profit } = settle({
            bets: [{ type: 'voisins', params: {}, amount: 5 }],
            landed: makeBet('voisins', {}).numbers[3],
        })
        // 5 * 36/17 = 10.588235294117647 -> 10.59
        expect(totalReturn).toBe(10.59)
        expect(profit).toBe(5.59)
        expect(String(profit)).toMatch(/^-?\d+(\.\d{1,2})?$/)
    })

    it('sums multiple winning legs before rounding once', () => {
        const { profit } = settle({
            bets: [
                { type: 'red', params: {}, amount: 10 },
                { type: 'dozen1', params: {}, amount: 10 },
            ],
            landed: 1, // red and in the first dozen
        })
        // 20 + 30 = 50 returned on 20 staked.
        expect(profit).toBe(30)
    })
})

describe('roulette settlement is pinned to the component', () => {
    it('rounds the return and the profit in the component settle block', () => {
        expect(source).toContain('const totalReturn = round2(rawReturn)')
        expect(source).toContain('const profit = round2(totalReturn - stake)')
    })

    it('accumulates into rawReturn using the same payout lookup as this mirror', () => {
        expect(source).toContain('rawReturn += bet.amount * m.payout')
        expect(source).toContain('if (m.numbers.includes(number))')
    })

    it('imports round2 rather than hand-rolling a rounding expression', () => {
        expect(source).toMatch(/import \{ formatCredits, round2 \} from '\.\.\/\.\.\/\.\.\/utils\/simulationMath'/)
        expect(source).not.toContain('.toFixed(2))')
    })

    it('records the rounded profit, not a raw float', () => {
        const recordBlock = source.slice(source.indexOf('session.record({'))
        expect(recordBlock).toContain('profit, betAmount: stake')
    })
})

describe('roulette timer and frame lifecycle', () => {
    it('schedules every phase timer through the cancellable scheduler', () => {
        // No bare window.setTimeout may survive: those outlive unmount.
        expect(source).not.toContain('window.setTimeout')
        expect(source).toContain("import { useCancellableFrames, useCancellableTimeouts } from '../../../utils/scheduling'")
    })

    it('drives the betting countdown through the cancellable frame loop', () => {
        // The countdown reschedules itself every frame, so an uncancelled loop
        // never stops and keeps setState-ing after unmount.
        expect(source).not.toContain('window.requestAnimationFrame')
        expect(source).toContain('bettingTickRef.current = requestFrame(beat)')
    })

    it('clears stale timers and frames when a new round starts', () => {
        const play = source.slice(source.indexOf('const performPlay'))
        const guardIdx = play.indexOf('cancelAll()')
        const framesIdx = play.indexOf('cancelFrames()')
        expect(guardIdx).toBeGreaterThan(-1)
        expect(framesIdx).toBeGreaterThan(guardIdx)
    })

    it('refuses to start a second spin while one is in flight', () => {
        const play = source.slice(source.indexOf('const performPlay'))
        const guard = play.slice(0, play.indexOf('cancelAll()'))
        expect(guard).toContain('if (spinning)')
        expect(guard).toContain('resolve({ profit: 0 })')
    })
})
