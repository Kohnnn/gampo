// bgmManifest.js — Wave 27 background music manifest, keyed by skin family.
//
// Slot templates declare a `skin` (bank, catcher, western, mythic, rock,
// classic, cyber, wanted, olympus, bayou, mummy, phoenix, mansion, ronin,
// iron, coop, spirit, forge, gummy). Each family maps to one BGM loop URL.
//
// Wave 29 + 32: paths point to procedurally-generated 16-bit WAV loops
// produced by `scripts/genSfx.mjs`. Both `idle` and `bonus` modes ship.
// Re-run that script to regenerate.
//
// Schema:
//   { [skinFamily]: { idle: '/audio/bgm/<family>/idle.wav',
//                     bonus: '/audio/bgm/<family>/bonus.wav' } }

export const bgmManifest = {
    bank: {
        idle: '/audio/bgm/bank/idle.wav',
        bonus: '/audio/bgm/bank/bonus.wav',
    },
    catcher: {
        idle: '/audio/bgm/catcher/idle.wav',
        bonus: '/audio/bgm/catcher/bonus.wav',
    },
    western: {
        idle: '/audio/bgm/western/idle.wav',
        bonus: '/audio/bgm/western/bonus.wav',
    },
    mythic: {
        idle: '/audio/bgm/mythic/idle.wav',
        bonus: '/audio/bgm/mythic/bonus.wav',
    },
    rock: {
        idle: '/audio/bgm/rock/idle.wav',
        bonus: '/audio/bgm/rock/bonus.wav',
    },
    classic: {
        idle: '/audio/bgm/classic/idle.wav',
        bonus: '/audio/bgm/classic/bonus.wav',
    },
    cyber: {
        idle: '/audio/bgm/cyber/idle.wav',
        bonus: '/audio/bgm/cyber/bonus.wav',
    },
    wanted: {
        idle: '/audio/bgm/wanted/idle.wav',
        bonus: '/audio/bgm/wanted/bonus.wav',
    },
    olympus: {
        idle: '/audio/bgm/olympus/idle.wav',
        bonus: '/audio/bgm/olympus/bonus.wav',
    },
    bayou: {
        idle: '/audio/bgm/bayou/idle.wav',
        bonus: '/audio/bgm/bayou/bonus.wav',
    },
    mummy: {
        idle: '/audio/bgm/mummy/idle.wav',
        bonus: '/audio/bgm/mummy/bonus.wav',
    },
    phoenix: {
        idle: '/audio/bgm/phoenix/idle.wav',
        bonus: '/audio/bgm/phoenix/bonus.wav',
    },
    mansion: {
        idle: '/audio/bgm/mansion/idle.wav',
        bonus: '/audio/bgm/mansion/bonus.wav',
    },
    ronin: {
        idle: '/audio/bgm/ronin/idle.wav',
        bonus: '/audio/bgm/ronin/bonus.wav',
    },
    iron: {
        idle: '/audio/bgm/iron/idle.wav',
        bonus: '/audio/bgm/iron/bonus.wav',
    },
    coop: {
        idle: '/audio/bgm/coop/idle.wav',
        bonus: '/audio/bgm/coop/bonus.wav',
    },
    spirit: {
        idle: '/audio/bgm/spirit/idle.wav',
        bonus: '/audio/bgm/spirit/bonus.wav',
    },
    forge: {
        idle: '/audio/bgm/forge/idle.wav',
        bonus: '/audio/bgm/forge/bonus.wav',
    },
    gummy: {
        idle: '/audio/bgm/gummy/idle.wav',
        bonus: '/audio/bgm/gummy/bonus.wav',
    },
}

export function resolveBgm(skinFamily, mode = 'idle') {
    const fam = bgmManifest[skinFamily]
    if (!fam) return null
    if (mode in fam) return fam[mode] || null
    return fam.idle || null
}
