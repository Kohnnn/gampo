// Bundle-hygiene guard. The lobby eagerly imports the game catalog data
// (gameDefinitions + casinoCatalog), so it lands in the first-load chunk.
// These source-size ceilings are a cheap, CI-safe proxy that catches a future
// edit accidentally bloating the eager path (e.g. inlining art/base64 or large
// tables) without needing a full build. Generous headroom over current sizes.

import { readFileSync, statSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

function kb(url) {
    return statSync(new URL(url, import.meta.url)).size / 1024
}

describe('eager catalog data stays lean', () => {
    it('gameDefinitions.js stays under 40KB source', () => {
        expect(kb('../data/gameDefinitions.js')).toBeLessThan(40)
    })

    it('casinoCatalog.js stays under 24KB source', () => {
        expect(kb('../data/casinoCatalog.js')).toBeLessThan(24)
    })

    it('does not inline large base64 blobs into eager catalog data', () => {
        const defs = readFileSync(new URL('../data/gameDefinitions.js', import.meta.url), 'utf8')
        expect(defs).not.toMatch(/data:image\/[a-z]+;base64,[A-Za-z0-9+/]{2000,}/)
    })
})
