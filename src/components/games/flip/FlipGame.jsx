// Stake-style Flip game (Wave 3, separate from /coinflip).
//
// Single coin, side pick (Heads / Tails), full deterministic round
// driven by the round event machine.

import { useCallback, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits, round2 } from '../../../utils/simulationMath'
import { useCancellableTimeouts } from '../../../utils/scheduling'
import { nextRoll } from '../../../utils/fairRng'
import { getBigWinThreshold,
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
    buildEvents,
    useRoundMachine,
} from '../primitives'
import { useOriginalsPreloader } from '../../games/resources/useOriginalsPreloader'
import EducationPanel from '../../EducationPanel'
import './flip.css'
import { useGameBgm } from '../../../audio/useBgm'

const FLIP_DURATION_MS = 760
const PAYOUT = 1.96 // ~2% house edge per Stake-style fair-coin product
const HOUSE_EDGE = 1 - PAYOUT / 2

export default function FlipGame() {
    useGameBgm('flip', 'idle')
    const definition = findGameDefinition('flip') || { name: 'Flip', category: 'Arcade originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('flip')
    const session = useGameSession('flip')
    const preloader = useOriginalsPreloader('flip')

    const [side, setSide] = useState('heads')
    const [showSide, setShowSide] = useState('heads')
    const [running, setRunning] = useState(false)
    const [lastResult, setLastResult] = useState(null) // 'heads' | 'tails' | null
    const [lastWon, setLastWon] = useState(null)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [spinning, setSpinning] = useState(false)
    const { schedule } = useCancellableTimeouts()

    const handleEvent = useCallback((ev) => {
        if (!ev) return
        switch (ev.type) {
            case ROUND_EVENTS.INPUT_LOCK:
                setRunning(true)
                setSpinning(true)
                break
            case ROUND_EVENTS.RNG_REVEAL:
                if (ev.payload?.side) setShowSide(ev.payload.side)
                sfx.play('reveal')
                break
            case ROUND_EVENTS.ROUND_RESULT: {
                const { won, profit, multiplier, side: revealed } = ev.payload || {}
                setLastResult(revealed)
                setLastWon(!!won)
                setSpinning(false)
                setToast({
                    kind: won ? 'win' : 'lose',
                    multiplier: won ? multiplier : null,
                    amount: profit,
                    message: won ? 'Heads up!' : 'Wrong side',
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
        if (!placeBet(betAmount, 'Flip')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        setToast(null)
        setLastWon(null)
        playSound('click')
        sfx.play('click')

        const { roll } = nextRoll('flip')
        const revealed = roll < 0.5 ? 'heads' : 'tails'
        const won = revealed === side
        const returnAmount = won ? round2(betAmount * PAYOUT) : 0
        const profit = round2(returnAmount - betAmount)

        const events = buildEvents(api => {
            api.push(ROUND_EVENTS.ROUND_START, { side }, 0)
            api.push(ROUND_EVENTS.INPUT_LOCK, {}, 0)
            api.push(ROUND_EVENTS.BET_ACCEPTED, { betAmount, side }, 0)
            api.push(ROUND_EVENTS.RNG_REVEAL, { side: revealed }, FLIP_DURATION_MS - 80)
            api.push(ROUND_EVENTS.ROUND_RESULT, {
                won,
                profit,
                multiplier: PAYOUT,
                side: revealed,
                pick: side,
            }, FLIP_DURATION_MS)
            api.push(ROUND_EVENTS.PAYOUT_PREVIEW, { amount: returnAmount }, FLIP_DURATION_MS + 16)
            api.push(ROUND_EVENTS.INPUT_UNLOCK, {}, FLIP_DURATION_MS + 240)
        })
        machine.start(events, { autoFinish: false })

        if (returnAmount > 0) addWinnings(returnAmount, 'Flip return')
        if (won && PAYOUT >= 5) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: PAYOUT })
        } else {
            playSound(won ? 'win' : 'loss')
        }
        session.record({
            id: crypto.randomUUID(),
            label: `${revealed === 'heads' ? 'H' : 'T'} ${won ? 'win' : 'miss'}`,
            profit, betAmount, multiplier: won ? PAYOUT : 0,
            meta: { side, revealed },
        })
        showToast(won ? 'win' : 'loss', won ? 'Flip win' : 'Flip miss', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)

        schedule(() => resolve({ profit }), FLIP_DURATION_MS + 260)
    })

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)

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
                    actionLabel="Flip"
                    onPlay={performPlay}
                    lastBet={lastBet}
                >
                    <div className="bp-section">
                        <label className="bp-label">Side</label>
                        <SegmentedModeTabs
                            options={[
                                { value: 'heads', label: 'Heads' },
                                { value: 'tails', label: 'Tails' },
                            ]}
                            value={side}
                            onChange={s => !running && setSide(s)}
                            size="md"
                        />
                    </div>
                    <div className="bp-bal-line">
                        <span>Win chance</span>
                        <strong>50.00%</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Multiplier</span>
                        <strong>{PAYOUT.toFixed(2)}×</strong>
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
            <CoreStageFrame minHeight={520} maxWidth={840} loading={!preloader.ready} className="flip-stage-frame">
                <div className="flip-stage" data-mobile-critical-surface>
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <div className={`flip-coin ${showSide} ${spinning ? 'spin' : ''}`} aria-label={`Coin showing ${showSide}`}>
                        <span>{showSide === 'heads' ? 'H' : 'T'}</span>
                    </div>
                    <div className="flip-side-row">
                        <button className={`flip-side-chip ${side === 'heads' ? 'active' : ''}`} disabled={running} onClick={() => setSide('heads')}>Heads</button>
                        <button className={`flip-side-chip ${side === 'tails' ? 'active' : ''}`} disabled={running} onClick={() => setSide('tails')}>Tails</button>
                    </div>
                    <div className="flip-meta">
                        <MultiplierBadge label="Multiplier" value={PAYOUT} state={running ? 'active' : lastWon === true ? 'win' : lastWon === false ? 'bust' : 'idle'} size="sm" />
                    </div>
                    <ActionLockOverlay active={running} label="Flipping..." />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('flip')} />
            <EducationPanel definition={definition} betAmount={5} winProbability={0.5} payoutMultiplier={PAYOUT} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
