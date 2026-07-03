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
import { getBigWinThreshold,
    BetPanel,
    BigWinOverlay,
    GameShell,
    HistoryDrawer,
    RecentResultsStrip,
    StatsOverlay,
    useGameSession,
    MultiplierBadge,
    ResultToast,
    CoreStageFrame,
    ROUND_EVENTS,
    useRoundMachine,
    StageActionButton,
} from '../primitives'
import { useOriginalsPreloader } from '../../games/resources/useOriginalsPreloader'
import { useScrollActionIntoView } from '../../../hooks/useScrollActionIntoView'
import CardFace, { CardBack } from '../../ui/CardFace'
import EducationPanel from '../../EducationPanel'
import {
    canDoubleHand,
    canSplitHand,
    canSurrenderHand,
    makeBlackjackHand,
    nextPlayableHandIndex,
    settleBlackjackHands,
    splitBlackjackHand,
} from './blackjackRules'
import './blackjack.css'
import { useGameBgm } from '../../../audio/useBgm'

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const SUITS = ['S', 'H', 'D', 'C']

// Published basic-strategy outcome split for a single hand vs dealer:
// ~43.3% win, ~8.7% push, ~48.0% loss. We use the win frequency as the
// Probability Lab "win chance"; payoutMultiplier is reconciled from RTP so the
// binary EV model lands at EV ≈ RTP. See EducationPanel usage note below.
const BJ_WIN_FREQUENCY = 0.433

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

function hintActionFromText(hint) {
    if (!hint) return null
    if (hint.startsWith('Stand')) return 'stand'
    if (hint.startsWith('Hit')) return 'hit'
    return null
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
    const session = useGameSession('blackjack')
    const preloader = useOriginalsPreloader('blackjack')

    const [decks, setDecks] = useState(4)
    const [hitsSoft17, setHitsSoft17] = useState(false)
    const [shoe, setShoe] = useState(() => buildShoe(4))
    const [hands, setHands] = useState([])
    const [activeHandIndex, setActiveHandIndex] = useState(0)
    const [dealer, setDealer] = useState([])
    const [phase, setPhase] = useState('idle') // idle | playing
    const [activeBet, setActiveBet] = useState(0)
    const [originalBet, setOriginalBet] = useState(0)
    const [insurance, setInsurance] = useState(0)
    const [insuranceOffered, setInsuranceOffered] = useState(false)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [studyRunning, setStudyRunning] = useState(false)
    const [studyResults, setStudyResults] = useState(null)
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [outcomeSummary, setOutcomeSummary] = useState(null)
    const [chipSlide, setChipSlide] = useState(null)
    const chipSlideTimer = useRef(null)
    const stageRef = useRef(null)

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

    const finishRound = useCallback((finalHands, finalDealer) => {
        const settlement = settleBlackjackHands(finalHands, finalDealer, insurance)
        const bestMultiplier = settlement.hands.reduce((best, hand) => Math.max(best, hand.result?.multiplier || 0), 0)
        const labels = settlement.hands.map((hand, index) => `H${index + 1} ${hand.result?.label || 'Loss'}`).join(' · ')
        if (settlement.totalReturn > 0) addWinnings(settlement.totalReturn, 'Blackjack return')
        setHands(settlement.hands)
        setOutcomeSummary(settlement)
        session.record({
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label: labels || 'Blackjack',
            profit: settlement.profit,
            betAmount: settlement.wagered + insurance,
            multiplier: bestMultiplier,
            meta: {
                hands: settlement.hands.map(hand => hand.result),
                dealerScore: settlement.dealerScore,
                insuranceReturn: settlement.insuranceReturn,
            },
        })
        if (bestMultiplier >= 2.5) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit: settlement.profit, multiplier: bestMultiplier })
        } else {
            playSound(settlement.profit >= 0 ? 'win' : 'loss')
        }
        sfx.play(settlement.profit > 0 ? 'win' : settlement.profit === 0 ? 'reveal' : 'lose')
        setToast({
            kind: settlement.profit > 0 ? 'win' : settlement.profit === 0 ? 'push' : 'lose',
            multiplier: bestMultiplier > 0 ? bestMultiplier : null,
            amount: settlement.profit,
            message: labels || 'Blackjack settled',
        })
        machine.finish({ kind: settlement.profit > 0 ? 'win' : settlement.profit === 0 ? 'push' : 'lose', profit: settlement.profit, multiplier: bestMultiplier, dealerScore: settlement.dealerScore })
        showToast(settlement.profit >= 0 ? 'win' : settlement.profit === 0 ? 'bet' : 'loss', 'Blackjack settled', `${settlement.profit >= 0 ? '+' : ''}${formatCredits(settlement.profit)}`)
        setPhase('idle')
        setActiveBet(0)
        setOriginalBet(0)
        setInsurance(0)
        setInsuranceOffered(false)
    }, [addWinnings, insurance, machine, playSound, session, showToast, sfx])

    const finishDealerAndSettle = useCallback((finalHands, sourceShoe = shoe) => {
        let nextShoe = sourceShoe
        const nextDealer = [...dealer]
        const dealerShouldPlay = finalHands.some(hand => hand.status !== 'surrendered' && scoreBlackjackHand(hand.cards) <= 21)
        const dealerKeepHitting = () => {
            const score = scoreBlackjackHand(nextDealer)
            if (score < 17) return true
            if (score === 17 && hitsSoft17 && isSoftHand(nextDealer)) return true
            return false
        }
        if (dealerShouldPlay) {
            while (dealerKeepHitting()) {
                let card
                ;[card, nextShoe] = drawTop(nextShoe)
                nextDealer.push(card)
            }
        }
        setDealer(nextDealer)
        setShoe(nextShoe)
        window.setTimeout(() => finishRound(finalHands, nextDealer), 220)
    }, [dealer, finishRound, hitsSoft17, shoe])

    const advanceFromHand = useCallback((nextHands, nextShoe = shoe, completedIndex = activeHandIndex) => {
        const nextIndex = nextPlayableHandIndex(nextHands, completedIndex)
        setHands(nextHands)
        setActiveBet(nextHands.reduce((sum, hand) => sum + (hand.wager || 0), 0))
        if (nextIndex >= 0) {
            setActiveHandIndex(nextIndex)
            return
        }
        finishDealerAndSettle(nextHands, nextShoe)
    }, [activeHandIndex, finishDealerAndSettle, shoe])

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
        const initialHands = [makeBlackjackHand({ cards: initialPlayer, wager: betAmount, id: `hand-${Date.now()}` })]
        setHands(initialHands)
        setActiveHandIndex(0)
        setDealer(initialDealer)
        setActiveBet(betAmount)
        setOriginalBet(betAmount)
        setOutcomeSummary(null)
        triggerChipSlide(betAmount)
        setPhase('playing')
        setInsurance(0)
        setInsuranceOffered(initialDealer[0]?.rank === 'A')
        if (scoreBlackjackHand(initialPlayer) === 21) {
            window.setTimeout(() => finishRound(initialHands, initialDealer), 320)
        }
        resolve({ profit: 0 })
    })

    const hit = () => {
        if (phase !== 'playing') return
        const activeHand = hands[activeHandIndex]
        if (!activeHand || activeHand.status !== 'active' || activeHand.isSplitAces) return
        playSound('flip')
        let nextShoe = shoe; let card
        ;[card, nextShoe] = drawTop(nextShoe)
        const nextCards = [...activeHand.cards, card]
        const nextHand = {
            ...activeHand,
            cards: nextCards,
            status: scoreBlackjackHand(nextCards) > 21 ? 'busted' : 'active',
        }
        const nextHands = hands.map((hand, index) => index === activeHandIndex ? nextHand : hand)
        setShoe(nextShoe)
        if (nextHand.status === 'busted') {
            window.setTimeout(() => advanceFromHand(nextHands, nextShoe), 300)
            return
        }
        setHands(nextHands)
    }

    const stand = () => {
        if (phase !== 'playing') return
        const activeHand = hands[activeHandIndex]
        if (!activeHand || activeHand.status !== 'active') return
        playSound('click')
        const nextHands = hands.map((hand, index) => index === activeHandIndex ? { ...hand, status: 'standing' } : hand)
        advanceFromHand(nextHands, shoe)
    }

    const doubleDown = () => {
        if (phase !== 'playing') return
        const activeHand = hands[activeHandIndex]
        if (!canDoubleHand(activeHand)) return
        if (!placeBet(activeHand.wager, 'Blackjack double')) {
            showToast('error', 'Not enough credits', 'Cannot double')
            return
        }
        playSound('deal')
        let nextShoe = shoe; let card
        ;[card, nextShoe] = drawTop(nextShoe)
        const nextCards = [...activeHand.cards, card]
        const nextHand = {
            ...activeHand,
            cards: nextCards,
            doubled: true,
            wager: activeHand.wager * 2,
            status: scoreBlackjackHand(nextCards) > 21 ? 'busted' : 'standing',
        }
        const nextHands = hands.map((hand, index) => index === activeHandIndex ? nextHand : hand)
        setShoe(nextShoe)
        window.setTimeout(() => advanceFromHand(nextHands, nextShoe), 300)
    }

    const surrender = () => {
        if (phase !== 'playing') return
        const activeHand = hands[activeHandIndex]
        if (!canSurrenderHand(activeHand, activeHandIndex, hands)) return
        playSound('click')
        const nextHands = hands.map((hand, index) => index === activeHandIndex ? { ...hand, status: 'surrendered', surrendered: true } : hand)
        advanceFromHand(nextHands, shoe)
    }

    const split = () => {
        if (phase !== 'playing') return
        const activeHand = hands[activeHandIndex]
        if (!canSplitHand(activeHand, hands)) return
        if (!placeBet(activeHand.wager, 'Blackjack split')) {
            showToast('error', 'Not enough credits', 'Cannot split')
            return
        }
        playSound('deal')
        let nextShoe = shoe
        let firstCard; let secondCard
        ;[firstCard, nextShoe] = drawTop(nextShoe)
        ;[secondCard, nextShoe] = drawTop(nextShoe)
        const splitHands = splitBlackjackHand(activeHand, firstCard, secondCard)
        const nextHands = [
            ...hands.slice(0, activeHandIndex),
            ...splitHands,
            ...hands.slice(activeHandIndex + 1),
        ]
        setShoe(nextShoe)
        setHands(nextHands)
        setActiveBet(nextHands.reduce((sum, hand) => sum + (hand.wager || 0), 0))
        const nextIndex = nextPlayableHandIndex(nextHands, activeHandIndex - 1)
        if (nextIndex >= 0) {
            setActiveHandIndex(nextIndex)
            return
        }
        finishDealerAndSettle(nextHands, nextShoe)
    }

    const takeInsurance = () => {
        if (!insuranceOffered || phase !== 'playing') return
        const cost = originalBet / 2
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

    const activeHand = hands[activeHandIndex] || hands[0] || makeBlackjackHand({ cards: [], wager: 0, status: 'idle', id: 'empty' })
    const activeScore = scoreBlackjackHand(activeHand.cards)
    const hint = phase === 'playing' ? basicStrategyHint(activeHand.cards, dealer[0]) : 'Deal a hand to receive guidance.'
    const recentProfit = useMemo(() => session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0), [session.history])
    const inRound = phase === 'playing'
    const hintAction = hintActionFromText(hint)

    // When a hand is dealt, bring the table/action stage into view so mobile
    // players see the cards and hit/stand controls instead of them landing
    // below the fold. Same class as the Poker action-bar fix.
    useScrollActionIntoView(stageRef, inRound, [inRound], { block: 'nearest' })
    const dealerVisible = dealer[0] ? `${dealer[0].rank}${suitGlyph(dealer[0].suit)} (${dealerUpValue(dealer[0])})` : '—'
    const playerTotalLabel = activeHand.cards.length ? `${activeScore}${isSoftHand(activeHand.cards) ? ' soft' : ''}` : '—'
    const canSplitActive = canSplitHand(activeHand, hands)
    const canDoubleActive = canDoubleHand(activeHand)
    const canSurrenderActive = canSurrenderHand(activeHand, activeHandIndex, hands)

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
            <CoreStageFrame minHeight={520} maxWidth={920} loading={!preloader.ready} className="bj-stage-frame" mobileScrollable>
                <div className="bj-stage" ref={stageRef}>
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    {chipSlide ? (
                        <span key={chipSlide.key} className="bj-chip-slide" aria-hidden="true">
                            {formatCredits(chipSlide.amount)}
                        </span>
                    ) : null}
                    <div className="bj-table-status" aria-label="Blackjack table status">
                        <div>
                            <span>Dealer up-card</span>
                            <strong>{dealerVisible}</strong>
                        </div>
                        <div>
                            <span>Player total</span>
                            <strong>{playerTotalLabel}</strong>
                        </div>
                        <div>
                            <span>Rule</span>
                            <strong>{decks} decks · {hitsSoft17 ? 'H17' : 'S17'}</strong>
                        </div>
                        <div>
                            <span>Active bet</span>
                            <strong>{activeBet ? `${formatCredits(activeHand.wager || activeBet)} / ${formatCredits(activeBet)}` : '—'}</strong>
                        </div>
                    </div>
                    <Hand
                        label={`Dealer ${dealer.length && phase !== 'playing' ? scoreBlackjackHand(dealer) : phase === 'playing' && dealer[0] ? `(${dealerUpValue(dealer[0])})` : '--'}`}
                        cards={dealer}
                        hideHole={phase === 'playing'}
                        emptyHint={phase === 'idle' ? 'Press Deal to start' : null}
                    />
                    {hands.length > 1 && (
                        <div className="bj-hand-tabs" role="tablist" aria-label="Blackjack hands">
                            {hands.map((hand, index) => (
                                <button
                                    key={hand.id}
                                    type="button"
                                    role="tab"
                                    className={index === activeHandIndex ? 'active' : ''}
                                    disabled={phase !== 'playing' || hand.status !== 'active'}
                                    onClick={() => setActiveHandIndex(index)}
                                >
                                    <span>Hand {index + 1}</span>
                                    <strong>{scoreBlackjackHand(hand.cards)}</strong>
                                    <em>{formatCredits(hand.wager)}</em>
                                </button>
                            ))}
                        </div>
                    )}
                    {hands.length ? hands.map((hand, index) => (
                        <Hand
                            key={hand.id}
                            label={`Hand ${index + 1} · ${scoreBlackjackHand(hand.cards)}${isSoftHand(hand.cards) ? ' soft' : ''}`}
                            cards={hand.cards}
                            active={phase === 'playing' && index === activeHandIndex && hand.status === 'active'}
                            status={hand.result?.label || hand.status}
                            wager={hand.wager}
                        />
                    )) : (
                        <Hand
                            label="Player --"
                            cards={[]}
                            emptyHint={phase === 'idle' ? 'Pick decks · S17/H17 · then Deal' : null}
                        />
                    )}
                    <div className="bj-actions" data-mobile-critical-surface>
                        <StageActionButton className={`bj-primary-action ${hintAction === 'hit' ? 'recommended' : ''}`} disabled={phase !== 'playing' || activeHand.status !== 'active' || activeHand.isSplitAces} onClick={hit}>Hit</StageActionButton>
                        <StageActionButton className={`bj-primary-action ${hintAction === 'stand' ? 'recommended' : ''}`} disabled={phase !== 'playing' || activeHand.status !== 'active'} onClick={stand}>Stand</StageActionButton>
                        <StageActionButton variant="secondary" disabled={phase !== 'playing' || !canSplitActive} onClick={split}>Split</StageActionButton>
                        <StageActionButton variant="secondary" disabled={phase !== 'playing' || !canDoubleActive} onClick={doubleDown}>Double</StageActionButton>
                        <StageActionButton variant="danger" disabled={phase !== 'playing' || !canSurrenderActive} onClick={surrender}>Surrender</StageActionButton>
                    </div>
                    {insuranceOffered && (
                        <div className="bj-insurance">
                            <span>Dealer shows Ace · Insurance?</span>
                            <button onClick={takeInsurance}>Yes ({formatCredits(originalBet / 2)})</button>
                            <button onClick={() => setInsuranceOffered(false)}>Decline</button>
                        </div>
                    )}
                    <p className="bj-hint">{hint}</p>
                    <div className="bj-meta">
                        <MultiplierBadge label="Bet" value={activeBet || 0} suffix="" size="sm" state={inRound ? 'active' : 'idle'} />
                        {outcomeSummary && (
                            <span className={`bj-outcome-summary ${outcomeSummary.profit >= 0 ? 'pos' : 'neg'}`}>
                                Return {formatCredits(outcomeSummary.totalReturn)} · P/L {outcomeSummary.profit >= 0 ? '+' : ''}{formatCredits(outcomeSummary.profit)}
                            </span>
                        )}
                    </div>
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('blackjack')} />
            {/* Basic-strategy hand-win frequency. Rounds resolve into win/push/
                loss with 3:2 blackjacks, so the engine's true RTP lives in
                blackjackRules/settleBlackjackHands, not a single multiplier. The
                Probability Lab uses a binary EV model, so we surface the standard
                basic-strategy win frequency (~43% of hands win outright, the rest
                push or lose) and reconcile payoutMultiplier from the definition's
                RTP (0.995) so EV ≈ RTP. The constant is the best available
                single-number summary; deriving an exact per-rule figure would
                require simulating settleBlackjackHands across the full hand space. */}
            <EducationPanel
                definition={definition}
                betAmount={5}
                winProbability={BJ_WIN_FREQUENCY}
                payoutMultiplier={(definition?.rtp ?? 0.995) / BJ_WIN_FREQUENCY}
                balance={balance}
                recentProfit={recentProfit}
            />
        </GameShell>
    )
}

function Hand({ label, cards, hideHole = false, emptyHint = null, emptySlots = 2, active = false, status = null, wager = null }) {
    const isEmpty = cards.length === 0
    return (
        <div className={`bj-hand ${active ? 'active' : ''} ${status ? `status-${String(status).toLowerCase()}` : ''}`} data-mobile-critical-surface>
            <span className="bj-hand-label">
                <span>{label}</span>
                {status && <em>{status}</em>}
                {wager ? <strong>{formatCredits(wager)}</strong> : null}
            </span>
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
