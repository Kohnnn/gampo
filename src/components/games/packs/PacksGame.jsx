// Stake-style Packs (Wave 4 Batch 4A).
//
// Player picks a pack tier (Common / Rare / Mythic). Tier sets:
//   - Stake cost multiplier
//   - The weighted prize pool used for each of the 3 reveal cards
//
// Round opens 3 cards in sequence (200ms stagger). Each card pays its
// own multiplier; payouts sum for the round.
//
// Distinct from Cases: Packs uses 3 simultaneous reveals with a tiered
// prize pool (no case carousel, no real CS data).

import { useCallback, useMemo, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits, round2 } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { getBigWinThreshold,
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
import { useCancellableTimeouts } from '../../../utils/scheduling'
import EducationPanel from '../../EducationPanel'
import './packs.css'
import { useGameBgm } from '../../../audio/useBgm'

const REVEAL_STAGGER_MS = 220
const PACK_REVEAL_DELAY_MS = 320

const TIERS = {
    common: {
        label: 'Common',
        cost: 1,
        pool: [
            { name: 'Junk Sticker', icon: '🩹', color: '#9aa3b3', mult: 0, weight: 30 },
            { name: 'Bronze Coin', icon: '🪙', color: '#cd7f32', mult: 0.5, weight: 28 },
            { name: 'Silver Coin', icon: '⚪', color: '#bdc3c7', mult: 1, weight: 22 },
            { name: 'Gold Coin', icon: '🟡', color: '#ffd166', mult: 1.6, weight: 14 },
            { name: 'Ruby', icon: '🔴', color: '#ff6b6b', mult: 3.5, weight: 5 },
            { name: 'Emerald Charm', icon: '💚', color: '#4cffa6', mult: 8, weight: 1 },
        ],
    },
    rare: {
        label: 'Rare',
        cost: 3,
        pool: [
            { name: 'Bronze Idol', icon: '🟫', color: '#cd7f32', mult: 0.5, weight: 22 },
            { name: 'Silver Idol', icon: '⚪', color: '#bdc3c7', mult: 1, weight: 26 },
            { name: 'Gold Idol', icon: '🟡', color: '#ffd166', mult: 1.8, weight: 22 },
            { name: 'Ruby Mask', icon: '💎', color: '#ff6b6b', mult: 3.6, weight: 16 },
            { name: 'Sapphire Mask', icon: '🔷', color: '#4cc9f0', mult: 6, weight: 10 },
            { name: 'Emerald Mask', icon: '💚', color: '#4cffa6', mult: 12, weight: 3 },
            { name: 'Mythic Sigil', icon: '✨', color: '#b478ff', mult: 28, weight: 1 },
        ],
    },
    mythic: {
        label: 'Mythic',
        cost: 8,
        pool: [
            { name: 'Lesser Charm', icon: '🪙', color: '#bdc3c7', mult: 0.6, weight: 18 },
            { name: 'Greater Charm', icon: '🟡', color: '#ffd166', mult: 1.8, weight: 22 },
            { name: 'Heart of Stone', icon: '🪨', color: '#9aa3b3', mult: 3, weight: 22 },
            { name: 'Heart of Fire', icon: '🔥', color: '#ff7a7c', mult: 6.5, weight: 18 },
            { name: 'Heart of Stars', icon: '⭐', color: '#ffd166', mult: 12, weight: 12 },
            { name: 'Mythic Crown', icon: '👑', color: '#b478ff', mult: 28, weight: 6 },
            { name: 'Eldritch Crown', icon: '🌌', color: '#ff4cfa', mult: 80, weight: 2 },
        ],
    },
}

function weightedPick(pool) {
    const total = pool.reduce((s, p) => s + p.weight, 0)
    const r = nextRoll('packs').roll * total
    let acc = 0
    for (const p of pool) {
        acc += p.weight
        if (r < acc) return p
    }
    return pool[pool.length - 1]
}

// Probability Lab metrics derived directly from a tier's weighted prize pool.
//   - expectedMult: E[single pick multiplier] = Σ p_i · mult_i. Because the
//     round pays mean(3 picks) × stake, the expected return multiple equals
//     this same value, i.e. the tier RTP.
//   - winProbability: P(profit > 0) = P(mean of 3 picks > 1) = P(sum > 3),
//     computed exactly by enumerating the 3-pick distribution over the pool.
function tierMetrics(pool) {
    const total = pool.reduce((s, p) => s + p.weight, 0)
    const dist = pool.map(p => ({ mult: p.mult, prob: p.weight / total }))
    const expectedMult = dist.reduce((s, d) => s + d.prob * d.mult, 0)
    // Exact enumeration of three independent picks (pool sizes are ≤7, so 7³
    // ≈ 343 combinations — cheap and precise).
    let winProb = 0
    for (const a of dist) {
        for (const b of dist) {
            for (const c of dist) {
                if (a.mult + b.mult + c.mult > 3) winProb += a.prob * b.prob * c.prob
            }
        }
    }
    return { expectedMult, winProbability: winProb }
}

export default function PacksGame() {
    useGameBgm('packs', 'idle')
    const definition = findGameDefinition('packs') || { name: 'Packs', category: 'Arcade originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('packs')
    const session = useGameSession('packs')
    const preloader = useOriginalsPreloader('packs')

    const [tier, setTier] = useState('common')
    const [running, setRunning] = useState(false)
    const [revealed, setRevealed] = useState([null, null, null])
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const { schedule } = useCancellableTimeouts()

    const machine = useRoundMachine({})

    const tierConf = TIERS[tier]
    // Win odds + expected return for the selected tier, derived from its pool.
    const tierStats = useMemo(() => tierMetrics(tierConf.pool), [tierConf])

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (running) { resolve({ profit: 0 }); return }
        const stake = Math.max(1, Math.round(betAmount * tierConf.cost * 100) / 100)
        if (!placeBet(stake, 'Packs')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(stake)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        setToast(null)
        setRevealed([null, null, null])
        setRunning(true)
        playSound('click')
        sfx.play('click')

        const picks = [weightedPick(tierConf.pool), weightedPick(tierConf.pool), weightedPick(tierConf.pool)]
        const totalMult = picks.reduce((s, p) => s + p.mult, 0) / 3 // mean of three picks vs stake
        const returnAmount = round2(stake * totalMult)
        const profit = round2(returnAmount - stake)

        machine.start([
            { index: 0, type: ROUND_EVENTS.ROUND_START, payload: { tier, stake }, at: 0 },
            { index: 1, type: ROUND_EVENTS.INPUT_LOCK, payload: {}, at: 0 },
            { index: 2, type: ROUND_EVENTS.BET_ACCEPTED, payload: { stake }, at: 0 },
        ], { autoFinish: false })

        // Stagger reveals.
        picks.forEach((p, i) => {
            schedule(() => {
                setRevealed(prev => {
                    const out = [...prev]
                    out[i] = p
                    return out
                })
                sfx.play('reveal')
            }, PACK_REVEAL_DELAY_MS + i * REVEAL_STAGGER_MS)
        })

        const totalDelay = PACK_REVEAL_DELAY_MS + picks.length * REVEAL_STAGGER_MS + 320
        schedule(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Packs return')
            const headlineMult = picks.reduce((m, p) => Math.max(m, p.mult || 0), 0)
            const won = profit > 0
            setToast({
                kind: won ? 'win' : 'lose',
                multiplier: won ? headlineMult : null,
                amount: profit,
                message: picks.map(p => p.name).join(' · '),
            })
            if (won && headlineMult >= 12) {
                playSound('bigwin')
                setBigWin({ trigger: Date.now(), profit, multiplier: headlineMult })
            } else {
                playSound(won ? 'win' : 'loss')
            }
            sfx.play(won ? 'win' : 'lose')
            session.record({
                id: crypto.randomUUID(),
                label: `${tierConf.label} · ${picks.map(p => p.name).join(', ')}`,
                profit, betAmount: stake, multiplier: totalMult,
                meta: { tier, picks: picks.map(p => p.name) },
            })
            machine.finish({ kind: won ? 'win' : 'lose', profit, multiplier: totalMult, picks: picks.map(p => p.name) })
            showToast(won ? 'win' : 'loss', `Packs ${tierConf.label}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            setRunning(false)
            resolve({ profit })
        }, totalDelay)
    })

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#b478ff"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={running}
                    actionLabel={`Open ${tierConf.label} (${formatCredits(Math.round(Number(lastBet || 5) * tierConf.cost * 100) / 100)})`}
                    onPlay={performPlay}
                    lastBet={lastBet}
                    disableAuto
                >
                    <div className="bp-bal-line">
                        <span>Tier cost</span>
                        <strong>×{tierConf.cost.toFixed(1)}</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Top reward</span>
                        <strong>×{tierConf.pool.reduce((m, p) => Math.max(m, p.mult), 0).toFixed(0)}</strong>
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
            <CoreStageFrame minHeight={600} maxWidth={760} loading={!preloader.ready} className="packs-stage-frame">
                <div className="packs-stage" data-mobile-critical-surface>
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <div className="packs-tier-row">
                        {(['common', 'rare', 'mythic']).map(t => (
                            <button
                                key={t}
                                className={`packs-tier ${tier === t ? 'active' : ''}`}
                                disabled={running}
                                onClick={() => setTier(t)}
                            >
                                <span className="packs-tier-name">{TIERS[t].label}</span>
                                <span className="packs-tier-cost">Cost ×<strong>{TIERS[t].cost.toFixed(1)}</strong></span>
                            </button>
                        ))}
                    </div>
                    <div className="packs-row">
                        {revealed.map((r, i) => (
                            <div key={i} className={`packs-card ${r ? 'revealed' : 'hidden'}`} style={{ '--rarity': r?.color }}>
                                {r ? (
                                    <>
                                        <span className="icon">{r.icon}</span>
                                        <span className="name">{r.name}</span>
                                        <span className="mult">×{r.mult.toFixed(2)}</span>
                                    </>
                                ) : (
                                    <span className="icon">?</span>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="packs-paytable">
                        {tierConf.pool.map((p, i) => (
                            <span key={i} style={{ color: p.color }}>{p.icon} ×{p.mult.toFixed(2)}</span>
                        ))}
                    </div>
                    <MultiplierBadge label="Tier" value={tierConf.cost} suffix="" size="sm" state={running ? 'active' : 'idle'} />
                    <ActionLockOverlay active={running} label="Opening..." />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('packs')} />
            {/* Win chance + payout derived from the selected tier's weighted pool
                (see tierMetrics). winProbability = P(mean of 3 picks > 1); the
                expected return multiple equals E[pick mult] = tier RTP, so we
                reconcile payoutMultiplier = expectedMult / winProbability to keep
                EV ≈ RTP in the binary EV model. Replaces the old flat 0.5 / 1.5. */}
            <EducationPanel
                definition={definition}
                betAmount={5}
                winProbability={tierStats.winProbability}
                payoutMultiplier={tierStats.winProbability > 0 ? tierStats.expectedMult / tierStats.winProbability : tierStats.expectedMult}
                balance={balance}
                recentProfit={recentProfit}
            />
        </GameShell>
    )
}
