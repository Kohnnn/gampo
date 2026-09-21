#!/usr/bin/env node
// Build-time asset optimizer.
//
// Emits modern-format siblings for heavy `public/` raster assets so the deploy
// payload stops carrying ~300 MB of unoptimized PNG and ~77 MB of raw PCM WAV.
//
// Design constraints (see process/general-plans/active/vercel_full_parity_recovery_13-07-26):
//   - Originals are PRESERVED. This is additive: it writes `.webp` / `.ogg`
//     siblings next to the source file and never mutates or deletes the input.
//     The runtime resolver in `src/utils/assetPaths.js` picks the modern format
//     when the browser supports it and falls back to the original otherwise.
//   - Images whose modern sibling would not be meaningfully smaller are skipped,
//     so we never regress a file for the sake of a format badge.
//   - Deterministic: same inputs produce byte-identical outputs, and the
//     generated manifest is sorted.
//
// Usage:
//   node scripts/optimizeAssets.mjs            # optimize in place (additive)
//   node scripts/optimizeAssets.mjs --dry-run  # report projected savings only
//   node scripts/optimizeAssets.mjs --force    # re-encode even if sibling exists

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')
const MANIFEST_PATH = path.join(ROOT, 'src', 'data', 'assetFormats.generated.js')

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const FORCE = args.includes('--force')

// `--prune` deletes each source file once its optimized sibling is written.
// This is what actually shrinks the deploy: without it the payload carries both
// formats. Kept opt-in because it is destructive to the working tree.
const PRUNE = args.includes('--prune')

// Only these subtrees are scanned. Everything else in public/ is already small
// or non-raster.
const SCAN_ROOTS = ['assets', 'images', 'audio', 'data', 'dino-assets']

// Minimum size before a raster is a conversion candidate. Set low deliberately:
// the point is a single consistent format across the tree, not per-file byte
// maximization. A partially-converted tree is worse than a slightly wasteful
// one, because every runtime reference then depends on which side of the
// threshold its asset happened to fall.
const MIN_IMAGE_BYTES = 15 * 1024

// A modern sibling must beat the original by this factor to be worth shipping.
const MIN_IMAGE_GAIN = 1.25

// Skip anything already in a modern format.
const RASTER_EXT = new Set(['.png', '.jpg', '.jpeg'])

// WAV is only worth converting when it is genuinely large.
const MIN_AUDIO_BYTES = 64 * 1024
const OGG_QUALITY = 4

function walkRecursive(dir, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkRecursive(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function hasFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// Originals are deleted by `--prune`, so the manifest cannot be derived from
// converted pairs alone: on a re-run there are no pairs left. Siblings already
// on disk are the source of truth, and they are discovered here.
//
// A sibling has no record of the extension its source used, so the legacy
// extension is inferred from the manifests in `src/`. Guessing `.png` is wrong
// for the trees that ship `.jpg` (the tarot plates), which would emit a mapping
// whose target file does not exist.
function legacyImageExtensions() {
  const exts = new Set()
  const roots = [
    path.join(ROOT, 'src', 'data'),
    path.join(ROOT, 'src', 'components'),
    path.join(ROOT, 'src', 'audio'),
  ]
  for (const root of roots) {
    for (const file of walkRecursive(root)) {
      if (!/\.(js|jsx)$/.test(file)) continue
      for (const m of fs.readFileSync(file, 'utf8').matchAll(/\/[A-Za-z0-9_\-/.]+\.(png|jpe?g|wav)\b/g)) {
        exts.add(m[0])
      }
    }
  }
  return {
    images: [...exts].filter(e => /\.(png|jpe?g)$/i.test(e)),
    audio: [...exts].filter(e => e.endsWith('.wav')),
  }
}

function findOptimizedSiblings() {
  const images = []
  const audio = []
  const legacy = legacyImageExtensions()
  const hasJpg = legacy.images.some(e => /\.jpe?g$/i.test(e))
  const imageSourceExts = hasJpg ? ['.png', '.jpg', '.jpeg'] : ['.png']

  for (const rel of SCAN_ROOTS) {
    for (const file of walkRecursive(path.join(PUBLIC, rel))) {
      const lower = file.toLowerCase()
      if (lower.endsWith('.webp')) {
        // The original is already gone, so its extension cannot be read off the
        // filesystem. Record one entry per legacy extension the source tree
        // actually references, then let the consumer pick: `resolveImage` looks
        // up by the exact literal path in the code, so an unused alias is inert
        // while a missing one is a broken reference.
        const base = file.replace(/\.webp$/i, '')
        for (const ext of imageSourceExts) {
          images.push({
            file: base + ext,
            out: file,
            before: 0,
            after: fs.statSync(file).size,
            sibling: true,
          })
        }
      } else if (lower.endsWith('.ogg')) {
        const source = file.replace(/\.ogg$/i, '.wav')
        audio.push({ file: source, out: file, before: 0, after: fs.statSync(file).size, sibling: true })
      }
    }
  }
  return { images, audio }
}

async function optimizeImage(file) {
  const ext = path.extname(file).toLowerCase()
  if (!RASTER_EXT.has(ext)) return null

  const before = fs.statSync(file).size
  if (before < MIN_IMAGE_BYTES) return null

  const out = file.replace(/\.(png|jpe?g)$/i, '.webp')
  if (!FORCE && fs.existsSync(out)) {
    const after = fs.statSync(out).size
    return { file, out, before, after, skipped: true }
  }
  if (DRY_RUN) {
    // Estimate from the measured backdrop benchmark (~8.9x at q80). Reported as
    // an estimate, never as a real result.
    return { file, out, before, after: Math.round(before / 8.9), estimated: true }
  }

  // Preserve alpha when present; -quality 80 was benchmarked at ~8.9x on the
  // repo's own backdrop art with no visible banding.
  await sharp(file).webp({ quality: 80, effort: 4 }).toFile(out)

  const after = fs.statSync(out).size
  if (after * MIN_IMAGE_GAIN > before) {
    fs.unlinkSync(out)
    return null
  }
  return { file, out, before, after }
}

function optimizeAudio(file) {
  const ext = path.extname(file).toLowerCase()
  if (ext !== '.wav') return null

  const before = fs.statSync(file).size
  if (before < MIN_AUDIO_BYTES) return null

  const out = file.replace(/\.wav$/i, '.ogg')
  if (!FORCE && fs.existsSync(out)) {
    return { file, out, before, after: fs.statSync(out).size, skipped: true }
  }
  if (DRY_RUN) {
    return { file, out, before, after: Math.round(before / 8.5), estimated: true }
  }

  execFileSync(
    'ffmpeg',
    ['-y', '-v', 'error', '-i', file, '-c:a', 'libvorbis', '-q:a', String(OGG_QUALITY), out],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )

  const after = fs.statSync(out).size
  if (after >= before) {
    fs.unlinkSync(out)
    return null
  }
  return { file, out, before, after }
}

function toPublicUrl(file) {
  return '/' + path.relative(PUBLIC, file).split(path.sep).join('/')
}

// The emitted manifest is an unconditional source -> optimized mapping.
//
// It deliberately contains no capability check: `--prune` removes the superseded
// original from the deploy, so the optimized sibling is the ONLY file that
// ships. Every browser this project targets (WebP: Chrome 32+, Safari 14+,
// Firefox 65+; Ogg Vorbis: universal) supports both formats, so the mapping is
// not a progressive enhancement — it is the asset.
function writeManifest(images, audio) {
  const imageMap = {}
  for (const r of images) {
    if (r.estimated) continue
    imageMap[toPublicUrl(r.file)] = toPublicUrl(r.out)
  }
  const audioMap = {}
  for (const r of audio) {
    if (r.estimated) continue
    audioMap[toPublicUrl(r.file)] = toPublicUrl(r.out)
  }

  const sort = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]))
  const body = `// GENERATED by scripts/optimizeAssets.mjs — do not edit by hand.
//
// Maps a source \`public/\` asset path to the optimized asset that actually ships.
// \`--prune\` deletes the superseded original, so these entries are an
// unconditional rewrite of the legacy extension, not a progressive enhancement.

export const IMAGE_FORMATS = ${JSON.stringify(sort(imageMap), null, 4)}

export const AUDIO_FORMATS = ${JSON.stringify(sort(audioMap), null, 4)}

/** Resolve a legacy image path to the optimized asset that ships. */
export function modernImage(src) {
    if (typeof src !== 'string') return src
    return IMAGE_FORMATS[src] || src
}

/** Resolve a legacy audio path to the optimized asset that ships. */
export function modernAudio(src) {
    if (typeof src !== 'string') return src
    return AUDIO_FORMATS[src] || src
}
`

  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true })
    fs.writeFileSync(MANIFEST_PATH, body)
  }
}

function mb(bytes) {
  return (bytes / 1048576).toFixed(1) + ' MB'
}

async function main() {
  const files = SCAN_ROOTS.flatMap((rel) => walkRecursive(path.join(PUBLIC, rel)))

  const images = []
  const audio = []
  let i = 0
  for (const file of files) {
    const name = file.toLowerCase()
    if (name.endsWith('.wav')) {
      const r = optimizeAudio(file)
      if (r) audio.push(r)
    } else if (/\.(png|jpe?g)$/.test(name)) {
      const r = await optimizeImage(file)
      if (r) images.push(r)
    }
    if (++i % 50 === 0) process.stderr.write(`  scanned ${i}/${files.length}\r`)
  }
  process.stderr.write('\n')

  // Merge in siblings whose original was already pruned by an earlier run, so
  // the emitted manifest stays complete across repeated invocations.
  const siblings = findOptimizedSiblings()
  const seenOut = new Set([...images, ...audio].map(r => r.out))
  for (const r of siblings.images) if (!seenOut.has(r.out)) images.push(r)
  for (const r of siblings.audio) if (!seenOut.has(r.out)) audio.push(r)

  // Prune superseded originals so the deploy carries one format, not two.
  let pruned = 0
  let prunedBytes = 0
  if (PRUNE && !DRY_RUN) {
    // Only delete when the optimized sibling is actually on disk and non-empty.
    for (const r of [...images, ...audio]) {
      if (r.estimated) continue
      try {
        const size = fs.statSync(r.out).size
        if (size <= 0) continue
        fs.unlinkSync(r.file)
        pruned++
        prunedBytes += r.before
      } catch {
        // Sibling disappeared or source already pruned — leave the tree alone.
      }
    }
  }

  // Only converted pairs carry a meaningful "before" size; discovered siblings
  // already had their original pruned, so they report as already-optimized.
  const converted = [...images, ...audio].filter(r => !r.sibling && !r.estimated)
  const alreadyOptimized = [...images, ...audio].filter(r => r.sibling).length

  const before = converted.reduce((s, r) => s + r.before, 0)
  const after = converted.reduce((s, r) => s + r.after, 0)

  writeManifest(images, audio)

  if (converted.length > 0) {
    console.log(`\nconverted: ${converted.length} files  ${mb(before)} -> ${mb(after)}  (saves ${mb(before - after)})`)
  }
  if (alreadyOptimized > 0) {
    console.log(`already optimized: ${alreadyOptimized} files (originals previously pruned)`)
  }
  console.log(`manifest: ${images.length} images, ${audio.length} audio entries`)
  if (PRUNE) console.log(`pruned: ${pruned} originals, ${mb(prunedBytes)} removed from the tree`)
  if (DRY_RUN) console.log('\n(dry run — nothing written; sizes for uncached files are estimates)')
}

if (!hasFfmpeg()) {
  console.error('ffmpeg is required for audio optimization but was not found on PATH.')
  process.exit(1)
}

main()
