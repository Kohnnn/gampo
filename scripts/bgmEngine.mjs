// scripts/bgmEngine.mjs — Wave 34 themed BGM engine.
//
// Six archetype voicings with distinct timbre, percussion, and harmonic
// structure. Imported by `genSfx.mjs` to render the slot BGM loops.
//
// Archetypes:
//   arcade-classic  — square + triangle melody, kick + hat, 96 bpm
//   brass-lounge    — saw lead + sub-bass + closed hat, 88 bpm
//   western-twang   — pluck saw + slap kick + tambourine, 100 bpm
//   aurora-pad      — detuned saws + low triangle + soft snare, 84 bpm
//   synth-tense     — pulsewidth saw + 808 + ride, 116 bpm
//   playful-marimba — additive marimba + bouncy bass + shaker, 112 bpm
//
// Each archetype emits a stereo-mono mix of melody + bass + drum tracks
// that loop seamlessly at 8 seconds. Bonus mode bumps tempo +18 bpm,
// adds an octave-up melody layer, doubles drum energy.

const SR = 44100

// ---- oscillators ----

function osc(t, f, type) {
    if (type === 'sine') return Math.sin(2 * Math.PI * f * t)
    if (type === 'square') return Math.sin(2 * Math.PI * f * t) >= 0 ? 0.6 : -0.6
    if (type === 'saw') return ((t * f) % 1) * 2 - 1
    if (type === 'triangle') {
        const phase = (t * f) % 1
        return phase < 0.5 ? -1 + 4 * phase : 3 - 4 * phase
    }
    if (type === 'pulse25') return ((t * f) % 1) < 0.25 ? 0.7 : -0.7
    if (type === 'pulse12') return ((t * f) % 1) < 0.12 ? 0.7 : -0.7
    return 0
}

function detunedSaws(t, f, count = 3, spread = 0.012) {
    let v = 0
    for (let i = 0; i < count; i += 1) {
        const detune = (i - (count - 1) / 2) * spread
        v += osc(t, f * (1 + detune), 'saw')
    }
    return v / count
}

// Marimba via additive harmonics.
function marimba(t, f) {
    return (
        Math.sin(2 * Math.PI * f * t) * 1.0 +
        Math.sin(2 * Math.PI * f * 4 * t) * 0.6 +
        Math.sin(2 * Math.PI * f * 9.2 * t) * 0.3 +
        Math.sin(2 * Math.PI * f * 16 * t) * 0.12
    ) * 0.4
}

// Brass — sawtooth with body + lowpass-like decay.
function brass(t, f) {
    return (osc(t, f, 'saw') * 0.8 + osc(t, f * 2, 'square') * 0.15) * 0.6
}

function noise() {
    return Math.random() * 2 - 1
}

// ---- envelopes ----

function pluckEnv(phase) {
    // sharp attack, fast decay (~80 ms in 1 unit)
    return Math.exp(-phase * 7)
}
function padEnv(phase) {
    // slow attack, sustain, slow release
    if (phase < 0.15) return phase / 0.15
    if (phase < 0.85) return 1
    return Math.max(0, 1 - (phase - 0.85) / 0.15)
}
function bellEnv(phase) {
    return Math.exp(-phase * 3.5)
}
function bassEnv(phase) {
    if (phase < 0.05) return phase / 0.05
    return Math.exp(-phase * 1.2)
}
function kickEnv(phase) {
    return Math.exp(-phase * 18)
}
function hatEnv(phase) {
    return Math.exp(-phase * 60)
}
function snareEnv(phase) {
    return Math.exp(-phase * 25)
}

// ---- archetype voice tables ----

// Note names → frequencies (just-tempered, A4=440).
const NOTES = (() => {
    const m = {}
    const base = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    for (let oct = 1; oct <= 7; oct += 1) {
        base.forEach((n, i) => {
            const semi = (oct - 4) * 12 + (i - 9)
            m[`${n}${oct}`] = 440 * Math.pow(2, semi / 12)
        })
    }
    return m
})()

const N = NOTES

// ---- 6 archetypes ----

export const ARCHETYPES = {
    'arcade-classic': {
        bpm: 96,
        beatsPerLoop: 16,
        melody: [
            // 16 eighth-notes
            'C5', 'E5', 'G5', 'C6', 'B5', 'G5', 'E5', 'D5',
            'C5', 'E5', 'G5', 'B5', 'C6', 'A5', 'G5', 'E5',
        ],
        bass: ['C3', 'C3', 'G2', 'G2', 'A2', 'A2', 'F2', 'F2'],
        chords: null,
        melodyVoice: (t, f, phase) => osc(t, f, 'square') * pluckEnv(phase) * 0.42,
        bassVoice: (t, f, phase) => osc(t, f, 'triangle') * bassEnv(phase) * 0.45,
        drumPattern: '1010101010101010', // hat on every eighth
        kickPattern: '1000100010001000', // 4-on-floor
        snarePattern: '0000100000001000',
    },
    'brass-lounge': {
        bpm: 88,
        beatsPerLoop: 16,
        melody: [
            'D4', 'F4', 'A4', 'D5', 'C5', 'A4', 'F4', 'A4',
            'D4', 'F4', 'A4', 'C5', 'D5', 'C5', 'A4', 'F4',
        ],
        bass: ['D2', 'D2', 'A2', 'A2', 'Bb2', 'Bb2', 'F2', 'F2'],
        chords: null,
        melodyVoice: (t, f, phase) => brass(t, f) * (phase < 0.2 ? phase / 0.2 : Math.exp(-(phase - 0.2) * 1.5)) * 0.38,
        bassVoice: (t, f, phase) => osc(t, f, 'sine') * bassEnv(phase) * 0.55,
        drumPattern: '1000100010001000', // soft closed hat on quarters
        kickPattern: '1000000010000000',
        snarePattern: '0000100000001000',
    },
    'western-twang': {
        bpm: 100,
        beatsPerLoop: 16,
        melody: [
            'E4', 'G4', 'A4', 'B4', 'A4', 'G4', 'E4', 'D4',
            'E4', 'G4', 'A4', 'C5', 'B4', 'A4', 'G4', 'E4',
        ],
        bass: ['E2', 'E2', 'A2', 'A2', 'B2', 'B2', 'D3', 'D3'],
        chords: null,
        melodyVoice: (t, f, phase) => (osc(t, f, 'saw') + osc(t, f * 1.005, 'saw')) * 0.5 * pluckEnv(phase) * 0.4,
        bassVoice: (t, f, phase) => osc(t, f, 'triangle') * bassEnv(phase) * 0.5,
        drumPattern: '1010101010101010', // tambourine
        kickPattern: '1000001010000010', // slap on offbeats
        snarePattern: '0000100000001000',
    },
    'aurora-pad': {
        bpm: 84,
        beatsPerLoop: 16,
        melody: [
            'A4', 'C5', 'E5', 'G5', 'A5', 'G5', 'E5', 'C5',
            'A4', 'C5', 'D5', 'F5', 'E5', 'D5', 'C5', 'A4',
        ],
        bass: ['A2', 'A2', 'F2', 'F2', 'G2', 'G2', 'E2', 'E2'],
        chords: ['Am', 'Am', 'F', 'F', 'G', 'G', 'Em', 'Em'],
        melodyVoice: (t, f, phase) => detunedSaws(t, f, 3, 0.014) * padEnv(phase) * 0.32,
        bassVoice: (t, f, phase) => osc(t, f, 'triangle') * bassEnv(phase) * 0.48,
        drumPattern: '0000000000000000',
        kickPattern: '1000000010000000',
        snarePattern: '0000100000001000', // soft snare
    },
    'synth-tense': {
        bpm: 116,
        beatsPerLoop: 16,
        melody: [
            'C4', 'D#4', 'G4', 'A#4', 'C5', 'A#4', 'G4', 'D#4',
            'C4', 'F4', 'G#4', 'C5', 'D#5', 'C5', 'A#4', 'G4',
        ],
        bass: ['C2', 'C2', 'G2', 'G2', 'D#2', 'D#2', 'A#2', 'A#2'],
        chords: null,
        melodyVoice: (t, f, phase) => osc(t, f, 'pulse25') * (phase < 0.1 ? phase / 0.1 : Math.exp(-(phase - 0.1) * 3.5)) * 0.36,
        bassVoice: (t, f, phase) => (osc(t, f, 'sine') * 1 + osc(t, f * 0.5, 'sine') * 0.4) * bassEnv(phase) * 0.6,
        drumPattern: '1010101010101010', // ride on eighths
        kickPattern: '1000100010001000',
        snarePattern: '0000100000001000',
    },
    'playful-marimba': {
        bpm: 112,
        beatsPerLoop: 16,
        melody: [
            'C5', 'E5', 'G5', 'E5', 'F5', 'D5', 'B4', 'D5',
            'C5', 'E5', 'G5', 'C6', 'A5', 'G5', 'F5', 'E5',
        ],
        bass: ['C3', 'C3', 'F3', 'F3', 'G3', 'G3', 'C3', 'C3'],
        chords: null,
        melodyVoice: (t, f, phase) => marimba(t, f) * Math.exp(-phase * 5),
        bassVoice: (t, f, phase) => (osc(t, f, 'triangle') + osc(t, f * 2, 'sine') * 0.2) * bassEnv(phase) * 0.5,
        drumPattern: '1010101010101010', // shaker on eighths
        kickPattern: '1010001010100010',
        snarePattern: '0000100000001000',
    },
}

// ---- render ----

// Wave 42: convolution-style soft reverb tail. Convolves the rendered
// buffer with a short noise impulse-response so loops feel like they
// have a room behind them instead of arcade-dry chiptune.
function softReverb(buf, mix = 0.18, tailMs = 220) {
    const tail = Math.floor(SR * (tailMs / 1000))
    const ir = new Float32Array(tail)
    let energy = 0
    for (let i = 0; i < tail; i += 1) {
        const decay = Math.exp(-i / tail * 4)
        ir[i] = (Math.random() * 2 - 1) * decay
        energy += ir[i] * ir[i]
    }
    // Normalise IR.
    const norm = energy > 0 ? 1 / Math.sqrt(energy) : 0
    for (let i = 0; i < tail; i += 1) ir[i] *= norm
    // Sparse convolution — only every 4th IR sample to keep it cheap.
    const out = new Float32Array(buf.length)
    const stride = 4
    for (let i = 0; i < buf.length; i += 1) {
        let sum = buf[i]
        for (let k = stride; k < tail && k < i; k += stride) {
            sum += buf[i - k] * ir[k] * mix
        }
        out[i] = sum
    }
    return out
}

// Major and minor chord intervals (root, third, fifth) in semitones.
function chordIntervals(quality) {
    if (quality === 'maj') return [0, 4, 7]
    if (quality === 'min') return [0, 3, 7]
    if (quality === 'sus2') return [0, 2, 7]
    if (quality === 'sus4') return [0, 5, 7]
    if (quality === 'maj7') return [0, 4, 7, 11]
    if (quality === 'min7') return [0, 3, 7, 10]
    if (quality === 'dom7') return [0, 4, 7, 10]
    return [0, 4, 7]
}

function transposeFreq(f, semitones) {
    return f * Math.pow(2, semitones / 12)
}

function renderTrack(archetypeName, mode = 'idle', durMs = 8000) {
    const arch = ARCHETYPES[archetypeName]
    if (!arch) throw new Error(`unknown archetype ${archetypeName}`)
    let bpm = arch.bpm
    if (mode === 'bonus') bpm += 18
    const beatLen = 60 / bpm
    const eighthLen = beatLen / 2
    const totalSamples = Math.floor(SR * (durMs / 1000))
    const buf = new Float32Array(totalSamples)
    const loopSamples = Math.floor(SR * eighthLen * arch.beatsPerLoop)

    // Build melody track.
    const melodyNotes = arch.melody
    const bassNotes = arch.bass
    const drumPattern = arch.drumPattern || '0000000000000000'
    const kickPattern = arch.kickPattern || '0000000000000000'
    const snarePattern = arch.snarePattern || '0000000000000000'
    // Wave 42: chord progression derived from the bass line. Default to a
    // major-pad chord on each bass beat unless arch.chordQualities was
    // specified.
    const chordQualities = arch.chordQualities
        || (arch.melodyVoice.toString().includes('detunedSaws') ? ['min', 'maj', 'maj', 'min'] : ['maj', 'maj', 'min', 'maj'])

    for (let i = 0; i < totalSamples; i += 1) {
        const t = i / SR
        const phaseInLoop = (i % loopSamples) / loopSamples
        const eighthIdx = Math.floor(phaseInLoop * arch.beatsPerLoop)
        const eighthPhase = (phaseInLoop * arch.beatsPerLoop) - eighthIdx
        const beatIdx = Math.floor(eighthIdx / 2)

        // melody
        const melodyName = melodyNotes[eighthIdx % melodyNotes.length]
        const melodyF = N[melodyName]
        let v = melodyF ? arch.melodyVoice(t, melodyF, eighthPhase) : 0

        // bonus: octave-up layer
        if (mode === 'bonus' && melodyF) {
            v += arch.melodyVoice(t, melodyF * 2, eighthPhase) * 0.3
        }

        // bass on quarters (every 2 eighths)
        const bassName = bassNotes[beatIdx % bassNotes.length]
        const bassF = N[bassName]
        const bassPhase = (eighthIdx % 2 === 0) ? eighthPhase : 1 + eighthPhase
        const bassPhaseN = bassPhase / 2
        if (bassF) v += arch.bassVoice(t, bassF, bassPhaseN)

        // Wave 42: layered chord pad on every bass beat. Played 1 octave
        // above bass for body without muddying the low end. ~0.18 amplitude.
        if (bassF) {
            const quality = chordQualities[beatIdx % chordQualities.length]
            const intervals = chordIntervals(quality)
            const padPhase = (eighthIdx % 4) / 4 + eighthPhase / 4
            for (const semi of intervals) {
                const f = transposeFreq(bassF * 2, semi)
                v += osc(t, f, 'triangle') * padEnv(padPhase) * 0.06
            }
        }

        // Wave 42: arpeggio sparkle layer — uses melody chord intervals at
        // 16th-note rate over the bass note for a "Stake-style" sparkle.
        if (mode === 'bonus' && bassF) {
            const sixteenthIdx = Math.floor(phaseInLoop * arch.beatsPerLoop * 2)
            const intervals = chordIntervals(chordQualities[beatIdx % chordQualities.length])
            const semi = intervals[sixteenthIdx % intervals.length]
            const f = transposeFreq(bassF * 4, semi)
            v += osc(t, f, 'sine') * Math.exp(-eighthPhase * 9) * 0.12
        }

        // hat / shaker
        if (drumPattern[eighthIdx] === '1') {
            const hp = eighthPhase
            v += noise() * hatEnv(hp) * 0.18 * (mode === 'bonus' ? 1.4 : 1)
        }
        // kick
        if (kickPattern[eighthIdx] === '1') {
            v += Math.sin(2 * Math.PI * 60 * Math.exp(-eighthPhase * 6) * t) * kickEnv(eighthPhase) * 0.55 * (mode === 'bonus' ? 1.2 : 1)
        }
        // snare
        if (snarePattern[eighthIdx] === '1') {
            v += (noise() * 0.8 + osc(t, 200, 'triangle') * 0.3) * snareEnv(eighthPhase) * 0.32 * (mode === 'bonus' ? 1.3 : 1)
        }

        buf[i] = v
    }

    // Crossfade ends so the loop is seamless.
    const fadeN = Math.floor(SR * 0.08)
    for (let i = 0; i < fadeN; i += 1) {
        const k = i / fadeN
        buf[i] *= k
        buf[totalSamples - 1 - i] *= k
    }

    // Wave 42: soft reverb tail + headroom limiter so the richer mix
    // doesn't clip after layering pad + arpeggio.
    const reverbed = softReverb(buf, mode === 'bonus' ? 0.22 : 0.16, 240)
    let peak = 0
    for (let i = 0; i < reverbed.length; i += 1) {
        const a = Math.abs(reverbed[i])
        if (a > peak) peak = a
    }
    if (peak > 0.94) {
        const k = 0.94 / peak
        for (let i = 0; i < reverbed.length; i += 1) reverbed[i] *= k
    }
    return reverbed
}

// ---- skin → archetype map ----

export const SKIN_ARCHETYPE = {
    classic: 'arcade-classic',
    bars: 'arcade-classic',
    rock: 'arcade-classic',
    bank: 'brass-lounge',
    catcher: 'brass-lounge',
    vault: 'brass-lounge',
    western: 'western-twang',
    wanted: 'western-twang',
    mythic: 'aurora-pad',
    mansion: 'aurora-pad',
    olympus: 'aurora-pad',
    cyber: 'synth-tense',
    ronin: 'synth-tense',
    iron: 'synth-tense',
    phoenix: 'synth-tense',
    mummy: 'synth-tense',
    forge: 'synth-tense',
    bayou: 'playful-marimba',
    coop: 'playful-marimba',
    gummy: 'playful-marimba',
    spirit: 'playful-marimba',
}

export function archetypeFor(skin) {
    return SKIN_ARCHETYPE[skin] || 'arcade-classic'
}

export function renderForSkin(skin, mode = 'idle', durMs = 8000) {
    const arch = archetypeFor(skin)
    return renderTrack(arch, mode, durMs)
}

export function renderArchetype(archName, mode = 'idle', durMs = 8000) {
    return renderTrack(archName, mode, durMs)
}

// ---- Wave 35: casino game routes → archetype mapping ----
//
// Maps every non-slot game route to the archetype that suits its mood.
// Some marquee games get dedicated track keys (`bgm/games/<id>/idle.wav`)
// rendered with the same engine; the rest borrow archetype loops via
// `bgm/<archetype>/idle.wav` aliases.

export const GAME_ARCHETYPE = {
    poker:        'brass-lounge',
    crash:        'synth-tense',
    plinko:       'synth-tense',
    dice:         'arcade-classic',
    limbo:        'synth-tense',
    keno:         'synth-tense',
    wheel:        'synth-tense',
    mines:        'synth-tense',
    roulette:     'brass-lounge',
    blackjack:    'brass-lounge',
    baccarat:     'brass-lounge',
    sicbo:        'brass-lounge',
    war:          'brass-lounge',
    videopoker:   'brass-lounge',
    hilo:         'brass-lounge',
    lottery:      'playful-marimba',
    cases:        'synth-tense',
    drill:        'synth-tense',
    packs:        'playful-marimba',
    tomeoflife:   'aurora-pad',
    tarot:        'aurora-pad',
    flip:         'arcade-classic',
    diamonds:     'arcade-classic',
    darts:        'arcade-classic',
    pump:         'arcade-classic',
    slide:        'arcade-classic',
    moles:        'playful-marimba',
    snakes:       'arcade-classic',
    coinflip:     'arcade-classic',
    rps:          'arcade-classic',
    guess:        'arcade-classic',
    color:        'playful-marimba',
    tower:        'synth-tense',
    chickencross: 'playful-marimba',
    dino:         'arcade-classic',
    sports:       'brass-lounge',
}

export function renderForGame(gameId, mode = 'idle', durMs = 8000) {
    const arch = GAME_ARCHETYPE[gameId] || 'arcade-classic'
    return renderTrack(arch, mode, durMs)
}
