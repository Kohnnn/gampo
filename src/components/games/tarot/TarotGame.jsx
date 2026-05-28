// Stake-style Tarot (Wave 4 Batch 4B).
//
// Player picks a suit (Wands / Cups / Swords / Pentacles) before the
// reveal. Three cards are drawn as Past / Present / Future from a
// curated 22-card Major Arcana deck (each card mapped to a suit). Cards
// matching the chosen suit get a 3x bonus on their base contribution.
// Round payout = sum of three card contributions vs stake.

import { useCallback, useState } from 'react'
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
import './tarot.css'
import { useGameBgm } from '../../../audio/useBgm'

const REVEAL_DELAY_MS = 360
const REVEAL_STAGGER_MS = 240
const POSITIONS = ['Past', 'Present', 'Future']

const SUITS = {
    wands: { id: 'wands', name: 'Wands', glyph: '🪄', color: '#ff7a7c' },
    cups: { id: 'cups', name: 'Cups', glyph: '🍷', color: '#4cc9f0' },
    swords: { id: 'swords', name: 'Swords', glyph: '⚔️', color: '#9aa3b3' },
    pentacles: { id: 'pentacles', name: 'Pentacles', glyph: '🪙', color: '#ffd166' },
}

// Major Arcana mapped to suits. Base values are designed to sum near
// the no-edge target across the four suits; we apply (1 - houseEdge) at
// settle.
const DECK = [
    { id: 'fool', name: 'The Fool', glyph: '🃏', suit: 'wands', base: 0.6 },
    { id: 'magician', name: 'The Magician', glyph: '🪄', suit: 'wands', base: 1.6 },
    { id: 'priestess', name: 'High Priestess', glyph: '🌙', suit: 'cups', base: 1.4 },
    { id: 'empress', name: 'The Empress', glyph: '👑', suit: 'pentacles', base: 1.4 },
    { id: 'emperor', name: 'The Emperor', glyph: '🏛️', suit: 'swords', base: 1.6 },
    { id: 'hierophant', name: 'The Hierophant', glyph: '📜', suit: 'pentacles', base: 1.0 },
    { id: 'lovers', name: 'The Lovers', glyph: '💞', suit: 'cups', base: 1.8 },
    { id: 'chariot', name: 'The Chariot', glyph: '🛡️', suit: 'swords', base: 2.0 },
    { id: 'strength', name: 'Strength', glyph: '🦁', suit: 'wands', base: 2.4 },
    { id: 'hermit', name: 'The Hermit', glyph: '🕯️', suit: 'pentacles', base: 0.8 },
    { id: 'wheel', name: 'Wheel of Fortune', glyph: '🎡', suit: 'wands', base: 3.2 },
    { id: 'justice', name: 'Justice', glyph: '⚖️', suit: 'swords', base: 1.2 },
    { id: 'hanged', name: 'The Hanged Man', glyph: '🕊️', suit: 'cups', base: 0.4 },
    { id: 'death', name: 'Death', glyph: '☠️', suit: 'swords', base: 0 },
    { id: 'temperance', name: 'Temperance', glyph: '🍶', suit: 'cups', base: 1.2 },
    { id: 'devil', name: 'The Devil', glyph: '🐐', suit: 'wands', base: 0.2 },
    { id: 'tower', name: 'The Tower', glyph: '🗼', suit: 'swords', base: 0 },
    { id: 'star', name: 'The Star', glyph: '⭐', suit: 'cups', base: 2.6 },
    { id: 'moon', name: 'The Moon', glyph: '🌚', suit: 'cups', base: 1.8 },
    { id: 'sun', name: 'The Sun', glyph: '☀️', suit: 'wands', base: 4.0 },
    { id: 'judgement', name: 'Judgement', glyph: '🎺', suit: 'pentacles', base: 2.4 },
    { id: 'world', name: 'The World', glyph: '🌍', suit: 'pentacles', base: 5.0 },
]

const HOUSE_EDGE = 0.04

function pickCard(rngTag) {
    const idx = Math.floor(nextRoll(rngTag).roll * DECK.length)
    return DECK[Math.max(0, Math.min(DECK.length - 1, idx))]
}

function contributionFor(card, pickedSuit) {
    const matched = card.suit === pickedSuit
    const base = card.base
    const raw = matched ? base * 3 : base
    return Number((raw * (1 - HOUSE_EDGE) / 3).toFixed(3))
}

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

        const draws = [pickCard('tarot'), pickCard('tarot'), pickCard('tarot')]
        const contributions = draws.map(c => ({ card: c, contribution: contributionFor(c, pickedSuit), matched: c.suit === pickedSuit }))
        const totalMult = contributions.reduce((s, r) => s + r.contribution, 0)
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
                    <p className="bp-hint">Pick a suit before pulling. Cards matching get a 3× bonus.</p>
                    <div className="bp-bal-line">
                        <span>Suit bonus</span>
                        <strong>×3</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Top single</span>
                        <strong>×{(5 * 3 * (1 - HOUSE_EDGE) / 3).toFixed(2)}</strong>
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
                                <span className="glyph">{SUITS[s].glyph}</span>
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
                                <div key={i} className={`tarot-card ${cls}`} style={{ '--rarity': matched ? SUITS[pickedSuit].color : 'rgba(180, 120, 255, 0.45)' }}>
                                    <span className="tarot-card-position">{POSITIONS[i]}</span>
                                    {card ? (
                                        <>
                                            <span className="tarot-card-glyph">{card.glyph}</span>
                                            <span className="tarot-card-name">{card.name}</span>
                                            <span className="tarot-card-suit" style={{ color: SUITS[card.suit].color }}>{SUITS[card.suit].glyph} {SUITS[card.suit].name}</span>
                                            <span className="tarot-card-mult">×{entry.contribution.toFixed(2)}</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="tarot-card-glyph">?</span>
                                            <span className="tarot-card-name">Pull</span>
                                            <span className="tarot-card-suit">—</span>
                                        </>
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
            <EducationPanel definition={definition} betAmount={5} winProbability={0.5} payoutMultiplier={1.4} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
