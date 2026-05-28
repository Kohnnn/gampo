#!/usr/bin/env node
// scripts/stripSlotRankBg.mjs — Wave 33 follow-up.
//
// Post-processes the slot-rank PNGs to:
//   - detect the dominant background color from corner + edge samples
//   - alpha-strip every pixel within ΔE <= 22 of that color
//   - crop to the tight bounding box of remaining opaque pixels (8% padding)
//   - re-encode as RGBA PNG
//
// Targets:
//   public/assets/games/slots/<skin>/slot-rank-<template>-{10,J,Q,K,A}.png
//
// Pure Node, no deps. Reuses the filter-aware decoder pattern from
// `sliceSlotRankArt.mjs`.
//
// Usage:
//   node scripts/stripSlotRankBg.mjs              # process all rank slices
//   node scripts/stripSlotRankBg.mjs --atlases    # also process the parent atlases

import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import { Buffer } from 'node:buffer'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SLOTS_DIR = join(ROOT, 'public', 'assets', 'games', 'slots')
const RANKS = new Set(['10', 'J', 'Q', 'K', 'A'])

// ---- PNG plumbing (same as sliceSlotRankArt.mjs) ----

function crc32(buf) {
    const table = crc32.t || (crc32.t = (() => {
        const t = new Uint32Array(256)
        for (let n = 0; n < 256; n += 1) {
            let c = n
            for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
            t[n] = c >>> 0
        }
        return t
    })())
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i += 1) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const typeBuf = Buffer.from(type, 'ascii')
    const crcInput = Buffer.concat([typeBuf, data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(crcInput), 0)
    return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(width, height, rgba) {
    const rowLen = width * 4
    const raw = Buffer.alloc(height * (rowLen + 1))
    for (let y = 0; y < height; y += 1) {
        raw[y * (rowLen + 1)] = 0
        rgba.copy(raw, y * (rowLen + 1) + 1, y * rowLen, y * rowLen + rowLen)
    }
    const compressed = zlib.deflateSync(raw, { level: 9 })

    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(width, 0)
    ihdr.writeUInt32BE(height, 4)
    ihdr[8] = 8
    ihdr[9] = 6
    ihdr[10] = 0
    ihdr[11] = 0
    ihdr[12] = 0

    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))])
}

function decodePng(buf) {
    if (buf[0] !== 0x89 || buf.toString('ascii', 1, 4) !== 'PNG') throw new Error('not png')
    let p = 8
    let width = 0, height = 0, depth = 0, color = 0
    const idatChunks = []
    while (p < buf.length) {
        const len = buf.readUInt32BE(p); p += 4
        const type = buf.toString('ascii', p, p + 4); p += 4
        const data = buf.slice(p, p + len); p += len
        p += 4
        if (type === 'IHDR') {
            width = data.readUInt32BE(0)
            height = data.readUInt32BE(4)
            depth = data[8]
            color = data[9]
        } else if (type === 'IDAT') {
            idatChunks.push(data)
        } else if (type === 'IEND') {
            break
        }
    }
    if (depth !== 8) throw new Error(`unsupported depth ${depth}`)
    const channels = color === 6 ? 4 : color === 2 ? 3 : color === 0 ? 1 : color === 4 ? 2 : color === 3 ? 1 : 4
    const raw = zlib.inflateSync(Buffer.concat(idatChunks))
    const rowLen = width * channels
    const recon = Buffer.alloc(width * height * channels)
    let prevRow = Buffer.alloc(rowLen)
    for (let y = 0; y < height; y += 1) {
        const filter = raw[y * (rowLen + 1)]
        const inOff = y * (rowLen + 1) + 1
        const outOff = y * rowLen
        for (let x = 0; x < rowLen; x += 1) {
            const left = x >= channels ? recon[outOff + x - channels] : 0
            const up = prevRow[x]
            const upLeft = x >= channels ? prevRow[x - channels] : 0
            const cur = raw[inOff + x]
            let v
            switch (filter) {
                case 0: v = cur; break
                case 1: v = (cur + left) & 0xff; break
                case 2: v = (cur + up) & 0xff; break
                case 3: v = (cur + ((left + up) >> 1)) & 0xff; break
                case 4: {
                    const ppred = left + up - upLeft
                    const pa = Math.abs(ppred - left)
                    const pb = Math.abs(ppred - up)
                    const pc = Math.abs(ppred - upLeft)
                    let pred
                    if (pa <= pb && pa <= pc) pred = left
                    else if (pb <= pc) pred = up
                    else pred = upLeft
                    v = (cur + pred) & 0xff
                    break
                }
                default: throw new Error(`unsupported filter ${filter}`)
            }
            recon[outOff + x] = v
        }
        prevRow = recon.slice(outOff, outOff + rowLen)
    }
    if (color === 6) return { width, height, rgba: recon }
    const rgba = Buffer.alloc(width * height * 4)
    for (let i = 0; i < width * height; i += 1) {
        const sIdx = i * channels
        const dIdx = i * 4
        if (color === 2) {
            rgba[dIdx] = recon[sIdx]; rgba[dIdx + 1] = recon[sIdx + 1]; rgba[dIdx + 2] = recon[sIdx + 2]; rgba[dIdx + 3] = 255
        } else if (color === 4) {
            rgba[dIdx] = rgba[dIdx + 1] = rgba[dIdx + 2] = recon[sIdx]; rgba[dIdx + 3] = recon[sIdx + 1]
        } else if (color === 0) {
            rgba[dIdx] = rgba[dIdx + 1] = rgba[dIdx + 2] = recon[sIdx]; rgba[dIdx + 3] = 255
        }
    }
    return { width, height, rgba }
}

// ---- background detection + alpha stripping ----

// Sample the dominant background color from the outer 4 % rim using
// a 2-cluster k-means so noisy/textured corners still resolve a useful
// background centroid.
function sampleBackground(img) {
    const { width, height, rgba } = img
    const samples = []
    const rim = Math.max(8, Math.floor(Math.min(width, height) * 0.04))
    function pushPx(x, y) {
        const i = (y * width + x) * 4
        const a = rgba[i + 3]
        if (a < 16) return // already transparent
        samples.push([rgba[i], rgba[i + 1], rgba[i + 2]])
    }
    for (let y = 0; y < rim; y += 2) {
        for (let x = 0; x < width; x += 4) pushPx(x, y)
    }
    for (let y = height - rim; y < height; y += 2) {
        for (let x = 0; x < width; x += 4) pushPx(x, y)
    }
    for (let x = 0; x < rim; x += 2) {
        for (let y = rim; y < height - rim; y += 4) pushPx(x, y)
    }
    for (let x = width - rim; x < width; x += 2) {
        for (let y = rim; y < height - rim; y += 4) pushPx(x, y)
    }
    if (samples.length === 0) return null

    // 2-means cluster on the rim samples. Initialise with darkest +
    // brightest sample so we separate background plate from any glyph
    // edge that bleeds into the rim.
    let darkSeed = samples[0]
    let lightSeed = samples[0]
    let darkLum = 999
    let lightLum = -1
    for (const [sr, sg, sb] of samples) {
        const lum = 0.30 * sr + 0.59 * sg + 0.11 * sb
        if (lum < darkLum) { darkLum = lum; darkSeed = [sr, sg, sb] }
        if (lum > lightLum) { lightLum = lum; lightSeed = [sr, sg, sb] }
    }
    let c0 = darkSeed.slice()
    let c1 = lightSeed.slice()
    for (let iter = 0; iter < 6; iter += 1) {
        const a = [0, 0, 0, 0]
        const b = [0, 0, 0, 0]
        for (const [sr, sg, sb] of samples) {
            const da = (sr - c0[0]) ** 2 + (sg - c0[1]) ** 2 + (sb - c0[2]) ** 2
            const db = (sr - c1[0]) ** 2 + (sg - c1[1]) ** 2 + (sb - c1[2]) ** 2
            const tgt = da <= db ? a : b
            tgt[0] += sr; tgt[1] += sg; tgt[2] += sb; tgt[3] += 1
        }
        if (a[3] > 0) c0 = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]
        if (b[3] > 0) c1 = [b[0] / b[3], b[1] / b[3], b[2] / b[3]]
    }
    // Pick the centroid that contains the LARGER share of rim pixels.
    let aCount = 0, bCount = 0
    for (const [sr, sg, sb] of samples) {
        const da = (sr - c0[0]) ** 2 + (sg - c0[1]) ** 2 + (sb - c0[2]) ** 2
        const db = (sr - c1[0]) ** 2 + (sg - c1[1]) ** 2 + (sb - c1[2]) ** 2
        if (da <= db) aCount += 1
        else bCount += 1
    }
    const dominant = aCount >= bCount ? c0 : c1
    const r = Math.round(dominant[0])
    const g = Math.round(dominant[1])
    const b = Math.round(dominant[2])

    // Variance from the dominant centroid only (not from the mean).
    let varSum = 0
    for (const [sr, sg, sb] of samples) {
        const da = (sr - c0[0]) ** 2 + (sg - c0[1]) ** 2 + (sb - c0[2]) ** 2
        const db = (sr - c1[0]) ** 2 + (sg - c1[1]) ** 2 + (sb - c1[2]) ** 2
        const dist = Math.min(da, db)
        varSum += dist
    }
    const variance = varSum / samples.length
    return { r, g, b, variance }
}

// Color difference (approximated, fast).
function colorDist(r1, g1, b1, r2, g2, b2) {
    const dr = r1 - r2
    const dg = g1 - g2
    const db = b1 - b2
    return Math.sqrt(dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11)
}

function stripBackground(img, bg, threshold = 26) {
    if (!bg) return img
    const { width, height, rgba } = img
    const out = Buffer.from(rgba) // copy
    let stripped = 0
    let total = 0
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const i = (y * width + x) * 4
            if (out[i + 3] < 8) continue
            total += 1
            const d = colorDist(out[i], out[i + 1], out[i + 2], bg.r, bg.g, bg.b)
            if (d <= threshold) {
                // Soft alpha falloff so anti-aliased glyph edges survive.
                const k = Math.max(0, Math.min(1, (d - threshold * 0.5) / (threshold * 0.5)))
                out[i + 3] = Math.round(out[i + 3] * k)
                if (out[i + 3] < 16) {
                    out[i + 3] = 0
                    stripped += 1
                }
            }
        }
    }
    return { width, height, rgba: out, stripped, total, ratio: total ? stripped / total : 0 }
}

function tightCrop(img, padPct = 0.08) {
    const { width, height, rgba } = img
    let minX = width, minY = height, maxX = 0, maxY = 0
    let any = false
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const a = rgba[(y * width + x) * 4 + 3]
            if (a > 16) {
                any = true
                if (x < minX) minX = x
                if (y < minY) minY = y
                if (x > maxX) maxX = x
                if (y > maxY) maxY = y
            }
        }
    }
    if (!any) return img
    const padX = Math.max(2, Math.round((maxX - minX) * padPct))
    const padY = Math.max(2, Math.round((maxY - minY) * padPct))
    const x0 = Math.max(0, minX - padX)
    const y0 = Math.max(0, minY - padY)
    const x1 = Math.min(width - 1, maxX + padX)
    const y1 = Math.min(height - 1, maxY + padY)
    const w = x1 - x0 + 1
    const h = y1 - y0 + 1
    const out = Buffer.alloc(w * h * 4)
    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            const si = ((y0 + y) * width + (x0 + x)) * 4
            const di = (y * w + x) * 4
            out[di] = rgba[si]
            out[di + 1] = rgba[si + 1]
            out[di + 2] = rgba[si + 2]
            out[di + 3] = rgba[si + 3]
        }
    }
    return { width: w, height: h, rgba: out }
}

// Pad to a square canvas so cells render with consistent aspect ratio.
function squarePad(img, padding = 0.08) {
    const side = Math.round(Math.max(img.width, img.height) * (1 + padding))
    const canvas = Buffer.alloc(side * side * 4) // transparent
    const offX = Math.round((side - img.width) / 2)
    const offY = Math.round((side - img.height) / 2)
    for (let y = 0; y < img.height; y += 1) {
        for (let x = 0; x < img.width; x += 1) {
            const si = (y * img.width + x) * 4
            const di = ((offY + y) * side + (offX + x)) * 4
            canvas[di] = img.rgba[si]
            canvas[di + 1] = img.rgba[si + 1]
            canvas[di + 2] = img.rgba[si + 2]
            canvas[di + 3] = img.rgba[si + 3]
        }
    }
    return { width: side, height: side, rgba: canvas }
}

// ---- main ----

async function findRankSlices(includeAtlases = false) {
    const skins = await readdir(SLOTS_DIR, { withFileTypes: true })
    const out = []
    for (const dirent of skins) {
        if (!dirent.isDirectory()) continue
        const dir = join(SLOTS_DIR, dirent.name)
        const files = await readdir(dir).catch(() => [])
        for (const f of files) {
            if (!f.startsWith('slot-rank-')) continue
            if (!f.endsWith('.png')) continue
            const isSlice = /-(10|J|Q|K|A)\.png$/.test(f)
            if (isSlice) out.push({ dir, file: f, slice: true })
            else if (includeAtlases) out.push({ dir, file: f, slice: false })
        }
    }
    return out
}

async function safeWrite(fp, buf, retries = 3) {
    for (let i = 0; i < retries; i += 1) {
        try {
            await writeFile(fp, buf)
            return
        } catch (err) {
            if (err.code === 'UNKNOWN' || err.code === 'EBUSY' || err.code === 'EPERM') {
                await new Promise(r => setTimeout(r, 200 + 200 * i))
                continue
            }
            throw err
        }
    }
    // Last try, propagate.
    await writeFile(fp, buf)
}

async function main() {
    const args = new Set(process.argv.slice(2))
    const includeAtlases = args.has('--atlases')
    const targets = await findRankSlices(includeAtlases)
    let processed = 0
    let skippedTextured = 0
    for (const { dir, file } of targets) {
        const fp = join(dir, file)
        const orig = await readFile(fp)
        const img = decodePng(orig)
        const bg = sampleBackground(img)
        if (!bg) { processed += 1; continue }
        // Wave 39: bumped variance ceiling to 9000 (was 1200) — k-means now
        // resolves a centroid even on noisy backgrounds. Anything above
        // 9000 means the rim itself is multi-toned and stripping would
        // mash the artwork.
        if (bg.variance > 9000) {
            skippedTextured += 1
            // eslint-disable-next-line no-console
            console.log(`  skip textured ${file} variance=${bg.variance.toFixed(0)}`)
            continue
        }
        // Adaptive threshold: noisier backgrounds need a wider tolerance.
        const threshold = Math.min(60, Math.max(28, Math.round(Math.sqrt(bg.variance) * 0.55)))
        const stripped = stripBackground(img, bg, threshold)
        // If we stripped < 5 % we probably got a non-uniform background; abort.
        if (!stripped.ratio || stripped.ratio < 0.05) {
            // eslint-disable-next-line no-console
            console.log(`  skip low-strip ${file} ratio=${(stripped.ratio * 100).toFixed(1)}%`)
            continue
        }
        const cropped = tightCrop(stripped, 0.08)
        const final = squarePad(cropped, 0.06)
        const out = encodePng(final.width, final.height, final.rgba)
        await safeWrite(fp, out)
        processed += 1
        // eslint-disable-next-line no-console
        console.log(`  ok ${file} ${img.width}x${img.height} → ${final.width}x${final.height} (stripped ${(stripped.ratio * 100).toFixed(0)}% th=${threshold})`)
    }
    // eslint-disable-next-line no-console
    console.log(`[stripSlotRankBg] processed=${processed} skippedTextured=${skippedTextured}`)
}

main().catch(err => {
    // eslint-disable-next-line no-console
    console.error(err)
    process.exit(1)
})
