import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCredits } from '../../context/CreditContext'
import { useAudio } from '../../audio/AudioProvider'
import { formatCredits } from '../../utils/simulationMath'
import { applyAction, createInitialState, dealNext, legalActions, startHand } from '../../poker/engine/Game'
import HeuristicBot from '../../poker/bots/HeuristicBot'
import { preloadGto } from '../../poker/gto/loader'
import GtoPanel from './GtoPanel'
import HandHistoryTab, { recordHand } from './HandHistoryTab'
import './PokerGame.css'

const BUY_INS = [200, 500, 1000, 10000]
const BOT_PERSONAS = [
    { name: 'lucky_lemur', avatar: 1, aggression: 0.52, chat: ['glgl', 'small pot poker', 'river saved me'] },
    { name: 'binary_bee', avatar: 2, aggression: 0.38, chat: ['range says call', 'too many bluffs?', 'checking back'] },
    { name: 'oddsmonkey', avatar: 3, aggression: 0.68, chat: ['pot odds say yes', 'thin value?', 'priced in'] },
    { name: 'crash_capt', avatar: 4, aggression: 0.82, chat: ['pressure spot', 'big sizing', 'no fear'] },
    { name: 'plinko_pat', avatar: 5, aggression: 0.47, chat: ['bouncy flop', 'one time', 'variance lol'] },
    { name: 'turn_barrel', avatar: 1, aggression: 0.74, chat: ['barrel card', 'polar now', 'turn is mine'] },
    { name: 'nit_nova', avatar: 2, aggression: 0.29, chat: ['not defending that', 'discipline', 'folding range'] },
    { name: 'river_raccoon', avatar: 3, aggression: 0.58, chat: ['river spot', 'show me', 'thin call'] },
    { name: 'solver_sam', avatar: 4, aggression: 0.61, chat: ['mixed node', 'spr matters', 'balanced enough'] },
    { name: 'bubble_ace', avatar: 5, aggression: 0.43, chat: ['survive first', 'ladder brain', 'no punt'] },
]
const BOT_AVATARS = [1, 2, 3, 4, 5].map(i => `/assets/games/poker/poker-avatar-${i}.png`)
const SB = 1
const BB = 2

function suitGlyph(s) { return s === 'h' ? '\u2665' : s === 'd' ? '\u2666' : s === 's' ? '\u2660' : '\u2663' }
function suitClass(s) { return (s === 'h' || s === 'd') ? 'red' : 'black' }
function rankPretty(r) { return r === 'T' ? '10' : r }

function samplePersonas() {
    return BOT_PERSONAS
        .map(p => ({ p, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .slice(0, 5)
        .map(({ p }, i) => ({ ...p, id: `bot${i}`, avatar: BOT_AVATARS[p.avatar - 1] }))
}

function botLine(persona, decision, state) {
    const pot = state?.pot || 0
    if (decision.type === 'raise') return decision.amount > pot ? 'overbet pressure' : persona.chat[Math.floor(Math.random() * persona.chat.length)]
    if (decision.type === 'fold') return ['not defending that', 'too expensive', 'live to fight'][Math.floor(Math.random() * 3)]
    if (decision.type === 'call') return ['priced in', 'call and see', 'sticky one'][Math.floor(Math.random() * 3)]
    return ['check it', 'pot control', 'free card?'][Math.floor(Math.random() * 3)]
}

function PokerCard({ card, hidden }) {
    if (!card) return <div className="pk-card empty">--</div>
    if (hidden) return <div className="pk-card hidden"><div className="pk-card-back" /></div>
    const r = card[0]; const s = card[1]
    return (
        <div className={`pk-card ${suitClass(s)}`}>
            <span className="pk-rank">{rankPretty(r)}</span>
            <span className="pk-suit">{suitGlyph(s)}</span>
        </div>
    )
}

export default function PokerGame() {
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
    const [tab, setTab] = useState('gto')
    const [buyIn, setBuyIn] = useState(200)
    const [bubbles, setBubbles] = useState({})
    const stepTimer = useRef(null)
    const lastRecordedShowdown = useRef(null)
    // Hero stack at the start of the current hand. Used to derive accurate
    // per-hand profit at showdown (final stack − snapshot).
    const heroStartStackRef = useRef(0)
    const lastHandStartHistoryLen = useRef(-1)

    useEffect(() => {
        // Lazy preload GTO data once mounted so the panel doesn't block on first open.
        preloadGto()
    }, [])

    // Snapshot hero stack on each new hand. We detect "new hand" by watching
    // for the engine resetting community + history at the start of preflop.
    useEffect(() => {
        if (!state || !state.players?.length) return
        const hero = state.players.find(p => p.isHuman)
        if (!hero) return
        const street = state.street
        const handStartedNow = street === 'preflop' && state.community.length === 0 && lastHandStartHistoryLen.current !== state.history.length
        if (handStartedNow && hero.lastAction === null) {
            // Hero stack here already had blinds posted; add hero.putIn to recover the
            // pre-blind starting stack.
            heroStartStackRef.current = hero.stack + (hero.putIn || 0)
            lastHandStartHistoryLen.current = state.history.length
            lastRecordedShowdown.current = null
        }
    }, [state])

    const startSession = () => {
        if (balance < buyIn) {
            showToast('error', `Need ${formatCredits(buyIn)}`, 'Add credits to sit down')
            return
        }
        if (!placeBet(buyIn, 'Poker buy-in')) return
        const personas = samplePersonas()
        const seats = [
            { id: 'you', name: 'you', stack: buyIn, isHuman: true },
            ...personas.map(p => ({ id: p.id, name: p.name, stack: buyIn, avatar: p.avatar, persona: p })),
        ]
        const init = createInitialState({ players: seats, sb: SB, bb: BB, buttonIndex: 4 })
        setState(startHand(init))
        setSeated(true)
        playSound('deal')
    }

    useEffect(() => {
        if (!state) return
        if (state.street === 'showdown') return
        // QA v4 watchdog: if there's no live actor mid-hand, force-advance.
        if (state.toAct < 0) {
            const stepTimerId = window.setTimeout(() => {
                setState(prev => {
                    if (!prev || prev.street === 'showdown' || prev.toAct >= 0) return prev
                    return applyAction(prev, { type: 'check' }) // benign no-op kicks the engine
                })
            }, 250)
            return () => window.clearTimeout(stepTimerId)
        }
        const p = state.players[state.toAct]
        if (!p || p.isHuman) return
        // Bot acts after a short think time. Tracked per-turn so a stale
        // cleanup can't clobber the pending bot.
        const seatId = `${state.toAct}-${state.history.length}`
        const decideTimer = window.setTimeout(() => {
            const persona = p.persona || { aggression: 0.5, chat: ['nice'] }
            const decision = HeuristicBot({ state, seatIndex: state.toAct, aggression: persona.aggression })
            setState(prev => applyAction(prev, decision))
            playSound(decision.type === 'fold' ? 'click' : decision.type === 'raise' ? 'flip' : 'tick')
            if (Math.random() < 0.46) {
                const text = botLine(persona, decision, state)
                setChat(prev => [...prev.slice(-30), { id: Date.now(), user: p.name, text }])
                setBubbles(prev => ({ ...prev, [p.id]: text }))
                window.setTimeout(() => setBubbles(prev => {
                    const next = { ...prev }
                    delete next[p.id]
                    return next
                }), 2800)
            }
        }, 700)
        // QA v4 escape hatch: if a bot's turn doesn't resolve in 5s for any
        // reason, auto-fold them so the table can never deadlock.
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
        stepTimer.current = { decideTimer, escapeTimer, seatId }
        return () => {
            window.clearTimeout(decideTimer)
            window.clearTimeout(escapeTimer)
        }
    }, [state, playSound])

    const acts = state ? legalActions(state) : []
    const human = state ? state.players.find(p => p.isHuman) : null
    const isHumanTurn = state && state.toAct >= 0 && state.players[state.toAct]?.isHuman

    // Record settled hand to history (once per showdown).
    useEffect(() => {
        if (!state || state.street !== 'showdown' || !human) return
        const sigKey = state.history.length + ':' + state.winners.map(w => `${w.id}:${w.share}`).join(',')
        if (lastRecordedShowdown.current === sigKey) return
        lastRecordedShowdown.current = sigKey
        const heroWin = state.winners.find(w => w.id === human.id)
        // Hand profit = final hero stack (post-payout) minus the snapshot stack.
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
    }, [state, human])

    const handleAction = (act) => {
        if (!isHumanTurn) return
        playSound(act.type === 'fold' ? 'click' : act.type === 'raise' ? 'flip' : 'tick')
        setState(prev => applyAction(prev, act))
    }

    const nextHand = () => {
        if (!state) return
        const dead = state.players.filter(p => p.stack <= 0).length === state.players.length - 1
        if (dead) {
            showToast('win', 'You broke the table', `Stack ${formatCredits(human?.stack || 0)}`)
            const stack = human?.stack || 0
            if (stack > 0) addWinnings(stack, 'Poker cashout')
            setState(null); setSeated(false); return
        }
        if ((human?.stack || 0) <= 0) {
            showToast('loss', 'Busted', 'Buy-in lost')
            setState(null); setSeated(false); return
        }
        setState(prev => dealNext(prev))
    }

    const cashOut = () => {
        if (!state || !human) return
        if (human.stack > 0) addWinnings(human.stack, 'Poker cashout')
        showToast('bet', 'Left the table', `Cashed out ${formatCredits(human.stack || 0)}`)
        setState(null); setSeated(false)
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

    return (
        <div className="poker-page">
            <div className="poker-titlebar">
                <Link to="/" className="poker-back">‹ Hub</Link>
                <h1>Live Poker (No-Limit Hold'em, 6-max)</h1>
                <div className="poker-balance"><span>Balance</span><strong>{formatCredits(balance)}</strong></div>
            </div>
            {!seated && (
                <div className="poker-lobby">
                    <h2>Choose buy-in</h2>
                    <p>Sit at a 6-handed table with five randomized bot personas. Practice credits only. No cash value.</p>
                    <div className="poker-buyin-options">
                        {BUY_INS.map(amount => (
                            <button key={amount} className={buyIn === amount ? 'active' : ''} disabled={balance < amount} onClick={() => setBuyIn(amount)}>{formatCredits(amount)}</button>
                        ))}
                    </div>
                    <button className="poker-buyin" disabled={balance < buyIn} onClick={startSession}>Sit Down {formatCredits(buyIn)}</button>
                </div>
            )}
            {seated && state && (
                <div className="poker-layout">
                    <div className="poker-table">
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
                                        className={`pk-seat seat-${i} ${p.status} ${i === state.toAct ? 'on-turn' : ''} ${i === state.buttonIndex ? 'has-button' : ''}`}>
                                        {p.avatar ? <img className="pk-avatar" src={p.avatar} alt="" /> : <div className="pk-avatar pk-you">YOU</div>}
                                        <div className="pk-seat-info">
                                            <span className="pk-name">{p.name}</span>
                                            <span className="pk-stack">{formatCredits(p.stack)}</span>
                                            {p.lastAction && <span className="pk-last">{p.lastAction}</span>}
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
                                        {i === state.buttonIndex && <span className="pk-button-chip">D</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="pk-actions">
                            {state.street === 'showdown' ? (
                                <>
                                    <div className="pk-winners">
                                        {state.winners.map((w, i) => (
                                            <div key={i}>{w.id} won {formatCredits(w.share)}{w.hand ? ` · ${w.hand}` : ''}</div>
                                        ))}
                                    </div>
                                    <button className="pk-act primary" onClick={nextHand}>Next hand</button>
                                    <button className="pk-act" onClick={cashOut}>Cash out</button>
                                </>
                            ) : (
                                <>
                                    {acts.map(a => {
                                        if (a.type === 'fold') return <button key={a.type} className="pk-act fold" disabled={!isHumanTurn} onClick={() => handleAction({ type: 'fold' })}>Fold</button>
                                        if (a.type === 'check') return <button key={a.type} className="pk-act check" disabled={!isHumanTurn} onClick={() => handleAction({ type: 'check' })}>Check</button>
                                        if (a.type === 'call') return <button key={a.type} className="pk-act call" disabled={!isHumanTurn} onClick={() => handleAction({ type: 'call' })}>Call {formatCredits(a.amount)}</button>
                                        if (a.type === 'raise') {
                                            const r = a
                                            return (
                                                <div key={a.type} className="pk-raise">
                                                    <div className="pk-raise-presets">
                                                        <button onClick={() => setRaiseAmount(Math.min(r.max, Math.max(r.min, Math.round(state.pot * 0.5))))}>½ pot</button>
                                                        <button onClick={() => setRaiseAmount(Math.min(r.max, Math.max(r.min, Math.round(state.pot * 0.75))))}>¾ pot</button>
                                                        <button onClick={() => setRaiseAmount(Math.min(r.max, Math.max(r.min, state.pot)))}>Pot</button>
                                                        <button onClick={() => setRaiseAmount(r.max)}>Max</button>
                                                    </div>
                                                    <input type="range" min={r.min} max={r.max} value={raiseAmount ?? r.min} onChange={e => setRaiseAmount(Number(e.target.value))} />
                                                    <button className="pk-act raise" disabled={!isHumanTurn} onClick={() => handleAction({ type: 'raise', amount: raiseAmount ?? r.min })}>Raise to {formatCredits(raiseAmount ?? r.min)}</button>
                                                </div>
                                            )
                                        }
                                        return null
                                    })}
                                </>
                            )}
                        </div>
                    </div>
                    <aside className="poker-sidebar">
                        <div className="poker-tabs">
                            <button className={`poker-tab ${tab === 'gto' ? 'active' : ''}`} onClick={() => setTab('gto')}>GTO</button>
                            <button className={`poker-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
                            <button className={`poker-tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>Chat</button>
                        </div>
                        {tab === 'gto' && (
                            <div className="poker-sidebar-body">
                                <GtoPanel state={state} />
                            </div>
                        )}
                        {tab === 'history' && (
                            <div className="poker-sidebar-body">
                                <HandHistoryTab liveState={state} />
                            </div>
                        )}
                        {tab === 'chat' && (
                            <div className="poker-sidebar-body poker-chat">
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
            )}
        </div>
    )
}
