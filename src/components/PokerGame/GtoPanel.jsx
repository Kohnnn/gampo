// Real-time GTO chart panel for Live Poker.
// Subscribes to the engine state and renders a 13x13 hand grid with action
// frequencies (raise/call/fold) per cell, sizing distribution, range breakdown,
// nut/range advantages, MDF, and a simple exploit toggle.
//
// QA v4 upgrade: hand search, suggested-action callout pulled from the hero
// cell, frequency progress bars in the breakdown, and a live legend.

import { useEffect, useMemo, useState } from 'react'
import { allHandCodes, codeAt, gridCellFor } from '../../poker/util/handCanonicalize'
import { fetchPayload } from '../../poker/gto/lookup'

const RANK_HEADERS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
const EXPLOITS = [
    { key: null, label: 'GTO' },
    { key: 'overfold', label: 'vs Overfolder' },
    { key: 'station', label: 'vs Station' },
    { key: 'maniac', label: 'vs Maniac' },
]

function pickAction(cell) {
    const r = cell?.raise || 0
    const c = cell?.call || 0
    const f = cell?.fold || 0
    const max = Math.max(r, c, f)
    if (max === 0) return { label: 'Mixed', tone: 'mix' }
    if (r === max) return { label: 'Raise', tone: 'raise' }
    if (c === max) return { label: 'Call', tone: 'call' }
    return { label: 'Fold', tone: 'fold' }
}

export default function GtoPanel({ state }) {
    const [payload, setPayload] = useState(null)
    const [loading, setLoading] = useState(true)
    const [exploit, setExploit] = useState(null)
    const [search, setSearch] = useState('')

    useEffect(() => {
        if (!state) { setPayload(null); setLoading(false); return }
        let active = true
        setLoading(true)
        fetchPayload(state, exploit).then(p => {
            if (!active) return
            setPayload(p)
            setLoading(false)
        })
        return () => { active = false }
    }, [state, state?.street, state?.toAct, state?.community?.length, exploit])

    if (!state) return <div className="gto-panel"><p className="gto-empty">Sit at the table to see GTO charts.</p></div>
    if (loading && !payload) return <div className="gto-panel"><p className="gto-empty">Loading charts…</p></div>
    if (!payload) return <div className="gto-panel"><p className="gto-empty">Unable to load chart data.</p></div>

    const heroCell = payload.heroHand && payload.grid?.cells?.[payload.heroHand]
    const suggestion = heroCell ? pickAction(heroCell) : null
    const filterCode = search.trim().toUpperCase()
    const liveMetrics = metricsForState(state, payload)
    const heroInsights = heroCell ? insightForHero(heroCell, state, payload, liveMetrics) : null
    const heroMix = heroCell ? [
        { key: 'raise', label: 'Raise', value: heroCell.raise || 0 },
        { key: 'call', label: 'Call', value: heroCell.call || 0 },
        { key: 'fold', label: 'Fold', value: heroCell.fold || 0 },
    ] : []

    return (
        <div className="gto-panel">
            <div className="gto-context">
                <div className="gto-ctx-line">
                    <span className="gto-pill">{payload.heroRole}</span>
                    <span className="gto-pill alt">{payload.mode === 'preflop' ? 'Preflop' : (payload.mode === 'postflop' ? `Postflop · ${payload.textureKey || 'default'}` : 'Live')}</span>
                    {payload.actionLabel && <span className="gto-pill ctx">{payload.actionLabel}</span>}
                    {payload.heroHand && <span className="gto-pill mono">Your hand: {payload.heroHand}</span>}
                </div>
                <div className="gto-ctx-line muted">{payload.note}</div>
                {suggestion && heroCell && (
                    <div className={`gto-suggestion tone-${suggestion.tone}`}>
                        <div className="gto-decision-head">
                            <span className="gto-suggestion-label">Primary decision</span>
                            <strong>{suggestion.label}</strong>
                        </div>
                        <small>{explainSuggestion(suggestion, liveMetrics)}</small>
                        <div className="gto-mini-bars" aria-label={`Mix raise ${(heroCell.raise * 100).toFixed(0)} call ${(heroCell.call * 100).toFixed(0)} fold ${(heroCell.fold * 100).toFixed(0)}`}>
                            <span className="bar raise" style={{ width: `${heroCell.raise * 100}%` }} />
                            <span className="bar call"  style={{ width: `${heroCell.call * 100}%` }} />
                            <span className="bar fold"  style={{ width: `${heroCell.fold * 100}%` }} />
                        </div>
                        <div className="gto-mix-list">
                            {heroMix.map(item => <span key={item.key} className={item.key}>{item.label} <b>{(item.value * 100).toFixed(0)}%</b></span>)}
                        </div>
                        {heroInsights && (
                            <div className="gto-insight-grid">
                                <div><span>Equity proxy</span><strong>{heroInsights.equity}</strong></div>
                                <div><span>Best EV</span><strong>{heroInsights.bestEv}</strong></div>
                                <div><span>Class</span><strong>{heroInsights.handClass}</strong></div>
                            </div>
                        )}
                    </div>
                )}
                {payload.mode === 'postflop' && (
                    <div className="gto-ctx-row">
                        <span>Range adv {fmtSigned(payload.advantages?.range)}</span>
                        <span>Nut adv {fmtSigned(payload.advantages?.nut)}</span>
                        {payload.mdf != null && <span>MDF {(payload.mdf * 100).toFixed(0)}%</span>}
                    </div>
                )}
                <div className="gto-metric-grid">
                    <div><span>Pot odds</span><strong>{liveMetrics.potOdds}</strong></div>
                    <div><span>SPR</span><strong>{liveMetrics.spr}</strong></div>
                    <div><span>Range raise</span><strong>{liveMetrics.rangeRaise}</strong></div>
                    <div><span>Continue</span><strong>{liveMetrics.continueFreq}</strong></div>
                </div>
                {heroInsights && (
                    <div className="gto-ev-deltas">
                        {heroInsights.evDeltas.map(item => (
                            <span key={item.key} className={item.key}>{item.label} <b>{item.value}</b></span>
                        ))}
                    </div>
                )}
                <div className="gto-search-row">
                    <input
                        type="text"
                        className="gto-search-input"
                        placeholder="Find hand (e.g. AKs, 88, Q9o)"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <div className="gto-legend" aria-hidden="true">
                        <span><i className="dot raise" /> Raise</span>
                        <span><i className="dot call" /> Call</span>
                        <span><i className="dot fold" /> Fold</span>
                    </div>
                </div>
            </div>

            {payload.grid && <Grid grid={payload.grid} heroHand={payload.heroHand} filterCode={filterCode} />}

            {payload.sizings?.length > 0 && (
                <div className="gto-sizings">
                    <h4>Sizings</h4>
                    <ul>
                        {payload.sizings.map((s, i) => (
                            <li key={i}>
                                <span>{s.size}</span>
                                <strong>{(s.freq * 100).toFixed(0)}%</strong>
                                <span className="gto-sizing-bar" style={{ width: `${s.freq * 100}%` }} />
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="gto-breakdown">
                <Breakdown title="Value" items={payload.breakdown?.value} tone="value" />
                <Breakdown title="Bluff" items={payload.breakdown?.bluff} tone="bluff" />
                <Breakdown title="Marginal" items={payload.breakdown?.marginal} tone="marginal" />
            </div>

            <div className="gto-exploit">
                <h4>Exploit</h4>
                <div className="gto-exploit-row">
                    {EXPLOITS.map(e => (
                        <button key={e.label} className={exploit === e.key ? 'active' : ''} onClick={() => setExploit(e.key)}>{e.label}</button>
                    ))}
                </div>
                {payload.exploit && (
                    <div className="gto-exploit-result">
                        <p className="gto-exploit-note">
                            <strong>{payload.exploit.label}</strong>: {payload.exploit.delta}
                        </p>
                        {payload.exploit.evDelta && (
                            <div className="gto-ev-row">
                                <div className="gto-ev-cell">
                                    <span>GTO EV</span>
                                    <strong>{payload.exploit.evDelta.gto.toFixed(2)} {payload.exploit.evDelta.unit}</strong>
                                </div>
                                <div className="gto-ev-cell exploit">
                                    <span>Exploit EV</span>
                                    <strong>{payload.exploit.evDelta.exploit.toFixed(2)} {payload.exploit.evDelta.unit}</strong>
                                </div>
                                <div className="gto-ev-cell delta">
                                    <span>Δ</span>
                                    <strong>{(payload.exploit.evDelta.exploit - payload.exploit.evDelta.gto).toFixed(2)}</strong>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

function fmtSigned(v) {
    if (v == null) return ''
    const n = Number(v) || 0
    return `${n > 0 ? '+' : ''}${n}%`
}

function metricsForState(state, payload) {
    const hero = state.players.find(p => p.isHuman)
    const facing = state.currentBet && hero ? Math.max(0, state.currentBet - (hero.putIn || 0)) : 0
    const potOddsRaw = facing > 0 ? facing / (state.pot + facing) : 0
    const sprRaw = hero && state.pot > 0 ? hero.stack / state.pot : null
    const cells = Object.values(payload.grid?.cells || {})
    const avg = cells.reduce((acc, cell) => {
        acc.raise += cell.raise || 0
        acc.call += cell.call || 0
        acc.fold += cell.fold || 0
        return acc
    }, { raise: 0, call: 0, fold: 0 })
    const count = Math.max(1, cells.length)
    const raise = avg.raise / count
    const call = avg.call / count
    return {
        potOdds: facing > 0 ? `${(potOddsRaw * 100).toFixed(0)}%` : 'No bet',
        spr: sprRaw == null ? '—' : sprRaw.toFixed(1),
        rangeRaise: `${(raise * 100).toFixed(0)}%`,
        continueFreq: `${((raise + call) * 100).toFixed(0)}%`,
    }
}

function explainSuggestion(suggestion, metrics) {
    if (suggestion.tone === 'raise') return `Apply pressure. Range raises ${metrics.rangeRaise}.`
    if (suggestion.tone === 'call') return `Continue at price. Pot odds ${metrics.potOdds}.`
    if (suggestion.tone === 'fold') return `Low-frequency continue. Protect stack.`
    return `Mixed node. Randomize instead of autopiloting.`
}

function insightForHero(cell, state, payload, metrics) {
    const raise = cell.raise || 0
    const call = cell.call || 0
    const fold = cell.fold || 0
    const continueFreq = raise + call
    const potOdds = Number.parseInt(metrics.potOdds, 10)
    const equityRaw = Math.max(0.03, Math.min(0.97, 0.18 + raise * 0.46 + call * 0.28 - fold * 0.12 + (Number.isFinite(potOdds) ? potOdds / 500 : 0)))
    const pressure = state.currentBet > 0 ? Math.max(0, state.currentBet - ((state.players.find(p => p.isHuman)?.putIn) || 0)) : 0
    const pot = Math.max(1, state.pot || 1)
    const raiseEv = (raise * pot * 0.72) - (1 - raise) * pressure * 0.45
    const callEv = (call * pot * 0.5) - pressure * (0.28 + fold * 0.22)
    const foldEv = -Math.max(0, pressure * 0.12)
    const evs = [
        { key: 'raise', label: 'Raise EV', raw: raiseEv },
        { key: 'call', label: 'Call EV', raw: callEv },
        { key: 'fold', label: 'Fold EV', raw: foldEv },
    ].sort((a, b) => b.raw - a.raw)
    return {
        equity: `${(equityRaw * 100).toFixed(0)}%`,
        bestEv: `${evs[0].label.replace(' EV', '')} ${evs[0].raw >= 0 ? '+' : ''}${evs[0].raw.toFixed(1)}`,
        handClass: classifyHeroHand(cell, payload, continueFreq),
        evDeltas: evs.map(item => ({ ...item, value: `${item.raw >= 0 ? '+' : ''}${item.raw.toFixed(1)}` })),
    }
}

function classifyHeroHand(cell, payload, continueFreq) {
    if ((cell.raise || 0) >= 0.58) return 'Value / pressure'
    if ((cell.fold || 0) >= 0.62) return 'Low continue'
    if (continueFreq >= 0.72) return 'Continue'
    if (payload.mode === 'postflop' && payload.textureKey) return `Texture ${payload.textureKey}`
    return 'Mixed marginal'
}

function Grid({ grid, heroHand, filterCode }) {
    const codes = useMemo(() => allHandCodes(), [])
    return (
        <div className="gto-grid-wrap">
            <table className="gto-grid">
                <thead>
                    <tr>
                        <th></th>
                        {RANK_HEADERS.map(r => <th key={r}>{r}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {RANK_HEADERS.map((rowR, row) => (
                        <tr key={rowR}>
                            <th>{rowR}</th>
                            {RANK_HEADERS.map((colR, col) => {
                                const code = codeAt(row, col)
                                const cell = grid.cells?.[code] || { raise: 0, call: 0, fold: 1 }
                                const isHero = heroHand && heroHand === code
                                const dimmed = filterCode && !code.toUpperCase().startsWith(filterCode)
                                const tip = `${code} · raise ${(cell.raise * 100).toFixed(0)}% · call ${(cell.call * 100).toFixed(0)}% · fold ${(cell.fold * 100).toFixed(0)}%`
                                return (
                                    <td key={col} className={`gto-cell${isHero ? ' hero' : ''}${dimmed ? ' dim' : ''}`} title={tip}>
                                        <span className="gto-cell-fill" style={{
                                            background: cellGradient(cell),
                                        }} />
                                        <span className="gto-cell-label">{code}</span>
                                    </td>
                                )
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function cellGradient(cell) {
    const r = cell.raise * 100
    const c = cell.call * 100
    const f = 100 - r - c
    return `linear-gradient(90deg, #ed4245 ${r}%, #00b428 ${r}% ${r + c}%, rgba(255,255,255,0.06) ${r + c}% ${r + c + Math.max(0, f)}%)`
}

function Breakdown({ title, items, tone }) {
    if (!items || !items.length) return null
    return (
        <div className={`gto-bk gto-bk-${tone}`}>
            <h5>{title}</h5>
            <div className="gto-bk-items">
                {items.slice(0, 14).map(item => <span key={item} className="gto-bk-chip">{item}</span>)}
            </div>
        </div>
    )
}
