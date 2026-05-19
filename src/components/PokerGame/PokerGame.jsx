import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCredits } from '../../context/CreditContext'
import { useAudio } from '../../audio/AudioProvider'
import { formatCredits } from '../../utils/simulationMath'
import { applyAction, createInitialState, dealNext, legalActions, startHand } from '../../poker/engine/Game'
import HeuristicBot from '../../poker/bots/HeuristicBot'
import './PokerGame.css'

const BOT_NAMES = ['lucky_lemur', 'binary_bee', 'oddsmonkey', 'crash_capt', 'plinko_pat']
const BOT_AVATARS = [1, 2, 3, 4, 5].map(i => `/assets/games/poker/poker-avatar-${i}.png`)
const SB = 1
const BB = 2

function suitGlyph(s) { return s === 'h' ? '\u2665' : s === 'd' ? '\u2666' : s === 's' ? '\u2660' : '\u2663' }
function suitClass(s) { return (s === 'h' || s === 'd') ? 'red' : 'black' }
function rankPretty(r) { return r === 'T' ? '10' : r }

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
    const stepTimer = useRef(null)

    const startSession = () => {
        if (balance < 200) {
            showToast('error', 'Need 200 GC', 'Add credits to sit down')
            return
        }
        if (!placeBet(200, 'Poker buy-in')) return
        const seats = [
            { id: 'you', name: 'you', stack: 200, isHuman: true },
            ...BOT_NAMES.map((n, i) => ({ id: `bot${i}`, name: n, stack: 200, avatar: BOT_AVATARS[i] })),
        ]
        const init = createInitialState({ players: seats, sb: SB, bb: BB, buttonIndex: 4 })
        setState(startHand(init))
        setSeated(true)
        playSound('deal')
    }

    useEffect(() => {
        if (!state) return
        if (state.toAct < 0) return
        const p = state.players[state.toAct]
        if (!p || p.isHuman) return
        // Bot acts after a short think time
        if (stepTimer.current) window.clearTimeout(stepTimer.current)
        stepTimer.current = window.setTimeout(() => {
            const decision = HeuristicBot({ state, seatIndex: state.toAct, aggression: 0.5 + (state.toAct * 0.05) % 0.4 })
            setState(prev => applyAction(prev, decision))
            playSound(decision.type === 'fold' ? 'click' : decision.type === 'raise' ? 'flip' : 'tick')
            // Bot chatter
            if (Math.random() < 0.18) {
                const lines = ['nice', 'check', 'call', 'min raise', 'all in lol', 'gl', 'sigh', 'one time']
                setChat(prev => [...prev.slice(-30), { id: Date.now(), user: p.name, text: lines[Math.floor(Math.random() * lines.length)] }])
            }
        }, 700)
        return () => { if (stepTimer.current) window.clearTimeout(stepTimer.current) }
    }, [state, playSound])

    const acts = state ? legalActions(state) : []
    const human = state ? state.players.find(p => p.isHuman) : null
    const isHumanTurn = state && state.toAct >= 0 && state.players[state.toAct]?.isHuman

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
                    <h2>Buy-in 200 GC</h2>
                    <p>Sit at a 6-handed table with 5 simulated bots. Practice credits only. No cash value.</p>
                    <button className="poker-buyin" disabled={balance < 200} onClick={startSession}>Sit Down</button>
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
                    <aside className="poker-chat">
                        <h3>Table chat</h3>
                        <div className="pk-chat-banner">Simulated chat. Bots and you only.</div>
                        <div className="pk-chat-list">
                            {chat.map(m => <div key={m.id} className={`pk-msg ${m.user === 'you' ? 'self' : ''}`}><span>{m.user}</span><b>{m.text}</b></div>)}
                        </div>
                        <div className="pk-chat-input">
                            <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder="Say nh..." />
                            <button onClick={sendChat}>Send</button>
                        </div>
                    </aside>
                </div>
            )}
        </div>
    )
}
