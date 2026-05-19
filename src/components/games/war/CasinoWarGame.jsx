import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { BetPanel, GameShell, HistoryDrawer, StatsOverlay, useGameSession } from '../primitives'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './war.css'

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUITS = ['S', 'H', 'D', 'C']
function rankValue(r) { return r === 'A' ? 14 : r === 'K' ? 13 : r === 'Q' ? 12 : r === 'J' ? 11 : Number(r) }
function suitGlyph(s) { return s === 'H' ? '\u2665' : s === 'D' ? '\u2666' : s === 'S' ? '\u2660' : '\u2663' }
function suitClass(s) { return (s === 'H' || s === 'D') ? 'red' : 'black' }

function drawCard() {
    const r = RANKS[Math.floor(nextRoll('war').roll * RANKS.length)]
    const s = SUITS[Math.floor(nextRoll('war').roll * SUITS.length)]
    return { rank: r, suit: s }
}

export default function CasinoWarGame() {
    const definition = findGameDefinition('war')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('war')

    const [hand, setHand] = useState(null)
    const [phase, setPhase] = useState('idle') // idle | tied | slamming
    const [tiedHand, setTiedHand] = useState(null)
    const [slamming, setSlamming] = useState(false)
    const [burstKey, setBurstKey] = useState(0)
    const [pendingBet, setPendingBet] = useState(0)

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (!placeBet(betAmount, 'Casino War')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        playSound('deal')
        setSlamming(true)
        setPendingBet(betAmount)
        const player = drawCard()
        let dealer = drawCard()
        while (dealer.rank === player.rank && dealer.suit === player.suit) dealer = drawCard()
        const pv = rankValue(player.rank); const dv = rankValue(dealer.rank)
        window.setTimeout(() => {
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
        const np = drawCard(); let nd = drawCard()
        while (nd.rank === np.rank && nd.suit === np.suit) nd = drawCard()
        const pv = rankValue(np.rank); const dv = rankValue(nd.rank)
        window.setTimeout(() => {
            setSlamming(false)
            if (pv >= dv) {
                addWinnings(pendingBet * 3, 'Casino War tie-win')
                setHand({ player: np, dealer: nd, outcome: 'tie-win' })
                setBurstKey(k => k + 1); playSound('win')
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
                <BetPanel balance={balance} initialBet={5} runningRound={slamming || phase === 'tied'} actionLabel="Draw Cards" onPlay={performPlay}>
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
                <div className={`war-row ${slamming ? 'slamming' : ''}`}>
                    <div className="war-side">
                        <span>You</span>
                        <div className={`war-card ${suitClass(hand?.player?.suit || 'S')} ${hand?.outcome === 'win' || hand?.outcome === 'tie-win' ? 'win' : (hand?.outcome === 'loss' || hand?.outcome === 'tie-loss') ? 'loss' : ''}`}>{renderCard(hand?.player)}</div>
                    </div>
                    <strong className="war-versus">VS</strong>
                    <div className="war-side">
                        <span>Dealer</span>
                        <div className={`war-card ${suitClass(hand?.dealer?.suit || 'S')} ${hand?.outcome === 'loss' || hand?.outcome === 'tie-loss' ? 'win' : (hand?.outcome === 'win' || hand?.outcome === 'tie-win') ? 'loss' : ''}`}>{renderCard(hand?.dealer)}</div>
                    </div>
                </div>
                <p className="bp-bal-line" style={{ color: 'var(--text-secondary)' }}>{hand ? `Result: ${hand.outcome.toUpperCase()}` : 'Higher rank wins'}</p>
                {(hand?.outcome === 'win' || hand?.outcome === 'tie-win') && burstKey > 0 && <Particles key={burstKey} count={14} color="#ff7ab6" />}
            </div>
            <EducationPanel definition={definition} betAmount={5} winProbability={0.467} payoutMultiplier={2} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
