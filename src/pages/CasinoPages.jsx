import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Award, BookOpen, CheckCircle2, Crown, Gift, Lock, Radio, ShieldCheck, Target, Trophy } from 'lucide-react'
import { useCredits } from '../context/CreditContext'
import { gameDefinitions } from '../data/gameDefinitions'
import { liveStudioTables, missions, slotCatalog, sourceNotes, vipLevels } from '../data/casinoCatalog'
import { formatCredits, rolloverProgress } from '../utils/simulationMath'
import { GameGrid } from './HomePage'
import { useRaceData } from '../context/SocialContext'
import { clearRecentRolls, getProvablyFair, getRecentRolls, maskSeed, rotateSeeds, setClientSeed } from '../utils/fairRng'
import { useMissions } from '../hooks/useMissions'
import { useProgress } from '../hooks/useProgress'
import { MISSION_PERIODS, VIP_TIERS, vipTierFor } from '../data/missions'
import '../styles/casino.css'

const MISSION_ROUTES = {
    'daily-spins-10': '/originals',
    'daily-wins-3': '/dice',
    'daily-multi-5': '/limbo',
    'daily-3-games': '/',
    'daily-profit-50': '/blackjack',
    'daily-wagered-250': '/slots',
    'weekly-spins-100': '/originals',
    'weekly-wagered-1000': '/slots',
    'weekly-streak-5': '/mines',
    'weekly-multi-25': '/wheel',
    'weekly-5-games': '/',
    'weekly-bigwin-500': '/crash',
    'lifetime-spins-1000': '/originals',
    'lifetime-wagered-10000': '/slots-lobby',
    'lifetime-multi-100': '/crash',
    'lifetime-games-15': '/',
    'lifetime-games-40': '/',
    'lifetime-wagered-100000': '/slots-lobby',
    'lifetime-multi-500': '/limbo',
}

function missionRouteFor(mission) {
    return MISSION_ROUTES[mission.id] || '/originals'
}

export function OriginalsPage() {
    return (
        <CasinoSection
            kicker="Casino originals"
            title="Originals and arcade classics"
            text="Originals-style games, Xaxino-style arcade mechanics, table games and card decisions — all powered by virtual credits."
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
            title="Slots lobby"
            text="A catalogue-style slot floor with premium titles and progressive jackpots."
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
    const m = useMissions()
    const { addWinnings } = useCredits()
    const [confirmReset, setConfirmReset] = useState(false)

    const grouped = useMemo(() => {
        const map = { daily: [], weekly: [], lifetime: [] }
        for (const mission of m.missions) {
            if (map[mission.period]) map[mission.period].push(mission)
        }
        return map
    }, [m.missions])

    const onClaim = (mission) => {
        const result = m.claim(mission.id)
        if (result?.reward?.credits) {
            addWinnings(result.reward.credits, `Mission: ${mission.name}`)
        }
    }

    return (
        <CasinoSection
            kicker="Practice goals"
            title="Missions"
            text="Complete challenges, earn bonuses and climb the weekly leaderboard for extra rewards."
            icon={<Target size={18} />}
            action={confirmReset ? (
                <span className="casino-action-row">
                    <button className="casino-action danger" onClick={() => { m.reset(); setConfirmReset(false) }}>Confirm reset</button>
                    <button className="casino-action" onClick={() => setConfirmReset(false)}>Cancel</button>
                </span>
            ) : (
                <button className="casino-action" onClick={() => setConfirmReset(true)}>Reset progress</button>
            )}
        >
            <div className="mission-summary-row">
                {(['daily', 'weekly', 'lifetime']).map(period => (
                    <div key={period} className={`mission-summary-card mission-summary-${period}`}>
                        <small>{MISSION_PERIODS[period].label}</small>
                        <strong>{m.summary[period].complete} / {m.summary[period].total}</strong>
                        <span>{m.summary[period].claimed} claimed</span>
                    </div>
                ))}
            </div>

            {(['daily', 'weekly', 'lifetime']).map(period => (
                <div key={period} className="mission-period-block">
                    <h3 className="mission-period-title">{MISSION_PERIODS[period].label} missions</h3>
                    <div className="mission-grid">
                        {grouped[period].map(mission => (
                            <article key={mission.id} className={`mission-card period-${mission.period} ${mission.complete ? 'is-complete' : ''} ${mission.claimed ? 'is-claimed' : ''}`}>
                                <header>
                                    <span>+{mission.reward.credits} credits</span>
                                    {mission.claimed ? <CheckCircle2 size={16} /> : null}
                                </header>
                                <h2>{mission.name}</h2>
                                <p>{mission.detail}</p>
                                <div className="casino-progress"><span style={{ width: `${mission.ratio * 100}%` }} /></div>
                                <footer>
                                    <small>{mission.value} / {mission.target}</small>
                                    <span className="mission-card-actions">
                                        <Link className="mission-play-link" to={missionRouteFor(mission)}>Play</Link>
                                        {mission.claimable ? (
                                            <button className="casino-action primary" onClick={() => onClaim(mission)}>Claim</button>
                                        ) : mission.claimed ? (
                                            <span className="mission-claimed-badge">Claimed</span>
                                        ) : (
                                            <span className="mission-progress-pct">{Math.round(mission.ratio * 100)}%</span>
                                        )}
                                    </span>
                                </footer>
                            </article>
                        ))}
                    </div>
                </div>
            ))}
        </CasinoSection>
    )
}

export function VipPage() {
    const m = useMissions()
    const wagered = m.stats.lifetime.wagered
    const { current, next } = vipTierFor(wagered)
    const progress = next ? Math.min(1, (wagered - current.wager) / Math.max(1, next.wager - current.wager)) : 1

    return (
        <CasinoSection
            kicker="Learning tiers"
            title="VIP Lab"
            text="Tiers track simulated wager volume across all games. Perks are cosmetic — no real-world value."
            icon={<Crown size={18} />}
            action={<Link to="/originals" className="casino-action primary" data-ux-primary-action>Practice games</Link>}
        >
            <div className="vip-headline">
                <div>
                    <small>Current tier</small>
                    <strong>{current.label}</strong>
                </div>
                <div>
                    <small>Lifetime wagered</small>
                    <strong>{formatCredits(wagered)}</strong>
                </div>
                {next ? (
                    <div>
                        <small>Next tier</small>
                        <strong>{next.label}</strong>
                        <em>{formatCredits(Math.max(0, next.wager - wagered))} to go</em>
                    </div>
                ) : (
                    <div><small>Top tier reached</small><strong>{current.label}</strong></div>
                )}
            </div>

            <div className="vip-progress-bar"><span style={{ width: `${progress * 100}%` }} /></div>

            <div className="vip-panel">
                {VIP_TIERS.map(tier => {
                    const unlocked = wagered >= tier.wager
                    return (
                        <article key={tier.id} className={`vip-tier vip-tier-${tier.id} ${unlocked ? 'unlocked' : ''} ${current.id === tier.id ? 'current' : ''}`}>
                            <header>
                                <h2>{tier.label}</h2>
                                {unlocked ? <CheckCircle2 size={16} /> : <Lock size={14} />}
                            </header>
                            <p>{tier.perk}</p>
                            <small>{formatCredits(tier.wager)} wagered</small>
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
            kicker="Educational probability"
            title="Probability Lab"
            text="Educational probability material for exploring game rules, probability, and house-edge concepts with local practice credits."
            icon={<BookOpen size={18} />}
            action={<Link to="/originals" className="casino-action primary" data-ux-primary-action>Explore practice games</Link>}
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
            text="Every bet, return, top-up and reset is stored locally in the browser."
            icon={<Activity size={18} />}
            action={<button className="casino-action" onClick={resetBalance}>Reset Balance</button>}
        >
            <div className="activity-table">
                {transactions.length === 0 ? (
                    <div className="activity-empty">
                        <img src="/assets/games/lobby/hero-arcade.png" alt="" aria-hidden="true" />
                        <h3>No activity yet</h3>
                        <p>Every bet, return, top-up and reset will land here. Try a quick game to seed the log.</p>
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
            description: 'A single-player casino experience: clear quests, earn bonuses, and climb the VIP tiers.',
            cta: 'Start Missions',
            link: '/missions',
            accent: '#00e701',
            emoji: '\uD83C\uDFAE',
            gradient: 'linear-gradient(135deg, rgba(0, 231, 1, 0.34), rgba(7, 24, 18, 0.95))',
            art: '/assets/games/promo/promo-edge.png',
        },
        {
            id: 'edge-101',
            title: 'VIP Rewards Week',
            kicker: 'VIP',
            badge: 'Open now',
            description: 'Earn rakeback on every wager. Climb the VIP tiers for exclusive bonuses and priority support.',
            cta: 'Open Rakeback',
            link: '/learn',
            accent: '#00e701',
            emoji: '\uD83D\uDCCA',
            gradient: 'linear-gradient(135deg, rgba(0, 231, 1, 0.32), rgba(0, 95, 0, 0.92))',
            art: '/assets/games/promo/promo-edge.png',
        },
        {
            id: 'race-week',
            title: 'Weekly Race',
            kicker: 'Race',
            badge: 'Live',
            description: 'Climb the leaderboard. Earn bonus credits based on your weekly wager volume.',
            cta: 'View Race',
            link: '/race',
            accent: '#ffcf5a',
            emoji: '\uD83C\uDFC6',
            gradient: 'linear-gradient(135deg, rgba(255, 207, 90, 0.32), rgba(120, 70, 0, 0.95))',
            art: '/assets/games/promo/promo-race.png',
        },
        {
            id: 'verify-day',
            title: 'Provably Fair',
            kicker: 'Verify',
            badge: 'New',
            description: 'Inspect your seed/nonce, rotate seeds, and replay every recent roll.',
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
            link: '/sportsbook',
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
                        <Link to={p.link} className="casino-action primary" data-ux-primary-action>{p.cta}</Link>
                    </article>
                ))}
            </div>
            <p className="muted" style={{ marginTop: 14 }}>
                GamPo is a probability simulator. No real money, accounts, or payouts. Play responsibly.
            </p>
        </CasinoSection>
    )
}

function CasinoSection({ kicker, title, text, icon, action, children }) {
    return (
        <div className="casino-page" data-ux-surface="stage">
            <section className="section-hero" data-ux-surface="stage">
                <div>
                    <span className="casino-kicker">{icon}{kicker}</span>
                    <h1>{title}</h1>
                    <p>{text}</p>
                </div>
                {action}
            </section>
            <div data-ux-surface="stage">{children}</div>
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
