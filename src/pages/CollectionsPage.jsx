// Collections browse hub. Uses the same local CS case/catalog data as /cases
// and stays simulator-only: no real items, trades, or markets.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
    caseExpectedValueGc,
    casePriceBand,
    caseRarePreview,
    caseVolatilityScore,
} from '../components/games/cases/caseEconomy'
import { formatCredits } from '../utils/simulationMath'
import {
    CATALOG_RESOURCE,
    CASES_RESOURCE,
    ERROR,
    LOADING,
    RESOURCE_COPY,
    SUCCESS,
    fail,
    initialResources,
    invalidateAttempt,
    isVisibleResourceBusy,
    readJsonResponse,
    startAttempt,
    shouldStartCatalog,
    succeed,
} from './collectionsLoadState'
import './CollectionsPage.css'

const CASE_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'weapon', label: 'Cases' },
    { value: 'souvenir', label: 'Souvenirs' },
    { value: 'sticker', label: 'Stickers' },
    { value: 'high', label: 'High Value' },
]

const ITEM_FILTERS = [
    { value: 'all', label: 'All Items' },
    { value: 'Rifles', label: 'Rifles' },
    { value: 'Pistols', label: 'Pistols' },
    { value: 'SMGs', label: 'SMGs' },
    { value: 'Knives', label: 'Knives' },
    { value: 'Gloves', label: 'Gloves' },
]

function itemRange(item, priceByName) {
    const direct = priceByName.get(item.name)
    if (direct) return direct
    const base = Number(item.rarity?.multiplier) || 1
    const low = Math.max(0.1, base * 0.72)
    const high = Math.max(low, base * 1.65)
    return { low, high }
}

export default function CollectionsPage() {
    const [searchParams, setSearchParams] = useSearchParams()
    const [view, setView] = useState(searchParams.get('view') === 'items' ? 'items' : 'cases')
    const [query, setQuery] = useState(searchParams.get('q') || '')
    const [caseFilter, setCaseFilter] = useState('all')
    const [itemFilter, setItemFilter] = useState('all')
    const [caseSort, setCaseSort] = useState('popular')
    const [itemSort, setItemSort] = useState('value')
    const [selectedCaseId, setSelectedCaseId] = useState(null)
    const [selectedItemId, setSelectedItemId] = useState(null)

    // Each resource carries a monotonic attempt id; a response commits only
    // while its id is still current (see `collectionsLoadState`). Every
    // transition goes through the functional form of `setResources`, so each is
    // derived from the latest committed state. A mirrored ref would
    // desynchronise under batching and drop a legitimate retry commit.
    const [resources, setResources] = useState(initialResources)
    const casesState = resources[CASES_RESOURCE]
    const catalogState = resources[CATALOG_RESOURCE]


    // Single allocation point for attempt ids, shared by `load` and the
    // invalidation path. Kept as a ref so the id is known synchronously, before
    // the awaited fetch can resolve.
    const attemptIds = useRef({ [CASES_RESOURCE]: 0, [CATALOG_RESOURCE]: 0 })
    const nextAttemptId = useCallback((resource) => {
        attemptIds.current[resource] += 1
        return attemptIds.current[resource]
    }, [])

    const load = useCallback(async (resource, url) => {
        // The attempt id is derived from the same state the reducer owns, so the
        // id a response carries can never drift from the id stored on the
        // resource. A separate counter does drift: React StrictMode re-invokes
        // effects, so the counter advances without a matching invalidation and
        // every later commit is tagged stale and silently dropped (the observed
        // "stuck in loading, no cards, no error"). `nextAttemptId` is the single
        // allocation point, called synchronously before the await.
        const attempt = nextAttemptId(resource)
        setResources(prev => startAttempt(prev, resource, attempt))
        try {
            const response = await fetch(url)
            const data = await readJsonResponse(response)
            setResources(prev => succeed(prev, resource, attempt, data))
        } catch (err) {
            // Failure is surfaced in the UI, not only in the console.
            console.warn(`[collections] ${resource} load failed`, err)
            setResources(prev => fail(prev, resource, attempt))
        }
    }, [nextAttemptId])
    const retry = useCallback((resource) => {
        load(resource, resource === CASES_RESOURCE ? '/data/cs-cases.json' : '/data/cs-collection.json')
    }, [load])

    // Cases loads once on mount. Its teardown is unmount-only (see below), so a
    // re-render or a retry can never invalidate an attempt that is still live.
    useEffect(() => {
        load(CASES_RESOURCE, '/data/cs-cases.json')
    }, [load])

    // Catalog remains idle until Items is selected. The resource state is the
    // start guard: cleanup invalidation returns an in-flight attempt to idle,
    // allowing React StrictMode's effect replay to allocate a fresh current
    // attempt. Loading/success/error block duplicate loads on ordinary renders.
    useEffect(() => {
        if (!shouldStartCatalog(view, catalogState)) return
        load(CATALOG_RESOURCE, '/data/cs-collection.json')
    }, [catalogState, load, view])

    // Unmount-only invalidations. An empty dependency list means this teardown
    // runs exactly once, when the page is left.
    useEffect(() => () => {
        setResources(prev => invalidateAttempt(prev, CASES_RESOURCE, nextAttemptId(CASES_RESOURCE)))
    }, [nextAttemptId])
    useEffect(() => () => {
        setResources(prev => invalidateAttempt(prev, CATALOG_RESOURCE, nextAttemptId(CATALOG_RESOURCE)))
    }, [nextAttemptId])

    const cases = casesState.status === SUCCESS ? casesState.data : null
    const catalog = catalogState.status === SUCCESS ? catalogState.data : null


    useEffect(() => {
        const next = new URLSearchParams()
        next.set('view', view)
        if (query.trim()) next.set('q', query.trim())
        setSearchParams(next, { replace: true })
    }, [query, setSearchParams, view])

    const priceByName = useMemo(() => {
        const map = new Map()
        for (const c of cases || []) {
            for (const item of c.items || []) {
                const value = Number(item.valueGc || item.multiplier) || 0
                const prev = map.get(item.name)
                if (!prev) map.set(item.name, { low: value, high: value })
                else map.set(item.name, { low: Math.min(prev.low, value), high: Math.max(prev.high, value) })
            }
        }
        return map
    }, [cases])

    const filteredCases = useMemo(() => {
        const q = query.trim().toLowerCase()
        const list = (cases || []).filter(c => {
            if (caseFilter === 'high' && (Number(c.openPriceGc) || 0) < 8) return false
            if (caseFilter !== 'all' && caseFilter !== 'high' && c.category !== caseFilter && c.type?.toLowerCase() !== caseFilter) return false
            if (!q) return true
            return c.name.toLowerCase().includes(q) || (c.type || '').toLowerCase().includes(q) || c.items.some(item => item.name.toLowerCase().includes(q))
        })
        switch (caseSort) {
            case 'price-high': return [...list].sort((a, b) => (Number(b.openPriceGc) || 0) - (Number(a.openPriceGc) || 0))
            case 'price-low': return [...list].sort((a, b) => (Number(a.openPriceGc) || 0) - (Number(b.openPriceGc) || 0))
            case 'items': return [...list].sort((a, b) => (b.items?.length || 0) - (a.items?.length || 0))
            case 'ev': return [...list].sort((a, b) => caseExpectedValueGc(b) - caseExpectedValueGc(a))
            case 'popular':
            default: return list
        }
    }, [caseFilter, caseSort, cases, query])

    const itemList = useMemo(() => Object.values(catalog?.skins || {}), [catalog])
    const filteredItems = useMemo(() => {
        const q = query.trim().toLowerCase()
        const list = itemList.filter(item => {
            if (itemFilter !== 'all' && item.category !== itemFilter) return false
            if (!q) return true
            return item.name.toLowerCase().includes(q)
                || (item.weapon || '').toLowerCase().includes(q)
                || (item.pattern || '').toLowerCase().includes(q)
                || item.crates?.some(crate => crate.name.toLowerCase().includes(q))
        })
        switch (itemSort) {
            case 'name': return [...list].sort((a, b) => a.name.localeCompare(b.name))
            case 'rarity': return [...list].sort((a, b) => (b.rarity?.tier || 0) - (a.rarity?.tier || 0))
            case 'float': return [...list].sort((a, b) => (a.minFloat || 0) - (b.minFloat || 0))
            case 'value':
            default: return [...list].sort((a, b) => itemRange(b, priceByName).high - itemRange(a, priceByName).high)
        }
    }, [itemFilter, itemList, itemSort, priceByName, query])

    const selectedCase = (cases || []).find(c => c.id === selectedCaseId) || filteredCases[0] || null
    const selectedItem = itemList.find(item => item.id === selectedItemId) || filteredItems[0] || null
    const shownCases = filteredCases.slice(0, 60)
    const shownItems = filteredItems.slice(0, 72)

    return (
        <div className="collections-page" data-collections-view={view} data-ux-surface="stage">
            <header className="collections-hero" data-ux-surface="stage">
                <div>
                    <span>CS2 simulator catalog</span>
                    <h1>Cases & Items Browse</h1>
                    <p>Search the local GamPo case manifest and item catalog. Practice credits only; no real items or market actions.</p>
                </div>
                <div className="collections-tabs" role="group" aria-label="Browse mode" data-ux-surface="controls">
                    <button type="button" className={view === 'cases' ? 'active' : ''} onClick={() => setView('cases')}>Cases</button>
                    <button type="button" className={view === 'items' ? 'active' : ''} onClick={() => setView('items')}>Items</button>
                </div>
            </header>

            <section className="collections-searchbar" aria-label="Catalog search" data-ux-surface="controls">
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search containers and items..."
                    aria-label="Search containers and items"
                />
                <select value={view === 'cases' ? caseSort : itemSort} onChange={e => view === 'cases' ? setCaseSort(e.target.value) : setItemSort(e.target.value)} aria-label="Sort catalog">
                    {view === 'cases' ? (
                        <>
                            <option value="popular">Popular</option>
                            <option value="price-low">Price low</option>
                            <option value="price-high">Price high</option>
                            <option value="items">Item count</option>
                            <option value="ev">EV estimate</option>
                        </>
                    ) : (
                        <>
                            <option value="value">Value range</option>
                            <option value="rarity">Rarity</option>
                            <option value="float">Lowest float</option>
                            <option value="name">Name</option>
                        </>
                    )}
                </select>
            </section>

            <nav className="collections-category-rail" aria-label="Catalog categories" data-ux-surface="controls">
                {(view === 'cases' ? CASE_FILTERS : ITEM_FILTERS).map(option => (
                    <button
                        key={option.value}
                        type="button"
                        className={(view === 'cases' ? caseFilter : itemFilter) === option.value ? 'active' : ''}
                        onClick={() => view === 'cases' ? setCaseFilter(option.value) : setItemFilter(option.value)}
                    >
                        {option.label}
                    </button>
                ))}
            </nav>

            <div className="collections-browser" data-ux-surface="stage">
                <main
                    className="collections-results"
                    data-ux-surface="stage"
                    aria-busy={isVisibleResourceBusy(resources, view) ? 'true' : undefined}
                >
                    {view === 'cases' && (
                        <>
                            {casesState.status === ERROR && (
                                <div className="collections-error" role="alert">
                                    <p>{RESOURCE_COPY[CASES_RESOURCE].error}</p>
                                    <button
                                        type="button"
                                        className="collections-retry"
                                        onClick={() => retry(CASES_RESOURCE)}
                                    >
                                        {RESOURCE_COPY[CASES_RESOURCE].retry}
                                    </button>
                                </div>
                            )}
                            {casesState.status === LOADING && (
                                <div className="collections-loading" role="status" aria-live="polite">
                                    {RESOURCE_COPY[CASES_RESOURCE].loading}
                                </div>
                            )}
                            {casesState.status === SUCCESS && (
                                <>
                                    <div className="collections-count">{filteredCases.length} cases</div>
                                    {shownCases.length === 0 && <div className="collections-empty">No cases match that search.</div>}
                                </>
                            )}
                            {casesState.status === SUCCESS && (
                                <div className="collections-case-grid">
                                {shownCases.map(c => {
                                    const ev = caseExpectedValueGc(c)
                                    const volatility = caseVolatilityScore(c).label
                                    const best = caseRarePreview(c, 3)
                                    return (
                                        <article key={c.id} className={`collections-case-card ${selectedCase?.id === c.id ? 'active' : ''}`} onClick={() => setSelectedCaseId(c.id)} data-ux-surface="card">
                                            <strong>{formatCredits(c.openPriceGc || 0)}</strong>
                                            <img src={c.image} alt={c.name} loading="lazy" />
                                            <h2>{c.name}</h2>
                                            <p>{c.items?.length || 0} items · {casePriceBand(c.openPriceGc)} · {volatility}</p>
                                            <div className="collections-rare-row">
                                                {best.map(item => (
                                                    <span key={item.id} style={{ '--rarity': item.color }} title={item.name}>
                                                        <img src={item.image} alt="" loading="lazy" />
                                                    </span>
                                                ))}
                                            </div>
                                            <footer>
                                                <em>EV {formatCredits(ev)}</em>
                                                <Link to={`/cases?caseId=${encodeURIComponent(c.id)}`} data-ux-primary-action>Open</Link>
                                            </footer>
                                        </article>
                                    )
                                })}
                                </div>
                            )}
                        </>
                    )}
                    {view === 'items' && (
                        <>
                            {catalogState.status === ERROR && (
                                <div className="collections-error" role="alert">
                                    <p>{RESOURCE_COPY[CATALOG_RESOURCE].error}</p>
                                    <button
                                        type="button"
                                        className="collections-retry"
                                        onClick={() => retry(CATALOG_RESOURCE)}
                                    >
                                        {RESOURCE_COPY[CATALOG_RESOURCE].retry}
                                    </button>
                                </div>
                            )}
                            {catalogState.status === LOADING && (
                                <div className="collections-loading" role="status" aria-live="polite">
                                    {RESOURCE_COPY[CATALOG_RESOURCE].loading}
                                </div>
                            )}
                            {catalogState.status === SUCCESS && (
                                <>
                                    <div className="collections-count">{filteredItems.length} items</div>
                                    {shownItems.length === 0 && <div className="collections-empty">No items match that search.</div>}
                                </>
                            )}
                            {catalogState.status === SUCCESS && (
                                <div className="collections-item-grid">
                                {shownItems.map(item => {
                                    const range = itemRange(item, priceByName)
                                    return (
                                        <article key={item.id} className={`collections-item-card ${selectedItem?.id === item.id ? 'active' : ''}`} style={{ '--rarity': item.rarity?.color || '#ffd166' }} onClick={() => setSelectedItemId(item.id)} data-ux-surface="card">
                                            <strong>{formatCredits(range.low)} - {formatCredits(range.high)}</strong>
                                            <img src={item.image} alt={item.name} loading="lazy" />
                                            <h2>{item.name}</h2>
                                            <p>{item.category || 'Item'} · {item.rarity?.name || 'Unknown'}</p>
                                            <footer>
                                                <em>{item.minFloat?.toFixed?.(2) ?? '0.00'} - {item.maxFloat?.toFixed?.(2) ?? '1.00'}</em>
                                                <span>{item.crates?.length || 0} sources</span>
                                            </footer>
                                        </article>
                                    )
                                })}
                                </div>
                            )}
                        </>
                    )}
                </main>

                <aside className="collections-detail" aria-label="Selected catalog details" data-ux-surface="aside">
                    {view === 'cases' && selectedCase && (
                        <>
                            <img className="collections-detail-hero" src={selectedCase.image} alt="" loading="lazy" />
                            <span>{selectedCase.type || 'Case'}</span>
                            <h2>{selectedCase.name}</h2>
                            <div className="collections-detail-kpis">
                                <b><small>Open</small>{formatCredits(selectedCase.openPriceGc || 0)}</b>
                                <b><small>Items</small>{selectedCase.items?.length || 0}</b>
                                <b><small>EV</small>{formatCredits(caseExpectedValueGc(selectedCase))}</b>
                                <b><small>Volatility</small>{caseVolatilityScore(selectedCase).label.replace(' volatility', '')}</b>
                            </div>
                            <Link className="collections-open-link" to={`/cases?caseId=${encodeURIComponent(selectedCase.id)}`} data-ux-primary-action>Open in Cases</Link>
                            <div className="collections-drop-list">
                                {[...(selectedCase.items || [])]
                                    .sort((a, b) => (Number(b.valueGc || b.multiplier) || 0) - (Number(a.valueGc || a.multiplier) || 0))
                                    .slice(0, 12)
                                    .map(item => (
                                        <span key={item.id} style={{ '--rarity': item.color }}>
                                            <img src={item.image} alt="" loading="lazy" />
                                            <small>{item.name}</small>
                                            <strong>{formatCredits(item.valueGc || item.multiplier || 0)}</strong>
                                        </span>
                                    ))}
                            </div>
                        </>
                    )}
                    {view === 'items' && selectedItem && (
                        <>
                            <img className="collections-detail-hero item" src={selectedItem.image} alt="" loading="lazy" />
                            <span>{selectedItem.rarity?.name || 'Item'}</span>
                            <h2>{selectedItem.name}</h2>
                            <div className="collections-detail-kpis">
                                <b><small>Category</small>{selectedItem.category || 'Item'}</b>
                                <b><small>Float</small>{selectedItem.minFloat?.toFixed?.(2) ?? '0.00'}-{selectedItem.maxFloat?.toFixed?.(2) ?? '1.00'}</b>
                                <b><small>Sources</small>{selectedItem.crates?.length || 0}</b>
                                <b><small>Rarity</small>{selectedItem.rarity?.tier || '—'}</b>
                            </div>
                            <div className="collections-drop-list">
                                {(selectedItem.crates || []).slice(0, 10).map(crate => (
                                    <Link key={crate.id} to={`/cases?caseId=${encodeURIComponent(crate.id)}`}>
                                        <small>{crate.name}</small>
                                        <strong>Open</strong>
                                    </Link>
                                ))}
                            </div>
                        </>
                    )}
                </aside>
            </div>
        </div>
    )
}
