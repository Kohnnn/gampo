#!/usr/bin/env node
// scripts/sliceSlotRankArt.mjs — Wave 32 follow-up.
//
// Slices each slot-rank-<template>.png atlas (1792x1024, 5 columns)
// into 5 individual rank PNGs (358x1024 each):
//   slot-rank-<template>-10.png
//   slot-rank-<template>-J.png
//   slot-rank-<template>-Q.png
//   slot-rank-<template>-K.png
//   slot-rank-<template>-A.png
//
// Pure Node — uses zlib + manual PNG parse/encode to avoid deps.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import { Buffer } from 'node:buffer'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SLOTS_DIR = join(ROOT, 'public', 'assets', 'games', 'slots')

const RANKS = ['10', 'J', 'Q', 'K', 'A']

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
    const compressed = zlib.deflateSync(raw)

    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(width, 0)
    ihdr.writeUInt32BE(height, 4)
    ihdr[8] = 8
    ihdr[9] = 6
    ihdr[10] = 0
    ihdr[11] = 0
    ihdr[12] = 0

    return Buffer.concat([
        sig,
        chunk('IHDR', ihdr),
        chunk('IDAT', compressed),
        chunk('IEND', Buffer.alloc(0)),
    ])
}

// Parse a PNG file. Supports filter types 0-4 (per PNG spec).
function decodePng(buf) {
    if (buf[0] !== 0x89 || buf.toString('ascii', 1, 4) !== 'PNG') throw new Error('not png')
    let p = 8
    let width = 0, height = 0, depth = 0, color = 0
    const idatChunks = []
    while (p < buf.length) {
        const len = buf.readUInt32BE(p); p += 4
        const type = buf.toString('ascii', p, p + 4); p += 4
        const data = buf.slice(p, p + len); p += len
        p += 4 // crc
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
    // Apply PNG filters to recover the raw pixel data.
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
                    const p = left + up - upLeft
                    const pa = Math.abs(p - left)
                    const pb = Math.abs(p - up)
                    const pc = Math.abs(p - upLeft)
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
    // Convert to RGBA.
    if (color === 6) {
        return { width, height, rgba: recon }
    }
    const rgba = Buffer.alloc(width * height * 4)
    for (let i = 0; i < width * height; i += 1) {
        const sIdx = i * channels
        const dIdx = i * 4
        if (color === 2) {
            rgba[dIdx] = recon[sIdx]
            rgba[dIdx + 1] = recon[sIdx + 1]
            rgba[dIdx + 2] = recon[sIdx + 2]
            rgba[dIdx + 3] = 255
        } else if (color === 4) {
            rgba[dIdx] = rgba[dIdx + 1] = rgba[dIdx + 2] = recon[sIdx]
            rgba[dIdx + 3] = recon[sIdx + 1]
        } else if (color === 0) {
            rgba[dIdx] = rgba[dIdx + 1] = rgba[dIdx + 2] = recon[sIdx]
            rgba[dIdx + 3] = 255
        }
    }
    return { width, height, rgba }
}

function sliceColumn(src, sx, sw) {
    // Crop column [sx, sx + sw) at full height.
    const out = Buffer.alloc(sw * src.height * 4)
    for (let y = 0; y < src.height; y += 1) {
        for (let x = 0; x < sw; x += 1) {
            const si = (y * src.width + (sx + x)) * 4
            const di = (y * sw + x) * 4
            out[di] = src.rgba[si]
            out[di + 1] = src.rgba[si + 1]
            out[di + 2] = src.rgba[si + 2]
            out[di + 3] = src.rgba[si + 3]
        }
    }
    return { width: sw, height: src.height, rgba: out }
}

async function findAtlases() {
    const skins = await readdir(SLOTS_DIR, { withFileTypes: true })
    const atlases = []
    for (const dirent of skins) {
        if (!dirent.isDirectory()) continue
        const dir = join(SLOTS_DIR, dirent.name)
        const files = await readdir(dir).catch(() => [])
        for (const f of files) {
            if (f.startsWith('slot-rank-') && f.endsWith('.png') && !RANKS.some(r => f.endsWith(`-${r}.png`))) {
                atlases.push({ dir, file: f, name: basename(f, '.png') })
            }
        }
    }
    return atlases
}

async function main() {
    const atlases = await findAtlases()
    let total = 0
    for (const { dir, file, name } of atlases) {
        const fp = join(dir, file)
        const png = decodePng(await readFile(fp))
        const cols = 5
        const colW = Math.floor(png.width / cols)
        for (let i = 0; i < cols; i += 1) {
            const slice = sliceColumn(png, i * colW, colW)
            const out = encodePng(slice.width, slice.height, slice.rgba)
            const fname = `${name}-${RANKS[i]}.png`
            await writeFile(join(dir, fname), out)
            total += 1
        }
        // eslint-disable-next-line no-console
        console.log(`  ${name} → ${cols} slices`)
    }
    // eslint-disable-next-line no-console
    console.log(`[sliceSlotRankArt] wrote ${total} per-rank PNGs`)
}

main().catch(err => {
    // eslint-disable-next-line no-console
    console.error(err)
    process.exit(1)
})
