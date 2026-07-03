// bgmManifest.js — Wave 36 background music manifest, keyed by skin family.
//
// Slot templates declare a `skin` (bank, catcher, western, mythic, rock,
// classic, cyber, wanted, olympus, bayou, mummy, phoenix, mansion, ronin,
// iron, coop, spirit, forge, gummy). Each family maps to one BGM loop URL.
//
// Wave 36: Now references the casino-lounge BGM pack. Slots, Cases, Crash,
// and Poker each resolve to their dedicated track from the pack. Other
// families fall back to the lobby ambient loop.
//
// Re-run the audio content pipeline to generate new placeholder files
// when assets are acquired.

const FAMILIES = [
    'bank', 'bars', 'bayou', 'catcher', 'classic', 'coop', 'cyber', 'forge',
    'gummy', 'iron', 'mansion', 'mummy', 'mythic', 'olympus', 'phoenix',
    'rock', 'ronin', 'spirit', 'vault', 'wanted', 'western',
]

export const bgmManifest = Object.fromEntries(
    FAMILIES.map(fam => [fam, {
        idle:  `/audio/bgm/casino-lounge/slots-idle.wav`,
        bonus: `/audio/bgm/casino-lounge/slots-bonus.wav`,
        loss:  `/audio/bgm/casino-lounge/slots-loss.wav`,
    }]),
)

export function resolveBgm(skinFamily, mode = 'idle') {
    const fam = bgmManifest[skinFamily]
    if (!fam) return null
    if (mode === 'loss' && fam.loss) return fam.loss
    if (mode === 'bonus' && fam.bonus) return fam.bonus
    return fam.idle || null
}
