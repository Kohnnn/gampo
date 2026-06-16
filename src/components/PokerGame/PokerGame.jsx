import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCredits } from '../../context/CreditContext'
import { useAudio } from '../../audio/AudioProvider'
import { useGameBgm } from '../../audio/useBgm'
import { formatCredits } from '../../utils/simulationMath'
import { applyAction, createInitialState, dealNext, legalActions, startHand } from '../../poker/engine/Game'
import HeuristicBot from '../../poker/bots/HeuristicBot'
import { preloadGto } from '../../poker/gto/loader'
import GtoPanel from './GtoPanel'
import HandHistoryTab, { recordHand } from './HandHistoryTab'
import { useScrollActionIntoView } from '../../hooks/useScrollActionIntoView'
import './PokerGame.css'

const BUY_INS = [1000, 5000, 25000, 100000, 500000]
const SNG_HAND_LIMIT = 60
const LEVEL_HANDS = 6
const BOT_THINK_MS = 1100
const BOT_PERSONAS = [
    { name: 'lucky_lemur', avatar: 1, aggression: 0.52, pokerStyle: 'whale', chat: ['glgl', 'small pot poker', 'river saved me'] },
    { name: 'binary_bee', avatar: 2, aggression: 0.38, pokerStyle: 'analyst', chat: ['range says call', 'too many bluffs?', 'checking back'] },
    { name: 'oddsmonkey', avatar: 3, aggression: 0.68, pokerStyle: 'analyst', chat: ['pot odds say yes', 'thin value?', 'priced in'] },
    { name: 'crash_capt', avatar: 4, aggression: 0.82, pokerStyle: 'loose-aggressive', chat: ['pressure spot', 'big sizing', 'no fear'] },
    { name: 'plinko_pat', avatar: 5, aggression: 0.47, pokerStyle: 'cautious', chat: ['bouncy flop', 'one time', 'variance lol'] },
    { name: 'turn_barrel', avatar: 1, aggression: 0.74, pokerStyle: 'loose-aggressive', chat: ['barrel card', 'polar now', 'turn is mine'] },
    { name: 'nit_nova', avatar: 2, aggression: 0.29, pokerStyle: 'tight-passive', chat: ['not defending that', 'discipline', 'folding range'] },
    { name: 'river_raccoon', avatar: 3, aggression: 0.58, pokerStyle: 'analyst', chat: ['river spot', 'show me', 'thin call'] },
    { name: 'solver_sam', avatar: 4, aggression: 0.61, pokerStyle: 'analyst', chat: ['mixed node', 'spr matters', 'balanced enough'] },
    { name: 'bubble_ace', avatar: 5, aggression: 0.43, pokerStyle: 'cautious', chat: ['survive first', 'ladder brain', 'no punt'] },
    { name: 'value_vix', avatar: 1, aggression: 0.55, pokerStyle: 'analyst', chat: ['thin value!', 'snap call', 'two-pair good'] },
    { name: 'donk_dora', avatar: 2, aggression: 0.65, pokerStyle: 'whale', chat: ['donk lead', 'no time to waste', 'shove it'] },
    { name: 'mtt_max', avatar: 3, aggression: 0.7, pokerStyle: 'loose-aggressive', chat: ['final-table mode', 'icm pressure', 'short stack ammo'] },
    { name: 'straddle_sue', avatar: 4, aggression: 0.78, pokerStyle: 'loose-aggressive', chat: ['straddle pot', 'open jam', 'level it up'] },
    { name: 'fish_finn', avatar: 5, aggression: 0.34, pokerStyle: 'whale', chat: ['call call call', 'I had a draw', 'nh'] },
]
const BOT_AVATARS = [1, 2, 3, 4, 5].map(i => `/assets/games/poker/poker-avatar-${i}.png`)

function blindLevelForHand(handNumber) {
    const level = Math.floor((handNumber - 1) / LEVEL_HANDS)
    const bb = 20 * (2 ** level)
    return { level: level + 1, sb: Math.floor(bb / 2), bb, ante: level >= 2 ? Math.max(1, Math.floor(bb / 8)) : 0 }
}

// Wave 12: cash-game format keeps blinds and ante locked at the buy-in level.
function cashGameLevel() {
    return { level: 1, sb: 5, bb: 10, ante: 0 }
}

function suitGlyph(s) { return s === 'h' ? '\u2665' : s === 'd' ? '\u2666' : s === 's' ? '\u2660' : '\u2663' }
function suitClass(s) { return (s === 'h' || s === 'd') ? 'red' : 'black' }
function rankPretty(r) { return r === 'T' ? '10' : r }
function cardCode(card) {
    if (!card) return ''
    return `${rankPretty(card[0])}${suitGlyph(card[1])}`
}
function prettyStreet(street) {
    if (!street) return 'Waiting'
    if (street === 'showdown') return 'Showdown'
    return street.charAt(0).toUpperCase() + street.slice(1)
}

const DIFFICULTY_TUNING = { beginner: -0.18, intermediate: -0.06, advanced: 0.06 }

function difficultyRoll() {
    const r = Math.random()
    if (r < 0.18) return 'beginner'
    if (r < 0.74) return 'intermediate'
    return 'advanced'
}

function makePersona(slotId, usedNames) {
    const pool = BOT_PERSONAS.filter(p => !usedNames.has(p.name))
    const candidates = pool.length ? pool : BOT_PERSONAS
    const base = candidates[Math.floor(Math.random() * candidates.length)]
    const difficulty = difficultyRoll()
    return {
        ...base,
        id: slotId,
        difficulty,
        aggression: Math.max(0.18, Math.min(0.92, base.aggression + DIFFICULTY_TUNING[difficulty])),
        avatar: BOT_AVATARS[base.avatar - 1],
    }
}

function samplePersonas() {
    const used = new Set()
    const out = []
    for (let i = 0; i < 5; i += 1) {
        const persona = makePersona(`bot${i}`, used)
        used.add(persona.name)
        out.push(persona)
    }
    return out
}

function botLine(persona, decision, state) {
    const pot = state?.pot || 0
    if (decision.type === 'raise') return decision.amount > pot ? (persona.difficulty === 'advanced' ? 'ICM pressure' : 'overbet pressure') : persona.chat[Math.floor(Math.random() * persona.chat.length)]
    if (decision.type === 'fold') return ['not defending that', 'too expensive', 'live to fight'][Math.floor(Math.random() * 3)]
    if (decision.type === 'call') return ['priced in', 'call and see', 'sticky one'][Math.floor(Math.random() * 3)]
    return ['check it', 'pot control', 'free card?'][Math.floor(Math.random() * 3)]
}

function PokerCard({ card, hidden }) {
    if (!card) return <div className="pk-card empty">--</div>
    if (hidden) return <div className="pk-card hidden"><div className="pk-card-back" /></div>
    const r = card[0]; const s = card[1]
    const glyph = suitGlyph(s)
    return (
        <div className={`pk-card ${suitClass(s)}`}>
            <span className="pk-corner pk-corner-tl">
                <span className="pk-rank">{rankPretty(r)}</span>
                <span className="pk-suit">{glyph}</span>
            </span>
            <span className="pk-pip" aria-hidden="true">{glyph}</span>
            <span className="pk-corner pk-corner-br">
                <span className="pk-rank">{rankPretty(r)}</span>
                <span className="pk-suit">{glyph}</span>
            </span>
        </div>
    )
}

export default function PokerGame() {
    useGameBgm('poker', 'idle')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()

    const [state, setState] = useState(null)
    const [seated, setSeated] = useState(false)
    const [chat, setChat] = useState([
        { id: 1, user: 'lucky_lemur', text: 'gg good luck' },
        { id: 2, user: 'binary_bee', text: 'limp limp limp' },
    ])
    const [chatInput, setChatInput] = useState('')
    const [raiseAmount, setRaiseAmount] = useState(null)
    const [raiseOpen, setRaiseOpen] = useState(false)
    const [tab, setTab] = useState('gto')
    const [buyIn, setBuyIn] = useState(1000)
    // Wave 12: format selector
    const [format, setFormat] = useState('sng') // 'sng' | 'cash'
    const [handNumber, setHandNumber] = useState(1)
    const [sngComplete, setSngComplete] = useState(false)
    const [bubbles, setBubbles] = useState({})
    const [confirmCashout, setConfirmCashout] = useState(false)
    const [rotationLog, setRotationLog] = useState([])
    // Wave 12: rebuy prompt for the human + chip motion + time bank
    const [rebuyPrompt, setRebuyPrompt] = useState(false)
    const [chipMotions, setChipMotions] = useState([]) // [{ id, seat, amount, ts }]
    const [thinkProgress, setThinkProgress] = useState(0) // 0..1 for current bot
    const [postflopChart, setPostflopChart] = useState(null)
    const stepTimer = useRef(null)
    const lastRecordedShowdown = useRef(null)
    const heroStartStackRef = useRef(0)
    const lastHandStartHistoryLen = useRef(-1)
    const initialBuyInRef = useRef(0)
    const lastPutInRef = useRef({})
    const actionsRef = useRef(null)
    const thinkRafRef = useRef(null)
    const thinkStartRef = useRef(0)
    const tableRef = useRef(null)

    useEffect(() => {
        let active = true
        preloadGto().then(([, postflop]) => {
            if (active) setPostflopChart(postflop)
        })
        return () => { active = false }
    }, [])

    useEffect(() => {
        if (!state || !state.players?.length) return
        const hero = state.players.find(p => p.isHuman)
        if (!hero) return
        const street = state.street
        const handStartedNow = street === 'preflop' && state.community.length === 0 && lastHandStartHistoryLen.current !== state.history.length
        if (handStartedNow && hero.lastAction === null) {
            heroStartStackRef.current = hero.stack + (hero.putIn || 0)
            lastHandStartHistoryLen.current = state.history.length
            lastRecordedShowdown.current = null
        }
    }, [state])

    // Wave 12: detect putIn deltas and emit chip-motion animations on each seat.
    useEffect(() => {
        if (!state) {
            lastPutInRef.current = {}
            return
        }
        const motions = []
        const next = {}
        for (let i = 0; i < state.players.length; i += 1) {
            const p = state.players[i]
            const key = p.id
            const put = p.putIn || 0
            const prev = lastPutInRef.current[key] ?? 0
            if (put > prev) {
                motions.push({
                    id: `${key}-${state.history.length}-${Math.random().toString(16).slice(2, 6)}`,
                    seat: i,
                    amount: put - prev,
                    ts: Date.now(),
                })
            }
            next[key] = put
        }
        lastPutInRef.current = next
        if (motions.length) {
            setChipMotions(prev => [...prev.slice(-12), ...motions])
            const ids = motions.map(m => m.id)
            window.setTimeout(() => {
                setChipMotions(prev => prev.filter(m => !ids.includes(m.id)))
            }, 1100)
        }
    }, [state])

    const enterPokerSession = (selectedFormat = format, selectedBuyIn = buyIn) => {
        if (balance < selectedBuyIn) {
            showToast('error', `Need ${formatCredits(selectedBuyIn)}`, 'Add credits to sit down')
            return
        }
        if (!placeBet(selectedBuyIn, 'Poker buy-in')) return
        const blindLevel = selectedFormat === 'cash' ? cashGameLevel() : blindLevelForHand(1)
        const personas = samplePersonas()
        const seats = [
            { id: 'you', name: 'you', stack: selectedBuyIn, isHuman: true },
            ...personas.map(p => ({ id: p.id, name: p.name, stack: selectedBuyIn, avatar: p.avatar, persona: p, pokerStyle: p.pokerStyle })),
        ]
        const init = createInitialState({ players: seats, sb: blindLevel.sb, bb: blindLevel.bb, ante: blindLevel.ante, buttonIndex: 4 })
        initialBuyInRef.current = selectedBuyIn
        setFormat(selectedFormat)
        setState(startHand(init))
        setHandNumber(1)
        setSngComplete(false)
        setSeated(true)
        setRotationLog([])
        setConfirmCashout(false)
        setRebuyPrompt(false)
        setChipMotions([])
        setThinkProgress(0)
        playSound('deal')
        window.requestAnimationFrame(() => {
            tableRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
        })
    }

    // Wave 12: bot decision driver with time-bank progress bar.
    useEffect(() => {
        if (!state) return
        if (state.street === 'showdown') return
        if (state.toAct < 0) {
            const stepTimerId = window.setTimeout(() => {
                setState(prev => {
                    if (!prev || prev.street === 'showdown' || prev.toAct >= 0) return prev
                    return applyAction(prev, { type: 'check' })
                })
            }, 250)
            return () => window.clearTimeout(stepTimerId)
        }
        const p = state.players[state.toAct]
        if (!p || p.isHuman) {
            setThinkProgress(0)
            return
        }
        // Animate think progress.
        thinkStartRef.current = performance.now()
        setThinkProgress(0)
        const tick = () => {
            const elapsed = performance.now() - thinkStartRef.current
            const ratio = Math.min(1, elapsed / BOT_THINK_MS)
            setThinkProgress(ratio)
            if (ratio < 1) thinkRafRef.current = window.requestAnimationFrame(tick)
        }
        thinkRafRef.current = window.requestAnimationFrame(tick)
        const decideTimer = window.setTimeout(() => {
            const persona = p.persona || { aggression: 0.5, chat: ['nice'] }
            const blindPressure = Math.min(0.1, Math.max(0, (state.bb || 20) / Math.max(1, p.stack + (p.putIn || 0))) * 0.55)
            const anteFactor = state.ante > 0 ? 0.04 : 0
            const decision = HeuristicBot({
                state,
                seatIndex: state.toAct,
                aggression: Math.min(0.96, persona.aggression + blindPressure + anteFactor),
                difficulty: persona.difficulty || 'intermediate',
                persona: persona.pokerStyle || persona,
                postflopChart,
            })
            setState(prev => applyAction(prev, decision))
            setThinkProgress(0)
            playSound(decision.type === 'fold' ? 'click' : decision.type === 'raise' ? 'flip' : 'tick')
            if (Math.random() < 0.42) {
                const text = botLine(persona, decision, state)
                setChat(prev => [...prev.slice(-30), { id: Date.now(), user: p.name, text }])
                setBubbles(prev => ({ ...prev, [p.id]: text }))
                window.setTimeout(() => setBubbles(prev => {
                    const next = { ...prev }
                    delete next[p.id]
                    return next
                }), 2800)
            }
        }, BOT_THINK_MS)
        const escapeTimer = window.setTimeout(() => {
            setState(prev => {
                if (!prev || prev.street === 'showdown') return prev
                const cur = prev.players[prev.toAct]
                if (!cur || cur.isHuman || cur.id !== p.id) return prev
                // eslint-disable-next-line no-console
                console.warn('[PokerGame] bot escape-hatch fold:', p.name, 'seat', state.toAct)
                return applyAction(prev, { type: 'fold' })
            })
        }, 5000)
        stepTimer.current = { decideTimer, escapeTimer }
        return () => {
            window.clearTimeout(decideTimer)
            window.clearTimeout(escapeTimer)
            if (thinkRafRef.current) window.cancelAnimationFrame(thinkRafRef.current)
            setThinkProgress(0)
        }
    }, [state, playSound, postflopChart])

    const acts = state ? legalActions(state) : []
    const human = state ? state.players.find(p => p.isHuman) : null
    const isHumanTurn = state && state.toAct >= 0 && state.players[state.toAct]?.isHuman

    // When it becomes the player's turn, bring the action bar into view so the
    // fold/call/raise controls aren't stranded below the fold on mobile.
    useScrollActionIntoView(actionsRef, Boolean(isHumanTurn), [isHumanTurn], { block: 'nearest' })

    // Collapse the raise sizing panel whenever it stops being the player's turn
    // so the action bar returns to its compact 1-2 row height between decisions.
    useEffect(() => {
        if (!isHumanTurn && raiseOpen) setRaiseOpen(false)
    }, [isHumanTurn, raiseOpen])

    useEffect(() => {
        if (!state || state.street !== 'showdown' || !human) return
        const sigKey = state.history.length + ':' + state.winners.map(w => `${w.id}:${w.share}`).join(',')
        if (lastRecordedShowdown.current === sigKey) return
        lastRecordedShowdown.current = sigKey
        const heroWin = state.winners.find(w => w.id === human.id)
        const startStack = heroStartStackRef.current || 0
        const finalStack = human.stack || 0
        const handProfit = startStack > 0 ? (finalStack - startStack) : ((heroWin?.share || 0) - (human.putIn || 0))
        const wagered = startStack > 0 ? Math.max(0, startStack - finalStack + Math.max(0, handProfit)) : (human.putIn || 0)
        recordHand({
            id: `hand-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label: heroWin ? (heroWin.hand || 'Won') : 'Folded/Lost',
            profit: handProfit,
            betAmount: wagered,
            meta: { winners: state.winners.map(w => w.id), street: state.street, startStack, finalStack },
        })
        // Wave 12: rebuy prompt when the human busts.
        if ((human.stack || 0) <= 0) {
            setRebuyPrompt(true)
        }
    }, [state, human])

    const handleAction = (act) => {
        if (!isHumanTurn) return
        playSound(act.type === 'fold' ? 'click' : act.type === 'raise' ? 'flip' : 'tick')
        setState(prev => applyAction(prev, act))
    }

    const rotateBustedBots = (prev) => {
        if (!prev) return prev
        const next = structuredClone(prev)
        const usedNames = new Set(next.players.map(p => p.persona?.name || p.name))
        const reseat = []
        const buyAmount = initialBuyInRef.current || buyIn
        for (let i = 0; i < next.players.length; i += 1) {
            const seat = next.players[i]
            if (seat.isHuman) continue
            if ((seat.stack || 0) > 0) continue
            const fresh = makePersona(seat.id, usedNames)
            usedNames.delete(seat.persona?.name || seat.name)
            usedNames.add(fresh.name)
            seat.name = fresh.name
            seat.stack = buyAmount
            seat.avatar = fresh.avatar
            seat.persona = fresh
            seat.pokerStyle = fresh.pokerStyle
            seat.status = 'active'
            seat.putIn = 0
            seat.lastAction = null
            seat.hole = []
            reseat.push(fresh.name)
        }
        if (reseat.length) {
            setRotationLog(prevLog => [
                { id: Date.now(), names: reseat, hand: handNumber + 1, ts: Date.now() },
                ...prevLog,
            ].slice(0, 10))
        }
        return next
    }

    const nextHand = () => {
        if (!state) return
        if ((human?.stack || 0) <= 0) {
            // Trigger rebuy prompt instead of leaving immediately.
            setRebuyPrompt(true)
            return
        }
        if (format === 'sng' && handNumber >= SNG_HAND_LIMIT) {
            const stack = human?.stack || 0
            if (stack > 0) addWinnings(stack, 'Poker sit-and-go cashout')
            setSngComplete(true)
            showToast(stack >= buyIn ? 'win' : 'loss', 'Sit-and-go complete', `Final stack ${formatCredits(stack)}`)
            setState(null); setSeated(false); return
        }
        const nextHandNumber = handNumber + 1
        const blindLevel = format === 'cash' ? cashGameLevel() : blindLevelForHand(nextHandNumber)
        setHandNumber(nextHandNumber)
        setState(prev => {
            const rotated = rotateBustedBots(prev)
            return dealNext({ ...rotated, sb: blindLevel.sb, bb: blindLevel.bb, ante: blindLevel.ante })
        })
        setConfirmCashout(false)
    }

    const cashOut = (force = false) => {
        if (!state || !human) return
        const midHand = state.street !== 'showdown' && state.street !== 'idle' && human.status !== 'folded'
        if (midHand && !force) {
            setConfirmCashout(true)
            return
        }
        const finalStack = human.stack || 0
        if (finalStack > 0) addWinnings(finalStack, 'Poker cashout')
        showToast('bet', 'Left the table', `Cashed out ${formatCredits(finalStack)}`)
        setState(null); setSeated(false); setSngComplete(false); setConfirmCashout(false); setRebuyPrompt(false)
    }

    // Wave 12: cash-game top-up between hands.
    const topUp = () => {
        if (!state || !human) return
        const buyAmount = initialBuyInRef.current || buyIn
        const need = Math.max(0, buyAmount - (human.stack || 0))
        if (need <= 0) {
            showToast('info', 'Already at full buy-in', `${formatCredits(human.stack)}`)
            return
        }
        if (balance < need) {
            showToast('error', `Need ${formatCredits(need)}`, 'Add credits to top up')
            return
        }
        if (!placeBet(need, 'Poker top-up')) return
        setState(prev => {
            if (!prev) return prev
            const next = structuredClone(prev)
            const seat = next.players.find(p => p.isHuman)
            if (seat) {
                seat.stack += need
                if (seat.status === 'sittingOut') seat.status = 'active'
            }
            return next
        })
        showToast('bet', 'Topped up', `+${formatCredits(need)}`)
    }

    // Wave 12: rebuy. Adds the buy-in back to the human stack and dismisses the prompt.
    const rebuy = () => {
        if (!state || !human) return
        const buyAmount = initialBuyInRef.current || buyIn
        if (balance < buyAmount) {
            showToast('error', `Need ${formatCredits(buyAmount)}`, 'Add credits to rebuy')
            return
        }
        if (!placeBet(buyAmount, 'Poker rebuy')) return
        setState(prev => {
            if (!prev) return prev
            const next = structuredClone(prev)
            const seat = next.players.find(p => p.isHuman)
            if (seat) {
                seat.stack += buyAmount
                seat.status = 'active'
            }
            return next
        })
        setRebuyPrompt(false)
        showToast('bet', 'Rebought', `+${formatCredits(buyAmount)}`)
    }

    const declineRebuy = () => {
        // Treat as cash-out leave with current (zero) stack.
        showToast('loss', 'Busted', 'Buy-in lost')
        setState(null); setSeated(false); setRebuyPrompt(false); setConfirmCashout(false)
    }

    const raiseRange = useMemo(() => {
        const r = acts.find(a => a.type === 'raise')
        return r ? { min: r.min, max: r.max } : null
    }, [acts])

    useEffect(() => {
        if (raiseRange) setRaiseAmount(raiseRange.min)
    }, [raiseRange?.min, raiseRange?.max])

    const sendChat = () => {
        if (!chatInput.trim()) return
        setChat(prev => [...prev.slice(-40), { id: Date.now(), user: 'you', text: chatInput.trim() }])
        setChatInput('')
    }

    const blindLevel = state
        ? (format === 'cash' ? cashGameLevel() : blindLevelForHand(handNumber))
        : null
    const profitInSession = state && human && initialBuyInRef.current
        ? (human.stack || 0) - initialBuyInRef.current
        : 0
    const actor = state?.toAct >= 0 ? state.players[state.toAct] : null
    const facingAmount = state && human ? Math.max(0, (state.currentBet || 0) - (human.putIn || 0)) : 0
    const potOdds = facingAmount > 0 ? facingAmount / Math.max(1, state.pot + facingAmount) : 0
    const heroCards = human?.hole?.length ? human.hole.map(cardCode).join(' ') : '—'
    const tableStateLabel = state?.street === 'showdown'
        ? 'Showdown'
        : isHumanTurn
            ? 'Your action'
            : actor
                ? `${actor.name} thinking`
                : 'Dealing'
    const gtoNow = (() => {
        if (!state || !human) return null
        const hasRaise = acts.some(a => a.type === 'raise')
        const hasCall = acts.some(a => a.type === 'call')
        const hasCheck = acts.some(a => a.type === 'check')
        const spr = state.pot > 0 ? ((human.stack || 0) / state.pot) : 0
        if (!isHumanTurn) {
            return { decision: tableStateLabel, raise: 0, call: 0, fold: 0, classLabel: 'Waiting', spr }
        }
        if (facingAmount > 0 && potOdds > 0.34) {
            return { decision: 'Fold pressure', raise: 8, call: 22, fold: 70, classLabel: 'Risk control', spr }
        }
        if (hasRaise && facingAmount === 0) {
            return { decision: 'Raise / check', raise: 58, call: hasCheck ? 42 : 0, fold: 0, classLabel: 'Open pressure', spr }
        }
        if (hasCall) {
            return { decision: 'Call / raise', raise: hasRaise ? 28 : 0, call: 62, fold: 10, classLabel: 'Continue', spr }
        }
        return { decision: hasCheck ? 'Check' : 'Act', raise: hasRaise ? 35 : 0, call: hasCheck ? 65 : 0, fold: 0, classLabel: 'Low pressure', spr }
    })()

    return (
        <div className="poker-page" data-ux-surface="shell">
            <div className="poker-titlebar" data-ux-surface="shell">
                <Link to="/" className="poker-back">‹ Hub</Link>
                <h1>Live Poker (No-Limit Hold'em, 6-max)</h1>
                <div className="poker-balance"><span>Balance</span><strong>{formatCredits(balance)}</strong></div>
            </div>

            {!seated && (
                <div className="poker-lobby">
                    <h2>Sit down</h2>
                    <p>Fresh 6-handed table. Bots rotate when busted; rebuy any time. Practice credits only.</p>
                    {/* Wave 12: format toggle */}
                    <div className="poker-format-toggle" role="tablist" aria-label="Format">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={format === 'sng'}
                            className={format === 'sng' ? 'active' : ''}
                            onClick={() => setFormat('sng')}
                        >Sit-and-go ({SNG_HAND_LIMIT}h)</button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={format === 'cash'}
                            className={format === 'cash' ? 'active' : ''}
                            onClick={() => setFormat('cash')}
                        >Cash game (5/10)</button>
                    </div>
                    <div className="poker-buyin-options">
                        {BUY_INS.map(amount => (
                            <button type="button" key={amount} className={buyIn === amount ? 'active' : ''} disabled={balance < amount} onClick={() => setBuyIn(amount)}>{formatCredits(amount)}</button>
                        ))}
                    </div>
                    {sngComplete && <div className="pk-lobby-note">Last sit-and-go completed. Choose a stake to sit fresh.</div>}
                    <button
                        type="button"
                        className="poker-buyin"
                        disabled={balance < buyIn}
                        onClick={() => enterPokerSession(format, buyIn)}
                        data-poker-action="sit-down"
                        data-mobile-hit-target="primary"
                        data-ux-primary-action
                    >
                        Sit Down {formatCredits(buyIn)}
                    </button>
                </div>
            )}

            {seated && state && blindLevel && (
                <>
                    <div className="pk-info-strip" role="status" aria-label="Hand info">
                        <div className="pk-info-cell">
                            <span>{format === 'cash' ? 'Hand' : 'Hand'}</span>
                            <strong>
                                {handNumber}
                                {format === 'sng' && <em> / {SNG_HAND_LIMIT}</em>}
                            </strong>
                        </div>
                        <div className="pk-info-cell">
                            <span>Format</span>
                            <strong>{format === 'cash' ? 'Cash' : 'SNG'}</strong>
                        </div>
                        <div className="pk-info-cell">
                            <span>Blinds</span>
                            <strong>{formatCredits(blindLevel.sb)} / {formatCredits(blindLevel.bb)}</strong>
                        </div>
                        <div className="pk-info-cell">
                            <span>Ante</span>
                            <strong>{blindLevel.ante > 0 ? formatCredits(blindLevel.ante) : '—'}</strong>
                        </div>
                        <div className="pk-info-cell">
                            <span>Pot</span>
                            <strong className="pk-info-pot">{formatCredits(state.pot)}</strong>
                        </div>
                        <div className="pk-info-cell">
                            <span>Your stack</span>
                            <strong>{formatCredits(human?.stack || 0)}</strong>
                        </div>
                        <div className={`pk-info-cell pk-info-pl ${profitInSession >= 0 ? 'pos' : 'neg'}`}>
                            <span>Session P/L</span>
                            <strong>{profitInSession >= 0 ? '+' : ''}{formatCredits(profitInSession)}</strong>
                        </div>
                        {format === 'cash' && (
                            <button className="pk-info-topup" onClick={topUp} title="Top up to full buy-in">
                                Top Up
                            </button>
                        )}
                        <button className="pk-info-cashout" onClick={() => cashOut(false)} title="Cash out and leave the table">
                            Cash Out
                        </button>
                    </div>

                    {rotationLog.length > 0 && (
                        <div className="pk-rotation-log" aria-live="polite">
                            <span>Seat rotation</span>
                            {rotationLog.slice(0, 1).map(entry => (
                                <em key={entry.id}>
                                    Hand {entry.hand}: {entry.names.join(', ')} bought in
                                </em>
                            ))}
                        </div>
                    )}

                    {confirmCashout && (
                        <div className="pk-cashout-confirm" role="dialog" aria-label="Confirm cash out">
                            <strong>Cash out mid-hand?</strong>
                            <p>You'll fold this hand and leave the table with {formatCredits(human?.stack || 0)}. Bets already in the pot stay there.</p>
                            <div className="pk-cashout-actions">
                                <button className="pk-act" onClick={() => setConfirmCashout(false)}>Stay seated</button>
                                <button className="pk-act primary" onClick={() => cashOut(true)}>Cash out & leave</button>
                            </div>
                        </div>
                    )}

                    {rebuyPrompt && (
                        <div className="pk-rebuy-prompt" role="dialog" aria-label="Rebuy">
                            <strong>You're out of chips</strong>
                            <p>Rebuy at {formatCredits(initialBuyInRef.current || buyIn)} to keep your seat, or leave the table.</p>
                            <div className="pk-cashout-actions">
                                <button className="pk-act" onClick={declineRebuy}>Leave table</button>
                                <button className="pk-act primary" disabled={balance < (initialBuyInRef.current || buyIn)} onClick={rebuy}>Rebuy {formatCredits(initialBuyInRef.current || buyIn)}</button>
                            </div>
                        </div>
                    )}

                    {gtoNow && (
                        <div className="poker-mobile-gto-now" data-poker-mobile-panel="gto">
                            <div>
                                <span>GTO Now</span>
                                <strong>{gtoNow.decision}</strong>
                                <em>{gtoNow.classLabel}</em>
                            </div>
                            <div className="poker-mobile-gto-bars" aria-label={`Raise ${gtoNow.raise} call ${gtoNow.call} fold ${gtoNow.fold}`}>
                                <i className="raise" style={{ width: `${gtoNow.raise}%` }} />
                                <i className="call" style={{ width: `${gtoNow.call}%` }} />
                                <i className="fold" style={{ width: `${gtoNow.fold}%` }} />
                            </div>
                            <div className="poker-mobile-gto-mix" aria-hidden="true">
                                <span className="raise">R {gtoNow.raise}%</span>
                                <span className="call">C {gtoNow.call}%</span>
                                <span className="fold">F {gtoNow.fold}%</span>
                            </div>
                            <dl>
                                <div><dt>Hand</dt><dd>{heroCards}</dd></div>
                                <div><dt>Pot odds</dt><dd>{facingAmount > 0 ? `${(potOdds * 100).toFixed(0)}%` : 'No bet'}</dd></div>
                                <div><dt>SPR</dt><dd>{gtoNow.spr ? gtoNow.spr.toFixed(1) : '—'}</dd></div>
                            </dl>
                        </div>
                    )}

                    <div className="poker-layout" ref={tableRef}>
                        <div className="poker-table" data-ux-surface="stage">
                            <div className="pk-table-status" aria-label="Live poker table status">
                                <div>
                                    <span>Street</span>
                                    <strong>{prettyStreet(state.street)}</strong>
                                </div>
                                <div>
                                    <span>To act</span>
                                    <strong>{tableStateLabel}</strong>
                                </div>
                                <div>
                                    <span>Your hand</span>
                                    <strong>{heroCards}</strong>
                                </div>
                                <div>
                                    <span>Facing</span>
                                    <strong>{facingAmount > 0 ? formatCredits(facingAmount) : 'No bet'}</strong>
                                </div>
                                <div>
                                    <span>Pot odds</span>
                                    <strong>{facingAmount > 0 ? `${(potOdds * 100).toFixed(0)}%` : '—'}</strong>
                                </div>
                            </div>
                            <div className="poker-table-felt">
                                <div className="pk-pot">Pot {formatCredits(state.pot)}</div>
                                <div className="pk-board">
                                    {state.community.map((c, i) => <PokerCard key={i} card={c} />)}
                                    {Array.from({ length: 5 - state.community.length }, (_, i) => (
                                        <PokerCard key={`empty-${i}`} card={null} />
                                    ))}
                                </div>
                                <div className="pk-seats">
                                    {state.players.map((p, i) => (
                                        <div key={p.id}
                                            className={`pk-seat seat-${i} ${p.status} ${p.isHuman ? 'is-human' : ''} ${i === state.toAct ? 'on-turn' : ''} ${i === state.buttonIndex ? 'has-button' : ''}`}>
                                            {p.avatar ? <img className="pk-avatar" src={p.avatar} alt="" /> : <div className="pk-avatar pk-you">YOU</div>}
                                            <div className="pk-seat-info">
                                                <span className="pk-name">{p.name}</span>
                                                <span className="pk-stack">{formatCredits(p.stack)}</span>
                                                {p.persona?.difficulty && (
                                                    <span className={`pk-diff ${p.persona.difficulty}`}>{p.persona.difficulty.slice(0, 3)}</span>
                                                )}
                                                {p.lastAction && <span className="pk-last">{p.lastAction}</span>}
                                                {(p.putIn || 0) > 0 && state.street !== 'showdown' && (
                                                    <span className="pk-bet">{formatCredits(p.putIn)}</span>
                                                )}
                                            </div>
                                            <div className="pk-seat-cards">
                                                {p.status === 'folded' || p.status === 'sittingOut' ? null : (
                                                    p.hole.length === 0 ? null : (
                                                        p.isHuman || state.street === 'showdown'
                                                            ? p.hole.map((c, j) => <PokerCard key={j} card={c} />)
                                                            : p.hole.map((c, j) => <PokerCard key={j} card={c} hidden />)
                                                    )
                                                )}
                                            </div>
                                            {bubbles[p.id] && <div className="pk-speech">{bubbles[p.id]}</div>}
                                            {/* Wave 12: time-bank ring on the seat that's currently to act */}
                                            {i === state.toAct && !p.isHuman && thinkProgress > 0 && (
                                                <span className="pk-think-ring" style={{ '--p': thinkProgress }} aria-hidden="true" />
                                            )}
                                            {i === state.buttonIndex && <span className="pk-button-chip">D</span>}
                                        </div>
                                    ))}
                                </div>
                                {/* Wave 12: chip-into-pot motion overlay */}
                                {chipMotions.map(motion => (
                                    <span
                                        key={motion.id}
                                        className={`pk-chip-motion seat-${motion.seat}`}
                                        aria-hidden="true"
                                    >
                                        +{formatCredits(motion.amount)}
                                    </span>
                                ))}
                            </div>
                            <div
                                className={`pk-actions ${isHumanTurn ? 'is-live' : 'is-waiting'} ${raiseOpen ? 'is-raise-open' : ''} ${state.street === 'showdown' ? 'is-showdown' : ''}`}
                                data-ux-surface="controls"
                                ref={actionsRef}
                            >
                                {state.street === 'showdown' ? (
                                    <>
                                        <div className="pk-winners">
                                            {state.winners.map((w, i) => (
                                                <div key={i}>{w.id} won {formatCredits(w.share)}{w.hand ? ` · ${w.hand}` : ''}</div>
                                            ))}
                                        </div>
                                        <button className="pk-act primary" onClick={nextHand}>Next hand</button>
                                        <button className="pk-act" onClick={() => cashOut(true)}>Cash out</button>
                                    </>
                                ) : (
                                    <>
                                        <div className={`pk-action-status ${isHumanTurn ? 'is-live' : ''}`}>
                                            <span>{isHumanTurn ? 'Decision ready' : 'Waiting'}</span>
                                            <strong>{isHumanTurn ? 'Choose fold, call/check, or size a raise.' : tableStateLabel}</strong>
                                        </div>
                                        {isHumanTurn && acts.map(a => {
                                            if (a.type === 'fold') return <button key={a.type} className="pk-act fold" disabled={!isHumanTurn} onClick={() => handleAction({ type: 'fold' })} data-poker-action="fold" data-ux-primary-action>Fold</button>
                                            if (a.type === 'check') return <button key={a.type} className="pk-act check" disabled={!isHumanTurn} onClick={() => handleAction({ type: 'check' })} data-poker-action="check" data-ux-primary-action>Check</button>
                                            if (a.type === 'call') return <button key={a.type} className="pk-act call" disabled={!isHumanTurn} onClick={() => handleAction({ type: 'call' })} data-poker-action="call" data-ux-primary-action>Call {formatCredits(a.amount)}</button>
                                            if (a.type === 'raise') {
                                                const r = a
                                                if (!raiseOpen) {
                                                    return (
                                                        <button
                                                            key={a.type}
                                                            className="pk-act raise pk-raise-open"
                                                            disabled={!isHumanTurn}
                                                            onClick={() => { setRaiseAmount(raiseAmount ?? r.min); setRaiseOpen(true) }}
                                                            data-poker-action="raise-open"
                                                        >
                                                            Raise ▸
                                                        </button>
                                                    )
                                                }
                                                return (
                                                    <div key={a.type} className="pk-raise pk-raise-open-panel">
                                                        <div className="pk-raise-presets">
                                                            <button onClick={() => setRaiseAmount(Math.min(r.max, Math.max(r.min, Math.round(state.pot * 0.5))))}>½ pot</button>
                                                            <button onClick={() => setRaiseAmount(Math.min(r.max, Math.max(r.min, Math.round(state.pot * 0.75))))}>¾ pot</button>
                                                            <button onClick={() => setRaiseAmount(Math.min(r.max, Math.max(r.min, state.pot)))}>Pot</button>
                                                            <button onClick={() => setRaiseAmount(Math.min(r.max, Math.max(r.min, state.pot * 1.5)))}>1.5× pot</button>
                                                            <button onClick={() => setRaiseAmount(r.max)}>All-in</button>
                                                        </div>
                                                        <input type="range" min={r.min} max={r.max} value={raiseAmount ?? r.min} onChange={e => setRaiseAmount(Number(e.target.value))} />
                                                        <button className="pk-act raise" disabled={!isHumanTurn} onClick={() => { handleAction({ type: 'raise', amount: raiseAmount ?? r.min }); setRaiseOpen(false) }} data-poker-action="raise" data-ux-primary-action>Raise to {formatCredits(raiseAmount ?? r.min)}</button>
                                                    </div>
                                                )
                                            }
                                            return null
                                        })}
                                    </>
                                )}
                            </div>
                        </div>
                        <aside className="poker-sidebar" data-ux-surface="aside">
                            <div className="poker-tabs">
                                <button className={`poker-tab ${tab === 'gto' ? 'active' : ''}`} onClick={() => setTab('gto')}>GTO</button>
                                <button className={`poker-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
                                <button className={`poker-tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>Chat</button>
                            </div>
                            {tab === 'gto' && (
                                <div className="poker-sidebar-body" data-poker-mobile-panel="gto">
                                    <div className="poker-guide-card">
                                        <span>Table brief</span>
                                        <p>Practice-credit 6-max no-limit Hold'em. Use the GTO panel as a study reference, then compare the recommendation with pot odds, stack depth, and opponent style.</p>
                                        <div>
                                            <strong>Cashout</strong>
                                            <em>Returns your stack; mid-hand cashout folds live cards.</em>
                                        </div>
                                    </div>
                                    <GtoPanel state={state} />
                                </div>
                            )}
                            {tab === 'history' && (
                                <div className="poker-sidebar-body" data-poker-mobile-panel="history">
                                    <HandHistoryTab liveState={state} />
                                </div>
                            )}
                            {tab === 'chat' && (
                                <div className="poker-sidebar-body poker-chat" data-poker-mobile-panel="chat">
                                    <h3>Table chat</h3>
                                    <div className="pk-chat-banner">Simulated chat. Bots and you only.</div>
                                    <div className="pk-chat-list">
                                        {chat.map(m => <div key={m.id} className={`pk-msg ${m.user === 'you' ? 'self' : ''}`}><span>{m.user}</span><b>{m.text}</b></div>)}
                                    </div>
                                    <div className="pk-chat-input">
                                        <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder="Say nh..." />
                                        <button onClick={sendChat}>Send</button>
                                    </div>
                                </div>
                            )}
                        </aside>
                    </div>
                </>
            )}
        </div>
    )
}
