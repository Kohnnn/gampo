import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./CollectionsPage.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./CollectionsPage.css', import.meta.url), 'utf8')

describe('CollectionsPage browse hub', () => {
    it('keeps one collections route with cases and items browse modes', () => {
        expect(source).toContain('data-collections-view={view}')
        expect(source).toContain("setView('cases')")
        expect(source).toContain("setView('items')")
        expect(source).toContain("fetch('/data/cs-cases.json')")
        expect(source).toContain("fetch('/data/cs-collection.json')")
    })

    it('links case and item sources back into the cases simulator', () => {
        expect(source).toContain('/cases?caseId=')
        expect(source).toContain('Search containers and items')
        expect(source).toContain('Open in Cases')
    })

    it('defines dense responsive case and item grids', () => {
        expect(css).toContain('.collections-case-grid')
        expect(css).toContain('.collections-item-grid')
        expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.collections-case-grid,[\s\S]*\.collections-item-grid\s*\{[^}]*repeat\(2/s)
    })
})
