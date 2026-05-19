import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useCredits } from './CreditContext'

const SocialContext = createContext(null)

const fakeChatters = [
    'lucky_lemur', 'binary_bee', 'oddsmonkey', 'crash_capt', 'plinko_pat',
    'mines_max', 'tower_tia', 'dice_doc', 'kenoking', 'baccarat_b',
    'roulette_r', 'limbo_lia', 'wheel_wiz', 'chicken_chad', 'edge_eva',
]

const seedChat = [
    { user: 'edge_eva', text: 'Reminder: this is fake credits only, no cash value', flair: 'mod' },
    { user: 'oddsmonkey', text: 'Plinko 16 rows feels safer but the EV is the same' },
    { user: 'dice_doc', text: 'Try lower win chance for higher payout' },
    { user: 'crash_capt', text: 'gg I cashed at 3.2x' },
    { user: 'lucky_lemur', text: 'Tower row 4 got me again' },
    { user: 'binary_bee', text: 'Fair odds for 50% should be 2.00, but house adds vig' },
    { user: 'mines_max', text: 'How many mines do you usually run?' },
    { user: 'plinko_pat', text: 'Low risk plinko wins more often, fewer big hits' },
    { user: 'kenoking', text: 'Quick pick saves time' },
    { user: 'wheel_wiz', text: 'High risk preset is brutal lol' },
]

const fakeOpponents = [
    { id: 'fake-1', name: 'lucky_lemur', baseWagered: 9100 },
    { id: 'fake-2', name: 'binary_bee', baseWagered: 7800 },
    { id: 'fake-3', name: 'oddsmonkey', baseWagered: 6450 },
    { id: 'fake-4', name: 'crash_capt', baseWagered: 5800 },
    { id: 'fake-5', name: 'plinko_pat', baseWagered: 5200 },
    { id: 'fake-6', name: 'mines_max', baseWagered: 4400 },
    { id: 'fake-7', name: 'tower_tia', baseWagered: 3900 },
    { id: 'fake-8', name: 'dice_doc', baseWagered: 3100 },
    { id: 'fake-9', name: 'kenoking', baseWagered: 2750 },
    { id: 'fake-10', name: 'wheel_wiz', baseWagered: 1900 },
]

const racePrizes = [
    'Diamond badge', 'Gold badge', 'Silver badge', 'Bronze badge',
    'Top 10 badge', 'Top 10 badge', 'Top 10 badge', 'Top 10 badge', 'Top 10 badge', 'Top 10 badge',
    'Top 20 badge',
]

function pick(array) {
    return array[Math.floor(Math.random() * array.length)]
}

function makeMessage(user, text, type = 'chat') {
    return {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        user,
        text,
        type,
        time: new Date(),
    }
}

export function SocialProvider({ children }) {
    const { transactions } = useCredits()
    const [messages, setMessages] = useState(() => seedChat.map(item => makeMessage(item.user, item.text, item.flair === 'mod' ? 'system' : 'chat')))
    const tickRef = useRef(0)

    useEffect(() => {
        const id = window.setInterval(() => {
            tickRef.current += 1
            const user = pick(fakeChatters)
            const text = pick([
                'gg',
                'nice hit',
                'rough one',
                'Plinko low risk for me today',
                'crash went 12x last round',
                'I keep picking lower on hilo lol',
                'roulette red streak',
                'mines 5 always',
                'tower run was clean',
                'wheel high preset is wild',
                'remember EV is per round, not session',
                'session bankroll only, fake credits',
                'take a break if tilted',
                'limbo target 2x is the sweet spot',
            ])
            setMessages(prev => [...prev.slice(-60), makeMessage(user, text)])
        }, 6000)
        return () => window.clearInterval(id)
    }, [])

    const postMessage = useCallback((text) => {
        const trimmed = String(text || '').trim()
        if (!trimmed) return
        setMessages(prev => [...prev.slice(-80), makeMessage('you', trimmed, 'self')])
    }, [])

    const wagered = useMemo(() => (
        transactions.filter(item => item.type === 'bet').reduce((sum, item) => sum + Math.abs(item.amount || 0), 0)
    ), [transactions])

    const race = useMemo(() => {
        const drift = (tickRef.current * 7) % 100
        const opponents = fakeOpponents.map((player, index) => ({
            id: player.id,
            name: player.name,
            wagered: Math.max(0, player.baseWagered + drift * (index % 3)),
            isYou: false,
        }))
        const you = { id: 'you', name: 'you', wagered: wagered, isYou: true }
        const all = [...opponents, you].sort((a, b) => b.wagered - a.wagered)
        return all.slice(0, 11).map((player, index) => ({
            ...player,
            prize: racePrizes[index] || 'Practice badge',
        }))
    }, [wagered])

    const value = { messages, postMessage, race }

    return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>
}

export function useSocial() {
    const ctx = useContext(SocialContext)
    if (!ctx) throw new Error('useSocial must be used inside SocialProvider')
    return ctx
}

export function useRaceData() {
    return useSocial().race
}
