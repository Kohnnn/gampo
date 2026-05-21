import { describe, expect, it } from 'vitest'
import { classify } from '../util/textureClassify'

describe('textureClassify', () => {
    it('detects rainbow A-high disconnected as high-rank rainbow', () => {
        const t = classify(['As', '7d', '2c'])
        expect(t.suit).toBe('rainbow')
        expect(t.rank).toBe('high')
        expect(t.paired).toBe(false)
    })
    it('detects two-tone middling connected', () => {
        const t = classify(['Th', '9h', '7d'])
        expect(t.suit).toBe('two-tone')
        expect(t.connected).toBe(true)
    })
    it('detects monotone', () => {
        const t = classify(['As', 'Ks', 'Qs'])
        expect(t.suit).toBe('mono')
    })
    it('detects paired board', () => {
        const t = classify(['Ks', 'Kh', '4d'])
        expect(t.paired).toBe(true)
    })
})
