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
