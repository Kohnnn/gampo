import { useMemo, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { BetPanel, GameShell, HistoryDrawer, StatsOverlay, useGameSession } from '../primitives'
import { Particles } from '../../fx'
import { buildBigEyeBoy, buildBigRoad, buildCockroachPig, buildSmallRoad } from './roads'
import EducationPanel from '../../EducationPanel'
import './baccarat.css'

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUITS = ['S', 'H', 'D', 'C']

function newDeck() {
    const out = []
    for (const s of SUITS) for (const r of RANKS) out.push({ rank: r, suit: s })
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
}

function pointValue(rank) {
    if (['10', 'J', 'Q', 'K'].includes(rank)) return 0
    if (rank === 'A') return 1
    return Number(rank)
}

function handTotal(cards) {
    return cards.reduce((s, c) => s + pointValue(c.rank), 0) % 10
}

function drawBaccaratHand() {
    const deck = newDeck()
    const player = [deck[0], deck[2]]
    const banker = [deck[1], deck[3]]
    let nextIdx = 4
    const playerTotal = handTotal(player)
    const bankerTotal = handTotal(banker)

    let playerThird = null
    if (playerTotal <= 5 && bankerTotal <= 7) {
        playerThird = deck[nextIdx++]
        player.push(playerThird)
    }
    // Banker rules
    const bScore = handTotal(banker)
    let bankerDraws = false
    if (playerThird === null) {
        if (bScore <= 5) bankerDraws = true
    } else {
        const t = pointValue(playerThird.rank)
        if (bScore <= 2) bankerDraws = true
        else if (bScore === 3 && t !== 8) bankerDraws = true
        else if (bScore === 4 && [2, 3, 4, 5, 6, 7].includes(t)) bankerDraws = true
        else if (bScore === 5 && [4, 5, 6, 7].includes(t)) bankerDraws = true
        else if (bScore === 6 && [6, 7].includes(t)) bankerDraws = true
    }
    if (bankerDraws) banker.push(deck[nextIdx++])
    return { player, banker }
}

function suitColor(s) { return (s === 'H' || s === 'D') ? 'red' : 'black' }
function suitGlyph(s) { return s === 'H' ? '\u2665' : s === 'D' ? '\u2666' : s === 'S' ? '\u2660' : '\u2663' }

export default function BaccaratGame() {
    const definition = findGameDefinition('baccarat')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('baccarat')

    const [bets, setBets] = useState({}) // { banker: amount, player: amount, tie: amount, pair_p: amount, pair_b: amount, big: amount, small: amount }
    const [chip, setChip] = useState(5)
    const [hand, setHand] = useState(null)
    const [outcomes, setOutcomes] = useState([]) // 'B' / 'P' / 'T' oldest-first
    const [running, setRunning] = useState(false)
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)

    const totalStake = Object.values(bets).reduce((s, v) => s + (v || 0), 0)
    const addBet = (key) => setBets(prev => ({ ...prev, [key]: (prev[key] || 0) + chip }))
    const clear = () => setBets({})

    const performPlay = () => new Promise(resolve => {
        if (totalStake <= 0) { showToast('error', 'No bets', 'Place chips first'); resolve({ profit: 0 }); return }
        if (!placeBet(totalStake, 'Baccarat')) { showToast('error', 'Not enough credits', `Need ${formatCredits(totalStake)}`); resolve({ profit: 0 }); return }
        playSound('deal')
        setRunning(true)
        const next = drawBaccaratHand()
        const playerScore = handTotal(next.player)
        const bankerScore = handTotal(next.banker)
        const outcome = playerScore === bankerScore ? 'T' : playerScore > bankerScore ? 'P' : 'B'
        const playerPair = next.player[0].rank === next.player[1].rank
        const bankerPair = next.banker[0].rank === next.banker[1].rank
        const totalCards = next.player.length + next.banker.length

        const payouts = {
            banker: outcome === 'B' ? 1.95 : 0,
            player: outcome === 'P' ? 2 : 0,
            tie: outcome === 'T' ? 9 : 0,
            pair_p: playerPair ? 12 : 0,
            pair_b: bankerPair ? 12 : 0,
            big: totalCards >= 5 ? 1.54 : 0,
            small: totalCards === 4 ? 2.5 : 0,
        }

        let totalReturn = 0
        for (const [k, amount] of Object.entries(bets)) {
            if (!amount) continue
            const mult = payouts[k] || 0
            totalReturn += amount * mult
        }
        const profit = totalReturn - totalStake
        if (totalReturn > 0) addWinnings(totalReturn, 'Baccarat return')
        setHand(next)
        setOutcomes(prev => [...prev, outcome])
        setLastWon(profit > 0)
        setBurstKey(k => k + 1)
        playSound(profit > 0 ? 'win' : 'loss')
        session.record({
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label: `${outcome} ${playerScore}-${bankerScore}`,
            profit, betAmount: totalStake,
            meta: { outcome, playerScore, bankerScore, playerPair, bankerPair },
        })
        showToast(profit >= 0 ? 'win' : 'loss', `Baccarat ${outcome === 'B' ? 'Banker' : outcome === 'P' ? 'Player' : 'Tie'}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        setBets({})
        setRunning(false)
        resolve({ profit })
    })

    const bigRoad = useMemo(() => buildBigRoad(outcomes), [outcomes])
    const bigEye = useMemo(() => buildBigEyeBoy(bigRoad), [bigRoad])
    const smallRoad = useMemo(() => buildSmallRoad(bigRoad), [bigRoad])
    const cockroachPig = useMemo(() => buildCockroachPig(bigRoad), [bigRoad])
    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#9f252a"
            backdrop="/assets/games/backdrops/backdrop-felt-green.png"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={running}
                    actionLabel={`Deal Baccarat (${formatCredits(totalStake)})`}
                    onPlay={performPlay}
                >
                    <div className="bp-section">
                        <label className="bp-label">Chip</label>
                        <div className="bp-row">
                            {[1, 5, 25, 100, 500].map(v => (
                                <button key={v} className={`bp-bet-btn ${chip === v ? 'active' : ''}`} onClick={() => setChip(v)}>{v}</button>
                            ))}
                        </div>
                    </div>
                    <button className="bp-bet-btn" onClick={clear} disabled={!totalStake}>Clear bets</button>
                </BetPanel>
            }
            aside={
                <>
                    <StatsOverlay stats={session.stats} definition={definition} />
                    <HistoryDrawer history={session.history} onClear={session.clear} />
                </>
            }
        >
            <div className={`bac-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <div className="bac-table">
                    <div className="bac-side">
                        <h3>Player</h3>
                        <div className="bac-score">{hand ? handTotal(hand.player) : '--'}</div>
                        <div className="bac-cards">
                            {(hand?.player || [{}, {}]).map((c, i) => c.rank ? (
                                <div key={i} className={`bac-card ${suitColor(c.suit)}`}><span>{c.rank}</span><span>{suitGlyph(c.suit)}</span></div>
                            ) : <div key={i} className="bac-card empty">?</div>)}
                        </div>
                    </div>
                    <div className="bac-side">
                        <h3>Banker</h3>
                        <div className="bac-score">{hand ? handTotal(hand.banker) : '--'}</div>
                        <div className="bac-cards">
                            {(hand?.banker || [{}, {}]).map((c, i) => c.rank ? (
                                <div key={i} className={`bac-card ${suitColor(c.suit)}`}><span>{c.rank}</span><span>{suitGlyph(c.suit)}</span></div>
                            ) : <div key={i} className="bac-card empty">?</div>)}
                        </div>
                    </div>
                </div>

                <div className="bac-bets">
                    {[
                        { key: 'banker', label: 'Banker 1.95×', cls: 'banker' },
                        { key: 'player', label: 'Player 2×', cls: 'player' },
                        { key: 'tie', label: 'Tie 9×', cls: 'tie' },
                        { key: 'pair_p', label: 'Player Pair 12×', cls: 'player' },
                        { key: 'pair_b', label: 'Banker Pair 12×', cls: 'banker' },
                        { key: 'big', label: 'Big 1.54×', cls: 'tie' },
                    ].map(b => (
                        <div key={b.key} className={`bac-bet-cell ${b.cls} ${bets[b.key] ? 'has-bet' : ''}`} onClick={() => addBet(b.key)}>
                            {b.label}{bets[b.key] ? ` · ${formatCredits(bets[b.key])}` : ''}
                        </div>
                    ))}
                </div>

                <div className="bac-roads">
                    <div className="bac-road-card">
                        <h4>Big Road</h4>
                        <div className="bac-road-grid">
                            {bigRoad.map((col, ci) => col.items.map((it, ri) => (
                                <div key={`${ci}-${ri}`} className={`bac-road-cell ${it.type === 'B' ? 'banker' : it.type === 'P' ? 'player' : 'tie'}`} style={{ gridRow: ri + 1, gridColumn: ci + 1 }} />
                            )))}
                        </div>
                    </div>
                    <div className="bac-road-card">
                        <h4>Big Eye Boy</h4>
                        <div className="bac-road-grid">
                            {bigEye.slice(0, 36).map((d, i) => (
                                <div key={i} className={`bac-road-cell ${d === 'red' ? 'dot-red' : 'dot-blue'}`} />
                            ))}
                        </div>
                        <h4 style={{ marginTop: 4 }}>Small Road</h4>
                        <div className="bac-road-grid">
                            {smallRoad.slice(0, 36).map((d, i) => (
                                <div key={i} className={`bac-road-cell ${d === 'red' ? 'dot-red' : 'dot-blue'}`} />
                            ))}
                        </div>
                        <h4 style={{ marginTop: 4 }}>Cockroach Pig</h4>
                        <div className="bac-road-grid">
                            {cockroachPig.slice(0, 36).map((d, i) => (
                                <div key={i} className={`bac-road-cell ${d === 'red' ? 'dot-red' : 'dot-blue'}`} />
                            ))}
                        </div>
                    </div>
                </div>

                {lastWon && burstKey > 0 && <Particles key={burstKey} count={14} color="#f6c85f" />}
            </div>
            <EducationPanel definition={definition} betAmount={chip} winProbability={0.4586} payoutMultiplier={1.95} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
