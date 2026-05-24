// Retry helper for missing/failed slot art generations.
// Usage: node scripts/regenerateOne.mjs <template-id> <role> "<prompt subject>"
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

const TEMPLATES = {
    'wanted-revelation': 'wanted',
    'gates-ascent': 'olympus',
    'bass-bayou': 'bayou',
    'mummy-cascade': 'mummy',
    'phoenix-megaways': 'phoenix',
    'mansion-megaways': 'mansion',
}

const SYMBOL_STYLE = [
    'square 1024x1024',
    'one centered casino slot reel symbol',
    'transparent or near-black background, soft drop shadow',
    'crisp game-icon look with bold rim lighting',
    '3D render style, glossy, high contrast',
    'no text, no numbers, no watermark, no logo, no copyrighted property',
    'clone-owned, generic stylized casino art',
].join(', ')

const [tmpl, role, ...subjectParts] = process.argv.slice(2)
const subject = subjectParts.join(' ')
if (!tmpl || !role || !subject) {
    console.error('Usage: regenerateOne.mjs <template-id> <role> "<subject>"')
    process.exit(1)
}
const skin = TEMPLATES[tmpl]
if (!skin) {
    console.error(`Unknown template ${tmpl}`)
    process.exit(1)
}

const outPath = path.resolve(`public/assets/games/slots/${skin}/${tmpl}-${role}.png`)
const prompt = `${subject}, ${SYMBOL_STYLE}`
const body = JSON.stringify({ model: MODEL, prompt, size: '1024x1024' })
const ep = `${URL}/images/generations?response_format=binary`

let attempts = 0
let ok = false
while (attempts < 3 && !ok) {
    attempts += 1
    console.log(`attempt ${attempts}: ${tmpl}/${role}`)
    try {
        const res = await fetch(ep, {
            method: 'POST',
            headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
            body,
        })
        if (!res.ok) {
            console.error(`  HTTP ${res.status}`)
            await new Promise(r => setTimeout(r, 5000))
            continue
        }
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length < 1000) {
            console.error(`  too small (${buf.length}b)`)
            await new Promise(r => setTimeout(r, 5000))
            continue
        }
        await fs.mkdir(path.dirname(outPath), { recursive: true })
        await fs.writeFile(outPath, buf)
        console.log(`  saved ${(buf.length / 1024).toFixed(1)} kB to ${outPath}`)
        ok = true
    } catch (err) {
        console.error(`  error: ${err.message}`)
        await new Promise(r => setTimeout(r, 5000))
    }
}
process.exit(ok ? 0 : 1)
