// Phase-02-authorized regeneration of scripts/assetDeliveryManifest.js against
// the shipped public/ tree after commit 4bbefc40 pruned the raster/WAV
// originals. Run from the repo root:
//
//   node scripts/regenerateAssetDeliveryManifest.mjs <phase02-copy-root> --write
//
// Without --write it prints a dry-run summary only.
//
// The audit never consults the app resolver, so every record and dynamic path
// is re-keyed from the pre-prune literal to the file that actually ships, and
// the derived facts (bytes, sha256, format, dimensions, baselines, digests) are
// recomputed from that shipped file.

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import manifest from './assetDeliveryManifest.js'
import { collectCorpus, corpusFingerprint, productionIo } from './assetDeliveryAudit.mjs'
import { IMAGE_FORMATS, AUDIO_FORMATS } from '../src/data/assetFormats.generated.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const copyRootArg = args.find((value) => !value.startsWith('--'))

const RESOLVER = { ...IMAGE_FORMATS, ...AUDIO_FORMATS }
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex')
const FORMAT_BY_EXTENSION = {
    '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpeg', '.webp': 'webp',
    '.gif': 'gif', '.svg': 'svg', '.avif': 'avif',
}

const exists = (logical) => {
    try { readFileSync(path.join(root, 'public', logical.slice(1))); return true } catch { return false }
}
// Re-key a pre-prune literal onto the file that ships. Unpruned paths are
// already correct and pass through unchanged.
const shippingPath = (logical) => (exists(logical) ? logical : (RESOLVER[logical] ?? null))

// Mirror of the audit's own `dimensions()` for the formats it parses. The
// audit rejects a non-null dimension claim for webp/svg/avif and only parses
// png/gif/jpg, so anything else must record `dimensions: null`.
function dimensions(buffer, format) {
    if (format === 'png' && buffer.length >= 24 && buffer.subarray(1, 4).toString() === 'PNG') {
        return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)]
    }
    if (format === 'gif' && buffer.length >= 10 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString())) {
        return [buffer.readUInt16LE(6), buffer.readUInt16LE(8)]
    }
    if (format === 'jpg' || format === 'jpeg') {
        if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null
        let offset = 2
        while (offset + 8 < buffer.length) {
            if (buffer[offset] !== 0xff) { offset += 1; continue }
            const marker = buffer[offset + 1]
            const length = buffer.readUInt16BE(offset + 2)
            if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
                return [buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 7)]
            }
            if (length < 2) return null
            offset += 2 + length
        }
    }
    return null
}

// ---- 1. corpus ------------------------------------------------------------
const collected = await collectCorpus({ root, io: productionIo, collector: { add() {} } })
const files = []
for (const file of collected.files) {
    const buffer = readFileSync(file.absolute)
    files.push({ ...file, sha256: hash(buffer) })
}
const fingerprint = corpusFingerprint(files)
const formats = {}
for (const file of files) formats[file.extension] = (formats[file.extension] ?? 0) + 1

// ---- 2. records -----------------------------------------------------------
const records = []
const collisions = []
const seen = new Map()
for (const record of manifest.records) {
    const next = shippingPath(record.path)
    if (!next) throw new Error(`record has no shipping target: ${record.path}`)
    if (seen.has(next)) collisions.push(`${next} <- ${seen.get(next)}, ${record.path}`)
    seen.set(next, record.path)
    const buffer = readFileSync(path.join(root, 'public', next.slice(1)))
    const format = FORMAT_BY_EXTENSION[path.extname(next).toLowerCase()]
    // The validator rejects a non-null dimension claim for webp/svg/avif, and
    // dimensions() only parses png/gif/jpg anyway — so dims are null unless the
    // shipping file is one of those three AND parses.
    const dims = dimensions(buffer, format)
    records.push({ ...record, path: next, bytes: buffer.length, sha256: hash(buffer), format, dimensions: dims })
}

// ---- 3. occurrences and path counts --------------------------------------
const staticOccurrences = manifest.staticOccurrences.map((row) => {
    const next = shippingPath(row.path)
    if (!next) throw new Error(`occurrence has no shipping target: ${row.path}`)
    return { ...row, path: next }
})
const counted = new Map()
for (const row of staticOccurrences) {
    const key = `${row.source}\0${row.path}`
    counted.set(key, (counted.get(key) ?? 0) + 1)
}
const staticPathCounts = [...counted.entries()].map(([key, expectedCount]) => {
    const [source, logical] = key.split('\0')
    return { source, path: logical, expectedCount }
})

// ---- 4. dynamic declarations ---------------------------------------------
const dynamic = manifest.dynamic.map((declaration) => {
    const paths = declaration.paths.map((logical) => {
        const next = shippingPath(logical)
        if (!next) throw new Error(`dynamic path has no shipping target (${declaration.name}): ${logical}`)
        return next
    })
    const guards = declaration.guards.map((guard) => {
        const text = readFileSync(path.join(root, guard.source), 'utf8').replace(/\r\n?/g, '\n')
        const start = text.indexOf(guard.startAnchor)
        const end = text.indexOf(guard.endAnchor, start + guard.startAnchor.length)
        if (start < 0 || end <= start) throw new Error(`guard anchor not found in ${guard.source}`)
        const span = text.slice(start, end)
        const missing = guard.requiredTokens.filter((token) => !span.includes(token))
        if (missing.length) throw new Error(`guard tokens missing in ${guard.source}: ${missing.join(', ')}`)
        return { ...guard, span, sha256: hash(Buffer.from(span, 'utf8')) }
    })
    return { ...declaration, paths, guards }
})

// ---- 5. baselines ---------------------------------------------------------
const staticBytes = records.reduce((sum, record) => sum + record.bytes, 0)
const largestAssetBytes = records.reduce((max, record) => Math.max(max, record.bytes), 0)
const groups = manifest.baselines.groups.map((baseline) => {
    const members = records.filter((record) => record.consumerGroups?.includes(baseline.group))
    return {
        ...baseline,
        assetCount: members.length,
        budgetBytes: members.reduce((sum, record) => sum + record.bytes, 0),
    }
})
const preloadPaths = (manifest.preloadPaths ?? []).map((logical) => {
    const next = shippingPath(logical)
    if (!next) throw new Error(`preload path has no shipping target: ${logical}`)
    return next
})

const nextManifest = {
    ...manifest,
    corpus: {
        ...manifest.corpus,
        expectedCount: collected.corpusFiles,
        expectedBytes: collected.corpusBytes,
        expectedFormats: Object.fromEntries(
            Object.keys(manifest.corpus.expectedFormats).map((ext) => [ext, formats[ext] ?? 0]),
        ),
        treeSha256: fingerprint.treeSha256,
    },
    records,
    staticOccurrences,
    staticPathCounts,
    dynamic,
    preloadPaths,
    baselines: {
        ...manifest.baselines,
        staticOccurrences: staticOccurrences.length,
        staticPathCounts: staticPathCounts.length,
        staticRecords: records.length,
        staticBytes,
        occurrenceBytes: staticOccurrences.reduce(
            (sum, row) => sum + (records.find((record) => record.path === row.path)?.bytes ?? 0), 0),
        largestAssetBytes,
        dynamicDeclarations: dynamic.length,
        groups,
    },
}

// ---- 6. emit --------------------------------------------------------------
const source = `const manifest = ${JSON.stringify(nextManifest, null, 2)}\n\nexport default manifest\n`
console.log('corpus      ', collected.corpusFiles, 'files', collected.corpusBytes, 'bytes', fingerprint.treeSha256)
console.log('records     ', records.length, 'bytes', staticBytes, 'largest', largestAssetBytes)
console.log('occurrences ', staticOccurrences.length, 'pairs', staticPathCounts.length)
console.log('collisions  ', collisions.length, collisions.slice(0, 5))
console.log('dynamic     ', dynamic.map((d) => `${d.name}:${d.paths.length}`).join(' '))
console.log('guard hashes', dynamic.flatMap((d) => d.guards.map((g) => `${path.basename(g.source)}:${g.sha256.slice(0, 12)}`)).join(' '))
console.log('path digests', dynamic.map((d) => hash(d.paths.map((l) => `${l}\n`).join('')).slice(0, 12)).join(' '))
console.log('wrote bytes ', Buffer.byteLength(source))

if (WRITE) {
    writeFileSync(path.join(root, 'scripts/assetDeliveryManifest.js'), source)
    console.log('WRITTEN scripts/assetDeliveryManifest.js')
    console.log('manifest sha256', hash(Buffer.from(source, 'utf8')), 'bytes', Buffer.byteLength(source))
    if (copyRootArg) console.log('copy root (unused for record binding):', copyRootArg)
}
