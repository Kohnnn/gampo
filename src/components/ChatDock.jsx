import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageCircle, Minus, X, Send, Trophy, BarChart3, Award } from 'lucide-react'
import { useSocial } from '../context/SocialContext'
import { formatCredits } from '../utils/simulationMath'
import StatsPanel from './StatsPanel'
import ProgressPanel from './ProgressPanel'
import './ChatDock.css'

const STATE_KEY = 'gampo_chat_dock_state'
const VALID = new Set(['open', 'minimized', 'closed'])
const VALID_TABS = new Set(['chat', 'race', 'stats', 'progress'])
const GAME_SAFE_PATHS = [
    '/crash',
    '/plinko',
    '/mines',
    '/dice',
    '/limbo',
    '/keno',
    '/wheel',
    '/roulette',
    '/blackjack',
    '/baccarat',
    '/hilo',
    '/sicbo',
    '/videopoker',
    '/war',
    '/tower',
    '/chickencross',
    '/tarot',
    '/cases',
    '/poker',
    '/sportsbook',
    '/sports',
    '/slots',
    '/slots-lobby',
    '/bars',
    '/scarab-spin',
    '/miko-spirit',
    '/ghostblade-strike',
    '/vault-rush',
]

function readInitialState() {
    try {
        const raw = localStorage.getItem(STATE_KEY)
        if (raw && VALID.has(raw)) return raw
    } catch { /* ignore */ }
    return 'minimized'
}

function ChatDock() {
    const location = useLocation()
    const { messages, postMessage, race } = useSocial()
    const [state, setState] = useState(readInitialState)
    const [text, setText] = useState('')
    const [tab, setTab] = useState('stats')
    const [unread, setUnread] = useState(0)
    const lastSeenRef = useRef(messages.length)
    const scrollRef = useRef(null)
    const transientDockRef = useRef(false)
    const routeRef = useRef(null)
    const stateRef = useRef(state)
    const tabRef = useRef(tab)

    useEffect(() => {
        try { localStorage.setItem(STATE_KEY, state) } catch { /* ignore */ }
        const root = document.documentElement
        root.classList.toggle('chat-open', state === 'open')
        root.classList.toggle('chat-minimized', state === 'minimized')
        root.classList.toggle('chat-closed', state === 'closed')
        // Mark messages seen when the dock becomes open with the chat tab.
        if (state === 'open' && tab === 'chat') {
            lastSeenRef.current = messages.length
            setUnread(0)
        }
    }, [state, tab, messages.length])

    useEffect(() => {
        stateRef.current = state
        tabRef.current = tab
    }, [state, tab])

    useEffect(() => {
        const routeKey = location.pathname
        if (routeRef.current && routeRef.current !== routeKey) {
            if (transientDockRef.current && stateRef.current === 'open' && ['stats', 'progress'].includes(tabRef.current)) {
                setState('minimized')
            }
            transientDockRef.current = false
        }
        routeRef.current = routeKey
    }, [location.pathname])

    useEffect(() => {
        const requested = new URLSearchParams(location.search).get('dock')
        if (!requested || !VALID_TABS.has(requested)) return
        setTab(requested)
        setState('open')
        transientDockRef.current = ['stats', 'progress'].includes(requested)
    }, [location.search])

    // Allow other components (e.g. Sidebar Row 3 chat trigger) to open the
    // dock by dispatching a 'gampo:open-chat' event on the document. The
    // detail.tab can request 'chat', 'race', or 'stats'.
    useEffect(() => {
        const onOpen = (e) => {
            const requested = e.detail?.tab
            if (requested && VALID_TABS.has(requested)) setTab(requested)
            transientDockRef.current = ['stats', 'progress'].includes(requested)
            setState('open')
        }
        document.addEventListener('gampo:open-chat', onOpen)
        return () => document.removeEventListener('gampo:open-chat', onOpen)
    }, [])

    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key !== 'Escape') return
            if (stateRef.current === 'open') {
                transientDockRef.current = false
                setState('minimized')
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [])

    // Track unread count when the dock is minimized or on a non-chat tab.
    useEffect(() => {
        const focused = state === 'open' && tab === 'chat'
        if (focused) {
            lastSeenRef.current = messages.length
            setUnread(0)
        } else {
            const delta = Math.max(0, messages.length - lastSeenRef.current)
            setUnread(delta)
        }
    }, [messages, state, tab])

    useEffect(() => {
        if (scrollRef.current && tab === 'chat' && state === 'open') {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, tab, state])

    const send = () => {
        if (!text.trim()) return
        postMessage(text)
        setText('')
    }

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') send()
    }

    const widthClass = useMemo(() => {
        // Wave 21: dock locked to a single width across tabs so switching
        // doesn't visibly reposition the panel.
        return 'w-locked'
    }, [tab])
    const gameSafeClass = state === 'open'
        && ['stats', 'progress'].includes(tab)
        && GAME_SAFE_PATHS.some(path => location.pathname.startsWith(path))
        ? 'game-safe'
        : ''

    if (state === 'closed') {
        return (
            <button className="chat-dock-fab" onClick={() => setState('open')} aria-label="Open chat" data-ux-surface="dock">
                <MessageCircle size={20} />
                {unread > 0 && <span className="chat-dock-unread">{unread > 9 ? '9+' : unread}</span>}
            </button>
        )
    }

    if (state === 'minimized') {
        return (
            <button
                className="chat-dock-mini"
                onClick={() => setState('open')}
                aria-label="Expand chat"
                data-ux-surface="dock"
            >
                <MessageCircle size={14} />
                <span>Chat</span>
                <span className="chat-dock-mini-count">{messages.length}</span>
                {unread > 0 && <span className="chat-dock-unread">{unread > 9 ? '9+' : unread}</span>}
            </button>
        )
    }

    return (
        <aside className={`chat-dock ${widthClass} ${gameSafeClass}`.trim()} data-ux-surface="dock">
            <header className="chat-dock-header">
                <div className="chat-dock-tabs">
                    <button
                        type="button"
                        aria-label="Stats"
                        aria-pressed={tab === 'stats'}
                        className={tab === 'stats' ? 'active' : ''}
                        onClick={() => { transientDockRef.current = false; setTab('stats') }}
                    >
                        <BarChart3 size={14} />
                        <span className="chat-dock-tab-label">Stats</span>
                    </button>
                    <button
                        type="button"
                        aria-label="Progress"
                        aria-pressed={tab === 'progress'}
                        className={tab === 'progress' ? 'active' : ''}
                        onClick={() => { transientDockRef.current = false; setTab('progress') }}
                    >
                        <Award size={14} />
                        <span className="chat-dock-tab-label">Progress</span>
                    </button>
                    <button
                        type="button"
                        aria-label="Chat"
                        aria-pressed={tab === 'chat'}
                        className={tab === 'chat' ? 'active' : ''}
                        onClick={() => { transientDockRef.current = false; setTab('chat') }}
                    >
                        <MessageCircle size={14} />
                        <span className="chat-dock-tab-label">Chat</span>
                    </button>
                    <button
                        type="button"
                        aria-label="Race"
                        aria-pressed={tab === 'race'}
                        className={tab === 'race' ? 'active' : ''}
                        onClick={() => { transientDockRef.current = false; setTab('race') }}
                    >
                        <Trophy size={14} />
                        <span className="chat-dock-tab-label">Race</span>
                    </button>
                </div>
                <div className="chat-dock-controls">
                    <button className="chat-dock-min" onClick={() => setState('minimized')} aria-label="Minimize chat" title="Minimize">
                        <Minus size={14} />
                    </button>
                    <button className="chat-dock-close" onClick={() => setState('closed')} aria-label="Hide chat" title="Hide">
                        <X size={14} />
                    </button>
                </div>
            </header>

            {tab === 'chat' && (
                <>
                    <div className="chat-dock-banner">Virtual players only. Chat is simulated.</div>
                    <div className="chat-dock-list" ref={scrollRef}>
                        {messages.map(msg => (
                            <div key={msg.id} className={`chat-msg chat-msg-${msg.type}`}>
                                <span className="chat-msg-user">{msg.user}</span>
                                <span className="chat-msg-text">{msg.text}</span>
                            </div>
                        ))}
                    </div>
                    <div className="chat-dock-input">
                        <input
                            type="text"
                            placeholder="Say something..."
                            value={text}
                            onChange={event => setText(event.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                        <button className="chat-dock-send" onClick={send} aria-label="Send">
                            <Send size={16} />
                        </button>
                    </div>
                </>
            )}

            {tab === 'race' && (
                <>
                    <div className="chat-dock-banner">Weekly race leaderboard. Virtual opponents.</div>
                    <div className="chat-dock-list">
                        {race.map((player, index) => (
                            <div key={player.id} className={`race-mini ${player.isYou ? 'you' : ''}`}>
                                <span className="race-mini-rank">{index + 1}</span>
                                <span className="race-mini-name">{player.name}{player.isYou && ' (you)'}</span>
                                <span className="race-mini-volume">{formatCredits(player.wagered)}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {tab === 'stats' && (
                <>
                    <div className="chat-dock-banner">Session stats & wagering history.</div>
                    <StatsPanel />
                </>
            )}

            {tab === 'progress' && (
                <>
                    <div className="chat-dock-banner">Challenges, achievements & leaderboard.</div>
                    <ProgressPanel />
                </>
            )}
        </aside>
    )
}

export default ChatDock
