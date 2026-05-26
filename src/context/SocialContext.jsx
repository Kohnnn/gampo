import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useCredits } from './CreditContext'

const SocialContext = createContext(null)

// Wave 28: deeper simulated player roster with personas. Each persona biases
// the chat templates that user picks from + their race wager profile.
export const fakePlayers = [
    { id: 'fake-1',  name: 'lucky_lemur',  persona: 'whale',     baseWagered: 24800 },
    { id: 'fake-2',  name: 'binary_bee',   persona: 'analyst',   baseWagered: 12400 },
    { id: 'fake-3',  name: 'oddsmonkey',   persona: 'analyst',   baseWagered: 10200 },
    { id: 'fake-4',  name: 'crash_capt',   persona: 'gambler',   baseWagered: 8800 },
    { id: 'fake-5',  name: 'plinko_pat',   persona: 'cautious',  baseWagered: 7600 },
    { id: 'fake-6',  name: 'mines_max',    persona: 'gambler',   baseWagered: 6900 },
    { id: 'fake-7',  name: 'tower_tia',    persona: 'streaker',  baseWagered: 5400 },
    { id: 'fake-8',  name: 'dice_doc',     persona: 'analyst',   baseWagered: 4900 },
    { id: 'fake-9',  name: 'kenoking',     persona: 'cautious',  baseWagered: 3800 },
    { id: 'fake-10', name: 'wheel_wiz',    persona: 'gambler',   baseWagered: 3200 },
    { id: 'fake-11', name: 'limbo_lia',    persona: 'whale',     baseWagered: 14600 },
    { id: 'fake-12', name: 'baccarat_b',   persona: 'streaker',  baseWagered: 6100 },
    { id: 'fake-13', name: 'roulette_r',   persona: 'gambler',   baseWagered: 4400 },
    { id: 'fake-14', name: 'edge_eva',     persona: 'mod',       baseWagered: 8200 },
    { id: 'fake-15', name: 'chicken_chad', persona: 'cautious',  baseWagered: 2700 },
    { id: 'fake-16', name: 'flip_flo',     persona: 'streaker',  baseWagered: 3450 },
    { id: 'fake-17', name: 'sicbo_sid',    persona: 'analyst',   baseWagered: 5800 },
    { id: 'fake-18', name: 'rps_rex',      persona: 'gambler',   baseWagered: 2100 },
]

export const personaTemplates = {
    whale: [
        'just dropped 5k on mines lol',
        'hit a 47x on dice fake credits but i felt that',
        'auto plinko 100 balls running rn',
        'thinking of buying the mansion super bonus',
        'turbo spinning slot factory at max bet',
    ],
    analyst: [
        'reminder this is fake credits with EV-shaped variance',
        '99% RTP dice still has 1% house edge over time',
        'plinko 16 rows = same EV as 8 rows, just lower hit rate',
        'fair odds for 50% are 2.00, anything less = vig',
        'limbo target 2x has ~49.5% hit at 99% RTP',
        'cluster pays > line pays for low volatility chases',
        'sample size matters: 100 rounds is barely a signal',
    ],
    gambler: [
        'all in on red',
        'thats it, switching to dice',
        'just one more round',
        'i can feel a multiplier coming',
        'crash went 33x last round, i missed it',
        'gonna chase it back',
        'riding the streak',
    ],
    cautious: [
        'half my bet now, building bankroll slowly',
        'only autoplay 10 with stop on big win',
        'taking a break, profit secured',
        'keno 4 spots is the sweet spot for me',
        'tower easy mode only',
        'cashing at 1.5x every time',
    ],
    streaker: [
        '4 in a row on flip!',
        'this baccarat shoe is breaking my brain',
        'tower run was clean lvl 7',
        'just landed back to back wilds',
        'free spin retrigger, lets go',
    ],
    mod: [
        'reminder: GamPo Lab is fake credits, no real money',
        'use the Stats tab to track your session',
        'tilted? hit reset balance and walk away',
        'check out the Risk Academy for EV explainers',
    ],
}

const personaBaseTempo = {
    whale: 4500,
    analyst: 8500,
    gambler: 5500,
    cautious: 11000,
    streaker: 7000,
    mod: 22000,
}

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

const racePrizes = [
    'Diamond badge', 'Gold badge', 'Silver badge', 'Bronze badge',
    'Top 10 badge', 'Top 10 badge', 'Top 10 badge', 'Top 10 badge', 'Top 10 badge', 'Top 10 badge',
    'Top 20 badge', 'Top 20 badge',
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

function pickPersonaSpeaker() {
    return pick(fakePlayers)
}

function tempoFor(persona) {
    const base = personaBaseTempo[persona] || 7000
    return base * (0.8 + Math.random() * 0.5) // ±20-30% jitter
}

export function SocialProvider({ children }) {
    const { transactions } = useCredits()
    const [messages, setMessages] = useState(() => seedChat.map(item => makeMessage(item.user, item.text, item.flair === 'mod' ? 'system' : 'chat')))
    const tickRef = useRef(0)
    const nextChatTimer = useRef(null)

    useEffect(() => {
        let cancelled = false
        const schedule = () => {
            if (cancelled) return
            const speaker = pickPersonaSpeaker()
            const templates = personaTemplates[speaker.persona] || personaTemplates.gambler
            const text = pick(templates)
            const type = speaker.persona === 'mod' ? 'system' : 'chat'
            setMessages(prev => [...prev.slice(-60), makeMessage(speaker.name, text, type)])
            tickRef.current += 1
            const delay = tempoFor(speaker.persona)
            nextChatTimer.current = window.setTimeout(schedule, delay)
        }
        nextChatTimer.current = window.setTimeout(schedule, 4500)
        return () => {
            cancelled = true
            if (nextChatTimer.current) window.clearTimeout(nextChatTimer.current)
        }
    }, [])

    const postMessage = useCallback((text) => {
        const trimmed = String(text || '').trim()
        if (!trimmed) return
        setMessages(prev => [...prev.slice(-80), makeMessage('you', trimmed, 'self')])
        // Wave 28: ~30% chance a sim player reacts to your message after a beat.
        if (Math.random() < 0.3) {
            const reactor = pickPersonaSpeaker()
            const reactions = [
                'nice', 'rough', 'gg', 'lol same', 'try plinko low', 'cashout earlier',
                'EV is the same', 'tilt-mode activated', 'one more',
            ]
            window.setTimeout(() => {
                setMessages(prev => [...prev.slice(-80), makeMessage(reactor.name, pick(reactions))])
            }, 1500 + Math.random() * 2500)
        }
    }, [])

    const wagered = useMemo(() => (
        transactions.filter(item => item.type === 'bet').reduce((sum, item) => sum + Math.abs(item.amount || 0), 0)
    ), [transactions])

    const race = useMemo(() => {
        const drift = (tickRef.current * 13) % 100
        const opponents = fakePlayers.map((player, index) => ({
            id: player.id,
            name: player.name,
            persona: player.persona,
            wagered: Math.max(0, player.baseWagered + drift * (index % 5) + (player.persona === 'whale' ? drift * 4 : 0)),
            isYou: false,
        }))
        const you = { id: 'you', name: 'you', wagered, isYou: true, persona: 'you' }
        const all = [...opponents, you].sort((a, b) => b.wagered - a.wagered)
        return all.slice(0, 12).map((player, index) => ({
            ...player,
            prize: racePrizes[index] || 'Practice badge',
        }))
    }, [wagered, messages])

    const value = { messages, postMessage, race, players: fakePlayers }

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
