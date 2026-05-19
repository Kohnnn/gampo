import { useEffect, useRef, useState } from 'react'
import { MessageCircle, X, Send, Trophy } from 'lucide-react'
import { useSocial } from '../context/SocialContext'
import { formatCredits } from '../utils/simulationMath'
import './ChatDock.css'

function ChatDock() {
    const { messages, postMessage, race } = useSocial()
    const [open, setOpen] = useState(true)
    const [text, setText] = useState('')
    const [tab, setTab] = useState('chat')
    const scrollRef = useRef(null)

    useEffect(() => {
        if (scrollRef.current && tab === 'chat') {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, tab])

    const send = () => {
        if (!text.trim()) return
        postMessage(text)
        setText('')
    }

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') send()
    }

    return (
        <>
            {!open && (
                <button className="chat-dock-fab" onClick={() => setOpen(true)} aria-label="Open chat">
                    <MessageCircle size={20} />
                </button>
            )}
            {open && (
                <aside className="chat-dock">
                    <header className="chat-dock-header">
                        <div className="chat-dock-tabs">
                            <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
                                <MessageCircle size={14} /> Chat
                            </button>
                            <button className={tab === 'race' ? 'active' : ''} onClick={() => setTab('race')}>
                                <Trophy size={14} /> Race
                            </button>
                        </div>
                        <button className="chat-dock-close" onClick={() => setOpen(false)} aria-label="Hide chat">
                            <X size={14} />
                        </button>
                    </header>

                    {tab === 'chat' && (
                        <>
                            <div className="chat-dock-banner">Simulated chat. Fake credits, fake users, no money.</div>
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
                                    placeholder="Type to simulate..."
                                    value={text}
                                    onChange={event => setText(event.target.value)}
                                    onKeyDown={handleKeyDown}
                                />
                                <button onClick={send} aria-label="Send">
                                    <Send size={14} />
                                </button>
                            </div>
                        </>
                    )}

                    {tab === 'race' && (
                        <>
                            <div className="chat-dock-banner">Practice race. Opponents are simulated.</div>
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
                </aside>
            )}
        </>
    )
}

export default ChatDock
