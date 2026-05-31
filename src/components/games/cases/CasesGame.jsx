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
import { nextRoll } from '../../../utils/fairRng'
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
    casePhaseLabel,
    finalPrizeOffset,
    pickCelebrationDrop,
} from './casesAnimation'
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

const CAROUSEL_VISIBLE = 32
const ROW_OPTIONS = [1, 3, 5, 10]
const RARE_TIERS = new Set(['Restricted', 'Classified', 'Covert', 'Remarkable', 'Exotic', 'Extraordinary', 'Contraband', '★'])
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
    const [casePhase, setCasePhase] = useState('idle') // idle | lid | spinning | finale | zoom | settling
    const [celebrationDrop, setCelebrationDrop] = useState(null)
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
    const pendingRoundRef = useRef(null)
    const celebrationTimerRef = useRef(null)
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

        const totalValueGc = roundGc(picks.reduce((s, p) => s + (p.valueGc || 0), 0), 0)
        const returnAmount = totalValueGc
        const profit = roundSignedGc(returnAmount - stake, 0)
        const averageMultiplier = stake > 0 ? returnAmount / stake : 0
        if (returnAmount > 0) addWinnings(returnAmount, 'Cases return')
        setResults(picks)

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
            const valueGc = roundGc((base.valueGc || base.multiplier || 1) * wearMult * stMult * svMult, 1)
            const multiplier = unitPrice > 0 ? roundGc(valueGc / unitPrice, 0) : 0
            return {
                ...base,
                skinId: base.id,
                wear: wear?.wear,
                wearShort: wear?.short,
                float,
                statTrak,
                souvenir,
                multiplier,
                valueGc,
                openPriceGc: unitPrice,
                profitGc: roundSignedGc(valueGc - unitPrice, 0),
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

    const renderRarityFilter = () => (
        <>
            <select className="cases-rarity-select" value={rarityFilter} onChange={e => setRarityFilter(e.target.value)} aria-label="Rarity filter">
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
                    initialBet={casePrice}
                    fixedBetAmount={casePrice}
                    betLabel="Case price"
                    runningRound={running}
                    actionLabel={activeCase ? `Open ${rows > 1 ? `×${rows}` : ''} (${formatCredits(totalStake)})` : 'Loading...'}
                    onPlay={performPlay}
                    lastBet={lastBet}
                    disableAuto
                >
                    <div className="bp-section">
                        <span className="bp-label" id="cases-category-label">Case type ({categoryCounts[category] || 0} cases)</span>
                        <select
                            className="cases-panel-select"
                            value={category}
                            disabled={running}
                            aria-labelledby="cases-category-label"
                            onChange={e => setCategory(e.target.value)}
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
                                <button key={n} className={`bp-bet-btn ${rows === n ? 'active' : ''}`} disabled={running} onClick={() => setRows(n)} aria-pressed={rows === n}>{n}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-bal-line">
                        <span>Total stake</span>
                        <strong>{formatCredits(totalStake)}</strong>
                    </div>
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
                    <div className="bp-section">
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
                <div className={`cases-stage case-phase-${casePhase}${running ? ' is-opening' : ''}${results.length > 0 ? ' has-result' : ''}`}>
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />

                    <div className="cases-view-tabs">
                        <button className={view === 'open' ? 'active' : ''} onClick={() => setView('open')} disabled={running}>Open</button>
                        <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')} disabled={running}>
                            History {collection.drops.length > 0 && <em>{collection.drops.length}</em>}
                        </button>
                        <button className={view === 'pokedex' ? 'active' : ''} onClick={() => setView('pokedex')} disabled={running}>
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
                                {['lid', 'spinning', 'finale', 'zoom'].map((phase, index) => (
                                    <span
                                        key={phase}
                                        className={(casePhase === phase || (results.length > 0 && index < 4)) ? 'active' : ''}
                                    >
                                        <i />
                                        {phase === 'lid' ? 'Unlock' : phase === 'spinning' ? 'Reel' : phase === 'finale' ? 'Pointer' : 'Reveal'}
                                    </span>
                                ))}
                            </div>
                            <div className="cases-category-row">
                                {CASE_CATEGORIES.map(c => (
                                    <button key={c.value} className={`cases-category-chip ${category === c.value ? 'active' : ''}`} disabled={running} onClick={() => setCategory(c.value)}>
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
                            <div className="cases-case-grid">
                                {categoryCases.map(c => (
                                    <button
                                        key={c.id}
                                        className={`cases-case-card ${activeCase?.id === c.id ? 'active' : ''} ${casePhase === 'lid' && activeCase?.id === c.id ? 'is-lifting' : ''}`}
                                        disabled={running}
                                        onClick={() => setCaseId(c.id)}
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
                            )}
                            <div className="cases-stack-row">
                                <MultiplierBadge label="Rows" value={rows} suffix="" size="sm" state={running ? 'active' : 'idle'} />
                                {activeCase && (
                                    <>
                                        <span className="cases-stack-pill">Case {formatCredits(casePrice)}</span>
                                        <span className="cases-stack-pill">Total {formatCredits(totalStake)}</span>
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
