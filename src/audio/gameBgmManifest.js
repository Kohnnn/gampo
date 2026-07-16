const GAME_IDS = [
    'lobby', 'poker', 'crash', 'plinko', 'dice', 'limbo', 'keno', 'wheel', 'mines',
    'roulette', 'blackjack', 'baccarat', 'sicbo', 'war', 'videopoker', 'hilo',
    'lottery', 'cases', 'drill', 'packs', 'tomeoflife', 'tarot', 'flip', 'diamonds',
    'darts', 'pump', 'slide', 'moles', 'snakes', 'coinflip', 'rps', 'guess', 'color',
    'tower', 'chickencross', 'dino', 'sports',
]

const menuTrack = {
    idle: '/audio/bgm/menu/idle.wav',
    bonus: '/audio/bgm/menu/idle.wav',
    loss: null,
}

function gameTrack(id) {
    if (id === 'lobby') return menuTrack
    return {
        idle: `/audio/bgm/games/${id}/idle.wav`,
        bonus: `/audio/bgm/games/${id}/bonus.wav`,
        loss: null,
    }
}

export const gameBgmManifest = Object.fromEntries(
    GAME_IDS.map(id => [id, gameTrack(id)]),
)

export function resolveGameBgm(gameId, mode = 'idle') {
    const entry = gameBgmManifest[gameId]
    if (!entry || mode === 'loss') return null
    if (mode === 'bonus' && entry.bonus) return entry.bonus
    return entry.idle || null
}
