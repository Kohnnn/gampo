// Stake-style Diamonds (Wave 3, plausible mechanic).
//
// Five gem slots reveal simultaneously after a short suspense. The
// highest-tier match count drives the payout. Mechanic is designed
// rather than copied from Stake; the audit only captured the control
// panel.

import { useCallback, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits, round2 } from '../../../utils/simulationMath'
import { isFunMode, FUN_PAYOUT_BOOST } from '../../../utils/funMode'
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
    buildEvents,
    useRoundMachine,
} from '../primitives'
import { useOriginalsPreloader } from '../../games/resources/useOriginalsPreloader'
import EducationPanel from '../../EducationPanel'
import './diamonds.css'
import { useGameBgm } from '../../../audio/useBgm'

const REVEAL_MS = 600

// Gems sorted by descending rarity.
const GEMS = [
    { sym: '💎', label: 'Diamond', weight: 1 },
    { sym: '🔷', label: 'Sapphire', weight: 2 },
    { sym: '🔶', label: 'Topaz', weight: 3 },
    { sym: '🟢', label: 'Emerald', weight: 4 },
    { sym: '🟣', label: 'Amethyst', weight: 6 },
    { sym: '🟡', label: 'Citrine', weight: 8 },
]

// Raw payout shape per match-count (relative). Calibrated below so realized
// RTP equals DIAMONDS_RTP — previously these raw values gave ~258% RTP because
// a near-certain 2-match paid 1.1x.
function rawPayoutFor(matchCount, gemIndex) {
    if (matchCount < 2) return 0
    const gemBonus = (5 - gemIndex) * 0.5 // Diamond +2.5, Citrine +0
    if (matchCount === 5) return 80 + gemBonus * 4
    if (matchCount === 4) return 12 + gemBonus * 2
    if (matchCount === 3) return 2.2 + gemBonus * 0.4
    return 1.1 + gemBonus * 0.1
}

const DIAMONDS_RTP = 0.96
const GEM_WEIGHTS = [1, 2, 3, 4, 6, 8]

// One-time Monte-Carlo calibration: measure the mean return of the raw shape
// and derive a single scalar that locks RTP to the target. Deterministic via a
// seeded RNG so the scalar is stable across loads.
const DIAMONDS_SCALE = (() => {
    const total = GEM_WEIGHTS.reduce((s, w) => s + w, 0)
    let seed = 0x9e3779b9
    const rng = () => {
        seed = (Math.imul(seed ^ (seed >>> 15), seed | 1) >>> 0)
        seed ^= seed + Math.imul(seed ^ (seed >>> 7), seed | 61)
        return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296
    }
    const draw = () => {
        const r = rng() * total
        let acc = 0
        for (let i = 0; i < GEM_WEIGHTS.length; i += 1) { acc += GEM_WEIGHTS[i]; if (r < acc) return i }
        return GEM_WEIGHTS.length - 1
    }
    const N = 200000
    let sum = 0
    for (let n = 0; n < N; n += 1) {
        const counts = new Array(GEM_WEIGHTS.length).fill(0)
        for (let d = 0; d < 5; d += 1) counts[draw()] += 1
        let bestIdx = -1, bestCount = 0
        counts.forEach((c, i) => { if (c > bestCount) { bestCount = c; bestIdx = i } })
        sum += rawPayoutFor(bestCount, bestIdx === -1 ? GEM_WEIGHTS.length - 1 : bestIdx)
    }
    const meanReturn = sum / N
    return meanReturn > 0 ? DIAMONDS_RTP / meanReturn : 1
})()

function payoutFor(matchCount, gemIndex, funBoost = 1) {
    return round2(rawPayoutFor(matchCount, gemIndex) * DIAMONDS_SCALE * funBoost)
}

function pickGem() {
    const total = GEMS.reduce((s, g) => s + g.weight, 0)
    const r = nextRoll('diamonds').roll * total
    let acc = 0
    for (let i = 0; i < GEMS.length; i += 1) {
        acc += GEMS[i].weight
        if (r < acc) return i
    }
    return GEMS.length - 1
}

export default function DiamondsGame() {
    useGameBgm('diamonds', 'idle')
    const definition = findGameDefinition('diamonds') || { name: 'Diamonds', category: 'Arcade originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('diamonds')
    const session = useGameSession('diamonds')
    const preloader = useOriginalsPreloader('diamonds')

    const [slots, setSlots] = useState(Array(5).fill(null))
    const [matchedIndex, setMatchedIndex] = useState(null) // gem index that scored
    const [running, setRunning] = useState(false)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [lastMultiplier, setLastMultiplier] = useState(0)

    const handleEvent = useCallback((ev) => {
        if (!ev) return
        switch (ev.type) {
            case ROUND_EVENTS.INPUT_LOCK:
                setRunning(true)
                break
            case ROUND_EVENTS.RNG_REVEAL:
                if (Array.isArray(ev.payload?.slots)) setSlots(ev.payload.slots)
                if (Number.isFinite(ev.payload?.matchedIndex)) setMatchedIndex(ev.payload.matchedIndex)
                sfx.play('reveal')
                break
            case ROUND_EVENTS.ROUND_RESULT: {
                const { won, multiplier, profit } = ev.payload || {}
                setLastMultiplier(multiplier || 0)
                setToast({
                    kind: won ? 'win' : 'lose',
                    multiplier: won ? multiplier : null,
                    amount: profit,
                    message: won ? 'Diamonds match' : 'No match',
                })
                if (won) sfx.play('win'); else sfx.play('lose')
                break
            }
            case ROUND_EVENTS.INPUT_UNLOCK:
                setRunning(false)
                break
            default:
                break
        }
    }, [sfx])

    const machine = useRoundMachine({ onEvent: handleEvent })

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (running) { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Diamonds')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        setToast(null)
        setMatchedIndex(null)
        setSlots(Array(5).fill(null))
        playSound('tick')
        sfx.play('click')

        const drawn = Array.from({ length: 5 }, () => pickGem())
        const counts = new Array(GEMS.length).fill(0)
        drawn.forEach(g => { counts[g] += 1 })
        let bestIdx = -1
        let bestCount = 0
        counts.forEach((c, i) => {
            if (c > bestCount || (c === bestCount && i < bestIdx)) {
                bestCount = c
                bestIdx = i
            }
        })
        const multiplier = payoutFor(bestCount, bestIdx === -1 ? GEMS.length - 1 : bestIdx, isFunMode() ? FUN_PAYOUT_BOOST : 1)
        const won = multiplier > 0
        const returnAmount = won ? betAmount * multiplier : 0
        const profit = returnAmount - betAmount
        const matchedGemIndex = won ? bestIdx : null

        const events = buildEvents(api => {
            api.push(ROUND_EVENTS.ROUND_START, { betAmount }, 0)
            api.push(ROUND_EVENTS.INPUT_LOCK, {}, 0)
            api.push(ROUND_EVENTS.BET_ACCEPTED, { betAmount }, 0)
            api.push(ROUND_EVENTS.RNG_REVEAL, { slots: drawn, matchedIndex: matchedGemIndex }, REVEAL_MS - 80)
            api.push(ROUND_EVENTS.ROUND_RESULT, {
                won,
                profit,
                multiplier,
                slots: drawn,
                matchCount: bestCount,
            }, REVEAL_MS)
            api.push(ROUND_EVENTS.PAYOUT_PREVIEW, { amount: returnAmount }, REVEAL_MS + 16)
            api.push(ROUND_EVENTS.INPUT_UNLOCK, {}, REVEAL_MS + 220)
        })
        machine.start(events, { autoFinish: false })

        if (returnAmount > 0) addWinnings(returnAmount, 'Diamonds return')
        if (won && multiplier >= 12) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier })
        } else {
            playSound(won ? 'win' : 'loss')
        }
        const label = won ? `${bestCount}x ${GEMS[bestIdx].label}` : 'No match'
        session.record({
            id: crypto.randomUUID(),
            label,
            profit, betAmount, multiplier: won ? multiplier : 0,
            meta: { drawn, bestIdx, bestCount },
        })
        showToast(profit >= 0 ? 'win' : 'loss', label, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)

        setTimeout(() => resolve({ profit }), REVEAL_MS + 240)
    })

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#6fb6ff"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={running}
                    actionLabel="Reveal Gems"
                    onPlay={performPlay}
                    lastBet={lastBet}
                >
                    <p className="bp-hint">Best match across 5 gems pays. Diamond is rarest.</p>
                    {Number.isFinite(lastMultiplier) && lastMultiplier > 0 && (
                        <div className="bp-section">
                            <MultiplierBadge label="Last hit" value={lastMultiplier} state="win" size="sm" />
                        </div>
                    )}
                </BetPanel>
            }
            aside={
                <>
                    <StatsOverlay stats={session.stats} definition={definition} />
                    <HistoryDrawer history={session.history} onClear={session.clear} />
                </>
            }
        >
            <CoreStageFrame minHeight={520} maxWidth={840} loading={!preloader.ready} className="diamonds-stage-frame">
                <div className="diamonds-stage">
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <div className="diamonds-row" data-mobile-critical-surface>
                        {slots.map((g, i) => {
                            const isMatch = Number.isInteger(matchedIndex) && g === matchedIndex
                            return (
                                <div key={i} className={`diamond-slot ${g !== null ? 'revealed' : ''} ${isMatch ? 'match' : ''}`}>
                                    {g === null ? '?' : GEMS[g].sym}
                                </div>
                            )
                        })}
                    </div>
                    <div className="diamonds-paytable">
                        <span>5x <strong>80×</strong></span>
                        <span>4x <strong>12×</strong></span>
                        <span>3x <strong>2.2×</strong></span>
                        <span>2x <strong>1.1×</strong></span>
                    </div>
                    <ActionLockOverlay active={running} label="Revealing..." />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('diamonds')} />
            <EducationPanel definition={definition} betAmount={5} winProbability={0.32} payoutMultiplier={1.5} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
