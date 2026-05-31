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
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { useCaseCollection } from '../../../hooks/useCaseCollection'
import { useCsCollection } from '../../../hooks/useCsCollection'
import { recordCaseDrop as recordProgressCaseDrop } from '../../../hooks/useProgress'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import {
    BetPanel,
    BigWinOverlay,
    GameShell,
    HistoryDrawer,
    RecentResultsStrip,
    StatsOverlay,
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
    hasReachedCasePhase,
    pickCelebrationDrop,
    summarizeCaseSettlement,
} from './casesAnimation'
import { createCaseOpeningRound } from './caseOpening'
import {
    CASE_CATEGORIES,
    caseCategoryCounts,
    caseCategoryStats,
    casePriceBand,
    filterCasesByCategory,
    normalizeCaseForRuntime,
    roundGc,
    roundSignedGc,
} from './caseEconomy'
import './cases.css'
import { useGameBgm } from '../../../audio/useBgm'

const ROW_OPTIONS = [1, 3, 5, 10]
const REEL_PREVIEW_ROWS = 5
const REEL_PREVIEW_TILES = 18
const CASE_REEL_START_OFFSET = -((CASE_TILE_PX + CASE_TILE_GAP_PX) * 4)
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
}) {
    const revealReady = hasReachedCasePhase(casePhase, 'reveal') || results.length > 0
    return (
        <div className="cases-multi-open-grid" data-case-layout="multi-grid" aria-label="Bulk case opening reels">
            {tracks.map((track, rowIndex) => {
                const result = results[rowIndex]
                const target = track[CASE_PRIZE_INDEX] || result || track[0]
                const isRare = result && RARE_TIERS.has(result.rarity)
                const profit = Number(result?.profitGc) || 0
                return (
                    <article
                        key={`bulk-${rowIndex}-${target?.variantKey || target?.id || rowIndex}`}
                        className={`cases-multi-slot ${result ? 'is-settled' : ''} ${isRare ? 'rare' : ''} ${result?.statTrak ? 'stattrak' : ''} ${result?.souvenir ? 'souvenir' : ''}`}
                        style={{ '--rarity': result?.color || target?.color || '#ffd166' }}
                        data-case-row-index={rowIndex}
                        data-case-outcome-id={result?.skinId || result?.id || target?.skinId || target?.id || ''}
                        data-case-outcome-variant={result?.variantKey || target?.variantKey || ''}
                    >
                        <header className="cases-multi-slot-head">
                            <span>#{rowIndex + 1}</span>
                            <strong>{activeCase?.name || 'Case'}</strong>
                            <em>{result ? 'Landed' : casePhaseLabel(casePhase, 1)}</em>
                        </header>
                        <div className="cases-mini-reel-frame">
                            <div
                                className="cases-carousel-track cases-mini-reel-track"
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

export default function CasesGame() {
    const definition = findGameDefinition('cases') || { name: 'Cases', category: 'Arcade originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('cases')
    const session = useGameSession('cases')
    const preloader = useOriginalsPreloader('cases')
    const csCatalog = useCsCollection()
    const collection = useCaseCollection({ catalogTotal: csCatalog.catalog?.totalSkins || 0 })

    const [allCases, setAllCases] = useState(null)
    const [category, setCategory] = useState('popular')
    const [caseId, setCaseId] = useState(null)
    const [rows, setRows] = useState(1)
    const [running, setRunning] = useState(false)
    const [tracks, setTracks] = useState([]) // [[item, item, ...], ...]
    const [trackOffsets, setTrackOffsets] = useState([])
    const [results, setResults] = useState([]) // resolved drops list (with wear/statTrak)
    const [casePhase, setCasePhase] = useState('idle') // idle | arming | lid | spin | slowdown | land | reveal | settled
    const [quickOpen, setQuickOpen] = useState(false)
    const [autoOpen, setAutoOpen] = useState(false)
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
    const [rarityFilter, setRarityFilter] = useState('all')
    const [pokedexSort, setPokedexSort] = useState('value')
    const [caseGridSearch, setCaseGridSearch] = useState('')
    const tickRef = useRef({ ids: [], landId: null })
    const revealTimersRef = useRef([])
    const autoTimerRef = useRef(null)
    const pendingRoundRef = useRef(null)
    const celebrationTimerRef = useRef(null)
    const resultsPanelRef = useRef(null)
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
            const first = filterCasesByCategory(normalized, 'popular')[0] || normalized[0]
            if (first) setCaseId(first.id)
        }).catch(err => {
            // eslint-disable-next-line no-console
            console.warn('[cases] manifest load failed', err)
        })
        return () => { cancelled = true }
    }, [])

    const categoryCases = useMemo(() => {
        const list = filterCasesByCategory(allCases || [], category)
        const q = caseGridSearch.trim().toLowerCase()
        return q ? list.filter(c => c.name.toLowerCase().includes(q)) : list
    }, [allCases, category, caseGridSearch])

    const activeCase = useMemo(() => (allCases || []).find(c => c.id === caseId) || categoryCases[0], [allCases, caseId, categoryCases])
    const casePrice = activeCase ? Math.max(1, roundGc(activeCase.openPriceGc, 1)) : 5
    const totalStake = roundGc(casePrice * rows, casePrice)

    useEffect(() => {
        if (activeCase && !categoryCases.some(c => c.id === activeCase.id)) {
            const fresh = categoryCases[0]
            if (fresh) setCaseId(fresh.id)
        }
    }, [categoryCases, activeCase])

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
        if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current)
        if (celebrationTimerRef.current) window.clearTimeout(celebrationTimerRef.current)
    }, [clearRevealTimers])

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
            }, at)
            ids.push(id)
        }
        tickRef.current.ids = ids
        if (tickRef.current.landId) window.clearTimeout(tickRef.current.landId)
        tickRef.current.landId = window.setTimeout(() => {
            sfx.play('land', { volume: 0.85 })
        }, Math.max(60, durationMs - 40))
    }, [sfx])

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
        const celebrate = pickCelebrationDrop(picks)
        setCelebrationDrop(celebrate)
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
    }, [addWinnings, clearRevealTimers, collection, machine, playSound, session, showToast, sfx])

    const skipCaseAnimation = useCallback(() => {
        if (!pendingRoundRef.current || pendingRoundRef.current.settled) return
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
        setCasePhase('arming')
        playSound('click')
        sfx.play('open', { volume: 0.65 })
        sfx.play('click')
        setView('open')

        const round = createCaseOpeningRound({
            caseData: activeCase,
            rows,
            stake,
            unitPrice,
            targetIndex: CASE_PRIZE_INDEX,
        })
        const picks = round.outcomes
        const newTracks = round.tracks
        const finalOffsets = round.offsets
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
            setTrackOffsets(newTracks.map(() => CASE_REEL_START_OFFSET))
            sfx.play('multispin', { volume: rows >= 3 ? 0.62 : 0.36 })
            queueRevealTimer(() => {
                if (!pendingRoundRef.current || pendingRoundRef.current.settled) return
                setTrackOffsets(finalOffsets)
            }, 32)
            scheduleTickSfx(revealMs)
        }, lidMs)

        queueRevealTimer(() => {
            if (!pendingRoundRef.current || pendingRoundRef.current.settled) return
            setCasePhase('slowdown')
        }, lidMs + Math.max(90, revealMs * 0.58))

        queueRevealTimer(() => {
            if (!pendingRoundRef.current || pendingRoundRef.current.settled) return
            setCasePhase('land')
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
        if (!autoOpen || running || casePhase !== 'settled' || !activeCase) return undefined
        if (balance < totalStake) {
            setAutoOpen(false)
            showToast('error', 'Auto stopped', `Need ${formatCredits(totalStake)}`)
            return undefined
        }
        autoTimerRef.current = window.setTimeout(() => {
            autoTimerRef.current = null
            performPlay({ betAmount: casePrice })
        }, quickOpen ? 360 : 900)
        return () => {
            if (autoTimerRef.current) {
                window.clearTimeout(autoTimerRef.current)
                autoTimerRef.current = null
            }
        }
    }, [activeCase, autoOpen, balance, casePhase, casePrice, quickOpen, running, showToast, totalStake])

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
            if (rarityFilter !== 'all' && d.rarity !== rarityFilter) return false
            if (q && !(d.name || '').toLowerCase().includes(q) && !(d.caseName || '').toLowerCase().includes(q)) return false
            return true
        })
    }, [collection.drops, historyFilter, rarityFilter])

    const filteredPokedex = useMemo(() => {
        const q = pokedexFilter.trim().toLowerCase()
        const list = pokedexList.filter(s => {
            if (rarityFilter !== 'all' && s.rarity !== rarityFilter) return false
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
    }, [pokedexList, pokedexFilter, rarityFilter, pokedexSort])

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
            if (rarityFilter !== 'all' && skin.rarity?.name !== rarityFilter) continue
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
    }, [showLocked, csCatalog.loaded, csCatalog.catalog, pokedexList, rarityFilter, pokedexFilter])
    const collectionTotalSkins = csCatalog.loaded ? csCatalog.catalog.totalSkins : collection.summary.uniqueVariants
    const collectionLockedCount = Math.max(0, (collectionTotalSkins || 0) - collection.summary.uniqueVariants)

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

    const selectView = useCallback((nextView) => {
        if (running || view === nextView) return
        sfx.play('click', { volume: 0.34 })
        setView(nextView)
    }, [running, sfx, view])

    const selectCategory = useCallback((nextCategory) => {
        if (running || category === nextCategory) return
        sfx.play('click', { volume: 0.32 })
        setCategory(nextCategory)
    }, [category, running, sfx])

    const selectRows = useCallback((nextRows) => {
        if (running || rows === nextRows) return
        sfx.play('click', { volume: 0.32 })
        setRows(nextRows)
    }, [rows, running, sfx])

    const selectCase = useCallback((nextCaseId) => {
        if (running || caseId === nextCaseId) return
        sfx.play('reveal', { volume: 0.24 })
        setCaseId(nextCaseId)
    }, [caseId, running, sfx])

    const renderRarityFilter = () => (
        <>
            <select className="cases-rarity-select" value={rarityFilter} onChange={e => { sfx.play('click', { volume: 0.24 }); setRarityFilter(e.target.value) }} aria-label="Rarity filter">
                {RARITY_FILTERS.map(option => (
                    <option key={option.value} value={option.value}>{option.selectLabel}</option>
                ))}
            </select>
            <div className="cases-rarity-buttons" role="group" aria-label="Rarity filter">
                {RARITY_FILTERS.map(option => (
                    <button
                        key={option.value}
                        type="button"
                        className={rarityFilter === option.value ? 'active' : ''}
                        aria-pressed={rarityFilter === option.value}
                        onClick={() => { sfx.play('click', { volume: 0.24 }); setRarityFilter(option.value) }}
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
                <BetPanel
                    balance={balance}
                    initialBet={casePrice}
                    fixedBetAmount={casePrice}
                    betLabel="Case price"
                    runningRound={running}
                    actionLabel={activeCase ? `OPEN ${rows > 1 ? `×${rows}` : '×1'} (${formatCredits(totalStake)})` : 'Loading...'}
                    onPlay={performPlay}
                    lastBet={lastBet}
                    disableAuto
                    playButtonProps={{
                        'data-game-action': 'case-open',
                        'data-testid': 'case-open-cta',
                        'aria-label': activeCase ? `Open ${rows} ${rows === 1 ? 'case row' : 'case rows'} for ${formatCredits(totalStake)}` : 'Open case loading',
                    }}
                    afterPlayChildren={
                        <>
                            <div className="bp-section cases-skip-section">
                                <label className="bp-label">Animation</label>
                                <button
                                    className="cases-skip-btn"
                                    disabled={!running || !pendingRoundRef.current}
                                    onClick={skipCaseAnimation}
                                    type="button"
                                    aria-label="Skip case opening animation"
                                >
                                    Skip animation
                                </button>
                                <p className="bp-hint">Instantly settles the same practice round and keeps the drop record.</p>
                            </div>
                            <div className="bp-section cases-collection-panel">
                                <label className="bp-label">Collection</label>
                                <div className="bp-row" style={{ flexWrap: 'wrap' }}>
                                    <span className="cases-stat-pill">
                                        <small>Drops</small><strong>{collection.summary.totalDrops}</strong>
                                    </span>
                                    <span className="cases-stat-pill">
                                        <small>Variants</small><strong>{collection.summary.uniqueVariants}</strong>
                                    </span>
                                    <span className="cases-stat-pill">
                                        <small>Best</small><strong>×{collection.summary.bestMultiplier.toFixed(2)}</strong>
                                    </span>
                                    <span className="cases-stat-pill">
                                        <small>Value</small><strong>{formatCredits(collection.summary.totalValueGc || 0)}</strong>
                                    </span>
                                </div>
                                {csCatalog.loaded && (
                                    <div className="cases-pokedex-bar" title={`${collection.summary.uniqueVariants} discovered of ${csCatalog.catalog.totalSkins} skins`}>
                                        <span style={{ width: `${Math.min(100, collection.summary.uniqueVariants / Math.max(1, csCatalog.catalog.totalSkins) * 100)}%` }} />
                                    </div>
                                )}
                            </div>
                        </>
                    }
                >
                    <div className="bp-section">
                        <span className="bp-label" id="cases-category-label">Case type ({categoryCounts[category] || 0} cases)</span>
                        <select
                            className="cases-panel-select"
                            value={category}
                            disabled={running}
                            aria-labelledby="cases-category-label"
                            onChange={e => selectCategory(e.target.value)}
                        >
                            {CASE_CATEGORIES.map(c => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                        </select>
                        <p className="bp-hint">{activeCategoryMeta.description}</p>
                    </div>
                    <div className="bp-section">
                        <span className="bp-label" id="cases-rows-label">Rows ({rows})</span>
                        <div className="bp-row" role="group" aria-labelledby="cases-rows-label">
                            {ROW_OPTIONS.map(n => (
                                <button key={n} className={`bp-bet-btn ${rows === n ? 'active' : ''}`} disabled={running} onClick={() => selectRows(n)} aria-pressed={rows === n}>{n}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-bal-line">
                        <span>Total stake</span>
                        <strong>{formatCredits(totalStake)}</strong>
                    </div>
                </BetPanel>
            }
            aside={
                <>
                    <StatsOverlay stats={session.stats} definition={definition} />
                    <HistoryDrawer history={session.history} onClear={session.clear} />
                </>
            }
        >
            <CoreStageFrame minHeight={620} maxWidth={1080} loading={stageLoading} className="cases-stage-frame">
                <div
                    className={`cases-stage case-phase-${casePhase}${running ? ' is-opening' : ''}${results.length > 0 ? ' has-result' : ''}`}
                    style={{
                        '--case-spin-ms': `${quickOpen ? 1320 : CASE_REVEAL_MS}ms`,
                        '--case-tile-gap': `${CASE_TILE_GAP_PX}px`,
                        '--case-tile-px': `${CASE_TILE_PX}px`,
                    }}
                >
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />

                    <div className="cases-view-tabs">
                        <button className={view === 'open' ? 'active' : ''} onClick={() => selectView('open')} disabled={running}>Open</button>
                        <button className={view === 'history' ? 'active' : ''} onClick={() => selectView('history')} disabled={running}>
                            History {collection.drops.length > 0 && <em>{collection.drops.length}</em>}
                        </button>
                        <button className={view === 'pokedex' ? 'active' : ''} onClick={() => selectView('pokedex')} disabled={running}>
                            Collection {pokedexList.length > 0 && <em>{pokedexList.length}</em>}
                        </button>
                    </div>

                    {view === 'open' && (
                        <>
                            {activeCase && (
                                <section className="cases-selected-case" aria-label="Selected case">
                                    <img src={activeCase.image} alt="" loading="lazy" />
                                    <div className="cases-selected-copy">
                                        <span>{activeCase.categoryLabel || activeCase.type || 'Case'}</span>
                                        <strong>{activeCase.name}</strong>
                                        <em>{activeCase.items.length} possible drops · {activeCase.priceSource === 'csmarket' ? 'market median' : 'EV estimate'}</em>
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
                            <section className="cases-command-bar" aria-label="Case opening command bar">
                                <div className="cases-command-segment" role="group" aria-label="Open mode">
                                    <button type="button" className={rows === 1 ? 'active' : ''} aria-pressed={rows === 1} disabled={running} onClick={() => selectRows(1)}>Single</button>
                                    <button type="button" className={rows > 1 && rows < 10 ? 'active' : ''} aria-pressed={rows > 1 && rows < 10} disabled={running} onClick={() => selectRows(rows > 1 && rows < 10 ? rows : 5)}>Multi</button>
                                    <button type="button" className={rows === 10 ? 'active' : ''} aria-pressed={rows === 10} disabled={running} onClick={() => selectRows(10)}>Bulk</button>
                                </div>
                                <div className="cases-command-rows" role="group" aria-label="Rows">
                                    {ROW_OPTIONS.map(n => (
                                        <button key={n} type="button" className={rows === n ? 'active' : ''} aria-pressed={rows === n} disabled={running} onClick={() => selectRows(n)}>
                                            ×{n}
                                        </button>
                                    ))}
                                </div>
                                <button type="button" className="cases-command-toggle" aria-pressed={autoOpen} onClick={() => setAutoOpen(v => !v)} disabled={running}>
                                    Auto {autoOpen ? 'on' : 'off'}
                                </button>
                                <button type="button" className="cases-command-toggle" aria-pressed={quickOpen} onClick={() => setQuickOpen(v => !v)} disabled={running}>
                                    Quick {quickOpen ? 'on' : 'off'}
                                </button>
                                <button
                                    type="button"
                                    className="cases-command-primary"
                                    data-game-action={results.length > 0 ? 'case-open-again' : 'case-open'}
                                    onClick={() => performPlay({ betAmount: casePrice })}
                                    disabled={running || !activeCase}
                                >
                                    {results.length > 0 ? `Open again (${formatCredits(totalStake)})` : `Open ×${rows} (${formatCredits(totalStake)})`}
                                </button>
                            </section>
                            <section className="cases-session-dock" aria-label="Case session summary">
                                <div className="cases-session-stats">
                                    <span><small>Opened</small><strong>{caseUxStats.opened}</strong></span>
                                    <span><small>Spent</small><strong>{formatCredits(caseUxStats.spent)}</strong></span>
                                    <span className={caseUxStats.profit >= 0 ? 'pos' : 'neg'}><small>Profit/Loss</small><strong>{caseUxStats.profit >= 0 ? '+' : ''}{formatCredits(caseUxStats.profit)}</strong></span>
                                    <span><small>Return</small><strong>{caseUxStats.spent > 0 ? `${caseUxStats.returnPct.toFixed(1)}%` : '—'}</strong></span>
                                </div>
                                <div className="cases-best-opened">
                                    <strong>Best opened</strong>
                                    {caseUxStats.best.length === 0 ? (
                                        <em>No opens yet</em>
                                    ) : caseUxStats.best.map((drop, index) => (
                                        <span key={`${drop.variantKey || drop.skinId}-${index}`} style={{ '--rarity': drop.color }}>
                                            <b>#{index + 1}</b>
                                            <img src={drop.image} alt="" loading="lazy" />
                                            <small>{drop.name}</small>
                                            <strong>{formatCredits(drop.valueGc || 0)}</strong>
                                        </span>
                                    ))}
                                </div>
                                <div className="cases-distribution" aria-label="Rarity and wear distribution">
                                    <strong>Distribution</strong>
                                    {caseUxStats.rarityRows.map(row => (
                                        <span key={row.label}>
                                            <small>{row.label}</small>
                                            <i><b style={{ width: `${Math.min(100, row.pct)}%` }} /></i>
                                            <em>{row.count}</em>
                                        </span>
                                    ))}
                                    <div className="cases-wear-strip">
                                        {caseUxStats.wearRows.map(row => (
                                            <b key={row.label} title={`${row.label}: ${row.count}`}>{row.label} {row.pct.toFixed(0)}%</b>
                                        ))}
                                    </div>
                                </div>
                                <div className="cases-recent-mini">
                                    <strong>Recent</strong>
                                    {caseUxStats.recent.length === 0 ? (
                                        <em>No recent opens</em>
                                    ) : caseUxStats.recent.map((drop, index) => (
                                        <span key={`${drop.variantKey || drop.skinId}-recent-${index}`} style={{ '--rarity': drop.color }}>
                                            <small>{drop.statTrak && 'ST™ '}{drop.name}</small>
                                            <b>{formatCredits(drop.valueGc || 0)}</b>
                                        </span>
                                    ))}
                                </div>
                            </section>
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
                                <div className="cases-category-row">
                                    {CASE_CATEGORIES.map(c => (
                                    <button key={c.value} className={`cases-category-chip ${category === c.value ? 'active' : ''}`} disabled={running} onClick={() => selectCategory(c.value)}>
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
                            <div className="cases-case-grid">
                                {categoryCases.map(c => (
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
                            {tracks.length > 0 && rows === 10 && (
                                <CaseMultiOpenGrid
                                    activeCase={activeCase}
                                    casePhase={casePhase}
                                    results={results}
                                    trackOffsets={trackOffsets}
                                    tracks={tracks}
                                />
                            )}
                            {tracks.length > 0 && rows !== 10 && (
                                <div className="cases-rows" data-case-layout="stacked-rows">
                                    {tracks.map((track, ti) => (
                                        <div key={ti} className="cases-carousel-frame" data-case-row-index={ti}>
                                            <div
                                                className="cases-carousel-track"
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
                            {results.length > 0 && (
                                <div className="cases-result-actions" aria-label="Case opening controls">
                                    <button
                                        type="button"
                                        className="cases-result-primary"
                                        data-game-action="case-open-again"
                                        onClick={() => performPlay({ betAmount: casePrice })}
                                        disabled={running || !activeCase}
                                    >
                                        Open again
                                    </button>
                                    <button type="button" aria-pressed={quickOpen} onClick={() => setQuickOpen(v => !v)} disabled={running}>
                                        Quick {quickOpen ? 'on' : 'off'}
                                    </button>
                                    <button type="button" aria-pressed={autoOpen} onClick={() => setAutoOpen(v => !v)} disabled={running}>
                                        Auto {autoOpen ? 'on' : 'off'}
                                    </button>
                                    <button type="button" aria-pressed={rows === 1} onClick={() => selectRows(1)} disabled={running}>
                                        Single
                                    </button>
                                    <button type="button" aria-pressed={rows > 1} onClick={() => selectRows(rows > 1 ? rows : 5)} disabled={running}>
                                        Multi
                                    </button>
                                </div>
                            )}
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
                                {renderRarityFilter()}
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
                        <div className="cases-pokedex">
                            <header className="cases-history-head">
                                <strong>Collection</strong>
                                <small>
                                    {filteredPokedex.length} of {pokedexList.length} variants shown
                                    {csCatalog.loaded && ` · ${collection.summary.uniqueVariants} unique discovered of ${csCatalog.catalog.totalSkins} skins (${collection.summary.completionPct}%)`}
                                    {` · ${formatCredits(collection.summary.totalValueGc || 0)} inventory value`}
                                </small>
                            </header>
                            <div className="cases-collection-summary" aria-label="Collection summary">
                                <span>
                                    <small>Total value</small>
                                    <strong>{formatCredits(collection.summary.totalValueGc || 0)}</strong>
                                </span>
                                <span>
                                    <small>Discovered</small>
                                    <strong>{collection.summary.uniqueVariants}</strong>
                                </span>
                                <span>
                                    <small>Locked</small>
                                    <strong>{collectionLockedCount}</strong>
                                </span>
                                <span>
                                    <small>Variants</small>
                                    <strong>{collection.summary.totalDrops}</strong>
                                </span>
                            </div>
                            <div className="cases-filters">
                                <input
                                    type="search"
                                    className="cases-search"
                                    aria-label="Search collection skins"
                                    value={pokedexFilter}
                                    onChange={e => setPokedexFilter(e.target.value)}
                                    placeholder="Search skins..."
                                />
                                {renderRarityFilter()}
                                <select className="cases-rarity-select" value={pokedexSort} onChange={e => setPokedexSort(e.target.value)} aria-label="Sort collection">
                                    <option value="value">Sort: Highest value</option>
                                    <option value="multiplier">Sort: Best multiplier</option>
                                    <option value="recent">Sort: Recent</option>
                                    <option value="count">Sort: Count</option>
                                    <option value="wear">Sort: Lowest float</option>
                                    <option value="name">Sort: Name</option>
                                </select>
                                <label className="cases-locked-toggle">
                                    <input
                                        type="checkbox"
                                        checked={showLocked}
                                        onChange={e => setShowLocked(e.target.checked)}
                                    />
                                    <span>Show locked</span>
                                </label>
                            </div>
                            {filteredPokedex.length === 0 && lockedSkins.length === 0 ? (
                                <p className="cases-empty">{pokedexList.length === 0 ? 'Collection empty. Open cases to discover skins.' : 'No variants match those filters.'}</p>
                            ) : (
                                <div className="cases-collection-grid">
                                    {filteredPokedex.map(skin => (
                                        <div
                                            key={skin.key}
                                            className={`cases-skin-card ${RARE_TIERS.has(skin.rarity) ? 'rare' : ''} ${skin.statTrak ? 'stattrak' : ''} ${skin.souvenir ? 'souvenir' : ''}`}
                                            style={{ '--rarity': skin.color }}
                                            title={`${skin.name} · ${skin.wear} · float ${skin.float?.toFixed(3) ?? '—'}`}
                                        >
                                            <img src={skin.image} alt={skin.name} loading="lazy" />
                                            <small>
                                                {skin.statTrak && <em className="cases-tag-st">ST™</em>}
                                                {skin.souvenir && <em className="cases-tag-sv">SV</em>}
                                                {skin.name}
                                            </small>
                                            <span className="cases-skin-meta">
                                                <em>{skin.wearShort} · {skin.float?.toFixed(3) ?? '—'}</em>
                                                <strong>{skin.valueGc ? formatCredits(skin.valueGc) : `×${(skin.multiplier || 0).toFixed(2)}`}</strong>
                                            </span>
                                            <span className="cases-skin-badges">
                                                {skin.statTrak && <b>StatTrak</b>}
                                                {skin.souvenir && <b>Souvenir</b>}
                                                {skin.rarity && <b>{skin.rarity}</b>}
                                            </span>
                                            <i className="cases-skin-count">×{skin.count}</i>
                                        </div>
                                    ))}
                                    {showLocked && lockedSkins.map(skin => (
                                        <div
                                            key={skin.key}
                                            className="cases-skin-card cases-skin-locked"
                                            style={{ '--rarity': skin.color }}
                                            title={`${skin.name} · locked · ${skin.rarity}`}
                                            aria-label={`Locked skin ${skin.name}`}
                                        >
                                            <img src={skin.image} alt={skin.name} loading="lazy" />
                                            <small className="cases-locked-name">{skin.name}</small>
                                            <span className="cases-skin-meta">
                                                <em>{skin.rarity}</em>
                                                <strong>locked</strong>
                                            </span>
                                            <i className="cases-skin-locked-icon" aria-hidden>🔒</i>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <ActionLockOverlay active={running} label={casePhaseLabel(casePhase, rows)} />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={12} />
            <EducationPanel definition={definition} betAmount={casePrice} winProbability={0.32} payoutMultiplier={1.5} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
