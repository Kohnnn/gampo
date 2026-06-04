import { useCallback, useEffect, useRef, useState } from 'react'
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
    MultiplierBadge,
    ResultToast,
    ActionLockOverlay,
    CoreStageFrame,
    ROUND_EVENTS,
    useRoundMachine,
} from '../primitives'
import { useOriginalsPreloader } from '../../games/resources/useOriginalsPreloader'
import { Particles } from '../../fx'
import CardFace, { CardBack } from '../../ui/CardFace'
import EducationPanel from '../../EducationPanel'
import './videopoker.css'
import { useGameBgm } from '../../../audio/useBgm'

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUITS = ['S', 'H', 'D', 'C']
function rankValue(r) { return r === 'A' ? 14 : r === 'K' ? 13 : r === 'Q' ? 12 : r === 'J' ? 11 : Number(r) }

function buildShuffledDeck() {
    const deck = []
    for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s })
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(nextRoll('vp-shuffle').roll * (i + 1))
        ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }
    return deck
}

function evaluateHand(cards) {
    const values = cards.map(c => rankValue(c.rank)).sort((a, b) => a - b)
    const counts = values.reduce((m, v) => ({ ...m, [v]: (m[v] || 0) + 1 }), {})
    const groups = Object.values(counts).sort((a, b) => b - a)
    const flush = cards.every(c => c.suit === cards[0].suit)
    const lowAce = values.join(',') === '2,3,4,5,14'
    const straight = lowAce || values.every((v, i) => i === 0 || v === values[i - 1] + 1)
    if (flush && values[0] === 10 && straight) return { label: 'Royal Flush', multiplier: 250 }
    if (flush && straight) return { label: 'Straight Flush', multiplier: 50 }
    if (groups[0] === 4) return { label: 'Four Kind', multiplier: 25 }
    if (groups[0] === 3 && groups[1] === 2) return { label: 'Full House', multiplier: 9 }
    if (flush) return { label: 'Flush', multiplier: 6 }
    if (straight) return { label: 'Straight', multiplier: 4 }
    if (groups[0] === 3) return { label: 'Three Kind', multiplier: 3 }
    if (groups[0] === 2 && groups[1] === 2) return { label: 'Two Pair', multiplier: 2 }
    const pairValue = Number(Object.entries(counts).find(([, c]) => c === 2)?.[0] || 0)
    if (pairValue >= 11 || pairValue === 14) return { label: 'Jacks or Better', multiplier: 1 }
    return { label: 'No Pay', multiplier: 0 }
}

const PAYTABLE = [
    { key: 'Royal Flush', multiplier: 250 },
    { key: 'Straight Flush', multiplier: 50 },
    { key: 'Four Kind', multiplier: 25 },
    { key: 'Full House', multiplier: 9 },
    { key: 'Flush', multiplier: 6 },
    { key: 'Straight', multiplier: 4 },
    { key: 'Three Kind', multiplier: 3 },
    { key: 'Two Pair', multiplier: 2 },
    { key: 'Jacks or Better', multiplier: 1 },
]

export default function VideoPokerGame() {
    useGameBgm('videopoker', 'idle')
    const definition = findGameDefinition('videopoker')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('videopoker')
    const session = useGameSession('videopoker')
    const preloader = useOriginalsPreloader('videopoker')

    const [cards, setCards] = useState([])
    const [held, setHeld] = useState([])
    const [phase, setPhase] = useState('idle') // idle | draw
    const [activeBet, setActiveBet] = useState(0)
    const [outcomeKey, setOutcomeKey] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [dealKey, setDealKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [lastMultiplier, setLastMultiplier] = useState(0)
    const [holdPulseIndex, setHoldPulseIndex] = useState(null)
    const holdPulseTimer = useRef(null)

    useEffect(() => () => {
        if (holdPulseTimer.current) window.clearTimeout(holdPulseTimer.current)
    }, [])

    const toggleHold = useCallback((index) => {
        setHeld(prev => prev.includes(index) ? prev.filter(x => x !== index) : [...prev, index])
        if (holdPulseTimer.current) window.clearTimeout(holdPulseTimer.current)
        setHoldPulseIndex(index)
        holdPulseTimer.current = window.setTimeout(() => setHoldPulseIndex(null), 220)
    }, [])

    const machine = useRoundMachine({})

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (phase === 'draw') { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Video Poker')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        setLastBet(betAmount)
        setToast(null)
        playSound('deal')
        sfx.play('click')
        machine.start([
            { index: 0, type: ROUND_EVENTS.ROUND_START, payload: { betAmount }, at: 0 },
            { index: 1, type: ROUND_EVENTS.INPUT_LOCK, payload: {}, at: 0 },
            { index: 2, type: ROUND_EVENTS.BET_ACCEPTED, payload: { betAmount }, at: 0 },
        ], { autoFinish: false })
        setCards(buildShuffledDeck().slice(0, 5))
        setHeld([])
        setHoldPulseIndex(null)
        setActiveBet(betAmount)
        setPhase('draw')
        setOutcomeKey(null)
        setDealKey(k => k + 1)
        resolve({ profit: 0 })
    })

    const draw = () => {
        playSound('flip')
        sfx.play('reveal')
        const remainder = buildShuffledDeck().filter(card => !cards.some(e => e.rank === card.rank && e.suit === card.suit))
        let idx = 0
        const finalCards = cards.map((c, i) => held.includes(i) ? c : remainder[idx++])
        const outcome = evaluateHand(finalCards)
        const returnAmount = activeBet * outcome.multiplier
        const profit = returnAmount - activeBet
        if (returnAmount > 0) addWinnings(returnAmount, 'Video Poker return')
        setCards(finalCards)
        setPhase('idle')
        setActiveBet(0)
        setOutcomeKey(outcome.label)
        setLastMultiplier(outcome.multiplier)
        setBurstKey(k => k + 1)
        setDealKey(k => k + 1)
        if (outcome.multiplier >= 9) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: outcome.multiplier })
        } else {
            playSound(returnAmount > 0 ? 'win' : 'loss')
        }
        sfx.play(profit > 0 ? 'win' : 'lose')
        setToast({
            kind: profit > 0 ? 'win' : profit === 0 ? 'push' : 'lose',
            multiplier: outcome.multiplier > 0 ? outcome.multiplier : null,
            amount: profit,
            message: outcome.label,
        })
        machine.finish({ kind: outcome.label, profit, multiplier: outcome.multiplier })
        session.record({
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label: outcome.label,
            profit, betAmount: activeBet || profit + activeBet, multiplier: outcome.multiplier,
            meta: { hand: finalCards },
        })
        showToast(profit >= 0 ? 'win' : 'loss', outcome.label, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
    }

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#8ae66e"
            backdrop="/assets/games/backdrops/backdrop-felt-green.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={false}
                    actionLabel="Deal"
                    onPlay={performPlay}
                    disableAuto
                    lastBet={lastBet}
                    playPhase={phase === 'draw' ? 'in-round' : null}
                    playLabel={phase === 'draw' ? 'Draw' : 'Deal'}
                    mobilePlayLabel={phase === 'draw' ? 'Draw' : 'Deal'}
                    onPlayPhaseAction={draw}
                >
                    <p className="bp-hint">Click cards to hold; Draw replaces unheld cards.</p>
                    {Number.isFinite(lastMultiplier) && lastMultiplier > 0 && (
                        <div className="bp-section">
                            <MultiplierBadge label="Last hand" value={lastMultiplier} state="win" size="sm" />
                        </div>
                    )}
                </BetPanel>
            }
            aside={<><StatsOverlay stats={session.stats} definition={definition} /><HistoryDrawer history={session.history} onClear={session.clear} /></>}
        >
            <CoreStageFrame minHeight={520} maxWidth={920} loading={!preloader.ready} className="vp-stage-frame" mobileScrollable>
                <div className="vp-stage">
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <div className="vp-row" data-mobile-critical-surface>
                        {phase === 'idle' && cards.length === 0 && (
                            <div className="vp-empty-overlay">Click Deal to start</div>
                        )}
                        {(cards.length ? cards : Array.from({ length: 5 }, () => null)).map((card, i) => (
                            <button
                                key={`${dealKey}-${i}`}
                                className={`vp-card-slot ${held.includes(i) ? 'held' : ''} ${holdPulseIndex === i ? 'hold-pulse' : ''}`}
                                disabled={!card || phase !== 'draw'}
                                style={{ animationDelay: `${i * 90}ms` }}
                                onClick={() => toggleHold(i)}
                            >
                                {card
                                    ? <CardFace rank={card.rank} suit={card.suit} dealing size="lg" />
                                    : <CardBack size="lg" />}
                                {held.includes(i) && <span className="vp-hold">HOLD</span>}
                            </button>
                        ))}
                    </div>
                    <details className="vp-paytable-shell" open>
                        <summary>Paytable</summary>
                        <div className="vp-paytable">
                            {PAYTABLE.map(row => (
                                <div key={row.key} className={`vp-paytable-row ${outcomeKey === row.key ? 'won' : ''}`}>
                                    <span>{row.key}</span><strong>{row.multiplier}×</strong>
                                </div>
                            ))}
                        </div>
                    </details>
                    {outcomeKey && burstKey > 0 && <Particles key={burstKey} count={14} color="#8ae66e" />}
                    <ActionLockOverlay active={false} />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={9} />
            <EducationPanel definition={definition} betAmount={5} winProbability={0.45} payoutMultiplier={1.85} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
