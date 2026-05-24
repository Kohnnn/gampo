// Resource role taxonomy for Stake/Rainbet originals.
//
// Every clone-owned asset for a given game must map to a role in this list.
// The manifest declares paths per role. Games never reference paths
// directly: they ask the preloader for a role and get a normalized URL
// (or null when the asset is not yet available).
//
// Recommended naming (from implementation guide section 5.2):
//   cover.webp
//   stage-bg.webp
//   tile-back.svg, tile-safe.svg, tile-hazard.svg
//   card-back.svg
//   chip-1.svg, chip-5.svg, chip-25.svg
//   choice-rock.svg, choice-paper.svg, choice-scissors.svg
//   reel-symbol-a.webp
//   sfx-click.mp3 (audio handled by audio module separately)

export const RESOURCE_ROLES = Object.freeze({
    COVER: 'cover',
    STAGE_BG: 'stage.bg',
    STAGE_FRAME: 'stage.frame',
    TILE_BACK: 'stage.tileBack',
    TILE_SAFE: 'stage.tileSafe',
    TILE_HAZARD: 'stage.tileHazard',
    CARD_BACK: 'stage.cardBack',
    CARD_FACE: 'stage.cardFace',
    CHIP: 'stage.chip',
    CHOICE: 'stage.choice',
    REEL_SYMBOL: 'stage.reelSymbol',
    DECORATION: 'stage.decoration',
    BALL: 'stage.ball',
    PEG: 'stage.peg',
    BUCKET: 'stage.bucket',
    OBJECT: 'stage.object',
})

// Critical = required to render the playable stage. Optional = nice to
// have (decorations, particles, ambience) and can hydrate after the
// primary action becomes available.
export function classifyRole(role) {
    if (!role) return 'optional'
    if (role === RESOURCE_ROLES.COVER) return 'optional'
    if (role.startsWith('stage.decoration')) return 'optional'
    if (role.startsWith('stage.')) return 'critical'
    return 'optional'
}
