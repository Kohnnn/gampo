import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./Header.jsx', import.meta.url), 'utf8')

describe('Header search contract', () => {
    it('uses the shared game index and exposes result hooks', () => {
        expect(source).toContain('fullGameCatalog')
        expect(source).toContain('searchGames')
        expect(source).toContain('data-header-search')
        expect(source).toContain('data-header-search-results')
        expect(source).not.toContain('!isPlaySurface && (')
    })
})
