// Stake-style Moles (Wave 3, distinct from Mines).
//
// 3x3 grid. Player picks N holes (selection phase). Submit reveals all
// 9 holes simultaneously; payout scales with how many of the player's
// picks contained moles, weighted by the configured mole count and
// pick count.
//
// Distinct from Mines: Mines is sequential reveal with cashout, this
// is a single-batch reveal where the math is hypergeometric.

import { useCallback, useMemo, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { isFunMode, FUN_PAYOUT_BOOST } from '../../../utils/funMode'
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
import './moles.css'
import { useGameBgm } from '../../../audio/useBgm'

const GRID = 9
const REVEAL_MS = 580
const MOLES_RTP = 0.96

// Raw payout shape (relative). The lift/sweep terms make this NOT
// probability-locked, so realized RTP drifted to 96%–144% depending on config.
// We calibrate a per-config scalar by simulation so realized RTP == MOLES_RTP.
function rawPayoutFor(hits, picks, moles) {
    if (picks <= 0 || hits <= 0) return 0
    const expected = (picks * moles) / GRID
    const lift = hits / Math.max(0.01, expected)
    const sweepBonus = hits === picks ? 1.5 : 1
    const baseCount = picks
    return lift * sweepBonus * (1 + (hits - 1) * 0.3 / Math.max(1, baseCount))
}

// Memoized calibration: mean raw return for a (picks, moles) config under fair
// hypergeometric placement, so scale = RTP / meanRawReturn.
const moleScaleCache = new Map()
function moleScale(picks, moles) {
    const key = `${picks}:${moles}`
    if (moleScaleCache.has(key)) return moleScaleCache.get(key)
    let seed = 0x1234567 ^ (picks * 131 + moles * 17)
    const rng = () => {
        seed = (Math.imul(seed ^ (seed >>> 15), seed | 1) >>> 0)
        seed ^= seed + Math.imul(seed ^ (seed >>> 7), seed | 61)
        return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296
    }
    const N = 120000
    let sum = 0
    for (let n = 0; n < N; n += 1) {
        // place `moles` on GRID, pick `picks` distinct cells, count hits
        const moleSet = new Set()
        while (moleSet.size < moles) moleSet.add(Math.floor(rng() * GRID))
        const cells = Array.from({ length: GRID }, (_, i) => i)
        let hits = 0
        for (let p = 0; p < picks; p += 1) {
            const idx = Math.floor(rng() * cells.length)
            const cell = cells.splice(idx, 1)[0]
            if (moleSet.has(cell)) hits += 1
        }
        sum += rawPayoutFor(hits, picks, moles)
    }
    const mean = sum / N
    const scale = mean > 0 ? MOLES_RTP / mean : 1
    moleScaleCache.set(key, scale)
    return scale
}

function payoutFor(hits, picks, moles, funBoost = 1) {
    if (picks <= 0 || hits <= 0) return 0
    return Number((rawPayoutFor(hits, picks, moles) * moleScale(picks, moles) * funBoost).toFixed(3))
}

function placeMoles(count) {
    const cells = Array.from({ length: GRID }, (_, i) => i)
    const out = new Set()
    while (out.size < count) {
        const { roll } = nextRoll('moles')
        const idx = Math.floor(roll * cells.length)
        const v = cells.splice(idx, 1)[0]
        if (v != null) out.add(v)
    }
    return out
}

export default function MolesGame() {
    useGameBgm('moles', 'idle')
    const definition = findGameDefinition('moles') || { name: 'Moles', category: 'Arcade originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('moles')
    const session = useGameSession('moles')
    const preloader = useOriginalsPreloader('moles')

    const [moleCount, setMoleCount] = useState(3)
    const [picks, setPicks] = useState([])
    const [moles, setMoles] = useState(null)
    const [revealed, setRevealed] = useState(false)
    const [running, setRunning] = useState(false)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)

    const machine = useRoundMachine({})

    const togglePick = (i) => {
        if (running || revealed) return
        setPicks(prev => prev.includes(i) ? prev.filter(x => x !== i) : prev.length < 5 ? [...prev, i] : prev)
    }

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (running) { resolve({ profit: 0 }); return }
        if (picks.length === 0) { showToast('error', 'No picks', 'Tap holes to pick first'); resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Moles')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        setToast(null)
        setRevealed(false)
        playSound('click')
        sfx.play('click')

        const placed = placeMoles(moleCount)
        const hits = picks.filter(p => placed.has(p)).length
        const multiplier = payoutFor(hits, picks.length, moleCount, isFunMode() ? FUN_PAYOUT_BOOST : 1)
        const won = multiplier > 0
        const returnAmount = won ? betAmount * multiplier : 0
        const profit = returnAmount - betAmount

        setRunning(true)
        machine.start([
            { index: 0, type: ROUND_EVENTS.ROUND_START, payload: { picks, moleCount }, at: 0 },
            { index: 1, type: ROUND_EVENTS.INPUT_LOCK, payload: {}, at: 0 },
            { index: 2, type: ROUND_EVENTS.BET_ACCEPTED, payload: { betAmount }, at: 0 },
        ], { autoFinish: false })

        window.setTimeout(() => {
            setMoles(placed)
            setRevealed(true)
            sfx.play('reveal')
            if (returnAmount > 0) addWinnings(returnAmount, 'Moles return')
            const message = `${hits} of ${picks.length}`
            setToast({
                kind: won ? 'win' : 'lose',
                multiplier: won ? multiplier : null,
                amount: profit,
                message,
            })
            if (won && multiplier >= 5) {
                playSound('bigwin')
                setBigWin({ trigger: Date.now(), profit, multiplier })
            } else {
                playSound(won ? 'win' : 'loss')
            }
            sfx.play(won ? 'win' : 'lose')
            machine.finish({ kind: won ? 'win' : 'lose', profit, multiplier, hits })
            session.record({
                id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                label: `${hits}/${picks.length} hits`,
                profit, betAmount, multiplier: won ? multiplier : 0,
                meta: { hits, picks, moleCount },
            })
            showToast(profit >= 0 ? 'win' : 'loss', `Moles ${hits}/${picks.length}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            setRunning(false)
            // Next round resets after settling
            window.setTimeout(() => {
                setRevealed(false)
                setPicks([])
                setMoles(null)
            }, 1300)
            resolve({ profit })
        }, REVEAL_MS)
    })

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)
    const expectedHits = useMemo(() => (picks.length * moleCount) / GRID, [picks.length, moleCount])

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ffcf5a"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={running}
                    actionLabel={`Reveal Moles (${picks.length})`}
                    onPlay={performPlay}
                    lastBet={lastBet}
                >
                    <div className="bp-section">
                        <label className="bp-label">Moles in board</label>
                        <div className="moles-controls">
                            {[1, 2, 3, 4, 5].map(n => (
                                <button key={n} className={`moles-control-chip ${moleCount === n ? 'active' : ''}`} disabled={running || revealed} onClick={() => setMoleCount(n)}>{n}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-bal-line">
                        <span>Picks</span>
                        <strong>{picks.length}/5</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Expected hits</span>
                        <strong>{expectedHits.toFixed(2)}</strong>
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
            <CoreStageFrame minHeight={520} maxWidth={840} loading={!preloader.ready} className="moles-stage-frame">
                <div className="moles-stage">
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <div className="moles-grid">
                        {Array.from({ length: GRID }, (_, i) => {
                            const isPicked = picks.includes(i)
                            const isMole = moles?.has(i)
                            const cls = revealed
                                ? (isMole ? (isPicked ? 'mole' : 'mole') : (isPicked ? 'empty revealed' : 'empty revealed'))
                                : (isPicked ? 'selected' : '')
                            return (
                                <button
                                    key={i}
                                    className={`moles-hole ${cls}`}
                                    disabled={running || revealed}
                                    onClick={() => togglePick(i)}
                                    aria-label={`Hole ${i + 1}${isPicked ? ' selected' : ''}`}
                                >
                                    {revealed ? (isMole ? '🟡' : '·') : (isPicked ? '?' : '')}
                                </button>
                            )
                        })}
                    </div>
                    <ActionLockOverlay active={running} label="Revealing..." />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                    <MultiplierBadge label="Picks" value={picks.length} suffix="" size="sm" state={running ? 'active' : 'idle'} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={5} winProbability={(GRID - moleCount) / GRID} payoutMultiplier={1.5} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
