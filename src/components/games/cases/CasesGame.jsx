// Stake-style Cases (Wave 3 Batch 3C, polished in Wave 18).
//
// Wave 18 polish:
//   - 3.5s carousel reveal with cubic-out deceleration + tick SFX every tile
//     and a "land" thunk on the final stop.
//   - Drop history persisted to localStorage via `useCaseCollection`.
//   - Owned-skin collection grid with rarity counts + best multiplier.
//   - Rare-drop chime + recent drop strip below the carousel.
//   - Manifest still ships silent; missing audio paths are no-ops.
//
// Skin imagery is loaded directly from the Steam community CDN URLs in
// the source dataset. No proprietary Stake assets are copied.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { useCaseCollection } from '../../../hooks/useCaseCollection'
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
import './cases.css'

const REVEAL_MS = 3500
const TILE_PX = 100 // visual width of one carousel tile incl. gap
const CAROUSEL_VISIBLE = 32 // tiles in the running track per case
const PRIZE_INDEX = CAROUSEL_VISIBLE - 4 // where the resolved prize sits
const TIER_COSTS = { low: 1, mid: 2.5, high: 6 } // multiplier of bet
const TIER_LABEL = { low: 'Low', mid: 'Mid', high: 'High' }
const RARE_TIERS = new Set(['Covert', 'Extraordinary'])

// Pick a weighted item using fairRng. Higher rarity tier = lower weight.
function rarityWeight(item) {
    if (item.isRare) return 0.4
    switch (item.rarity) {
        case 'Mil-Spec Grade': return 78.92
        case 'Restricted': return 15.98
        case 'Classified': return 3.20
        case 'Covert': return 0.64
        case 'Extraordinary': return 0.26
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
    track[PRIZE_INDEX] = items[prizeIndex]
    return track
}

// Cubic-out easing — deceleration matches CS:GO unboxing feel.
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
    const collection = useCaseCollection()

    const [allCases, setAllCases] = useState(null)
    const [tier, setTier] = useState('low')
    const [caseId, setCaseId] = useState(null)
    const [stack, setStack] = useState(1)
    const [running, setRunning] = useState(false)
    const [tracks, setTracks] = useState([]) // [[item, item, ...], ...]
    const [trackOffsets, setTrackOffsets] = useState([])
    const [results, setResults] = useState([]) // resolved items list
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [view, setView] = useState('open') // 'open' | 'history' | 'collection'
    const tickRef = useRef({ ids: [], landId: null })

    useEffect(() => {
        let cancelled = false
        fetch('/data/cs-cases.json').then(r => r.json()).then(data => {
            if (cancelled) return
            setAllCases(data)
            const first = data.find(c => c.tier === 'low')
            if (first) setCaseId(first.id)
        }).catch(err => {
            // eslint-disable-next-line no-console
            console.warn('[cases] manifest load failed', err)
        })
        return () => { cancelled = true }
    }, [])

    const tierCases = useMemo(() => (allCases || []).filter(c => c.tier === tier), [allCases, tier])
    const activeCase = useMemo(() => (allCases || []).find(c => c.id === caseId) || tierCases[0], [allCases, caseId, tierCases])
    const tierCostMult = TIER_COSTS[tier]

    useEffect(() => {
        if (activeCase && activeCase.tier !== tier) {
            const fresh = tierCases[0]
            if (fresh) setCaseId(fresh.id)
        }
    }, [tier, tierCases, activeCase])

    // Cleanup any pending tick timers on unmount.
    useEffect(() => () => {
        tickRef.current.ids.forEach(id => window.clearTimeout(id))
        if (tickRef.current.landId) window.clearTimeout(tickRef.current.landId)
        tickRef.current = { ids: [], landId: null }
    }, [])

    const machine = useRoundMachine({})

    const scheduleTickSfx = useCallback(() => {
        // Schedule ~14 deceleration ticks across the reveal using cubic-out.
        // Each tick volume softens as it slows.
        tickRef.current.ids.forEach(id => window.clearTimeout(id))
        const ids = []
        const TICKS = 14
        for (let i = 0; i < TICKS; i += 1) {
            const t = i / (TICKS - 1)
            const at = Math.round(cubicOut(t) * REVEAL_MS)
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
        }, REVEAL_MS - 40)
    }, [sfx])

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (running) { resolve({ profit: 0 }); return }
        if (!activeCase) { showToast('error', 'Loading cases', 'Try again'); resolve({ profit: 0 }); return }
        const stake = Math.max(1, Math.round(betAmount * tierCostMult * stack * 100) / 100)
        if (!placeBet(stake, 'Cases')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(stake)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        setToast(null)
        setRunning(true)
        setResults([])
        playSound('click')
        sfx.play('open', { volume: 0.7 })
        sfx.play('click')
        setView('open')

        // Resolve prizes deterministically up front.
        const picks = Array.from({ length: stack }, () => weightedPick(activeCase.items))
        const newTracks = picks.map(pick => {
            const prizeIndex = activeCase.items.findIndex(it => it.id === pick.id && it.name === pick.name)
            return buildTrack(activeCase.items, Math.max(0, prizeIndex))
        })
        setTracks(newTracks)
        setTrackOffsets(newTracks.map(() => 0))

        machine.start([
            { index: 0, type: ROUND_EVENTS.ROUND_START, payload: { stake, stack, caseId: activeCase.id }, at: 0 },
            { index: 1, type: ROUND_EVENTS.INPUT_LOCK, payload: {}, at: 0 },
            { index: 2, type: ROUND_EVENTS.BET_ACCEPTED, payload: { stake, stack }, at: 0 },
        ], { autoFinish: false })

        // Animate by setting target offsets one frame later so the
        // CSS transition runs.
        window.setTimeout(() => {
            // The track translates negatively so the prize tile (PRIZE_INDEX)
            // lands centered on the pointer. Add a small jitter so consecutive
            // opens don't look identical.
            const jitter = (nextRoll('cases').roll - 0.5) * 14 // -7..+7 px
            const offset = -((PRIZE_INDEX) * TILE_PX - 50) + jitter
            setTrackOffsets(newTracks.map(() => offset))
        }, 32)

        scheduleTickSfx()

        // Settle after the carousel finishes.
        window.setTimeout(() => {
            const totalMultiplier = picks.reduce((s, p) => s + (p.multiplier || 0), 0)
            const returnAmount = stake * (totalMultiplier / stack)
            const profit = returnAmount - stake
            if (returnAmount > 0) addWinnings(returnAmount, 'Cases return')
            setResults(picks)

            // Wave 18: persist drop history + bump owned-skin counts.
            // Wave 19: also feed the progression system so cases-rare etc unlock.
            picks.forEach(pick => {
                collection.recordDrop(pick, {
                    caseId: activeCase.id,
                    caseName: activeCase.name,
                    tier: activeCase.tier,
                })
                recordProgressCaseDrop(pick)
            })

            const won = profit > 0
            const headlineMult = picks.reduce((m, p) => Math.max(m, p.multiplier || 0), 0)
            const rare = picks.some(p => RARE_TIERS.has(p.rarity))
            setToast({
                kind: won ? 'win' : 'lose',
                multiplier: won ? headlineMult : null,
                amount: profit,
                message: picks.map(p => p.name).join(', ').slice(0, 60),
            })
            sfx.play('reveal', { volume: 0.9 })
            if (rare) sfx.play('rare', { volume: 1 })
            if (won && headlineMult >= 12) {
                playSound('bigwin')
                setBigWin({ trigger: Date.now(), profit, multiplier: headlineMult })
            } else {
                playSound(won ? 'win' : 'loss')
            }
            sfx.play(won ? 'win' : 'lose')
            session.record({
                id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                label: `${activeCase.name} x${stack}`,
                profit, betAmount: stake, multiplier: totalMultiplier / stack,
                meta: { picks: picks.map(p => ({ id: p.id, rarity: p.rarity, multiplier: p.multiplier })) },
            })
            machine.finish({
                kind: won ? 'win' : 'lose',
                profit,
                multiplier: totalMultiplier / stack,
                picks: picks.map(p => p.id),
            })
            showToast(won ? 'win' : 'loss', `${activeCase.name} ${won ? 'win' : 'miss'}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            setRunning(false)
            resolve({ profit })
        }, REVEAL_MS + 60)
    })

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)
    const stageLoading = !preloader.ready || !allCases

    const collectionList = useMemo(() => (
        Object.values(collection.collection).sort((a, b) => (b.multiplier || 0) - (a.multiplier || 0))
    ), [collection.collection])

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
                    actionLabel={activeCase ? `Open ${stack > 1 ? `x${stack}` : ''} (${formatCredits(activeCase ? Math.round((Number(lastBet || 5)) * tierCostMult * stack * 100) / 100 : 0)})` : 'Loading...'}
                    onPlay={performPlay}
                    lastBet={lastBet}
                    disableAuto
                >
                    <div className="bp-section">
                        <label className="bp-label">Tier</label>
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
                        <label className="bp-label">Stack ({stack})</label>
                        <div className="bp-row">
                            {[1, 2, 3, 4].map(n => (
                                <button key={n} className={`bp-bet-btn ${stack === n ? 'active' : ''}`} disabled={running} onClick={() => setStack(n)}>{n}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-bal-line">
                        <span>Tier cost</span>
                        <strong>×{tierCostMult.toFixed(1)}</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Total stake</span>
                        <strong>{formatCredits(Math.round(Number(lastBet || 5) * tierCostMult * stack * 100) / 100)}</strong>
                    </div>
                    <div className="bp-section">
                        <label className="bp-label">Collection</label>
                        <div className="bp-row" style={{ flexWrap: 'wrap' }}>
                            <span className="cases-stat-pill">
                                <small>Drops</small><strong>{collection.summary.totalDrops}</strong>
                            </span>
                            <span className="cases-stat-pill">
                                <small>Skins</small><strong>{collection.summary.uniqueSkins}</strong>
                            </span>
                            <span className="cases-stat-pill">
                                <small>Best</small><strong>×{collection.summary.bestMultiplier.toFixed(2)}</strong>
                            </span>
                        </div>
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
            <CoreStageFrame minHeight={620} maxWidth={960} loading={stageLoading} className="cases-stage-frame">
                <div className="cases-stage">
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />

                    <div className="cases-view-tabs">
                        <button className={view === 'open' ? 'active' : ''} onClick={() => setView('open')} disabled={running}>Open</button>
                        <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')} disabled={running}>
                            History {collection.drops.length > 0 && <em>{collection.drops.length}</em>}
                        </button>
                        <button className={view === 'collection' ? 'active' : ''} onClick={() => setView('collection')} disabled={running}>
                            Collection {collectionList.length > 0 && <em>{collectionList.length}</em>}
                        </button>
                    </div>

                    {view === 'open' && (
                        <>
                            <div className="cases-tier-row">
                                {(['low', 'mid', 'high']).map(t => (
                                    <button key={t} className={`cases-tier-chip ${tier === t ? 'active' : ''}`} disabled={running} onClick={() => setTier(t)}>
                                        {TIER_LABEL[t]} · ×{TIER_COSTS[t].toFixed(1)}
                                    </button>
                                ))}
                            </div>
                            <div className="cases-case-row">
                                {tierCases.map(c => (
                                    <button
                                        key={c.id}
                                        className={`cases-case-card ${activeCase?.id === c.id ? 'active' : ''}`}
                                        disabled={running}
                                        onClick={() => setCaseId(c.id)}
                                    >
                                        <img src={c.image} alt={c.name} loading="lazy" />
                                        <span title={c.name}>{c.name}</span>
                                    </button>
                                ))}
                            </div>
                            {tracks.map((track, ti) => (
                                <div key={ti} className="cases-carousel-frame">
                                    <div
                                        className="cases-carousel-track"
                                        style={{ transform: `translate(${trackOffsets[ti] || 0}px, -50%)` }}
                                    >
                                        {track.map((item, idx) => (
                                            <div
                                                key={`${ti}-${idx}-${item.id}`}
                                                className={`cases-carousel-tile ${idx === PRIZE_INDEX && results.length > 0 ? 'is-prize' : ''}`}
                                                style={{ borderColor: item.color }}
                                            >
                                                <img src={item.image} alt={item.name} loading="lazy" />
                                                <small>{item.name}</small>
                                            </div>
                                        ))}
                                    </div>
                                    <span className="cases-carousel-pointer" />
                                </div>
                            ))}
                            {results.length > 0 && (
                                <div className="cases-result-row">
                                    {results.map((r, i) => (
                                        <div key={i} className={`cases-result-card ${RARE_TIERS.has(r.rarity) ? 'rare' : ''}`} style={{ '--rarity': r.color }}>
                                            <img src={r.image} alt={r.name} />
                                            <small>{r.name}</small>
                                            <strong>×{r.multiplier.toFixed(2)}</strong>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="cases-stack-row">
                                <MultiplierBadge label="Stack" value={stack} suffix="" size="sm" state={running ? 'active' : 'idle'} />
                                {activeCase && (
                                    <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                                        {activeCase.items.length} skins · {activeCase.tier} tier
                                    </span>
                                )}
                            </div>
                        </>
                    )}

                    {view === 'history' && (
                        <div className="cases-history">
                            <header className="cases-history-head">
                                <strong>Drop history</strong>
                                <small>last {Math.min(collection.drops.length, 200)} drops</small>
                                {collection.drops.length > 0 && (
                                    <button className="cases-reset-btn" onClick={() => collection.reset()}>Reset</button>
                                )}
                            </header>
                            {collection.drops.length === 0 ? (
                                <p className="cases-empty">No drops yet. Open a case to start a collection.</p>
                            ) : (
                                <ul className="cases-history-list">
                                    {collection.drops.map((d, i) => (
                                        <li key={`${d.id}-${d.ts}-${i}`} className={RARE_TIERS.has(d.rarity) ? 'rare' : ''} style={{ '--rarity': d.color }}>
                                            <img src={d.image} alt={d.name} loading="lazy" />
                                            <span className="cases-history-name">{d.name}</span>
                                            <span className="cases-history-rarity">{d.rarity || ''}</span>
                                            <span className="cases-history-case">{d.caseName || ''}</span>
                                            <strong>×{(d.multiplier || 0).toFixed(2)}</strong>
                                            <em>{formatRelative(d.ts)}</em>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {view === 'collection' && (
                        <div className="cases-collection">
                            <header className="cases-history-head">
                                <strong>Owned skins</strong>
                                <small>{collectionList.length} unique</small>
                            </header>
                            {collectionList.length === 0 ? (
                                <p className="cases-empty">Collection empty. Skins land here as you open cases.</p>
                            ) : (
                                <div className="cases-collection-grid">
                                    {collectionList.map(skin => (
                                        <div
                                            key={skin.id}
                                            className={`cases-skin-card ${RARE_TIERS.has(skin.rarity) ? 'rare' : ''}`}
                                            style={{ '--rarity': skin.color }}
                                        >
                                            <img src={skin.image} alt={skin.name} loading="lazy" />
                                            <small>{skin.name}</small>
                                            <span className="cases-skin-meta">
                                                <em>{skin.rarity}</em>
                                                <strong>×{(skin.multiplier || 0).toFixed(2)}</strong>
                                            </span>
                                            <i className="cases-skin-count">×{skin.count}</i>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <ActionLockOverlay active={running} label="Unboxing..." />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={12} />
            <EducationPanel definition={definition} betAmount={5} winProbability={0.32} payoutMultiplier={1.5} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
