// CasesGame — Wave 31 rewrite.
//
// What changed:
//   - Loads the playable case roster from `/data/cs-cases.json` (60 cases).
//   - Loads the full pokedex catalog (~2,000 unique skins) on demand.
//   - "Pokedex" view replaces the old collection grid: searchable, rarity-filtered,
//     shows discovered/total per crate + a global completion bar. No selling.
//   - Multi-row simultaneous open: pick 1 / 3 / 5 / 10 rows; every row spins
//     independently with its own carousel, all settle within the 3.5s window.
//   - Each drop rolls a wear condition + StatTrak / souvenir flag from the
//     skin's wear range so float and StatTrak count as separate pokedex
//     variants ("gotta gather them all").
//   - Case grid replaces the old tier-chip + thin row layout. Tiers still
//     filter the grid; expanded peek panel shows the full contains list.
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
import { nextRoll } from '../../../utils/fairRng'
import {
    BetPanel,
    BigWinOverlay,
    GameShell,
    HistoryDrawer,
    RecentResultsStrip,
    StatsOverlay,
    useGameSession,
    SegmentedModeTabs,
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
    casePhaseLabel,
    finalPrizeOffset,
    pickCelebrationDrop,
} from './casesAnimation'
import './cases.css'

const CAROUSEL_VISIBLE = 32
const ROW_OPTIONS = [1, 3, 5, 10]
const RARE_TIERS = new Set(['Covert', 'Extraordinary', 'Contraband', '★'])
const STATTRAK_CHANCE = 0.1
const SOUVENIR_CHANCE = 0.06
const RARITY_FILTERS = [
    { value: 'all', label: 'All', selectLabel: 'All rarities' },
    { value: 'Mil-Spec Grade', label: 'Mil-Spec', selectLabel: 'Mil-Spec' },
    { value: 'Restricted', label: 'Restricted', selectLabel: 'Restricted' },
    { value: 'Classified', label: 'Classified', selectLabel: 'Classified' },
    { value: 'Covert', label: 'Covert', selectLabel: 'Covert' },
    { value: 'Extraordinary', label: 'Extraordinary', selectLabel: 'Extraordinary' },
    { value: 'Contraband', label: 'Contraband', selectLabel: 'Contraband' },
]

const STANDARD_WEARS = [
    { wear: 'Factory New',    short: 'FN', minFloat: 0.00, maxFloat: 0.07, weight: 12, mult: 1.10 },
    { wear: 'Minimal Wear',   short: 'MW', minFloat: 0.07, maxFloat: 0.15, weight: 22, mult: 1.04 },
    { wear: 'Field-Tested',   short: 'FT', minFloat: 0.15, maxFloat: 0.38, weight: 36, mult: 1.00 },
    { wear: 'Well-Worn',      short: 'WW', minFloat: 0.38, maxFloat: 0.45, weight: 18, mult: 0.92 },
    { wear: 'Battle-Scarred', short: 'BS', minFloat: 0.45, maxFloat: 1.00, weight: 12, mult: 0.85 },
]

function rollWear() {
    const total = STANDARD_WEARS.reduce((s, w) => s + w.weight, 0)
    let r = nextRoll('cases-wear').roll * total
    for (const w of STANDARD_WEARS) {
        r -= w.weight
        if (r <= 0) return w
    }
    return STANDARD_WEARS[STANDARD_WEARS.length - 1]
}

function rollFloat(wear) {
    if (!wear) return 0.18
    const span = wear.maxFloat - wear.minFloat
    const r = nextRoll('cases-float').roll
    return Math.round((wear.minFloat + r * span) * 1000) / 1000
}

function rarityWeight(item) {
    if (item.isRare) return 0.4
    switch (item.rarity) {
        case 'Mil-Spec Grade': return 78.92
        case 'Restricted': return 15.98
        case 'Classified': return 3.20
        case 'Covert': return 0.64
        case 'Extraordinary':
        case 'Contraband':
        case '★': return 0.26
        default: return 12
    }
}

function weightedPick(items) {
    const totalWeight = items.reduce((s, it) => s + rarityWeight(it), 0)
    const r = nextRoll('cases').roll * totalWeight
    let acc = 0
    for (const it of items) {
        acc += rarityWeight(it)
        if (r < acc) return it
    }
    return items[items.length - 1]
}

function buildTrack(items, prizeIndex) {
    const len = CAROUSEL_VISIBLE
    const track = []
    for (let i = 0; i < len; i += 1) {
        const idx = Math.floor(nextRoll('cases').roll * items.length)
        track.push(items[idx])
    }
    track[CASE_PRIZE_INDEX] = items[prizeIndex]
    return track
}

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

function tierFromCase(c) {
    return c.tier || 'mid'
}

const TIER_LABEL = { low: 'Low', mid: 'Mid', high: 'High' }

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
    const [tier, setTier] = useState('low')
    const [caseId, setCaseId] = useState(null)
    const [rows, setRows] = useState(1)
    const [running, setRunning] = useState(false)
    const [tracks, setTracks] = useState([]) // [[item, item, ...], ...]
    const [trackOffsets, setTrackOffsets] = useState([])
    const [results, setResults] = useState([]) // resolved drops list (with wear/statTrak)
    const [casePhase, setCasePhase] = useState('idle') // idle | lid | spinning | finale | zoom | settling
    const [celebrationDrop, setCelebrationDrop] = useState(null)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [view, setView] = useState('open') // 'open' | 'history' | 'pokedex'
    const [historyFilter, setHistoryFilter] = useState('')
    const [pokedexFilter, setPokedexFilter] = useState('')
    const [rarityFilter, setRarityFilter] = useState('all')
    const [pokedexSort, setPokedexSort] = useState('multiplier')
    const [caseGridSearch, setCaseGridSearch] = useState('')
    const tickRef = useRef({ ids: [], landId: null })
    const revealTimersRef = useRef([])
    const pendingRoundRef = useRef(null)
    const celebrationTimerRef = useRef(null)

    useEffect(() => {
        let cancelled = false
        fetch('/data/cs-cases.json').then(r => r.json()).then(data => {
            if (cancelled) return
            setAllCases(data)
            const first = data.find(c => tierFromCase(c) === 'low') || data[0]
            if (first) setCaseId(first.id)
        }).catch(err => {
            // eslint-disable-next-line no-console
            console.warn('[cases] manifest load failed', err)
        })
        return () => { cancelled = true }
    }, [])

    const tierCases = useMemo(() => {
        const list = (allCases || []).filter(c => tierFromCase(c) === tier)
        const q = caseGridSearch.trim().toLowerCase()
        return q ? list.filter(c => c.name.toLowerCase().includes(q)) : list
    }, [allCases, tier, caseGridSearch])

    const activeCase = useMemo(() => (allCases || []).find(c => c.id === caseId) || tierCases[0], [allCases, caseId, tierCases])

    useEffect(() => {
        if (activeCase && tierFromCase(activeCase) !== tier) {
            const fresh = tierCases[0]
            if (fresh) setCaseId(fresh.id)
        }
    }, [tier, tierCases, activeCase])

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
        if (celebrationTimerRef.current) window.clearTimeout(celebrationTimerRef.current)
    }, [clearRevealTimers])

    const scheduleTickSfx = useCallback(() => {
        tickRef.current.ids.forEach(id => window.clearTimeout(id))
        const ids = []
        const TICKS = 14
        for (let i = 0; i < TICKS; i += 1) {
            const t = i / (TICKS - 1)
            const at = Math.round(cubicOut(t) * CASE_REVEAL_MS)
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
        }, CASE_REVEAL_MS - 40)
    }, [sfx])

    const finishPendingRound = useCallback(({ skipped = false } = {}) => {
        const pending = pendingRoundRef.current
        if (!pending || pending.settled) return
        pending.settled = true
        clearRevealTimers()

        const { caseData, picks, resolve, stake, tracks: pendingTracks, offsets: pendingOffsets, rows: roundRows } = pending
        setTracks(pendingTracks)
        setTrackOffsets(pendingOffsets)
        setCasePhase('settling')

        const totalMultiplier = picks.reduce((s, p) => s + (p.multiplier || 0), 0)
        // payout = stake x (sum of per-row multipliers / rows)
        const returnAmount = (stake / roundRows) * totalMultiplier
        const profit = returnAmount - stake
        if (returnAmount > 0) addWinnings(returnAmount, 'Cases return')
        setResults(picks)

        picks.forEach(pick => {
            collection.recordDrop(pick, {
                caseId: caseData.id,
                caseName: caseData.name,
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
            profit, betAmount: stake, multiplier: totalMultiplier / roundRows,
            meta: { picks: picks.map(p => ({ id: p.skinId, rarity: p.rarity, multiplier: p.multiplier, wear: p.wear, statTrak: p.statTrak })) },
        })
        machine.finish({
            kind: won ? 'win' : 'lose',
            profit,
            multiplier: totalMultiplier / roundRows,
            picks: picks.map(p => p.skinId),
            skipped,
        })
        showToast(won ? 'win' : 'loss', `${caseData.name} ${won ? 'win' : 'miss'}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        setRunning(false)
        setCasePhase('idle')
        pendingRoundRef.current = null
        resolve({ profit })
    }, [addWinnings, clearRevealTimers, collection, machine, playSound, session, showToast, sfx])

    const skipCaseAnimation = useCallback(() => {
        if (!pendingRoundRef.current || pendingRoundRef.current.settled) return
        finishPendingRound({ skipped: true })
    }, [finishPendingRound])

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (running) { resolve({ profit: 0 }); return }
        if (!activeCase) { showToast('error', 'Loading cases', 'Try again'); resolve({ profit: 0 }); return }
        const stake = Math.max(1, Math.round(betAmount * rows * 100) / 100)
        if (!placeBet(stake, 'Cases')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(stake)}`)
            resolve({ profit: 0 })
            return
        }
        clearRevealTimers()
        if (celebrationTimerRef.current) window.clearTimeout(celebrationTimerRef.current)
        setLastBet(betAmount)
        setToast(null)
        setCelebrationDrop(null)
        setRunning(true)
        setResults([])
        setTracks([])
        setTrackOffsets([])
        setCasePhase('lid')
        playSound('click')
        sfx.play('open', { volume: 0.65 })
        sfx.play('lid', { volume: 0.78 })
        sfx.play('click')
        setView('open')

        // Resolve drops up front. Each row picks a base skin, then rolls
        // wear + StatTrak + souvenir for the variant.
        const picks = Array.from({ length: rows }, () => {
            const base = weightedPick(activeCase.items)
            const wear = rollWear()
            const float = rollFloat(wear)
            const statTrak = nextRoll('cases-st').roll < STATTRAK_CHANCE
            const souvenir = !statTrak && nextRoll('cases-sv').roll < SOUVENIR_CHANCE
            const wearMult = wear?.mult || 1
            const stMult = statTrak ? 1.6 : 1
            const svMult = souvenir ? 1.3 : 1
            const multiplier = Math.round(((base.multiplier || 1) * wearMult * stMult * svMult) * 100) / 100
            return {
                ...base,
                skinId: base.id,
                wear: wear?.wear,
                wearShort: wear?.short,
                float,
                statTrak,
                souvenir,
                multiplier,
            }
        })

        const newTracks = picks.map(pick => {
            const prizeIndex = activeCase.items.findIndex(it => it.id === pick.skinId)
            return buildTrack(activeCase.items, Math.max(0, prizeIndex))
        })
        const finalOffsets = newTracks.map(() => {
            const jitter = (nextRoll('cases-jit').roll - 0.5) * 14
            return finalPrizeOffset(jitter)
        })
        pendingRoundRef.current = {
            caseData: activeCase,
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

        queueRevealTimer(() => {
            if (!pendingRoundRef.current || pendingRoundRef.current.settled) return
            setCasePhase('spinning')
            setTracks(newTracks)
            setTrackOffsets(newTracks.map(() => 0))
            sfx.play('multispin', { volume: rows >= 3 ? 0.62 : 0.36 })
            queueRevealTimer(() => {
                if (!pendingRoundRef.current || pendingRoundRef.current.settled) return
                setTrackOffsets(finalOffsets)
            }, 32)
            scheduleTickSfx()
        }, CASE_LID_LIFT_MS)

        queueRevealTimer(() => {
            if (!pendingRoundRef.current || pendingRoundRef.current.settled) return
            setCasePhase('finale')
        }, CASE_LID_LIFT_MS + CASE_REVEAL_MS - CASE_LIGHT_SWEEP_LEAD_MS)

        queueRevealTimer(() => {
            if (!pendingRoundRef.current || pendingRoundRef.current.settled) return
            setCasePhase('zoom')
        }, CASE_LID_LIFT_MS + CASE_REVEAL_MS - CASE_PRIZE_ZOOM_LEAD_MS)

        queueRevealTimer(() => {
            finishPendingRound()
        }, CASE_LID_LIFT_MS + CASE_REVEAL_MS + CASE_SETTLE_PAD_MS)
    })

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)
    const stageLoading = !preloader.ready || !allCases

    const pokedexList = useMemo(() => Object.values(collection.pokedex), [collection.pokedex])

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
            case 'multiplier':
            default:           return [...list].sort((a, b) => (b.multiplier || 0) - (a.multiplier || 0))
        }
    }, [pokedexList, pokedexFilter, rarityFilter, pokedexSort])

    const cases = allCases || []
    const tierCounts = useMemo(() => {
        const out = { low: 0, mid: 0, high: 0 }
        for (const c of cases) out[tierFromCase(c)] = (out[tierFromCase(c)] || 0) + 1
        return out
    }, [cases])

    const renderRarityFilter = () => (
        <>
            <select className="cases-rarity-select" value={rarityFilter} onChange={e => setRarityFilter(e.target.value)}>
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
                        onClick={() => setRarityFilter(option.value)}
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
                    initialBet={5}
                    runningRound={running}
                    actionLabel={activeCase ? `Open ${rows > 1 ? `×${rows}` : ''} (${formatCredits(activeCase ? Math.round((Number(lastBet || 5)) * rows * 100) / 100 : 0)})` : 'Loading...'}
                    onPlay={performPlay}
                    lastBet={lastBet}
                    disableAuto
                >
                    <div className="bp-section">
                        <label className="bp-label">Tier ({tierCounts[tier] || 0} cases)</label>
                        <SegmentedModeTabs
                            options={[
                                { value: 'low', label: 'Low' },
                                { value: 'mid', label: 'Mid' },
                                { value: 'high', label: 'High' },
                            ]}
                            value={tier}
                            onChange={t => !running && setTier(t)}
                            size="sm"
                        />
                    </div>
                    <div className="bp-section">
                        <label className="bp-label">Rows ({rows})</label>
                        <div className="bp-row">
                            {ROW_OPTIONS.map(n => (
                                <button key={n} className={`bp-bet-btn ${rows === n ? 'active' : ''}`} disabled={running} onClick={() => setRows(n)}>{n}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-bal-line">
                        <span>Total stake</span>
                        <strong>{formatCredits(Math.round(Number(lastBet || 5) * rows * 100) / 100)}</strong>
                    </div>
                    <div className="bp-section cases-skip-section">
                        <label className="bp-label">Animation</label>
                        <button
                            className="cases-skip-btn"
                            disabled={!running || !pendingRoundRef.current}
                            onClick={skipCaseAnimation}
                            type="button"
                        >
                            Skip animation
                        </button>
                        <p className="bp-hint">Instantly settles the same practice round and keeps the drop record.</p>
                    </div>
                    <div className="bp-section">
                        <label className="bp-label">Pokedex</label>
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
                        </div>
                        {csCatalog.loaded && (
                            <div className="cases-pokedex-bar" title={`${collection.summary.uniqueVariants} discovered of ${csCatalog.catalog.totalSkins} skins`}>
                                <span style={{ width: `${Math.min(100, collection.summary.uniqueVariants / Math.max(1, csCatalog.catalog.totalSkins) * 100)}%` }} />
                            </div>
                        )}
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
                <div className={`cases-stage case-phase-${casePhase}`}>
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />

                    <div className="cases-view-tabs">
                        <button className={view === 'open' ? 'active' : ''} onClick={() => setView('open')} disabled={running}>Open</button>
                        <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')} disabled={running}>
                            History {collection.drops.length > 0 && <em>{collection.drops.length}</em>}
                        </button>
                        <button className={view === 'pokedex' ? 'active' : ''} onClick={() => setView('pokedex')} disabled={running}>
                            Pokedex {pokedexList.length > 0 && <em>{pokedexList.length}</em>}
                        </button>
                    </div>

                    {view === 'open' && (
                        <>
                            <div className="cases-tier-row">
                                {(['low', 'mid', 'high']).map(t => (
                                    <button key={t} className={`cases-tier-chip ${tier === t ? 'active' : ''}`} disabled={running} onClick={() => setTier(t)}>
                                        {TIER_LABEL[t]} · {tierCounts[t] || 0}
                                    </button>
                                ))}
                                <input
                                    type="search"
                                    className="cases-search cases-grid-search"
                                    placeholder="Filter cases..."
                                    value={caseGridSearch}
                                    onChange={e => setCaseGridSearch(e.target.value)}
                                />
                            </div>
                            <div className="cases-case-grid">
                                {tierCases.map(c => (
                                    <button
                                        key={c.id}
                                        className={`cases-case-card ${activeCase?.id === c.id ? 'active' : ''} ${casePhase === 'lid' && activeCase?.id === c.id ? 'is-lifting' : ''}`}
                                        disabled={running}
                                        onClick={() => setCaseId(c.id)}
                                        title={`${c.name} · ${c.items.length} items · ${c.type || 'Case'}`}
                                    >
                                        <img src={c.image} alt={c.name} loading="lazy" />
                                        <span title={c.name}>{c.name}</span>
                                        <em>{c.items.length} items</em>
                                    </button>
                                ))}
                            </div>
                            {tracks.length > 0 && (
                                <div className="cases-rows">
                                    {tracks.map((track, ti) => (
                                        <div key={ti} className="cases-carousel-frame">
                                            <div
                                                className="cases-carousel-track"
                                                style={{ transform: `translate(${trackOffsets[ti] || 0}px, -50%)` }}
                                            >
                                                {track.map((item, idx) => (
                                                    <div
                                                        key={`${ti}-${idx}-${item.id}`}
                                                        className={`cases-carousel-tile ${idx === CASE_PRIZE_INDEX && (casePhase === 'zoom' || results.length > 0) ? 'is-target' : ''} ${idx === CASE_PRIZE_INDEX && results.length > 0 ? 'is-prize' : ''}`}
                                                        style={{ borderColor: item.color, '--rarity': item.color }}
                                                    >
                                                        <img src={item.image} alt={item.name} loading="lazy" />
                                                        <small>{item.name}</small>
                                                    </div>
                                                ))}
                                            </div>
                                            <span className="cases-carousel-pointer" />
                                        </div>
                                    ))}
                                </div>
                            )}
                            {results.length > 0 && (
                                <div className="cases-result-row">
                                    {results.map((r, i) => (
                                        <div key={i} className={`cases-result-card ${RARE_TIERS.has(r.rarity) ? 'rare' : ''} ${r.statTrak ? 'stattrak' : ''} ${r.souvenir ? 'souvenir' : ''}`} style={{ '--rarity': r.color }}>
                                            <img src={r.image} alt={r.name} />
                                            <small>{r.statTrak && <em>StatTrak™ </em>}{r.souvenir && <em>Souvenir </em>}{r.name}</small>
                                            <span className="cases-result-meta">
                                                <em>{r.wearShort} · {r.float?.toFixed(3) ?? '—'}</em>
                                                <strong>×{r.multiplier.toFixed(2)}</strong>
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
                            )}
                            <div className="cases-stack-row">
                                <MultiplierBadge label="Rows" value={rows} suffix="" size="sm" state={running ? 'active' : 'idle'} />
                                {activeCase && (
                                    <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                                        {activeCase.items.length} skins · {activeCase.type || 'Case'}
                                    </span>
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
                                        <strong>×{(celebrationDrop.multiplier || 0).toFixed(2)}</strong>
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
                                <p className="cases-empty">{collection.drops.length === 0 ? 'No drops yet. Open a case to start filling the pokedex.' : 'No drops match those filters.'}</p>
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
                                            <strong>×{(d.multiplier || 0).toFixed(2)}</strong>
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
                                <strong>Pokedex</strong>
                                <small>
                                    {filteredPokedex.length} of {pokedexList.length} variants shown
                                    {csCatalog.loaded && ` · ${collection.summary.uniqueVariants} unique discovered of ${csCatalog.catalog.totalSkins} skins (${collection.summary.completionPct}%)`}
                                </small>
                            </header>
                            <div className="cases-filters">
                                <input
                                    type="search"
                                    className="cases-search"
                                    value={pokedexFilter}
                                    onChange={e => setPokedexFilter(e.target.value)}
                                    placeholder="Search skins..."
                                />
                                {renderRarityFilter()}
                                <select className="cases-rarity-select" value={pokedexSort} onChange={e => setPokedexSort(e.target.value)}>
                                    <option value="multiplier">Sort: Best multiplier</option>
                                    <option value="recent">Sort: Recent</option>
                                    <option value="count">Sort: Count</option>
                                    <option value="wear">Sort: Lowest float</option>
                                    <option value="name">Sort: Name</option>
                                </select>
                            </div>
                            {filteredPokedex.length === 0 ? (
                                <p className="cases-empty">{pokedexList.length === 0 ? 'Pokedex empty. Open cases to discover skins.' : 'No variants match those filters.'}</p>
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
                                                <strong>×{(skin.multiplier || 0).toFixed(2)}</strong>
                                            </span>
                                            <i className="cases-skin-count">×{skin.count}</i>
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
            <EducationPanel definition={definition} betAmount={5} winProbability={0.32} payoutMultiplier={1.5} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
