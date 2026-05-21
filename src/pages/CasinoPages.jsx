import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, BookOpen, Crown, Gift, Radio, ShieldCheck, Target, Trophy } from 'lucide-react'
import { useCredits } from '../context/CreditContext'
import { gameDefinitions } from '../data/gameDefinitions'
import { liveStudioTables, missions, slotCatalog, sourceNotes, vipLevels } from '../data/casinoCatalog'
import { formatCredits, rolloverProgress } from '../utils/simulationMath'
import { GameGrid } from './HomePage'
import { useRaceData } from '../context/SocialContext'
import { clearRecentRolls, getProvablyFair, getRecentRolls, maskSeed, rotateSeeds, setClientSeed } from '../utils/fairRng'
import '../styles/casino.css'

export function OriginalsPage() {
    return (
        <CasinoSection
            kicker="Casino originals"
            title="Originals and arcade classics"
            text="Originals-style games, Xaxino-style arcade mechanics, table trainers and card decisions using practice credits only."
            icon={<Radio size={18} />}
        >
            <GameGrid games={gameDefinitions} />
        </CasinoSection>
    )
}

export function SlotsLobbyPage() {
    return (
        <CasinoSection
            kicker="Slots catalogue"
            title="Slots simulator lobby"
            text="A catalogue-style slot floor inspired by the example Laravel casino lists. Each tile opens the local slots simulator."
            icon={<Activity size={18} />}
        >
            <GameGrid games={slotCatalog} />
        </CasinoSection>
    )
}

export function LiveStudioPage() {
    return (
        <CasinoSection
            kicker="Synthetic live tables"
            title="Live Studio"
            text="Broadcast-style table simulations with fake viewers and pacing pressure, routed into local probability games."
            icon={<Radio size={18} />}
        >
            <div className="studio-grid">
                {liveStudioTables.map(table => (
                    <Link key={table.id} to={table.gamePath} className="studio-table">
                        <span>{table.host}</span>
                        <h2>{table.name}</h2>
                        <p>{table.lesson}</p>
                        <div>
                            <b>{table.viewers} viewers</b>
                            <b>{table.pace}</b>
                        </div>
                    </Link>
                ))}
            </div>
        </CasinoSection>
    )
}

export function MissionsPage() {
    return (
        <CasinoSection
            kicker="Practice goals"
            title="Missions"
            text="Learning missions replace bonuses. They reward disciplined practice badges, not cash value."
            icon={<Target size={18} />}
        >
            <div className="mission-grid">
                {missions.map(mission => (
                    <article key={mission.id} className="mission-card">
                        <span>{mission.reward}</span>
                        <h2>{mission.title}</h2>
                        <p>{mission.target}</p>
                        <div className="casino-progress"><span style={{ width: `${mission.progress * 100}%` }} /></div>
                    </article>
                ))}
            </div>
        </CasinoSection>
    )
}

export function VipPage() {
    const { transactions } = useCredits()
    const wagered = transactions.filter(item => item.type === 'bet').reduce((sum, item) => sum + Math.abs(item.amount || 0), 0)

    return (
        <CasinoSection
            kicker="Learning tiers"
            title="VIP Lab"
            text="Progress tiers are based on simulated wagering volume and unlock analysis prompts only."
            icon={<Crown size={18} />}
        >
            <div className="vip-panel">
                <div>
                    <span>Simulated volume</span>
                    <strong>{formatCredits(wagered)}</strong>
                </div>
                {vipLevels.map(level => {
                    const progress = rolloverProgress({ wagered, required: Math.max(1, level.threshold) })
                    return (
                        <article key={level.tier} className={wagered >= level.threshold ? 'unlocked' : ''}>
                            <h2>{level.tier}</h2>
                            <p>{level.perk}</p>
                            <div className="casino-progress"><span style={{ width: `${progress * 100}%` }} /></div>
                            <small>{formatCredits(level.threshold)} simulated volume</small>
                        </article>
                    )
                })}
            </div>
        </CasinoSection>
    )
}

export function LearnPage() {
    return (
        <CasinoSection
            kicker="Risk academy"
            title="Probability lessons"
            text="A compact reference desk for RTP, edge, volatility, hit frequency, bankroll risk and sportsbook margin."
            icon={<BookOpen size={18} />}
        >
            <div className="lesson-grid">
                {sourceNotes.map(note => (
                    <article key={note.name}>
                        <span>{note.source}</span>
                        <h2>{note.name}</h2>
                        <p>{note.use}</p>
                    </article>
                ))}
                {gameDefinitions.slice(0, 8).map(game => (
                    <article key={game.id}>
                        <span>{game.category}</span>
                        <h2>{game.name}</h2>
                        <p>{game.lesson}</p>
                    </article>
                ))}
            </div>
        </CasinoSection>
    )
}

export function ActivityPage() {
    const { transactions, resetBalance } = useCredits()

    return (
        <CasinoSection
            kicker="Local ledger"
            title="Activity"
            text="Every practice bet, return, top-up and reset is stored locally in the browser."
            icon={<Activity size={18} />}
            action={<button className="casino-action" onClick={resetBalance}>Reset lab</button>}
        >
            <div className="activity-table">
                {transactions.length === 0 ? (
                    <div className="activity-empty">
                        <img src="/assets/games/lobby/hero-arcade.png" alt="" aria-hidden="true" />
                        <h3>No activity yet</h3>
                        <p>Every practice bet, return, top-up and reset will land here. Try a quick game to seed the log.</p>
                        <div className="activity-empty-actions">
                            <Link to="/dice" className="casino-action primary">Try Dice</Link>
                            <Link to="/originals" className="casino-action">Browse Originals</Link>
                        </div>
                    </div>
                ) : transactions.map(item => (
                    <div key={item.id}>
                        <span>{item.timestamp.toLocaleString()}</span>
                        <strong>{item.label || item.type}</strong>
                        <b className={(item.amount || 0) >= 0 ? 'positive' : 'negative'}>
                            {(item.amount || 0) >= 0 ? '+' : ''}{formatCredits(item.amount || 0)}
                        </b>
                    </div>
                ))}
            </div>
        </CasinoSection>
    )
}

export function PromotionsPage() {
    const promotions = [
        {
            id: 'solo-casino-school',
            title: 'Solo Casino School',
            kicker: 'Campaign',
            badge: 'New path',
            description: 'A single-player casino campaign: clear quests, learn why outcomes happen, and unlock study badges with practice credits only.',
            cta: 'Start Missions',
            link: '/missions',
            accent: '#00e701',
            emoji: '\uD83C\uDFAE',
            gradient: 'linear-gradient(135deg, rgba(0, 231, 1, 0.34), rgba(7, 24, 18, 0.95))',
            art: '/assets/games/promo/promo-edge.png',
        },
        {
            id: 'edge-101',
            title: 'EV 101 Workshop',
            kicker: 'Education',
            badge: 'Open now',
            description: 'Walk through dice, limbo, and wheel side-by-side. Compare expected value at the same RTP across different volatility shapes.',
            cta: 'Open Risk Academy',
            link: '/learn',
            accent: '#00e701',
            emoji: '\uD83D\uDCCA',
            gradient: 'linear-gradient(135deg, rgba(0, 231, 1, 0.32), rgba(0, 95, 0, 0.92))',
            art: '/assets/games/promo/promo-edge.png',
        },
        {
            id: 'race-week',
            title: 'Practice Race Week',
            kicker: 'Race',
            badge: 'Simulated',
            description: 'Climb the simulated leaderboard. Opponents are not real players. Prizes are practice badges only.',
            cta: 'View Race',
            link: '/race',
            accent: '#ffcf5a',
            emoji: '\uD83C\uDFC1',
            gradient: 'linear-gradient(135deg, rgba(255, 207, 90, 0.32), rgba(120, 70, 0, 0.95))',
            art: '/assets/games/promo/promo-race.png',
        },
        {
            id: 'verify-day',
            title: 'Provably Fair Drop-in',
            kicker: 'Verify',
            badge: 'New',
            description: 'Inspect your seed/nonce, rotate seeds, and replay every recent roll. Educational only.',
            cta: 'Open Verify',
            link: '/verify',
            accent: '#58a6ff',
            emoji: '\uD83D\uDD12',
            gradient: 'linear-gradient(135deg, rgba(88, 166, 255, 0.32), rgba(20, 50, 130, 0.95))',
            art: '/assets/games/promo/promo-verify.png',
        },
        {
            id: 'poker-lab',
            title: 'Poker Persona Lab',
            kicker: 'Live Poker',
            badge: 'Interactive',
            description: 'Play against randomized bot personalities, read table talk, then compare your line against the GTO chart.',
            cta: 'Open Poker',
            link: '/poker',
            accent: '#ff7ab6',
            emoji: '\u2660',
            gradient: 'linear-gradient(135deg, rgba(255, 122, 182, 0.32), rgba(70, 18, 54, 0.95))',
            art: '/assets/games/promo/promo-race.png',
        },
        {
            id: 'sports-lab',
            title: 'Sportsbook EV Lab',
            kicker: 'Sportsbook',
            badge: 'Sim feed',
            description: 'Build singles, parlays, and 2-of-N system tickets and compare model probability vs implied odds.',
            cta: 'Open Sportsbook',
            link: '/sports',
            accent: '#7c5cff',
            emoji: '\u26BD',
            gradient: 'linear-gradient(135deg, rgba(124, 92, 255, 0.32), rgba(50, 25, 120, 0.95))',
            art: '/assets/games/promo/promo-sports.png',
        },
    ]

    return (
        <CasinoSection
            kicker="Practice promotions"
            title="Promotions"
            text="Educational events only. No cash value, no deposit, no entry fee. Prizes are simulated badges."
            icon={<Gift size={18} />}
        >
            <div className="promotions-grid">
                {promotions.map(p => (
                    <article
                        key={p.id}
                        className="promotion-card"
                        style={{
                            '--accent': p.accent,
                            backgroundImage: p.art
                                ? `${p.gradient}, url(${p.art})`
                                : p.gradient,
                        }}
                    >
                        <span className="promotion-emoji" aria-hidden="true">{p.emoji}</span>
                        <span className="promotion-badge">{p.badge}</span>
                        <small className="promotion-kicker">{p.kicker}</small>
                        <h2>{p.title}</h2>
                        <p>{p.description}</p>
                        <Link to={p.link} className="casino-action primary">{p.cta}</Link>
                    </article>
                ))}
            </div>
            <p className="muted" style={{ marginTop: 14 }}>
                Reminder: GamPo runs on practice credits. There are no payouts, deposits, or transfers.
            </p>
        </CasinoSection>
    )
}

function CasinoSection({ kicker, title, text, icon, action, children }) {
    return (
        <div className="casino-page">
            <section className="section-hero">
                <div>
                    <span className="casino-kicker">{icon}{kicker}</span>
                    <h1>{title}</h1>
                    <p>{text}</p>
                </div>
                {action}
            </section>
            {children}
        </div>
    )
}

export function VerifyPage() {
    const { transactions } = useCredits()
    const [pf, setPf] = useState(() => getProvablyFair())
    const [recent, setRecent] = useState(() => getRecentRolls())
    const [draftClient, setDraftClient] = useState(pf.clientSeed)

    useEffect(() => {
        const id = window.setInterval(() => {
            setPf(getProvablyFair())
            setRecent(getRecentRolls())
        }, 1500)
        return () => window.clearInterval(id)
    }, [])

    const onApplyClient = () => {
        const next = setClientSeed(draftClient)
        setPf(next)
    }

    const onRotate = () => {
        const next = rotateSeeds(draftClient)
        setPf(next)
        setDraftClient(next.clientSeed)
        setRecent(getRecentRolls())
    }

    const onClear = () => {
        clearRecentRolls()
        setRecent([])
    }

    const recentTransactions = transactions.filter(item => item.type === 'bet' || item.type === 'win').slice(0, 12)

    return (
        <CasinoSection
            kicker="Provably fair lab"
            title="Verify recent simulations"
            text="Each play uses a server seed, your client seed, and a nonce. Rotating the seeds reveals the previous server seed so past plays can be re-derived."
            icon={<ShieldCheck size={18} />}
        >
            <div className="verify-toolbar">
                <div>
                    <span>Server seed (hashed)</span>
                    <code>{maskSeed(pf.serverSeed)}</code>
                </div>
                <div>
                    <span>Previous server seed (revealed)</span>
                    <code>{pf.previousServerSeed || '— rotate to reveal —'}</code>
                </div>
                <div>
                    <span>Nonce</span>
                    <code>{pf.nonce}</code>
                </div>
                <label className="verify-client">
                    <span>Client seed</span>
                    <input value={draftClient} onChange={event => setDraftClient(event.target.value)} />
                    <button onClick={onApplyClient}>Apply</button>
                </label>
                <div className="verify-actions">
                    <button className="casino-action" onClick={onRotate}>Rotate seeds</button>
                    <button className="casino-action" onClick={onClear}>Clear log</button>
                </div>
            </div>

            <h3 className="verify-section-title">Recent rolls</h3>
            <p className="muted verify-hint">
                Each game logs its own <code>gameId</code> as you play. The list reflects everything in this browser since the last <em>Clear log</em>; play a few rounds across different games to mix the log.
            </p>
            <div className="verify-grid">
                {recent.length === 0 ? (
                    <p className="muted">Play a wired game (Dice, Limbo, Coin Flip, Wheel, RPS, Guess, Color, Hi-Lo) to populate the verification log.</p>
                ) : recent.map(item => (
                    <article key={item.id} className="verify-card">
                        <span>{item.gameId} · n {item.nonce}</span>
                        <code>roll {item.roll.toFixed(8)}</code>
                        <small>{new Date(item.ts).toLocaleTimeString()}</small>
                        <small className="verify-composite">{item.composite}</small>
                    </article>
                ))}
            </div>

            <h3 className="verify-section-title">Recent settled transactions</h3>
            <div className="verify-grid">
                {recentTransactions.length === 0 ? (
                    <p className="muted">No transactions yet.</p>
                ) : recentTransactions.map(tx => (
                    <article key={tx.id} className="verify-card">
                        <span>{tx.label || tx.type}</span>
                        <code>{tx.id}</code>
                        <small>{(tx.timestamp instanceof Date ? tx.timestamp : new Date(tx.timestamp)).toLocaleTimeString()}</small>
                        <strong className={(tx.amount || 0) >= 0 ? 'positive' : 'negative'}>
                            {(tx.amount || 0) >= 0 ? '+' : ''}{formatCredits(tx.amount || 0)}
                        </strong>
                    </article>
                ))}
            </div>
        </CasinoSection>
    )
}

export function RacePage() {
    const race = useRaceData()

    return (
        <CasinoSection
            kicker="Practice race"
            title="Weekly Wager Race"
            text="A simulated leaderboard. Opponents are not real players. The race uses your local wagered volume and synthetic competitors only."
            icon={<Trophy size={18} />}
        >
            <div className="race-board">
                {race.map((player, index) => {
                    const avatar = player.isYou
                        ? null
                        : `/assets/games/poker/poker-avatar-${(index % 5) + 1}.png`
                    return (
                        <article key={player.id} className={`race-row ${player.isYou ? 'you' : ''}`}>
                            <span className="race-rank">{index + 1}</span>
                            {avatar ? (
                                <img className="race-avatar" src={avatar} alt="" aria-hidden="true" />
                            ) : (
                                <span className="race-avatar race-avatar-you" aria-hidden="true">YOU</span>
                            )}
                            <strong>{player.name}{player.isYou && ' (you)'}</strong>
                            <span className="race-volume">{formatCredits(player.wagered)}</span>
                            <span className="race-prize">{player.prize}</span>
                        </article>
                    )
                })}
            </div>
            <p className="muted" style={{ marginTop: 12 }}>
                Prizes are simulated badges. No cash value, no transfers, no payout claims.
            </p>
        </CasinoSection>
    )
}

