import { SPORTS } from './sportsbookData'

const VIEW_SLUGS = new Map([
    ['live', { view: 'live' }],
    ['starting', { view: 'starting' }],
    ['starting-soon', { view: 'starting' }],
    ['all', { view: 'all' }],
    ['my-bets', { view: 'my-bets' }],
])

const VIEW_PATHS = {
    home: '/sportsbook',
    live: '/sportsbook/live',
    starting: '/sportsbook/starting',
    all: '/sportsbook/all',
    'my-bets': '/sportsbook/my-bets',
}

const SPORT_IDS = new Set(SPORTS.map(sport => sport.id))

export function parseSportsbookRoute(pathname = '/sportsbook') {
    const [, root = '', slug = ''] = String(pathname).split('/')
    if (root !== 'sportsbook' && root !== 'sports') return { view: 'home', sportId: null, eventId: null }
    if (!slug) return { view: 'home', sportId: null, eventId: null }
    const normalized = slug.toLowerCase()
    if (VIEW_SLUGS.has(normalized)) return { ...VIEW_SLUGS.get(normalized), sportId: null, eventId: null }
    if (SPORT_IDS.has(normalized)) return { view: 'sport', sportId: normalized, eventId: null }
    return { view: 'home', sportId: null, eventId: null }
}

export function sportsbookPathForView(viewState = {}) {
    if (viewState.view === 'sport' && viewState.sportId) return `/sportsbook/${viewState.sportId}`
    return VIEW_PATHS[viewState.view] || VIEW_PATHS.home
}

export function legacySportsbookPath(pathname = '/sports') {
    const suffix = String(pathname).replace(/^\/sports\b/, '')
    return `/sportsbook${suffix || ''}`
}
