#!/usr/bin/env node
// scripts/genSfx.mjs — Wave 29 procedural 16-bit-style SFX/BGM generator.
//
// Synthesizes mono 44.1 kHz 16-bit PCM WAV files into `public/audio/`.
// No external deps; pure Node + Buffer. Re-runs are idempotent — files
// are always overwritten so re-running picks up tweaks.
//
// Usage:
//   node scripts/genSfx.mjs           # writes everything
//   node scripts/genSfx.mjs --bgm     # only BGM loops
//   node scripts/genSfx.mjs --sfx     # only SFX one-shots
//
// 16-bit-style timbre is achieved with square + triangle oscillators,
// short envelope decay, and integer-frequency noise bursts. The result
// reads as SNES/Mega Drive era arcade casino: punchy, retro, mute-safe.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---- WAV helpers ----

function floatsToPCM16(samples, normalize = 0.85) {
    const out = new Int16Array(samples.length)
    let peak = 0
    for (let i = 0; i < samples.length; i += 1) {
        const a = Math.abs(samples[i])
        if (a > peak) peak = a
    }
    const k = peak > 0 ? (normalize * 32760) / peak : 0
    for (let i = 0; i < samples.length; i += 1) {
        const v = Math.max(-32768, Math.min(32767, Math.round(samples[i] * k)))
        out[i] = v
    }
    return out
}

function wavBuffer(int16) {
    const dataBytes = int16.byteLength
    const buf = Buffer.alloc(44 + dataBytes)
    let p = 0
    buf.write('RIFF', p); p += 4
    buf.writeUInt32LE(36 + dataBytes, p); p += 4
    buf.write('WAVE', p); p += 4
    buf.write('fmt ', p); p += 4
    buf.writeUInt32LE(16, p); p += 4 // fmt chunk size
    buf.writeUInt16LE(1, p); p += 2  // PCM
    buf.writeUInt16LE(1, p); p += 2  // mono
    buf.writeUInt32LE(SR, p); p += 4
    buf.writeUInt32LE(SR * 2, p); p += 4 // byte rate
    buf.writeUInt16LE(2, p); p += 2  // block align
    buf.writeUInt16LE(16, p); p += 2 // bits/sample
    buf.write('data', p); p += 4
    buf.writeUInt32LE(dataBytes, p); p += 4
    Buffer.from(int16.buffer, int16.byteOffset, dataBytes).copy(buf, p)
    return buf
}

// ---- Oscillators ----

function square(t, f) {
    return Math.sin(2 * Math.PI * f * t) >= 0 ? 0.6 : -0.6
}
function triangle(t, f) {
    const phase = (t * f) % 1
    return phase < 0.5 ? -1 + 4 * phase : 3 - 4 * phase
}
function noise() {
    return Math.random() * 2 - 1
}

function envelope(i, n, attack = 0.01, decay = 0.05) {
    const t = i / n
    if (t < attack) return t / attack
    if (t > 1 - decay) return Math.max(0, (1 - t) / decay)
    return 1
}

// ---- SFX one-shots ----

function blip({ freq = 880, durMs = 80, type = 'square', glide = 1 }) {
    const n = Math.floor(SR * (durMs / 1000))
    const out = new Float32Array(n)
    for (let i = 0; i < n; i += 1) {
        const t = i / SR
        const f = freq * Math.pow(glide, t * (1000 / durMs))
        const v = type === 'square' ? square(t, f) : triangle(t, f)
        out[i] = v * envelope(i, n, 0.005, 0.4)
    }
    return out
}

function noiseBurst({ durMs = 70, lpFreq = 4500 }) {
    const n = Math.floor(SR * (durMs / 1000))
    const out = new Float32Array(n)
    let prev = 0
    const a = Math.exp(-2 * Math.PI * lpFreq / SR)
    for (let i = 0; i < n; i += 1) {
        const x = noise()
        prev = (1 - a) * x + a * prev
        out[i] = prev * envelope(i, n, 0.001, 0.6)
    }
    return out
}

function chord({ freqs = [440, 660, 880], durMs = 200 }) {
    const n = Math.floor(SR * (durMs / 1000))
    const out = new Float32Array(n)
    for (let i = 0; i < n; i += 1) {
        const t = i / SR
        let v = 0
        for (const f of freqs) v += square(t, f) * 0.4
        v /= freqs.length
        out[i] = v * envelope(i, n, 0.01, 0.5)
    }
    return out
}

function sequence(parts) {
    // parts: [{ samples, gainDb, gapMs }]
    let total = 0
    let totalSamples = []
    for (const p of parts) {
        totalSamples.push(p.samples)
        total += p.samples.length + Math.floor(SR * ((p.gapMs || 0) / 1000))
    }
    const out = new Float32Array(total)
    let cursor = 0
    for (const p of parts) {
        const g = Math.pow(10, (p.gainDb || 0) / 20)
        for (let i = 0; i < p.samples.length; i += 1) {
            out[cursor + i] = p.samples[i] * g
        }
        cursor += p.samples.length + Math.floor(SR * ((p.gapMs || 0) / 1000))
    }
    return out
}

// ---- Catalog ----

const SFX = {
    'common/click.wav':   () => blip({ freq: 880,  durMs: 35,  type: 'square' }),
    'common/reveal.wav':  () => sequence([
        { samples: blip({ freq: 660,  durMs: 60,  type: 'square' }) },
        { samples: blip({ freq: 990,  durMs: 80,  type: 'triangle' }) },
    ]),
    'common/win.wav':     () => sequence([
        { samples: blip({ freq: 660,  durMs: 70,  type: 'square' }) },
        { samples: blip({ freq: 880,  durMs: 70,  type: 'square' }) },
        { samples: blip({ freq: 1320, durMs: 160, type: 'square', glide: 1.4 }) },
    ]),
    'common/lose.wav':    () => sequence([
        { samples: blip({ freq: 320, durMs: 160, type: 'triangle', glide: 0.55 }) },
        { samples: blip({ freq: 220, durMs: 200, type: 'triangle', glide: 0.5 }) },
    ]),
    'common/cashout.wav': () => sequence([
        { samples: blip({ freq: 880, durMs: 50,  type: 'square' }) },
        { samples: blip({ freq: 1320, durMs: 80, type: 'square' }) },
        { samples: blip({ freq: 1760, durMs: 120, type: 'triangle', glide: 1.2 }) },
    ]),
    'common/bigwin.wav':  () => sequence([
        { samples: blip({ freq: 523,  durMs: 100, type: 'square' }) },
        { samples: blip({ freq: 659,  durMs: 100, type: 'square' }) },
        { samples: blip({ freq: 784,  durMs: 100, type: 'square' }) },
        { samples: blip({ freq: 1046, durMs: 200, type: 'square' }) },
        { samples: chord({ freqs: [1046, 1318, 1568], durMs: 380 }) },
    ]),

    // Cases
    'cases/open.wav':   () => sequence([
        { samples: noiseBurst({ durMs: 40, lpFreq: 6000 }) },
        { samples: blip({ freq: 220, durMs: 60, type: 'triangle' }) },
    ]),
    'cases/tick.wav':   () => blip({ freq: 1320, durMs: 22, type: 'square' }),
    'cases/land.wav':   () => sequence([
        { samples: blip({ freq: 110, durMs: 60, type: 'triangle' }) },
        { samples: noiseBurst({ durMs: 100, lpFreq: 1800 }), gainDb: -3 },
    ]),
    'cases/rare.wav':   () => sequence([
        { samples: blip({ freq: 660,  durMs: 70, type: 'square' }) },
        { samples: blip({ freq: 988,  durMs: 70, type: 'square' }) },
        { samples: blip({ freq: 1320, durMs: 100, type: 'triangle' }) },
        { samples: chord({ freqs: [1568, 1976, 2349], durMs: 380 }) },
    ]),
    'cases/reveal.wav': () => blip({ freq: 1100, durMs: 90, type: 'triangle', glide: 1.2 }),
    'cases/win.wav':    () => sequence([
        { samples: blip({ freq: 660,  durMs: 50, type: 'square' }) },
        { samples: blip({ freq: 880,  durMs: 50, type: 'square' }) },
        { samples: blip({ freq: 1320, durMs: 120, type: 'triangle', glide: 1.2 }) },
    ]),
    'cases/lose.wav':   () => sequence([
        { samples: blip({ freq: 220, durMs: 200, type: 'triangle', glide: 0.5 }) },
    ]),
    // Wave 31: extra case SFX variants
    'cases/knife.wav':  () => sequence([
        { samples: blip({ freq: 220, durMs: 30, type: 'square' }) },
        { samples: noiseBurst({ durMs: 30, lpFreq: 6000 }), gainDb: -3 },
        { samples: blip({ freq: 1318, durMs: 80, type: 'triangle', glide: 1.6 }) },
        { samples: chord({ freqs: [1568, 2093, 2637], durMs: 480 }) },
    ]),
    'cases/gloves.wav': () => sequence([
        { samples: blip({ freq: 660, durMs: 60, type: 'square' }) },
        { samples: chord({ freqs: [880, 1108, 1318], durMs: 220 }) },
        { samples: blip({ freq: 1760, durMs: 200, type: 'triangle', glide: 1.4 }) },
    ]),
    'cases/stattrak.wav': () => sequence([
        { samples: blip({ freq: 1500, durMs: 30, type: 'square' }) },
        { samples: blip({ freq: 1760, durMs: 30, type: 'square' }) },
        { samples: blip({ freq: 2349, durMs: 100, type: 'triangle' }) },
    ]),
    'cases/souvenir.wav': () => sequence([
        { samples: blip({ freq: 988,  durMs: 70, type: 'square' }) },
        { samples: blip({ freq: 1318, durMs: 70, type: 'square' }) },
        { samples: chord({ freqs: [1976, 2349], durMs: 280 }) },
    ]),
    'cases/multispin.wav': () => sequence([
        { samples: noiseBurst({ durMs: 60, lpFreq: 5000 }) },
        { samples: blip({ freq: 220, durMs: 80, type: 'triangle' }) },
        { samples: blip({ freq: 440, durMs: 80, type: 'square' }), gainDb: -3 },
    ]),
    'cases/lid.wav':    () => sequence([
        { samples: noiseBurst({ durMs: 60, lpFreq: 2200 }) },
        { samples: blip({ freq: 110, durMs: 50, type: 'triangle' }) },
    ]),

    // Slot one-shots (cross-template; templates use these via slot SFX hook)
    'slots/spinStart.wav':     () => sequence([
        { samples: noiseBurst({ durMs: 30, lpFreq: 3500 }) },
        { samples: blip({ freq: 440, durMs: 60, type: 'square' }) },
    ]),
    'slots/reelStop.wav':      () => sequence([
        { samples: blip({ freq: 220, durMs: 40, type: 'square' }) },
        { samples: noiseBurst({ durMs: 30, lpFreq: 1500 }), gainDb: -6 },
    ]),
    'slots/reelTick.wav':      () => blip({ freq: 1500, durMs: 18, type: 'square' }),
    'slots/winLine.wav':       () => sequence([
        { samples: blip({ freq: 880, durMs: 60, type: 'square' }) },
        { samples: blip({ freq: 1108, durMs: 60, type: 'square' }) },
        { samples: blip({ freq: 1318, durMs: 80, type: 'triangle' }) },
    ]),
    'slots/scatter.wav':       () => sequence([
        { samples: blip({ freq: 587, durMs: 50, type: 'square' }) },
        { samples: blip({ freq: 740, durMs: 50, type: 'square' }) },
        { samples: blip({ freq: 988, durMs: 50, type: 'square' }) },
        { samples: blip({ freq: 1318, durMs: 200, type: 'triangle', glide: 1.4 }) },
    ]),
    'slots/wheelLand.wav':     () => sequence([
        { samples: blip({ freq: 1500, durMs: 60, type: 'square' }) },
        { samples: blip({ freq: 880,  durMs: 60, type: 'square' }) },
        { samples: blip({ freq: 660,  durMs: 100, type: 'triangle', glide: 0.6 }) },
    ]),
    'slots/holdFill.wav':      () => sequence([
        { samples: blip({ freq: 660, durMs: 30, type: 'square' }) },
        { samples: blip({ freq: 990, durMs: 50, type: 'triangle' }) },
    ]),
    'slots/stickyLock.wav':    () => sequence([
        { samples: blip({ freq: 1100, durMs: 40, type: 'square' }) },
        { samples: noiseBurst({ durMs: 60, lpFreq: 4500 }), gainDb: -3 },
    ]),
    'slots/mysteryReveal.wav': () => sequence([
        { samples: blip({ freq: 660, durMs: 80, type: 'triangle', glide: 1.5 }) },
        { samples: blip({ freq: 1320, durMs: 120, type: 'square' }) },
    ]),
    'slots/wantedSlam.wav':    () => sequence([
        { samples: noiseBurst({ durMs: 80, lpFreq: 1500 }) },
        { samples: blip({ freq: 110, durMs: 80, type: 'triangle' }), gainDb: -3 },
    ]),
    'slots/moneyCollect.wav':  () => sequence([
        { samples: blip({ freq: 880, durMs: 35, type: 'square' }) },
        { samples: blip({ freq: 1100, durMs: 35, type: 'square' }) },
        { samples: blip({ freq: 1320, durMs: 60, type: 'triangle', glide: 1.3 }) },
    ]),
    'slots/cascadeStep.wav':   () => blip({ freq: 1100, durMs: 30, type: 'square' }),
    'slots/anticipation.wav':  () => sequence([
        { samples: blip({ freq: 220, durMs: 200, type: 'triangle', glide: 1.6 }) },
    ]),

    // Cross-game shared (some games already use these key names via AudioProvider's
    // built-in chiptune; the manifest binaries here let useSfx use them too)
    'crash/tick.wav':          () => blip({ freq: 1500, durMs: 18, type: 'square' }),
    'crash/cashout.wav':       () => sequence([
        { samples: blip({ freq: 880, durMs: 60, type: 'square' }) },
        { samples: blip({ freq: 1320, durMs: 100, type: 'triangle' }) },
    ]),
    'plinko/peg.wav':          () => blip({ freq: 1320, durMs: 22, type: 'square' }),
    'plinko/bucket.wav':       () => sequence([
        { samples: blip({ freq: 220, durMs: 60, type: 'triangle' }) },
        { samples: blip({ freq: 660, durMs: 100, type: 'square' }) },
    ]),
    'mines/reveal.wav':        () => sequence([
        { samples: blip({ freq: 660, durMs: 60, type: 'square' }) },
        { samples: blip({ freq: 990, durMs: 60, type: 'triangle' }) },
    ]),
    'dice/roll.wav':           () => noiseBurst({ durMs: 80, lpFreq: 3000 }),
    'dice/land.wav':           () => sequence([
        { samples: blip({ freq: 110, durMs: 50, type: 'triangle' }) },
        { samples: noiseBurst({ durMs: 30, lpFreq: 1500 }), gainDb: -3 },
    ]),
}

// ---- BGM loops (8s each, looped) ----

function bgmLoop({ durMs = 8000, melody, bass, type = 'square', tempoBpm = 92 }) {
    const n = Math.floor(SR * (durMs / 1000))
    const out = new Float32Array(n)
    const beat = 60 / tempoBpm
    for (let i = 0; i < n; i += 1) {
        const t = i / SR
        const beatIdx = Math.floor(t / (beat / 2)) % melody.length
        const bassIdx = Math.floor(t / beat) % bass.length
        const m = melody[beatIdx]
        const b = bass[bassIdx]
        const env = 0.6 * Math.exp(-((t / (beat / 2)) % 1) * 1.5)
        const v = (m ? square(t, m) * env * 0.45 : 0) + (b ? triangle(t, b) * 0.25 : 0)
        out[i] = v
    }
    // Crossfade ends so the loop is seamless.
    const fadeN = Math.floor(SR * 0.1)
    for (let i = 0; i < fadeN; i += 1) {
        const k = i / fadeN
        out[i] *= k
        out[n - 1 - i] *= k
    }
    return out
}

const BGM = {
    // Common skin families with simple tritone-friendly motifs.
    'bgm/classic/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 96,
        melody: [523, 0, 659, 0, 784, 0, 659, 0, 523, 587, 659, 587, 523, 0, 392, 0],
        bass:   [262, 196, 220, 247],
    }),
    'bgm/mythic/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 88,
        melody: [440, 0, 523, 0, 659, 0, 523, 0, 440, 0, 392, 0, 349, 392, 440, 0],
        bass:   [220, 175, 196, 220],
    }),
    'bgm/cyber/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 110,
        melody: [659, 0, 784, 0, 659, 0, 587, 0, 523, 587, 659, 784, 880, 0, 784, 0],
        bass:   [262, 294, 330, 294],
    }),
    'bgm/wanted/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 84,
        melody: [330, 0, 440, 0, 392, 0, 330, 0, 294, 330, 392, 440, 392, 0, 330, 0],
        bass:   [165, 220, 196, 165],
    }),
    'bgm/olympus/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 78,
        melody: [392, 0, 523, 0, 587, 659, 587, 523, 440, 0, 392, 0, 330, 0, 392, 0],
        bass:   [196, 220, 247, 220],
    }),
    'bgm/bayou/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 100,
        melody: [392, 440, 494, 523, 494, 440, 392, 0, 392, 440, 494, 523, 587, 523, 494, 0],
        bass:   [196, 220, 247, 220],
    }),
    'bgm/mummy/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 80,
        melody: [330, 392, 440, 392, 330, 0, 277, 330, 370, 415, 392, 0, 330, 0, 277, 0],
        bass:   [165, 220, 185, 165],
    }),
    'bgm/phoenix/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 104,
        melody: [523, 587, 659, 784, 880, 784, 659, 523, 587, 659, 784, 880, 1046, 880, 784, 0],
        bass:   [262, 330, 392, 262],
    }),
    'bgm/mansion/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 76,
        melody: [277, 330, 370, 415, 370, 330, 277, 0, 247, 277, 330, 370, 415, 370, 330, 0],
        bass:   [138, 175, 185, 165],
    }),
    'bgm/ronin/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 90,
        melody: [440, 523, 587, 659, 587, 523, 440, 0, 392, 440, 523, 587, 659, 587, 523, 0],
        bass:   [220, 247, 196, 220],
    }),
    'bgm/iron/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 110,
        melody: [220, 277, 330, 277, 220, 0, 196, 220, 277, 330, 392, 330, 277, 0, 220, 0],
        bass:   [110, 165, 220, 165],
    }),
    'bgm/coop/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 108,
        melody: [523, 587, 659, 784, 659, 587, 523, 0, 587, 659, 784, 880, 784, 659, 587, 0],
        bass:   [262, 294, 330, 262],
    }),
    'bgm/spirit/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 84,
        melody: [392, 440, 494, 523, 494, 440, 392, 0, 330, 392, 440, 494, 523, 494, 440, 0],
        bass:   [196, 220, 247, 196],
    }),
    'bgm/forge/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 96,
        melody: [330, 392, 440, 494, 440, 392, 330, 0, 277, 330, 392, 440, 494, 440, 392, 0],
        bass:   [165, 196, 220, 247],
    }),
    'bgm/gummy/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 120,
        melody: [659, 784, 880, 988, 880, 784, 659, 0, 587, 659, 784, 880, 988, 880, 784, 0],
        bass:   [330, 392, 440, 330],
    }),
    'bgm/bank/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 92,
        melody: [523, 0, 659, 0, 784, 0, 659, 0, 523, 587, 659, 587, 523, 0, 392, 0],
        bass:   [262, 196, 220, 247],
    }),
    'bgm/catcher/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 96,
        melody: [392, 440, 523, 440, 392, 0, 349, 392, 440, 523, 587, 523, 440, 0, 392, 0],
        bass:   [196, 247, 220, 196],
    }),
    'bgm/western/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 86,
        melody: [330, 392, 440, 392, 330, 0, 277, 330, 392, 440, 494, 440, 392, 0, 330, 0],
        bass:   [165, 220, 247, 196],
    }),
    'bgm/rock/idle.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 132,
        melody: [330, 0, 440, 0, 523, 0, 440, 0, 330, 0, 440, 0, 587, 0, 523, 0],
        bass:   [165, 220, 247, 220],
    }),
}

// Wave 32 follow-up: bonus loops. Higher tempo, brighter motifs so the
// bonus mode reads "feature is live". Same skin families as idle.
const BGM_BONUS = {
    'bgm/classic/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 124,
        melody: [659, 784, 880, 988, 880, 784, 659, 587, 659, 784, 988, 1175, 988, 784, 659, 0],
        bass:   [330, 392, 440, 330],
    }),
    'bgm/mythic/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 116,
        melody: [523, 659, 784, 880, 784, 659, 523, 0, 587, 659, 784, 988, 880, 784, 659, 0],
        bass:   [262, 330, 392, 262],
    }),
    'bgm/cyber/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 138,
        melody: [659, 988, 1175, 1318, 1175, 988, 784, 659, 988, 1175, 1318, 1568, 1318, 1175, 988, 0],
        bass:   [262, 392, 523, 392],
    }),
    'bgm/wanted/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 110,
        melody: [330, 392, 440, 523, 587, 523, 440, 392, 330, 440, 523, 659, 587, 523, 440, 0],
        bass:   [165, 220, 196, 165],
    }),
    'bgm/olympus/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 100,
        melody: [523, 659, 784, 880, 784, 659, 523, 0, 587, 784, 880, 1046, 880, 784, 659, 0],
        bass:   [262, 392, 330, 262],
    }),
    'bgm/bayou/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 124,
        melody: [392, 494, 587, 659, 587, 494, 392, 0, 440, 523, 659, 784, 659, 523, 440, 0],
        bass:   [196, 247, 294, 247],
    }),
    'bgm/mummy/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 104,
        melody: [330, 415, 466, 523, 466, 415, 330, 0, 277, 330, 392, 466, 523, 466, 415, 0],
        bass:   [165, 220, 196, 165],
    }),
    'bgm/phoenix/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 132,
        melody: [659, 784, 988, 1175, 988, 784, 659, 0, 784, 988, 1175, 1318, 1568, 1318, 988, 0],
        bass:   [330, 440, 523, 330],
    }),
    'bgm/mansion/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 96,
        melody: [277, 330, 392, 466, 415, 392, 330, 0, 247, 330, 392, 466, 523, 466, 392, 0],
        bass:   [165, 220, 196, 165],
    }),
    'bgm/ronin/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 116,
        melody: [440, 587, 659, 784, 880, 784, 659, 587, 440, 659, 784, 988, 880, 784, 659, 0],
        bass:   [220, 294, 330, 220],
    }),
    'bgm/iron/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 140,
        melody: [220, 277, 330, 415, 466, 415, 330, 277, 220, 330, 392, 466, 523, 466, 392, 0],
        bass:   [110, 165, 220, 165],
    }),
    'bgm/coop/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 132,
        melody: [659, 784, 880, 988, 880, 784, 659, 0, 784, 880, 988, 1175, 988, 880, 784, 0],
        bass:   [330, 440, 392, 330],
    }),
    'bgm/spirit/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 108,
        melody: [440, 523, 587, 659, 784, 659, 587, 0, 440, 523, 659, 784, 880, 784, 659, 0],
        bass:   [220, 294, 330, 220],
    }),
    'bgm/forge/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 120,
        melody: [330, 392, 466, 523, 587, 523, 466, 0, 392, 466, 523, 659, 587, 523, 466, 0],
        bass:   [165, 220, 247, 220],
    }),
    'bgm/gummy/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 144,
        melody: [784, 880, 988, 1175, 988, 880, 784, 0, 988, 1175, 1318, 1568, 1318, 1175, 988, 0],
        bass:   [392, 440, 523, 392],
    }),
    'bgm/bank/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 116,
        melody: [659, 784, 880, 988, 880, 784, 659, 0, 587, 659, 784, 880, 988, 880, 784, 0],
        bass:   [330, 392, 440, 330],
    }),
    'bgm/catcher/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 122,
        melody: [392, 523, 587, 659, 784, 659, 587, 0, 440, 523, 659, 784, 880, 784, 659, 0],
        bass:   [196, 262, 330, 220],
    }),
    'bgm/western/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 108,
        melody: [330, 440, 494, 523, 587, 523, 494, 0, 277, 330, 392, 466, 523, 466, 415, 0],
        bass:   [165, 220, 247, 196],
    }),
    'bgm/rock/bonus.wav': () => bgmLoop({
        durMs: 8000, tempoBpm: 156,
        melody: [330, 440, 587, 659, 784, 659, 587, 440, 330, 440, 587, 784, 988, 784, 587, 0],
        bass:   [165, 220, 247, 220],
    }),
}

// ---- main ----

async function writeOne(rel, samples) {
    const target = join(ROOT, 'public', 'audio', rel)
    await mkdir(dirname(target), { recursive: true })
    const pcm = floatsToPCM16(samples)
    const buf = wavBuffer(pcm)
    await writeFile(target, buf)
    return rel
}

async function main() {
    const args = new Set(process.argv.slice(2))
    const doSfx = !args.has('--bgm')
    const doBgm = !args.has('--sfx')

    const tasks = []
    if (doSfx) {
        for (const [rel, gen] of Object.entries(SFX)) {
            tasks.push(writeOne(rel, gen()))
        }
    }
    if (doBgm) {
        for (const [rel, gen] of Object.entries(BGM)) {
            tasks.push(writeOne(rel, gen()))
        }
        for (const [rel, gen] of Object.entries(BGM_BONUS)) {
            tasks.push(writeOne(rel, gen()))
        }
    }
    const written = await Promise.all(tasks)
    // eslint-disable-next-line no-console
    console.log(`[genSfx] wrote ${written.length} files`)
    for (const rel of written) {
        // eslint-disable-next-line no-console
        console.log('  -', rel)
    }
}

main().catch(err => {
    // eslint-disable-next-line no-console
    console.error(err)
    process.exit(1)
})
