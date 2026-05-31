// Stake-style Tarot (Wave 4 Batch 4B).
//
// Player picks a suit (Wands / Cups / Swords / Pentacles) before the
// reveal. Three cards are drawn as Past / Present / Future from a
// curated 22-card Major Arcana deck (each card mapped to a suit). Cards
// matching the chosen suit get a 3x bonus on their base contribution.
// Round payout = sum of three card contributions vs stake.

import { useState } from 'react'
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
import EducationPanel from '../../EducationPanel'
import TarotCardArt from './TarotCardArt'
import { contributionFor, drawSpread, expectedMultiplierForSuit, SUITS, TARGET_RTP, topContributionForSuit } from './tarotModel'
import './tarot.css'
import { useGameBgm } from '../../../audio/useBgm'

const REVEAL_DELAY_MS = 360
const REVEAL_STAGGER_MS = 240
const POSITIONS = ['Past', 'Present', 'Future']

export default function TarotGame() {
    useGameBgm('tarot', 'idle')
    const definition = findGameDefinition('tarot') || { name: 'Tarot', category: 'Arcade originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('tarot')
    const session = useGameSession('tarot')
    const preloader = useOriginalsPreloader('tarot')

    const [pickedSuit, setPickedSuit] = useState('wands')
    const [running, setRunning] = useState(false)
    const [revealed, setRevealed] = useState([null, null, null]) // { card, contribution, matched }
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)

    const machine = useRoundMachine({})

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (running) { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Tarot')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        setRunning(true)
        setToast(null)
        setRevealed([null, null, null])
        playSound('click')
        sfx.play('click')

        const draws = drawSpread(() => nextRoll('tarot').roll)
        const contributions = draws.map(c => ({ card: c, contribution: contributionFor(c, pickedSuit), matched: c.suit === pickedSuit }))
        const totalMult = Number(contributions.reduce((s, r) => s + r.contribution, 0).toFixed(3))
        const returnAmount = betAmount * totalMult
        const profit = returnAmount - betAmount

        machine.start([
            { index: 0, type: ROUND_EVENTS.ROUND_START, payload: { suit: pickedSuit }, at: 0 },
            { index: 1, type: ROUND_EVENTS.INPUT_LOCK, payload: {}, at: 0 },
            { index: 2, type: ROUND_EVENTS.BET_ACCEPTED, payload: { betAmount, suit: pickedSuit }, at: 0 },
        ], { autoFinish: false })

        contributions.forEach((entry, i) => {
            window.setTimeout(() => {
                setRevealed(prev => {
                    const out = [...prev]
                    out[i] = entry
                    return out
                })
                sfx.play('reveal')
            }, REVEAL_DELAY_MS + i * REVEAL_STAGGER_MS)
        })

        const totalDelay = REVEAL_DELAY_MS + contributions.length * REVEAL_STAGGER_MS + 320
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Tarot return')
            const headlineMult = totalMult
            const won = profit > 0
            setToast({
                kind: won ? 'win' : 'lose',
                multiplier: won ? headlineMult : null,
                amount: profit,
                message: contributions.map(c => c.card.name).join(', '),
            })
            if (won && headlineMult >= 5) {
                playSound('bigwin')
                setBigWin({ trigger: Date.now(), profit, multiplier: headlineMult })
            } else {
                playSound(won ? 'win' : 'loss')
            }
            sfx.play(won ? 'win' : 'lose')
            session.record({
                id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                label: `${pickedSuit} ${headlineMult.toFixed(2)}×`,
                profit, betAmount, multiplier: headlineMult,
                        meta: { suit: pickedSuit, draws: draws.map(c => c.id) },
            })
            machine.finish({ kind: won ? 'win' : 'lose', profit, multiplier: headlineMult, draws: draws.map(c => c.id) })
            showToast(won ? 'win' : 'loss', `Tarot ${pickedSuit}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            setRunning(false)
            resolve({ profit })
        }, totalDelay)
    })

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)
    const matchedCount = revealed.filter(r => r && r.matched).length

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#b478ff"
            backdrop="/assets/games/backdrops/backdrop-stars.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={running}
                    actionLabel={`Pull ${SUITS[pickedSuit].name}`}
                    onPlay={performPlay}
                    lastBet={lastBet}
                    disableAuto
                >
                    <p className="bp-hint">Pick a suit before pulling. Matching cards receive a 3× raw omen boost, then the spread is normalized to {Math.round(TARGET_RTP * 100)}% RTP.</p>
                    <div className="bp-bal-line">
                        <span>Suit bonus</span>
                        <strong>×3</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Top single</span>
                        <strong>×{topContributionForSuit(pickedSuit).toFixed(2)}</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Suit EV</span>
                        <strong>×{expectedMultiplierForSuit(pickedSuit).toFixed(2)}</strong>
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
            <CoreStageFrame minHeight={620} maxWidth={760} loading={!preloader.ready} className="tarot-stage-frame">
                <div className="tarot-stage">
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <div className="tarot-suit-row">
                        {(['wands', 'cups', 'swords', 'pentacles']).map(s => (
                            <button
                                key={s}
                                className={`tarot-suit-chip ${pickedSuit === s ? 'active' : ''}`}
                                disabled={running}
                                onClick={() => setPickedSuit(s)}
                            >
                                <span className="glyph" style={{ color: SUITS[s].color }}>{SUITS[s].mark}</span>
                                {SUITS[s].name}
                            </button>
                        ))}
                    </div>
                    <div className="tarot-spread">
                        {revealed.map((entry, i) => {
                            const card = entry?.card
                            const matched = entry?.matched
                            const cls = [
                                entry ? '' : 'hidden',
                                matched ? 'matched' : '',
                            ].join(' ')
                            return (
                                <div key={i} className={`tarot-slot ${cls}`} style={{ '--rarity': matched ? SUITS[pickedSuit].color : 'rgba(180, 120, 255, 0.45)' }}>
                                    <TarotCardArt
                                        card={card}
                                        hidden={!card}
                                        position={POSITIONS[i]}
                                        matched={matched}
                                        multiplier={entry?.contribution || 0}
                                    />
                                    {card && (
                                        <div className="tarot-card-readout">
                                            <span>{SUITS[card.suit].name}</span>
                                            <strong>{matched ? 'Matched omen' : 'Base omen'}</strong>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                    <div>
                        <MultiplierBadge label="Matched" value={matchedCount} suffix="" size="sm" state={running ? 'active' : 'idle'} />
                    </div>
                    <ActionLockOverlay active={running} label="Pulling..." />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={5} winProbability={0.42} payoutMultiplier={TARGET_RTP / 0.42} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
