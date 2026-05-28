// bgmManifest.js — Wave 27 background music manifest, keyed by skin family.
//
// Slot templates declare a `skin` (bank, catcher, western, mythic, rock,
// classic, cyber, wanted, olympus, bayou, mummy, phoenix, mansion, ronin,
// iron, coop, spirit, forge, gummy). Each family maps to one BGM loop URL.
//
// Wave 29 + 32 + 34: paths point to procedurally-generated 16-bit WAV loops
// produced by `scripts/genSfx.mjs` + `scripts/bgmEngine.mjs`. Both `idle`
// and `bonus` modes ship. Re-run that script to regenerate.
//
// Schema:
//   { [skinFamily]: { idle: '/audio/bgm/<family>/idle.wav',
//                     bonus: '/audio/bgm/<family>/bonus.wav' } }

const FAMILIES = [
    'bank', 'bars', 'bayou', 'catcher', 'classic', 'coop', 'cyber', 'forge',
    'gummy', 'iron', 'mansion', 'mummy', 'mythic', 'olympus', 'phoenix',
    'rock', 'ronin', 'spirit', 'vault', 'wanted', 'western',
]

export const bgmManifest = Object.fromEntries(
    FAMILIES.map(fam => [fam, {
        idle: `/audio/bgm/${fam}/idle.wav`,
        bonus: `/audio/bgm/${fam}/bonus.wav`,
    }]),
)

export function resolveBgm(skinFamily, mode = 'idle') {
    const fam = bgmManifest[skinFamily]
    if (!fam) return null
    if (mode in fam) return fam[mode] || null
    return fam.idle || null
}
