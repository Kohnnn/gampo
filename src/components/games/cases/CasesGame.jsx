// Stake-style Cases (Wave 3 Batch 3C).
//
// Real CS:GO case + skin metadata sourced from ByMykel/CSGO-API (CC0)
// via build-time `scripts/buildCsCases.mjs` -> `public/data/cs-cases.json`.
//
// Mechanic combines all three options the user requested:
//   - 3 case tiers (low / mid / high). Higher tier = more risk, more
//     expensive, bigger top end.
//   - CS:GO unboxing carousel: a horizontal strip of items scrolls past
//     the center pointer; deceleration lands on the weighted prize.
//   - Multi-case stacking: open up to 4 cases per round; multipliers
//     stack additively.
//
// Skin imagery is loaded directly from the Steam community CDN URLs in
// the source dataset. No proprietary Stake assets are copied.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
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

const REVEAL_MS = 4500
const CAROUSEL_VISIBLE = 22 // tiles in the running track per case
const TIER_COSTS = { low: 1, mid: 2.5, high: 6 } // multiplier of bet
const TIER_LABEL = { low: 'Low', mid: 'Mid', high: 'High' }

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
    // The prize sits at index len-3 so the track decelerates onto it.
    track[len - 3] = items[prizeIndex]
    return track
}

export default function CasesGame() {
    const definition = findGameDefinition('cases') || { name: 'Cases', category: 'Arcade originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('cases')
    const session = useGameSession('cases')
    const preloader = useOriginalsPreloader('cases')

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
    const trackRef = useRef(null)

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

    const machine = useRoundMachine({})

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
        sfx.play('click')

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
            setTrackOffsets(newTracks.map(() => -((CAROUSEL_VISIBLE - 3) * 100 - 50)))
        }, 32)

        // Settle after the carousel finishes.
        window.setTimeout(() => {
            const totalMultiplier = picks.reduce((s, p) => s + (p.multiplier || 0), 0)
            const returnAmount = stake * (totalMultiplier / stack)
            const profit = returnAmount - stake
            if (returnAmount > 0) addWinnings(returnAmount, 'Cases return')
            setResults(picks)
            const won = profit > 0
            const headlineMult = picks.reduce((m, p) => Math.max(m, p.multiplier || 0), 0)
            setToast({
                kind: won ? 'win' : 'lose',
                multiplier: won ? headlineMult : null,
                amount: profit,
                message: picks.map(p => p.name).join(', ').slice(0, 60),
            })
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
                                ref={trackRef}
                                className="cases-carousel-track"
                                style={{ transform: `translate(${trackOffsets[ti] || 0}px, -50%)` }}
                            >
                                {track.map((item, idx) => (
                                    <div key={`${ti}-${idx}-${item.id}`} className="cases-carousel-tile" style={{ borderColor: item.color }}>
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
                                <div key={i} className="cases-result-card" style={{ '--rarity': r.color }}>
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
                    <ActionLockOverlay active={running} label="Unboxing..." />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={12} />
            <EducationPanel definition={definition} betAmount={5} winProbability={0.32} payoutMultiplier={1.5} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
