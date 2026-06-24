// CasesGame — Wave 31 rewrite.
//
// What changed:
//   - Loads the playable case roster from `/data/cs-cases.json` (60 cases).
//   - Loads the full collection catalog (~2,000 unique skins) on demand.
//   - Collection view replaces the old grid: searchable, rarity-filtered,
//     shows discovered/total per crate + a global completion bar. No selling.
//   - Multi-row simultaneous open: pick 1 / 3 / 5 / 10 rows; every row spins
//     independently with its own carousel, all settle within the 3.5s window.
//   - Each drop rolls a wear condition + StatTrak / souvenir flag from the
//     skin's wear range so float and StatTrak count as separate collection
//     variants.
//   - Case grid replaces the old tier-chip + thin row layout. Type/value
//     categories filter the grid; expanded peek panel shows the full contents.
//   - SFX: open / tick / land / rare / reveal / win / lose all wired through
//     the procedural 16-bit binaries from Wave 29.
//   - Animations preserved: 3.5s cubic-out reel, anchor scale, rare burst.
//
// Math note: opening N rows still uses one stake per row. Wear adjusts the
// multiplier slightly so a Factory New 4× becomes 4.4× and a Battle-Scarred
// 4× becomes 3.4× (cosmetic — keeps the math contract simple).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { useCaseCollection } from '../../../hooks/useCaseCollection'
import { useCsCollection } from '../../../hooks/useCsCollection'
import { recordCaseDrop as recordProgressCaseDrop } from '../../../hooks/useProgress'
import { useScrollActionIntoView } from '../../../hooks/useScrollActionIntoView'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { getBigWinThreshold,
    BigWinOverlay,
    GameShell,
    RecentResultsStrip,
    useGameSession,
    MultiplierBadge,
    ResultToast,
    ActionLockOverlay,
    CoreStageFrame,
    ROUND_EVENTS,
    useRoundMachine,
} from '../primitives'
import { useOriginalsPreloader } from '../../games/resources/useOriginalsPreloader'
import EducationPanel from '../../EducationPanel'
import { getProvablyFair, getRecentRolls, maskSeed, setClientSeed } from '../../../utils/fairRng'
import { haptic, cancelHaptics } from '../../../utils/haptics'
import { useSettings } from '../../../hooks/useSettings'
import {
    CASE_LID_LIFT_MS,
    CASE_LIGHT_SWEEP_LEAD_MS,
    CASE_PRIZE_INDEX,
    CASE_PRIZE_ZOOM_LEAD_MS,
    CASE_REVEAL_MS,
    CASE_SETTLE_PAD_MS,
    CASE_TILE_GAP_PX,
    CASE_TILE_PX,
    CASE_VISIBLE_PHASES,
    casePhaseLabel,
    claimCaseSettlement,
    getCaseReelMetrics,
    getCaseReelStartOffset,
    hasReachedCasePhase,
    pickCelebrationDrop,
    summarizeCaseSettlement,
} from './casesAnimation'
import { createCaseOpeningRound } from './caseOpening'
import {
    CASE_CATEGORIES,
    caseCategoryCounts,
    caseCategoryStats,
    caseDropOdds,
    casePriceBand,
    filterCasesByCategory,
    normalizeCaseForRuntime,
    rarityDropWeight,
    roundGc,
    roundSignedGc,
} from './caseEconomy'
import './cases.css'
import { useGameBgm } from '../../../audio/useBgm'
const ROW_OPTIONS = [1, 3, 5, 10]
const REEL_PREVIEW_ROWS = 5
const REEL_PREVIEW_TILES = 18
// C2: the reel travels this many px PAST its final resting offset, then eases
// back, so the landing reads as momentum rather than a hard stop.
const CASE_REEL_OVERSHOOT_PX = 46
const CASE_REEL_SETTLE_MS = 360
// C5: in a ×10 bulk open the rows settle in a staggered cascade (this many ms
// apart) rather than all at once, so the grid resolves like a wave and the
// best drop can finish with a finale pulse.
const CASE_MULTI_SETTLE_STAGGER_MS = 110
const RARE_TIERS = new Set(['Restricted', 'Classified', 'Covert', 'Remarkable', 'Exotic', 'Extraordinary', 'Contraband', '★'])
const RARITY_FILTERS = [
    { value: 'all', label: 'All', selectLabel: 'All rarities' },
    { value: 'Mil-Spec Grade', label: 'Mil-Spec', selectLabel: 'Mil-Spec' },
    { value: 'Restricted', label: 'Restricted', selectLabel: 'Restricted' },
    { value: 'Classified', label: 'Classified', selectLabel: 'Classified' },
    { value: 'Covert', label: 'Covert', selectLabel: 'Covert' },
    { value: 'Extraordinary', label: 'Extraordinary', selectLabel: 'Extraordinary' },
    { value: 'Contraband', label: 'Contraband', selectLabel: 'Contraband' },
]

function cubicOut(t) {
    return 1 - Math.pow(1 - t, 3)
}

function formatRelative(ts) {
    if (!ts) return ''
    const diff = Date.now() - ts
    if (diff < 60_000) return 'just now'
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m`
    if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h`
    return `${Math.round(diff / 86_400_000)}d`
}

export function CaseReelTile({
    item,
    rowIndex,
    tileIndex,
    targetReady,
    isPrize,
    compact = false,
}) {
    const isTarget = tileIndex === CASE_PRIZE_INDEX
    const displayName = `${item.statTrak ? 'ST™ ' : ''}${item.souvenir ? 'SV ' : ''}${item.name}`
    return (
        <div
            key={`${rowIndex}-${tileIndex}-${item.id}-${item.variantKey || 'base'}`}
            className={`cases-carousel-tile ${compact ? 'is-mini' : ''} ${targetReady ? 'is-target' : ''} ${isPrize ? 'is-prize' : ''}`}
            style={{ borderColor: item.color, '--rarity': item.color }}
            data-case-target={isTarget ? 'true' : undefined}
            data-case-outcome-id={item.skinId || item.id}
            data-case-outcome-variant={item.variantKey || ''}
        >
            <img src={item.image} alt={item.name} loading="lazy" />
            <small>{displayName}</small>
            {item.valueGc != null && (
                <em className="cases-carousel-value">{formatCredits(item.valueGc)}</em>
            )}
        </div>
    )
}

export function CaseMultiOpenGrid({
    activeCase,
    casePhase,
    results,
    trackOffsets,
    tracks,
    settledRows = [],
    finaleRow = -1,
}) {
    const revealReady = hasReachedCasePhase(casePhase, 'reveal') || results.length > 0
    const settledSet = new Set(settledRows)
    return (
        <div className="cases-multi-open-grid" data-case-layout="multi-grid" aria-label="Bulk case opening reels">
            {tracks.map((track, rowIndex) => {
                const result = results[rowIndex]
                const target = track[CASE_PRIZE_INDEX] || result || track[0]
                const isRare = result && RARE_TIERS.has(result.rarity)
                const profit = Number(result?.profitGc) || 0
                const rowSettled = settledSet.has(rowIndex)
                const isFinale = rowIndex === finaleRow
                return (
                    <article
                        key={`bulk-${rowIndex}-${target?.variantKey || target?.id || rowIndex}`}
                        className={`cases-multi-slot ${result ? 'is-settled' : ''} ${rowSettled ? 'is-row-settled' : ''} ${isFinale ? 'is-finale' : ''} ${isRare ? 'rare' : ''} ${result?.statTrak ? 'stattrak' : ''} ${result?.souvenir ? 'souvenir' : ''}`}
                        style={{ '--rarity': result?.color || target?.color || '#ffd166' }}
                        data-case-row-index={rowIndex}
                        data-case-outcome-id={result?.skinId || result?.id || target?.skinId || target?.id || ''}
                        data-case-outcome-variant={result?.variantKey || target?.variantKey || ''}
                    >
                        <header className="cases-multi-slot-head">
                            <span>#{rowIndex + 1}</span>
                            <strong>{activeCase?.name || 'Case'}</strong>
                            <em>{result ? (isFinale ? 'Top drop' : 'Landed') : casePhaseLabel(casePhase, 1)}</em>
                        </header>
                        <div className="cases-mini-reel-frame">
                            <div
                                className={`cases-carousel-track cases-mini-reel-track${rowSettled && !result ? ' is-settling' : ''}`}
                                style={{ transform: `translate(${trackOffsets[rowIndex] || 0}px, -50%)` }}
                            >
                                {track.map((item, tileIndex) => {
                                    const isTarget = tileIndex === CASE_PRIZE_INDEX
                                    return (
                                        <CaseReelTile
                                            key={`${rowIndex}-${tileIndex}-${item.id}-${item.variantKey || 'base'}`}
                                            item={item}
                                            rowIndex={rowIndex}
                                            tileIndex={tileIndex}
                                            compact
                                            targetReady={isTarget && revealReady}
                                            isPrize={isTarget && results.length > 0}
                                        />
                                    )
                                })}
                            </div>
                            <span className="cases-carousel-pointer cases-mini-pointer" />
                        </div>
                        {result ? (
                            <div className="cases-mini-result">
                                <img src={result.image} alt={result.name} loading="lazy" />
                                <div>
                                    <span className="cases-mini-badges">
                                        {result.statTrak && <b className="stattrak">ST™</b>}
                                        {result.souvenir && <b className="souvenir">SV</b>}
                                        {result.rarity && <b>{result.rarity}</b>}
                                    </span>
                                    <strong>{result.name}</strong>
                                    <em>{result.wearShort} · {result.float?.toFixed(3) ?? '—'}</em>
                                </div>
                                <aside>
                                    <strong>{formatCredits(result.valueGc || 0)}</strong>
                                    <small className={profit >= 0 ? 'pos' : 'neg'}>{profit >= 0 ? '+' : ''}{formatCredits(profit)}</small>
                                </aside>
                            </div>
                        ) : (
                            <div className="cases-mini-armed">
                                <span>{target?.rarity || 'Rolling'}</span>
                                <strong>{casePhaseLabel(casePhase, 1)}</strong>
                            </div>
                        )}
                    </article>
                )
            })}
        </div>
    )
}

function CaseBetRail({ activeCase, balance, casePrice, rows, totalStake }) {
    return (
        <aside className="cases-bet-rail" aria-label="Case stake summary">
            <div className="cases-bet-rail-head">
                <span>Practice case</span>
                <strong>{activeCase?.name || 'Loading case'}</strong>
            </div>
            <div className="cases-bet-readout">
                <small>Case price</small>
                <strong>{formatCredits(casePrice)}</strong>
            </div>
            <div className="cases-bet-grid">
                <span>
                    <small>Rows</small>
                    <strong>{rows}</strong>
                </span>
                <span>
                    <small>Total stake</small>
                    <strong>{formatCredits(totalStake)}</strong>
                </span>
                <span>
                    <small>Balance</small>
                    <strong>{formatCredits(balance || 0)}</strong>
                </span>
                <span>
                    <small>Mode</small>
                    <strong>{rows === 1 ? 'Single' : rows === 10 ? 'Bulk' : 'Multi'}</strong>
                </span>
            </div>
            <p>No real items, trades, withdrawals, or markets. GamPo uses fake credits and local simulator inventory.</p>
        </aside>
    )
}

function CaseRightPanel({
    activeCase,
    allCases,
    autoOpen,
    autoPanelOpen,
    autoPreset,
    autoRoundsLeft,
    autoSessionProfit,
    autoSpeed,
    autoStopLoss,
    autoStopProfit,
    autoStopRare,
    balance,
    casePrice,
    caseSwitchSearch,
    caseUxStats,
    collection,
    inventoryShowArchived,
    quickOpen,
    results,
    rows,
    running,
    setAutoPanelOpen,
    setAutoPreset,
    setAutoSpeed,
    setAutoStopLoss,
    setAutoStopProfit,
    setAutoStopRare,
    setCaseSwitchSearch,
    setInventoryShowArchived,
    setQuickOpen,
    setView,
    selectCase,
    selectRows,
    skipCaseAnimation,
    startCaseAuto,
    stopCaseAuto,
    performPlay,
    totalStake,
    view,
}) {
    const caseQuery = caseSwitchSearch.trim().toLowerCase()
    const switcherCases = (allCases || [])
        .filter(c => !caseQuery || c.name.toLowerCase().includes(caseQuery) || (c.type || '').toLowerCase().includes(caseQuery))
        .slice(0, 8)
    return (
        <aside className="cases-right-panel" data-case-panel="commands" data-ux-surface="controls" aria-label="Cases controls and stats">
            <section className="cases-control-card cases-control-primary">
                <header className="cases-right-selected">
                    {activeCase && <img src={activeCase.image} alt="" loading="lazy" />}
                    <div>
                        <span>Selected case</span>
                        <strong>{activeCase?.name || 'Loading case'}</strong>
                        <em>{activeCase ? `${activeCase.items.length} drops · ${casePriceBand(casePrice)}` : 'Preparing manifest'}</em>
                    </div>
                </header>
                <div className="cases-view-switch" role="group" aria-label="Cases view">
                    <button type="button" className={view === 'open' ? 'active' : ''} onClick={() => setView('open')}>Open</button>
                    <button type="button" className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>History</button>
                    <button type="button" className={view === 'pokedex' ? 'active' : ''} onClick={() => setView('pokedex')}>Inventory</button>
                </div>
                <div className="cases-row-switch cases-row-switch-merged" role="group" aria-label="Open mode (rows per open)">
                    {ROW_OPTIONS.map(n => (
                        <button key={n} type="button" className={rows === n ? 'active' : ''} aria-pressed={rows === n} disabled={running} onClick={() => selectRows(n)}>
                            {n === 1 ? 'Single' : n === 10 ? 'Bulk ×10' : `Multi ×${n}`}
                        </button>
                    ))}
                </div>
                <div className="cases-quick-auto">
                    <button type="button" data-case-action="quick-toggle" aria-pressed={quickOpen} className={quickOpen ? 'active' : ''} disabled={running} onClick={() => setQuickOpen(v => !v)}>
                        Quick {quickOpen ? 'on' : 'off'}
                    </button>
                    <button type="button" data-case-action="auto-settings" aria-expanded={autoPanelOpen} className={autoOpen ? 'active' : ''} disabled={running && !autoOpen} onClick={() => setAutoPanelOpen(v => !v)}>
                        Auto {autoOpen ? 'running' : 'setup'}
                    </button>
                </div>
                {autoPanelOpen && (
                    <div className="cases-auto-panel" aria-label="Auto open settings">
                        <div className="cases-auto-presets" role="group" aria-label="Auto count">
                            {['10', '25', '50', 'infinite'].map(preset => (
                                <button key={preset} type="button" className={autoPreset === preset ? 'active' : ''} onClick={() => setAutoPreset(preset)}>
                                    {preset === 'infinite' ? '∞' : preset}
                                </button>
                            ))}
                        </div>
                        <label>
                            Speed
                            <select value={autoSpeed} onChange={e => setAutoSpeed(e.target.value)}>
                                <option value="normal">Normal</option>
                                <option value="turbo">Turbo</option>
                                <option value="slow">Slow</option>
                            </select>
                        </label>
                        <label>
                            Stop profit
                            <input value={autoStopProfit} onChange={e => setAutoStopProfit(e.target.value)} inputMode="decimal" placeholder="0 = off" />
                        </label>
                        <label>
                            Stop loss
                            <input value={autoStopLoss} onChange={e => setAutoStopLoss(e.target.value)} inputMode="decimal" placeholder="0 = off" />
                        </label>
                        <label className="cases-auto-check">
                            <input type="checkbox" checked={autoStopRare} onChange={e => setAutoStopRare(e.target.checked)} />
                            <span>Stop on rare / StatTrak</span>
                        </label>
                    </div>
                )}
                <div className="cases-auto-status">
                    <span><small>Stake</small><strong>{formatCredits(totalStake)}</strong></span>
                    <span><small>Auto left</small><strong>{autoOpen ? (autoRoundsLeft === Infinity ? '∞' : autoRoundsLeft) : 'Off'}</strong></span>
                    <span className={autoSessionProfit >= 0 ? 'pos' : 'neg'}><small>Auto P/L</small><strong>{autoSessionProfit >= 0 ? '+' : ''}{formatCredits(autoSessionProfit)}</strong></span>
                </div>
                <button
                    type="button"
                    className="cases-right-cta"
                    data-game-action={results.length > 0 ? 'case-open-again' : 'case-open'}
                    data-ux-primary-action
                    onClick={() => performPlay({ betAmount: casePrice })}
                    disabled={running || !activeCase || balance < totalStake}
                >
                    {results.length > 0 ? `Open again (${formatCredits(totalStake)})` : `Open ×${rows} (${formatCredits(totalStake)})`}
                </button>
                <div className="cases-side-actions">
                    <button type="button" data-case-action={autoOpen ? 'auto-stop' : 'auto-start'} onClick={autoOpen ? stopCaseAuto : startCaseAuto} disabled={running && !autoOpen}>
                        {autoOpen ? 'Stop auto' : 'Start auto'}
                    </button>
                    <button type="button" onClick={skipCaseAnimation} disabled={!running}>
                        Skip
                    </button>
                </div>
            </section>

            <section className="cases-control-card cases-switcher-card">
                <header>
                    <strong>Choose case</strong>
                    <small>{allCases?.length || 0} available</small>
                </header>
                <input
                    type="search"
                    value={caseSwitchSearch}
                    onChange={e => setCaseSwitchSearch(e.target.value)}
                    placeholder="Search cases..."
                    aria-label="Search cases"
                />
                <div className="cases-switcher-list">
                    {switcherCases.map(c => (
                        <button
                            key={c.id}
                            type="button"
                            className={activeCase?.id === c.id ? 'active' : ''}
                            data-case-action="case-switch"
                            onClick={() => selectCase(c.id)}
                            disabled={running}
                        >
                            <img src={c.image} alt="" loading="lazy" />
                            <span>
                                <strong>{c.name}</strong>
                                <em>{c.items.length} items · EV {formatCredits(c.evGc || 0)}</em>
                            </span>
                            <b>{formatCredits(c.openPriceGc || 0)}</b>
                        </button>
                    ))}
                </div>
            </section>

            <section className="cases-control-card cases-side-stats">
                <header>
                    <strong>Session</strong>
                    <button type="button" onClick={() => setView('pokedex')}>
                        Inventory
                    </button>
                </header>
                <div className="cases-session-stats">
                    <span><small>Opened</small><strong>{caseUxStats.opened}</strong></span>
                    <span><small>Spent</small><strong>{formatCredits(caseUxStats.spent)}</strong></span>
                    <span className={caseUxStats.profit >= 0 ? 'pos' : 'neg'}><small>Profit/Loss</small><strong>{caseUxStats.profit >= 0 ? '+' : ''}{formatCredits(caseUxStats.profit)}</strong></span>
                    <span><small>Return</small><strong>{caseUxStats.spent > 0 ? `${caseUxStats.returnPct.toFixed(1)}%` : '—'}</strong></span>
                </div>
                <div className="cases-best-opened">
                    <strong>Best opened</strong>
                    {caseUxStats.best.length === 0 ? <em>No opens yet</em> : caseUxStats.best.map((drop, index) => (
                        <span key={`${drop.dropId || drop.key}-${index}`} style={{ '--rarity': drop.color }}>
                            <b>#{index + 1}</b>
                            <img src={drop.image} alt="" loading="lazy" />
                            <small>{drop.name}</small>
                            <strong>{formatCredits(drop.valueGc || 0)}</strong>
                        </span>
                    ))}
                </div>
                <div className="cases-distribution" aria-label="Rarity distribution">
                    <strong>Rarity</strong>
                    {caseUxStats.rarityRows.map(row => (
                        <span key={row.label}>
                            <small>{row.label}</small>
                            <i><b style={{ width: `${Math.min(100, row.pct)}%` }} /></i>
                            <em>{row.count}</em>
                        </span>
                    ))}
                </div>
                <div className="cases-wear-strip">
                    {caseUxStats.wearRows.map(row => <b key={row.label}>{row.label} {row.pct.toFixed(0)}%</b>)}
                </div>
                <div className="cases-recent-mini">
                    <strong>Recent</strong>
                    {caseUxStats.recent.length === 0 ? <em>No recent opens</em> : caseUxStats.recent.map((drop, index) => (
                        <span key={`${drop.dropId || drop.key}-recent-${index}`} style={{ '--rarity': drop.color }}>
                            <small>{drop.statTrak && 'ST™ '}{drop.name}</small>
                            <b>{formatCredits(drop.valueGc || 0)}</b>
                        </span>
                    ))}
                </div>
                <div className="cases-inventory-mini">
                    <span>
                        <small>Inventory</small>
                        <strong>{collection.summary.activeDrops}</strong>
                    </span>
                    <span>
                        <small>Favorites</small>
                        <strong>{collection.summary.favoriteDrops}</strong>
                    </span>
                    <button type="button" onClick={() => setInventoryShowArchived(v => !v)}>
                        {inventoryShowArchived ? 'Hide archive' : 'Show archive'}
                    </button>
                </div>
            </section>
        </aside>
    )
}

// C-P0-1: surfaces the local provably-fair state. NOTE: cases roll via the
// synchronous lightweight hash (`hmacRollSync`), so this is worded as a
// deterministic seed+nonce ledger — it does NOT claim cryptographic SHA-256
// verification of these specific rolls.
function CaseFairnessPanel({ refreshKey }) {
    const [state, setState] = useState(() => {
        try { return getProvablyFair() } catch { return null }
    })
    const [recent, setRecent] = useState(() => {
        try { return getRecentRolls() } catch { return [] }
    })
    const [seedDraft, setSeedDraft] = useState('')

    const refresh = useCallback(() => {
        try { setState(getProvablyFair()) } catch { /* ignore */ }
        try { setRecent(getRecentRolls()) } catch { /* ignore */ }
    }, [])

    useEffect(() => { refresh() }, [refresh, refreshKey])

    const applySeed = useCallback(() => {
        const next = setClientSeed(seedDraft)
        setSeedDraft('')
        setState(next)
        try { setRecent(getRecentRolls()) } catch { /* ignore */ }
    }, [seedDraft])

    const caseRolls = (recent || []).filter(roll => `${roll.gameId || ''}`.startsWith('cases')).slice(0, 6)

    return (
        <details className="cases-fairness" data-cases-fairness>
            <summary>
                <span>Fairness</span>
                <small>deterministic seed + nonce</small>
            </summary>
            <div className="cases-fairness-body">
                <p className="cases-fairness-note">
                    Each drop is derived from a server seed, your client seed, and an
                    incrementing nonce. Cases use a fast deterministic hash for the live
                    roll — the seeds and nonces below are reproducible, but this panel does
                    not perform cryptographic SHA-256 verification of these specific rolls.
                </p>
                <dl className="cases-fairness-grid">
                    <div>
                        <dt>Server seed (hashed)</dt>
                        <dd>{state?.serverSeed ? maskSeed(state.serverSeed) : '—'}</dd>
                    </div>
                    <div>
                        <dt>Current nonce</dt>
                        <dd>{Number.isFinite(state?.nonce) ? state.nonce : '—'}</dd>
                    </div>
                </dl>
                <label className="cases-fairness-seed">
                    <span>Client seed</span>
                    <div>
                        <input
                            type="text"
                            value={seedDraft}
                            onChange={e => setSeedDraft(e.target.value)}
                            placeholder={state?.clientSeed || 'client seed'}
                            aria-label="Client seed"
                        />
                        <button type="button" onClick={applySeed} disabled={!seedDraft.trim()} aria-label="Set client seed">
                            Set
                        </button>
                    </div>
                    <em>Active: {state?.clientSeed || '—'}</em>
                </label>
                <div className="cases-fairness-rolls" aria-label="Recent case rolls">
                    <strong>Recent case rolls</strong>
                    {caseRolls.length === 0 ? (
                        <em>No case rolls yet</em>
                    ) : (
                        <ul>
                            {caseRolls.map(roll => (
                                <li key={roll.id}>
                                    <b>#{roll.nonce}</b>
                                    <span>{roll.gameId}</span>
                                    <code>{(Number(roll.roll) || 0).toFixed(6)}</code>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </details>
    )
}

export default function CasesGame() {
    const definition = findGameDefinition('cases') || { name: 'Cases', category: 'Arcade originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('cases')
    const { haptics: hapticsEnabled } = useSettings()
    const session = useGameSession('cases')
    const preloader = useOriginalsPreloader('cases')
    const csCatalog = useCsCollection()
    const collection = useCaseCollection({ catalogTotal: csCatalog.catalog?.totalSkins || 0 })
    const [searchParams, setSearchParams] = useSearchParams()

    const [allCases, setAllCases] = useState(null)
    const [category, setCategory] = useState('popular')
    const [caseId, setCaseId] = useState(null)
    const [rows, setRows] = useState(1)
    const [running, setRunning] = useState(false)
    const [tracks, setTracks] = useState([]) // [[item, item, ...], ...]
    const [trackOffsets, setTrackOffsets] = useState([])
    const [results, setResults] = useState([]) // resolved drops list (with wear/statTrak)
    const [casePhase, setCasePhase] = useState('idle') // idle | arming | lid | spin | slowdown | land | reveal | settled
    const [settling, setSettling] = useState(false) // C2: reel easing back from overshoot
    const [nearMiss, setNearMiss] = useState(false) // C3: rare tile teased adjacent to target
    const [settledRows, setSettledRows] = useState([]) // C5: per-row staggered settle flags (×10)
    const [finaleRow, setFinaleRow] = useState(-1) // C5: best-drop row index for finale pulse
    const [quickOpen, setQuickOpen] = useState(false)
    const [autoOpen, setAutoOpen] = useState(false)
    const [autoPanelOpen, setAutoPanelOpen] = useState(false)
    const [autoPreset, setAutoPreset] = useState('10')
    const [autoSpeed, setAutoSpeed] = useState('normal')
    const [autoStopProfit, setAutoStopProfit] = useState('')
    const [autoStopLoss, setAutoStopLoss] = useState('')
    const [autoStopRare, setAutoStopRare] = useState(true)
    const [autoRoundsLeft, setAutoRoundsLeft] = useState(0)
    const [autoSessionProfit, setAutoSessionProfit] = useState(0)
    const [celebrationDrop, setCelebrationDrop] = useState(null)
    const [settlementSummary, setSettlementSummary] = useState(null)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [view, setView] = useState('open') // 'open' | 'history' | 'pokedex' (Collection UI)
    // Wave 41: filter to also show locked silhouettes from the full catalog.
    const [showLocked, setShowLocked] = useState(true)
    const [historyFilter, setHistoryFilter] = useState('')
    const [pokedexFilter, setPokedexFilter] = useState('')
    // C-P1-3: history owns its own rarity filter. The inventory/pokedex view
    // filters by `inventoryRarity` (its existing chip control) so the two views
    // no longer share one `rarityFilter` and leak into each other.
    const [historyRarityFilter, setHistoryRarityFilter] = useState('all')
    const [pokedexSort, setPokedexSort] = useState('value')
    const [caseGridSearch, setCaseGridSearch] = useState('')
    const [browserCollapsed, setBrowserCollapsed] = useState(false)
    const [caseSwitchSearch, setCaseSwitchSearch] = useState('')
    const [inventoryFilter, setInventoryFilter] = useState('')
    const [inventorySort, setInventorySort] = useState('latest')
    const [inventoryRarity, setInventoryRarity] = useState('all')
    const [inventoryWear, setInventoryWear] = useState('all')
    const [inventoryFavoritesOnly, setInventoryFavoritesOnly] = useState(false)
    const [inventoryShowArchived, setInventoryShowArchived] = useState(false)
    const [inventoryPage, setInventoryPage] = useState(1)
    const [fairnessKey, setFairnessKey] = useState(0)
    const tickRef = useRef({ ids: [], landId: null })
    const revealTimersRef = useRef([])
    const autoTimerRef = useRef(null)
    const pendingRoundRef = useRef(null)
    const celebrationTimerRef = useRef(null)
    const resultsPanelRef = useRef(null)
    const reelAreaRef = useRef(null)
    const stageRef = useRef(null)
    const initialCaseIdRef = useRef(searchParams.get('caseId'))
    const [dockPortal, setDockPortal] = useState(null)
    useEffect(() => { setDockPortal(document.body) }, [])
    const casesBgmMode = celebrationDrop ? 'bonus' : 'idle'
    useGameBgm('cases', casesBgmMode)

    useEffect(() => {
        if (view === 'pokedex') csCatalog.load()
    }, [view, csCatalog.load])

    useEffect(() => {
        let cancelled = false
        Promise.all([
            fetch('/data/cs-cases.json').then(r => r.json()),
            fetch('/data/cs-prices.json')
                .then(r => r.ok ? r.json() : {})
                .catch(() => ({})),
        ]).then(([data, priceMap]) => {
            if (cancelled) return
            const normalized = data.map(c => normalizeCaseForRuntime(c, priceMap))
            setAllCases(normalized)
            const requestedCaseId = initialCaseIdRef.current
            const first = normalized.find(c => c.id === requestedCaseId) || filterCasesByCategory(normalized, 'popular')[0] || normalized[0]
            if (first) setCaseId(first.id)
        }).catch(err => {
            // eslint-disable-next-line no-console
            console.warn('[cases] manifest load failed', err)
        })
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        if (!allCases?.length) return
        const requestedCaseId = searchParams.get('caseId')
        if (requestedCaseId && requestedCaseId !== caseId && allCases.some(c => c.id === requestedCaseId)) {
            setCaseId(requestedCaseId)
        }
    }, [allCases, caseId, searchParams])

    const categoryCases = useMemo(() => {
        const list = filterCasesByCategory(allCases || [], category)
        const q = caseGridSearch.trim().toLowerCase()
        return q ? list.filter(c => c.name.toLowerCase().includes(q)) : list
    }, [allCases, category, caseGridSearch])

    const activeCase = useMemo(() => (allCases || []).find(c => c.id === caseId) || categoryCases[0], [allCases, caseId, categoryCases])
    const casePrice = activeCase ? Math.max(1, roundGc(activeCase.openPriceGc, 1)) : 5
    const totalStake = roundGc(casePrice * rows, casePrice)

    const machine = useRoundMachine({})

    const clearRevealTimers = useCallback(() => {
        revealTimersRef.current.forEach(id => window.clearTimeout(id))
        revealTimersRef.current = []
        tickRef.current.ids.forEach(id => window.clearTimeout(id))
        if (tickRef.current.landId) window.clearTimeout(tickRef.current.landId)
        tickRef.current = { ids: [], landId: null }
    }, [])

    const queueRevealTimer = useCallback((fn, ms) => {
        const id = window.setTimeout(fn, ms)
        revealTimersRef.current.push(id)
        return id
    }, [])

    useEffect(() => () => {
        clearRevealTimers()
        cancelHaptics()
        if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current)
        if (celebrationTimerRef.current) window.clearTimeout(celebrationTimerRef.current)
    }, [clearRevealTimers])

    // Bring the spinning reel into view once it renders so mobile players see
    // the animation instead of it firing far below the case browser. The reel
    // area is empty (display:none) until tracks mount, so we key on tracks.
    useScrollActionIntoView(reelAreaRef, tracks.length > 0, [tracks.length])

    const scheduleTickSfx = useCallback((durationMs = CASE_REVEAL_MS) => {
        tickRef.current.ids.forEach(id => window.clearTimeout(id))
        const ids = []
        const TICKS = 14
        for (let i = 0; i < TICKS; i += 1) {
            const t = i / (TICKS - 1)
            const at = Math.round(cubicOut(t) * durationMs)
            const vol = Math.max(0.18, 0.6 * (1 - t * 0.65))
            const id = window.setTimeout(() => {
                sfx.play('tick', { volume: vol })
                // C7: haptic tick only on the later (decelerating) ticks so the
                // motor isn't machine-gunned during the fast early scroll. The
                // helper also throttles + honours reduce-motion.
                if (t > 0.55) haptic('tick', { enabled: hapticsEnabled })
            }, at)
            ids.push(id)
        }
        tickRef.current.ids = ids
        if (tickRef.current.landId) window.clearTimeout(tickRef.current.landId)
        tickRef.current.landId = window.setTimeout(() => {
            sfx.play('land', { volume: 0.85 })
            haptic('land', { enabled: hapticsEnabled })
        }, Math.max(60, durationMs - 40))
    }, [sfx, hapticsEnabled])

    const finishPendingRound = useCallback(({ skipped = false } = {}) => {
        const pending = pendingRoundRef.current
        if (!claimCaseSettlement(pending)) return
        clearRevealTimers()

        const { caseData, picks, resolve, stake, tracks: pendingTracks, offsets: pendingOffsets, rows: roundRows } = pending
        setTracks(pendingTracks)
        setTrackOffsets(pendingOffsets)
        setCasePhase('reveal')

        const settlement = summarizeCaseSettlement({ picks, stake, rows: roundRows })
        const returnAmount = settlement.totalReturn
        const profit = roundSignedGc(settlement.profit, 0)
        const averageMultiplier = stake > 0 ? returnAmount / stake : 0
        if (returnAmount > 0) addWinnings(returnAmount, 'Cases return')
        setResults(picks)
        setSettlementSummary(settlement)
        setFairnessKey(key => key + 1)

        picks.forEach(pick => {
            collection.recordDrop(pick, {
                caseId: caseData.id,
                caseName: caseData.name,
                openPriceGc: pick.openPriceGc,
            })
            recordProgressCaseDrop(pick)
        })

        const won = profit > 0
        const headlineMult = picks.reduce((m, p) => Math.max(m, p.multiplier || 0), 0)
        const rare = picks.some(p => RARE_TIERS.has(p.rarity) || p.statTrak)
        if (autoOpen) {
            const nextProfit = roundSignedGc(autoSessionProfit + profit, 0)
            const nextLeft = autoRoundsLeft === Infinity ? Infinity : Math.max(0, Number(autoRoundsLeft || 0) - 1)
            const profitLimit = Number(autoStopProfit)
            const lossLimit = Number(autoStopLoss)
            const hitProfitStop = Number.isFinite(profitLimit) && profitLimit > 0 && nextProfit >= profitLimit
            const hitLossStop = Number.isFinite(lossLimit) && lossLimit > 0 && nextProfit <= -lossLimit
            const hitRareStop = autoStopRare && rare
            setAutoSessionProfit(nextProfit)
            setAutoRoundsLeft(nextLeft)
            if (nextLeft === 0 || hitProfitStop || hitLossStop || hitRareStop) {
                setAutoOpen(false)
            }
        }
        const celebrate = pickCelebrationDrop(picks)
        setCelebrationDrop(celebrate)
        // C5: in a bulk open, flag the single highest-value row so the grid can
        // give it a finale pulse once everything has settled.
        if (roundRows > 1 && picks.length > 1) {
            let bestRow = 0
            for (let i = 1; i < picks.length; i += 1) {
                if ((Number(picks[i]?.valueGc) || 0) > (Number(picks[bestRow]?.valueGc) || 0)) bestRow = i
            }
            setFinaleRow(bestRow)
        } else {
            setFinaleRow(-1)
        }
        if (celebrationTimerRef.current) window.clearTimeout(celebrationTimerRef.current)
        if (celebrate) {
            celebrationTimerRef.current = window.setTimeout(() => setCelebrationDrop(null), 2600)
        }
        setToast({
            kind: won ? 'win' : 'lose',
            multiplier: won ? headlineMult : null,
            amount: profit,
            message: picks.map(p => `${p.statTrak ? 'StatTrak™ ' : ''}${p.name}`).join(', ').slice(0, 80),
        })
        if (skipped) sfx.play('land', { volume: 0.72 })
        sfx.play('reveal', { volume: 0.9 })
        if (rare) sfx.play('rare', { volume: 1 })
        // C7: tactile reward on the result. Rare/celebration drop gets the longer
        // 'rare' buzz (forced past the throttle since it's a single moment); a
        // plain win gets a short pulse. Reduce-motion / setting-off no-ops.
        if (celebrate || rare) haptic('rare', { enabled: hapticsEnabled, force: true })
        else if (won) haptic('win', { enabled: hapticsEnabled, force: true })
        // Wave 31: extra fanfare variants for special results.
        const knifeOrGloves = picks.some(p => /knife|gloves|bayonet|karambit|huntsman|talon/i.test(p.name || ''))
        if (knifeOrGloves) sfx.play('knife', { volume: 1 })
        if (picks.some(p => p.statTrak)) sfx.play('stattrak', { volume: 0.85 })
        if (picks.some(p => p.souvenir)) sfx.play('souvenir', { volume: 0.85 })
        if (won && headlineMult >= 12) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: headlineMult })
        } else {
            playSound(won ? 'win' : 'loss')
        }
        sfx.play(won ? 'win' : 'lose')
        session.record({
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label: `${caseData.name} x${roundRows}`,
            profit, betAmount: stake, multiplier: averageMultiplier,
            meta: { picks: picks.map(p => ({ id: p.skinId, rarity: p.rarity, multiplier: p.multiplier, valueGc: p.valueGc, openPriceGc: p.openPriceGc, wear: p.wear, statTrak: p.statTrak })) },
        })
        machine.finish({
            kind: won ? 'win' : 'lose',
            profit,
            multiplier: averageMultiplier,
            picks: picks.map(p => p.skinId),
            skipped,
        })
        showToast(won ? 'win' : 'loss', `${caseData.name} ${won ? 'win' : 'miss'}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        setRunning(false)
        setCasePhase('settled')
        setNearMiss(false)
        pendingRoundRef.current = null
        const scrollId = window.setTimeout(() => {
            const reducedMotion = Boolean(
                window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
                || document.documentElement.classList.contains('gampo-reduce-motion'),
            )
            resultsPanelRef.current?.scrollIntoView({
                behavior: reducedMotion ? 'auto' : 'smooth',
                block: 'center',
            })
        }, 80)
        revealTimersRef.current.push(scrollId)
        resolve({ profit })
    }, [addWinnings, autoOpen, autoRoundsLeft, autoSessionProfit, autoStopLoss, autoStopProfit, autoStopRare, clearRevealTimers, collection, machine, playSound, session, showToast, sfx, hapticsEnabled])

    const skipCaseAnimation = useCallback(() => {
        if (!pendingRoundRef.current || pendingRoundRef.current.settled) return
        cancelHaptics()
        finishPendingRound({ skipped: true })
    }, [finishPendingRound])

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (running) { resolve({ profit: 0 }); return }
        if (!activeCase) { showToast('error', 'Loading cases', 'Try again'); resolve({ profit: 0 }); return }
        const unitPrice = Math.max(1, roundGc(activeCase.openPriceGc || betAmount || 1, 1))
        const stake = roundGc(unitPrice * rows, unitPrice)
        if (!placeBet(stake, 'Cases')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(stake)}`)
            resolve({ profit: 0 })
            return
        }
        clearRevealTimers()
        if (celebrationTimerRef.current) window.clearTimeout(celebrationTimerRef.current)
        setLastBet(unitPrice)
        setToast(null)
        setCelebrationDrop(null)
        setSettlementSummary(null)
        setRunning(true)
        setResults([])
        setTracks([])
        setTrackOffsets([])
        setSettling(false)
        setNearMiss(false)
        setSettledRows([])
        setFinaleRow(-1)
        setCasePhase('arming')
        // C-P1-2: opening also commits to the reel-first stage. Collapse the
        // browser (the auto-selected first case never fires selectCase).
        setBrowserCollapsed(true)
        playSound('click')
        sfx.play('open', { volume: 0.65 })
        sfx.play('click')
        setView('open')

        const { tilePx, gapPx } = getCaseReelMetrics(stageRef.current)
        const round = createCaseOpeningRound({
            caseData: activeCase,
            rows,
            stake,
            unitPrice,
            targetIndex: CASE_PRIZE_INDEX,
            tilePx,
            gapPx,
        })
        const picks = round.outcomes
        const newTracks = round.tracks
        const finalOffsets = round.offsets
        const roundNearMiss = Boolean(round.nearMiss)
        pendingRoundRef.current = {
            caseData: activeCase,
            entries: round.entries,
            offsets: finalOffsets,
            picks,
            resolve,
            rows,
            settled: false,
            stake,
            tracks: newTracks,
        }

        machine.start([
            { index: 0, type: ROUND_EVENTS.ROUND_START, payload: { stake, rows, caseId: activeCase.id }, at: 0 },
            { index: 1, type: ROUND_EVENTS.INPUT_LOCK, payload: {}, at: 0 },
            { index: 2, type: ROUND_EVENTS.BET_ACCEPTED, payload: { stake, rows }, at: 0 },
        ], { autoFinish: false })

        const reducedMotion = Boolean(
            window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
            || document.documentElement.classList.contains('gampo-reduce-motion'),
        )
        const revealMs = reducedMotion ? 160 : quickOpen ? 1320 : CASE_REVEAL_MS
        const lidMs = reducedMotion ? 24 : CASE_LID_LIFT_MS
        const sweepLeadMs = Math.min(CASE_LIGHT_SWEEP_LEAD_MS, Math.max(280, revealMs * 0.38))
        const zoomLeadMs = Math.min(CASE_PRIZE_ZOOM_LEAD_MS, Math.max(140, revealMs * 0.2))

        queueRevealTimer(() => {
            if (!pendingRoundRef.current || pendingRoundRef.current.settled) return
            setCasePhase('lid')
            sfx.play('lid', { volume: 0.78 })
        }, reducedMotion ? 0 : 90)

        queueRevealTimer(() => {
            if (!pendingRoundRef.current || pendingRoundRef.current.settled) return
            setCasePhase('spin')
            setTracks(newTracks)
            setTrackOffsets(newTracks.map(() => getCaseReelStartOffset(tilePx, gapPx)))
            sfx.play('multispin', { volume: rows >= 3 ? 0.62 : 0.36 })
            queueRevealTimer(() => {
                if (!pendingRoundRef.current || pendingRoundRef.current.settled) return
                // C2: aim PAST the resting offset (further negative) so the reel
                // carries momentum. Reduced-motion lands flat on the final offset.
                setSettling(false)
                setTrackOffsets(reducedMotion
                    ? finalOffsets
                    : finalOffsets.map(o => o - CASE_REEL_OVERSHOOT_PX))
            }, 32)
            scheduleTickSfx(revealMs)
        }, lidMs)

        queueRevealTimer(() => {
            if (!pendingRoundRef.current || pendingRoundRef.current.settled) return
            setCasePhase('slowdown')
            // C3: when a rare tile is teased adjacent to the target, drive the
            // slowdown heartbeat (CSS, scoped to .case-near-miss) + a gentle
            // tactile pulse. Reduced-motion suppresses both (motion + vibration).
            if (roundNearMiss && !reducedMotion) {
                setNearMiss(true)
                haptic('select', { enabled: hapticsEnabled })
            }
        }, lidMs + Math.max(90, revealMs * 0.58))

        queueRevealTimer(() => {
            if (!pendingRoundRef.current || pendingRoundRef.current.settled) return
            setCasePhase('land')
            // C3: stop the near-miss heartbeat the moment the reel locks.
            setNearMiss(false)
            // C2: ease back from the overshoot to the exact resting offset.
            if (!reducedMotion) {
                setSettling(true)
                // C5: in a ×10 bulk open, settle the rows in a staggered wave so
                // the grid resolves like a cascade. Other layouts settle at once.
                if (rows === 10) {
                    finalOffsets.forEach((offset, ri) => {
                        queueRevealTimer(() => {
                            if (!pendingRoundRef.current || pendingRoundRef.current.settled) return
                            setTrackOffsets(prev => {
                                const next = Array.isArray(prev) ? [...prev] : []
                                next[ri] = offset
                                return next
                            })
                            setSettledRows(prev => (prev.includes(ri) ? prev : [...prev, ri]))
                        }, ri * CASE_MULTI_SETTLE_STAGGER_MS)
                    })
                } else {
                    setTrackOffsets(finalOffsets)
                }
            } else {
                setTrackOffsets(finalOffsets)
                setSettledRows(finalOffsets.map((_, ri) => ri))
            }
        }, lidMs + Math.max(80, revealMs - sweepLeadMs))

        queueRevealTimer(() => {
            if (!pendingRoundRef.current || pendingRoundRef.current.settled) return
            setCasePhase('reveal')
        }, lidMs + Math.max(100, revealMs - zoomLeadMs))

        queueRevealTimer(() => {
            finishPendingRound()
        }, lidMs + revealMs + CASE_SETTLE_PAD_MS)
    })

    useEffect(() => {
        if (autoTimerRef.current) {
            window.clearTimeout(autoTimerRef.current)
            autoTimerRef.current = null
        }
        if (!autoOpen || running || !activeCase) return undefined
        if (casePhase !== 'idle' && casePhase !== 'settled') return undefined
        if (autoRoundsLeft !== Infinity && Number(autoRoundsLeft || 0) <= 0) {
            setAutoOpen(false)
            return undefined
        }
        if (balance < totalStake) {
            setAutoOpen(false)
            showToast('error', 'Auto stopped', `Need ${formatCredits(totalStake)}`)
            return undefined
        }
        const delay = autoSpeed === 'turbo' || quickOpen ? 360 : autoSpeed === 'slow' ? 1200 : 760
        autoTimerRef.current = window.setTimeout(() => {
            autoTimerRef.current = null
            performPlay({ betAmount: casePrice })
        }, delay)
        return () => {
            if (autoTimerRef.current) {
                window.clearTimeout(autoTimerRef.current)
                autoTimerRef.current = null
            }
        }
    }, [activeCase, autoOpen, autoRoundsLeft, autoSpeed, balance, casePhase, casePrice, quickOpen, running, showToast, totalStake])

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)
    const stageLoading = !preloader.ready || !allCases

    const pokedexList = useMemo(() => Object.values(collection.pokedex), [collection.pokedex])
    const caseUxStats = useMemo(() => {
        const drops = collection.drops || []
        const spent = session.history.reduce((sum, item) => sum + (Number(item.betAmount) || 0), 0)
        const profit = session.history.reduce((sum, item) => sum + (Number(item.profit) || 0), 0)
        const returnPct = spent > 0 ? Math.max(0, ((spent + profit) / spent) * 100) : 0
        const countBy = key => drops.reduce((acc, drop) => {
            const value = drop?.[key] || 'Other'
            acc[value] = (acc[value] || 0) + 1
            return acc
        }, {})
        const rarityCounts = countBy('rarity')
        const wearCounts = countBy('wearShort')
        const rarityRows = ['Covert', 'Classified', 'Restricted', 'Mil-Spec Grade'].map(label => ({
            label,
            count: rarityCounts[label] || 0,
            pct: drops.length ? ((rarityCounts[label] || 0) / drops.length) * 100 : 0,
        }))
        const wearRows = ['FN', 'MW', 'FT', 'WW', 'BS'].map(label => ({
            label,
            count: wearCounts[label] || 0,
            pct: drops.length ? ((wearCounts[label] || 0) / drops.length) * 100 : 0,
        }))
        return {
            best: drops.slice().sort((a, b) => (Number(b.valueGc) || 0) - (Number(a.valueGc) || 0)).slice(0, 3),
            opened: drops.length,
            profit,
            rarityRows,
            recent: drops.slice(0, 8),
            returnPct,
            spent,
            wearRows,
        }
    }, [collection.drops, session.history])

    const filteredDrops = useMemo(() => {
        const q = historyFilter.trim().toLowerCase()
        return collection.drops.filter(d => {
            if (historyRarityFilter !== 'all' && d.rarity !== historyRarityFilter) return false
            if (q && !(d.name || '').toLowerCase().includes(q) && !(d.caseName || '').toLowerCase().includes(q)) return false
            return true
        })
    }, [collection.drops, historyFilter, historyRarityFilter])

    const filteredPokedex = useMemo(() => {
        const q = pokedexFilter.trim().toLowerCase()
        const list = pokedexList.filter(s => {
            if (inventoryRarity !== 'all' && s.rarity !== inventoryRarity) return false
            if (q && !(s.name || '').toLowerCase().includes(q)) return false
            return true
        })
        switch (pokedexSort) {
            case 'recent':     return [...list].sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
            case 'count':      return [...list].sort((a, b) => (b.count || 0) - (a.count || 0))
            case 'name':       return [...list].sort((a, b) => a.name.localeCompare(b.name))
            case 'wear':       return [...list].sort((a, b) => (a.float || 0) - (b.float || 0))
            case 'value':      return [...list].sort((a, b) => (b.valueGc || 0) - (a.valueGc || 0))
            case 'multiplier':
            default:           return [...list].sort((a, b) => (b.multiplier || 0) - (a.multiplier || 0))
        }
    }, [pokedexList, pokedexFilter, inventoryRarity, pokedexSort])

    // Wave 41: locked silhouettes from the full CS2 catalog. Skins not yet
    // discovered show with greyscale + a lock icon; opening the matching
    // case can reveal them.
    const lockedSkins = useMemo(() => {
        if (!showLocked || !csCatalog.loaded) return []
        const discovered = new Set(pokedexList.map(s => s.skinId))
        const q = pokedexFilter.trim().toLowerCase()
        const list = []
        for (const skin of Object.values(csCatalog.catalog.skins || {})) {
            if (discovered.has(skin.id)) continue
            if (inventoryRarity !== 'all' && skin.rarity?.name !== inventoryRarity) continue
            if (q && !(skin.name || '').toLowerCase().includes(q)) continue
            list.push({
                key: `locked::${skin.id}`,
                skinId: skin.id,
                name: skin.name,
                image: skin.image,
                color: skin.rarity?.color || '#777',
                rarity: skin.rarity?.name || 'Unknown',
                locked: true,
                multiplier: skin.rarity?.multiplier || 0,
            })
        }
        // Cap to 240 locked rows so the grid stays performant.
        return list.slice(0, 240)
    }, [showLocked, csCatalog.loaded, csCatalog.catalog, pokedexList, inventoryRarity, pokedexFilter])
    const collectionTotalSkins = csCatalog.loaded ? csCatalog.catalog.totalSkins : collection.summary.uniqueVariants
    const collectionLockedCount = Math.max(0, (collectionTotalSkins || 0) - collection.summary.uniqueVariants)
    const inventoryRarityRows = useMemo(() => {
        const activeDrops = (collection.drops || []).filter(drop => !drop.archived)
        const counts = activeDrops.reduce((acc, drop) => {
            const key = drop.rarity || 'Other'
            acc[key] = (acc[key] || 0) + 1
            return acc
        }, {})
        return RARITY_FILTERS.filter(option => option.value !== 'all').map(option => ({
            ...option,
            count: counts[option.value] || 0,
        }))
    }, [collection.drops])
    const inventoryWearRows = useMemo(() => {
        const activeDrops = (collection.drops || []).filter(drop => !drop.archived)
        const counts = activeDrops.reduce((acc, drop) => {
            const key = drop.wearShort || 'NA'
            acc[key] = (acc[key] || 0) + 1
            return acc
        }, {})
        return ['FN', 'MW', 'FT', 'WW', 'BS'].map(label => ({ label, count: counts[label] || 0 }))
    }, [collection.drops])
    const inventoryDrops = useMemo(() => {
        const q = inventoryFilter.trim().toLowerCase()
        const list = (collection.drops || []).filter(drop => {
            if (inventoryShowArchived ? !drop.archived : drop.archived) return false
            if (inventoryFavoritesOnly && !drop.favorite) return false
            if (inventoryRarity !== 'all' && drop.rarity !== inventoryRarity) return false
            if (inventoryWear !== 'all' && drop.wearShort !== inventoryWear) return false
            if (q && !(drop.name || '').toLowerCase().includes(q) && !(drop.caseName || '').toLowerCase().includes(q)) return false
            return true
        })
        switch (inventorySort) {
            case 'value': return [...list].sort((a, b) => (Number(b.valueGc) || 0) - (Number(a.valueGc) || 0))
            case 'profit': return [...list].sort((a, b) => (Number(b.profitGc) || 0) - (Number(a.profitGc) || 0))
            case 'float': return [...list].sort((a, b) => (Number(a.float) || 0) - (Number(b.float) || 0))
            case 'name': return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            case 'case': return [...list].sort((a, b) => (a.caseName || '').localeCompare(b.caseName || ''))
            case 'latest':
            default: return [...list].sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0))
        }
    }, [collection.drops, inventoryFavoritesOnly, inventoryFilter, inventoryRarity, inventoryShowArchived, inventorySort, inventoryWear])
    const inventoryPageSize = 48
    const inventoryPageCount = Math.max(1, Math.ceil(inventoryDrops.length / inventoryPageSize))
    const safeInventoryPage = Math.min(inventoryPage, inventoryPageCount)
    const pagedInventoryDrops = inventoryDrops.slice((safeInventoryPage - 1) * inventoryPageSize, safeInventoryPage * inventoryPageSize)

    useEffect(() => {
        setInventoryPage(1)
    }, [inventoryFavoritesOnly, inventoryFilter, inventoryRarity, inventoryShowArchived, inventorySort, inventoryWear])

    const cases = allCases || []
    const categoryCounts = useMemo(() => caseCategoryCounts(cases), [cases])
    const categoryStats = useMemo(() => caseCategoryStats(cases), [cases])
    const activeCategoryMeta = CASE_CATEGORIES.find(c => c.value === category) || CASE_CATEGORIES[0]
    const activeCategoryStats = categoryStats[category] || { count: 0, minPriceGc: 0, maxPriceGc: 0, avgPriceGc: 0, band: 'Budget' }
    const reelPreviewRows = useMemo(() => {
        if (!activeCase?.items?.length) return []
        const premium = activeCase.items
            .slice()
            .sort((a, b) => (b.valueGc || b.multiplier || 0) - (a.valueGc || a.multiplier || 0))
        const mixed = activeCase.items.slice()
        return Array.from({ length: REEL_PREVIEW_ROWS }, (_, rowIndex) => (
            Array.from({ length: REEL_PREVIEW_TILES }, (_, tileIndex) => {
                const source = tileIndex % 5 === 0 ? premium : mixed
                return source[(tileIndex * 3 + rowIndex * 5) % source.length]
            })
        ))
    }, [activeCase])

    const dropOdds = useMemo(() => (activeCase ? caseDropOdds(activeCase) : []), [activeCase])

    // C-P2-3: lifetime open stats for the active case (opens, total wagered,
    // luckiest drop, net P/L). Read from the collection's per-case ledger so the
    // figures survive the 400-drop history cap.
    const activeCaseStats = useMemo(
        () => (activeCase ? collection.caseStats[activeCase.id] || null : null),
        [activeCase, collection.caseStats],
    )

    // C-P0-2: feed the EV coach real per-case numbers instead of placeholders.
    //  - payoutMultiplier: the case's expected value per unit stake (evGc / open
    //    price). Below 1 reflects the built-in house edge of opening.
    //  - winProbability: weight-normalized chance a single drop is worth at least
    //    the open price (a "break even or better" proxy), using the same drop
    //    weights as the live roll so the figure matches the odds table.
    const educationMetrics = useMemo(() => {
        if (!activeCase) return { winProbability: undefined, payoutMultiplier: undefined }
        const price = Math.max(1, roundGc(activeCase.openPriceGc, 1))
        const ev = Number(activeCase.evGc) || 0
        const payoutMultiplier = price > 0 ? roundGc(ev / price, 0) : undefined
        const items = Array.isArray(activeCase.items) ? activeCase.items : []
        let totalWeight = 0
        let winWeight = 0
        items.forEach(item => {
            const weight = rarityDropWeight(item)
            totalWeight += weight
            const value = Number(item.valueGc) || Number(item.multiplier) || 0
            if (value >= price) winWeight += weight
        })
        const winProbability = totalWeight > 0
            ? Math.min(1, Math.max(0, winWeight / totalWeight))
            : undefined
        return { winProbability, payoutMultiplier }
    }, [activeCase])

    const selectView = useCallback((nextView) => {
        if (running || view === nextView) return
        sfx.play('click', { volume: 0.34 })
        setView(nextView)
    }, [running, sfx, view])

    const selectCategory = useCallback((nextCategory) => {
        if (running || category === nextCategory) return
        sfx.play('click', { volume: 0.32 })
        setCategory(nextCategory)
        const first = filterCasesByCategory(allCases || [], nextCategory)[0]
        if (first) {
            setCaseId(first.id)
            setSearchParams(prev => {
                const next = new URLSearchParams(prev)
                next.set('caseId', first.id)
                return next
            }, { replace: true })
        }
    }, [allCases, category, running, setSearchParams, sfx])

    const selectRows = useCallback((nextRows) => {
        if (running || rows === nextRows) return
        sfx.play('click', { volume: 0.32 })
        setRows(nextRows)
    }, [rows, running, sfx])

    const selectCase = useCallback((nextCaseId) => {
        if (running || caseId === nextCaseId) return
        sfx.play('reveal', { volume: 0.24 })
        setCaseId(nextCaseId)
        // C-P1-2: once the player actively picks a case, collapse the browser so
        // the reel-first stage leads. The browser stays open until this first
        // explicit selection (or an open), and the toggle still reopens it.
        setBrowserCollapsed(true)
        setSearchParams(prev => {
            const next = new URLSearchParams(prev)
            next.set('caseId', nextCaseId)
            return next
        }, { replace: true })
    }, [caseId, running, setSearchParams, sfx])

    const startCaseAuto = useCallback(() => {
        if (running || autoOpen) return
        const nextLeft = autoPreset === 'infinite' ? Infinity : Math.max(1, Number(autoPreset) || 10)
        setAutoRoundsLeft(nextLeft)
        setAutoSessionProfit(0)
        setAutoOpen(true)
        setAutoPanelOpen(false)
        sfx.play('click', { volume: 0.32 })
    }, [autoOpen, autoPreset, running, sfx])

    const stopCaseAuto = useCallback(() => {
        if (autoTimerRef.current) {
            window.clearTimeout(autoTimerRef.current)
            autoTimerRef.current = null
        }
        setAutoOpen(false)
        setAutoRoundsLeft(0)
        sfx.play('click', { volume: 0.28 })
    }, [sfx])

    const exportCaseInventory = useCallback(() => {
        try {
            const blob = new Blob([collection.exportInventory()], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `gampo-cases-inventory-${new Date().toISOString().slice(0, 10)}.json`
            document.body.appendChild(link)
            link.click()
            link.remove()
            URL.revokeObjectURL(url)
            showToast('info', 'Inventory exported', 'Local JSON file created')
        } catch {
            showToast('error', 'Export failed', 'Could not create inventory file')
        }
    }, [collection, showToast])

    const importCaseInventory = useCallback((file) => {
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
            try {
                const result = collection.importInventory(String(reader.result || ''))
                showToast('win', 'Inventory imported', `${result.drops} drops restored`)
            } catch (err) {
                showToast('error', 'Import failed', err?.message || 'Invalid inventory export')
            }
        }
        reader.readAsText(file)
    }, [collection, showToast])

    // C-P1-3: each view passes its own rarity state + setter so history and
    // inventory filter independently.
    const renderRarityFilter = (value, setValue) => (
        <>
            <select className="cases-rarity-select" value={value} onChange={e => { sfx.play('click', { volume: 0.24 }); setValue(e.target.value) }} aria-label="Rarity filter">
                {RARITY_FILTERS.map(option => (
                    <option key={option.value} value={option.value}>{option.selectLabel}</option>
                ))}
            </select>
            <div className="cases-rarity-buttons" role="group" aria-label="Rarity filter">
                {RARITY_FILTERS.map(option => (
                    <button
                        key={option.value}
                        type="button"
                        className={value === option.value ? 'active' : ''}
                        aria-pressed={value === option.value}
                        onClick={() => { sfx.play('click', { volume: 0.24 }); setValue(option.value) }}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </>
    )

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ffd166"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            variant="stake"
            panel={
                <CaseBetRail
                    activeCase={activeCase}
                    balance={balance}
                    casePrice={casePrice}
                    rows={rows}
                    totalStake={totalStake}
                />
            }
            aside={
                <CaseRightPanel
                    activeCase={activeCase}
                    allCases={allCases || []}
                    autoOpen={autoOpen}
                    autoPanelOpen={autoPanelOpen}
                    autoPreset={autoPreset}
                    autoRoundsLeft={autoRoundsLeft}
                    autoSessionProfit={autoSessionProfit}
                    autoSpeed={autoSpeed}
                    autoStopLoss={autoStopLoss}
                    autoStopProfit={autoStopProfit}
                    autoStopRare={autoStopRare}
                    balance={balance}
                    casePrice={casePrice}
                    caseSwitchSearch={caseSwitchSearch}
                    caseUxStats={caseUxStats}
                    collection={collection}
                    inventoryShowArchived={inventoryShowArchived}
                    quickOpen={quickOpen}
                    results={results}
                    rows={rows}
                    running={running}
                    setAutoPanelOpen={setAutoPanelOpen}
                    setAutoPreset={setAutoPreset}
                    setAutoSpeed={setAutoSpeed}
                    setAutoStopLoss={setAutoStopLoss}
                    setAutoStopProfit={setAutoStopProfit}
                    setAutoStopRare={setAutoStopRare}
                    setCaseSwitchSearch={setCaseSwitchSearch}
                    setInventoryShowArchived={setInventoryShowArchived}
                    setQuickOpen={setQuickOpen}
                    setView={setView}
                    selectCase={selectCase}
                    selectRows={selectRows}
                    skipCaseAnimation={skipCaseAnimation}
                    startCaseAuto={startCaseAuto}
                    stopCaseAuto={stopCaseAuto}
                    performPlay={performPlay}
                    totalStake={totalStake}
                    view={view}
                />
            }
        >
            <CoreStageFrame minHeight={620} maxWidth={1080} loading={stageLoading} className="cases-stage-frame">
                <div
                    ref={stageRef}
                    className={`cases-stage case-phase-${casePhase}${running ? ' is-opening' : ''}${results.length > 0 ? ' has-result' : ''}${nearMiss ? ' case-near-miss' : ''}`}
                    style={{
                        '--case-spin-ms': `${quickOpen ? 1320 : CASE_REVEAL_MS}ms`,
                        '--case-tile-gap': `${CASE_TILE_GAP_PX}px`,
                        '--case-tile-px': `${CASE_TILE_PX}px`,
                    }}
                >
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />

                    {view === 'open' && (
                        <>
                            {activeCase && (
                                <section className="cases-selected-case" aria-label="Selected case">
                                    <img src={activeCase.image} alt="" loading="lazy" />
                                    <div className="cases-selected-copy">
                                        <span>{activeCase.categoryLabel || activeCase.type || 'Case'}</span>
                                        <strong>{activeCase.name}</strong>
                                        <em>{activeCase.items.length} possible drops · {activeCase.priceSource === 'csmarket' ? 'market median price' : 'EV-based price'}</em>
                                        <div className="cases-selected-metrics">
                                            <b>EV {formatCredits(activeCase.evGc || 0)}</b>
                                            <b>{activeCase.volatility?.label || casePriceBand(casePrice)}</b>
                                            <b>{casePriceBand(casePrice)}</b>
                                        </div>
                                    </div>
                                    <div className="cases-selected-rares" aria-label="Rare item preview">
                                        {(activeCase.rarePreview || []).map(item => (
                                            <span key={item.id} title={`${item.name} · ${item.rarity || 'Rare'}`} style={{ '--rarity': item.color }}>
                                                <img src={item.image} alt="" loading="lazy" />
                                            </span>
                                        ))}
                                    </div>
                                    <aside>
                                        <span>Open price</span>
                                        <strong>{formatCredits(casePrice)}</strong>
                                        <em>{rows} row{rows > 1 ? 's' : ''} · {formatCredits(totalStake)}</em>
                                    </aside>
                                </section>
                            )}
                            {activeCase && activeCaseStats && activeCaseStats.opens > 0 && (
                                <section className="cases-this-case-stats" aria-label={`Your ${activeCase.name} stats`}>
                                    <header className="cases-this-case-head">
                                        <strong>This case</strong>
                                        <small>your lifetime opens</small>
                                    </header>
                                    <div className="cases-this-case-grid">
                                        <span><small>Opens</small><strong>{activeCaseStats.opens}</strong></span>
                                        <span><small>Wagered</small><strong>{formatCredits(activeCaseStats.totalWageredGc || 0)}</strong></span>
                                        <span className={(activeCaseStats.netGc || 0) >= 0 ? 'pos' : 'neg'}>
                                            <small>Net P/L</small>
                                            <strong>{(activeCaseStats.netGc || 0) >= 0 ? '+' : ''}{formatCredits(activeCaseStats.netGc || 0)}</strong>
                                        </span>
                                        <span>
                                            <small>Luckiest</small>
                                            <strong>{activeCaseStats.luckiest ? formatCredits(activeCaseStats.luckiest.valueGc || 0) : '—'}</strong>
                                        </span>
                                    </div>
                                    {activeCaseStats.luckiest && (
                                        <p className="cases-this-case-lucky" title={activeCaseStats.luckiest.name}>
                                            Best drop: {activeCaseStats.luckiest.statTrak ? 'StatTrak™ ' : ''}{activeCaseStats.luckiest.name}
                                            {activeCaseStats.luckiest.multiplier ? ` · ×${(activeCaseStats.luckiest.multiplier || 0).toFixed(2)}` : ''}
                                        </p>
                                    )}
                                </section>
                            )}
                            {activeCase && dropOdds.length > 0 && (
                                <section className="cases-drop-odds" aria-label={`${activeCase.name} drop odds by rarity`}>
                                    <header className="cases-drop-odds-head">
                                        <strong>Drop odds</strong>
                                        <small>chance per opened drop</small>
                                    </header>
                                    <ul className="cases-drop-odds-list">
                                        {dropOdds.map(row => (
                                            <li key={row.key} className="cases-drop-odds-row" style={{ '--rarity': row.color || 'var(--accent, #ffd166)' }}>
                                                <span className="cases-drop-odds-label">
                                                    <i aria-hidden="true" />
                                                    {row.label}
                                                </span>
                                                <span className="cases-drop-odds-bar" aria-hidden="true">
                                                    <b style={{ width: `${Math.min(100, Math.max(2, row.pct))}%` }} />
                                                </span>
                                                <strong className="cases-drop-odds-pct">{row.pct >= 0.1 ? row.pct.toFixed(2) : row.pct.toFixed(3)}%</strong>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}
                            <div className="cases-room-summary" aria-live="polite">
                                <div>
                                    <span>{activeCategoryMeta.label}</span>
                                    <strong>{activeCategoryStats.count} cases</strong>
                                    <em>{activeCategoryMeta.description}</em>
                                </div>
                                <div className="cases-room-priceband">
                                    <span>{activeCategoryStats.band}</span>
                                    <strong>
                                        {activeCategoryStats.minPriceGc > 0
                                            ? `${formatCredits(activeCategoryStats.minPriceGc)} - ${formatCredits(activeCategoryStats.maxPriceGc)}`
                                            : 'Loading'}
                                    </strong>
                                    <em>category price range</em>
                                </div>
                            </div>
                            <div className="cases-opening-timeline" aria-hidden={!running && results.length === 0}>
                                {CASE_VISIBLE_PHASES.map(phase => (
                                    <span
                                        key={phase}
                                        className={(hasReachedCasePhase(casePhase, phase) || results.length > 0) ? 'active' : ''}
                                    >
                                        <i />
                                        {phase === 'arming' ? 'Unlock' : phase === 'lid' ? 'Lid' : phase === 'spin' ? 'Reel' : phase === 'slowdown' ? 'Slow' : phase === 'land' ? 'Pointer' : 'Reveal'}
                                    </span>
                                ))}
                            </div>
                                <button
                                    type="button"
                                    className="cases-browser-toggle"
                                    aria-expanded={!browserCollapsed}
                                    aria-label={browserCollapsed ? 'Show case browser' : 'Hide case browser'}
                                    onClick={() => setBrowserCollapsed(v => !v)}
                                >
                                    {browserCollapsed
                                        ? `Change case (${activeCategoryStats.count} in ${activeCategoryMeta.label})`
                                        : 'Hide case browser'}
                                </button>
                                {!browserCollapsed && (
                                <>
                                <div className="cases-category-row">
                                    {CASE_CATEGORIES.map(c => (
                                    <button key={c.value} className={`cases-category-chip ${category === c.value ? 'active' : ''}`} disabled={running} onClick={() => selectCategory(c.value)} aria-label={`${c.label} cases`} aria-pressed={category === c.value}>
                                        <span>{c.label}</span>
                                        <strong>{categoryCounts[c.value] || 0}</strong>
                                        <em>{categoryStats[c.value]?.band || 'Budget'}</em>
                                    </button>
                                ))}
                                <input
                                    type="search"
                                    className="cases-search cases-grid-search"
                                    placeholder="Filter cases..."
                                    aria-label="Filter cases"
                                    value={caseGridSearch}
                                    onChange={e => setCaseGridSearch(e.target.value)}
                                />
                            </div>
                            {activeCase && reelPreviewRows.length > 0 && tracks.length === 0 && (
                                <section className="cases-market-reel" aria-label={`${activeCase.name} drop reel preview`}>
                                    <header className="cases-market-reel-head">
                                        <span>{activeCase.items.length} possible drops</span>
                                        <strong>{activeCase.name}</strong>
                                        <em>{formatCredits(casePrice)} open · EV {formatCredits(activeCase.evGc || 0)}</em>
                                    </header>
                                    <div className="cases-market-reel-window" aria-hidden="true">
                                        {reelPreviewRows.map((row, rowIndex) => (
                                            <div
                                                key={`preview-${activeCase.id}-${rowIndex}`}
                                                className="cases-preview-row"
                                                style={{
                                                    '--row-offset': `${-56 - rowIndex * 22}px`,
                                                    '--row-duration': `${34 + rowIndex * 5}s`,
                                                }}
                                            >
                                                {row.map((item, itemIndex) => (
                                                    <span
                                                        key={`${rowIndex}-${itemIndex}-${item.id}`}
                                                        className="cases-preview-tile"
                                                        style={{ '--rarity': item.color }}
                                                    >
                                                        <img src={item.image} alt="" loading="lazy" />
                                                        <em>{formatCredits(item.valueGc || item.multiplier || 0)}</em>
                                                    </span>
                                                ))}
                                            </div>
                                        ))}
                                        <span className="cases-market-pointer" />
                                    </div>
                                </section>
                            )}
                            <div className="cases-case-grid" aria-busy={stageLoading || !allCases}>
                                {(stageLoading || !allCases) && categoryCases.length === 0 ? (
                                    Array.from({ length: 8 }).map((_, i) => (
                                        <div key={`case-skeleton-${i}`} className="cases-case-card cases-case-skeleton" aria-hidden="true">
                                            <span className="cases-skeleton-img" />
                                            <span className="cases-skeleton-line short" />
                                            <span className="cases-skeleton-line" />
                                        </div>
                                    ))
                                ) : categoryCases.map(c => (
                                    <button
                                        key={c.id}
                                        className={`cases-case-card ${activeCase?.id === c.id ? 'active' : ''} ${(casePhase === 'arming' || casePhase === 'lid') && activeCase?.id === c.id ? 'is-lifting' : ''}`}
                                        disabled={running}
                                        onClick={() => selectCase(c.id)}
                                        title={`${c.name} · ${formatCredits(c.openPriceGc || 0)} · ${c.items.length} items · EV ${formatCredits(c.evGc || 0)} · ${c.volatility?.label || 'volatility'}`}
                                    >
                                        <img src={c.image} alt={c.name} loading="lazy" />
                                        <strong className="cases-case-price">{formatCredits(c.openPriceGc || 0)}</strong>
                                        <span title={c.name}>{c.name}</span>
                                        <em>{casePriceBand(c.openPriceGc)} · {c.items.length} items · {c.type || 'Case'}</em>
                                        <div className="cases-case-metrics" aria-label="Expected value and volatility">
                                            <b>EV {formatCredits(c.evGc || 0)}</b>
                                            <b>{c.volatility?.label || 'Stable'}</b>
                                        </div>
                                        <div className="cases-rare-preview" aria-label="Rare item preview">
                                            {(c.rarePreview || []).slice(0, 3).map(item => (
                                                <i key={item.id} title={`${item.name} · ${item.rarity || 'Rare'}`} style={{ '--rarity': item.color }}>
                                                    <img src={item.image} alt="" loading="lazy" />
                                                </i>
                                            ))}
                                        </div>
                                    </button>
                                ))}
                            </div>
                            </>
                            )}
                            <div className="cases-reel-area" ref={reelAreaRef}>
                            {tracks.length > 0 && rows === 10 && (
                                <CaseMultiOpenGrid
                                    activeCase={activeCase}
                                    casePhase={casePhase}
                                    results={results}
                                    trackOffsets={trackOffsets}
                                    tracks={tracks}
                                    settledRows={settledRows}
                                    finaleRow={finaleRow}
                                />
                            )}
                            {tracks.length > 0 && rows !== 10 && (
                                <div className="cases-rows" data-case-layout="stacked-rows">
                                    {tracks.map((track, ti) => (
                                        <div key={ti} className="cases-carousel-frame" data-case-row-index={ti}>
                                            <div
                                                className={`cases-carousel-track${settling ? ' is-settling' : ''}`}
                                                style={{ transform: `translate(${trackOffsets[ti] || 0}px, -50%)` }}
                                            >
                                                {track.map((item, idx) => {
                                                    const isTarget = idx === CASE_PRIZE_INDEX
                                                    const targetReady = isTarget && (hasReachedCasePhase(casePhase, 'reveal') || results.length > 0)
                                                    return (
                                                        <CaseReelTile
                                                            key={`${ti}-${idx}-${item.id}-${item.variantKey || 'base'}`}
                                                            item={item}
                                                            rowIndex={ti}
                                                            tileIndex={idx}
                                                            targetReady={targetReady}
                                                            isPrize={isTarget && results.length > 0}
                                                        />
                                                    )
                                                })}
                                            </div>
                                            <span className="cases-carousel-pointer" />
                                        </div>
                                    ))}
                                </div>
                            )}
                            {results.length > 0 && (
                                <div className="cases-results-panel" aria-live="polite" ref={resultsPanelRef}>
                                    {settlementSummary && (
                                        <div className="cases-round-summary">
                                            <span>
                                                <small>Rows</small>
                                                <strong>{settlementSummary.resultCount}/{settlementSummary.rows}</strong>
                                            </span>
                                            <span>
                                                <small>Total stake</small>
                                                <strong>{formatCredits(settlementSummary.stake)}</strong>
                                            </span>
                                            <span>
                                                <small>Total return</small>
                                                <strong>{formatCredits(settlementSummary.totalReturn)}</strong>
                                            </span>
                                            <span className={settlementSummary.profit >= 0 ? 'pos' : 'neg'}>
                                                <small>P/L</small>
                                                <strong>{settlementSummary.profit >= 0 ? '+' : ''}{formatCredits(settlementSummary.profit)}</strong>
                                            </span>
                                        </div>
                                    )}
                                    <div className="cases-result-row">
                                        {results.map((r, i) => (
                                            <div
                                                key={i}
                                                className={`cases-result-card ${results.length === 1 ? 'single' : ''} ${RARE_TIERS.has(r.rarity) ? 'rare' : ''} ${r.statTrak ? 'stattrak' : ''} ${r.souvenir ? 'souvenir' : ''}`}
                                                style={{ '--rarity': r.color }}
                                                data-case-row-index={i}
                                                data-case-outcome-id={r.skinId || r.id}
                                                data-case-outcome-variant={r.variantKey || ''}
                                            >
                                                <img src={r.image} alt={r.name} />
                                                <div className="cases-result-badges">
                                                    {r.statTrak && <b className="stattrak">StatTrak™</b>}
                                                    {r.souvenir && <b className="souvenir">Souvenir</b>}
                                                    {r.rarity && <b>{r.rarity}</b>}
                                                </div>
                                                <small>{r.name}</small>
                                                <span className="cases-result-meta">
                                                    <em>{r.wearShort} · {r.float?.toFixed(3) ?? '—'}</em>
                                                    <strong>{formatCredits(r.valueGc || 0)}</strong>
                                                </span>
                                                <span className={`cases-result-profit ${(r.profitGc || 0) >= 0 ? 'pos' : 'neg'}`}>
                                                    {(r.profitGc || 0) >= 0 ? '+' : ''}{formatCredits(r.profitGc || 0)}
                                                </span>
                                                {Number.isFinite(r.nonce) && (
                                                    <span className="cases-result-nonce" title={`Deterministic seed+nonce for this drop · nonce ${r.nonce}`}>
                                                        nonce #{r.nonce}
                                                    </span>
                                                )}
                                                {RARE_TIERS.has(r.rarity) && (
                                                    <span className="cases-particles" aria-hidden>
                                                        {Array.from({ length: 14 }).map((_, p) => (
                                                            <i key={p} style={{ '--dx': `${(Math.cos(p * 0.448) * 80).toFixed(0)}px`, '--dy': `${(Math.sin(p * 0.448) * 80).toFixed(0)}px`, '--delay': `${p * 22}ms` }} />
                                                        ))}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            </div>
                            <div className="cases-stack-row">
                                <MultiplierBadge label="Rows" value={rows} suffix="" size="sm" state={running ? 'active' : 'idle'} />
                                {activeCase && (
                                    <>
                                        <span className="cases-stack-pill">Case {formatCredits(casePrice)}</span>
                                        <span className="cases-stack-pill">Total {formatCredits(totalStake)}</span>
                                        <span className="cases-stack-pill">{quickOpen ? 'Quick open' : 'Full spin'}</span>
                                        <span className="cases-stack-pill">{autoOpen ? 'Auto armed' : 'Manual'}</span>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                                            {activeCase.items.length} skins · {activeCase.type || 'Case'}
                                        </span>
                                    </>
                                )}
                            </div>
                            <CaseFairnessPanel refreshKey={fairnessKey} />
                            {celebrationDrop && (
                                <div className="cases-prize-popover" style={{ '--rarity': celebrationDrop.color }} role="status" aria-label="Rare drop">
                                    <div className="cases-prize-card">
                                        <img src={celebrationDrop.image} alt={celebrationDrop.name} />
                                        <span>
                                            {celebrationDrop.statTrak && <em>StatTrak™ </em>}
                                            {celebrationDrop.souvenir && <em>Souvenir </em>}
                                            {celebrationDrop.name}
                                        </span>
                                        <strong>{formatCredits(celebrationDrop.valueGc || 0)}</strong>
                                        <small>{(celebrationDrop.profitGc || 0) >= 0 ? '+' : ''}{formatCredits(celebrationDrop.profitGc || 0)} vs open</small>
                                        <span className="cases-particles" aria-hidden>
                                            {Array.from({ length: 18 }).map((_, p) => (
                                                <i key={p} style={{ '--dx': `${(Math.cos(p * 0.349) * 92).toFixed(0)}px`, '--dy': `${(Math.sin(p * 0.349) * 92).toFixed(0)}px`, '--delay': `${p * 18}ms` }} />
                                            ))}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {view === 'history' && (
                        <div className="cases-history">
                            <header className="cases-history-head">
                                <strong>Drop history</strong>
                                <small>last {Math.min(collection.drops.length, 400)} drops</small>
                                {collection.drops.length > 0 && (
                                    <button className="cases-reset-btn" onClick={() => collection.reset()}>Reset</button>
                                )}
                            </header>
                            <div className="cases-filters">
                                <input
                                    type="search"
                                    className="cases-search"
                                    value={historyFilter}
                                    onChange={e => setHistoryFilter(e.target.value)}
                                    placeholder="Filter by skin name..."
                                />
                                {renderRarityFilter(historyRarityFilter, setHistoryRarityFilter)}
                            </div>
                            {filteredDrops.length === 0 ? (
                                <p className="cases-empty">{collection.drops.length === 0 ? 'No drops yet. Open a case to start filling the collection.' : 'No drops match those filters.'}</p>
                            ) : (
                                <ul className="cases-history-list">
                                    {filteredDrops.map((d, i) => (
                                        <li key={`${d.key}-${d.ts}-${i}`} className={RARE_TIERS.has(d.rarity) ? 'rare' : ''} style={{ '--rarity': d.color }}>
                                            <img src={d.image} alt={d.name} loading="lazy" />
                                            <span className="cases-history-name">
                                                {d.statTrak && <em className="cases-tag-st">ST™</em>}
                                                {d.souvenir && <em className="cases-tag-sv">SV</em>}
                                                {d.name}
                                            </span>
                                            <span className="cases-history-rarity">{d.rarity || ''}</span>
                                            <span className="cases-history-wear">{d.wearShort} · {d.float?.toFixed(3) ?? '—'}</span>
                                            <span className="cases-history-case">{d.caseName || ''}</span>
                                            <strong>{d.valueGc ? formatCredits(d.valueGc) : `×${(d.multiplier || 0).toFixed(2)}`}</strong>
                                            <em>{formatRelative(d.ts)}</em>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {view === 'pokedex' && (
                        <div className="cases-inventory-view">
                            <header className="cases-inventory-head">
                                <div>
                                    <strong>Inventory</strong>
                                    <small>
                                        {collection.summary.activeDrops} active drops · {collection.summary.archivedDrops} archived · {formatCredits(collection.summary.totalValueGc || 0)} lifetime value
                                    </small>
                                </div>
                                <div className="cases-inventory-actions">
                                    <button type="button" data-inventory-action="export" onClick={exportCaseInventory}>Export</button>
                                    <label data-inventory-action="import">
                                        Import
                                        <input type="file" accept="application/json,.json" onChange={e => { importCaseInventory(e.target.files?.[0]); e.target.value = '' }} />
                                    </label>
                                    <button type="button" data-inventory-action="archive" onClick={() => collection.removeJunk()}>
                                        Remove junk
                                    </button>
                                    {collection.drops.length > 0 && (
                                        <button type="button" data-inventory-action="reset" onClick={() => collection.reset()}>Reset</button>
                                    )}
                                </div>
                            </header>
                            <div className="cases-inventory-kpis" aria-label="Inventory summary">
                                <span><small>Items</small><strong>{collection.summary.activeDrops}</strong></span>
                                <span><small>Favorites</small><strong>{collection.summary.favoriteDrops}</strong></span>
                                <span><small>Archived</small><strong>{collection.summary.archivedDrops}</strong></span>
                                <span><small>Variants</small><strong>{collection.summary.uniqueVariants}</strong></span>
                                <span><small>Best</small><strong>{formatCredits(collection.summary.bestValueGc || 0)}</strong></span>
                            </div>
                            <div className="cases-inventory-chips" aria-label="Inventory rarity filters">
                                <button type="button" className={inventoryRarity === 'all' ? 'active' : ''} onClick={() => setInventoryRarity('all')}>All</button>
                                {inventoryRarityRows.map(row => (
                                    <button key={row.value} type="button" className={inventoryRarity === row.value ? 'active' : ''} onClick={() => setInventoryRarity(row.value)}>
                                        {row.label} <b>{row.count}</b>
                                    </button>
                                ))}
                            </div>
                            <div className="cases-inventory-chips wear" aria-label="Inventory wear filters">
                                <button type="button" className={inventoryWear === 'all' ? 'active' : ''} onClick={() => setInventoryWear('all')}>All wear</button>
                                {inventoryWearRows.map(row => (
                                    <button key={row.label} type="button" className={inventoryWear === row.label ? 'active' : ''} onClick={() => setInventoryWear(row.label)}>
                                        {row.label} <b>{row.count}</b>
                                    </button>
                                ))}
                            </div>
                            <div className="cases-inventory-toolbar">
                                <input
                                    type="search"
                                    className="cases-search"
                                    aria-label="Search inventory"
                                    value={inventoryFilter}
                                    onChange={e => setInventoryFilter(e.target.value)}
                                    placeholder="Search inventory..."
                                />
                                <select className="cases-rarity-select" value={inventorySort} onChange={e => setInventorySort(e.target.value)} aria-label="Sort inventory">
                                    <option value="latest">Latest</option>
                                    <option value="value">Highest value</option>
                                    <option value="profit">Best profit</option>
                                    <option value="float">Lowest float</option>
                                    <option value="name">Name</option>
                                    <option value="case">Case source</option>
                                </select>
                                <button type="button" className={inventoryFavoritesOnly ? 'active' : ''} onClick={() => setInventoryFavoritesOnly(v => !v)}>
                                    Favorites
                                </button>
                                <button type="button" className={inventoryShowArchived ? 'active' : ''} onClick={() => setInventoryShowArchived(v => !v)}>
                                    Archive
                                </button>
                            </div>
                            {pagedInventoryDrops.length === 0 ? (
                                <p className="cases-empty">{collection.drops.length === 0 ? 'Inventory empty. Open cases to start collecting drops.' : 'No inventory items match those filters.'}</p>
                            ) : (
                                <>
                                    <div className="cases-inventory-grid">
                                        {pagedInventoryDrops.map(drop => (
                                            <article
                                                key={drop.dropId}
                                                className={`cases-inventory-card ${RARE_TIERS.has(drop.rarity) ? 'rare' : ''} ${drop.favorite ? 'favorite' : ''} ${drop.archived ? 'archived' : ''}`}
                                                style={{ '--rarity': drop.color }}
                                                title={`${drop.name} · ${drop.wear} · ${drop.caseName || 'Case'}`}
                                            >
                                                <button
                                                    type="button"
                                                    className="cases-inventory-favorite"
                                                    data-inventory-action="favorite"
                                                    aria-pressed={!!drop.favorite}
                                                    aria-label={drop.favorite ? 'Remove favorite' : 'Favorite item'}
                                                    onClick={() => collection.toggleFavorite(drop.dropId)}
                                                >
                                                    {drop.favorite ? '★' : '☆'}
                                                </button>
                                                <strong>{formatCredits(drop.valueGc || 0)}</strong>
                                                <img src={drop.image} alt={drop.name} loading="lazy" />
                                                <small>
                                                    {drop.statTrak && <em className="cases-tag-st">ST™</em>}
                                                    {drop.souvenir && <em className="cases-tag-sv">SV</em>}
                                                    {drop.name}
                                                </small>
                                                <span className="cases-inventory-meta">
                                                    <b>{drop.rarity}</b>
                                                    <em>{drop.wearShort} · {drop.float?.toFixed(3) ?? '—'}</em>
                                                </span>
                                                <span className="cases-inventory-source">{drop.caseName || 'Case'} · {formatRelative(drop.ts)}</span>
                                                <button
                                                    type="button"
                                                    className="cases-inventory-archive"
                                                    data-inventory-action={drop.archived ? 'restore' : 'archive'}
                                                    onClick={() => drop.archived ? collection.restoreDrop(drop.dropId) : collection.archiveDrop(drop.dropId)}
                                                >
                                                    {drop.archived ? 'Restore' : 'Archive'}
                                                </button>
                                            </article>
                                        ))}
                                    </div>
                                    <div className="cases-inventory-pager">
                                        <button type="button" disabled={safeInventoryPage <= 1} onClick={() => setInventoryPage(page => Math.max(1, page - 1))}>Prev</button>
                                        <span>{safeInventoryPage} / {inventoryPageCount}</span>
                                        <button type="button" disabled={safeInventoryPage >= inventoryPageCount} onClick={() => setInventoryPage(page => Math.min(inventoryPageCount, page + 1))}>Next</button>
                                    </div>
                                </>
                            )}
                            {showLocked && lockedSkins.length > 0 && (
                                <details className="cases-locked-catalog">
                                    <summary>{collectionLockedCount} locked catalog skins</summary>
                                    <div className="cases-collection-grid">
                                        {lockedSkins.slice(0, 48).map(skin => (
                                            <div key={skin.key} className="cases-skin-card cases-skin-locked" style={{ '--rarity': skin.color }} aria-label={`Locked skin ${skin.name}`}>
                                                <img src={skin.image} alt={skin.name} loading="lazy" />
                                                <small className="cases-locked-name">{skin.name}</small>
                                                <span className="cases-skin-meta">
                                                    <em>{skin.rarity}</em>
                                                    <strong>locked</strong>
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>
                    )}

                    <ActionLockOverlay active={running} label={casePhaseLabel(casePhase, rows)} />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('cases')} />
            <EducationPanel definition={definition} betAmount={casePrice} winProbability={educationMetrics.winProbability} payoutMultiplier={educationMetrics.payoutMultiplier} balance={balance} recentProfit={recentProfit} />
            {dockPortal && view === 'open' && createPortal(
                <div className="cases-mobile-dock" data-cases-mobile-dock data-ux-surface="dock">
                    <button
                        type="button"
                        className={`cases-mobile-quick ${quickOpen ? 'active' : ''}`}
                        aria-pressed={quickOpen}
                        disabled={running}
                        onClick={() => setQuickOpen(v => !v)}
                    >
                        <span>Quick</span>
                        <strong>{quickOpen ? 'On' : 'Off'}</strong>
                    </button>
                    <div className="cases-mobile-summary">
                        <span>{activeCase?.name || 'Loading case'}</span>
                        <strong>×{rows} · {formatCredits(totalStake)}</strong>
                    </div>
                    {running ? (
                        <button
                            type="button"
                            className="cases-mobile-open cases-mobile-skip"
                            data-cases-mobile-action="case-skip"
                            data-mobile-hit-target="primary"
                            onClick={skipCaseAnimation}
                        >
                            Skip
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="cases-mobile-open"
                            data-cases-mobile-open
                            data-cases-mobile-action={results.length > 0 ? 'case-open-again' : 'case-open'}
                            data-mobile-hit-target="primary"
                            onClick={() => performPlay({ betAmount: casePrice })}
                            disabled={!activeCase || balance < totalStake}
                        >
                            {results.length > 0 ? `Open again ×${rows}` : `Open ×${rows}`}
                        </button>
                    )}
                </div>,
                dockPortal,
            )}
        </GameShell>
    )
}
