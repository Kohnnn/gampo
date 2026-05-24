// Generates Rainbet/Stake-style game covers via 9Router /v1/images/generations.
// Run with `node scripts/generateGameCovers.mjs [batch]` where batch is one of
// originals | tables | cards | arcade | all (default: all).
//
// Reads NINEROUTER_URL / NINEROUTER_KEY / GAMPO_IMAGE_MODEL from environment.
// Writes PNGs to public/images/covers/generated/<slug>.png.

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const URL = process.env.NINEROUTER_URL
const KEY = process.env.NINEROUTER_KEY
const MODEL = process.env.GAMPO_IMAGE_MODEL || 'cx/gpt-5.5-image'

if (!URL || !KEY) {
    console.error('NINEROUTER_URL / NINEROUTER_KEY missing in env')
    process.exit(1)
}

const STYLE = [
    'square 1024x1024',
    'Rainbet / Stake-casino vertical card art',
    'dark navy and deep purple gradient background',
    'subject hero centered, large and clear',
    'rim lighting and subtle volumetric glow',
    'soft top-right specular highlight',
    'small grain, no UI, no text, no watermark, no logo',
    'high quality, premium digital game cover, 3D render look',
].join(', ')

const BATCHES = {
    originals: [
        ['crash', 'a glowing rocket trail bursting upward, neon trail, pink and orange flares'],
        ['plinko', 'a bright neon ball bouncing through a peg field, blue and pink lighting, depth'],
        ['mines', 'a single large diamond gem next to a stylized cartoon bomb, blue glow vs red glow'],
        ['dice', 'two stylized white casino dice mid air, sharp pips, blue cyan rim light'],
        ['limbo', 'a horizontal neon laser beam under a multiplier marker, cyan and magenta'],
        ['hilo', 'a face-down playing card split with up and down arrows, cyan green glow'],
    ],
    tables: [
        ['roulette', 'close-up macro of a polished casino roulette wheel and ivory ball'],
        ['baccarat', 'two casino cards with B and P symbols laid on a deep green felt'],
        ['blackjack', 'an ace and king of spades stylized, suited royal cards, gold accent'],
        ['casino-war', 'two crossed casino cards with gold sword overlay, deep red'],
        ['sicbo', 'three large casino dice inside a translucent cup, dramatic lighting'],
    ],
    cards: [
        ['slots', 'three lined-up slot symbols seven seven seven, gold neon glow'],
        ['video-poker', 'a royal flush hand fanned out, cinematic'],
        ['keno', 'a glowing 8x10 grid with several numbered balls highlighted'],
        ['lottery', 'a cluster of bingo balls with bold numbers, deep purple haze'],
    ],
    arcade: [
        ['wheel', 'a stylized colorful prize wheel segment burst, top down'],
        ['color', 'a chromatic ring with red green blue yellow segments, neon'],
        ['coinflip', 'a tumbling gold coin midair with motion blur'],
        ['tower', 'ascending floating step blocks reaching upward, neon blue'],
        ['chickencross', 'silhouette of a chicken mid jump above a fiery road'],
        ['dino', 'a small pixel-style dino jumping over cacti, retro neon'],
        ['guess', 'a single face-down card with a glowing question mark'],
        ['rps', 'rock paper scissors icons in a neon triad fan'],
    ],
}

const targetBatches = process.argv[2] && process.argv[2] !== 'all'
    ? [process.argv[2]]
    : Object.keys(BATCHES)

const OUT_DIR = path.resolve('public/images/covers/generated')
await fs.mkdir(OUT_DIR, { recursive: true })

for (const batchName of targetBatches) {
    const batch = BATCHES[batchName]
    if (!batch) {
        console.error(`Unknown batch: ${batchName}`)
        continue
    }
    console.log(`\n== Batch ${batchName} (${batch.length} covers) ==`)
    for (const [slug, subject] of batch) {
        const outPath = path.join(OUT_DIR, `${slug}.png`)
        const prompt = `${subject}, ${STYLE}`
        const body = JSON.stringify({ model: MODEL, prompt, size: '1024x1024' })
        const url = `${URL}/images/generations?response_format=binary`
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${KEY}`,
                    'Content-Type': 'application/json',
                },
                body,
            })
            if (!res.ok) {
                console.error(`  - ${slug}: HTTP ${res.status}`)
                continue
            }
            const buf = Buffer.from(await res.arrayBuffer())
            if (buf.length < 1000) {
                console.error(`  - ${slug}: response too small (${buf.length}b)`)
                continue
            }
            await fs.writeFile(outPath, buf)
            console.log(`  + ${slug}: ${buf.length} bytes`)
        } catch (err) {
            console.error(`  - ${slug}: ${err.message}`)
        }
    }
}
console.log('\ndone')
