#!/usr/bin/env node
// Wave 31: Build the full CS2 collection dataset.
//
// Pulls from the ByMykel/CSGO-API (CC0):
//   - crates.json   (all cases, contracts, sticker capsules, etc.)
//   - skins.json    (all skin paint variants — used to enrich each crate's items
//                    with available wear conditions + float ranges)
//
// Optional price enrichment via SteamAnalyst / csmarketapi is wired through
// `--prices` flag using the API tokens in `.env.local`. Skipping prices keeps
// the build offline-friendly. The token file is .gitignored.
//
// Outputs:
//   public/data/cs-cases.json          curated cases for the carousel game (kept small)
//   public/data/cs-collection.json     full pokedex catalog (every skin, every wear)
//   public/data/cs-prices.json         optional price map keyed by skin id
//
// Dataset shape (cs-collection.json):
//   {
//     generatedAt: ISO,
//     totalCrates: N,
//     totalSkins: N,           // unique skin ids
//     totalEntries: N,         // skin × wear-condition entries
//     wears: ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'],
//     rarities: { name -> { color, tier, multiplier } },
//     crates: [{ id, name, image, type, items: [{ skinId, name, image, rarity }] }],
//     skins: { [skinId]: { id, name, image, rarity: {name,color}, weapon, category,
//                          minFloat, maxFloat, paintIndex, statTrak,
//                          souvenir, crates: [{ id, name }],
//                          wearVariants: [{ wear, minFloat, maxFloat }] } },
//   }
//
// Usage:
//   node scripts/buildCsCollection.mjs            # full catalog, no prices
//   node scripts/buildCsCollection.mjs --prices   # also fetch prices

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// Lightweight .env.local loader. Skips lines that don't start with an
// identifier-friendly char (so `9router_*` style lines don't break Node).
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

const CRATES_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json'
const SKINS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json'
const STICKERS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/stickers.json'

const STANDARD_WEARS = [
    { name: 'Factory New', short: 'FN', minFloat: 0.00, maxFloat: 0.07 },
    { name: 'Minimal Wear', short: 'MW', minFloat: 0.07, maxFloat: 0.15 },
    { name: 'Field-Tested', short: 'FT', minFloat: 0.15, maxFloat: 0.38 },
    { name: 'Well-Worn', short: 'WW', minFloat: 0.38, maxFloat: 0.45 },
    { name: 'Battle-Scarred', short: 'BS', minFloat: 0.45, maxFloat: 1.00 },
]

const RARITY_LADDER = {
    'Consumer Grade':    { tier: 1, multiplier: 0.3,  color: '#b0c3d9' },
    'Industrial Grade':  { tier: 2, multiplier: 0.6,  color: '#5e98d9' },
    'Mil-Spec Grade':    { tier: 3, multiplier: 1.4,  color: '#4b69ff' },
    'Restricted':        { tier: 4, multiplier: 3.4,  color: '#8847ff' },
    'Classified':        { tier: 5, multiplier: 11.0, color: '#d32ce6' },
    'Covert':            { tier: 6, multiplier: 32.0, color: '#eb4b4b' },
    'Contraband':        { tier: 7, multiplier: 90.0, color: '#e4ae39' },
    'Extraordinary':     { tier: 7, multiplier: 90.0, color: '#e4ae39' },
    '★':                  { tier: 7, multiplier: 90.0, color: '#e4ae39' },
}

function rarityMeta(name) {
    return RARITY_LADDER[name] || { tier: 3, multiplier: 1.0, color: '#4b69ff' }
}

function wearVariantsFor(minFloat, maxFloat) {
    if (typeof minFloat !== 'number' || typeof maxFloat !== 'number') return STANDARD_WEARS.slice()
    return STANDARD_WEARS.filter(w => w.maxFloat > minFloat && w.minFloat < maxFloat).map(w => ({
        wear: w.name,
        short: w.short,
        minFloat: Math.max(minFloat, w.minFloat),
        maxFloat: Math.min(maxFloat, w.maxFloat),
    }))
}

async function loadJson(url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`)
    return res.json()
}

function shortId(id) {
    return id || `unk-${Math.random().toString(16).slice(2, 8)}`
}

async function main() {
    const args = new Set(process.argv.slice(2))
    console.log('Pulling crates + skins from ByMykel/CSGO-API...')
    const [cratesRaw, skinsRaw] = await Promise.all([loadJson(CRATES_URL), loadJson(SKINS_URL)])
    console.log(`  crates: ${cratesRaw.length}`)
    console.log(`  skins:  ${skinsRaw.length}`)

    // Build skins index keyed by id.
    const skinsIndex = {}
    for (const s of skinsRaw) {
        const id = shortId(s.id)
        const rarityName = s.rarity?.name || 'Mil-Spec Grade'
        const meta = rarityMeta(rarityName)
        const wears = wearVariantsFor(s.min_float, s.max_float)
        skinsIndex[id] = {
            id,
            name: s.name,
            image: s.image,
            rarity: {
                name: rarityName,
                color: s.rarity?.color || meta.color,
                tier: meta.tier,
                multiplier: meta.multiplier,
            },
            weapon: s.weapon?.name || s.weapon?.weapon_id || null,
            category: s.category?.name || null,
            pattern: s.pattern?.name || null,
            paintIndex: s.paint_index || null,
            phase: s.phase || null,
            minFloat: typeof s.min_float === 'number' ? s.min_float : null,
            maxFloat: typeof s.max_float === 'number' ? s.max_float : null,
            statTrak: !!s.stattrak,
            souvenir: !!s.souvenir,
            wearVariants: wears,
            crates: Array.isArray(s.crates)
                ? s.crates.slice(0, 4).map(c => ({ id: c.id, name: c.name }))
                : [],
            collections: Array.isArray(s.collections)
                ? s.collections.slice(0, 2).map(c => ({ id: c.id, name: c.name }))
                : [],
        }
    }

    // Build crates dataset; only include ones with items[]+contains_rare[].
    const crates = []
    let totalContains = 0
    for (const c of cratesRaw) {
        const containsAll = [
            ...(c.contains || []).map(it => ({ ...it, isRare: false })),
            ...(c.contains_rare || []).map(it => ({ ...it, isRare: true })),
        ]
        if (containsAll.length === 0) continue
        const items = containsAll.map(it => {
            const sid = shortId(it.id)
            const meta = rarityMeta(it.rarity?.name)
            return {
                skinId: sid,
                name: it.name,
                image: it.image,
                rarity: it.rarity?.name || 'Mil-Spec Grade',
                color: it.rarity?.color || meta.color,
                multiplier: meta.multiplier * (it.isRare ? 1.6 : 1),
                isRare: !!it.isRare,
                statTrak: !!it.stattrak,
                souvenir: !!it.souvenir,
                phase: it.phase || null,
            }
        })
        totalContains += items.length
        crates.push({
            id: c.id,
            name: c.name,
            image: c.image,
            description: c.description || null,
            type: c.type || 'Case',
            firstSale: c.first_sale_date || null,
            items,
        })
    }
    console.log(`  crates kept: ${crates.length}, contains rows: ${totalContains}`)

    // Output collection.json
    const collection = {
        generatedAt: new Date().toISOString(),
        totalCrates: crates.length,
        totalSkins: Object.keys(skinsIndex).length,
        totalEntries: Object.values(skinsIndex).reduce((s, sk) => s + (sk.wearVariants?.length || 0), 0),
        wears: STANDARD_WEARS,
        rarities: RARITY_LADDER,
        crates,
        skins: skinsIndex,
    }
    const collectionPath = path.join(ROOT, 'public', 'data', 'cs-collection.json')
    await fs.mkdir(path.dirname(collectionPath), { recursive: true })
    await fs.writeFile(collectionPath, JSON.stringify(collection))
    const cstat = await fs.stat(collectionPath)
    console.log(`Wrote ${collectionPath} (${(cstat.size / 1024 / 1024).toFixed(2)} MB)`)

    // Build a small "playable cases" subset for the carousel game so the
    // hot path stays fast. Keep up to 24 cases biased toward Cases /
    // Stickers Capsules / Souvenir packages, capped at 18 items each so
    // the wheel reads cleanly.
    const PLAYABLE_TYPES = new Set(['Case', 'Souvenir Package', 'Sticker Capsule', 'Container', 'Patch Pack', 'Music Kit Box'])
    const playable = crates
        .filter(c => PLAYABLE_TYPES.has(c.type))
        .slice(0, 60)
        .map(c => {
            const items = c.items.slice(0, 18).map(it => ({
                id: it.skinId,
                name: it.name,
                image: it.image,
                rarity: it.rarity,
                color: it.color,
                multiplier: it.multiplier,
                isRare: it.isRare,
            }))
            const tier = items.some(it => it.multiplier >= 30) ? 'high'
                : items.some(it => it.multiplier >= 8) ? 'mid'
                : 'low'
            return {
                id: c.id,
                name: c.name,
                image: c.image,
                description: c.description,
                tier,
                type: c.type,
                items,
            }
        })
        .filter(c => c.items.length > 0)
        .sort((a, b) => {
            const ta = { low: 0, mid: 1, high: 2 }[a.tier]
            const tb = { low: 0, mid: 1, high: 2 }[b.tier]
            return ta - tb || a.name.localeCompare(b.name)
        })

    const casesPath = path.join(ROOT, 'public', 'data', 'cs-cases.json')
    await fs.writeFile(casesPath, JSON.stringify(playable))
    const stat2 = await fs.stat(casesPath)
    console.log(`Wrote ${casesPath} (${(stat2.size / 1024).toFixed(1)} KB) — ${playable.length} playable cases`)

    // Optional price enrichment.
    if (args.has('--prices')) {
        const csmarketKey = process.env.csmarketapi_token
        const steamAnalystKey = process.env.steamanalyst_token
        const map = {}
        let sources = 0
        if (steamAnalystKey) {
            console.log('Fetching prices from SteamAnalyst /v2 (full dump)...')
            try {
                const url = `https://api.steamanalyst.com/v2/${steamAnalystKey}`
                const res = await fetch(url)
                if (res.ok) {
                    const data = await res.json()
                    // Response shape: array of item objects keyed by market_name.
                    const items = Array.isArray(data) ? data
                        : Array.isArray(data?.items) ? data.items
                        : Array.isArray(data?.data) ? data.data
                        : (typeof data === 'object' && data !== null) ? Object.values(data)
                        : []
                    for (const item of items) {
                        const key = item.market_name || item.market_hash_name || item.name
                        if (!key) continue
                        const safeRaw = item.safe_price_raw ?? null
                        const safe = item.safe_price ?? null
                        const avg7 = item.avg_price_7_days_raw ?? item.avg_price_7_days ?? null
                        const avg30 = item.avg_price_30_days_raw ?? item.avg_price_30_days ?? null
                        const cur = item.current_price ?? null
                        const sugAvg = item.suggested_amount_avg_raw ?? item.suggested_amount_avg ?? null
                        const price = safeRaw ?? safe ?? avg7 ?? sugAvg ?? cur
                        if (price === null || price === undefined) continue
                        map[key] = {
                            ...(map[key] || {}),
                            steamAnalyst: {
                                price: typeof price === 'string' ? Number(price.replace(/,/g, '')) : Number(price),
                                avg7: avg7 !== null ? Number(avg7) : null,
                                avg30: avg30 !== null ? Number(avg30) : null,
                                soldLast24h: item.sold_last_24h ? Number(item.sold_last_24h) : null,
                                soldLast7d: item.sold_last_7d ? Number(item.sold_last_7d) : null,
                                manipulated: item.ongoing_price_manipulation === '1' || item.ongoing_price_manipulation === 1,
                                phases: item.phases || null,
                                currency: 'USD',
                            },
                        }
                    }
                    sources += 1
                    console.log(`  steamAnalyst: ${items.length} rows, ${Object.keys(map).length} priced`)
                } else {
                    console.warn(`  steamAnalyst: HTTP ${res.status}`)
                }
            } catch (err) {
                console.warn('  steamAnalyst failed:', err.message)
            }
        }
        if (csmarketKey) {
            console.log('Fetching CS2 item catalog from csmarketapi /v1/items/ (metadata)...')
            try {
                const url = `https://api.csmarketapi.com/v1/items/?key=${csmarketKey}`
                const res = await fetch(url)
                if (res.ok) {
                    const items = await res.json()
                    let added = 0
                    // Build a set of all skin names referenced by our crates
                    // so we only keep metadata for skins in the playable
                    // catalog (the full csmarketapi dump is 31k+ items —
                    // most are stickers, charms, and capsules we don't pull).
                    const wanted = new Set()
                    for (const c of crates) {
                        for (const it of c.items) {
                            if (it.name) wanted.add(it.name)
                        }
                    }
                    for (const sk of Object.values(skinsIndex)) {
                        if (sk.name) wanted.add(sk.name)
                    }
                    if (Array.isArray(items)) {
                        for (const item of items) {
                            const key = item.market_hash_name
                            if (!key) continue
                            // Strip wear suffix like "(Field-Tested)" so we
                            // can match against skin display names.
                            const baseName = key.replace(/\s*\([^)]+\)\s*$/, '')
                            if (!wanted.has(key) && !wanted.has(baseName)) continue
                            map[key] = {
                                ...(map[key] || {}),
                                csmarket: {
                                    weapon: item.weapon || null,
                                    category: item.category || null,
                                    quality: item.quality || null,
                                    exterior: item.exterior || null,
                                    minFloat: item.min_float || null,
                                    maxFloat: item.max_float || null,
                                    cdnIcon: item.cloudflare_icon_url || item.akamai_icon_url || null,
                                },
                            }
                            added += 1
                        }
                    }
                    sources += 1
                    console.log(`  csmarketapi: ${added} item metadata rows kept (filtered from ${Array.isArray(items) ? items.length : 0})`)
                } else {
                    console.warn(`  csmarketapi: HTTP ${res.status}`)
                }
            } catch (err) {
                console.warn('  csmarketapi failed:', err.message)
            }
        }
        if (sources === 0) {
            console.warn('No price source tokens worked. Check tokens in .env.local.')
        } else {
            const pricesPath = path.join(ROOT, 'public', 'data', 'cs-prices.json')
            await fs.writeFile(pricesPath, JSON.stringify(map))
            const pstat = await fs.stat(pricesPath)
            console.log(`Wrote ${pricesPath} (${(pstat.size / 1024).toFixed(1)} KB) — ${Object.keys(map).length} skins from ${sources} source(s)`)
        }
    } else {
        console.log('(skipping prices — pass --prices to enable)')
    }
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
