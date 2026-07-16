const FAMILIES = [
    'bank', 'bars', 'bayou', 'catcher', 'classic', 'coop', 'cyber', 'forge',
    'gummy', 'iron', 'mansion', 'mummy', 'mythic', 'olympus', 'phoenix',
    'rock', 'ronin', 'spirit', 'vault', 'wanted', 'western',
]

export const bgmManifest = Object.fromEntries(
    FAMILIES.map(family => [family, {
        idle: `/audio/bgm/${family}/idle.wav`,
        bonus: `/audio/bgm/${family}/bonus.wav`,
        loss: null,
    }]),
)

export function resolveBgm(skinFamily, mode = 'idle') {
    const family = bgmManifest[skinFamily]
    if (!family) return null
    if (mode === 'loss') return null
    if (mode === 'bonus' && family.bonus) return family.bonus
    return family.idle || null
}
