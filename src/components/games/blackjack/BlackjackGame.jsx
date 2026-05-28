// Stake/Rainbet-style Blackjack on the shared shell. Single-player vs dealer,
// configurable deck count and S17/H17 rule, basic strategy hint, optional
// insurance, and a 500-hand study runner.
//
// Extracted from the legacy SimulatorGame.jsx (Blackjack section) and reshaped
// to use GameShell + BetPanel + StatsOverlay + HistoryDrawer.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits, scoreBlackjackHand } from '../../../utils/simulationMath'
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
import CardFace, { CardBack } from '../../ui/CardFace'
import EducationPanel from '../../EducationPanel'
import './blackjack.css'
import { useGameBgm } from '../../../audio/useBgm'

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const SUITS = ['S', 'H', 'D', 'C']

function buildDeck() {
    const out = []
    for (const s of SUITS) for (const r of RANKS) out.push({ rank: r, suit: s })
    return out
}

function buildShoe(decks = 4) {
    const shoe = []
    for (let i = 0; i < decks; i++) shoe.push(...buildDeck())
    for (let i = shoe.length - 1; i > 0; i--) {
        const { roll } = nextRoll('blackjack')
        const j = Math.floor(roll * (i + 1))
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
    if (!player?.length || !dealerCard) return 'Deal first.'
    const score = scoreBlackjackHand(player)
    const up = dealerUpValue(dealerCard)
    if (score >= 17) return 'Stand · hard 17+ stays.'
    if (score <= 8) return 'Hit · weak hard total.'
    if (isSoftHand(player)) {
        if (score >= 19) return 'Stand · soft 19+ is strong.'
        if (score === 18) return up >= 9 ? 'Hit · soft 18 vs strong dealer.' : 'Stand · soft 18 vs weak dealer.'
        return 'Hit · soft hands ride upward.'
    }
    if (score >= 13 && score <= 16) {
        return up >= 7 ? `Hit · hard ${score} vs ${up}.` : `Stand · hard ${score} vs ${up}.`
    }
    if (score === 12) return up >= 4 && up <= 6 ? 'Stand · hard 12 vs 4-6.' : 'Hit · hard 12.'
    if (score === 11) return 'Hit · hard 11 always wants more.'
    if (score === 10) return 'Hit · hard 10.'
    if (score === 9) return 'Hit · hard 9.'
    return 'Hit.'
}

function suitGlyph(s) {
    if (s === 'H') return '\u2665'
    if (s === 'D') return '\u2666'
    if (s === 'S') return '\u2660'
    if (s === 'C') return '\u2663'
    return s
}
function suitColor(s) { return (s === 'H' || s === 'D') ? 'red' : 'black' }

export default function BlackjackGame() {
    useGameBgm('blackjack', 'idle')
    const definition = findGameDefinition('blackjack') || { name: 'Blackjack', category: 'Tables' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('blackjack')
    const session = useGameSession('blackjack-shell')
    const preloader = useOriginalsPreloader('blackjack')

    const [decks, setDecks] = useState(4)
    const [hitsSoft17, setHitsSoft17] = useState(false)
    const [shoe, setShoe] = useState(() => buildShoe(4))
    const [player, setPlayer] = useState([])
    const [dealer, setDealer] = useState([])
    const [phase, setPhase] = useState('idle') // idle | playing
    const [activeBet, setActiveBet] = useState(0)
    const [insurance, setInsurance] = useState(0)
    const [insuranceOffered, setInsuranceOffered] = useState(false)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [studyRunning, setStudyRunning] = useState(false)
    const [studyResults, setStudyResults] = useState(null)
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [chipSlide, setChipSlide] = useState(null)
    const chipSlideTimer = useRef(null)

    useEffect(() => () => {
        if (chipSlideTimer.current) window.clearTimeout(chipSlideTimer.current)
    }, [])

    const triggerChipSlide = useCallback((amount) => {
        if (chipSlideTimer.current) window.clearTimeout(chipSlideTimer.current)
        setChipSlide({ key: Date.now(), amount })
        chipSlideTimer.current = window.setTimeout(() => setChipSlide(null), 560)
    }, [])

    const handleEvent = useCallback((ev) => {
        if (!ev) return
        switch (ev.type) {
            case ROUND_EVENTS.STAGE_SELECT:
                if (ev.payload?.kind === 'deal') sfx.play('reveal')
                break
            default:
                break
        }
    }, [sfx])

    const machine = useRoundMachine({ onEvent: handleEvent })

    const drawTop = (sourceShoe) => [sourceShoe[0], sourceShoe.slice(1)]
    const ensureShoe = (source) => (source.length < decks * 13) ? buildShoe(decks) : source

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
        if (insurance > 0) {
            const dealerBlackjack = finalDealer.length === 2 && dealerScore === 21
            if (dealerBlackjack) returnAmount += insurance * 3
        }
        const profit = returnAmount - wager - insurance
        if (returnAmount > 0) addWinnings(returnAmount, 'Blackjack return')
        session.record({
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label, profit, betAmount: wager + insurance,
            multiplier: multiplier > 0 ? multiplier : 0,
            meta: { playerScore, dealerScore, isBlackjack },
        })
        if (label === 'Blackjack') {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: 2.5 })
        } else {
            playSound(profit >= 0 ? 'win' : 'loss')
        }
        sfx.play(profit > 0 ? 'win' : profit === 0 ? 'reveal' : 'lose')
        setToast({
            kind: profit > 0 ? 'win' : profit === 0 ? 'push' : 'lose',
            multiplier: multiplier > 0 ? multiplier : null,
            amount: profit,
            message: `Blackjack ${label}`,
        })
        machine.finish({ kind: label.toLowerCase(), profit, multiplier, playerScore, dealerScore })
        showToast(profit >= 0 ? 'win' : profit === 0 ? 'bet' : 'loss', `Blackjack ${label}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        setPhase('idle')
        setActiveBet(0)
        setInsurance(0)
        setInsuranceOffered(false)
    }

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (phase === 'playing') { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Blackjack')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        setToast(null)
        playSound('deal')
        sfx.play('click')
        machine.start([
            { index: 0, type: ROUND_EVENTS.ROUND_START, payload: { betAmount, decks, hitsSoft17 }, at: 0 },
            { index: 1, type: ROUND_EVENTS.INPUT_LOCK, payload: {}, at: 0 },
            { index: 2, type: ROUND_EVENTS.BET_ACCEPTED, payload: { betAmount }, at: 0 },
            { index: 3, type: ROUND_EVENTS.STAGE_SELECT, payload: { kind: 'deal' }, at: 60 },
        ], { autoFinish: false })
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
        triggerChipSlide(betAmount)
        setPhase('playing')
        setInsurance(0)
        setInsuranceOffered(initialDealer[0]?.rank === 'A')
        if (scoreBlackjackHand(initialPlayer) === 21) {
            window.setTimeout(() => settle(initialPlayer, initialDealer, betAmount), 320)
        }
        resolve({ profit: 0 })
    })

    const hit = () => {
        if (phase !== 'playing') return
        playSound('flip')
        let nextShoe = shoe; let card
        ;[card, nextShoe] = drawTop(nextShoe)
        const nextPlayer = [...player, card]
        setPlayer(nextPlayer); setShoe(nextShoe)
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
            if (score === 17 && hitsSoft17 && isSoftHand(nextDealer)) return true
            return false
        }
        while (dealerKeepHitting()) {
            let card
            ;[card, nextShoe] = drawTop(nextShoe)
            nextDealer.push(card)
        }
        setDealer(nextDealer); setShoe(nextShoe)
        window.setTimeout(() => settle(player, nextDealer, activeBet), 220)
    }

    const doubleDown = () => {
        if (phase !== 'playing' || player.length !== 2) return
        if (!placeBet(activeBet, 'Blackjack double')) {
            showToast('error', 'Not enough credits', 'Cannot double')
            return
        }
        playSound('deal')
        let nextShoe = shoe; let card
        ;[card, nextShoe] = drawTop(nextShoe)
        const nextPlayer = [...player, card]
        setPlayer(nextPlayer); setShoe(nextShoe)
        const finalBet = activeBet * 2
        setActiveBet(finalBet)
        if (scoreBlackjackHand(nextPlayer) > 21) {
            window.setTimeout(() => settle(nextPlayer, dealer, finalBet), 300)
            return
        }
        // Auto-stand
        let dealerShoe = nextShoe
        const nextDealer = [...dealer]
        const dealerKeepHitting = () => {
            const score = scoreBlackjackHand(nextDealer)
            if (score < 17) return true
            if (score === 17 && hitsSoft17 && isSoftHand(nextDealer)) return true
            return false
        }
        while (dealerKeepHitting()) {
            let dCard
            ;[dCard, dealerShoe] = drawTop(dealerShoe)
            nextDealer.push(dCard)
        }
        setDealer(nextDealer); setShoe(dealerShoe)
        window.setTimeout(() => settle(nextPlayer, nextDealer, finalBet), 320)
    }

    const surrender = () => {
        if (phase !== 'playing' || player.length !== 2) return
        const returnAmount = activeBet / 2
        addWinnings(returnAmount, 'Blackjack surrender')
        const profit = returnAmount - activeBet
        playSound('click')
        session.record({
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label: 'Surrender', profit, betAmount: activeBet,
        })
        showToast('loss', 'Surrender', `${formatCredits(profit)}`)
        setPhase('idle'); setActiveBet(0); setInsurance(0); setInsuranceOffered(false)
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

    const onDecks = (n) => { setDecks(n); setShoe(buildShoe(n)) }

    const runStudy = (count = 500) => {
        if (studyRunning) return
        setStudyRunning(true)
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
                while (true) {
                    const score = scoreBlackjackHand(p)
                    if (score >= 21) break
                    const hint = basicStrategyHint(p, d[0])
                    if (hint.startsWith('Stand')) break
                    p.push(local.shift())
                }
                while (true) {
                    const ds = scoreBlackjackHand(d)
                    if (ds >= 17 && !(ds === 17 && hitsSoft17 && isSoftHand(d))) break
                    d.push(local.shift())
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
    const hint = phase === 'playing' ? basicStrategyHint(player, dealer[0]) : 'Deal a hand to receive guidance.'
    const recentProfit = useMemo(() => session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0), [session.history])
    const inRound = phase === 'playing'

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#8aceff"
            backdrop="/assets/games/backdrops/backdrop-felt-green.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={false}
                    actionLabel="Deal Hand"
                    onPlay={performPlay}
                    disableAuto
                    lastBet={lastBet}
                    playPhase={inRound ? 'in-round' : null}
                    playLabel={inRound ? 'Stand' : 'Deal Hand'}
                    onPlayPhaseAction={stand}
                >
                    <div className="bp-section">
                        <label className="bp-label">Decks</label>
                        <div className="bp-row">
                            {[1, 2, 4, 6, 8].map(n => (
                                <button key={n} className={`bp-bet-btn ${decks === n ? 'active' : ''}`} disabled={inRound} onClick={() => onDecks(n)}>{n}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-section">
                        <label className="bp-label">Dealer rule</label>
                        <div className="bp-row">
                            <button className={`bp-bet-btn ${!hitsSoft17 ? 'active' : ''}`} disabled={inRound} onClick={() => setHitsSoft17(false)}>S17</button>
                            <button className={`bp-bet-btn ${hitsSoft17 ? 'active' : ''}`} disabled={inRound} onClick={() => setHitsSoft17(true)}>H17</button>
                        </div>
                    </div>
                    <button className="bp-bet-btn" disabled={studyRunning} onClick={() => runStudy(500)}>
                        {studyRunning ? 'Running 500-hand study…' : 'Run 500-hand study'}
                    </button>
                    {studyResults && (
                        <p className="bp-hint">Edge {studyResults.edge.toFixed(2)}% · BJ {studyResults.bj}</p>
                    )}
                </BetPanel>
            }
            aside={
                <>
                    <StatsOverlay stats={session.stats} definition={definition} />
                    <HistoryDrawer history={session.history} onClear={session.clear} />
                </>
            }
        >
            <CoreStageFrame minHeight={520} maxWidth={920} loading={!preloader.ready} className="bj-stage-frame">
                <div className="bj-stage">
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    {chipSlide ? (
                        <span key={chipSlide.key} className="bj-chip-slide" aria-hidden="true">
                            {formatCredits(chipSlide.amount)}
                        </span>
                    ) : null}
                    <Hand
                        label={`Dealer ${dealer.length && phase !== 'playing' ? scoreBlackjackHand(dealer) : phase === 'playing' && dealer[0] ? `(${dealerUpValue(dealer[0])})` : '--'}`}
                        cards={dealer}
                        hideHole={phase === 'playing'}
                        emptyHint={phase === 'idle' ? 'Press Deal to start' : null}
                    />
                    <Hand
                        label={`Player ${player.length ? playerScore : '--'}`}
                        cards={player}
                        emptyHint={phase === 'idle' ? 'Pick decks · S17/H17 · then Deal' : null}
                    />
                    <div className="bj-actions">
                        <button className="bj-primary-action" disabled={phase !== 'playing'} onClick={hit}>Hit</button>
                        <button className="bj-primary-action" disabled={phase !== 'playing'} onClick={stand}>Stand</button>
                        <button disabled={phase !== 'playing' || player.length !== 2} onClick={doubleDown}>Double</button>
                        <button disabled={phase !== 'playing' || player.length !== 2} onClick={surrender}>Surrender</button>
                    </div>
                    {insuranceOffered && (
                        <div className="bj-insurance">
                            <span>Dealer shows Ace · Insurance?</span>
                            <button onClick={takeInsurance}>Yes ({formatCredits(activeBet / 2)})</button>
                            <button onClick={() => setInsuranceOffered(false)}>Decline</button>
                        </div>
                    )}
                    <p className="bj-hint">{hint}</p>
                    <div className="bj-meta">
                        <MultiplierBadge label="Bet" value={activeBet || 0} suffix="" size="sm" state={inRound ? 'active' : 'idle'} />
                    </div>
                    <ActionLockOverlay active={false} />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={2.4} />
            <EducationPanel definition={definition} betAmount={5} winProbability={0.43} payoutMultiplier={2} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}

function Hand({ label, cards, hideHole = false, emptyHint = null, emptySlots = 2 }) {
    const isEmpty = cards.length === 0
    return (
        <div className="bj-hand">
            <span className="bj-hand-label">{label}</span>
            <div className="bj-hand-row">
                {isEmpty ? (
                    <>
                        {Array.from({ length: emptySlots }, (_, i) => (
                            <CardBack key={i} size="md" />
                        ))}
                        {emptyHint && <span className="bj-hand-hint">{emptyHint}</span>}
                    </>
                ) : cards.map((card, i) => {
                    const hidden = hideHole && i === 1
                    return (
                        <CardFace
                            key={i}
                            rank={card.rank}
                            suit={card.suit}
                            hidden={hidden}
                            dealing
                            size="md"
                        />
                    )
                })}
            </div>
        </div>
    )
}
