#!/usr/bin/env node
// scripts/genSlotRankArt.mjs — Wave 32 follow-up.
//
// Procedurally renders 1792x1024 PNG sprite atlases for the J/Q/K/A/10
// rank symbols of every slot template, themed per skin family.
// No external deps — uses Node's built-in `zlib` to encode raw RGBA -> PNG.
//
// Each atlas is a single wide PNG sliced into 5 equal-width columns
// (10, J, Q, K, A) so the slot factory can pick a slice by index.
//
// Output: public/assets/games/slots/<skin>/slot-rank-<template>.png

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import { Buffer } from 'node:buffer'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const W = 1792
const H = 1024
const COLS = 5
const TILE_W = Math.floor(W / COLS) // 358
const RANKS = ['10', 'J', 'Q', 'K', 'A']

// Per-template skin palette + theme.
const TEMPLATES = [
    { id: 'vault-rush',         dir: 'vault',    skin: 'bank',     name: 'Vault Rush',         palette: ['#f5c84b', '#0f1c30', '#3a2810'] },
    { id: 'river-catcher',      dir: 'catcher',  skin: 'catcher',  name: 'River Catcher',      palette: ['#ffd24d', '#06251a', '#3a2812'] },
    { id: 'dust-rail',          dir: 'western',  skin: 'western',  name: 'Dust Rail Bounty',   palette: ['#f1cc48', '#241308', '#5a3a18'] },
    { id: 'storm-banner',       dir: 'mythic',   skin: 'mythic',   name: 'Storm Banner',       palette: ['#9dd7ff', '#0a1830', '#2a4060'] },
    { id: 'bassline-bonus',     dir: 'rock',     skin: 'rock',     name: 'Bassline Bonus',     palette: ['#ff5fb7', '#1a0a1f', '#3a1a3f'] },
    { id: 'scarab-spin',        dir: 'mythic',   skin: 'mythic',   name: 'Scarab Spin',        palette: ['#ffcf5a', '#2a1a0a', '#5a3a1a'] },
    { id: 'bars',               dir: 'classic',  skin: 'classic',  name: 'Bars',               palette: ['#ffd166', '#1a0a08', '#400000'] },
    { id: 'blue-samurai',       dir: 'cyber',    skin: 'cyber',    name: 'Blue Samurai',       palette: ['#4cc9f0', '#0a142a', '#1a2a4a'] },
    { id: 'wanted-revelation',  dir: 'wanted',   skin: 'wanted',   name: 'Wanted Revelation',  palette: ['#f6a141', '#2a1a0a', '#4a2a16'] },
    { id: 'gates-ascent',       dir: 'olympus',  skin: 'olympus',  name: 'Gates of Ascent',    palette: ['#fbcd5b', '#1a1a2a', '#3a3a4a'] },
    { id: 'bass-bayou',         dir: 'bayou',    skin: 'bayou',    name: 'Bass Bayou',         palette: ['#9bd86b', '#0a1a0a', '#1a3a1a'] },
    { id: 'mummy-cascade',      dir: 'mummy',    skin: 'mummy',    name: 'Mummy Cascade',      palette: ['#f57c4a', '#1a0a0a', '#3a1a0a'] },
    { id: 'phoenix-megaways',   dir: 'phoenix',  skin: 'phoenix',  name: 'Phoenix Megaways',   palette: ['#ff6b3a', '#1a0a0a', '#3a0a0a'] },
    { id: 'mansion-megaways',   dir: 'mansion',  skin: 'mansion',  name: 'Mansion Megaways',   palette: ['#a47cff', '#0a0a1a', '#2a1a3a'] },
    { id: 'ghostblade-strike',  dir: 'ronin',    skin: 'ronin',    name: 'Ghostblade Strike',  palette: ['#5fd1ff', '#0a1a2a', '#1a2a3a'] },
    { id: 'iron-fist',          dir: 'iron',     skin: 'iron',     name: 'Iron Fist',          palette: ['#ff7b3a', '#1a0a0a', '#3a1a0a'] },
    { id: 'coop-cluck',         dir: 'coop',     skin: 'coop',     name: 'Coop Cluck',         palette: ['#ffd166', '#1a1a0a', '#3a2a0a'] },
    { id: 'miko-spirit',        dir: 'spirit',   skin: 'spirit',   name: 'Miko Spirit',        palette: ['#ff8db4', '#1a0a14', '#3a1a2a'] },
    { id: 'forge-anvil',        dir: 'forge',    skin: 'forge',    name: 'Forge Anvil',        palette: ['#ffae44', '#1a0a08', '#3a1a08'] },
    { id: 'gummy-drops',        dir: 'gummy',    skin: 'gummy',    name: 'Gummy Drops',        palette: ['#ff66c4', '#1a0a14', '#3a1a2a'] },
]

// ---- PNG encode helpers ----

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
    // Build raw scanlines with filter 0 (None) prepended per row.
    const rowLen = width * 4
    const raw = Buffer.alloc(height * (rowLen + 1))
    for (let y = 0; y < height; y += 1) {
        raw[y * (rowLen + 1)] = 0 // filter type none
        rgba.copy(raw, y * (rowLen + 1) + 1, y * rowLen, y * rowLen + rowLen)
    }
    const compressed = zlib.deflateSync(raw)

    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(width, 0)
    ihdr.writeUInt32BE(height, 4)
    ihdr[8] = 8        // bit depth
    ihdr[9] = 6        // color type RGBA
    ihdr[10] = 0       // compression
    ihdr[11] = 0       // filter
    ihdr[12] = 0       // interlace

    return Buffer.concat([
        sig,
        chunk('IHDR', ihdr),
        chunk('IDAT', compressed),
        chunk('IEND', Buffer.alloc(0)),
    ])
}

// ---- Image canvas ----

function canvas(w, h) {
    const buf = Buffer.alloc(w * h * 4) // all transparent (alpha = 0)
    return { w, h, buf }
}

function hexToRgb(hex) {
    const m = hex.replace('#', '')
    return [
        parseInt(m.slice(0, 2), 16),
        parseInt(m.slice(2, 4), 16),
        parseInt(m.slice(4, 6), 16),
    ]
}

function setPx(c, x, y, r, g, b, a = 255) {
    if (x < 0 || x >= c.w || y < 0 || y >= c.h) return
    const i = (y * c.w + x) * 4
    if (a >= 255) {
        c.buf[i] = r; c.buf[i + 1] = g; c.buf[i + 2] = b; c.buf[i + 3] = 255
        return
    }
    if (a <= 0) return
    // Alpha blend over existing pixel.
    const da = c.buf[i + 3] / 255
    const sa = a / 255
    const outA = sa + da * (1 - sa)
    if (outA <= 0) return
    c.buf[i] = Math.round((r * sa + c.buf[i] * da * (1 - sa)) / outA)
    c.buf[i + 1] = Math.round((g * sa + c.buf[i + 1] * da * (1 - sa)) / outA)
    c.buf[i + 2] = Math.round((b * sa + c.buf[i + 2] * da * (1 - sa)) / outA)
    c.buf[i + 3] = Math.round(outA * 255)
}

function fillRect(c, x0, y0, w, h, hex, alpha = 255) {
    const [r, g, b] = hexToRgb(hex)
    const x1 = Math.min(c.w, x0 + w)
    const y1 = Math.min(c.h, y0 + h)
    for (let y = Math.max(0, y0); y < y1; y += 1) {
        for (let x = Math.max(0, x0); x < x1; x += 1) {
            setPx(c, x, y, r, g, b, alpha)
        }
    }
}

function fillCircle(c, cx, cy, radius, hex, alpha = 255) {
    const [r, g, b] = hexToRgb(hex)
    const r2 = radius * radius
    const x0 = Math.max(0, Math.floor(cx - radius))
    const x1 = Math.min(c.w, Math.ceil(cx + radius))
    const y0 = Math.max(0, Math.floor(cy - radius))
    const y1 = Math.min(c.h, Math.ceil(cy + radius))
    for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
            const dx = x - cx
            const dy = y - cy
            const d2 = dx * dx + dy * dy
            if (d2 > r2) continue
            // Edge anti-aliasing.
            const d = Math.sqrt(d2)
            const a = d > radius - 1 ? Math.max(0, radius - d) : 1
            setPx(c, x, y, r, g, b, Math.round(alpha * a))
        }
    }
}

// Radial gradient fill within a circular region.
function radialGradient(c, cx, cy, radius, innerHex, outerHex, alpha = 255) {
    const [ir, ig, ib] = hexToRgb(innerHex)
    const [or, og, ob] = hexToRgb(outerHex)
    const r2 = radius * radius
    const x0 = Math.max(0, Math.floor(cx - radius))
    const x1 = Math.min(c.w, Math.ceil(cx + radius))
    const y0 = Math.max(0, Math.floor(cy - radius))
    const y1 = Math.min(c.h, Math.ceil(cy + radius))
    for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
            const dx = x - cx
            const dy = y - cy
            const d2 = dx * dx + dy * dy
            if (d2 > r2) continue
            const t = Math.sqrt(d2) / radius
            const r = Math.round(ir + (or - ir) * t)
            const g = Math.round(ig + (og - ig) * t)
            const b = Math.round(ib + (ob - ib) * t)
            const edgeFade = t > 0.95 ? Math.max(0, (1 - t) / 0.05) : 1
            setPx(c, x, y, r, g, b, Math.round(alpha * edgeFade))
        }
    }
}

// Linear gradient fill within a rectangular region.
function linearGradient(c, x0, y0, w, h, topHex, bottomHex, alpha = 255) {
    const [tr, tg, tb] = hexToRgb(topHex)
    const [br, bg, bb] = hexToRgb(bottomHex)
    for (let y = 0; y < h; y += 1) {
        const t = y / h
        const r = Math.round(tr + (br - tr) * t)
        const g = Math.round(tg + (bg - tg) * t)
        const b = Math.round(tb + (bb - tb) * t)
        for (let x = 0; x < w; x += 1) {
            setPx(c, x0 + x, y0 + y, r, g, b, alpha)
        }
    }
}

function strokeRect(c, x, y, w, h, thick, hex, alpha = 255) {
    fillRect(c, x, y, w, thick, hex, alpha)
    fillRect(c, x, y + h - thick, w, thick, hex, alpha)
    fillRect(c, x, y, thick, h, hex, alpha)
    fillRect(c, x + w - thick, y, thick, h, hex, alpha)
}

// ---- Rank glyph drawing ----
// Uses a 7-segment-ish blocky strokes so we don't need to ship a font.
// Each rank is drawn in a target box (bx, by, bw, bh) using strokes
// proportional to box size.

function drawGlyph(c, rank, bx, by, bw, bh, hex, alpha = 255) {
    const t = Math.max(8, Math.round(bh * 0.13))   // stroke thickness
    const cx = bx + bw / 2
    const cy = by + bh / 2
    const half = bh / 2
    const halfW = bw / 2
    const colorH = hex
    const A = alpha

    // Helpers for line segments.
    const hLine = (x, y, len) => fillRect(c, Math.round(x), Math.round(y - t / 2), Math.round(len), t, colorH, A)
    const vLine = (x, y, len) => fillRect(c, Math.round(x - t / 2), Math.round(y), t, Math.round(len), colorH, A)
    const diag = (x0, y0, x1, y1) => {
        // Bresenham-ish thick line.
        const dx = x1 - x0
        const dy = y1 - y0
        const steps = Math.max(Math.abs(dx), Math.abs(dy))
        for (let i = 0; i <= steps; i += 1) {
            const xi = x0 + (dx * i) / steps
            const yi = y0 + (dy * i) / steps
            fillCircle(c, xi, yi, t / 2, colorH, A)
        }
    }

    if (rank === 'A') {
        // Triangle outline + crossbar.
        const apex = { x: cx, y: by + bh * 0.05 }
        const left = { x: bx + bw * 0.18, y: by + bh * 0.95 }
        const right = { x: bx + bw * 0.82, y: by + bh * 0.95 }
        diag(apex.x, apex.y, left.x, left.y)
        diag(apex.x, apex.y, right.x, right.y)
        // Cross bar at ~60% down.
        const crossY = by + bh * 0.62
        const xLeft = bx + bw * 0.30
        const xRight = bx + bw * 0.70
        hLine(xLeft, crossY, xRight - xLeft)
        return
    }
    if (rank === 'K') {
        const top = by + bh * 0.05
        const bot = by + bh * 0.95
        const left = bx + bw * 0.20
        const mid = bx + bw * 0.52
        const right = bx + bw * 0.85
        // Vertical stem.
        vLine(left, top, bot - top)
        // Upper diagonal.
        diag(left, cy, right, top)
        // Lower diagonal.
        diag(left, cy, right, bot)
        // Inner mid-junction circle for cleanness.
        fillCircle(c, mid, cy, t / 2 + 1, colorH, A)
        return
    }
    if (rank === 'Q') {
        // Circle + small tail.
        const r = halfW * 0.7
        // Hollow circle: outer disc minus inner disc with same hex transparent inner.
        // Simpler: stroke ring as many concentric circles.
        for (let i = 0; i < t; i += 1) {
            // ring
            const rr = r - i
            if (rr <= 0) continue
            // draw circle outline by stepping angle.
            for (let a = 0; a < Math.PI * 2; a += 0.012) {
                const x = cx + Math.cos(a) * rr
                const y = cy + Math.sin(a) * rr
                fillCircle(c, x, y, 1.2, colorH, A)
            }
        }
        // tail: diagonal stroke from lower-right.
        diag(cx + r * 0.45, cy + r * 0.45, cx + r * 1.0, cy + r * 1.0)
        return
    }
    if (rank === 'J') {
        // Hook shape.
        const top = by + bh * 0.05
        const bot = by + bh * 0.78
        const stemX = bx + bw * 0.62
        // Top serif.
        hLine(stemX - bw * 0.18, top, bw * 0.36)
        // Vertical stem.
        vLine(stemX, top, bot - top)
        // Hook.
        for (let a = 0; a <= Math.PI; a += 0.08) {
            const r = bw * 0.18
            const x = stemX - r + Math.cos(Math.PI - a) * r
            const y = bot + Math.sin(a) * r
            fillCircle(c, x, y, t / 2, colorH, A)
        }
        return
    }
    if (rank === '10') {
        // Two glyphs: '1' and '0'.
        const oneX = bx + bw * 0.30
        const zeroX = bx + bw * 0.70
        const top = by + bh * 0.10
        const bot = by + bh * 0.90
        // '1' — diagonal serif + stem + base.
        vLine(oneX, top, bot - top)
        diag(oneX - bw * 0.10, top + bh * 0.10, oneX, top)
        hLine(oneX - bw * 0.12, bot, bw * 0.24)
        // '0' — ring.
        const r = bw * 0.18
        for (let i = 0; i < t; i += 1) {
            const rr = r - i
            if (rr <= 0) continue
            for (let a = 0; a < Math.PI * 2; a += 0.012) {
                const x = zeroX + Math.cos(a) * rr
                const y = cy + Math.sin(a) * rr * 1.4
                fillCircle(c, x, y, 1.2, colorH, A)
            }
        }
        return
    }
}

// ---- Tile composition ----

function darken(hex, amt) {
    const [r, g, b] = hexToRgb(hex)
    return `#${[r, g, b].map(v => Math.max(0, Math.round(v * (1 - amt)))).map(v => v.toString(16).padStart(2, '0')).join('')}`
}
function lighten(hex, amt) {
    const [r, g, b] = hexToRgb(hex)
    return `#${[r, g, b].map(v => Math.min(255, Math.round(v + (255 - v) * amt))).map(v => v.toString(16).padStart(2, '0')).join('')}`
}

function drawTile(c, ti, rank, palette) {
    const [accent, dark, mid] = palette
    const tx = ti * TILE_W
    const ty = 0
    const tw = TILE_W
    const th = H
    const padding = 30

    // Outer rounded plate background.
    linearGradient(c, tx + padding, ty + padding, tw - padding * 2, th - padding * 2, lighten(dark, 0.05), darken(dark, 0.4))

    // Inner accent panel.
    const innerX = tx + padding + 30
    const innerY = ty + padding + 30
    const innerW = tw - padding * 2 - 60
    const innerH = th - padding * 2 - 60
    radialGradient(c, tx + tw / 2, ty + th / 2, Math.min(innerW, innerH) * 0.55, lighten(accent, 0.3), mid, 240)

    // Accent border ring.
    strokeRect(c, innerX, innerY, innerW, innerH, 8, accent, 230)
    strokeRect(c, innerX + 18, innerY + 18, innerW - 36, innerH - 36, 4, lighten(accent, 0.4), 200)

    // Glyph in the centre.
    const gx = tx + 60
    const gy = 200
    const gw = tw - 120
    const gh = H - 400

    // Inner shadow first (slight offset).
    drawGlyph(c, rank, gx + 6, gy + 8, gw, gh, darken(accent, 0.65), 200)
    // Outer accent halo (offset 0, slightly enlarged).
    drawGlyph(c, rank, gx, gy, gw, gh, lighten(accent, 0.55), 255)
    // Inner highlight.
    drawGlyph(c, rank, gx + 2, gy - 2, gw, gh, '#ffffff', 140)
}

// ---- Main ----

async function generate() {
    let count = 0
    for (const tpl of TEMPLATES) {
        const c = canvas(W, H)
        for (let i = 0; i < COLS; i += 1) {
            drawTile(c, i, RANKS[i], tpl.palette)
        }
        const png = encodePng(W, H, c.buf)
        const out = join(ROOT, 'public', 'assets', 'games', 'slots', tpl.dir, `slot-rank-${tpl.id}.png`)
        await mkdir(dirname(out), { recursive: true })
        await writeFile(out, png)
        // eslint-disable-next-line no-console
        console.log(`  ${tpl.id} → ${out}`)
        count += 1
    }
    // eslint-disable-next-line no-console
    console.log(`[genSlotRankArt] wrote ${count} atlases`)
}

generate().catch(err => {
    // eslint-disable-next-line no-console
    console.error(err)
    process.exit(1)
})
