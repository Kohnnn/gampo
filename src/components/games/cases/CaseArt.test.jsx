import { afterEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ value: null }))
vi.mock('react', async () => ({ ...await vi.importActual('react'), useState: initial => [state.value ?? initial, value => { state.value = value }] }))
import CaseArt from './CaseArt'
afterEach(() => { state.value = null })
it.each(['Case Alpha', 'AK-47 | Redline'])('preserves identity and retries a changed source for %s', alt => {
    let tree = CaseArt({ src: '/bad.webp', alt })
    expect(tree.type).toBe('img')
    tree.props.onError()
    tree = CaseArt({ src: '/bad.webp', alt })
    expect(tree.type).toBe('span')
    expect(tree.props['aria-label']).toBe(`${alt} (artwork unavailable)`)
    expect(tree.props.children).toBe(alt[0])
    expect(CaseArt({ src: '/bad.webp', alt }).props).toEqual(tree.props)
    tree = CaseArt({ src: '/good.webp', alt })
    expect(tree.type).toBe('img')
    expect(tree.props.src).toBe('/good.webp')
})
it('names absent artwork without pretending it loaded', () => {
    expect(CaseArt({ alt: 'Missing case' }).props['aria-label']).toBe('Missing case (artwork unavailable)')
})
// QA037: an offscreen lazy image has NOT failed — it has not been requested yet.
// The wrapper must therefore leave the request contract alone until a real error
// event arrives, or every lazy tile would render a fallback before it scrolls in.
it('keeps the lazy request and caller identity intact until a real error', () => {
    const tree = CaseArt({ src: '/slow.webp', alt: 'AK-47 | Redline', className: 'reel-art', style: { color: 'red' }, draggable: 'false' })
    expect(tree.type).toBe('img')
    expect(tree.props.loading).toBe('lazy')
    expect(tree.props).toMatchObject({ src: '/slow.webp', alt: 'AK-47 | Redline', className: 'reel-art', draggable: 'false' })
    expect(tree.props.style).toEqual({ color: 'red' })
    expect(tree.props['data-case-art']).toBe('true')
})

// QA037: the fallback replaces the <img> inside a reel tile and a case card, so it
// must occupy the same box (caller className/style pass through) and stay inert —
// no handler that could swallow the enclosing button's open/select click.
it('keeps the caller box and stays inert when artwork fails', () => {
    state.value = null
    const img = CaseArt({ src: '/bad.webp', alt: 'P250 | Sand Dune', className: 'reel-art', style: { color: 'red' } })
    img.props.onError()
    const fallback = CaseArt({ src: '/bad.webp', alt: 'P250 | Sand Dune', className: 'reel-art', style: { color: 'red' } })
    expect(fallback.type).toBe('span')
    expect(fallback.props.className).toBe('cases-art-fallback reel-art')
    expect(fallback.props.style).toEqual({ color: 'red' })
    expect(fallback.props.children).toBe('P')
    for (const handler of ['onClick', 'onMouseDown', 'onTouchStart', 'onError']) {
        expect(fallback.props[handler], `${handler} must not exist on the fallback`).toBeUndefined()
    }
})
