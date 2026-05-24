// Generates Wave 7 slot template assets via 9Router /v1/images/generations.
// Run with: node scripts/generateSlotArt.mjs [template-id]
// (no arg generates all Wave 7 templates)
//
// Reads NINEROUTER_URL / NINEROUTER_KEY / GAMPO_IMAGE_MODEL from env.
// Writes:
//   public/images/covers/generated/<template-id>.png            (1024x1024 cover)
//   public/assets/games/slots/<skin>/<template-id>-<role>.png   (4 premium symbols per skin)
//   public/assets/games/slots/<skin>/README.md                  (provenance)

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const URL = process.env.NINEROUTER_URL
const KEY = process.env.NINEROUTER_KEY
const MODEL = process.env.GAMPO_IMAGE_MODEL || 'cx/gpt-5.5-image'

if (!URL || !KEY) {
    console.error('NINEROUTER_URL / NINEROUTER_KEY missing in env (.env.local)')
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

const SYMBOL_STYLE = [
    'square 1024x1024',
    'one centered casino slot reel symbol',
    'transparent or near-black background, soft drop shadow',
    'crisp game-icon look with bold rim lighting',
    '3D render style, glossy, high contrast',
    'no text, no numbers, no watermark, no logo, no copyrighted property',
    'clone-owned, generic stylized casino art',
].join(', ')

const TEMPLATES = {
    'wanted-revelation': {
        skin: 'wanted',
        cover: 'a single weathered wanted poster pinned to wood, golden bounty seal, no readable text, sandstorm dust, sun-flare backdrop',
        symbols: {
            hero: 'a sheriff star bounty badge, gold and copper, polished, dust particles',
            mid1: 'a stylized leather-strap pocket watch face with no numbers, gold rim',
            mid2: 'a single crossed revolver-and-rope icon, brushed metal, sandstone backdrop',
            bonus: 'a glowing red wax seal stamped with a star, flame backdrop',
        },
    },
    'gates-ascent': {
        skin: 'olympus',
        cover: 'two giant golden ornate gates floating in a stormy sky with a single thunderbolt, rays of light bursting through, no text',
        symbols: {
            hero: 'a glowing thunderbolt held in a marble hand, gold rim, dramatic',
            mid1: 'a single laurel crown halo of gold leaves, glowing center',
            mid2: 'a stylized winged sandal icon, blue gem accent',
            bonus: 'an ornate golden gate amulet with bursting light at the center',
        },
    },
    'bass-bayou': {
        skin: 'bayou',
        cover: 'a leaping fish above swamp water at sunset, lily pads, fishing line in air, fireflies, cartoon-realistic style',
        symbols: {
            hero: 'a leaping bass fish with metallic green body, water droplets',
            mid1: 'a fishing rod with golden lure, single fishing reel, side view',
            mid2: 'a tackle box icon, open lid, glowing lures inside',
            bonus: 'a glowing dollar prize-tag attached to a fishing hook, gold chain',
        },
    },
    'mummy-cascade': {
        skin: 'mummy',
        cover: 'a glowing emerald scarab inside cracked tomb stone with falling sand, torchlight reflection, no text',
        symbols: {
            hero: 'a wrapped mummy mask icon, gold and turquoise, dramatic glow',
            mid1: 'a single ankh cross of gold with hieroglyph etching',
            mid2: 'an egyptian sun disk with two cobras, polished gold',
            bonus: 'a flaming ruby gemstone eye, smoke wisps',
        },
    },
    'phoenix-megaways': {
        skin: 'phoenix',
        cover: 'a magnificent phoenix bird mid flap with bursting flame wings, embers, dark red gradient sky',
        symbols: {
            hero: 'a stylized phoenix head silhouette with flame crest, glowing eye',
            mid1: 'a single flame feather curving upward, gold tip, ember trail',
            mid2: 'a sun amulet with eight rays, flame center',
            bonus: 'a golden egg cracked open with light bursting out, embers floating',
        },
    },
    'mansion-megaways': {
        skin: 'mansion',
        cover: 'a haunted gothic mansion silhouette under a full moon with a curving gravel driveway, foggy graveyard, dramatic blue tone',
        symbols: {
            hero: 'a snarling cartoon dog mascot wearing a small bow tie, single bust portrait',
            mid1: 'a single ornate skeleton key with bone-shaped bow, brass',
            mid2: 'a wax-sealed letter with red ribbon, single envelope',
            bonus: 'a candelabra with three lit candles, ghostly blue flame',
        },
    },
}

async function generate(prompt, outPath, label) {
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
            const detail = await res.text().catch(() => '')
            console.error(`  - ${label}: HTTP ${res.status} ${detail.slice(0, 120)}`)
            return false
        }
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length < 1000) {
            console.error(`  - ${label}: response too small (${buf.length}b)`)
            return false
        }
        await fs.mkdir(path.dirname(outPath), { recursive: true })
        await fs.writeFile(outPath, buf)
        console.log(`  + ${label}: ${(buf.length / 1024).toFixed(1)} kB`)
        return true
    } catch (err) {
        console.error(`  - ${label}: ${err.message}`)
        return false
    }
}

const arg = process.argv[2]
const targets = arg ? [arg] : Object.keys(TEMPLATES)

for (const id of targets) {
    const tmpl = TEMPLATES[id]
    if (!tmpl) {
        console.error(`Unknown template: ${id}`)
        continue
    }
    console.log(`\n== ${id} (skin: ${tmpl.skin}) ==`)

    const coverPath = path.resolve(`public/images/covers/generated/${id}.png`)
    await generate(`${tmpl.cover}, ${COVER_STYLE}`, coverPath, `${id} cover`)

    const skinDir = path.resolve(`public/assets/games/slots/${tmpl.skin}`)
    for (const [role, subject] of Object.entries(tmpl.symbols)) {
        const out = path.join(skinDir, `${id}-${role}.png`)
        await generate(`${subject}, ${SYMBOL_STYLE}`, out, `${id}/${role}`)
    }

    const readme = `# ${tmpl.skin} skin (Wave 7 — ${id})\n\n` +
        `Provenance:\n` +
        `- Generator: scripts/generateSlotArt.mjs\n` +
        `- Provider: 9Router (/v1/images/generations) via NINEROUTER_URL\n` +
        `- Model: ${MODEL}\n` +
        `- License: clone-owned, AI-generated, no third-party IP\n` +
        `- Subjects:\n` +
        Object.entries(tmpl.symbols).map(([k, v]) => `  - ${k}: ${v}`).join('\n') +
        `\n`
    const readmePath = path.join(skinDir, 'README.md')
    await fs.mkdir(skinDir, { recursive: true })
    try { await fs.writeFile(readmePath, readme) } catch { /* ignore */ }
}

console.log('\ndone')
