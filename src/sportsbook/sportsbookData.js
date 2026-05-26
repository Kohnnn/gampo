import {
    BarChart3,
    CircleDot,
    Dumbbell,
    Flame,
    Gamepad2,
    Goal,
    Medal,
    ShieldCheck,
    Trophy,
} from 'lucide-react'
import { createSeededRandom } from '../utils/simulationMath'
import { deVigProbabilities, roundCurrency } from './sportsbookMath'

export const SPORTS = [
    { id: 'soccer', label: 'Soccer', icon: Goal, sortOrder: 10, groups: ['all-sports'], liveCount: 0 },
    { id: 'tennis', label: 'Tennis', icon: CircleDot, sortOrder: 20, groups: ['all-sports'], liveCount: 0 },
    { id: 'cricket', label: 'Cricket', icon: Dumbbell, sortOrder: 30, groups: ['all-sports'], liveCount: 0 },
    { id: 'basketball', label: 'Basketball', icon: CircleDot, sortOrder: 40, groups: ['all-sports'], liveCount: 0 },
    { id: 'ice-hockey', label: 'Ice Hockey', icon: Dumbbell, sortOrder: 50, groups: ['all-sports'], liveCount: 0 },
    { id: 'baseball', label: 'Baseball', icon: CircleDot, sortOrder: 60, groups: ['all-sports'], liveCount: 0 },
    { id: 'football', label: 'American Football', icon: Dumbbell, sortOrder: 65, groups: ['all-sports'], liveCount: 0 },
    { id: 'dota-2', label: 'Dota 2', icon: Gamepad2, sortOrder: 70, groups: ['all-esports'], liveCount: 0 },
    { id: 'horse-racing', label: 'Horse Racing', icon: Medal, sortOrder: 80, groups: ['all-racing'], liveCount: 0 },
    { id: 'cs2', label: 'CS2', icon: Gamepad2, sortOrder: 90, groups: ['all-esports'], liveCount: 0 },
    { id: 'valorant', label: 'Valorant', icon: Gamepad2, sortOrder: 95, groups: ['all-esports'], liveCount: 0 },
    { id: 'league-of-legends', label: 'League of Legends', icon: Gamepad2, sortOrder: 100, groups: ['all-esports'], liveCount: 0 },
]

export const LEAGUES = [
    { id: 'soccer-england', sportId: 'soccer', region: 'Europe', country: 'England', label: 'Premier Practice League' },
    { id: 'soccer-europe', sportId: 'soccer', region: 'Europe', country: 'International', label: 'Continental Cup' },
    { id: 'tennis-paris', sportId: 'tennis', region: 'Europe', country: 'France', label: 'Paris Clay Practice' },
    { id: 'cricket-world', sportId: 'cricket', region: 'World', country: 'International', label: 'Twenty20 Practice Cup' },
    { id: 'basketball-usa', sportId: 'basketball', region: 'North America', country: 'USA', label: 'Hoops Association' },
    { id: 'ice-hockey-usa', sportId: 'ice-hockey', region: 'North America', country: 'USA', label: 'Northern Ice League' },
    { id: 'baseball-usa', sportId: 'baseball', region: 'North America', country: 'USA', label: 'Diamond Series' },
    { id: 'football-usa', sportId: 'football', region: 'North America', country: 'USA', label: 'Gridiron Practice' },
    { id: 'dota-major', sportId: 'dota-2', region: 'Esports', country: 'Global', label: 'Ancient Arena Major' },
    { id: 'racing-europe', sportId: 'horse-racing', region: 'Europe', country: 'Ireland', label: 'Greenfield Races' },
    { id: 'cs2-league', sportId: 'cs2', region: 'Esports', country: 'Global', label: 'Tactical Masters' },
    { id: 'valorant-league', sportId: 'valorant', region: 'Esports', country: 'Global', label: 'Valorant Feed' },
    { id: 'lol-league', sportId: 'league-of-legends', region: 'Esports', country: 'Global', label: 'Rift Invitational' },
]

export const PROMO_CARDS = [
    {
        id: 'practice-shield',
        label: 'New Feature',
        title: 'Practice Shield',
        copy: 'Add 3+ legs and compare the protected return.',
        action: 'View Info',
        icon: ShieldCheck,
    },
    {
        id: 'clay-slate',
        label: 'Promotion',
        title: 'Clay Court Slate',
        copy: 'Live tennis scenarios with simulated tiebreak swings.',
        action: 'Practice Slate',
        icon: Trophy,
    },
    {
        id: 'race-day',
        label: 'Boost',
        title: 'Race Day Boost',
        copy: 'Synthetic racing prices with suspended-runner states.',
        action: 'Practice Race',
        icon: Flame,
    },
]

export const OUTRIGHTS = [
    ['Spain Practice XI', 5.75],
    ['France Practice XI', 6.1],
    ['England Practice XI', 7],
    ['Brazil Practice XI', 9],
    ['Argentina Practice XI', 9.4],
    ['Portugal Practice XI', 11],
    ['Germany Practice XI', 14],
    ['Netherlands Practice XI', 21],
]

const EVENT_BLUEPRINTS = [
    ['soccer', 'soccer-england', 'Harbor United', 'River City FC', 'prematch', ['top', 'popular']],
    ['soccer', 'soccer-england', 'Northbridge FC', 'Lakeside Town', 'live', ['live', 'top']],
    ['soccer', 'soccer-europe', 'Capital Albion', 'Westport SC', 'prematch', ['popular']],
    ['tennis', 'tennis-paris', 'Ari Chen', 'Mika Soto', 'live', ['live', 'top']],
    ['tennis', 'tennis-paris', 'Nora Vance', 'Elena Park', 'prematch', ['popular']],
    ['cricket', 'cricket-world', 'Metro Strikers', 'Harbor Kings', 'prematch', ['starting-soon']],
    ['basketball', 'basketball-usa', 'San Aurelio Spurs', 'Oklahoma City Waves', 'prematch', ['top']],
    ['basketball', 'basketball-usa', 'Cleveland Guards', 'New York Towers', 'live', ['live', 'popular']],
    ['ice-hockey', 'ice-hockey-usa', 'Northern Frost', 'Capital Rangers', 'prematch', ['starting-soon']],
    ['baseball', 'baseball-usa', 'Yokohama Densetsu', 'Tokyo Swallows', 'prematch', ['popular']],
    ['dota-2', 'dota-major', 'Ancient Falcons', 'Legacy Core', 'live', ['live', 'popular']],
    ['horse-racing', 'racing-europe', 'Minnie Harbor', 'Star Anise', 'prematch', ['top', 'racing']],
    ['cs2', 'cs2-league', 'Tactical North', 'Inferno Five', 'prematch', ['popular']],
    ['league-of-legends', 'lol-league', 'Rift Academy', 'Dragon Coast', 'live', ['live']],
]

const MARKET_TEMPLATES = {
    soccer: ['Winner', 'Total Goals', 'Handicap', 'Both Teams To Score', 'Correct Score'],
    tennis: ['Winner', 'Total Games', 'Set Handicap', 'Correct Score'],
    cricket: ['Winner', 'Total Runs', 'Top Batter'],
    basketball: ['Winner', 'Spread', 'Total Points', 'Player Props'],
    'ice-hockey': ['Winner', 'Puck Line', 'Total Goals'],
    baseball: ['Winner', 'Run Line', 'Total Runs'],
    football: ['Winner', 'Spread', 'Total Points', 'Player Props'],
    'dota-2': ['Winner', 'Map Handicap', 'Total Maps'],
    'horse-racing': ['Fixed Win', 'Place', 'Top 3 Finish'],
    cs2: ['Winner', 'Map Handicap', 'Total Maps'],
    valorant: ['Winner', 'Map Handicap', 'Total Maps'],
    'league-of-legends': ['Winner', 'Map Handicap', 'Total Kills'],
}

function slugify(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function startsAtFor(index, status) {
    const date = new Date()
    date.setMinutes(0, 0, 0)
    if (status === 'live') {
        date.setMinutes(date.getMinutes() - 25 - index)
    } else {
        date.setHours(date.getHours() + 2 + (index % 8))
        date.setMinutes(index % 2 ? 30 : 0)
    }
    return date.toISOString()
}

function priceFromProbability(probability, margin, random) {
    const moved = probability * margin * (0.985 + random() * 0.03)
    return roundCurrency(1 / Math.max(0.05, moved))
}

function makeSelection({ eventId, marketId, label, side, odds, previousOdds, trueProbability, random, suspended = false, boosted = false }) {
    const diff = Number(odds) - Number(previousOdds)
    return {
        id: `${eventId}-${marketId}-${slugify(label)}`,
        eventId,
        marketId,
        label,
        side,
        decimalOdds: roundCurrency(odds),
        previousOdds: roundCurrency(previousOdds),
        suspended,
        boosted,
        trueProbability,
        source: 'synthetic',
        status: suspended ? 'suspended' : diff > 0.015 ? 'odds-up' : diff < -0.015 ? 'odds-down' : 'available',
        pulseKey: Math.floor(random() * 100000),
    }
}

function buildWinnerGroup(eventId, sportId, home, away, random, index) {
    const hasDraw = ['soccer', 'ice-hockey'].includes(sportId)
    const drawProbability = hasDraw ? 0.21 + random() * 0.08 : 0
    const homeProbability = 0.38 + random() * 0.18
    const awayProbability = Math.max(0.18, 1 - drawProbability - homeProbability)
    const raw = hasDraw ? [homeProbability, drawProbability, awayProbability] : [homeProbability, awayProbability]
    const total = raw.reduce((sum, value) => sum + value, 0)
    const trueProbabilities = raw.map(value => value / total)
    const margin = 1.045 + random() * 0.045
    const labels = hasDraw ? [home, 'Draw', away] : [home, away]

    const selections = labels.map((label, idx) => {
        const odds = priceFromProbability(trueProbabilities[idx], margin, random)
        const previousOdds = roundCurrency(odds * (0.96 + random() * 0.08))
        return makeSelection({
            eventId,
            marketId: 'winner',
            label,
            side: idx === 0 ? 'home' : hasDraw && idx === 1 ? 'draw' : 'away',
            odds,
            previousOdds,
            trueProbability: trueProbabilities[idx],
            random,
            suspended: index % 11 === 4 && idx === 1,
            boosted: index % 5 === 0 && idx === 0,
        })
    })

    return {
        id: 'winner',
        label: sportId === 'horse-racing' ? 'Fixed Win' : hasDraw ? '1x2' : 'Winner',
        displayMode: 'compact',
        collapsed: false,
        selections,
    }
}

function buildSecondaryGroup(eventId, sportId, groupLabel, random, index) {
    const marketId = slugify(groupLabel)
    const labelsByMarket = {
        'Total Goals': ['Over 2.5', 'Under 2.5'],
        'Both Teams To Score': ['Yes', 'No'],
        'Correct Score': ['1-0', '1-1', '2-1', '0-1'],
        Handicap: ['Home -0.5', 'Away +0.5'],
        'Total Games': ['Over 21.5', 'Under 21.5'],
        'Set Handicap': ['Home -1.5', 'Away +1.5'],
        'Total Runs': ['Over 8.5', 'Under 8.5'],
        'Top Batter': ['Home opener', 'Away opener'],
        Spread: ['Home -3.5', 'Away +3.5'],
        'Total Points': ['Over 219.5', 'Under 219.5'],
        'Player Props': ['Home guard 20+', 'Away forward 20+'],
        'Puck Line': ['Home -1.5', 'Away +1.5'],
        'Run Line': ['Home -1.5', 'Away +1.5'],
        'Map Handicap': ['Home -1.5', 'Away +1.5'],
        'Total Maps': ['Over 2.5', 'Under 2.5'],
        'Top 3 Finish': ['Runner A', 'Runner B', 'Runner C'],
        Place: ['Runner A place', 'Runner B place', 'Runner C place'],
        'Total Kills': ['Over 27.5', 'Under 27.5'],
    }
    const labels = labelsByMarket[groupLabel] || ['Over', 'Under']
    const baseOdds = labels.map((_, idx) => 1.65 + random() * 2.4 + idx * 0.15)
    const probabilities = deVigProbabilities(baseOdds)
    const selections = labels.map((label, idx) => {
        const odds = roundCurrency(baseOdds[idx])
        const previousOdds = roundCurrency(odds * (0.965 + random() * 0.07))
        return makeSelection({
            eventId,
            marketId,
            label,
            side: slugify(label),
            odds,
            previousOdds,
            trueProbability: probabilities[idx],
            random,
            suspended: index % 9 === 3 && idx === 0,
            boosted: index % 7 === 2 && idx === labels.length - 1,
        })
    })
    return { id: marketId, label: groupLabel, displayMode: labels.length > 2 ? 'grid' : 'rows', collapsed: index % 4 === 0, selections }
}

export function buildSyntheticSportsbookData(seed = new Date().toISOString().slice(0, 10)) {
    const random = createSeededRandom(`gampo-sportsbook-${seed}`)
    const events = EVENT_BLUEPRINTS.map(([sportId, leagueId, home, away, status, tags], index) => {
        const eventId = `${sportId}-${slugify(home)}-${slugify(away)}`
        const startsAt = startsAtFor(index, status)
        const score = status === 'live'
            ? { home: Math.floor(random() * 4), away: Math.floor(random() * 4) }
            : null
        const groups = MARKET_TEMPLATES[sportId].map((label, groupIndex) => (
            groupIndex === 0
                ? buildWinnerGroup(eventId, sportId, home, away, random, index)
                : buildSecondaryGroup(eventId, sportId, label, random, index + groupIndex)
        ))
        return {
            id: eventId,
            sportId,
            leagueId,
            region: LEAGUES.find(league => league.id === leagueId)?.region || 'World',
            startsAt,
            status,
            clock: status === 'live' ? `${7 + index}'` : '',
            period: status === 'live' ? (index % 2 ? '2nd Half' : '1st Half') : '',
            home,
            away,
            participants: [home, away],
            score,
            liveStats: {
                attack: Math.floor(42 + random() * 42),
                possession: Math.floor(45 + random() * 16),
                tickets: Math.floor(4200 + random() * 16000),
            },
            popularity: Math.floor(6200 + random() * 19000),
            tags,
            marketGroups: groups,
            source: 'synthetic',
        }
    })

    const leagues = LEAGUES.map(league => {
        const leagueEvents = events.filter(event => event.leagueId === league.id)
        return {
            ...league,
            liveCount: leagueEvents.filter(event => event.status === 'live').length,
            eventCount: leagueEvents.length,
        }
    })
    const sports = SPORTS.map(sport => {
        const sportEvents = events.filter(event => event.sportId === sport.id)
        return {
            ...sport,
            liveCount: sportEvents.filter(event => event.status === 'live').length,
            eventCount: sportEvents.length,
        }
    })
    return { sports, leagues, events }
}

export function driftSyntheticEvents(events, tick = 1) {
    const random = createSeededRandom(`gampo-sportsbook-drift-${tick}`)
    return events.map(event => ({
        ...event,
        clock: event.status === 'live' && event.clock
            ? `${Math.min(90, Number.parseInt(event.clock, 10) + 1 || 8)}'`
            : event.clock,
        score: event.status === 'live' && event.score && tick % 4 === 0 && random() > 0.72
            ? { ...event.score, [random() > 0.5 ? 'home' : 'away']: event.score[random() > 0.5 ? 'home' : 'away'] + 1 }
            : event.score,
        marketGroups: event.marketGroups.map(group => ({
            ...group,
            selections: group.selections.map(selection => {
                if (selection.source !== 'synthetic') return selection
                const direction = random() > 0.52 ? 1 : -1
                const change = direction * (0.01 + random() * 0.05)
                const decimalOdds = roundCurrency(Math.max(1.05, selection.decimalOdds + change))
                const suspended = random() > 0.965 || selection.status === 'locked'
                return {
                    ...selection,
                    previousOdds: selection.decimalOdds,
                    decimalOdds,
                    suspended,
                    status: suspended ? 'suspended' : decimalOdds > selection.decimalOdds ? 'odds-up' : decimalOdds < selection.decimalOdds ? 'odds-down' : 'available',
                    pulseKey: tick,
                }
            }),
        })),
    }))
}

export const SHELF_ICONS = {
    top: Trophy,
    live: Flame,
    popular: BarChart3,
}
