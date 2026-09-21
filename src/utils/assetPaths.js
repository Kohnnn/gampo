// Runtime asset-path resolver.
//
// The application references `public/` assets by literal path (for example
// `/assets/games/backdrops/backdrop-felt-navy.png`). Those files are served
// verbatim, so Vite never sees them and cannot rewrite them at build time.
//
// `scripts/optimizeAssets.mjs --prune` instead rewrites the asset tree itself:
// it emits WebP/Ogg siblings, records the mapping in
// `assetFormats.generated.js`, and deletes the superseded originals. This module
// applies that mapping at runtime so the 440-odd legacy references in the
// codebase keep resolving without being edited.
//
// Because the originals are pruned, the mapping is unconditional — there is no
// capability probe and no fallback file. Both target formats are supported by
// every browser this project targets (WebP: Chrome 32+, Firefox 65+,
// Safari 14+; Ogg Vorbis: universal), and the app already requires the Web Audio
// API, which is a strictly narrower constraint than either codec.

import { IMAGE_FORMATS, AUDIO_FORMATS, modernImage, modernAudio } from '../data/assetFormats.generated'

export { modernImage, modernAudio }

/**
 * Resolve an image path to the asset that actually ships.
 *
 * Non-string, empty, absolute-URL, and `data:`/`blob:` inputs pass through
 * untouched, so this is safe to apply unconditionally to user- or
 * config-supplied values.
 */
export function resolveImage(src) {
    if (typeof src !== 'string' || src === '') return src
    if (/^(data:|https?:|blob:)/.test(src)) return src
    return IMAGE_FORMATS[src] || src
}

/** Resolve an audio path to the asset that actually ships. */
export function resolveAudio(src) {
    if (typeof src !== 'string' || src === '') return src
    if (/^(data:|https?:|blob:)/.test(src)) return src
    return AUDIO_FORMATS[src] || src
}
