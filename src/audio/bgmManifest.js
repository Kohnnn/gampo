import { resolveAudio } from '../utils/assetPaths'

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
    const chosen = mode === 'bonus' && family.bonus ? family.bonus : family.idle
    return chosen ? resolveAudio(chosen) : null
}
