import { afterEach, describe, expect, it, vi } from 'vitest'

function createElement() {
    const classes = new Set()
    let reflows = 0
    return {
        classList: {
            add: vi.fn((name) => classes.add(name)),
            remove: vi.fn((...names) => names.forEach((name) => classes.delete(name))),
            contains: (name) => classes.has(name),
        },
        get offsetWidth() {
            reflows += 1
            return 1
        },
        get reflows() {
            return reflows
        },
    }
}

function installBrowser({ appReduced = false, osReduced = false, matchMedia = true } = {}) {
    const timers = new Map()
    let nextTimer = 0
    const clearTimeout = vi.fn((id) => timers.delete(id))
    const setTimeout = vi.fn((callback, duration) => {
        const id = ++nextTimer
        timers.set(id, { callback, duration })
        return id
    })
    globalThis.document = {
        documentElement: {
            classList: { contains: vi.fn((name) => name === 'gampo-reduce-motion' && appReduced) },
        },
    }
    globalThis.window = {
        setTimeout,
        clearTimeout,
        ...(matchMedia ? { matchMedia: vi.fn((query) => ({ matches: query === '(prefers-reduced-motion: reduce)' && osReduced })) } : {}),
    }
    return { timers, setTimeout, clearTimeout }
}

async function loadTremor() {
    vi.resetModules()
    return import('./tremor')
}

afterEach(() => {
    vi.doUnmock('react')
    vi.resetModules()
    delete globalThis.document
    delete globalThis.window
})

describe('triggerTremor', () => {
    it('no-ops for missing refs, missing current, and SSR globals', async () => {
        const { triggerTremor } = await loadTremor()
        expect(() => triggerTremor()).not.toThrow()
        expect(() => triggerTremor({ current: null })).not.toThrow()
        expect(() => triggerTremor({ current: createElement() })).not.toThrow()
    })

    it('does no class, reflow, or timer work when app motion reduction is active', async () => {
        const browser = installBrowser({ appReduced: true })
        const el = createElement()
        const { triggerTremor } = await loadTremor()
        triggerTremor({ current: el })
        expect(el.classList.add).not.toHaveBeenCalled()
        expect(el.classList.remove).not.toHaveBeenCalled()
        expect(el.reflows).toBe(0)
        expect(browser.setTimeout).not.toHaveBeenCalled()
    })

    it('uses the exact OS motion query and does no work when it matches', async () => {
        const browser = installBrowser({ osReduced: true })
        const el = createElement()
        const { triggerTremor } = await loadTremor()
        triggerTremor({ current: el })
        expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
        expect(el.classList.add).not.toHaveBeenCalled()
        expect(el.reflows).toBe(0)
        expect(browser.setTimeout).not.toHaveBeenCalled()
    })

    it('is safe without matchMedia and preserves sm and lg classes with their durations', async () => {
        const browser = installBrowser({ matchMedia: false })
        const el = createElement()
        const { triggerTremor } = await loadTremor()
        triggerTremor({ current: el })
        expect(el.classList.contains('gampo-shake')).toBe(true)
        expect(browser.setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 400)
        triggerTremor({ current: el }, 'lg')
        expect(el.classList.contains('gampo-shake')).toBe(false)
        expect(el.classList.contains('gampo-shake-lg')).toBe(true)
        expect(browser.setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 700)
    })

    it('cleans both size classes and replaces the older timer before each new add', async () => {
        const browser = installBrowser()
        const el = createElement()
        const { triggerTremor } = await loadTremor()
        triggerTremor({ current: el })
        const firstTimer = browser.setTimeout.mock.results[0].value
        triggerTremor({ current: el }, 'lg')
        expect(browser.clearTimeout).toHaveBeenCalledWith(firstTimer)
        expect(el.classList.remove).toHaveBeenLastCalledWith('gampo-shake', 'gampo-shake-lg')
        expect(el.reflows).toBe(2)
    })

    it('removes both classes when the current timer expires', async () => {
        const browser = installBrowser()
        const el = createElement()
        const { triggerTremor } = await loadTremor()
        triggerTremor({ current: el }, 'lg')
        browser.setTimeout.mock.calls[0][0]()
        expect(el.classList.contains('gampo-shake')).toBe(false)
        expect(el.classList.contains('gampo-shake-lg')).toBe(false)
    })

    it('keeps the newer same-element owner when a cleared stale callback is invoked', async () => {
        const browser = installBrowser()
        const el = createElement()
        const ref = { current: el }
        const { triggerTremor } = await loadTremor()
        triggerTremor(ref)
        const stale = browser.setTimeout.mock.calls[0][0]
        triggerTremor(ref, 'lg')
        stale()
        expect(el.classList.contains('gampo-shake-lg')).toBe(true)
        expect(el.classList.contains('gampo-shake')).toBe(false)
    })

    it('does not let an older ref callback cancel a newer shared-element owner', async () => {
        const browser = installBrowser()
        const el = createElement()
        const older = { current: el }
        const newer = { current: el }
        const { triggerTremor } = await loadTremor()
        triggerTremor(older)
        const stale = browser.setTimeout.mock.calls[0][0]
        triggerTremor(newer, 'lg')
        stale()
        expect(el.classList.contains('gampo-shake-lg')).toBe(true)
        expect(browser.clearTimeout).toHaveBeenCalledTimes(1)
    })
})

describe('useTremor cleanup', () => {
    async function loadHook(ref) {
        let cleanup
        vi.resetModules()
        vi.doMock('react', () => ({
            useRef: () => ref,
            useEffect: (effect) => { cleanup = effect() },
        }))
        const tremor = await import('./tremor')
        tremor.useTremor()
        return { ...tremor, cleanup }
    }

    it('cleans the last triggered element after the ref becomes null or retargets', async () => {
        const browser = installBrowser()
        const first = createElement()
        const ref = { current: first }
        const { triggerTremor, cleanup } = await loadHook(ref)
        triggerTremor(ref)
        ref.current = null
        cleanup()
        expect(first.classList.contains('gampo-shake')).toBe(false)
        expect(browser.clearTimeout).toHaveBeenCalledTimes(1)

        const second = createElement()
        ref.current = first
        const reloaded = await loadHook(ref)
        reloaded.triggerTremor(ref, 'lg')
        ref.current = second
        reloaded.cleanup()
        expect(first.classList.contains('gampo-shake-lg')).toBe(false)
    })

    it('cannot let older hook cleanup remove or cancel a newer shared-element owner', async () => {
        const browser = installBrowser()
        const el = createElement()
        const olderRef = { current: el }
        const { triggerTremor, cleanup } = await loadHook(olderRef)
        triggerTremor(olderRef)
        const newerRef = { current: el }
        triggerTremor(newerRef, 'lg')
        cleanup()
        expect(el.classList.contains('gampo-shake-lg')).toBe(true)
        expect(browser.clearTimeout).toHaveBeenCalledTimes(1)
    })
})
