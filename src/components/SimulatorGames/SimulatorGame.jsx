import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import EducationPanel from '../EducationPanel'
import { useCredits } from '../../context/CreditContext'
import { findGameDefinition } from '../../data/gameDefinitions'
import {
    clamp,
    dicePayout,
    fairDecimalOdds,
    formatCredits,
    kenoPayout,
    limboWinChance,
    pickWeighted,
    rouletteMultiplier,
    rouletteResultMeta,
    sampleUniqueNumbers,
    scoreBlackjackHand,
} from '../../utils/simulationMath'
import { nextRoll } from '../../utils/fairRng'
import { NumberRoll, Particles } from '../fx'
import { useAudio } from '../../audio/AudioProvider'
import './SimulatorGame.css'

const wheelPresets = {
    low: [0, 1.2, 1.2, 1.5, 0, 2, 1.2, 1.5, 0, 2, 1.2, 3],
    medium: [0, 0, 1.5, 0, 2, 0, 3, 0, 1.5, 0, 5, 0],
    high: [0, 0, 0, 2, 0, 0, 5, 0, 0, 10, 0, 25],
}

const slotSymbols = [
    { id: 'seven', label: '7', weight: 2, multiplier: 50 },
    { id: 'star', label: 'STAR', weight: 5, multiplier: 15 },
    { id: 'bar', label: 'BAR', weight: 8, multiplier: 8 },
    { id: 'gem', label: 'GEM', weight: 12, multiplier: 4 },
    { id: 'coin', label: 'GC', weight: 18, multiplier: 2 },
    { id: 'blank', label: '-', weight: 35, multiplier: 0 },
]

const rpsOptions = [
    { id: 'rock', label: 'Rock', image: '/example-assets/xaxino/play/rock.png', beats: 'scissors' },
    { id: 'paper', label: 'Paper', image: '/example-assets/xaxino/play/paper.png', beats: 'rock' },
    { id: 'scissors', label: 'Scissors', image: '/example-assets/xaxino/play/scissors.png', beats: 'paper' },
]

const coinOptions = [
    { id: 'head', label: 'Heads', image: '/example-assets/xaxino/play/head.png' },
    { id: 'tail', label: 'Tails', image: '/example-assets/xaxino/play/tail.png' },
]

const cardRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const cardSuits = ['S', 'H', 'D', 'C']
const baccaratRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const colorOptions = [
    { id: 'red', label: 'Red', color: '#e23d4f' },
    { id: 'blue', label: 'Blue', color: '#3d7dff' },
    { id: 'green', label: 'Green', color: '#00c781' },
    { id: 'gold', label: 'Gold', color: '#ffcf5a' },
]

function buildDeck() {
    return cardSuits.flatMap(suit => cardRanks.map(rank => ({ rank, suit })))
}

function shuffleDeck() {
    const deck = buildDeck()
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(nextRoll('shuffle').roll * (i + 1))
        ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }
    return deck
}

function cardValue(rank) {
    if (rank === 'A') return 14
    if (rank === 'K') return 13
    if (rank === 'Q') return 12
    if (rank === 'J') return 11
    return Number(rank)
}

function baccaratValue(cards) {
    return cards.reduce((sum, card) => {
        if (['10', 'J', 'Q', 'K'].includes(card.rank)) return sum
        if (card.rank === 'A') return sum + 1
        return sum + Number(card.rank)
    }, 0) % 10
}

function drawBaccaratHand() {
    const deck = shuffleDeck()
    const player = [deck[0], deck[2]]
    const banker = [deck[1], deck[3]]
    if (baccaratValue(player) <= 5) player.push(deck[4])
    if (baccaratValue(banker) <= 5) banker.push(deck[5])
    return { player, banker }
}

function evaluatePokerHand(cards) {
    const values = cards.map(card => cardValue(card.rank)).sort((a, b) => a - b)
    const counts = values.reduce((map, value) => ({ ...map, [value]: (map[value] || 0) + 1 }), {})
    const groups = Object.values(counts).sort((a, b) => b - a)
    const flush = cards.every(card => card.suit === cards[0].suit)
    const lowAceStraight = values.join(',') === '2,3,4,5,14'
    const straight = lowAceStraight || values.every((value, index) => index === 0 || value === values[index - 1] + 1)
    if (flush && values[0] === 10 && straight) return { label: 'Royal Flush', multiplier: 250 }
    if (flush && straight) return { label: 'Straight Flush', multiplier: 50 }
    if (groups[0] === 4) return { label: 'Four Kind', multiplier: 25 }
    if (groups[0] === 3 && groups[1] === 2) return { label: 'Full House', multiplier: 9 }
    if (flush) return { label: 'Flush', multiplier: 6 }
    if (straight) return { label: 'Straight', multiplier: 4 }
    if (groups[0] === 3) return { label: 'Three Kind', multiplier: 3 }
    if (groups[0] === 2 && groups[1] === 2) return { label: 'Two Pair', multiplier: 2 }
    const pairValue = Number(Object.entries(counts).find(([, count]) => count === 2)?.[0] || 0)
    if (pairValue >= 11 || pairValue === 14) return { label: 'Jacks or Better', multiplier: 1 }
    return { label: 'No Pay', multiplier: 0 }
}

function BetControls({ betAmount, setBetAmount, disabled, actionLabel, onAction, children }) {
    return (
        <div className="sim-bet-panel">
            <div className="sim-input-group">
                <label>Bet amount</label>
                <div className="sim-number-control">
                    <input
                        type="number"
                        value={betAmount}
                        min="0.01"
                        step="0.5"
                        onChange={(event) => setBetAmount(Math.max(0, Number(event.target.value) || 0))}
                    />
                    <button onClick={() => setBetAmount(value => Math.max(0.5, value / 2))}>1/2</button>
                    <button onClick={() => setBetAmount(value => value * 2)}>2x</button>
                </div>
            </div>
            {children}
            <button className="sim-primary-btn" disabled={disabled} onClick={onAction}>
                {actionLabel}
            </button>
        </div>
    )
}

function ResultStrip({ results }) {
    return (
        <div className="sim-result-strip">
            {results.length === 0 ? (
                <span className="sim-muted">No plays yet</span>
            ) : (
                results.slice(0, 14).map(result => (
                    <span key={result.id} className={`sim-result-pill ${result.profit >= 0 ? 'win' : 'loss'}`}>
                        {result.label}
                    </span>
                ))
            )}
        </div>
    )
}

function DiceSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [winChance, setWinChance] = useState(50)
    const [rollMode, setRollMode] = useState('under')
    const [lastRoll, setLastRoll] = useState(null)
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [results, setResults] = useState([])
    const payout = dicePayout(winChance / 100)

    const play = () => {
        if (!placeBet(betAmount, 'Dice')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('tick')
        const { roll: r } = nextRoll('dice')
        const roll = r * 100
        const won = rollMode === 'under' ? roll < winChance : roll > (100 - winChance)
        const returnAmount = won ? betAmount * payout : 0
        const profit = returnAmount - betAmount
        if (won) addWinnings(returnAmount, 'Dice return')
        setLastRoll(roll)
        setLastWon(won)
        setBurstKey(k => k + 1)
        playSound(won ? 'win' : 'loss')
        setResults(prev => [{ id: Date.now(), label: `${roll.toFixed(2)}`, profit }, ...prev])
        showToast(won ? 'win' : 'loss', won ? 'Dice hit' : 'Dice miss', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
    }

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} actionLabel="Roll Dice" onAction={play}>
                <div className="sim-input-group">
                    <label>Win chance: {winChance.toFixed(0)}%</label>
                    <input type="range" min="2" max="95" value={winChance} onChange={event => setWinChance(Number(event.target.value))} />
                </div>
                <div className="segmented">
                    <button className={rollMode === 'under' ? 'active' : ''} onClick={() => setRollMode('under')}>Roll under</button>
                    <button className={rollMode === 'over' ? 'active' : ''} onClick={() => setRollMode('over')}>Roll over</button>
                </div>
                <div className="sim-metric-line">
                    <span>Payout</span>
                    <strong>{payout.toFixed(2)}x</strong>
                </div>
            </BetControls>
            <div className={`sim-playfield dice-field ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <div className="dice-track">
                    <div className="dice-rule">{Array.from({ length: 11 }, (_, i) => <span key={i} style={{ left: `${i * 10}%` }} />)}</div>
                    <div className="dice-safe-zone" style={rollMode === 'under' ? { width: `${winChance}%` } : { left: `${100 - winChance}%`, width: `${winChance}%` }} />
                    <div className={`dice-marker ${lastWon === true ? 'won' : lastWon === false ? 'lost' : ''}`} style={{ left: `${lastRoll ?? 50}%` }}>
                        <span />
                    </div>
                </div>
                <div className="dice-outcome-wrap">
                    <div className={`big-outcome dice-big ${lastWon === true ? 'win' : lastWon === false ? 'loss' : ''}`}>
                        <NumberRoll value={lastRoll === null ? 0 : Number(lastRoll.toFixed(2))} format={v => lastRoll === null ? '--.--' : v.toFixed(2)} />
                    </div>
                    {lastWon && burstKey > 0 && <Particles key={burstKey} count={14} color="#00e701" />}
                </div>
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={winChance / 100} payoutMultiplier={payout} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function LimboSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [target, setTarget] = useState(2)
    const [lastMultiplier, setLastMultiplier] = useState(null)
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [results, setResults] = useState([])
    const chance = limboWinChance(target)

    const play = () => {
        if (!placeBet(betAmount, 'Limbo')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('tick')
        const { roll: r } = nextRoll('limbo')
        const won = r < chance
        const multiplier = won ? target + r * target : 1 + r * Math.max(0.1, target - 1)
        const returnAmount = won ? betAmount * target : 0
        const profit = returnAmount - betAmount
        if (won) addWinnings(returnAmount, 'Limbo return')
        setLastMultiplier(multiplier)
        setLastWon(won)
        setBurstKey(k => k + 1)
        playSound(won ? 'win' : 'loss')
        setResults(prev => [{ id: Date.now(), label: `${multiplier.toFixed(2)}x`, profit }, ...prev])
        showToast(won ? 'win' : 'loss', won ? 'Target cleared' : 'Below target', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
    }

    const gaugePct = lastMultiplier ? Math.min(100, ((lastMultiplier - 1) / Math.max(0.01, target - 1)) * 90) : 0

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} actionLabel="Run Limbo" onAction={play}>
                <div className="sim-input-group">
                    <label>Target multiplier</label>
                    <input type="number" min="1.01" max="100" step="0.1" value={target} onChange={event => setTarget(clamp(Number(event.target.value) || 1.01, 1.01, 100))} />
                </div>
                <div className="sim-metric-line">
                    <span>Estimated hit chance</span>
                    <strong>{(chance * 100).toFixed(2)}%</strong>
                </div>
            </BetControls>
            <div className={`sim-playfield limbo-field ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <div className="limbo-stars" />
                <div className="limbo-rocket-wrap">
                    <div className="limbo-gauge">
                        <div className="limbo-gauge-fill" style={{ height: `${gaugePct}%`, background: lastWon === false ? 'linear-gradient(0deg, #ed4245, #ffcf5a)' : 'linear-gradient(0deg, #00e701, #41d6ff)' }} />
                        <div className="limbo-gauge-target" style={{ bottom: `90%` }} />
                    </div>
                    <div className={`limbo-ring ${lastWon === true ? 'won' : lastWon === false ? 'lost' : ''}`}>
                        <span><NumberRoll value={lastMultiplier === null ? 1 : Number(lastMultiplier.toFixed(2))} format={v => `${v.toFixed(2)}x`} /></span>
                    </div>
                    {lastWon && burstKey > 0 && <Particles key={burstKey} count={18} color="#41d6ff" />}
                </div>
                <div className="limbo-target">Target {target.toFixed(2)}x</div>
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={chance} payoutMultiplier={target} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function KenoSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [selected, setSelected] = useState([4, 8, 15, 16, 23])
    const [drawn, setDrawn] = useState([])
    const [drawAnim, setDrawAnim] = useState([])
    const [drawing, setDrawing] = useState(false)
    const [burstKey, setBurstKey] = useState(0)
    const [results, setResults] = useState([])

    const toggleNumber = (number) => {
        if (drawing) return
        setSelected(prev => {
            if (prev.includes(number)) return prev.filter(item => item !== number)
            if (prev.length >= 10) return prev
            return [...prev, number].sort((a, b) => a - b)
        })
    }

    const quickPick = () => setSelected(sampleUniqueNumbers({ max: 40, count: 5 }))

    const play = () => {
        if (selected.length === 0) return
        if (!placeBet(betAmount, 'Keno')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('tick')
        setDrawing(true)
        setDrawAnim([])
        const picks = sampleUniqueNumbers({ max: 40, count: 10, random: () => nextRoll('keno').roll })
        picks.forEach((n, i) => {
            window.setTimeout(() => {
                playSound('flip')
                setDrawAnim(prev => [...prev, n])
            }, 200 + i * 220)
        })
        const hits = selected.filter(number => picks.includes(number)).length
        const multiplier = kenoPayout(selected.length, hits)
        const returnAmount = betAmount * multiplier
        const profit = returnAmount - betAmount
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Keno return')
            setDrawn(picks)
            setBurstKey(k => k + 1)
            setDrawing(false)
            playSound(returnAmount > 0 ? 'win' : 'loss')
            setResults(prev => [{ id: Date.now(), label: `${hits}/${selected.length}`, profit }, ...prev])
            showToast(profit >= 0 ? 'win' : 'loss', `Keno ${hits} hits`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        }, 200 + picks.length * 220 + 200)
    }

    const estimatedChance = selected.length ? selected.length / 40 : 0

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} disabled={drawing} actionLabel={drawing ? 'Drawing...' : 'Draw Keno'} onAction={play}>
                <button className="sim-secondary-btn" disabled={drawing} onClick={quickPick}>Quick pick 5</button>
                <div className="sim-metric-line">
                    <span>Selected</span>
                    <strong>{selected.length}/10</strong>
                </div>
            </BetControls>
            <div className="sim-playfield keno-field">
                <div className="keno-grid">
                    {Array.from({ length: 40 }, (_, index) => index + 1).map(number => {
                        const isSelected = selected.includes(number)
                        const isDrawn = drawAnim.includes(number)
                        const isHit = isSelected && isDrawn
                        const dropIndex = isDrawn ? drawAnim.indexOf(number) : -1
                        return (
                            <button
                                key={number}
                                className={`${isSelected ? 'selected' : ''} ${isDrawn ? 'drawn' : ''} ${isHit ? 'hit' : ''}`}
                                onClick={() => toggleNumber(number)}
                                style={isDrawn ? { animationDelay: `${dropIndex * 30}ms` } : undefined}
                            >
                                {number}
                            </button>
                        )
                    })}
                </div>
                {burstKey > 0 && results[0]?.profit > 0 && <Particles key={burstKey} count={16} color="#ffcf5a" />}
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={estimatedChance} payoutMultiplier={kenoPayout(Math.max(1, selected.length), Math.max(1, Math.ceil(selected.length / 2)))} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function WheelSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [risk, setRisk] = useState('medium')
    const [rotation, setRotation] = useState(0)
    const [last, setLast] = useState(null)
    const [lastWon, setLastWon] = useState(null)
    const [spinning, setSpinning] = useState(false)
    const [burstKey, setBurstKey] = useState(0)
    const [results, setResults] = useState([])
    const segments = wheelPresets[risk]

    const play = () => {
        if (!placeBet(betAmount, 'Wheel')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('tick')
        setSpinning(true)
        const { roll: r } = nextRoll('wheel')
        const index = Math.floor(r * segments.length)
        const multiplier = segments[index]
        const returnAmount = betAmount * multiplier
        const profit = returnAmount - betAmount
        const won = multiplier > 1
        const segAngle = 360 / segments.length
        const fullSpins = 6
        // Land at top pointer (rotate so chosen segment center aligns to 0deg upward)
        const target = fullSpins * 360 + (360 - index * segAngle - segAngle / 2)
        setRotation(prev => prev + (target - (prev % 360)))
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Wheel return')
            setLast(multiplier)
            setLastWon(won)
            setBurstKey(k => k + 1)
            setSpinning(false)
            playSound(won ? 'win' : 'loss')
            setResults(prev => [{ id: Date.now(), label: `${multiplier}x`, profit }, ...prev])
            showToast(profit >= 0 ? 'win' : 'loss', `Wheel ${multiplier}x`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        }, 2200)
    }

    const hitChance = segments.filter(item => item > 0).length / segments.length
    const avgMultiplier = segments.reduce((sum, item) => sum + item, 0) / segments.length

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} disabled={spinning} actionLabel={spinning ? 'Spinning...' : 'Spin Wheel'} onAction={play}>
                <div className="segmented">
                    {Object.keys(wheelPresets).map(option => (
                        <button key={option} className={risk === option ? 'active' : ''} onClick={() => !spinning && setRisk(option)}>{option}</button>
                    ))}
                </div>
                <div className="sim-metric-line">
                    <span>Average return</span>
                    <strong>{avgMultiplier.toFixed(2)}x</strong>
                </div>
            </BetControls>
            <div className={`sim-playfield wheel-field ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <div className="wheel-pointer" />
                <div className={`wheel-disc ${spinning ? 'spinning' : ''}`} style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 2.1s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                    {segments.map((segment, index) => (
                        <span key={`${segment}-${index}`} className={segment > 0 ? 'paying' : 'blank'} style={{ transform: `rotate(${index * (360 / segments.length)}deg)` }}>
                            {segment}x
                        </span>
                    ))}
                </div>
                <div className="wheel-last">Last: {last === null ? '--' : `${last}x`}</div>
                {lastWon && burstKey > 0 && <Particles key={burstKey} count={20} color="#ffcf5a" />}
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={hitChance} payoutMultiplier={avgMultiplier} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function RouletteSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [betType, setBetType] = useState('red')
    const [selectedNumber, setSelectedNumber] = useState(17)
    const [result, setResult] = useState(null)
    const [spinning, setSpinning] = useState(false)
    const [wheelRotation, setWheelRotation] = useState(0)
    const [ballRotation, setBallRotation] = useState(0)
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [results, setResults] = useState([])
    const [history, setHistory] = useState([])

    // European wheel order, clockwise
    const wheelOrder = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]

    const play = () => {
        if (!placeBet(betAmount, 'Roulette')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('tick')
        setSpinning(true)
        const { roll: r } = nextRoll('roulette')
        const number = Math.floor(r * 37)
        const multiplier = rouletteMultiplier(betType, selectedNumber, number)
        const returnAmount = betAmount * multiplier
        const profit = returnAmount - betAmount
        const won = multiplier > 0
        const idx = wheelOrder.indexOf(number)
        const segAngle = 360 / 37
        const targetAngle = idx * segAngle
        // Wheel spins clockwise, ball counter-clockwise (visual chrome)
        setWheelRotation(prev => prev + 360 * 5 + targetAngle)
        setBallRotation(prev => prev - 360 * 8 - targetAngle)
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Roulette return')
            setResult(number)
            setLastWon(won)
            setBurstKey(k => k + 1)
            setSpinning(false)
            playSound(won ? 'win' : 'loss')
            setResults(prev => [{ id: Date.now(), label: `${number}`, profit }, ...prev])
            setHistory(prev => [number, ...prev].slice(0, 18))
            showToast(profit >= 0 ? 'win' : 'loss', `Roulette ${number}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        }, 2400)
    }

    const meta = result === null ? null : rouletteResultMeta(result)
    const winChance = betType === 'straight' ? 1 / 37 : 18 / 37
    const payout = betType === 'straight' ? 36 : 2

    const counts = history.reduce((acc, n) => ({ ...acc, [n]: (acc[n] || 0) + 1 }), {})
    const sortedByCount = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const hot = sortedByCount.slice(0, 3).map(([n]) => Number(n))
    const cold = Array.from({ length: 37 }, (_, i) => i).filter(n => !counts[n]).slice(0, 3)

    const segmentColor = (n) => n === 0 ? 'green' : ([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n) ? 'red' : 'black')

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} disabled={spinning} actionLabel={spinning ? 'Spinning...' : 'Spin Roulette'} onAction={play}>
                <div className="sim-input-group">
                    <label>Bet type</label>
                    <select value={betType} onChange={event => setBetType(event.target.value)} disabled={spinning}>
                        <option value="red">Red</option>
                        <option value="black">Black</option>
                        <option value="even">Even</option>
                        <option value="odd">Odd</option>
                        <option value="low">1 to 18</option>
                        <option value="high">19 to 36</option>
                        <option value="straight">Straight number</option>
                    </select>
                </div>
                {betType === 'straight' && (
                    <div className="sim-input-group">
                        <label>Number</label>
                        <input type="number" min="0" max="36" value={selectedNumber} onChange={event => setSelectedNumber(clamp(Number(event.target.value) || 0, 0, 36))} />
                    </div>
                )}
                <div className="sim-metric-line"><span>Hot</span><strong>{hot.length ? hot.join(', ') : '--'}</strong></div>
                <div className="sim-metric-line"><span>Cold</span><strong>{cold.length ? cold.join(', ') : '--'}</strong></div>
            </BetControls>
            <div className={`sim-playfield roulette-field ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <div className="roulette-stage">
                    <div className="roulette-wheel" style={{ transform: `rotate(${wheelRotation}deg)`, transition: spinning ? 'transform 2.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none' }}>
                        {wheelOrder.map((n, i) => {
                            const angle = i * (360 / 37)
                            return (
                                <span key={n} className={`roulette-seg ${segmentColor(n)}`} style={{ transform: `rotate(${angle}deg) translateY(-90px)` }}>
                                    {n}
                                </span>
                            )
                        })}
                    </div>
                    <div className="roulette-ball-track" style={{ transform: `rotate(${ballRotation}deg)`, transition: spinning ? 'transform 2.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none' }}>
                        <span className="roulette-ball" />
                    </div>
                    <div className={`roulette-number-pop ${meta?.color || ''}`}>{result === null ? '--' : result}</div>
                </div>
                <div className="roulette-label">{meta ? `${meta.color} / ${meta.parity}` : 'European single-zero wheel'}</div>
                <div className="roulette-history">
                    {history.length === 0 ? <span className="sim-muted">No history</span> : history.map((n, i) => {
                        const m = rouletteResultMeta(n)
                        return <span key={i} className={`roulette-history-pill ${m.color}`}>{n}</span>
                    })}
                </div>
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={winChance} payoutMultiplier={payout} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function buildShoe(decks = 1) {
    const shoe = []
    for (let i = 0; i < decks; i++) shoe.push(...buildDeck())
    for (let i = shoe.length - 1; i > 0; i--) {
        const j = Math.floor(nextRoll('shuffle').roll * (i + 1))
        ;[shoe[i], shoe[j]] = [shoe[j], shoe[i]]
    }
    return shoe
}

function isSoftHand(cards) {
    let total = 0
    let aces = 0
    for (const card of cards) {
        if (card.rank === 'A') { aces += 1; total += 11 }
        else if (['K', 'Q', 'J'].includes(card.rank)) total += 10
        else total += Number(card.rank)
    }
    while (total > 21 && aces > 0) { total -= 10; aces -= 1 }
    return aces > 0 && total <= 21
}

function dealerUpValue(card) {
    if (!card) return 0
    if (card.rank === 'A') return 11
    if (['K', 'Q', 'J', '10'].includes(card.rank)) return 10
    return Number(card.rank)
}

function basicStrategyHint(player, dealerCard) {
    if (!player || player.length === 0 || !dealerCard) return 'Hint: deal first.'
    const score = scoreBlackjackHand(player)
    const up = dealerUpValue(dealerCard)
    if (score >= 17) return 'Stand: hard 17+ stays.'
    if (score <= 8) return 'Hit: weak hard total has nothing to lose.'
    if (isSoftHand(player)) {
        if (score >= 19) return 'Stand: soft 19+ is strong.'
        if (score === 18) return up >= 9 ? 'Hit: soft 18 vs strong dealer.' : 'Stand: soft 18 vs weak dealer.'
        return 'Hit: soft hands ride aces upward.'
    }
    if (score >= 13 && score <= 16) {
        return up >= 7 ? `Hit: hard ${score} vs ${up} is loss-equity, hit.` : `Stand: hard ${score} vs ${up} dealer probably busts.`
    }
    if (score === 12) return up >= 4 && up <= 6 ? 'Stand: hard 12 vs 4-6 hopes dealer busts.' : 'Hit: hard 12 elsewhere.'
    if (score === 11) return 'Hit: hard 11 always wants another card.'
    if (score === 10) return up >= 10 ? 'Hit: hard 10 vs 10/A.' : 'Hit: hard 10 wants a strong follow-up.'
    if (score === 9) return up >= 3 && up <= 6 ? 'Hit: hard 9 vs 3-6 (no double here).' : 'Hit: hard 9.'
    return 'Hit: continue building total.'
}

function BlackjackSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [decks, setDecks] = useState(4)
    const [dealerHitsSoft17, setDealerHitsSoft17] = useState(false)
    const [shoe, setShoe] = useState(() => buildShoe(4))
    const [player, setPlayer] = useState([])
    const [dealer, setDealer] = useState([])
    const [phase, setPhase] = useState('idle')
    const [message, setMessage] = useState('Deal a training hand')
    const [results, setResults] = useState([])
    const [activeBet, setActiveBet] = useState(0)
    const [insurance, setInsurance] = useState(0)
    const [insuranceOffered, setInsuranceOffered] = useState(false)
    const [stats, setStats] = useState({ wins: 0, losses: 0, pushes: 0, blackjacks: 0, hands: 0 })
    const [dealKey, setDealKey] = useState(0)
    const [chipFly, setChipFly] = useState(0)
    const [studyRunning, setStudyRunning] = useState(false)
    const [studyResults, setStudyResults] = useState(null)

    const drawTop = (sourceShoe) => [sourceShoe[0], sourceShoe.slice(1)]

    const ensureShoe = (source) => {
        // Re-shuffle if penetration exceeds 75%
        const cap = decks * 52
        if (source.length < cap * 0.25) return buildShoe(decks)
        return source
    }

    const settle = (finalPlayer, finalDealer, wager) => {
        const playerScore = scoreBlackjackHand(finalPlayer)
        const dealerScore = scoreBlackjackHand(finalDealer)
        let multiplier = 0
        let label = 'Loss'
        const isBlackjack = finalPlayer.length === 2 && playerScore === 21
        if (playerScore > 21) {
            multiplier = 0
        } else if (dealerScore > 21 || playerScore > dealerScore) {
            multiplier = isBlackjack ? 2.5 : 2
            label = isBlackjack ? 'Blackjack' : 'Win'
        } else if (playerScore === dealerScore) {
            multiplier = 1
            label = 'Push'
        }
        let returnAmount = wager * multiplier
        // Insurance side bet pays 3:1 if dealer has natural blackjack
        if (insurance > 0) {
            const dealerBlackjack = finalDealer.length === 2 && dealerScore === 21
            if (dealerBlackjack) returnAmount += insurance * 3
        }
        const insuranceCost = insurance
        const profit = returnAmount - wager - insuranceCost
        if (returnAmount > 0) addWinnings(returnAmount, 'Blackjack return')
        setResults(prev => [{ id: Date.now(), label, profit }, ...prev])
        setMessage(`${label}: player ${playerScore}, dealer ${dealerScore}`)
        setPhase('idle')
        setActiveBet(0)
        setInsurance(0)
        setInsuranceOffered(false)
        setStats(prev => ({
            wins: prev.wins + (label === 'Win' || label === 'Blackjack' ? 1 : 0),
            losses: prev.losses + (label === 'Loss' ? 1 : 0),
            pushes: prev.pushes + (label === 'Push' ? 1 : 0),
            blackjacks: prev.blackjacks + (label === 'Blackjack' ? 1 : 0),
            hands: prev.hands + 1,
        }))
        showToast(profit >= 0 ? 'win' : 'loss', `Blackjack ${label}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        playSound(profit >= 0 ? 'win' : 'loss')
    }

    const deal = () => {
        if (!placeBet(betAmount, 'Blackjack')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('deal')
        setChipFly(c => c + 1)
        let nextShoe = ensureShoe(shoe)
        const initialPlayer = []
        const initialDealer = []
        for (let i = 0; i < 2; i++) {
            let card
            ;[card, nextShoe] = drawTop(nextShoe)
            initialPlayer.push(card)
            ;[card, nextShoe] = drawTop(nextShoe)
            initialDealer.push(card)
        }
        setShoe(nextShoe)
        setPlayer(initialPlayer)
        setDealer(initialDealer)
        setActiveBet(betAmount)
        setPhase('playing')
        setInsurance(0)
        setInsuranceOffered(initialDealer[0]?.rank === 'A')
        setMessage('Choose hit, stand, or double')
        setDealKey(k => k + 1)
        if (scoreBlackjackHand(initialPlayer) === 21) {
            window.setTimeout(() => settle(initialPlayer, initialDealer, betAmount), 300)
        }
    }

    const surrender = () => {
        if (phase !== 'playing' || player.length !== 2) return
        // Half the wager is returned
        const returnAmount = activeBet / 2
        addWinnings(returnAmount, 'Blackjack surrender')
        const profit = returnAmount - activeBet
        playSound('click')
        setResults(prev => [{ id: Date.now(), label: 'Surrender', profit }, ...prev])
        setMessage('Surrendered. Half stake returned.')
        setPhase('idle')
        setActiveBet(0)
        setInsurance(0)
        setInsuranceOffered(false)
        setStats(prev => ({ ...prev, losses: prev.losses + 1, hands: prev.hands + 1 }))
        showToast('loss', 'Surrender', `${formatCredits(profit)}`)
    }

    const takeInsurance = () => {
        if (!insuranceOffered || phase !== 'playing') return
        const cost = activeBet / 2
        if (!placeBet(cost, 'Blackjack insurance')) {
            showToast('error', 'Not enough credits', 'Cannot insure')
            return
        }
        playSound('click')
        setInsurance(cost)
        setInsuranceOffered(false)
        showToast('bet', 'Insurance taken', `Side bet ${formatCredits(cost)}`)
    }

    const declineInsurance = () => {
        setInsuranceOffered(false)
    }

    const hit = () => {
        if (phase !== 'playing') return
        playSound('flip')
        let nextShoe = shoe
        let card
        ;[card, nextShoe] = drawTop(nextShoe)
        const nextPlayer = [...player, card]
        setPlayer(nextPlayer)
        setShoe(nextShoe)
        if (scoreBlackjackHand(nextPlayer) > 21) {
            window.setTimeout(() => settle(nextPlayer, dealer, activeBet), 300)
        }
    }

    const stand = () => {
        if (phase !== 'playing') return
        playSound('click')
        let nextShoe = shoe
        const nextDealer = [...dealer]
        const dealerKeepHitting = () => {
            const score = scoreBlackjackHand(nextDealer)
            if (score < 17) return true
            if (score === 17 && dealerHitsSoft17 && isSoftHand(nextDealer)) return true
            return false
        }
        while (dealerKeepHitting()) {
            let card
            ;[card, nextShoe] = drawTop(nextShoe)
            nextDealer.push(card)
        }
        setDealer(nextDealer)
        setShoe(nextShoe)
        window.setTimeout(() => settle(player, nextDealer, activeBet), 200)
    }

    const doubleDown = () => {
        if (phase !== 'playing' || player.length !== 2) return
        if (!placeBet(activeBet, 'Blackjack double')) {
            showToast('error', 'Not enough credits', 'Cannot double')
            return
        }
        playSound('deal')
        setChipFly(c => c + 1)
        let nextShoe = shoe
        let card
        ;[card, nextShoe] = drawTop(nextShoe)
        const nextPlayer = [...player, card]
        setPlayer(nextPlayer)
        setShoe(nextShoe)
        const finalBet = activeBet * 2
        setActiveBet(finalBet)
        if (scoreBlackjackHand(nextPlayer) > 21) {
            window.setTimeout(() => settle(nextPlayer, dealer, finalBet), 300)
            return
        }
        // Auto-stand after double
        let dealerShoe = nextShoe
        const nextDealer = [...dealer]
        const dealerKeepHitting = () => {
            const score = scoreBlackjackHand(nextDealer)
            if (score < 17) return true
            if (score === 17 && dealerHitsSoft17 && isSoftHand(nextDealer)) return true
            return false
        }
        while (dealerKeepHitting()) {
            let dCard
            ;[dCard, dealerShoe] = drawTop(dealerShoe)
            nextDealer.push(dCard)
        }
        setDealer(nextDealer)
        setShoe(dealerShoe)
        window.setTimeout(() => settle(nextPlayer, nextDealer, finalBet), 300)
    }

    const onDecks = (n) => {
        setDecks(n)
        setShoe(buildShoe(n))
    }

    // Study runner: simulates many hands without staking, tracking strategy edge.
    const runStudy = (count = 500) => {
        if (studyRunning) return
        setStudyRunning(true)
        // small async chunked loop to avoid blocking UI
        const work = () => {
            let local = buildShoe(decks)
            let win = 0, loss = 0, push = 0, bj = 0
            let bankroll = 0
            const startBet = 1
            for (let i = 0; i < count; i++) {
                if (local.length < 26) local = buildShoe(decks)
                const p = [local.shift(), local.shift()]
                const d = [local.shift(), local.shift()]
                let bet = startBet
                // Auto play with basic strategy hint
                while (true) {
                    const score = scoreBlackjackHand(p)
                    if (score >= 21) break
                    const hint = basicStrategyHint(p, d[0])
                    if (hint.startsWith('Stand')) break
                    if (hint.startsWith('Double') && p.length === 2) {
                        bet = startBet * 2
                        p.push(local.shift())
                        break
                    }
                    p.push(local.shift())
                }
                // Dealer
                while (true) {
                    const ds = scoreBlackjackHand(d)
                    if (ds >= 17 && !(ds === 17 && dealerHitsSoft17 && isSoftHand(d))) break
                    if (ds < 17 || (ds === 17 && dealerHitsSoft17 && isSoftHand(d))) d.push(local.shift())
                    else break
                }
                const ps = scoreBlackjackHand(p)
                const ds = scoreBlackjackHand(d)
                const isBj = p.length === 2 && ps === 21
                if (ps > 21) { loss++; bankroll -= bet }
                else if (ds > 21 || ps > ds) {
                    if (isBj) { bj++; bankroll += bet * 1.5 }
                    else { win++; bankroll += bet }
                } else if (ps === ds) push++
                else { loss++; bankroll -= bet }
            }
            setStudyResults({ count, win, loss, push, bj, bankroll, edge: (bankroll / count) * 100 })
            setStudyRunning(false)
        }
        window.setTimeout(work, 30)
    }

    const playerScore = scoreBlackjackHand(player)
    const hint = phase === 'playing' ? `Hint: ${basicStrategyHint(player, dealer[0])}` : 'Hint: deal a hand to receive basic-strategy guidance.'
    const winRate = stats.hands > 0 ? ((stats.wins / stats.hands) * 100).toFixed(1) : '--'

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} disabled={phase === 'playing'} actionLabel="Deal Hand" onAction={deal}>
                <div className="sim-input-group">
                    <label>Deck count</label>
                    <div className="segmented">
                        {[1, 2, 4, 6, 8].map(n => (
                            <button key={n} className={decks === n ? 'active' : ''} onClick={() => phase !== 'playing' && onDecks(n)}>{n}</button>
                        ))}
                    </div>
                </div>
                <div className="sim-input-group">
                    <label>Dealer rule</label>
                    <div className="segmented">
                        <button className={!dealerHitsSoft17 ? 'active' : ''} onClick={() => setDealerHitsSoft17(false)}>S17</button>
                        <button className={dealerHitsSoft17 ? 'active' : ''} onClick={() => setDealerHitsSoft17(true)}>H17</button>
                    </div>
                </div>
                <div className="sim-metric-line">
                    <span>Win rate</span>
                    <strong>{winRate}%</strong>
                </div>
                <div className="sim-metric-line">
                    <span>Hands · BJ</span>
                    <strong>{stats.hands} · {stats.blackjacks}</strong>
                </div>
            </BetControls>
            <div className="sim-playfield blackjack-field">
                <div className="blackjack-table">
                    <Hand label={`Dealer ${dealer.length && phase !== 'playing' ? scoreBlackjackHand(dealer) : phase === 'playing' && dealer[0] ? `(${dealerUpValue(dealer[0])})` : '--'}`} cards={dealer} hideHole={phase === 'playing'} dealAnimKey={dealKey} />
                    <Hand label={`Player ${player.length ? scoreBlackjackHand(player) : '--'}`} cards={player} dealAnimKey={dealKey} />
                </div>
                {chipFly > 0 && <div key={`chip-${chipFly}`} className="chip-fly" />}
                <div className="blackjack-actions">
                    <button disabled={phase !== 'playing'} onClick={hit}>Hit</button>
                    <button disabled={phase !== 'playing'} onClick={stand}>Stand</button>
                    <button disabled={phase !== 'playing' || player.length !== 2} onClick={doubleDown}>Double</button>
                    <button disabled={phase !== 'playing' || player.length !== 2} onClick={surrender}>Surrender</button>
                </div>
                {insuranceOffered && (
                    <div className="blackjack-insurance">
                        <span>Dealer shows Ace. Insurance?</span>
                        <button onClick={takeInsurance}>Yes, {formatCredits(activeBet / 2)}</button>
                        <button onClick={declineInsurance}>Decline</button>
                    </div>
                )}
                <p>{message}</p>
                <p className="sim-muted">{hint}</p>
                <div className="study-panel">
                    <button className="sim-secondary-btn" disabled={studyRunning} onClick={() => runStudy(500)}>
                        {studyRunning ? 'Running 500-hand study...' : 'Run 500-hand basic-strategy study'}
                    </button>
                    {studyResults && (
                        <div className="study-results">
                            <span>Wins {studyResults.win} (BJ {studyResults.bj}) · Losses {studyResults.loss} · Pushes {studyResults.push}</span>
                            <strong className={studyResults.bankroll >= 0 ? 'positive' : 'negative'}>Edge {studyResults.edge.toFixed(2)}% over {studyResults.count} hands</strong>
                        </div>
                    )}
                </div>
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={0.43} payoutMultiplier={2} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function Hand({ label, cards, hideHole = false, dealAnimKey = 0 }) {
    const suitColor = (suit) => (suit === 'H' || suit === 'D') ? 'red' : 'black'
    const renderSuit = (suit) => {
        if (suit === 'H') return '\u2665'
        if (suit === 'D') return '\u2666'
        if (suit === 'S') return '\u2660'
        if (suit === 'C') return '\u2663'
        return suit
    }
    return (
        <div className="card-hand">
            <span>{label}</span>
            <div className="card-hand-row">
                {cards.length === 0 ? (
                    <span className="playing-card empty">--</span>
                ) : cards.map((card, index) => {
                    const hidden = hideHole && index === 1
                    return (
                        <span
                            key={`${dealAnimKey}-${card.rank}-${card.suit}-${index}`}
                            className={`playing-card ${suitColor(card.suit)} ${hidden ? 'hidden' : ''}`}
                            style={{ animationDelay: `${index * 130}ms` }}
                        >
                            {hidden ? <span className="card-back-pattern" /> : (
                                <>
                                    <span className="playing-card-rank">{card.rank}</span>
                                    <span className="playing-card-suit">{renderSuit(card.suit)}</span>
                                </>
                            )}
                        </span>
                    )
                })}
            </div>
        </div>
    )
}

function SlotsSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [theme, setTheme] = useState('classic')
    const [variant, setVariant] = useState('lines')
    const [spinning, setSpinning] = useState(false)
    const [results, setResults] = useState([])
    const [observedRtp, setObservedRtp] = useState({ wagered: 0, returned: 0 })
    const [stoppedCols, setStoppedCols] = useState(0)
    const [winningCells, setWinningCells] = useState([])
    const [burstKey, setBurstKey] = useState(0)

    const themes = {
        classic: { name: 'Classic', symbols: slotSymbols },
        cyber: {
            name: 'Cyber',
            symbols: [
                { id: 'core', label: 'CORE', weight: 2, multiplier: 50 },
                { id: 'chip', label: 'CHIP', weight: 5, multiplier: 15 },
                { id: 'wave', label: 'WAVE', weight: 8, multiplier: 8 },
                { id: 'node', label: 'NODE', weight: 12, multiplier: 4 },
                { id: 'data', label: 'DATA', weight: 18, multiplier: 2 },
                { id: 'null', label: '-', weight: 35, multiplier: 0 },
            ],
        },
        mythic: {
            name: 'Mythic',
            symbols: [
                { id: 'rune', label: 'RUNE', weight: 2, multiplier: 50 },
                { id: 'orb', label: 'ORB', weight: 5, multiplier: 15 },
                { id: 'sword', label: 'SWORD', weight: 8, multiplier: 8 },
                { id: 'shield', label: 'SHIELD', weight: 12, multiplier: 4 },
                { id: 'leaf', label: 'LEAF', weight: 18, multiplier: 2 },
                { id: 'mist', label: '-', weight: 35, multiplier: 0 },
            ],
        },
    }

    const variantConfig = variant === 'lines'
        ? { rows: 3, cols: 5, paylines: [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [0, 6, 12, 8, 4], [10, 6, 2, 8, 14]] }
        : { rows: 4, cols: 6, paylines: null }
    const totalCells = variantConfig.rows * variantConfig.cols
    const themeSymbols = themes[theme].symbols
    const [reels, setReels] = useState(() => Array.from({ length: totalCells }, () => themeSymbols[themeSymbols.length - 1]))

    const spin = () => {
        if (!placeBet(betAmount, 'Slots')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('tick')
        setSpinning(true)
        setStoppedCols(0)
        setWinningCells([])
        const next = Array.from({ length: totalCells }, () => pickWeighted(themeSymbols, () => nextRoll('slots').roll))
        setReels(next)
        // Stop reels column-by-column
        for (let c = 1; c <= variantConfig.cols; c++) {
            window.setTimeout(() => {
                playSound('flip')
                setStoppedCols(c)
            }, c * 220)
        }
        let multiplier = 0
        const winSet = new Set()
        if (variantConfig.paylines) {
            for (const line of variantConfig.paylines) {
                const first = next[line[0]]
                if (first.multiplier === 0) continue
                const matched = line.every(idx => next[idx].id === first.id)
                if (matched) {
                    multiplier += first.multiplier
                    line.forEach(idx => winSet.add(idx))
                }
            }
        } else {
            const counts = next.reduce((acc, sym) => ({ ...acc, [sym.id]: (acc[sym.id] || 0) + 1 }), {})
            Object.entries(counts).forEach(([id, count]) => {
                const sym = themeSymbols.find(s => s.id === id)
                if (!sym || sym.multiplier === 0) return
                if (count >= 6) {
                    multiplier += sym.multiplier * (count / 6)
                    next.forEach((s, i) => { if (s.id === id) winSet.add(i) })
                }
            })
            multiplier = Math.round(multiplier * 100) / 100
        }
        const returnAmount = betAmount * multiplier
        const profit = returnAmount - betAmount
        const totalDelay = variantConfig.cols * 220 + 200
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Slots return')
            setWinningCells(Array.from(winSet))
            setBurstKey(k => k + 1)
            setObservedRtp(prev => ({ wagered: prev.wagered + betAmount, returned: prev.returned + returnAmount }))
            setSpinning(false)
            playSound(returnAmount > 0 ? 'win' : 'loss')
            setResults(prev => [{ id: Date.now(), label: `${multiplier}x`, profit }, ...prev])
            showToast(profit >= 0 ? 'win' : 'loss', `Slots ${multiplier}x`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        }, totalDelay)
    }

    const obsRtp = observedRtp.wagered > 0 ? (observedRtp.returned / observedRtp.wagered) * 100 : 0

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} disabled={spinning} actionLabel={spinning ? 'Spinning...' : 'Spin Reels'} onAction={spin}>
                <div className="sim-input-group">
                    <label>Theme</label>
                    <div className="segmented">
                        {Object.entries(themes).map(([key, t]) => (
                            <button key={key} className={theme === key ? 'active' : ''} onClick={() => !spinning && setTheme(key)}>{t.name}</button>
                        ))}
                    </div>
                </div>
                <div className="sim-input-group">
                    <label>Variant</label>
                    <div className="segmented">
                        <button className={variant === 'lines' ? 'active' : ''} onClick={() => !spinning && setVariant('lines')}>5x3 Lines</button>
                        <button className={variant === 'cluster' ? 'active' : ''} onClick={() => !spinning && setVariant('cluster')}>6x4 Cluster</button>
                    </div>
                </div>
                <div className="sim-metric-line">
                    <span>Observed RTP</span>
                    <strong>{observedRtp.wagered > 0 ? `${obsRtp.toFixed(1)}%` : '--'}</strong>
                </div>
            </BetControls>
            <div className={`sim-playfield slots-field theme-${theme}`}>
                <div className={`slots-grid variant-${variant}`} style={{ gridTemplateColumns: `repeat(${variantConfig.cols}, 1fr)` }}>
                    {reels.map((symbol, index) => {
                        const col = index % variantConfig.cols
                        const isSpinning = spinning && col >= stoppedCols
                        const isWinning = winningCells.includes(index)
                        return (
                            <div
                                key={`${symbol.id}-${index}`}
                                className={`slot-cell ${symbol.id} ${isSpinning ? 'reel-spin' : 'reel-stop'} ${isWinning ? 'cluster-glow' : ''}`}
                                style={{ animationDelay: `${col * 50}ms` }}
                            >
                                {symbol.label}
                            </div>
                        )
                    })}
                </div>
                {burstKey > 0 && winningCells.length > 0 && <Particles key={burstKey} count={20} color="#ffcf5a" />}
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={0.28} payoutMultiplier={2.4} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function CoinFlipSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [choice, setChoice] = useState('head')
    const [result, setResult] = useState(null)
    const [isFlipping, setIsFlipping] = useState(false)
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [results, setResults] = useState([])
    const payout = 1.96

    const play = () => {
        if (!placeBet(betAmount, 'Coin Flip')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('flip')
        setIsFlipping(true)
        const { roll: r } = nextRoll('coinflip')
        const next = r < 0.5 ? 'head' : 'tail'
        const won = next === choice
        const returnAmount = won ? betAmount * payout : 0
        const profit = returnAmount - betAmount
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Coin Flip return')
            setResult(next)
            setLastWon(won)
            setBurstKey(k => k + 1)
            setIsFlipping(false)
            playSound(won ? 'win' : 'loss')
            setResults(prev => [{ id: Date.now(), label: next, profit }, ...prev])
            showToast(won ? 'win' : 'loss', won ? 'Coin matched' : 'Coin missed', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        }, 900)
    }

    const active = coinOptions.find(item => item.id === (result || choice))

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} disabled={isFlipping} actionLabel={isFlipping ? 'Flipping...' : 'Flip Coin'} onAction={play}>
                <div className="asset-choice-row">
                    {coinOptions.map(option => (
                        <button key={option.id} className={choice === option.id ? 'active' : ''} onClick={() => !isFlipping && setChoice(option.id)}>
                            <img src={option.image} alt="" />
                            <span>{option.label}</span>
                        </button>
                    ))}
                </div>
                <div className="sim-metric-line">
                    <span>Payout</span>
                    <strong>{payout.toFixed(2)}x</strong>
                </div>
            </BetControls>
            <div className={`sim-playfield classic-field ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <div className={`coin3d-stage ${isFlipping ? 'flipping' : ''} ${lastWon === true ? 'won' : ''}`}>
                    <div className="coin3d">
                        <div className="coin3d-face front"><img src={coinOptions[0].image} alt="" /></div>
                        <div className="coin3d-face back"><img src={coinOptions[1].image} alt="" /></div>
                        <div className="coin3d-edge" />
                    </div>
                </div>
                <div className="classic-result">{result ? `Result: ${result}` : 'Choose a side'}</div>
                {lastWon && burstKey > 0 && <Particles key={burstKey} count={16} color="#ffcf5a" />}
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={0.5} payoutMultiplier={payout} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function RockPaperScissorsSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [choice, setChoice] = useState('rock')
    const [house, setHouse] = useState(null)
    const [phase, setPhase] = useState('idle')
    const [lastWon, setLastWon] = useState(null)
    const [results, setResults] = useState([])
    const [burstKey, setBurstKey] = useState(0)
    const payout = 2.91

    const play = () => {
        if (!placeBet(betAmount, 'Rock Paper Scissors')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        const player = rpsOptions.find(item => item.id === choice)
        const { roll: r } = nextRoll('rps')
        const dealer = rpsOptions[Math.floor(r * rpsOptions.length)]
        const push = player.id === dealer.id
        const won = player.beats === dealer.id
        const returnAmount = push ? betAmount : won ? betAmount * payout : 0
        const profit = returnAmount - betAmount
        playSound('tick')
        setPhase('slamming')
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'RPS return')
            setHouse(dealer)
            setLastWon(push ? null : won)
            setBurstKey(k => k + 1)
            setPhase(push ? 'push' : won ? 'won' : 'lost')
            playSound(won ? 'win' : push ? 'click' : 'loss')
            setResults(prev => [{ id: Date.now(), label: push ? 'Push' : won ? 'Win' : 'Miss', profit }, ...prev])
            showToast(won ? 'win' : push ? 'bet' : 'loss', push ? 'Push' : won ? 'RPS win' : 'RPS miss', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        }, 600)
    }

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} disabled={phase === 'slamming'} actionLabel={phase === 'slamming' ? 'Playing...' : 'Play Round'} onAction={play}>
                <div className="asset-choice-row stacked">
                    {rpsOptions.map(option => (
                        <button key={option.id} className={choice === option.id ? 'active' : ''} onClick={() => phase !== 'slamming' && setChoice(option.id)}>
                            <img src={option.image} alt="" />
                            <span>{option.label}</span>
                        </button>
                    ))}
                </div>
            </BetControls>
            <div className={`sim-playfield rps-field ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <div className={`rps-versus phase-${phase}`}>
                    <div className={`rps-side player ${phase === 'won' ? 'winner' : phase === 'lost' ? 'loser' : ''}`}>
                        <span>You</span>
                        <img src={rpsOptions.find(item => item.id === choice).image} alt="" />
                    </div>
                    <strong className={`rps-vs ${phase === 'push' ? 'push-shake' : ''}`}>VS</strong>
                    <div className={`rps-side dealer ${phase === 'lost' ? 'winner' : phase === 'won' ? 'loser' : ''}`}>
                        <span>Lab</span>
                        {house ? <img src={house.image} alt="" /> : <span className="rps-placeholder">?</span>}
                    </div>
                </div>
                {lastWon && burstKey > 0 && <Particles key={burstKey} count={14} color="#00e701" />}
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={1 / 3} payoutMultiplier={payout} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function GuessNumberSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [choice, setChoice] = useState(7)
    const [result, setResult] = useState(null)
    const [spinning, setSpinning] = useState(false)
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [results, setResults] = useState([])
    const payout = 9.4

    const play = () => {
        if (!placeBet(betAmount, 'Guess Number')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('tick')
        setSpinning(true)
        const { roll: r } = nextRoll('guess')
        const next = Math.floor(r * 10)
        const won = next === choice
        const returnAmount = won ? betAmount * payout : 0
        const profit = returnAmount - betAmount
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Guess Number return')
            setResult(next)
            setLastWon(won)
            setBurstKey(k => k + 1)
            setSpinning(false)
            playSound(won ? 'win' : 'loss')
            setResults(prev => [{ id: Date.now(), label: String(next), profit }, ...prev])
            showToast(won ? 'win' : 'loss', won ? 'Number hit' : 'Number missed', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        }, 1100)
    }

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} disabled={spinning} actionLabel={spinning ? 'Spinning...' : 'Reveal Number'} onAction={play}>
                <div className="number-picker">
                    {Array.from({ length: 10 }, (_, index) => (
                        <button key={index} className={choice === index ? 'active' : ''} onClick={() => !spinning && setChoice(index)}>
                            {index}
                        </button>
                    ))}
                </div>
            </BetControls>
            <div className={`sim-playfield guess-field ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <div className={`number-orb ${spinning ? 'spinning' : ''} ${lastWon === true ? 'won' : lastWon === false ? 'lost' : ''}`}>
                    <div className="number-reel">
                        {result === null ? '?' : result}
                    </div>
                </div>
                <p className="sim-muted">Picked {choice}. Hit chance 10%.</p>
                {lastWon && burstKey > 0 && <Particles key={burstKey} count={18} color="#41d6ff" />}
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={0.1} payoutMultiplier={payout} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function HiloSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [currentCard, setCurrentCard] = useState(7)
    const [nextCard, setNextCard] = useState(null)
    const [direction, setDirection] = useState('higher')
    const [streak, setStreak] = useState(0)
    const [lastWon, setLastWon] = useState(null)
    const [flipping, setFlipping] = useState(false)
    const [burstKey, setBurstKey] = useState(0)
    const [results, setResults] = useState([])

    const winChance = direction === 'higher'
        ? (13 - currentCard) / 13
        : (currentCard - 1) / 13
    const payout = winChance > 0 ? Math.max(1.01, 0.96 / winChance) : 0

    const play = () => {
        if (winChance <= 0) {
            showToast('error', 'No winning cards', 'Choose the other direction')
            return
        }
        if (!placeBet(betAmount, 'Hi-Lo Cards')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('flip')
        setFlipping(true)
        const { roll: r } = nextRoll('hilo')
        const next = Math.floor(r * 13) + 1
        const push = next === currentCard
        const won = direction === 'higher' ? next > currentCard : next < currentCard
        const returnAmount = push ? betAmount : won ? betAmount * payout : 0
        const profit = returnAmount - betAmount
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Hi-Lo return')
            setNextCard(next)
            setCurrentCard(next)
            setLastWon(push ? null : won)
            setBurstKey(k => k + 1)
            setStreak(prev => won ? prev + 1 : 0)
            setFlipping(false)
            playSound(won ? 'win' : push ? 'click' : 'loss')
            setResults(prev => [{ id: Date.now(), label: push ? 'Push' : won ? 'Win' : 'Miss', profit }, ...prev])
            showToast(won ? 'win' : push ? 'bet' : 'loss', push ? 'Push' : won ? 'Hi-Lo hit' : 'Hi-Lo miss', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        }, 600)
    }

    const renderRank = (value) => {
        if (value === 1) return 'A'
        if (value === 11) return 'J'
        if (value === 12) return 'Q'
        if (value === 13) return 'K'
        return String(value)
    }

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} disabled={flipping} actionLabel={flipping ? 'Flipping...' : 'Draw Card'} onAction={play}>
                <div className="segmented">
                    <button className={direction === 'higher' ? 'active' : ''} onClick={() => setDirection('higher')}>Higher</button>
                    <button className={direction === 'lower' ? 'active' : ''} onClick={() => setDirection('lower')}>Lower</button>
                </div>
                <div className="sim-metric-line">
                    <span>Chance</span>
                    <strong>{(winChance * 100).toFixed(1)}%</strong>
                </div>
                <div className="sim-metric-line">
                    <span>Streak</span>
                    <strong className={streak >= 3 ? 'streak-flair' : ''}>{streak}{streak >= 3 ? ' fire' : ''}</strong>
                </div>
            </BetControls>
            <div className={`sim-playfield hilo-field ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <div className="hilo-cards">
                    <span className="hilo-card">{renderRank(currentCard)}</span>
                    <span className="hilo-arrow">{direction === 'higher' ? '>' : '<'}</span>
                    <span className={`hilo-card next ${flipping ? 'flipping' : ''} ${lastWon === true ? 'won' : lastWon === false ? 'lost' : ''}`}>
                        {nextCard ? renderRank(nextCard) : '?'}
                    </span>
                </div>
                {lastWon && burstKey > 0 && <Particles key={burstKey} count={12} color="#ffcf5a" />}
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={winChance || 0.01} payoutMultiplier={payout || 1} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function BaccaratSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [betType, setBetType] = useState('banker')
    const [hand, setHand] = useState(null)
    const [results, setResults] = useState([])
    const [shoeHistory, setShoeHistory] = useState([])
    const [dealKey, setDealKey] = useState(0)
    const [revealing, setRevealing] = useState(false)
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)

    const play = () => {
        if (!placeBet(betAmount, 'Baccarat')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('deal')
        setRevealing(true)
        const nextHand = drawBaccaratHand()
        const playerScore = baccaratValue(nextHand.player)
        const bankerScore = baccaratValue(nextHand.banker)
        const outcome = playerScore === bankerScore ? 'tie' : playerScore > bankerScore ? 'player' : 'banker'
        const multipliers = { banker: 1.95, player: 2, tie: 8 }
        const won = outcome === betType
        const returnAmount = won ? betAmount * multipliers[betType] : 0
        const profit = returnAmount - betAmount
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Baccarat return')
            setHand(nextHand)
            setLastWon(won)
            setBurstKey(k => k + 1)
            setRevealing(false)
            setDealKey(k => k + 1)
            playSound(won ? 'win' : 'loss')
            setResults(prev => [{ id: Date.now(), label: outcome, profit }, ...prev])
            setShoeHistory(prev => [outcome, ...prev].slice(0, 60))
            showToast(profit >= 0 ? 'win' : 'loss', `Baccarat ${outcome}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        }, 700)
    }

    const winChance = betType === 'banker' ? 0.4586 : betType === 'player' ? 0.4462 : 0.0952
    const payout = betType === 'banker' ? 1.95 : betType === 'player' ? 2 : 8
    const shoeStats = shoeHistory.reduce((acc, o) => ({ ...acc, [o]: (acc[o] || 0) + 1 }), {})

    // Bead road: 6 rows x as many columns as needed
    const beadRoad = []
    for (let i = 0; i < shoeHistory.length; i++) {
        const col = Math.floor(i / 6)
        const row = i % 6
        if (!beadRoad[col]) beadRoad[col] = []
        beadRoad[col][row] = shoeHistory[shoeHistory.length - 1 - i]
    }

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} disabled={revealing} actionLabel={revealing ? 'Dealing...' : 'Deal Baccarat'} onAction={play}>
                <div className="segmented">
                    {['banker', 'player', 'tie'].map(option => <button key={option} className={betType === option ? 'active' : ''} onClick={() => !revealing && setBetType(option)}>{option}</button>)}
                </div>
                <div className="sim-metric-line"><span>Banker / Player / Tie</span><strong>{shoeStats.banker || 0} / {shoeStats.player || 0} / {shoeStats.tie || 0}</strong></div>
            </BetControls>
            <div className={`sim-playfield table-field ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''} ${revealing ? 'revealing' : ''}`}>
                <Hand label={`Player ${hand ? baccaratValue(hand.player) : '--'}`} cards={hand?.player || []} dealAnimKey={dealKey} />
                <Hand label={`Banker ${hand ? baccaratValue(hand.banker) : '--'}`} cards={hand?.banker || []} dealAnimKey={dealKey} />
                <div className="baccarat-bead-road">
                    {beadRoad.length === 0 ? <span className="sim-muted">Bead road empty</span> : beadRoad.map((col, ci) => (
                        <div className="bead-col" key={ci}>
                            {col.map((o, ri) => o ? <span key={ri} className={`bead-cell ${o}`}>{o[0].toUpperCase()}</span> : <span key={ri} className="bead-cell empty" />)}
                        </div>
                    ))}
                </div>
                {lastWon && burstKey > 0 && <Particles key={burstKey} count={14} color="#f6c85f" />}
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={winChance} payoutMultiplier={payout} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function SicBoSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [betType, setBetType] = useState('big')
    const [dice, setDice] = useState([1, 2, 3])
    const [tumbling, setTumbling] = useState(false)
    const [showCup, setShowCup] = useState(false)
    const [revealed, setRevealed] = useState([false, false, false])
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [results, setResults] = useState([])

    const play = () => {
        if (!placeBet(betAmount, 'Sic Bo')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('tick')
        setTumbling(true)
        setShowCup(true)
        setRevealed([false, false, false])
        const r1 = nextRoll('sicbo').roll
        const r2 = nextRoll('sicbo').roll
        const r3 = nextRoll('sicbo').roll
        const next = [Math.floor(r1 * 6) + 1, Math.floor(r2 * 6) + 1, Math.floor(r3 * 6) + 1]
        const total = next.reduce((sum, value) => sum + value, 0)
        const triple = next.every(value => value === next[0])
        const won = betType === 'big' ? total >= 11 && total <= 17 && !triple
            : betType === 'small' ? total >= 4 && total <= 10 && !triple
                : triple
        const payout = betType === 'triple' ? 31 : 2
        const returnAmount = won ? betAmount * payout : 0
        const profit = returnAmount - betAmount
        // Cup shake then reveal one by one
        window.setTimeout(() => {
            setShowCup(false)
            setDice(next)
            playSound('flip')
            setRevealed([true, false, false])
            window.setTimeout(() => { playSound('flip'); setRevealed([true, true, false]) }, 250)
            window.setTimeout(() => {
                playSound('flip')
                setRevealed([true, true, true])
                if (returnAmount > 0) addWinnings(returnAmount, 'Sic Bo return')
                setLastWon(won)
                setBurstKey(k => k + 1)
                setTumbling(false)
                playSound(won ? 'win' : 'loss')
                setResults(prev => [{ id: Date.now(), label: `${total}`, profit }, ...prev])
                showToast(won ? 'win' : 'loss', `Sic Bo total ${total}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            }, 520)
        }, 800)
    }

    const chance = betType === 'triple' ? 6 / 216 : 105 / 216
    const payout = betType === 'triple' ? 31 : 2

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} disabled={tumbling} actionLabel={tumbling ? 'Rolling...' : 'Roll Dice'} onAction={play}>
                <div className="segmented">
                    {['big', 'small', 'triple'].map(option => <button key={option} className={betType === option ? 'active' : ''} onClick={() => !tumbling && setBetType(option)}>{option}</button>)}
                </div>
            </BetControls>
            <div className={`sim-playfield dice-table-field ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                {showCup ? (
                    <div className="sicbo-cup-stage">
                        <div className="sicbo-cup">
                            <span>?</span><span>?</span><span>?</span>
                        </div>
                    </div>
                ) : (
                    <div className="dice-cups">
                        {dice.map((value, index) => (
                            <span key={index} className={`die ${revealed[index] ? 'revealed' : 'hidden'} ${betType === 'triple' && lastWon ? 'triple-win' : ''}`} style={{ animationDelay: `${index * 100}ms` }}>{revealed[index] ? value : '?'}</span>
                        ))}
                    </div>
                )}
                <div className="classic-result">Total {dice.reduce((sum, value) => sum + value, 0)}</div>
                {lastWon && burstKey > 0 && <Particles key={burstKey} count={16} color="#ff8f3d" />}
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={chance} payoutMultiplier={payout} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function VideoPokerSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [cards, setCards] = useState([])
    const [held, setHeld] = useState([])
    const [phase, setPhase] = useState('idle')
    const [activeBet, setActiveBet] = useState(0)
    const [message, setMessage] = useState('Deal five cards')
    const [results, setResults] = useState([])
    const [outcomeKey, setOutcomeKey] = useState(null)
    const [dealKey, setDealKey] = useState(0)
    const [burstKey, setBurstKey] = useState(0)

    const paytable = [
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

    const deal = () => {
        if (!placeBet(betAmount, 'Video Poker')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('deal')
        setCards(shuffleDeck().slice(0, 5))
        setHeld([])
        setActiveBet(betAmount)
        setPhase('draw')
        setMessage('Hold cards, then draw')
        setOutcomeKey(null)
        setDealKey(k => k + 1)
    }

    const draw = () => {
        playSound('flip')
        const deck = shuffleDeck().filter(card => !cards.some(existing => existing.rank === card.rank && existing.suit === card.suit))
        let deckIndex = 0
        const finalCards = cards.map((card, index) => held.includes(index) ? card : deck[deckIndex++])
        const outcome = evaluatePokerHand(finalCards)
        const returnAmount = activeBet * outcome.multiplier
        const profit = returnAmount - activeBet
        if (returnAmount > 0) addWinnings(returnAmount, 'Video Poker return')
        setCards(finalCards)
        setPhase('idle')
        setActiveBet(0)
        setMessage(outcome.label)
        setOutcomeKey(outcome.label)
        setBurstKey(k => k + 1)
        setDealKey(k => k + 1)
        playSound(returnAmount > 0 ? 'win' : 'loss')
        setResults(prev => [{ id: Date.now(), label: `${outcome.multiplier}x`, profit }, ...prev])
        showToast(profit >= 0 ? 'win' : 'loss', outcome.label, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
    }

    const suitSymbol = (s) => s === 'H' ? '\u2665' : s === 'D' ? '\u2666' : s === 'S' ? '\u2660' : '\u2663'
    const suitColor = (s) => (s === 'H' || s === 'D') ? 'red' : 'black'

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} disabled={phase === 'draw'} actionLabel="Deal Poker" onAction={deal}>
                <button className="sim-secondary-btn" disabled={phase !== 'draw'} onClick={draw}>Draw selected hand</button>
            </BetControls>
            <div className="sim-playfield poker-field">
                <div className="paytable">
                    {paytable.map(row => (
                        <div key={row.key} className={`paytable-row ${outcomeKey === row.key ? 'won' : ''}`}>
                            <span>{row.key}</span>
                            <strong>{row.multiplier}x</strong>
                        </div>
                    ))}
                </div>
                <div className="poker-row">
                    {(cards.length ? cards : Array.from({ length: 5 }, () => null)).map((card, index) => (
                        <button
                            key={`${dealKey}-${index}`}
                            className={`poker-card ${held.includes(index) ? 'held' : ''} ${suitColor(card?.suit || '')}`}
                            disabled={!card || phase !== 'draw'}
                            style={{ animationDelay: `${index * 90}ms` }}
                            onClick={() => setHeld(prev => prev.includes(index) ? prev.filter(item => item !== index) : [...prev, index])}
                        >
                            {card ? (
                                <>
                                    <span className="poker-rank">{card.rank}</span>
                                    <span className="poker-suit">{suitSymbol(card.suit)}</span>
                                </>
                            ) : '--'}
                            {held.includes(index) && <span className="poker-hold">HOLD</span>}
                        </button>
                    ))}
                </div>
                <p className="classic-result">{message}</p>
                {outcomeKey && burstKey > 0 && <Particles key={burstKey} count={14} color="#8ae66e" />}
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={0.45} payoutMultiplier={1.85} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function ColorSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [choice, setChoice] = useState('red')
    const [result, setResult] = useState(null)
    const [spinning, setSpinning] = useState(false)
    const [rotation, setRotation] = useState(0)
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [results, setResults] = useState([])
    const payout = 3.84

    const play = () => {
        if (!placeBet(betAmount, 'Color Pick')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('tick')
        setSpinning(true)
        const { roll: r } = nextRoll('color')
        const idx = Math.floor(r * colorOptions.length)
        const next = colorOptions[idx]
        const won = next.id === choice
        const returnAmount = won ? betAmount * payout : 0
        const profit = returnAmount - betAmount
        const segAngle = 360 / colorOptions.length
        const fullSpins = 5
        const target = fullSpins * 360 + (360 - idx * segAngle - segAngle / 2)
        setRotation(prev => prev + (target - (prev % 360)))
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Color Pick return')
            setResult(next)
            setLastWon(won)
            setBurstKey(k => k + 1)
            setSpinning(false)
            playSound(won ? 'win' : 'loss')
            setResults(prev => [{ id: Date.now(), label: next.label, profit }, ...prev])
            showToast(won ? 'win' : 'loss', `Color ${next.label}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        }, 1900)
    }

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} disabled={spinning} actionLabel={spinning ? 'Spinning...' : 'Pick Color'} onAction={play}>
                <div className="color-choice-row">
                    {colorOptions.map(option => <button key={option.id} className={choice === option.id ? 'active' : ''} style={{ '--swatch': option.color }} onClick={() => !spinning && setChoice(option.id)}>{option.label}</button>)}
                </div>
            </BetControls>
            <div className={`sim-playfield color-field ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`} style={{ '--result-color': result?.color || colorOptions.find(item => item.id === choice).color }}>
                <div className="color-pointer" />
                <div className="color-spectrum" style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 1.8s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                    {colorOptions.map((opt, i) => (
                        <span key={opt.id} className="color-slice" style={{ '--swatch': opt.color, transform: `rotate(${i * (360 / colorOptions.length)}deg)` }}>{opt.label}</span>
                    ))}
                </div>
                <div className="color-result-label">{result?.label || 'Pick'}</div>
                {lastWon && burstKey > 0 && <Particles key={burstKey} count={20} color={result?.color || '#fff'} />}
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={0.25} payoutMultiplier={payout} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function TowerSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [level, setLevel] = useState(0)
    const [activeBet, setActiveBet] = useState(0)
    const [phase, setPhase] = useState('idle')
    const [results, setResults] = useState([])
    const [stepKey, setStepKey] = useState(0)
    const [fellAt, setFellAt] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const safeChance = 0.7
    const multiplier = Number(Math.pow(1.28, level).toFixed(2))

    const start = () => {
        if (!placeBet(betAmount, 'Tower Climb')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('click')
        setActiveBet(betAmount)
        setLevel(0)
        setFellAt(null)
        setPhase('climbing')
    }

    const climb = () => {
        const safe = nextRoll('tower').roll < safeChance
        if (safe) {
            playSound('flip')
            setStepKey(k => k + 1)
            setLevel(prev => prev + 1)
            showToast('win', 'Safe step', `Level ${level + 1}`)
            return
        }
        playSound('explode')
        setFellAt(level)
        setResults(prev => [{ id: Date.now(), label: 'Fall', profit: -activeBet }, ...prev])
        window.setTimeout(() => {
            setPhase('idle')
            setActiveBet(0)
            setLevel(0)
            setFellAt(null)
        }, 700)
        showToast('loss', 'Tower fell', `-${formatCredits(activeBet)}`)
    }

    const cashout = () => {
        const returnAmount = activeBet * multiplier
        const profit = returnAmount - activeBet
        addWinnings(returnAmount, 'Tower return')
        playSound('win')
        setBurstKey(k => k + 1)
        setResults(prev => [{ id: Date.now(), label: `${multiplier}x`, profit }, ...prev])
        setPhase('idle')
        setActiveBet(0)
        window.setTimeout(() => setLevel(0), 800)
        showToast('win', 'Tower cashed out', `+${formatCredits(profit)}`)
    }

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} disabled={phase === 'climbing'} actionLabel="Start Tower" onAction={start}>
                <button className="sim-secondary-btn" disabled={phase !== 'climbing'} onClick={climb}>Climb one step</button>
                <button className={`sim-secondary-btn ${phase === 'climbing' && level > 0 ? 'fx-pulse' : ''}`} disabled={phase !== 'climbing' || level === 0} onClick={cashout}>Cash out {multiplier.toFixed(2)}x</button>
            </BetControls>
            <div className={`sim-playfield tower-field ${fellAt !== null ? 'fx-shake' : ''}`}>
                <div className="tower-stack" style={{ transform: `translateY(${level * 4}px)`, transition: 'transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
                    {Array.from({ length: 8 }, (_, index) => {
                        const tileLevel = 8 - index
                        const isCurrent = tileLevel === level + 1 && phase === 'climbing'
                        const isLit = index < level
                        const isFallen = fellAt !== null && index === fellAt
                        return (
                            <span key={index} className={`tower-tile ${isLit ? 'lit' : ''} ${isCurrent ? 'current' : ''} ${isFallen ? 'fallen' : ''}`}>
                                {tileLevel}
                            </span>
                        )
                    })}
                </div>
                <p className="classic-result">Level {level} / Current {multiplier.toFixed(2)}x</p>
                {burstKey > 0 && phase === 'idle' && results[0]?.profit > 0 && <Particles key={burstKey} count={18} color="#41d6ff" />}
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={Math.pow(safeChance, Math.max(1, level + 1))} payoutMultiplier={Math.max(1.28, multiplier)} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function LotterySimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [selected, setSelected] = useState([3, 9, 14, 21, 32])
    const [drawn, setDrawn] = useState([])
    const [drawing, setDrawing] = useState(false)
    const [drawAnim, setDrawAnim] = useState([])
    const [burstKey, setBurstKey] = useState(0)
    const [results, setResults] = useState([])

    const toggle = (number) => setSelected(prev => prev.includes(number) ? prev.filter(item => item !== number) : prev.length < 5 ? [...prev, number].sort((a, b) => a - b) : prev)

    const play = () => {
        if (selected.length !== 5) return
        if (!placeBet(betAmount, 'Lottery Draw')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('tick')
        setDrawing(true)
        setDrawAnim([])
        const next = sampleUniqueNumbers({ max: 36, count: 5, random: () => nextRoll('lottery').roll })
        // Drop balls one-by-one
        next.forEach((n, i) => {
            window.setTimeout(() => {
                playSound('flip')
                setDrawAnim(prev => [...prev, n])
            }, 400 + i * 350)
        })
        const hits = selected.filter(number => next.includes(number)).length
        const table = [0, 0, 1, 8, 120, 5000]
        const multiplier = table[hits]
        const returnAmount = betAmount * multiplier
        const profit = returnAmount - betAmount
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Lottery return')
            setDrawn(next)
            setBurstKey(k => k + 1)
            setDrawing(false)
            playSound(returnAmount > 0 ? 'win' : 'loss')
            setResults(prev => [{ id: Date.now(), label: `${hits}/5`, profit }, ...prev])
            showToast(profit >= 0 ? 'win' : 'loss', `Lottery ${hits} hits`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        }, 400 + next.length * 350 + 200)
    }

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} disabled={selected.length !== 5 || drawing} actionLabel={drawing ? 'Drawing...' : 'Draw Lottery'} onAction={play}>
                <button className="sim-secondary-btn" disabled={drawing} onClick={() => setSelected(sampleUniqueNumbers({ max: 36, count: 5 }))}>Quick pick</button>
                <div className="sim-metric-line"><span>Selected</span><strong>{selected.length}/5</strong></div>
            </BetControls>
            <div className="sim-playfield lottery-field">
                <div className="lottery-tumbler">
                    <div className={`tumbler-glass ${drawing ? 'shaking' : ''}`}>
                        {drawAnim.map((n, i) => (
                            <span key={`${n}-${i}`} className="tumbler-ball" style={{ '--i': i, animationDelay: `${i * 60}ms` }}>{n}</span>
                        ))}
                    </div>
                </div>
                <div className="lottery-grid">
                    {Array.from({ length: 36 }, (_, index) => index + 1).map(number => {
                        const isSelected = selected.includes(number)
                        const isDrawn = drawAnim.includes(number)
                        const isHit = isSelected && isDrawn
                        return (
                            <button key={number}
                                className={`${isSelected ? 'selected' : ''} ${isDrawn ? 'drawn' : ''} ${isHit ? 'hit' : ''}`}
                                disabled={drawing}
                                onClick={() => !drawing && toggle(number)}
                            >{number}</button>
                        )
                    })}
                </div>
                {burstKey > 0 && results[0]?.profit > 0 && <Particles key={burstKey} count={20} color="#ffcf5a" />}
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={1 / 376992} payoutMultiplier={5000} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function CasinoWarSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [hand, setHand] = useState(null)
    const [results, setResults] = useState([])
    const [slamming, setSlamming] = useState(false)
    const [phase, setPhase] = useState('idle') // idle | tied (offer go-to-war)
    const [tiedHand, setTiedHand] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const payout = 2

    const drawCard = () => {
        const deck = shuffleDeck()
        return deck[0]
    }

    const settle = (playerCard, dealerCard, outcome, profitOverride = null) => {
        const profit = profitOverride !== null ? profitOverride : (outcome === 'win' ? betAmount : outcome === 'tie-resolved-win' ? betAmount : -betAmount)
        setHand({ player: playerCard, dealer: dealerCard, outcome })
        setBurstKey(k => k + 1)
        playSound(profit >= 0 ? 'win' : 'loss')
        setResults(prev => [{ id: Date.now(), label: outcome, profit }, ...prev])
        showToast(profit >= 0 ? 'win' : 'loss', `War ${outcome}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
    }

    const play = () => {
        if (!placeBet(betAmount, 'Casino War')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('deal')
        setSlamming(true)
        const playerCard = drawCard()
        let dealerCard = drawCard()
        while (dealerCard.rank === playerCard.rank && dealerCard.suit === playerCard.suit) {
            dealerCard = drawCard()
        }
        const playerVal = cardValue(playerCard.rank)
        const dealerVal = cardValue(dealerCard.rank)

        window.setTimeout(() => {
            setSlamming(false)
            if (playerVal > dealerVal) {
                addWinnings(betAmount * payout, 'Casino War return')
                settle(playerCard, dealerCard, 'win', betAmount)
                setPhase('idle')
            } else if (playerVal === dealerVal) {
                // Offer go-to-war
                setTiedHand({ playerCard, dealerCard })
                setHand({ player: playerCard, dealer: dealerCard, outcome: 'tie' })
                setPhase('tied')
                showToast('bet', 'Tie!', 'Surrender (-50%) or Go to War (double bet)')
            } else {
                settle(playerCard, dealerCard, 'loss', -betAmount)
                setPhase('idle')
            }
        }, 600)
    }

    const surrenderTie = () => {
        // Lose half
        if (!tiedHand) return
        addWinnings(betAmount / 2, 'Casino War tie surrender')
        settle(tiedHand.playerCard, tiedHand.dealerCard, 'surrender', -betAmount / 2)
        setPhase('idle')
        setTiedHand(null)
    }

    const goToWar = () => {
        if (!tiedHand) return
        if (!placeBet(betAmount, 'Casino War double')) {
            showToast('error', 'Not enough credits', 'Cannot go to war')
            return
        }
        playSound('deal')
        setSlamming(true)
        // Burn 3, deal 1 each (simplified)
        const newPlayer = drawCard()
        let newDealer = drawCard()
        while (newDealer.rank === newPlayer.rank && newDealer.suit === newPlayer.suit) newDealer = drawCard()
        const pv = cardValue(newPlayer.rank)
        const dv = cardValue(newDealer.rank)
        window.setTimeout(() => {
            setSlamming(false)
            if (pv >= dv) {
                // Win pays 1:1 on the bonus bet only; original returns
                const totalWin = betAmount * 2 + betAmount
                addWinnings(totalWin, 'Casino War tie-win return')
                settle(newPlayer, newDealer, 'tie-win', betAmount)
            } else {
                // Lose both
                settle(newPlayer, newDealer, 'tie-loss', -betAmount * 2)
            }
            setPhase('idle')
            setTiedHand(null)
        }, 600)
    }

    const renderRank = (c) => c ? `${c.rank}${c.suit === 'H' ? '\u2665' : c.suit === 'D' ? '\u2666' : c.suit === 'S' ? '\u2660' : '\u2663'}` : '?'

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} disabled={slamming || phase === 'tied'} actionLabel={slamming ? 'Drawing...' : 'Draw Cards'} onAction={play}>
                <div className="sim-metric-line"><span>Win payout</span><strong>{payout.toFixed(2)}x</strong></div>
                <div className="sim-metric-line"><span>Go-to-war ties</span><strong>+1x</strong></div>
                {phase === 'tied' && (
                    <>
                        <button className="sim-secondary-btn" onClick={surrenderTie}>Surrender (-50%)</button>
                        <button className="sim-secondary-btn" onClick={goToWar}>Go to War (double bet)</button>
                    </>
                )}
            </BetControls>
            <div className={`sim-playfield war-field ${hand?.outcome === 'win' || hand?.outcome === 'tie-win' ? 'win-flash' : hand?.outcome === 'loss' || hand?.outcome === 'tie-loss' ? 'loss-flash' : ''}`}>
                <div className={`war-row ${slamming ? 'slamming' : ''}`}>
                    <div className="war-side">
                        <span>You</span>
                        <div className={`war-card ${hand?.outcome === 'win' || hand?.outcome === 'tie-win' ? 'win' : (hand?.outcome === 'loss' || hand?.outcome === 'tie-loss') ? 'loss' : ''}`}>
                            <span>{renderRank(hand?.player)}</span>
                        </div>
                    </div>
                    <strong className={`war-versus ${phase === 'tied' ? 'fx-shake' : ''}`}>VS</strong>
                    <div className="war-side">
                        <span>Dealer</span>
                        <div className={`war-card ${hand?.outcome === 'loss' || hand?.outcome === 'tie-loss' ? 'win' : (hand?.outcome === 'win' || hand?.outcome === 'tie-win') ? 'loss' : ''}`}>
                            <span>{renderRank(hand?.dealer)}</span>
                        </div>
                    </div>
                </div>
                <p className="classic-result">{hand ? `${hand.outcome.toUpperCase()}` : 'Higher rank wins'}</p>
                {hand && (hand.outcome === 'win' || hand.outcome === 'tie-win') && burstKey > 0 && <Particles key={burstKey} count={14} color="#ff7ab6" />}
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={0.467} payoutMultiplier={payout} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function ChickenCrossSimulator({ definition, balance }) {
    const { placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const [betAmount, setBetAmount] = useState(5)
    const [risk, setRisk] = useState('medium')
    const [lane, setLane] = useState(0)
    const [activeBet, setActiveBet] = useState(0)
    const [phase, setPhase] = useState('idle')
    const [results, setResults] = useState([])
    const [hopKey, setHopKey] = useState(0)
    const [splat, setSplat] = useState(false)
    const [carKey, setCarKey] = useState(0)
    const [burstKey, setBurstKey] = useState(0)
    const lanes = 12

    const riskConfig = {
        easy: { safe: 0.85, growth: 1.18 },
        medium: { safe: 0.72, growth: 1.32 },
        hard: { safe: 0.58, growth: 1.55 },
    }
    const config = riskConfig[risk]
    const multiplier = Number(Math.pow(config.growth, lane).toFixed(2))

    const start = () => {
        if (!placeBet(betAmount, 'Chicken Cross')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            return
        }
        playSound('click')
        setActiveBet(betAmount)
        setLane(0)
        setSplat(false)
        setPhase('crossing')
    }

    const cross = () => {
        if (lane >= lanes) {
            cashout()
            return
        }
        const safe = nextRoll('chickencross').roll < config.safe
        // Random car flyby for ambient flair
        if (Math.random() < 0.3) setCarKey(k => k + 1)
        if (safe) {
            playSound('flip')
            setHopKey(k => k + 1)
            setLane(prev => prev + 1)
            return
        }
        playSound('explode')
        setSplat(true)
        setResults(prev => [{ id: Date.now(), label: 'Hit', profit: -activeBet }, ...prev])
        window.setTimeout(() => {
            setPhase('idle')
            setActiveBet(0)
            setLane(0)
            setSplat(false)
        }, 800)
        showToast('loss', 'Chicken hit', `-${formatCredits(activeBet)}`)
    }

    const cashout = () => {
        if (lane === 0) return
        const returnAmount = activeBet * multiplier
        const profit = returnAmount - activeBet
        addWinnings(returnAmount, 'Chicken Cross return')
        playSound('win')
        setBurstKey(k => k + 1)
        setResults(prev => [{ id: Date.now(), label: `${multiplier}x`, profit }, ...prev])
        setPhase('idle')
        setActiveBet(0)
        window.setTimeout(() => setLane(0), 800)
        showToast('win', 'Chicken cashed out', `+${formatCredits(profit)}`)
    }

    return (
        <>
            <BetControls betAmount={betAmount} setBetAmount={setBetAmount} disabled={phase === 'crossing'} actionLabel="Start Crossing" onAction={start}>
                <div className="segmented">
                    {Object.keys(riskConfig).map(option => (
                        <button key={option} className={risk === option ? 'active' : ''} onClick={() => phase !== 'crossing' && setRisk(option)}>{option}</button>
                    ))}
                </div>
                <button className="sim-secondary-btn" disabled={phase !== 'crossing'} onClick={cross}>Cross next lane</button>
                <button className={`sim-secondary-btn ${phase === 'crossing' && lane > 0 ? 'fx-pulse' : ''}`} disabled={phase !== 'crossing' || lane === 0} onClick={cashout}>Cash out {multiplier.toFixed(2)}x</button>
            </BetControls>
            <div className="sim-playfield chicken-field">
                <div className="chicken-road">
                    {Array.from({ length: lanes + 1 }, (_, index) => (
                        <div key={index} className={`chicken-lane ${index === lane ? 'current' : ''} ${index < lane ? 'crossed' : ''} ${splat && index === lane ? 'splat' : ''}`}>
                            {index === lane && phase === 'crossing' && (
                                <span key={`hop-${hopKey}-${splat}`} className={`chicken-sprite ${splat ? 'splatted' : 'hopping'}`} aria-label="chicken">
                                    {splat ? '\uD83D\uDCA5' : '\uD83D\uDC25'}
                                </span>
                            )}
                            <span className="chicken-mult">{Math.pow(config.growth, index).toFixed(2)}x</span>
                        </div>
                    ))}
                    {carKey > 0 && phase === 'crossing' && (
                        <span key={`car-${carKey}`} className="chicken-car" aria-hidden="true" />
                    )}
                </div>
                <p className="classic-result">Lane {lane} / {lanes}</p>
                {burstKey > 0 && phase === 'idle' && results[0]?.profit > 0 && <Particles key={burstKey} count={18} color="#ffcf5a" />}
                <ResultStrip results={results} />
            </div>
            <EducationPanel definition={definition} betAmount={betAmount} winProbability={Math.pow(config.safe, Math.max(1, lane + 1))} payoutMultiplier={Math.max(1, multiplier)} balance={balance} recentProfit={results.reduce((sum, item) => sum + item.profit, 0)} />
        </>
    )
}

function SimulatorGame({ fixedGameId }) {
    const { gameId } = useParams()
    const { balance } = useCredits()
    const activeGameId = fixedGameId || gameId
    const definition = useMemo(() => findGameDefinition(activeGameId), [activeGameId])

    if (!definition) {
        return (
            <div className="sim-page">
                <div className="sim-not-found">
                    <h1>Simulator not found</h1>
                    <Link to="/">Back to hub</Link>
                </div>
            </div>
        )
    }

    const commonProps = { definition, balance }
    const game = {
        dice: <DiceSimulator {...commonProps} />,
        limbo: <LimboSimulator {...commonProps} />,
        keno: <KenoSimulator {...commonProps} />,
        wheel: <WheelSimulator {...commonProps} />,
        roulette: <RouletteSimulator {...commonProps} />,
        blackjack: <BlackjackSimulator {...commonProps} />,
        slots: <SlotsSimulator {...commonProps} />,
        coinflip: <CoinFlipSimulator {...commonProps} />,
        rps: <RockPaperScissorsSimulator {...commonProps} />,
        guess: <GuessNumberSimulator {...commonProps} />,
        hilo: <HiloSimulator {...commonProps} />,
        baccarat: <BaccaratSimulator {...commonProps} />,
        sicbo: <SicBoSimulator {...commonProps} />,
        videopoker: <VideoPokerSimulator {...commonProps} />,
        color: <ColorSimulator {...commonProps} />,
        tower: <TowerSimulator {...commonProps} />,
        lottery: <LotterySimulator {...commonProps} />,
        war: <CasinoWarSimulator {...commonProps} />,
        chickencross: <ChickenCrossSimulator {...commonProps} />,
    }[activeGameId]

    return (
        <div className="sim-page">
            <div className="sim-titlebar">
                <div>
                    <Link to="/" className="sim-back-link">Hub</Link>
                    <h1>{definition.name}</h1>
                </div>
                <div className="sim-balance-chip">{formatCredits(balance)}</div>
            </div>
            <div className="sim-layout">
                {game}
            </div>
        </div>
    )
}

export default SimulatorGame
