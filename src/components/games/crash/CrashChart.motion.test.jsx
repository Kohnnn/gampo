import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Node-only runner: retain hooks, commit refs, and run dependency-aware effects.
const h = vi.hoisted(() => ({ hooks: [], cursor: 0, pending: [], dirty: false, settings: {}, unmount: null }))
vi.mock('react', async original => ({
    ...await original(),
    useRef(initial) {
        const i = h.cursor++
        return h.hooks[i] ||= { current: initial }
    },
    useState(initial) {
        const i = h.cursor++
        h.hooks[i] ||= { value: typeof initial === 'function' ? initial() : initial }
        return [h.hooks[i].value, next => {
            const value = typeof next === 'function' ? next(h.hooks[i].value) : next
            if (!Object.is(value, h.hooks[i].value)) { h.hooks[i].value = value; h.dirty = true }
        }]
    },
    useMemo: fn => fn(),
    useEffect(fn, deps) {
        const i = h.cursor++, old = h.hooks[i]
        if (!old || deps.some((v, n) => !Object.is(old.deps[n], v))) {
            h.pending.push(() => {
                old?.cleanup?.()
                h.hooks[i] = { deps }
                h.hooks[i].cleanup = fn()
            })
        }
    },
}))
vi.mock('../../../hooks/useSettings', () => ({ useSettings: () => h.settings }))
import CrashChart from './CrashChart'

function mount({ osReduced = false, hasMedia = true } = {}) {
    h.hooks = []; h.pending = []; h.settings = { reduceMotion: false, animations: true }
    const context = Object.fromEntries(['setTransform', 'clearRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'closePath', 'setLineDash', 'fillText'].map(name => [name, vi.fn()]))
    context.createLinearGradient = vi.fn(() => ({ addColorStop() {} }))
    const canvas = { width: 0, height: 0, getContext: () => context, getBoundingClientRect: () => ({ width: 400, height: 250 }) }
    const images = new Map(), rafs = new Map(), listeners = new Set()
    let nextRaf = 0, now = 0, observer, props = { phase: 'idle', multiplier: 1, elapsedTime: 0 }, tree
    const media = { matches: osReduced, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }
    const observe = vi.fn(), disconnect = vi.fn()
    vi.stubGlobal('window', { ...(hasMedia ? { matchMedia: () => media } : {}), devicePixelRatio: 1 })
    vi.stubGlobal('ResizeObserver', class { constructor(fn) { observer = fn } observe = observe; disconnect = disconnect })
    vi.stubGlobal('requestAnimationFrame', fn => { const id = ++nextRaf; rafs.set(id, fn); return id })
    vi.stubGlobal('cancelAnimationFrame', id => rafs.delete(id))
    vi.stubGlobal('performance', { now: () => now })
    let committedRefs = []
    const commit = node => {
        if (!React.isValidElement(node)) return
        if (node.ref) {
            const target = node.type === 'canvas' ? canvas : images.get(node.props.className) || { style: {} }
            if (node.type !== 'canvas') images.set(node.props.className, target)
            node.ref.current = target
            committedRefs.push(node.ref)
        }
        React.Children.forEach(node.props.children, commit)
    }
    const render = (changes = {}) => {
        props = { ...props, ...changes }
        let passes = 0
        do {
            if (++passes > 10) throw new Error('Unbounded chart rerender')
            h.dirty = false; h.cursor = 0; h.pending = []
            tree = CrashChart(props)
            committedRefs.forEach(ref => { ref.current = null }); committedRefs = []
            commit(tree)
            h.pending.splice(0).forEach(effect => effect())
        } while (h.dirty)
        return tree
    }
    const unmount = () => { h.hooks.forEach(hook => hook?.cleanup?.()); h.unmount = null }
    h.unmount = unmount
    return {
        render, canvas, context, rafs, observe, disconnect, listeners, images, unmount,
        mediaChange(matches) { media.matches = matches; listeners.forEach(fn => fn({ matches })); render() },
        resize(width, height) { observer([{ contentRect: { width, height } }]); if (h.dirty) render() },
        frame(ms) { now = ms; const callbacks = [...rafs.values()]; rafs.clear(); callbacks.forEach(fn => fn(ms)); if (h.dirty) render() },
        sprites() { return React.Children.toArray(tree.props.children).filter(node => React.isValidElement(node) && /crash-(exhaust|explosion)/.test(node.props.className)).map(node => node.props.className) },
    }
}
afterEach(() => { h.unmount?.(); vi.unstubAllGlobals() })

describe('Crash decorative motion lifecycle', () => {
    it.each([{ reduceMotion: true, animations: true }, { reduceMotion: false, animations: false }])('cancels and resumes idle work for %o', settings => {
        const chart = mount()
        chart.render(); expect(chart.rafs.size).toBe(1)
        chart.frame(1000)
        h.settings = settings; chart.render()
        expect(chart.rafs.size).toBe(0)
        expect(chart.sprites()).toEqual([])
        const paints = chart.context.clearRect.mock.calls.length
        chart.frame(2000)
        expect(chart.context.clearRect).toHaveBeenCalledTimes(paints)
        h.settings = { reduceMotion: false, animations: true }; chart.render()
        expect(chart.rafs.size).toBe(1)
        expect(chart.sprites()).toEqual(['crash-exhaust', 'crash-explosion'])
        chart.unmount()
        expect(chart.rafs.size).toBe(0)
        expect(chart.listeners.size).toBe(0)
        expect(chart.disconnect).toHaveBeenCalledTimes(1)
    })

    it('obeys initial and changing OS preference without an app override', () => {
        const chart = mount({ osReduced: true })
        chart.render()
        expect(chart.rafs.size).toBe(0)
        expect(chart.sprites()).toEqual([])
        chart.mediaChange(false); expect(chart.rafs.size).toBe(1)
        chart.mediaChange(true); expect(chart.rafs.size).toBe(0)
        expect(chart.sprites()).toEqual([])
    })

    it('redraws static and latest active axes on resize without recreating the observer', () => {
        const chart = mount({ hasMedia: false })
        h.settings.reduceMotion = true
        chart.render()
        chart.context.clearRect.mockClear(); chart.context.createLinearGradient.mockClear()
        chart.resize(500, 300)
        expect([chart.canvas.width, chart.canvas.height]).toEqual([500, 300])
        expect(chart.context.clearRect).toHaveBeenLastCalledWith(0, 0, 500, 300)
        expect(chart.context.createLinearGradient.mock.calls[0][2]).toBeGreaterThan(50)
        chart.render({ phase: 'running', multiplier: 2.5, elapsedTime: 3 })
        expect(chart.context.fillText).toHaveBeenCalledWith('3.3×', 44, 40)
        expect(chart.images.get('crash-rocket').style.display).toBe('block')
        chart.render({ phase: 'idle' })
        expect(chart.images.get('crash-rocket').style.display).toBe('none')
        chart.render({ phase: 'running', multiplier: 2.5, elapsedTime: 3 })
        chart.context.fillText.mockClear(); chart.resize(600, 350)
        expect(chart.context.clearRect).toHaveBeenLastCalledWith(0, 0, 600, 350)
        expect(chart.context.fillText).toHaveBeenCalledWith('3.3×', 44, 40)
        expect(chart.observe).toHaveBeenCalledTimes(1)
        expect(chart.rafs.size).toBe(0)
    })

    it('cancels an in-progress explosion and keeps the final chart on resize', () => {
        const chart = mount()
        chart.render({ phase: 'running', multiplier: 2, elapsedTime: 3 })
        chart.render({ phase: 'crashed' }); expect(chart.rafs.size).toBe(1)
        chart.frame(500)
        expect(Number(chart.images.get('crash-explosion').style.opacity)).toBeLessThan(1)
        h.settings.animations = false; chart.render()
        expect(chart.rafs.size).toBe(0)
        expect(chart.sprites()).toEqual([])
        chart.resize(500, 300)
        expect(chart.context.clearRect).toHaveBeenLastCalledWith(0, 0, 500, 300)
        expect(chart.context.fillText).toHaveBeenCalledWith('2.6×', 44, 40)
        chart.render({ phase: 'idle' })
        h.settings.animations = true; chart.render({ phase: 'crashed' })
        chart.frame(2500)
        expect(chart.rafs.size).toBe(0)
    })
})
