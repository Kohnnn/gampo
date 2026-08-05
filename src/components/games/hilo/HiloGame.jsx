import { useCallback, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
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
import CardFace, { CardBack } from '../../ui/CardFace'
import '../../ui/card-face.css'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './hilo.css'
import { useGameBgm } from '../../../audio/useBgm'

// Wave 2 retrofit. Hilo now uses the shared CardFace primitive and the
// round event machine. Stake guide section 7: deal 220-320ms travel,
// flip 260-420ms 3D rotate.
const FLIP_DURATION_MS = 380
const SUITS = ['S', 'H', 'D', 'C']

const renderRank = (v) => v === 1 ? 'A' : v === 11 ? 'J' : v === 12 ? 'Q' : v === 13 ? 'K' : String(v)

function pickSuit(rng) {
    const idx = Math.floor(rng().roll * SUITS.length)
    return SUITS[Math.min(SUITS.length - 1, Math.max(0, idx))]
}

export default function HiloGame() {
    useGameBgm('hilo', 'idle')
    const definition = findGameDefinition('hilo')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('hilo')
    const session = useGameSession('hilo')
    const preloader = useOriginalsPreloader('hilo')

    const [direction, setDirection] = useState('higher')
    const [currentCard, setCurrentCard] = useState({ rank: 7, suit: 'S' })
    const [nextCard, setNextCard] = useState(null)
    const [streak, setStreak] = useState(0)
    const [flipping, setFlipping] = useState(false)
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [revealedFace, setRevealedFace] = useState(false)

    const winChance = direction === 'higher' ? (13 - currentCard.rank) / 13 : (currentCard.rank - 1) / 13
    // RTP-lock incl. the tie refund. P(tie)=1/13 refunds the stake (EV 1/13),
    // so total RTP = winChance·payout + 1/13. Solve for the target so a tie
    // no longer pushes RTP over 100%. payout = (rtp − 1/13)/winChance.
    const HILO_RTP = 0.96
    const hiloTargetRtp = (isFunMode() ? HILO_RTP * FUN_PAYOUT_BOOST : HILO_RTP) - (1 / 13)
    const payout = winChance > 0 ? Math.max(1.01, hiloTargetRtp / winChance) : 0

    const handleEvent = useCallback((ev) => {
        if (!ev) return
        switch (ev.type) {
            case ROUND_EVENTS.INPUT_LOCK:
                setFlipping(true)
                setRevealedFace(false)
                break
            case ROUND_EVENTS.STAGE_SELECT:
                if (ev.payload?.kind === 'card-flip-start') sfx.play('flip')
                break
            case ROUND_EVENTS.RNG_REVEAL:
                if (ev.payload?.card) {
                    setNextCard(ev.payload.card)
                    setRevealedFace(true)
                }
                break
            case ROUND_EVENTS.ROUND_RESULT: {
                const { won, push, profit, multiplier, card } = ev.payload || {}
                setLastWon(push ? null : !!won)
                setBurstKey(k => k + 1)
                setToast({
                    kind: push ? 'push' : won ? 'win' : 'lose',
                    multiplier: won ? multiplier : null,
                    amount: profit,
                    message: push ? 'Push' : won ? `Hi-Lo hit ${renderRank(card.rank)}` : `Hi-Lo miss ${renderRank(card.rank)}`,
                })
                if (won) sfx.play('win'); else if (!push) sfx.play('lose')
                break
            }
            case ROUND_EVENTS.INPUT_UNLOCK:
                setFlipping(false)
                break
            default:
                break
        }
    }, [sfx])

    const machine = useRoundMachine({ onEvent: handleEvent })

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (winChance <= 0) { showToast('error', 'No winning cards', 'Choose other direction'); resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Hi-Lo')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        setLastBet(betAmount)
        setToast(null)
        playSound('flip')
        sfx.play('click')

        const next = { rank: Math.floor(nextRoll('hilo').roll * 13) + 1, suit: pickSuit(() => nextRoll('hilo')) }
        const push = next.rank === currentCard.rank
        const won = direction === 'higher' ? next.rank > currentCard.rank : next.rank < currentCard.rank
        const returnAmount = push ? betAmount : won ? betAmount * payout : 0
        const profit = returnAmount - betAmount

        const events = buildEvents(api => {
            api.push(ROUND_EVENTS.ROUND_START, { current: currentCard, direction }, 0)
            api.push(ROUND_EVENTS.INPUT_LOCK, {}, 0)
            api.push(ROUND_EVENTS.BET_ACCEPTED, { betAmount, direction }, 0)
            api.push(ROUND_EVENTS.STAGE_SELECT, { kind: 'card-flip-start' }, 60)
            api.push(ROUND_EVENTS.RNG_REVEAL, { card: next }, FLIP_DURATION_MS - 60)
            api.push(ROUND_EVENTS.ROUND_RESULT, {
                won,
                push,
                profit,
                multiplier: won ? payout : 0,
                card: next,
                direction,
            }, FLIP_DURATION_MS)
            api.push(ROUND_EVENTS.PAYOUT_PREVIEW, { amount: returnAmount }, FLIP_DURATION_MS + 16)
            api.push(ROUND_EVENTS.INPUT_UNLOCK, {}, FLIP_DURATION_MS + 220)
        })
        machine.start(events, { autoFinish: false })

        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Hi-Lo return')
            setCurrentCard(next)
            setStreak(prev => won ? prev + 1 : 0)
            if (won && payout >= 5) {
                playSound('bigwin')
                setBigWin({ trigger: Date.now(), profit, multiplier: payout })
            } else {
                playSound(won ? 'win' : push ? 'click' : 'loss')
            }
            session.record({
                id: crypto.randomUUID(),
                label: push ? 'Push' : won ? `Win → ${renderRank(next.rank)}` : `Miss → ${renderRank(next.rank)}`,
                profit, betAmount,
                meta: { current: currentCard, next, direction },
            })
            showToast(won ? 'win' : push ? 'bet' : 'loss', push ? 'Push' : won ? 'Hi-Lo hit' : 'Hi-Lo miss', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            resolve({ profit })
        }, FLIP_DURATION_MS + 240)
    })

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#c8a45d"
            backdrop="/assets/games/backdrops/backdrop-felt-green.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={flipping}
                    actionLabel="Draw Card"
                    mobilePlayLabel="Draw"
                    onPlay={performPlay}
                    lastBet={lastBet}
                >
                    <div className="bp-section">
                        <label className="bp-label">Direction</label>
                        <SegmentedModeTabs
                            options={[
                                { value: 'higher', label: 'Higher' },
                                { value: 'lower', label: 'Lower' },
                            ]}
                            value={direction}
                            onChange={d => !flipping && setDirection(d)}
                            size="sm"
                        />
                    </div>
                    <div className="bp-bal-line">
                        <span>Hit chance</span>
                        <strong>{(winChance * 100).toFixed(1)}%</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Payout</span>
                        <strong>{payout.toFixed(2)}×</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Streak</span>
                        <strong className={streak >= 3 ? 'hilo-streak-flair' : ''}>{streak}{streak >= 3 ? ' 🔥' : ''}</strong>
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
            <CoreStageFrame minHeight={520} maxWidth={920} loading={!preloader.ready} className="hilo-stage-frame" mobileScrollable>
                <div className={`hilo-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                    <RecentResultsStrip results={session.stats.lastResults} />
                    <div className="hilo-cards" data-mobile-critical-surface>
                        <CardFace rank={renderRank(currentCard.rank)} suit={currentCard.suit} size="lg" />
                        <span className="hilo-arrow">{direction === 'higher' ? '↑' : '↓'}</span>
                        {revealedFace && nextCard ? (
                            <CardFace rank={renderRank(nextCard.rank)} suit={nextCard.suit} size="lg" dealing className={lastWon === true ? 'won' : lastWon === false ? 'lost' : ''} />
                        ) : (
                            <CardBack size="lg" dealing={flipping} />
                        )}
                    </div>
                    <div className="hilo-meta">
                        <MultiplierBadge label="Payout" value={payout} state={lastWon === true ? 'win' : lastWon === false ? 'bust' : 'idle'} size="sm" />
                    </div>
                    {lastWon && burstKey > 0 && <Particles key={burstKey} count={12} color="#ffcf5a" />}
                    <ActionLockOverlay active={flipping} label="Drawing..." />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('hilo')} />
            <EducationPanel definition={definition} betAmount={5} winProbability={winChance || 0.01} payoutMultiplier={payout || 1} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
