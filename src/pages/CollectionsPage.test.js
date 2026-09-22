import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
    CATALOG_RESOURCE,
    CASES_RESOURCE,
    ERROR,
    IDLE,
    LOADING,
    RESOURCE_COPY,
    SUCCESS,
    fail,
    initialResources,
    invalidateAttempt,
    readJsonResponse,
    startAttempt,
    succeed,
} from './collectionsLoadState'

const ok = (body) => ({ ok: true, json: async () => body })
const notOk = () => ({ ok: false, json: async () => { throw new Error('must not parse a non-ok body') } })

describe('collections load state', () => {
    it('starts both resources idle so neither has fetched yet', () => {
        const state = initialResources()
        expect(state[CASES_RESOURCE].status).toBe(IDLE)
        expect(state[CATALOG_RESOURCE].status).toBe(IDLE)
        expect(state[CASES_RESOURCE].data).toBeNull()
        expect(state[CATALOG_RESOURCE].data).toBeNull()
    })

    it('takes cases from loading to success without touching the catalog', () => {
        let s = startAttempt(initialResources(), CASES_RESOURCE, 1)
        expect(s[CASES_RESOURCE].status).toBe(LOADING)
        expect(s[CASES_RESOURCE].attempt).toBe(1)
        expect(s[CATALOG_RESOURCE].status).toBe(IDLE)

        s = succeed(s, CASES_RESOURCE, 1, [{ id: 'c1' }])
        expect(s[CASES_RESOURCE].status).toBe(SUCCESS)
        expect(s[CASES_RESOURCE].data).toEqual([{ id: 'c1' }])
        expect(s[CATALOG_RESOURCE].status).toBe(IDLE)
    })

    it('keeps a successful empty result distinct from a failure', () => {
        let s = succeed(startAttempt(initialResources(), CASES_RESOURCE, 1), CASES_RESOURCE, 1, [])
        expect(s[CASES_RESOURCE].status).toBe(SUCCESS)
        expect(s[CASES_RESOURCE].data).toEqual([])
        expect(s[CASES_RESOURCE].error).toBeNull()

        const e = fail(startAttempt(initialResources(), CASES_RESOURCE, 1), CASES_RESOURCE, 1)
        expect(e[CASES_RESOURCE].status).toBe(ERROR)
        expect(e[CASES_RESOURCE].data).toBeNull()
        expect(e[CASES_RESOURCE].error).toBe('Couldn’t load cases.')
    })

    it('normalizes a non-ok response and a rejection to the same error', async () => {
        let fromNonOk = startAttempt(initialResources(), CASES_RESOURCE, 1)
        await expect(readJsonResponse(notOk())).rejects.toThrow()
        fromNonOk = fail(fromNonOk, CASES_RESOURCE, 1)

        let fromRejection = startAttempt(initialResources(), CASES_RESOURCE, 1)
        fromRejection = fail(fromRejection, CASES_RESOURCE, 1)

        expect(fromNonOk[CASES_RESOURCE].status).toBe(ERROR)
        expect(fromRejection[CASES_RESOURCE].status).toBe(ERROR)
        expect(fromNonOk[CASES_RESOURCE].error).toBe(fromRejection[CASES_RESOURCE].error)
    })

    it('reads json only for an ok response', async () => {
        await expect(readJsonResponse(ok({ a: 1 }))).resolves.toEqual({ a: 1 })
        await expect(readJsonResponse(notOk())).rejects.toThrow()
        await expect(readJsonResponse(null)).rejects.toThrow()
        await expect(readJsonResponse(undefined)).rejects.toThrow()
    })

    it('lets only the newest attempt publish, in both settle orders', () => {
        let s = startAttempt(initialResources(), CASES_RESOURCE, 1)
        s = startAttempt(s, CASES_RESOURCE, 2)
        expect(s[CASES_RESOURCE].attempt).toBe(2)

        // newest settles first, then the superseded attempt arrives late
        const newestFirst = succeed(s, CASES_RESOURCE, 2, ['new'])
        const afterStaleSuccess = succeed(newestFirst, CASES_RESOURCE, 1, ['stale'])
        expect(afterStaleSuccess[CASES_RESOURCE].data).toEqual(['new'])

        const afterStaleError = fail(newestFirst, CASES_RESOURCE, 1)
        expect(afterStaleError[CASES_RESOURCE].status).toBe(SUCCESS)
        expect(afterStaleError[CASES_RESOURCE].error).toBeNull()

        // oldest settles first; the stale result must not publish at all
        const oldestFirst = succeed(s, CASES_RESOURCE, 1, ['stale'])
        expect(oldestFirst[CASES_RESOURCE].status).toBe(LOADING)
        expect(oldestFirst[CASES_RESOURCE].data).toBeNull()
        const thenNewest = succeed(oldestFirst, CASES_RESOURCE, 2, ['new'])
        expect(thenNewest[CASES_RESOURCE].data).toEqual(['new'])
    })

    it('invalidates in-flight attempts on cleanup without changing visible state', () => {
        const s = succeed(startAttempt(initialResources(), CASES_RESOURCE, 1), CASES_RESOURCE, 1, ['kept'])
        const invalidated = invalidateAttempt(s, CASES_RESOURCE, 2)

        expect(invalidated[CASES_RESOURCE].status).toBe(SUCCESS)
        expect(invalidated[CASES_RESOURCE].data).toEqual(['kept'])

        // the stale completion can no longer publish
        const late = succeed(invalidated, CASES_RESOURCE, 1, ['stale'])
        expect(late[CASES_RESOURCE].data).toEqual(['kept'])
    })

    it('covers StrictMode replay: first pass invalidated, replayed attempt wins', () => {
        // StrictMode runs the effect twice; cleanup invalidates pass one.
        let s = startAttempt(initialResources(), CASES_RESOURCE, 1)
        s = invalidateAttempt(s, CASES_RESOURCE, 2)

        const replayed = startAttempt(s, CASES_RESOURCE, 3)
        expect(replayed[CASES_RESOURCE].attempt).toBe(3)

        const firstPassCompletes = succeed(replayed, CASES_RESOURCE, 1, ['first-pass'])
        expect(firstPassCompletes[CASES_RESOURCE].status).toBe(LOADING)

        const replayCompletes = succeed(firstPassCompletes, CASES_RESOURCE, 3, ['replay'])
        expect(replayCompletes[CASES_RESOURCE].data).toEqual(['replay'])
    })

    it('retries only the failed resource and recovers it, preserving its sibling', () => {
        let s = initialResources()
        s = succeed(startAttempt(s, CATALOG_RESOURCE, 1), CATALOG_RESOURCE, 1, ['item'])
        s = fail(startAttempt(s, CASES_RESOURCE, 1), CASES_RESOURCE, 1)
        expect(s[CASES_RESOURCE].status).toBe(ERROR)
        expect(s[CATALOG_RESOURCE].status).toBe(SUCCESS)

        s = startAttempt(s, CASES_RESOURCE, 2)
        expect(s[CASES_RESOURCE].status).toBe(LOADING)
        expect(s[CASES_RESOURCE].data).toBeNull()
        expect(s[CATALOG_RESOURCE].data).toEqual(['item'])

        s = succeed(s, CASES_RESOURCE, 2, ['case'])
        expect(s[CASES_RESOURCE].status).toBe(SUCCESS)
        expect(s[CATALOG_RESOURCE].data).toEqual(['item'])
    })

    it('freezes the exact user-facing copy for both resources', () => {
        expect(RESOURCE_COPY[CASES_RESOURCE]).toEqual({
            loading: 'Loading cases...',
            error: 'Couldn’t load cases.',
            retry: 'Retry cases',
        })
        expect(RESOURCE_COPY[CATALOG_RESOURCE]).toEqual({
            loading: 'Loading full item catalog...',
            error: 'Couldn’t load items.',
            retry: 'Retry items',
        })
    })
})
const source = readFileSync(new URL('./CollectionsPage.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./CollectionsPage.css', import.meta.url), 'utf8')

describe('CollectionsPage browse hub', () => {
    it('keeps one collections route with cases and items browse modes', () => {
        expect(source).toContain('data-collections-view={view}')
        expect(source).toContain("setView('cases')")
        expect(source).toContain("setView('items')")
        // The URLs are still pinned exactly, but they now flow through the
        // attempt-gated loader instead of inline `fetch(...).then(...)` calls.
        expect(source).toContain("load(CASES_RESOURCE, '/data/cs-cases.json')")
        expect(source).toContain("load(CATALOG_RESOURCE, '/data/cs-collection.json')")
        expect(source).toContain("resource === CASES_RESOURCE ? '/data/cs-cases.json' : '/data/cs-collection.json'")
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

    it('keeps no unguarded json parse and gates every commit by attempt', () => {
        // Regression: both effects used `fetch(url).then(r => r.json())`, which
        // parsed a non-OK body and surfaced failures only as a console warning.
        expect(source).not.toMatch(/\.then\(\s*r\s*=>\s*r\.json\(\)\s*\)/)
        expect(source).toMatch(/readJsonResponse\(response\)/)
        // The seam is the only place that reads a body, and it checks ok first.
        const seam = readFileSync(new URL('./collectionsLoadState.js', import.meta.url), 'utf8')
        expect(seam).toMatch(/if \(!response \|\| !response\.ok\) throw/)
        expect(seam).toMatch(/return response\.json\(\)/)
    })

    it('wires accessible error, loading and retry semantics for both resources', () => {
        expect(source).toContain('role="alert"')
        expect(source).toContain('role="status"')
        expect(source).toContain('aria-live="polite"')
        expect(source).toContain("aria-busy={casesState.status === LOADING ? 'true' : undefined}")
        expect(source).toContain('type="button"')
        expect(source).toContain('onClick={() => retry(CASES_RESOURCE)}')
        expect(source).toContain('onClick={() => retry(CATALOG_RESOURCE)}')
        // Exact frozen copy, referenced from the seam rather than retyped.
        expect(source).toContain('RESOURCE_COPY[CASES_RESOURCE].error')
        expect(source).toContain('RESOURCE_COPY[CATALOG_RESOURCE].error')
        expect(source).toContain('RESOURCE_COPY[CASES_RESOURCE].retry')
        expect(source).toContain('RESOURCE_COPY[CATALOG_RESOURCE].retry')
    })

    it('renders the error branch before the grid so stale content cannot persist', () => {
        const errorAt = source.indexOf('casesState.status === ERROR')
        const gridAt = source.indexOf('collections-case-grid')
        expect(errorAt).toBeGreaterThan(-1)
        expect(gridAt).toBeGreaterThan(-1)
        expect(errorAt).toBeLessThan(gridAt)
        // Each grid renders only on success, so a failed resource shows no cards.
        expect(source).toMatch(/casesState\.status === SUCCESS && \(\s*<div className="collections-case-grid">/)
        expect(source).toMatch(/catalogState\.status === SUCCESS && \(\s*<div className="collections-item-grid">/)
    })

    it('styles the retry affordance as a reachable native control', () => {
        expect(css).toMatch(/\.collections-error\s*\{[^}]*display:\s*flex/s)
        expect(css).toMatch(/\.collections-retry\s*\{[^}]*min-height:\s*40px/s)
        expect(css).toContain('.collections-retry:focus-visible')
    })
})
