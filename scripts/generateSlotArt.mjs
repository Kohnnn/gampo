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

async function loadDotenv(filePath) {
    try {
        const raw = await fs.readFile(filePath, 'utf8')
        for (const line of raw.split(/\r?\n/)) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) continue
            const eq = trimmed.indexOf('=')
            if (eq < 0) continue
            const key = trimmed.slice(0, eq).trim()
            const value = trimmed.slice(eq + 1).trim()
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
            if (process.env[key] === undefined) process.env[key] = value
        }
    } catch {
        // optional
    }
}

await loadDotenv(path.resolve('.env.local'))
await loadDotenv(path.resolve('.env'))

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
    'transparent alpha background only, no white box, no square card, soft drop shadow',
    'crisp game-icon look with bold rim lighting',
    '3D render style, glossy, high contrast',
    'no text, no numbers, no watermark, no logo, no copyrighted property',
    'clone-owned, generic stylized casino art',
].join(', ')

const TEMPLATES = {
    'vault-rush': {
        skin: 'vault',
        cover: 'a giant chrome bank vault door cracked open with golden coins pouring out, deep navy and gold gradient backdrop',
        symbols: {
            hero: 'a chrome vault door with combination wheel, single icon, polished metal',
            mid1: 'a stack of gold coins next to a polished diamond gem, single icon',
            mid2: 'a vintage pocket watch with gold chain, single icon',
            bonus: 'a glowing red bonus key card stamped with star, single icon',
        },
    },
    'river-catcher': {
        skin: 'catcher',
        cover: 'a wooden fishing boat at dawn with a glowing fish on the line, lily pads, soft mist, golden hour light',
        symbols: {
            hero: 'a curved fishing hook with glowing pearl drop, single icon',
            mid1: 'a translucent pearl on a clamshell, single icon',
            mid2: 'a tin bait container with worms, cartoon style, single icon',
            bonus: 'a swirling shell amulet glowing teal, single icon',
        },
    },
    'dust-rail': {
        skin: 'western',
        cover: 'a steam locomotive crossing a desert at sunset with a sheriff badge floating above the tracks, gold and rust tones',
        symbols: {
            hero: 'a single ornate revolver with engraved barrel, brushed steel, single icon',
            mid1: 'a skull with cowboy hat, cartoon-realistic, single icon',
            mid2: 'a steam locomotive icon, side view, single building, dust trails',
            bonus: 'a bronze sheriff badge stamped with star, single icon',
        },
    },
    'storm-banner': {
        skin: 'mythic',
        cover: 'a valkyrie holding a glowing banner over a storm-lit battlefield, cool blue and silver tones',
        symbols: {
            hero: 'a winged valkyrie helmet, single bust portrait, polished silver',
            mid1: 'a crossed war hammer and lightning bolt, brushed metal, single icon',
            mid2: 'a single feathered wing with frost crystals, single icon',
            bonus: 'a rune-carved amulet with silver edge, glowing teal, single icon',
        },
    },
    'bassline-bonus': {
        skin: 'rock',
        cover: 'a neon stage with a flying electric guitar surrounded by cyan and magenta light beams, vinyl records floating',
        symbols: {
            hero: 'a single neon-pink electric guitar, glossy, single icon',
            mid1: 'a chrome amplifier stack with glowing knobs, single icon',
            mid2: 'a vinyl record disc with neon edge, single icon',
            bonus: 'a glowing concert ticket with star, magenta neon, single icon',
        },
    },
    'scarab-spin': {
        skin: 'mythic',
        cover: 'a glowing emerald scarab beetle on golden hieroglyph stone, warm desert lighting, no readable text',
        symbols: {
            hero: 'a stylized pharaoh mask, gold and lapis blue, single bust portrait',
            mid1: 'a stylized eye of horus icon, gold edges',
            mid2: 'a single ankh cross of gold with hieroglyph etching',
            bonus: 'a glowing emerald scarab beetle, gold rim, single icon',
        },
    },
    'bars': {
        skin: 'classic',
        cover: 'three classic slot machine sevens lined up with golden bars below, deep red and gold backdrop, retro casino vibe',
        symbols: {
            hero: 'a single chrome 7 with gold gleam, classic slot icon style',
            mid1: 'three stacked golden bars labeled BBB, classic slot icon',
            mid2: 'a single red bell with gold trim, classic slot icon',
            bonus: 'a pair of bright red cherries on a stem, classic slot icon',
        },
    },
    'blue-samurai': {
        skin: 'cyber',
        cover: 'a blue samurai warrior holding a glowing katana under cyberpunk neon skyline, electric blue and white accents',
        symbols: {
            hero: 'a stylized samurai shogun helmet, glowing blue, single bust portrait',
            mid1: 'a curved blue katana sword with gold tsuba, single icon',
            mid2: 'a cherry blossom with neon pink edges, single icon',
            bonus: 'a stylized cyber dragon head with glowing eyes, single icon',
        },
    },
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
    'ghostblade-strike': {
        skin: 'ronin',
        cover: 'a translucent blue ronin samurai with a ghostly katana, sakura petals swirling, moonlit cliff, cinematic neon-blue rim light',
        symbols: {
            hero: 'a glowing ghost samurai mask, single bust, blue energy haze, no eyes visible',
            mid1: 'a single curved katana with blue spirit flame trailing, polished steel',
            mid2: 'a sakura blossom emblem with five petals and a teal core',
            bonus: 'a glowing kanji-style amulet medallion with single rune, no readable text, blue spirit flame',
        },
    },
    'iron-fist': {
        skin: 'iron',
        cover: 'a gritty boxing arena with a single oversized iron-spiked gauntlet glowing orange, sparks flying, smoky red light',
        symbols: {
            hero: 'a clenched armored gauntlet fist, single icon, orange and chrome, sparks',
            mid1: 'a single boxing-style championship belt buckle medallion, brushed chrome with star',
            mid2: 'a stylized fight bell with crack across surface, brass and ember sparks',
            bonus: 'a glowing red fight gong with kanji-style stars in the center, no readable text',
        },
    },
    'coop-cluck': {
        skin: 'coop',
        cover: 'a cartoon mother chicken hen mascot wearing a chef apron, surrounded by a flock of chicks under a barn, midday sun, friendly stylized',
        symbols: {
            hero: 'a single golden chicken hen mascot bust, big eyes, friendly cartoon',
            mid1: 'a single sunny-side egg with bold yolk, glossy white, drop shadow',
            mid2: 'a wooden barn silo icon with red roof and flag, single building',
            bonus: 'a basket overflowing with golden eggs, ribbon banner above, cartoon-realistic',
        },
    },
    'miko-spirit': {
        skin: 'spirit',
        cover: 'a single floating paper lantern with cherry blossoms drifting against a misty mountain at dusk, magenta and warm coral light',
        symbols: {
            hero: 'a young anime-style spirit shrine maiden mask icon, single bust, soft glow',
            mid1: 'a single paper lantern with magenta light, swirling smoke wisps',
            mid2: 'a stylized fox spirit head with three tails, single bust, white fur and pink markings',
            bonus: 'a glowing torii gate amulet medallion, magenta runes, no readable text',
        },
    },
    'forge-anvil': {
        skin: 'forge',
        cover: 'a thunderous blacksmith forge cavern with a single glowing molten coin on a stone anvil, sparks flying, warm orange and ember light',
        symbols: {
            hero: 'a stylized molten gold coin half-submerged in lava, splashes of light',
            mid1: 'a single forging hammer with rune-etched head, brass and steel',
            mid2: 'a glowing stone anvil with crackling embers across the surface',
            bonus: 'a dragon-claw clasp holding a glowing red gem orb, embers swirling',
        },
    },
    'gummy-drops': {
        skin: 'gummy',
        cover: 'a glossy candyland with translucent gummy hearts and rings tumbling on a pastel pink and purple rainbow conveyor, sweet cute mood',
        symbols: {
            hero: 'a single translucent gummy bear, glossy strawberry red, soft drop shadow',
            mid1: 'a translucent gummy heart icon, glossy pink, no text',
            mid2: 'a glossy gummy ring lifesaver, translucent rainbow stripes',
            bonus: 'a glowing wrapped lollipop with twirl pattern and stick, pastel colors',
        },
    },
}

const rawArgs = process.argv.slice(2)
const flags = new Set(rawArgs.filter(arg => arg.startsWith('--')))
const targetArgs = rawArgs.filter(arg => !arg.startsWith('--'))
const missingOnly = flags.has('--missing-only')
const force = flags.has('--force')
const symbolsOnly = flags.has('--symbols-only')

async function exists(filePath) {
    try {
        await fs.access(filePath)
        return true
    } catch {
        return false
    }
}

async function generate(prompt, outPath, label) {
    if (missingOnly && !force && await exists(outPath)) {
        console.log(`  = ${label}: exists`)
        return true
    }
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

const targets = targetArgs.length ? targetArgs : Object.keys(TEMPLATES)

for (const id of targets) {
    const tmpl = TEMPLATES[id]
    if (!tmpl) {
        console.error(`Unknown template: ${id}`)
        continue
    }
    console.log(`\n== ${id} (skin: ${tmpl.skin}) ==`)

    if (!symbolsOnly) {
        const coverPath = path.resolve(`public/images/covers/generated/${id}.png`)
        await generate(`${tmpl.cover}, ${COVER_STYLE}`, coverPath, `${id} cover`)
    }

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
