// gameBgmManifest.js — Wave 36: Casino-lounge 5-track BGM pack.
//
// Slots | Crash | Cases | Poker | Lobby — each with idle, bonus, and loss stingers.
// Bonus stingers trigger on celebration moments (big win, bonus entry, high multiplier).
// Loss stingers trigger on bust / zero-out events.
//
// Schema:
//   { [gameId]: { idle: '/audio/bgm/games/<id>/idle.wav',
//                 bonus: '/audio/bgm/games/<id>/bonus.wav',
//                 loss:  '/audio/bgm/games/<id>/loss.wav' } }
//
// Bonus and loss tracks play once as a stinger overlay, then the idle loop resumes.

export const CASINO_BGM_PACK = {
    lobby: {
        idle:  '/audio/bgm/casino-lounge/lobby-idle.wav',
        bonus: '/audio/bgm/casino-lounge/lobby-bonus.wav',
        loss:  '/audio/bgm/casino-lounge/lobby-loss.wav',
    },
    slots: {
        idle:  '/audio/bgm/casino-lounge/slots-idle.wav',
        bonus: '/audio/bgm/casino-lounge/slots-bonus.wav',
        loss:  '/audio/bgm/casino-lounge/slots-loss.wav',
    },
    crash: {
        idle:  '/audio/bgm/casino-lounge/crash-idle.wav',
        bonus: '/audio/bgm/casino-lounge/crash-bonus.wav',
        loss:  '/audio/bgm/casino-lounge/crash-loss.wav',
    },
    cases: {
        idle:  '/audio/bgm/casino-lounge/cases-idle.wav',
        bonus: '/audio/bgm/casino-lounge/cases-bonus.wav',
        loss:  '/audio/bgm/casino-lounge/cases-loss.wav',
    },
    poker: {
        idle:  '/audio/bgm/casino-lounge/poker-idle.wav',
        bonus: '/audio/bgm/casino-lounge/poker-bonus.wav',
        loss:  '/audio/bgm/casino-lounge/poker-loss.wav',
    },
}

// Map each game id to its pack entry.
// Games not in the pack fall back to the lobby idle track.
const GAME_TO_TRACK = {
    lobby: 'lobby',
    slots: 'slots',
    crash: 'crash',
    cases: 'cases',
    poker: 'poker',
    // All other game IDs use the lobby ambient loop
}

const FALLBACK_TRACK = CASINO_BGM_PACK.lobby

const ALL_GAME_IDS = [
    'poker', 'crash', 'plinko', 'dice', 'limbo', 'keno', 'wheel', 'mines',
    'roulette', 'blackjack', 'baccarat', 'sicbo', 'war', 'videopoker',
    'hilo', 'lottery', 'cases', 'drill', 'packs', 'tomeoflife', 'tarot',
    'flip', 'diamonds', 'darts', 'pump', 'slide', 'moles', 'snakes',
    'coinflip', 'rps', 'guess', 'color', 'tower', 'chickencross', 'dino',
    'sports',
]

export const gameBgmManifest = Object.fromEntries(
    ALL_GAME_IDS.map(id => {
        const track = GAME_TO_TRACK[id] || 'lobby'
        return [id, { ...CASINO_BGM_PACK[track] }]
    }),
)

export function resolveGameBgm(gameId, mode = 'idle') {
    const entry = gameBgmManifest[gameId]
    if (!entry) return null
    if (mode === 'loss' && entry.loss) return entry.loss
    if (mode === 'bonus' && entry.bonus) return entry.bonus
    return entry.idle || null
}
