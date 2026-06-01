// Collections browse hub. Uses the same local CS case/catalog data as /cases
// and stays simulator-only: no real items, trades, or markets.

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
    caseExpectedValueGc,
    casePriceBand,
    caseRarePreview,
    caseVolatilityScore,
} from '../components/games/cases/caseEconomy'
import { formatCredits } from '../utils/simulationMath'
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
    const [cases, setCases] = useState(null)
    const [catalog, setCatalog] = useState(null)
    const [view, setView] = useState(searchParams.get('view') === 'items' ? 'items' : 'cases')
    const [query, setQuery] = useState(searchParams.get('q') || '')
    const [caseFilter, setCaseFilter] = useState('all')
    const [itemFilter, setItemFilter] = useState('all')
    const [caseSort, setCaseSort] = useState('popular')
    const [itemSort, setItemSort] = useState('value')
    const [selectedCaseId, setSelectedCaseId] = useState(null)
    const [selectedItemId, setSelectedItemId] = useState(null)

    useEffect(() => {
        let cancelled = false
        fetch('/data/cs-cases.json').then(r => r.json()).then(d => {
            if (!cancelled) setCases(d)
        }).catch(err => {
            // eslint-disable-next-line no-console
            console.warn('[collections] cases manifest load failed', err)
        })
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        if (view !== 'items' || catalog) return undefined
        let cancelled = false
        fetch('/data/cs-collection.json').then(r => r.json()).then(d => {
            if (!cancelled) setCatalog(d)
        }).catch(err => {
            // eslint-disable-next-line no-console
            console.warn('[collections] item catalog load failed', err)
        })
        return () => { cancelled = true }
    }, [catalog, view])

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
        <div className="collections-page" data-collections-view={view}>
            <header className="collections-hero">
                <div>
                    <span>CS2 simulator catalog</span>
                    <h1>Cases & Items Browse</h1>
                    <p>Search the local GamPo case manifest and item catalog. Practice credits only; no real items or market actions.</p>
                </div>
                <div className="collections-tabs" role="group" aria-label="Browse mode">
                    <button type="button" className={view === 'cases' ? 'active' : ''} onClick={() => setView('cases')}>Cases</button>
                    <button type="button" className={view === 'items' ? 'active' : ''} onClick={() => setView('items')}>Items</button>
                </div>
            </header>

            <section className="collections-searchbar" aria-label="Catalog search">
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

            <nav className="collections-category-rail" aria-label="Catalog categories">
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

            <div className="collections-browser">
                <main className="collections-results">
                    {view === 'cases' && (
                        <>
                            <div className="collections-count">{cases ? `${filteredCases.length} cases` : 'Loading cases...'}</div>
                            {!cases && <div className="collections-loading">Loading cases...</div>}
                            {cases && shownCases.length === 0 && <div className="collections-empty">No cases match that search.</div>}
                            <div className="collections-case-grid">
                                {shownCases.map(c => {
                                    const ev = caseExpectedValueGc(c)
                                    const volatility = caseVolatilityScore(c).label
                                    const best = caseRarePreview(c, 3)
                                    return (
                                        <article key={c.id} className={`collections-case-card ${selectedCase?.id === c.id ? 'active' : ''}`} onClick={() => setSelectedCaseId(c.id)}>
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
                                                <Link to={`/cases?caseId=${encodeURIComponent(c.id)}`}>Open</Link>
                                            </footer>
                                        </article>
                                    )
                                })}
                            </div>
                        </>
                    )}

                    {view === 'items' && (
                        <>
                            <div className="collections-count">{catalog ? `${filteredItems.length} items` : 'Loading items...'}</div>
                            {!catalog && <div className="collections-loading">Loading full item catalog...</div>}
                            {catalog && shownItems.length === 0 && <div className="collections-empty">No items match that search.</div>}
                            <div className="collections-item-grid">
                                {shownItems.map(item => {
                                    const range = itemRange(item, priceByName)
                                    return (
                                        <article key={item.id} className={`collections-item-card ${selectedItem?.id === item.id ? 'active' : ''}`} style={{ '--rarity': item.rarity?.color || '#ffd166' }} onClick={() => setSelectedItemId(item.id)}>
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
                        </>
                    )}
                </main>

                <aside className="collections-detail" aria-label="Selected catalog details">
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
                            <Link className="collections-open-link" to={`/cases?caseId=${encodeURIComponent(selectedCase.id)}`}>Open in Cases</Link>
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
