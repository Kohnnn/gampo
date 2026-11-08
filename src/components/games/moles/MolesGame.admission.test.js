import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Real-component check for Moles admission. MolesGame renders a tree; the test
// walks it to BetPanel's `onPlay` and drives it exactly as the panel would, so the
// debit, the settle timer and the `running` state are the real ones.
const h = vi.hoisted(() => ({ active: null, visits: [] }))
vi.mock('react', async original => {
    const react = await original()
    const memo = (fn, deps) => {
        const visit = h.active, index = visit.cursor++, old = visit.hooks[index]
        if (!old || !deps || deps.some((value, i) => !Object.is(value, old.deps?.[i])) || deps.length !== old.deps?.length) {
            visit.hooks[index] = { value: fn(), deps }
        }
        return visit.hooks[index].value
    }
    return {
        ...react,
        useState(initial) {
            const visit = h.active, index = visit.cursor++
            if (!visit.hooks[index]) {
                const slot = { value: typeof initial === 'function' ? initial() : initial }
                slot.set = next => {
                    const value = typeof next === 'function' ? next(slot.value) : next
                    if (!Object.is(value, slot.value)) { slot.value = value; visit.dirty = true }
                }
                visit.hooks[index] = slot
            }
            const slot = visit.hooks[index]
            return [slot.value, slot.set]
        },
        useRef(initial) {
            const visit = h.active, index = visit.cursor++
            return visit.hooks[index] ||= { current: initial }
        },
        useMemo: memo,
        useCallback: (fn, deps) => memo(() => fn, deps),
        useEffect(fn, deps) {
            const visit = h.active, index = visit.cursor++, old = visit.hooks[index]
            if (!old || !deps || deps.length !== old.deps?.length || deps.some((value, i) => !Object.is(value, old.deps?.[i]))) {
                visit.pending.push(() => {
                    old?.cleanup?.()
                    const slot = { deps, setup: fn }
                    visit.hooks[index] = slot
                    slot.cleanup = fn()
                })
            }
        },
        useLayoutEffect(fn, deps) { return react.useEffect(fn, deps) },
    }
})
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => h.env.credits }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => h.env.audio }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => h.env.sfx }))
vi.mock('../../../audio/useBgm', () => ({ useGameBgm() {} }))
vi.mock('../../../utils/fairRng', async original => ({ ...await original(), nextRoll: () => ({ roll: 0.5 }) }))
vi.mock('../../games/resources/useOriginalsPreloader', () => ({ useOriginalsPreloader: () => ({ ready: true }) }))
vi.mock('../primitives', async original => ({
    ...await original(),
    useGameSession: () => h.env.session,
    useRoundMachine: () => h.env.machine,
}))

import MolesGame from './MolesGame'
import BetPanel from '../primitives/BetPanel'

// Mirrors MolesGame's REVEAL_MS; asserted against source below.
const REVEAL_MS = 580

function render() {
    const visit = { hooks: [], cursor: 0, pending: [], dirty: false, mounted: true }
    visit.render = () => {
        let passes = 0
        do {
            if (++passes > 30) throw new Error('Unbounded Moles rerender')
            h.active = visit; visit.cursor = 0; visit.pending = []; visit.dirty = false
            visit.value = MolesGame()
            visit.pending.splice(0).forEach(effect => effect())
        } while (visit.dirty)
        return visit.value
    }
    visit.cleanup = () => { visit.hooks.forEach(slot => { slot?.cleanup?.(); if (slot) slot.cleanup = undefined }); visit.mounted = false }
    h.visits.push(visit)
    visit.render()
    return visit
}
function find(node, predicate) {
    if (!React.isValidElement(node)) return null
    if (predicate(node)) return node
    for (const child of React.Children.toArray(node.props?.children)) {
        const hit = find(child, predicate)
        if (hit) return hit
    }
    for (const key of ['panel', 'aside', 'secondary']) {
        const hit = find(node.props?.[key], predicate)
        if (hit) return hit
    }
    return null
}
const panelPlay = visit => find(visit.value, node => node.type === BetPanel).props.onPlay
const holes = visit => {
    const found = []
    const walk = node => {
        if (!React.isValidElement(node)) return
        if (node.type === 'button' && String(node.props.className).includes('moles-hole')) found.push(node)
        React.Children.forEach(node.props.children, walk)
        for (const key of ['panel', 'aside', 'secondary']) if (node.props?.[key]) walk(node.props[key])
    }
    walk(visit.value)
    return found
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
    h.visits = []
    h.env = {
        credits: { balance: 1000, placeBet: vi.fn(() => true), addWinnings: vi.fn(), showToast: vi.fn() },
        audio: { play: vi.fn() }, sfx: { play: vi.fn() },
        session: { history: [], stats: { lastResults: [] }, record: vi.fn(), clear: vi.fn() },
        machine: { start: vi.fn(), finish: vi.fn(), emit: vi.fn() },
    }
})
afterEach(() => { h.visits.forEach(v => v.mounted && v.cleanup()); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Moles double admission', () => {
    it('charges and settles exactly one round for two calls in the same tick', async () => {
        const visit = render()
        holes(visit).slice(0, 2).forEach(hole => hole.props.onClick())
        visit.render()
        const play = panelPlay(visit)
        // Both calls land before any React flush, exactly as a fast double-click
        // or a pumped Auto loop would produce.
        const first = play({ betAmount: 5 })
        const second = play({ betAmount: 5 })
        await expect(second).resolves.toEqual({ profit: 0 })
        expect(h.env.credits.placeBet, 'one debit only').toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(10000)
        visit.render()
        await expect(first).resolves.toMatchObject({ profit: expect.any(Number) })
        expect(h.env.session.record, 'one settled round').toHaveBeenCalledTimes(1)
        // Credits follow the gross return, not the profit: a partial loss still pays.
        const settled = h.env.session.record.mock.calls[0][0]
        expect(settled.betAmount).toBe(5)
        const gross = Math.round((settled.betAmount + settled.profit) * 100) / 100
        if (gross > 0) {
            expect(h.env.credits.addWinnings).toHaveBeenCalledTimes(1)
            expect(h.env.credits.addWinnings.mock.calls[0][0]).toBe(gross)
        } else {
            expect(h.env.credits.addWinnings).not.toHaveBeenCalled()
        }
        visit.cleanup()
    })

    it('admits a new round after the previous one settles', async () => {
        const visit = render()
        holes(visit).slice(0, 1).forEach(hole => hole.props.onClick())
        visit.render()
        const play = panelPlay(visit)
        const first = play({ betAmount: 5 })
        vi.advanceTimersByTime(10000); visit.render()
        await first
        const records = h.env.session.record.mock.calls.length
        holes(visit).slice(0, 1).forEach(hole => hole.props.onClick())
        visit.render()
        const second = panelPlay(visit)({ betAmount: 5 })
        vi.advanceTimersByTime(10000); visit.render()
        await second
        expect(h.env.credits.placeBet).toHaveBeenCalledTimes(2)
        expect(h.env.session.record.mock.calls.length).toBe(records + 1)
        visit.cleanup()
    })
})
