// Generate just the cover image for a given template id.
// Reads NINEROUTER_URL / NINEROUTER_KEY from env.
// Usage: node scripts/generateSlotCover.mjs <template-id> [<template-id>...]

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const URL = process.env.NINEROUTER_URL
const KEY = process.env.NINEROUTER_KEY
const MODEL = process.env.GAMPO_IMAGE_MODEL || 'cx/gpt-5.5-image'

if (!URL || !KEY) {
    console.error('NINEROUTER_URL / NINEROUTER_KEY missing')
    process.exit(1)
}

const COVER_STYLE = [
    'square 1024x1024',
    'Rainbet / Stake-casino vertical card art',
    'dark gradient background, premium digital game cover',
    'subject hero centered, large and clear',
    'rim lighting and subtle volumetric glow',
    'soft top-right specular highlight, small grain',
    'no UI, no text, no watermark, no logo, no copyrighted symbols',
    'clone-owned, generic stylized casino art',
].join(', ')

const COVERS = {
    'vault-rush': 'a giant chrome bank vault door cracked open with golden coins pouring out, deep navy and gold gradient backdrop',
    'river-catcher': 'a wooden fishing boat at dawn with a glowing fish on the line, lily pads, soft mist, golden hour light',
    'dust-rail': 'a steam locomotive crossing a desert at sunset with a sheriff badge floating above the tracks, gold and rust tones',
    'storm-banner': 'a valkyrie holding a glowing banner over a storm-lit battlefield, cool blue and silver tones',
    'bassline-bonus': 'a neon stage with a flying electric guitar surrounded by cyan and magenta light beams, vinyl records floating',
    'scarab-spin': 'a glowing emerald scarab beetle on golden hieroglyph stone, warm desert lighting, no readable text',
    'bars': 'three classic slot machine sevens lined up with golden bars below, deep red and gold backdrop, retro casino vibe',
    'blue-samurai': 'a blue samurai warrior holding a glowing katana under cyberpunk neon skyline, electric blue and white accents',
}

async function generate(templateId) {
    const subject = COVERS[templateId]
    if (!subject) {
        console.error(`Unknown template: ${templateId}`)
        return false
    }
    const outPath = path.resolve(`public/images/covers/generated/${templateId}.png`)
    const prompt = `${subject}, ${COVER_STYLE}`
    const body = JSON.stringify({ model: MODEL, prompt, size: '1024x1024' })
    const url = `${URL}/images/generations?response_format=binary`

    let attempts = 0
    while (attempts < 3) {
        attempts += 1
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
                body,
            })
            if (!res.ok) {
                console.error(`  ${templateId} attempt ${attempts}: HTTP ${res.status}`)
                await new Promise(r => setTimeout(r, 4000))
                continue
            }
            const buf = Buffer.from(await res.arrayBuffer())
            if (buf.length < 1000) {
                console.error(`  ${templateId} attempt ${attempts}: too small`)
                await new Promise(r => setTimeout(r, 4000))
                continue
            }
            await fs.mkdir(path.dirname(outPath), { recursive: true })
            await fs.writeFile(outPath, buf)
            console.log(`  + ${templateId}: ${(buf.length / 1024).toFixed(1)} kB`)
            return true
        } catch (err) {
            console.error(`  ${templateId} attempt ${attempts}: ${err.message}`)
            await new Promise(r => setTimeout(r, 4000))
        }
    }
    return false
}

const targets = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(COVERS)
for (const id of targets) {
    await generate(id)
}
console.log('done')
