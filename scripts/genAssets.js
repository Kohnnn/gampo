#!/usr/bin/env node
// Generate GamPo bitmap assets via 9Router image API.
// Reads scripts/assetManifest.js and saves PNGs into public/assets/games/<dir>/<name>.png.
//
// Required env (read from process.env or .env.local):
//   NINEROUTER_URL  base URL (e.g., https://9router.vnibb.xyz/v1)
//   NINEROUTER_KEY  bearer token (only if requireApiKey=true)
//
// Optional:
//   GAMPO_IMAGE_MODEL  override default model id
//   --force flag to regenerate existing files
//   --concurrency=N to override default 3
//   --filter=substr to only generate matching names

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assetManifest } from './assetManifest.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const OUT_ROOT = path.join(ROOT, 'public', 'assets', 'games')

// Lightweight .env.local loader. Skips lines that don't start with an
// identifier-friendly char (so legacy `9router_*` lines don't break Node).
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

await loadDotenv(path.join(ROOT, '.env.local'))
await loadDotenv(path.join(ROOT, '.env'))

const FALLBACK_MODELS = [
    'cx/gpt-5.5-image',
    'codex/gpt-5.5-image',
    'cx/gpt-5.4-image',
    'cx/gpt-5.3-image',
    'cx/gpt-5.2-image',
    'openai/gpt-5.5-image',
    'openai/gpt-image-1',
    'openai/dall-e-3',
    'gemini/gemini-3-pro-image-preview',
    'black-forest-labs/flux-schnell',
    'minimax/image',
]

function parseArgs(argv) {
    const args = { force: false, concurrency: 3, filter: null }
    for (const a of argv.slice(2)) {
        if (a === '--force') args.force = true
        else if (a.startsWith('--concurrency=')) args.concurrency = Math.max(1, Number(a.split('=')[1]) || 3)
        else if (a.startsWith('--filter=')) args.filter = a.split('=')[1]
    }
    return args
}

const args = parseArgs(process.argv)
const NINEROUTER_URL = process.env.NINEROUTER_URL || 'http://localhost:20128'
const NINEROUTER_KEY = process.env.NINEROUTER_KEY || ''
const PREFERRED_MODEL = process.env.GAMPO_IMAGE_MODEL || ''

async function pickModel() {
    try {
        const r = await fetch(`${NINEROUTER_URL}/v1/models/image`, {
            headers: NINEROUTER_KEY ? { Authorization: `Bearer ${NINEROUTER_KEY}` } : {},
        })
        if (!r.ok) throw new Error(`models/image ${r.status}`)
        const data = await r.json()
        const ids = (data?.data || []).map(d => d.id)
        if (PREFERRED_MODEL && ids.includes(PREFERRED_MODEL)) return [PREFERRED_MODEL]
        const ordered = [
            ...FALLBACK_MODELS.filter(m => ids.includes(m)),
            ...ids.filter(id => !FALLBACK_MODELS.includes(id)),
        ]
        if (!ordered.length) throw new Error('no image models available')
        return ordered
    } catch (err) {
        console.error('[genAssets] could not list models:', err.message)
        if (PREFERRED_MODEL) return [PREFERRED_MODEL, ...FALLBACK_MODELS]
        return FALLBACK_MODELS
    }
}

async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true })
}

async function fileExists(p) {
    try { await fs.access(p); return true } catch { return false }
}

async function generateOne(model, entry) {
    const url = `${NINEROUTER_URL}/v1/images/generations?response_format=binary`
    const body = JSON.stringify({
        model,
        prompt: entry.prompt,
        size: entry.size,
        quality: 'hd',
        output_format: 'png',
    })
    const r = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(NINEROUTER_KEY ? { Authorization: `Bearer ${NINEROUTER_KEY}` } : {}),
        },
        body,
    })
    if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`[${r.status}] ${text.slice(0, 240)}`)
    }
    const buf = Buffer.from(await r.arrayBuffer())
    return buf
}

async function generateWithFallback(models, entry) {
    let lastError = null
    for (const model of models) {
        try {
            const buf = await generateOne(model, entry)
            return { buf, model }
        } catch (err) {
            lastError = err
            console.warn(`[genAssets] ${entry.name}: ${model} failed (${err.message})`)
        }
    }
    throw lastError || new Error('all models failed')
}

async function processEntry(models, entry) {
    if (args.filter && !entry.name.includes(args.filter)) return { skipped: true }
    const dir = path.join(OUT_ROOT, entry.dir || '')
    const out = path.join(dir, `${entry.name}.png`)
    if (!args.force && await fileExists(out)) {
        return { skipped: true, out }
    }
    await ensureDir(dir)
    const start = Date.now()
    const { buf, model } = await generateWithFallback(models, entry)
    await fs.writeFile(out, buf)
    return { skipped: false, out, model, ms: Date.now() - start, bytes: buf.length }
}

async function runPool(items, worker, concurrency) {
    const queue = items.slice()
    const results = []
    const workers = Array.from({ length: concurrency }, async () => {
        while (queue.length) {
            const item = queue.shift()
            try {
                results.push({ entry: item, result: await worker(item) })
            } catch (err) {
                results.push({ entry: item, error: err })
            }
        }
    })
    await Promise.all(workers)
    return results
}

async function main() {
    if (!NINEROUTER_URL) {
        console.error('NINEROUTER_URL not set. Aborting.')
        process.exit(2)
    }
    console.log('[genAssets] using gateway:', NINEROUTER_URL)
    if (PREFERRED_MODEL) console.log('[genAssets] preferred model:', PREFERRED_MODEL)
    const models = await pickModel()
    console.log('[genAssets] candidate models (in priority order):', models.slice(0, 5).join(', '))
    await ensureDir(OUT_ROOT)
    const results = await runPool(assetManifest, e => processEntry(models, e), args.concurrency)
    let ok = 0, skipped = 0, failed = 0
    for (const r of results) {
        if (r.error) {
            failed++
            console.error(`[genAssets] FAIL ${r.entry.name}: ${r.error.message}`)
        } else if (r.result.skipped) {
            skipped++
        } else {
            ok++
            console.log(`[genAssets] ok ${r.entry.name} via ${r.result.model} ${(r.result.bytes / 1024).toFixed(1)}KB ${r.result.ms}ms`)
        }
    }
    console.log(`[genAssets] done. generated=${ok} skipped=${skipped} failed=${failed}`)
    if (failed) process.exit(1)
}

main().catch(err => {
    console.error('[genAssets] fatal:', err)
    process.exit(1)
})
