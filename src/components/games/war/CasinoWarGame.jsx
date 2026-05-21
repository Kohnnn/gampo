import { useRef, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { useCancellableTimeouts } from '../../../utils/scheduling'
import { BetPanel, BigWinOverlay, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession } from '../primitives'
import { Particles } from '../../fx'
import CardFace, { CardBack } from '../../ui/CardFace'
import EducationPanel from '../../EducationPanel'
import './war.css'

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUITS = ['S', 'H', 'D', 'C']
function rankValue(r) { return r === 'A' ? 14 : r === 'K' ? 13 : r === 'Q' ? 12 : r === 'J' ? 11 : Number(r) }
function suitGlyph(s) { return s === 'H' ? '\u2665' : s === 'D' ? '\u2666' : s === 'S' ? '\u2660' : '\u2663' }
function suitClass(s) { return (s === 'H' || s === 'D') ? 'red' : 'black' }

function buildShuffledShoe() {
    const out = []
    for (const s of SUITS) for (const r of RANKS) out.push({ rank: r, suit: s })
    // Fisher-Yates with provably-fair RNG.
    for (let i = out.length - 1; i > 0; i--) {
        const { roll } = nextRoll('war')
        const j = Math.floor(roll * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
}

export default function CasinoWarGame() {
    const definition = findGameDefinition('war')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('war')

    const shoeRef = useRef(buildShuffledShoe())
    const drawCard = () => {
        // Reshuffle when fewer than 6 cards remain so a tie + war never runs the shoe dry.
        if (shoeRef.current.length < 6) shoeRef.current = buildShuffledShoe()
        return shoeRef.current.pop()
    }

    const [hand, setHand] = useState(null)
    const [phase, setPhase] = useState('idle') // idle | tied | slamming
    const [tiedHand, setTiedHand] = useState(null)
    const [slamming, setSlamming] = useState(false)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [pendingBet, setPendingBet] = useState(0)
    const [lastBet, setLastBet] = useState(null)
    const { schedule, cancelAll } = useCancellableTimeouts()

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (!placeBet(betAmount, 'Casino War')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        cancelAll()
        setLastBet(betAmount)
        playSound('deal')
        setSlamming(true)
        setPendingBet(betAmount)
        const player = drawCard()
        const dealer = drawCard()
        const pv = rankValue(player.rank); const dv = rankValue(dealer.rank)
        schedule(() => {
            setSlamming(false)
            if (pv > dv) {
                addWinnings(betAmount * 2, 'Casino War return')
                setHand({ player, dealer, outcome: 'win' })
                setBurstKey(k => k + 1); playSound('win')
                session.record({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: 'Win', profit: betAmount, betAmount, meta: { player, dealer } })
                showToast('win', 'War win', `+${formatCredits(betAmount)}`)
                setPhase('idle'); resolve({ profit: betAmount })
            } else if (pv === dv) {
                setTiedHand({ player, dealer })
                setHand({ player, dealer, outcome: 'tie' })
                setPhase('tied')
                showToast('bet', 'Tie!', 'Surrender or Go to War')
                resolve({ profit: 0 })
            } else {
                setHand({ player, dealer, outcome: 'loss' })
                playSound('loss')
                session.record({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: 'Loss', profit: -betAmount, betAmount, meta: { player, dealer } })
                showToast('loss', 'War loss', `-${formatCredits(betAmount)}`)
                setPhase('idle'); resolve({ profit: -betAmount })
            }
        }, 600)
    })

    const surrender = () => {
        if (!tiedHand) return
        addWinnings(pendingBet / 2, 'Casino War surrender')
        const profit = -pendingBet / 2
        session.record({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: 'Surrender', profit, betAmount: pendingBet })
        setPhase('idle'); setTiedHand(null); setHand(null)
        showToast('loss', 'Surrender', `${formatCredits(profit)}`)
    }

    const goToWar = () => {
        if (!tiedHand) return
        if (!placeBet(pendingBet, 'Casino War double')) { showToast('error', 'Not enough credits', 'Cannot go to war'); return }
        playSound('deal'); setSlamming(true)
        const np = drawCard(); const nd = drawCard()
        const pv = rankValue(np.rank); const dv = rankValue(nd.rank)
        schedule(() => {
            setSlamming(false)
            if (pv >= dv) {
                addWinnings(pendingBet * 3, 'Casino War tie-win')
                setHand({ player: np, dealer: nd, outcome: 'tie-win' })
                setBurstKey(k => k + 1); playSound('bigwin')
                setBigWin({ trigger: Date.now(), profit: pendingBet, multiplier: 3 })
                session.record({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: 'Tie-win', profit: pendingBet, betAmount: pendingBet * 2 })
                showToast('win', 'Tie won', `+${formatCredits(pendingBet)}`)
            } else {
                setHand({ player: np, dealer: nd, outcome: 'tie-loss' })
                playSound('loss')
                session.record({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: 'Tie-loss', profit: -pendingBet * 2, betAmount: pendingBet * 2 })
                showToast('loss', 'Tie lost', `-${formatCredits(pendingBet * 2)}`)
            }
            setPhase('idle'); setTiedHand(null)
        }, 600)
    }

    const renderCard = (c) => c ? <span><span>{c.rank}</span>{suitGlyph(c.suit)}</span> : '?'
    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ff7ab6"
            backdrop="/assets/games/backdrops/backdrop-felt-green.png"
            panel={
                <BetPanel balance={balance} initialBet={5} runningRound={slamming || phase === 'tied'} actionLabel="Draw Cards" onPlay={performPlay} lastBet={lastBet}>
                    <div className="bp-bal-line"><span>Win</span><strong>2×</strong></div>
                    <div className="bp-bal-line"><span>Tie-win</span><strong>+1×</strong></div>
                    {phase === 'tied' && (
                        <>
                            <button className="bp-bet-btn" onClick={surrender}>Surrender (50%)</button>
                            <button className="bp-bet-btn" onClick={goToWar}>Go to War (+1×)</button>
                        </>
                    )}
                </BetPanel>
            }
            aside={<><StatsOverlay stats={session.stats} definition={definition} /><HistoryDrawer history={session.history} onClear={session.clear} /></>}
        >
            <div className={`war-stage ${hand?.outcome === 'win' || hand?.outcome === 'tie-win' ? 'win-flash' : (hand?.outcome === 'loss' || hand?.outcome === 'tie-loss') ? 'loss-flash' : ''}`}>
                <RecentResultsStrip results={session.stats.lastResults} />
                <div className={`war-row ${slamming ? 'slamming' : ''}`}>
                    <div className="war-side">
                        <span>You</span>
                        <div className={`war-card-slot ${hand?.outcome === 'win' || hand?.outcome === 'tie-win' ? 'win' : (hand?.outcome === 'loss' || hand?.outcome === 'tie-loss') ? 'loss' : ''}`}>
                            {hand?.player
                                ? <CardFace rank={hand.player.rank} suit={hand.player.suit} dealing size="lg" />
                                : <CardBack size="lg" />}
                        </div>
                    </div>
                    <strong className="war-versus">VS</strong>
                    <div className="war-side">
                        <span>Dealer</span>
                        <div className={`war-card-slot ${hand?.outcome === 'loss' || hand?.outcome === 'tie-loss' ? 'win' : (hand?.outcome === 'win' || hand?.outcome === 'tie-win') ? 'loss' : ''}`}>
                            {hand?.dealer
                                ? <CardFace rank={hand.dealer.rank} suit={hand.dealer.suit} dealing size="lg" />
                                : <CardBack size="lg" />}
                        </div>
                    </div>
                </div>
                <p className="bp-bal-line" style={{ color: 'var(--text-secondary)' }}>{hand ? `Result: ${hand.outcome.toUpperCase()}` : 'Higher rank wins'}</p>
                {(hand?.outcome === 'win' || hand?.outcome === 'tie-win') && burstKey > 0 && <Particles key={burstKey} count={14} color="#ff7ab6" />}
            </div>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={3} />
            <EducationPanel definition={definition} betAmount={5} winProbability={0.467} payoutMultiplier={2} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
