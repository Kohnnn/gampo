import { useCallback, useMemo, useState } from 'react'
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
import { buildBigEyeBoy, buildBigRoad, buildCockroachPig, buildSmallRoad, latestBigRoadPosition, tailRoadColumns, tailRoadDots } from './roads'
import CardFace, { CardBack } from '../../ui/CardFace'
import EducationPanel from '../../EducationPanel'
import './baccarat.css'
import { useGameBgm } from '../../../audio/useBgm'

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUITS = ['S', 'H', 'D', 'C']

function newDeck() {
    const out = []
    for (const s of SUITS) for (const r of RANKS) out.push({ rank: r, suit: s })
    // Fisher-Yates with provably-fair RNG. Each swap consumes one nonce.
    for (let i = out.length - 1; i > 0; i--) {
        const { roll } = nextRoll('baccarat')
        const j = Math.floor(roll * (i + 1))
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
function betLabel(key) {
    switch (key) {
        case 'banker': return 'Banker'
        case 'player': return 'Player'
        case 'tie': return 'Tie'
        case 'pair_p': return 'Player Pair'
        case 'pair_b': return 'Banker Pair'
        case 'big': return 'Big'
        case 'small': return 'Small'
        default: return key
    }
}

export default function BaccaratGame() {
    useGameBgm('baccarat', 'idle')
    const definition = findGameDefinition('baccarat')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('baccarat')
    const session = useGameSession('baccarat')
    const preloader = useOriginalsPreloader('baccarat')

    const [bets, setBets] = useState({}) // { banker: amount, player: amount, tie: amount, pair_p: amount, pair_b: amount, big: amount, small: amount }
    const [chip, setChip] = useState(5)
    const [hand, setHand] = useState(null)
    // Hydrate the road-map outcomes list from persisted session history so the
    // Big/Big Eye/Small/Cockroach panels are populated immediately on reload
    // (eval v3 §3b).
    const [outcomes, setOutcomes] = useState(() => {
        const seed = []
        // useGameSession serves history newest-first; reverse to oldest-first.
        const hydrated = (session.history || [])
            .map(h => h?.meta?.outcome)
            .filter(Boolean)
            .reverse()
        seed.push(...hydrated)
        return seed
    })
    const [running, setRunning] = useState(false)
    const [lastWon, setLastWon] = useState(null)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [burstKey, setBurstKey] = useState(0)
    const [lastChips, setLastChips] = useState({})
    const [lastTotal, setLastTotal] = useState(null)
    const [toast, setToast] = useState(null)

    const machine = useRoundMachine({})

    const totalStake = Object.values(bets).reduce((s, v) => s + (v || 0), 0)
    const addBet = (key) => setBets(prev => ({ ...prev, [key]: (prev[key] || 0) + chip }))
    const clear = () => setBets({})
    const restoreLast = () => {
        if (!Object.keys(lastChips).length) {
            showToast('error', 'No previous bets', 'Place chips to seed Repeat')
            return
        }
        setBets({ ...lastChips })
    }

    const performPlay = ({ mode } = {}) => new Promise(resolve => {
        let activeBets = bets
        let stake = totalStake
        if (stake <= 0 && Object.keys(lastChips).length && (mode === 'auto' || mode === 'manual')) {
            activeBets = { ...lastChips }
            stake = Object.values(activeBets).reduce((s, v) => s + (v || 0), 0)
            setBets(activeBets)
        }
        if (stake <= 0) { showToast('error', 'No bets', 'Place chips first'); resolve({ profit: 0 }); return }
        if (!placeBet(stake, 'Baccarat')) { showToast('error', 'Not enough credits', `Need ${formatCredits(stake)}`); resolve({ profit: 0 }); return }
        setLastChips({ ...activeBets })
        setLastTotal(stake)
        setToast(null)
        playSound('deal')
        sfx.play('click')
        machine.start([
            { index: 0, type: ROUND_EVENTS.ROUND_START, payload: { stake }, at: 0 },
            { index: 1, type: ROUND_EVENTS.INPUT_LOCK, payload: {}, at: 0 },
            { index: 2, type: ROUND_EVENTS.BET_ACCEPTED, payload: { betAmount: stake, bets: activeBets }, at: 0 },
        ], { autoFinish: false })
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
        for (const [k, amount] of Object.entries(activeBets)) {
            if (!amount) continue
            const mult = payouts[k] || 0
            totalReturn += amount * mult
        }
        const profit = totalReturn - stake
        if (totalReturn > 0) addWinnings(totalReturn, 'Baccarat return')
        const effectiveMult = stake > 0 ? totalReturn / stake : 0
        setHand(next)
        setOutcomes(prev => [...prev, outcome])
        setLastWon(profit > 0)
        setBurstKey(k => k + 1)
        if (effectiveMult >= 5) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: effectiveMult })
        } else {
            playSound(profit > 0 ? 'win' : 'loss')
        }
        sfx.play(profit > 0 ? 'win' : 'lose')
        setToast({
            kind: profit > 0 ? 'win' : profit === 0 ? 'push' : 'lose',
            multiplier: effectiveMult > 0 ? effectiveMult : null,
            amount: profit,
            message: `Baccarat ${outcome === 'B' ? 'Banker' : outcome === 'P' ? 'Player' : 'Tie'}`,
        })
        machine.finish({ kind: outcome, profit, multiplier: effectiveMult, playerScore, bankerScore })
        session.record({
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label: `${outcome} ${playerScore}-${bankerScore}`,
            profit, betAmount: stake,
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
    const bigRoadLatest = useMemo(() => latestBigRoadPosition(bigRoad), [bigRoad])
    const bigRoadTail = useMemo(() => tailRoadColumns(bigRoad, 32), [bigRoad])
    const bigEyeTail = useMemo(() => tailRoadDots(bigEye, 36), [bigEye])
    const smallRoadTail = useMemo(() => tailRoadDots(smallRoad, 36), [smallRoad])
    const cockroachTail = useMemo(() => tailRoadDots(cockroachPig, 36), [cockroachPig])
    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)
    const playerScore = hand ? handTotal(hand.player) : null
    const bankerScore = hand ? handTotal(hand.banker) : null
    const winner = hand ? (playerScore === bankerScore ? 'tie' : playerScore > bankerScore ? 'player' : 'banker') : null
    const selectedBets = Object.entries(bets).filter(([, amount]) => amount > 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#9f252a"
            backdrop="/assets/games/backdrops/backdrop-felt-green.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={running}
                    actionLabel={`Deal Baccarat (${formatCredits(totalStake)})`}
                    onPlay={performPlay}
                    lastBet={lastTotal}
                >
                    <div className="bp-section">
                        <label className="bp-label">Chip</label>
                        <div className="bp-row">
                            {[1, 5, 25, 100, 500].map(v => (
                                <button key={v} className={`bp-bet-btn ${chip === v ? 'active' : ''}`} onClick={() => setChip(v)}>{v}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-row">
                        <button className="bp-bet-btn" onClick={clear} disabled={!totalStake}>Clear</button>
                        <button className="bp-bet-btn" onClick={restoreLast} disabled={!Object.keys(lastChips).length}>Repeat</button>
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
            <CoreStageFrame minHeight={620} maxWidth={960} loading={!preloader.ready} className="bac-stage-frame">
                <div className={`bac-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                    <RecentResultsStrip results={session.stats.lastResults} />
                    {!hand && totalStake <= 0 && (
                        <p className="bac-hint">Place chips on Banker / Player / Tie, then deal.</p>
                    )}
                    <div className="bac-meta">
                        <MultiplierBadge label="Stake" value={totalStake} suffix="" size="sm" state={running ? 'active' : 'idle'} />
                    </div>
                    <div className={`bac-round-status ${winner || 'idle'}`}>
                        <div>
                            <span>Round</span>
                            <strong>{running ? 'Dealing' : winner ? `${betLabel(winner)} wins` : 'Open'}</strong>
                        </div>
                        <div>
                            <span>Score</span>
                            <strong>{hand ? `${playerScore} - ${bankerScore}` : '—'}</strong>
                        </div>
                        <div>
                            <span>Ticket</span>
                            <strong>{selectedBets.length ? `${formatCredits(totalStake)} / ${selectedBets.length} bet${selectedBets.length === 1 ? '' : 's'}` : 'No chips'}</strong>
                        </div>
                    </div>
                    <div className="bac-ticket-strip">
                        {selectedBets.length === 0 ? (
                            <span>Tap Banker, Player, Tie, pairs, Big, or Small before dealing.</span>
                        ) : selectedBets.map(([key, amount]) => (
                            <span key={key} className={`bac-ticket-chip ${key}`}>
                                <b>{betLabel(key)}</b>
                                <em>{formatCredits(amount)}</em>
                            </span>
                        ))}
                    </div>
                    <div className="bac-table">
                        <div className={`bac-side ${winner === 'player' ? 'winner' : ''}`}>
                            <h3>Player</h3>
                            <div className="bac-score">{playerScore ?? '--'}</div>
                            <div className="bac-cards">
                                {(hand?.player || [{}, {}]).map((c, i) => c.rank ? (
                                    <CardFace key={i} rank={c.rank} suit={c.suit} dealing size="md" />
                                ) : <CardBack key={i} size="md" />)}
                            </div>
                        </div>
                        <div className={`bac-side ${winner === 'banker' ? 'winner' : ''}`}>
                            <h3>Banker</h3>
                            <div className="bac-score">{bankerScore ?? '--'}</div>
                            <div className="bac-cards">
                                {(hand?.banker || [{}, {}]).map((c, i) => c.rank ? (
                                    <CardFace key={i} rank={c.rank} suit={c.suit} dealing size="md" />
                                ) : <CardBack key={i} size="md" />)}
                            </div>
                        </div>
                    </div>

                    <div className="bac-bets" data-mobile-critical-surface>
                        {[
                            { key: 'banker', label: 'Banker 1.95×', cls: 'banker' },
                            { key: 'player', label: 'Player 2×', cls: 'player' },
                            { key: 'tie', label: 'Tie 9×', cls: 'tie' },
                            { key: 'pair_p', label: 'Player Pair 12×', cls: 'player' },
                            { key: 'pair_b', label: 'Banker Pair 12×', cls: 'banker' },
                            { key: 'big', label: 'Big 1.54×', cls: 'tie' },
                            { key: 'small', label: 'Small 2.5×', cls: 'tie' },
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
                                {bigRoadTail.columns.map((col, ci) => col.items.map((it, ri) => (
                                    <div
                                        key={`${bigRoadTail.offset + ci}-${ri}`}
                                        className={`bac-road-cell ${it.type === 'B' ? 'banker' : it.type === 'P' ? 'player' : 'tie'} ${it.tie ? 'has-tie' : ''} ${bigRoadLatest?.colIndex === bigRoadTail.offset + ci && bigRoadLatest?.rowIndex === ri ? 'latest' : ''}`}
                                        style={{ gridRow: ri + 1, gridColumn: ci + 1 }}
                                        aria-label={`${it.type === 'B' ? 'Banker' : it.type === 'P' ? 'Player' : 'Tie'} road cell${it.tie ? ' with tie' : ''}`}
                                    />
                                )))}
                            </div>
                        </div>
                        <div className="bac-road-card">
                            <h4>Big Eye Boy</h4>
                            <div className="bac-road-grid">
                                {bigEyeTail.dots.map((d, i) => (
                                    <div key={`${bigEyeTail.offset}-${i}`} className={`bac-road-cell ${d === 'red' ? 'dot-red' : 'dot-blue'} ${bigEyeTail.offset + i === bigEye.length - 1 ? 'latest' : ''}`} />
                                ))}
                            </div>
                            <h4 style={{ marginTop: 4 }}>Small Road</h4>
                            <div className="bac-road-grid">
                                {smallRoadTail.dots.map((d, i) => (
                                    <div key={`${smallRoadTail.offset}-${i}`} className={`bac-road-cell ${d === 'red' ? 'dot-red' : 'dot-blue'} ${smallRoadTail.offset + i === smallRoad.length - 1 ? 'latest' : ''}`} />
                                ))}
                            </div>
                            <h4 style={{ marginTop: 4 }}>Cockroach Pig</h4>
                            <div className="bac-road-grid">
                                {cockroachTail.dots.map((d, i) => (
                                    <div key={`${cockroachTail.offset}-${i}`} className={`bac-road-cell ${d === 'red' ? 'dot-red' : 'dot-blue'} ${cockroachTail.offset + i === cockroachPig.length - 1 ? 'latest' : ''}`} />
                                ))}
                            </div>
                        </div>
                    </div>

                    {lastWon && burstKey > 0 && <Particles key={burstKey} count={14} color="#f6c85f" />}
                    <ActionLockOverlay active={running} label="Dealing..." />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={chip} winProbability={0.4586} payoutMultiplier={1.95} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
