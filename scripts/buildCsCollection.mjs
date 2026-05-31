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
//   public/data/cs-collection.json     full collection catalog (every skin, every wear)
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
import {
    fallbackOpenPriceGc,
    inferCaseCategory,
    roundGc,
} from '../src/components/games/cases/caseEconomy.js'

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
    // hot path stays fast. Keep up to 60 cases, capped at 18 items each so
    // the wheel reads cleanly.
    //
    // Wave 41: tier is now driven by **highest rarity present** in the
    // case's contains list (not by max multiplier). The CS2 rarity ladder
    // maps cleanly to four playable tiers:
    //
    //   classified    = Mil-Spec / Restricted / Industrial Grade / High Grade
    //   covert        = Classified / Remarkable / Exotic
    //   exceedingly   = Covert
    //   contraband    = Extraordinary / Contraband / ★ knife-grade
    //
    // This replaces the prior `low / mid / high` model that the user
    // asked to retire.
    const PLAYABLE_TYPES = new Set([
        'Case',
        'Souvenir',
        'Souvenir Package',
        'Souvenir Highlight',
        'Sticker Capsule',
        'Autograph Capsule',
        'Patch Capsule',
        'Patch Pack',
        'Music Kit Box',
    ])
    function rarityRank(name) {
        switch (name) {
            case 'Consumer Grade': return 1
            case 'Industrial Grade': return 2
            case 'Mil-Spec Grade': return 3
            case 'High Grade': return 3
            case 'Restricted': return 4
            case 'Remarkable': return 4
            case 'Classified': return 5
            case 'Exotic': return 5
            case 'Covert': return 6
            case 'Contraband': return 7
            case 'Extraordinary': return 7
            case '★': return 7
            default: return 3
        }
    }
    function tierForCase(c) {
        let rank = 0
        for (const it of c.items) {
            const r = rarityRank(it.rarity)
            if (r > rank) rank = r
        }
        if (rank >= 7) return 'contraband'
        if (rank >= 6) return 'exceedingly'
        if (rank >= 5) return 'covert'
        return 'classified'
    }
    const PLAYABLE_LIMIT = 60
    const PLAYABLE_CATEGORY_TARGETS = {
        weapon: 24,
        souvenir: 14,
        stickers: 16,
        music: 6,
    }
    const PLAYABLE_CATEGORY_ORDER = ['weapon', 'souvenir', 'stickers', 'music']
    const playableCandidates = crates
        .filter(c => PLAYABLE_TYPES.has(c.type))
        .map(c => {
            const items = c.items.slice(0, 18).map(it => ({
                id: it.skinId,
                name: it.name,
                image: it.image,
                rarity: it.rarity,
                color: it.color,
                multiplier: it.multiplier,
                valueGc: roundGc(it.multiplier || 1, 1),
                isRare: it.isRare,
            }))
            const base = {
                id: c.id,
                name: c.name,
                image: c.image,
                description: c.description,
                tier: tierForCase({ items }),
                type: c.type,
                items,
            }
            const category = inferCaseCategory(base)
            return {
                ...base,
                category,
                openPriceGc: fallbackOpenPriceGc(base),
                priceSource: 'fallback-ev',
            }
        })
        .filter(c => c.items.length > 0)

    const groupedPlayable = PLAYABLE_CATEGORY_ORDER.reduce((acc, category) => {
        acc[category] = playableCandidates
            .filter(c => c.category === category)
            .sort((a, b) => (b.openPriceGc || 0) - (a.openPriceGc || 0) || a.name.localeCompare(b.name))
        return acc
    }, {})
    const selectedPlayable = new Map()
    for (const category of PLAYABLE_CATEGORY_ORDER) {
        for (const c of groupedPlayable[category].slice(0, PLAYABLE_CATEGORY_TARGETS[category])) {
            selectedPlayable.set(c.id, c)
        }
    }
    for (const category of PLAYABLE_CATEGORY_ORDER) {
        for (const c of groupedPlayable[category]) {
            if (selectedPlayable.size >= PLAYABLE_LIMIT) break
            selectedPlayable.set(c.id, c)
        }
        if (selectedPlayable.size >= PLAYABLE_LIMIT) break
    }

    const playable = Array.from(selectedPlayable.values())
        .sort((a, b) => {
            const ca = PLAYABLE_CATEGORY_ORDER.indexOf(a.category)
            const cb = PLAYABLE_CATEGORY_ORDER.indexOf(b.category)
            return ca - cb || (b.openPriceGc || 0) - (a.openPriceGc || 0) || a.name.localeCompare(b.name)
        })

    const casesPath = path.join(ROOT, 'public', 'data', 'cs-cases.json')
    await fs.writeFile(casesPath, JSON.stringify(playable))
    const stat2 = await fs.stat(casesPath)
    console.log(`Wrote ${casesPath} (${(stat2.size / 1024).toFixed(1)} KB) — ${playable.length} playable cases`)

    // Wave 41: cs2cap.com baseline ingestion. Pulls rarity + image metadata
    // for every CS2 item via /v1/items (the same source we already use for
    // skins.json), then enriches with price data from /v1/prices when the
    // user flagged `--prices`. The output is a USD-keyed rarity tier we
    // use to drive the new "collection" model in CasesGame instead of
    // the old low/mid/high tier.
    const cs2capKey = process.env.cs2cap_token
    if (cs2capKey) {
        console.log('Fetching cs2cap.com /v1/items baseline...')
        try {
            const all = []
            let offset = 0
            const pageSize = 100
            // Cap at 8000 items (80 pages) to avoid burning quota — covers
            // the entire CS2 weapon-skin catalog comfortably.
            while (offset < 8000) {
                const url = `https://api.cs2c.app/v1/items?limit=${pageSize}&offset=${offset}`
                const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${cs2capKey}` },
                })
                if (!res.ok) {
                    console.warn(`  cs2cap items page ${offset}: HTTP ${res.status}`)
                    break
                }
                const data = await res.json()
                const page = Array.isArray(data?.items) ? data.items : []
                if (page.length === 0) break
                all.push(...page)
                if (offset === 0 || (offset / pageSize) % 10 === 0) {
                    console.log(`  cs2cap items page offset=${offset} got ${page.length}`)
                }
                if (page.length < pageSize) break
                offset += pageSize
            }
            console.log(`  cs2cap total items: ${all.length}`)
            // Build the rarity index: market_hash_name -> { rarity, color, type, ... }.
            const rarityMap = {}
            for (const item of all) {
                const key = item.market_hash_name
                if (!key) continue
                rarityMap[key] = {
                    rarityName: item.rarity_name || null,
                    rarityColor: item.rarity_color ? `#${item.rarity_color}` : null,
                    itemType: item.item_type || null,
                    weaponType: item.weapon_type || null,
                    minFloat: item.min_float ?? null,
                    maxFloat: item.max_float ?? null,
                    statTrak: !!item.is_stattrak,
                    souvenir: !!item.is_souvenir,
                    cdnIcon: item.image_url || null,
                    phase: item.phase || null,
                }
            }
            const cs2capPath = path.join(ROOT, 'public', 'data', 'cs2cap-rarity.json')
            await fs.writeFile(cs2capPath, JSON.stringify(rarityMap))
            const stat = await fs.stat(cs2capPath)
            console.log(`Wrote ${cs2capPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB) — ${Object.keys(rarityMap).length} cs2cap entries`)
        } catch (err) {
            console.warn('  cs2cap failed:', err.message)
        }
    }

    // Optional price enrichment.
    if (args.has('--prices')) {
        const csmarketKey = process.env.csmarketapi_token
        const map = {}
        let sources = 0
        if (process.env.steamanalyst_token) {
            console.log('SteamAnalyst token present; skipping /v2 because this tier returns 401.')
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
            console.log('Fetching playable case prices from csmarketapi /v1/listings/latest/aggregate...')
            try {
                let pricedCases = 0
                for (const caseData of playable) {
                    const params = new URLSearchParams({
                        key: csmarketKey,
                        market_hash_name: caseData.name,
                        currency: 'USD',
                    })
                    const res = await fetch(`https://api.csmarketapi.com/v1/listings/latest/aggregate?${params}`)
                    if (!res.ok) {
                        if (pricedCases === 0) console.warn(`  csmarketapi aggregate: HTTP ${res.status}`)
                        continue
                    }
                    const data = await res.json()
                    const row = Array.isArray(data) ? data[0] : data?.data || data
                    const median = row?.median_price ?? row?.medianPrice ?? row?.median
                    const min = row?.min_price ?? row?.minPrice ?? row?.min
                    const mean = row?.mean_price ?? row?.meanPrice ?? row?.mean
                    const price = median ?? min ?? mean
                    if (price === undefined || price === null) continue
                    const numericPrice = Number(price)
                    if (!Number.isFinite(numericPrice) || numericPrice <= 0) continue
                    map[caseData.name] = {
                        ...(map[caseData.name] || {}),
                        openPriceGc: roundGc(numericPrice, 1),
                        csmarket: {
                            ...(map[caseData.name]?.csmarket || {}),
                            price: roundGc(numericPrice, 1),
                            median_price: median !== undefined && median !== null ? Number(median) : null,
                            min_price: min !== undefined && min !== null ? Number(min) : null,
                            mean_price: mean !== undefined && mean !== null ? Number(mean) : null,
                            listings: row?.listings ?? null,
                            market: row?.market ?? null,
                            timestamp: row?.timestamp ?? null,
                            currency: 'USD',
                        },
                    }
                    pricedCases += 1
                }
                if (pricedCases > 0) {
                    if (sources === 0) sources += 1
                    console.log(`  csmarketapi aggregate: ${pricedCases} playable case prices`)
                }
            } catch (err) {
                console.warn('  csmarketapi aggregate failed:', err.message)
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
