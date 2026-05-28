// gameBgmManifest.js — Wave 35: per-route BGM keyed by game id.
//
// Each casino game route now ships its own themed BGM loop. The
// archetype-to-route mapping mirrors `scripts/bgmEngine.mjs`
// (`GAME_ARCHETYPE`). Both `idle` and `bonus` (high-stakes) modes
// resolve.
//
// Schema:
//   { [gameId]: { idle: '/audio/bgm/games/<id>/idle.wav',
//                 bonus: '/audio/bgm/games/<id>/bonus.wav' } }
//
// `bonus` is intentionally generated for every route; only games that
// opt in via `useBgm(gameId, 'bonus')` will actually play it (e.g.
// crash mid-flight ≥ 5×, mines cashout climb ≥ 3×, etc.).

const GAME_IDS = [
    'poker', 'crash', 'plinko', 'dice', 'limbo', 'keno', 'wheel', 'mines',
    'roulette', 'blackjack', 'baccarat', 'sicbo', 'war', 'videopoker',
    'hilo', 'lottery', 'cases', 'drill', 'packs', 'tomeoflife', 'tarot',
    'flip', 'diamonds', 'darts', 'pump', 'slide', 'moles', 'snakes',
    'coinflip', 'rps', 'guess', 'color', 'tower', 'chickencross', 'dino',
    'sports',
]

export const gameBgmManifest = Object.fromEntries(
    GAME_IDS.map(id => [id, {
        idle: `/audio/bgm/games/${id}/idle.wav`,
        bonus: `/audio/bgm/games/${id}/bonus.wav`,
    }]),
)

export function resolveGameBgm(gameId, mode = 'idle') {
    const entry = gameBgmManifest[gameId]
    if (!entry) return null
    if (mode in entry) return entry[mode] || null
    return entry.idle || null
}
