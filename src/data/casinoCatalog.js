import { gameDefinitions, sportsbookDefinition } from './gameDefinitions'

export const casinoSections = [
    { id: 'lobby', label: 'Lobby', path: '/', icon: 'layout' },
    { id: 'originals', label: 'Originals', path: '/originals', icon: 'spark' },
    { id: 'slots', label: 'Slots', path: '/slots-lobby', icon: 'slots' },
    { id: 'live', label: 'Live Studio', path: '/live', icon: 'broadcast' },
    { id: 'sports', label: 'Sportsbook', path: '/sports', icon: 'trophy' },
    { id: 'missions', label: 'Missions', path: '/missions', icon: 'target' },
    { id: 'vip', label: 'VIP Lab', path: '/vip', icon: 'crown' },
    { id: 'learn', label: 'Risk Academy', path: '/learn', icon: 'book' },
    { id: 'activity', label: 'Activity', path: '/activity', icon: 'history' },
]

export const sourceNotes = [
    {
        name: 'Originals-style shell',
        source: 'root app and originals clone reference',
        use: 'Compact dark side navigation, practice balance header, originals game surfaces.',
    },
    {
        name: 'Xaxino arcade assets',
        source: 'example/xaxino/assets/templates/basic',
        use: 'Dice, coin, rock-paper-scissors, card and slot imagery adapted into React simulators.',
    },
    {
        name: 'Laravel casino lobby patterns',
        source: 'example/laravel-social-gaming-lite-12 and opensource-casino-v10',
        use: 'Large catalogue sections, provider rows, missions, VIP progression, activity-led shell.',
    },
]

export const lobbyStats = [
    { label: 'Playable labs', value: gameDefinitions.length },
    { label: 'Practice balance', value: 'Local' },
    { label: 'Cash value', value: 'None' },
    { label: 'Math panels', value: 'Every game' },
]

export const featuredCollections = [
    {
        id: 'originals',
        title: 'GamPo Originals',
        description: 'Crash, Plinko, Mines, Dino, Dice, Limbo, Keno, Wheel and other probability-first games.',
        path: '/originals',
        accent: '#00e701',
    },
    {
        id: 'xaxino-classics',
        title: 'Example Arcade Classics',
        description: 'Coin flip, rock-paper-scissors, guess number and card decisions adapted from Xaxino-style mechanics.',
        path: '/originals?collection=classic',
        accent: '#ffcf5a',
    },
    {
        id: 'sports',
        title: 'Sportsbook Lab',
        description: 'Synthetic fixtures with fair odds, vig, overround and ticket settlement.',
        path: '/sports',
        accent: '#58a6ff',
    },
]

export const liveStudioTables = [
    {
        id: 'roulette-live',
        name: 'Roulette Studio',
        gamePath: '/roulette',
        host: 'Sim Host A',
        viewers: 128,
        pace: '45s rounds',
        lesson: 'Fast table cadence raises emotional pressure before probability changes.',
    },
    {
        id: 'blackjack-live',
        name: 'Blackjack Trainer Table',
        gamePath: '/blackjack',
        host: 'Sim Host B',
        viewers: 96,
        pace: 'Decision rounds',
        lesson: 'Visible dealer cards turn the same hand total into a different EV question.',
    },
    {
        id: 'wheel-live',
        name: 'Wheel Studio',
        gamePath: '/wheel',
        host: 'Sim Host C',
        viewers: 174,
        pace: '30s spins',
        lesson: 'Broadcast pacing makes low-frequency outcomes feel more imminent.',
    },
]

export const missions = [
    {
        id: 'edge-check',
        title: 'Edge Check',
        target: 'Play three different games and compare EV.',
        reward: 'Practice badge',
        progress: 0.35,
    },
    {
        id: 'bankroll-guard',
        title: 'Bankroll Guard',
        target: 'Keep every bet under 2% of balance for ten plays.',
        reward: 'Risk badge',
        progress: 0.6,
    },
    {
        id: 'sports-vig',
        title: 'Spot The Vig',
        target: 'Build a sportsbook ticket after reading overround.',
        reward: 'Odds badge',
        progress: 0.2,
    },
]

export const vipLevels = [
    { tier: 'Observer', threshold: 0, perk: 'Risk glossary unlocked' },
    { tier: 'Analyst', threshold: 250, perk: 'Rollover calculator unlocked' },
    { tier: 'Strategist', threshold: 1000, perk: 'Volatility comparison unlocked' },
    { tier: 'Quant', threshold: 5000, perk: 'Session review unlocked' },
]

export const slotCatalog = [
    'Amazing Sevens',
    'Aztec Practice',
    'Banana Party',
    'Bars and Sevens',
    'Ancient Forest',
    'Beach Holiday',
    'Bells on Fire',
    'Diamond Trail',
    'Lucky Lantern',
    'Cyber Fruits',
    'Royal Vault',
    'Neon Treasure',
].map((name, index) => ({
    id: `slot-${index + 1}`,
    name,
    path: '/slots',
    provider: ['GamPo Lab', 'Xaxino Set', 'Open Arcade'][index % 3],
    volatility: ['Low', 'Medium', 'High'][index % 3],
    rtp: [0.94, 0.955, 0.965][index % 3],
    image: `/example-assets/xaxino/game/${[
        '610515f76a27a1627723255.jpg',
        '61051a9ed28511627724446.jpg',
        '61051cb37ad601627724979.jpg',
        '61051d8469d731627725188.jpg',
        '610521608fde21627726176.jpg',
        '61052482a60ed1627726978.jpg',
        '610526fa315241627727610.jpg',
        '6345218eda3c71665474958.jpg',
    ][index % 8]}`,
}))

export const fullGameCatalog = [
    sportsbookDefinition,
    ...gameDefinitions,
    ...slotCatalog,
]
