// Collections catalog page. Browses every CS:GO case + skin in the
// curated dataset, with tier filter and name search. Shared dataset
// powers /cases too.

import { useEffect, useMemo, useState } from 'react'
import './CollectionsPage.css'

const TIER_LABEL = { low: 'Low', mid: 'Mid', high: 'High' }

export default function CollectionsPage() {
    const [data, setData] = useState(null)
    const [tier, setTier] = useState('all')
    const [query, setQuery] = useState('')

    useEffect(() => {
        let cancelled = false
        fetch('/data/cs-cases.json').then(r => r.json()).then(d => {
            if (!cancelled) setData(d)
        }).catch(err => {
            // eslint-disable-next-line no-console
            console.warn('[collections] manifest load failed', err)
        })
        return () => { cancelled = true }
    }, [])

    const filtered = useMemo(() => {
        if (!data) return []
        const q = query.trim().toLowerCase()
        return data.filter(c => {
            if (tier !== 'all' && c.tier !== tier) return false
            if (!q) return true
            if (c.name.toLowerCase().includes(q)) return true
            return c.items.some(it => it.name.toLowerCase().includes(q))
        })
    }, [data, tier, query])

    return (
        <div className="collections-page">
            <div className="collections-head">
                <div>
                    <h1>CS Skin Collections</h1>
                    <p>
                        Curated case + skin catalog used by the Cases simulator.
                        Source data and skin imagery are from the public ByMykel/CSGO-API dataset (CC0).
                        No real items, trades, or markets — practice credits only.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                        className="collections-search"
                        placeholder="Search case or skin name..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                    <div className="collections-tier-filter">
                        {['all', 'low', 'mid', 'high'].map(t => (
                            <button key={t} className={tier === t ? 'active' : ''} onClick={() => setTier(t)}>
                                {t === 'all' ? 'All' : TIER_LABEL[t]}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            {!data && <p style={{ color: 'var(--text-secondary)' }}>Loading collections...</p>}
            {data && filtered.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No matches.</p>}
            <div className="collections-list">
                {filtered.map(c => (
                    <div key={c.id} className="collection-card">
                        <div className="collection-card-head">
                            <img src={c.image} alt={c.name} loading="lazy" />
                            <div>
                                <h3>{c.name}</h3>
                                <small>{c.items.length} skins</small>
                            </div>
                            <span className={`collection-tier-pill ${c.tier}`}>{TIER_LABEL[c.tier] || c.tier}</span>
                        </div>
                        <div className="collection-grid">
                            {c.items.map(it => (
                                <div key={it.id} className="collection-skin" style={{ '--rarity-color': it.color }}>
                                    <img src={it.image} alt={it.name} loading="lazy" />
                                    <small title={it.name}>{it.name}</small>
                                    <div className="rarity-line">
                                        <span>{it.rarity}</span>
                                        <span>×{(it.multiplier || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
