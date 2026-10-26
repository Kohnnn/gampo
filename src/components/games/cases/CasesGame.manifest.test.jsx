import React from 'react'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Cases-local Node adapter: stable setters, dependency-aware hooks, isolated visits.
const h = vi.hoisted(() => ({ active: null, visits: [], preloader: { ready: true }, params: null, env: {} }))
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
                    visit.writes++
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
    }
})
vi.mock('react-dom', async original => ({
    ...await original(), createPortal: children => { h.active.portals.push(children); return null },
}))
vi.mock('react-router-dom', () => ({ useSearchParams: () => [h.params, h.env.setSearchParams] }))
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => h.env.credits }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => h.env.audio }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => h.env.sfx }))
vi.mock('../../../audio/useBgm', () => ({ useGameBgm() {} }))
vi.mock('../../../hooks/useSettings', () => ({ useSettings: () => ({ haptics: false, sfx: false }) }))
vi.mock('../../../hooks/useCaseCollection', () => ({ useCaseCollection: () => h.env.collection }))
vi.mock('../../../hooks/useCsCollection', () => ({ useCsCollection: () => h.env.catalog }))
vi.mock('../../../hooks/useProgress', async original => ({ ...await original(), recordCaseDrop: (...args) => h.env.progress(...args) }))
vi.mock('../../../hooks/useScrollActionIntoView', () => ({ useScrollActionIntoView() {} }))
vi.mock('../../games/resources/useOriginalsPreloader', () => ({ useOriginalsPreloader: () => h.preloader }))
vi.mock('../../../utils/haptics', () => ({ haptic() {}, cancelHaptics() {} }))
vi.mock('../../../utils/fairRng', async original => ({
    ...await original(), nextRoll: (...args) => h.env.roll(...args), getProvablyFair: () => null,
    getRecentRolls: () => [], maskSeed: value => value, setClientSeed() {},
}))
vi.mock('../primitives', async original => ({
    ...await original(), useGameSession: () => h.env.session, useRoundMachine: () => h.env.machine,
}))

import CasesGame from './CasesGame'
import { useCasesManifest } from './useCasesManifest'
import { filterCasesByCategory, normalizeCaseForRuntime, rarityDropWeight } from './caseEconomy'
import * as opening from './caseOpening'

const realCatalog = JSON.parse(readFileSync(new URL('../../../../public/data/cs-cases.json', import.meta.url), 'utf8'))
const fixture = (overrides = {}) => [{
    id: 'case-one', name: 'Test case', items: [{ id: 'skin-one', name: 'Test skin', rarity: 'Mil-Spec Grade', valueGc: 2 }],
    ...overrides,
}]
const response = data => ({ ok: true, json: vi.fn().mockResolvedValue(data) })
const deferred = () => {
    let resolve, reject
    const promise = new Promise((yes, no) => { resolve = yes; reject = no })
    return { promise, resolve, reject }
}

function mount(render = useCasesManifest) {
    const visit = { hooks: [], cursor: 0, pending: [], portals: [], writes: 0, dirty: false, mounted: true }
    visit.render = () => {
        let passes = 0
        do {
            if (++passes > 20) throw new Error('Unbounded Cases rerender')
            h.active = visit; visit.cursor = 0; visit.pending = []; visit.portals = []; visit.dirty = false
            visit.value = render()
            visit.pending.splice(0).forEach(effect => effect())
        } while (visit.dirty)
        return visit.value
    }
    visit.cleanup = () => {
        visit.hooks.forEach(slot => { slot?.cleanup?.(); if (slot) slot.cleanup = undefined })
        visit.mounted = false
    }
    visit.replay = () => {
        visit.cleanup(); visit.mounted = true
        h.active = visit
        visit.hooks.forEach(slot => { if (slot?.setup) slot.cleanup = slot.setup() })
        visit.render()
    }
    h.visits.push(visit)
    visit.render()
    return visit
}
async function settle(visit) {
    // Fetch, JSON, publication and finally each receive a microtask turn.
    for (let i = 0; i < 12; i++) await Promise.resolve()
    if (visit.mounted) visit.render()
}
function nodes(visit, root = visit.value) {
    const found = []
    const walk = node => {
        if (!React.isValidElement(node)) return
        found.push(node)
        if (typeof node.type === 'function' && ['CaseRightPanel', 'CoreStageFrame'].includes(node.type.name)) {
            walk(node.type(node.props))
            return
        }
        React.Children.forEach(node.props.children, walk)
        React.Children.forEach(node.props.aside, walk)
        React.Children.forEach(node.props.panel, walk)
    }
    walk(root)
    if (root === visit.value) visit.portals.forEach(walk)
    return found
}
function find(visit, predicate) {
    const node = nodes(visit).find(predicate)
    expect(node, 'actual Cases control exists').toBeTruthy()
    return node
}
const desktop = visit => find(visit, node => node.type === 'button' && node.props['data-game-action']?.startsWith('case-open'))
const mobile = visit => find(visit, node => node.type === 'button' && Object.hasOwn(node.props, 'data-cases-mobile-open'))
const auto = visit => find(visit, node => node.props['data-case-action'] === 'auto-start')
const retry = visit => {
    const control = nodes(visit, frame(visit).props.loadingNode).find(node => node.type === 'button' && node.props['aria-label'] === 'Retry loading cases')
    expect(control, 'native Retry exists in the visible loading slot').toBeTruthy()
    return control
}
const frame = visit => find(visit, node => node.type?.name === 'CoreStageFrame')
const text = node => React.isValidElement(node) ? React.Children.toArray(node.props.children).map(text).join('') : String(node ?? '')
const witnesses = () => [h.env.credits.placeBet, h.env.credits.addWinnings, h.env.creation, h.env.roll, h.env.machine.start, h.env.session.record, h.env.collection.recordDrop, h.env.progress]
function expectInert() { witnesses().forEach(fn => expect(fn).not.toHaveBeenCalled()) }
function attemptActions(visit) {
    for (const control of [desktop(visit), mobile(visit)]) {
        expect(control.props.disabled).toBe(true)
        control.props.onClick() // Deliberately bypass native disabled protection.
        control.props.onMouseDown()
        control.props.onMouseUp()
        control.props.onMouseDown()
        control.props.onMouseLeave()
        control.props.onTouchStart()
        control.props.onTouchEnd()
        control.props.onMouseDown() // Leave a hold armed if the readiness guard is missing.
    }
    expect(auto(visit).props.disabled).toBe(true)
    auto(visit).props.onClick()
    visit.render()
    expect(visit.value.props.aside.props.isHolding).toBe(false)
    expect(visit.value.props.aside.props.autoOpen).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
}

beforeEach(() => {
    vi.useFakeTimers()
    h.visits = []; h.preloader = { ready: true }; h.params = new URLSearchParams()
    h.env = {
        setSearchParams: vi.fn(), credits: { balance: 1000, placeBet: vi.fn(() => true), addWinnings: vi.fn(), showToast: vi.fn() },
        audio: { play: vi.fn() }, sfx: { play: vi.fn() },
        catalog: { loaded: false, catalog: null, load: vi.fn() },
        collection: { drops: [], pokedex: {}, caseStats: {}, summary: { uniqueVariants: 0 }, recordDrop: vi.fn() },
        session: { history: [], stats: { lastResults: [] }, record: vi.fn() },
        machine: { start: vi.fn(), emit: vi.fn(), finish: vi.fn() }, progress: vi.fn(), roll: vi.fn(() => ({ roll: 0.5 })),
        creation: vi.spyOn(opening, 'createCaseOpeningRound'),
    }
    vi.stubGlobal('window', { setTimeout, clearTimeout, matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('document', { body: {}, activeElement: null, documentElement: { classList: { contains: () => false } } })
    vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
    h.visits.forEach(visit => { if (visit.mounted) visit.cleanup() })
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers()
})

describe('Cases manifest request boundary', () => {
    it.each(['network', 'http', 'json'])('settles %s failure and retries once synchronously before rerender', async kind => {
        const json = vi.fn().mockRejectedValue(new Error('bad JSON'))
        if (kind === 'network') fetch.mockRejectedValueOnce(new Error('offline'))
        else fetch.mockResolvedValueOnce(kind === 'http' ? { ok: false, status: 503, json } : { ok: true, json })
        const visit = mount()
        expect(visit.value).toMatchObject({ cases: null, status: 'loading', error: null })
        const stableRetry = visit.value.retry
        await settle(visit)
        expect(visit.value).toMatchObject({ cases: null, status: 'error' })
        expect(visit.value.error).toBeTruthy()
        if (kind === 'http') expect(json).not.toHaveBeenCalled()
        const pending = deferred()
        fetch.mockReturnValueOnce(pending.promise)
        visit.value.retry(); visit.value.retry()
        expect(fetch).toHaveBeenCalledTimes(2)
        visit.render()
        expect(visit.value).toMatchObject({ cases: null, status: 'loading', error: null })
        expect(visit.value.retry).toBe(stableRetry)
        pending.reject(new Error('still offline')); await settle(visit)
        expect(visit.value.status).toBe('error')
        fetch.mockResolvedValueOnce(response(fixture()))
        visit.value.retry(); await settle(visit)
        expect(visit.value).toMatchObject({ status: 'ready', error: null })
        expect(visit.value.cases).toEqual(fixture().map(value => normalizeCaseForRuntime(value)))
        expect(fetch.mock.calls.map(([url]) => url)).toEqual(Array(3).fill('/data/cs-cases.json'))
    })

    it.each([
        null, {}, [], [null], [true], fixture({ id: '' }), fixture({ id: 3 }), fixture({ name: ' ' }),
        fixture({ items: [] }), fixture({ items: null }), fixture({ items: [null] }),
        fixture({ items: [{ id: 'i', name: '' }] }), fixture({ items: [{ id: [], name: 'Skin' }] }),
        [...fixture(), ...fixture()], fixture({ type: {} }), fixture({ type: [] }), fixture({ type: 1 }),
        fixture({ items: [{ id: 'i', name: 'Skin', rarity: {} }] }), fixture({ items: [{ id: 'i', name: 'Skin', rarity: [] }] }),
        fixture({ items: [{ id: 'i', name: 'Skin', rarity: '__proto__' }] }),
        fixture({ openPriceGc: 1e308 }), fixture({ items: [{ id: 'i', name: 'Skin', valueGc: 1e308 }] }),
    ].map(data => ({ data })))('rejects an unusable roster without publishing partial cases: %j', async ({ data }) => {
        fetch.mockResolvedValueOnce(response(data))
        const visit = mount(); await settle(visit)
        expect(visit.value.status).toBe('error')
        expect(visit.value.cases).toBeNull()
        expect(visit.value.error).toBeTruthy()
    })

    it('contains an exception from the actual normalizer', async () => {
        const data = fixture()
        Object.defineProperty(data[0], 'openPriceGc', { get() { throw new Error('unreadable price') } })
        fetch.mockResolvedValueOnce(response(data))
        const visit = mount(); await settle(visit)
        expect(visit.value.status).toBe('error')
        expect(visit.value.cases).toBeNull()
    })

    it.each([undefined, null, false, true, 0, 7, '', 'Unmapped rarity'])('retains optional rarity fallback %j and missing prices/images', async rarity => {
        const data = fixture({ type: null, items: [{ id: 'i', name: 'Skin', rarity }] })
        fetch.mockResolvedValueOnce(response(data))
        const visit = mount(); await settle(visit)
        expect(visit.value.status).toBe('ready')
        expect(visit.value.cases).toEqual(data.map(value => normalizeCaseForRuntime(value)))
        expect(rarityDropWeight(visit.value.cases[0].items[0])).toBe(12)
    })

    it('preserves all 60 cases and 987 items through the unchanged normalizer', async () => {
        fetch.mockResolvedValueOnce(response(realCatalog))
        const visit = mount(); await settle(visit)
        expect(visit.value.status).toBe('ready')
        expect(visit.value.cases).toEqual(realCatalog.map(value => normalizeCaseForRuntime(value)))
        expect(visit.value.cases).toHaveLength(60)
        expect(visit.value.cases.flatMap(value => value.items)).toHaveLength(987)
    })

    it.each(['resolve', 'reject'])('suppresses stale %s/finally during pending and ready replacements', async outcome => {
        for (const replacementReady of [false, true]) {
            const oldJson = deferred(), nextJson = deferred()
            fetch.mockResolvedValueOnce({ ok: true, json: () => oldJson.promise })
            fetch.mockResolvedValueOnce({ ok: true, json: () => nextJson.promise })
            const visit = mount(); await settle(visit)
            visit.replay(); await settle(visit)
            const requestCount = fetch.mock.calls.length
            if (replacementReady) { nextJson.resolve(fixture({ id: 'new' })); await settle(visit) }
            const writes = visit.writes
            if (outcome === 'resolve') oldJson.resolve(fixture({ id: 'old' }))
            else oldJson.reject(new Error('obsolete JSON'))
            await settle(visit)
            expect(visit.writes).toBe(writes)
            if (!replacementReady) {
                visit.value.retry(); visit.value.retry()
                expect(fetch).toHaveBeenCalledTimes(requestCount)
                expect(visit.value.status).toBe('loading')
                nextJson.resolve(fixture({ id: 'new' })); await settle(visit)
            }
            expect(visit.value.status).toBe('ready')
            expect(visit.value.cases[0].id).toBe('new')
            visit.cleanup()
        }
    })

    it.each(['resolve', 'reject'])('does not publish unmounted %s into a separate re-entry', async outcome => {
        const old = deferred()
        fetch.mockReturnValueOnce(old.promise)
        const first = mount(); first.cleanup()
        fetch.mockResolvedValueOnce(response(fixture({ id: 'new-visit' })))
        const second = mount(); await settle(second)
        const writes = first.writes
        if (outcome === 'resolve') old.resolve(response(fixture({ id: 'old-visit' })))
        else old.reject(new Error('old visit'))
        await settle(second)
        expect(first.writes).toBe(writes)
        first.value.retry()
        expect(fetch).toHaveBeenCalledTimes(2)
        expect(second.value.cases[0].id).toBe('new-visit')
    })
})

describe('Actual Cases controls and visible preparation slot', () => {
    it('renders a local live error while the independent preloader remains pending, with stable pending Retry', async () => {
        h.preloader.ready = false
        fetch.mockRejectedValueOnce(new Error('private exception text'))
        const visit = mount(CasesGame)
        expect(text(frame(visit).props.loadingNode)).toContain('Loading cases…')
        await settle(visit)
        const errorSlot = frame(visit).props.loadingNode
        expect(frame(visit).props.loading).toBe(true)
        expect(errorSlot.props).toMatchObject({ role: 'status', 'aria-live': 'polite' })
        expect(errorSlot.props['aria-busy']).not.toBe(true)
        expect(text(errorSlot)).toContain('Cases are unavailable. Try again.')
        expect(text(errorSlot)).not.toContain('private exception text')
        const pending = deferred(); fetch.mockReturnValueOnce(pending.promise)
        const firstRetry = retry(visit)
        firstRetry.props.onClick(); firstRetry.props.onClick(); visit.render()
        const pendingSlot = frame(visit).props.loadingNode
        expect(pendingSlot.type).toBe(errorSlot.type)
        expect(pendingSlot.props).toMatchObject({ role: 'status', 'aria-live': 'polite', 'aria-busy': true })
        expect(text(pendingSlot)).toContain('Loading cases…')
        expect(retry(visit).type).toBe(firstRetry.type)
        expect(retry(visit).props.disabled).toBe(true)
        expect(fetch).toHaveBeenCalledTimes(2)
        expectInert()
    })

    it.each(['pending', 'error', 'preloader'])('rejects actual desktop/mobile/native/Auto/hold handlers while %s without latent play', async state => {
        const request = deferred()
        h.preloader.ready = state !== 'preloader'
        fetch.mockReturnValueOnce(request.promise)
        const visit = mount(CasesGame)
        if (state === 'error') { request.reject(new Error('offline')); await settle(visit) }
        if (state === 'preloader') { request.resolve(response(fixture())); await settle(visit) }
        attemptActions(visit)
        vi.advanceTimersByTime(2000); visit.render()
        expectInert()
        if (state === 'error') {
            fetch.mockResolvedValueOnce(response(fixture()))
            retry(visit).props.onClick(); visit.render()
            attemptActions(visit)
            vi.advanceTimersByTime(2000); visit.render()
            expectInert()
            await settle(visit)
        } else if (state === 'pending') {
            request.resolve(response(fixture())); await settle(visit)
        }
        h.preloader.ready = true; visit.render()
        vi.advanceTimersByTime(2000); visit.render()
        expectInert()
        expect(auto(visit).props.disabled).toBe(false)
        expect(h.env.catalog.load).not.toHaveBeenCalled()
        expect(h.env.setSearchParams).not.toHaveBeenCalled()
        find(visit, node => node.type === 'button' && node.props.children === 'Inventory').props.onClick()
        visit.render()
        expect(h.env.catalog.load).toHaveBeenCalledTimes(1)
    })

    it.each([false, true])('a deliberate ready %s Open reaches real round creation and the stake boundary', async useMobile => {
        fetch.mockResolvedValueOnce(response(fixture()))
        const visit = mount(CasesGame); await settle(visit)
        const control = useMobile ? mobile(visit) : desktop(visit)
        expect(control.props.disabled).toBe(false)
        control.props.onClick()
        expect(h.env.credits.placeBet).toHaveBeenCalledTimes(1)
        expect(h.env.creation).toHaveBeenCalledTimes(1)
        expect(h.env.roll).toHaveBeenCalled()
        expect(h.env.machine.start).toHaveBeenCalledTimes(1)
        expect(vi.getTimerCount()).toBeGreaterThan(0)
        expect(h.env.session.record).not.toHaveBeenCalled()
        expect(h.env.collection.recordDrop).not.toHaveBeenCalled()
    })

    it.each(['desktop', 'mobile'])('observes real %s hold scheduling and release/leave/touch cancellation', async surface => {
        fetch.mockResolvedValueOnce(response(fixture()))
        const visit = mount(CasesGame); await settle(visit)
        const control = surface === 'desktop' ? desktop : mobile
        for (const [down, up] of [['onMouseDown', 'onMouseUp'], ['onMouseDown', 'onMouseLeave'], ['onTouchStart', 'onTouchEnd']]) {
            control(visit).props[down](); visit.render()
            expect(visit.value.props.aside.props.isHolding).toBe(true)
            expect(vi.getTimerCount()).toBe(1)
            control(visit).props[up](); visit.render()
            expect(visit.value.props.aside.props.isHolding).toBe(false)
            expect(vi.getTimerCount()).toBe(0)
        }
        control(visit).props.onTouchStart(); visit.render()
        vi.advanceTimersByTime(500); visit.render()
        expect(visit.value.props.aside.props.autoOpen).toBe(true)
        expect(vi.getTimerCount()).toBeGreaterThan(0)
        expectInert()
        find(visit, node => node.props['data-case-action'] === 'auto-stop').props.onClick(); visit.render()
        expect(vi.getTimerCount()).toBe(0)
        expectInert()
    })

    it('preserves deliberate ready Start auto scheduling', async () => {
        fetch.mockResolvedValueOnce(response(fixture()))
        const visit = mount(CasesGame); await settle(visit)
        auto(visit).props.onClick(); visit.render()
        expect(visit.value.props.aside.props.autoOpen).toBe(true)
        expect(vi.getTimerCount()).toBe(1)
        expectInert()
        vi.advanceTimersByTime(760); visit.render()
        expect(h.env.credits.placeBet).toHaveBeenCalledTimes(1)
        expect(h.env.machine.start).toHaveBeenCalledTimes(1)
    })

    it('preserves requested/default/invalid selection and later query updates without load-time URL writes', async () => {
        const normalized = realCatalog.map(value => normalizeCaseForRuntime(value))
        const popular = filterCasesByCategory(normalized, 'popular')[0]
        for (const requested of [null, 'crate-4668', 'not-a-case']) {
            h.params = new URLSearchParams(requested ? { caseId: requested } : {})
            fetch.mockRejectedValueOnce(new Error('offline'))
            const visit = mount(CasesGame); await settle(visit)
            fetch.mockResolvedValueOnce(response(realCatalog))
            retry(visit).props.onClick(); await settle(visit)
            const panel = visit.value.props.aside
            expect(panel.props.allCases).toEqual(normalized)
            expect(panel.props.activeCase.id).toBe(requested === 'crate-4668' ? requested : popular.id)
            h.params = new URLSearchParams({ caseId: normalized[1].id }); visit.render()
            expect(visit.value.props.aside.props.activeCase.id).toBe(normalized[1].id)
            expect(h.env.setSearchParams).not.toHaveBeenCalled()
            expect(h.env.catalog.load).not.toHaveBeenCalled()
            visit.cleanup()
        }
    })

    it('keeps hostile-looking names as literal React text', async () => {
        const name = '<img src=x onerror=alert(1)>'
        fetch.mockResolvedValueOnce(response(fixture({ name })))
        const visit = mount(CasesGame); await settle(visit)
        expect(nodes(visit).some(node => node.type === 'strong' && node.props.children === name)).toBe(true)
        expect(nodes(visit).some(node => node.props.dangerouslySetInnerHTML)).toBe(false)
    })
})
