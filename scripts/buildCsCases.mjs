#!/usr/bin/env node
// Curate a small CS:GO case dataset for /cases simulator.
//
// Source: https://github.com/ByMykel/CSGO-API (CC0)
// Output: public/data/cs-cases.json
//
// Usage: node scripts/buildCsCases.mjs
//
// Picks a fixed list of well-known cases (Mirage, Inferno, Dust 2, etc),
// keeps only id/name/image/description plus the contains[] + contains_rare[]
// items with their rarity color/name. Output stays under ~250KB.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SOURCE = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json'

// Curated case picks. 4 per tier: low / mid / high. Stake-recognizable.
const PICKED_LOW = ['CS:GO Weapon Case', 'CS:GO Weapon Case 2', 'eSports 2013 Case', 'Huntsman Weapon Case']
const PICKED_MID = ['Spectrum Case', 'Operation Hydra Case', 'Clutch Case', 'Recoil Case']
const PICKED_HIGH = ['Chroma 2 Case', 'Glove Case', 'Falchion Case', 'Kilowatt Case']
const PICKED = new Set([...PICKED_LOW, ...PICKED_MID, ...PICKED_HIGH])

const PICK_TIER = (name) => {
    if (PICKED_LOW.includes(name)) return 'low'
    if (PICKED_MID.includes(name)) return 'mid'
    if (PICKED_HIGH.includes(name)) return 'high'
    return 'mid'
}

// Cap items per case to keep payload small. Always include all
// contains_rare entries; sample contains to fill.
const MAX_ITEMS_PER_CASE = 14

function pickRarityValue(rarityName) {
    // Stake-style ladder. Higher rarity -> higher payout multiplier.
    switch (rarityName) {
        case 'Consumer Grade': return 0.4
        case 'Industrial Grade': return 0.7
        case 'Mil-Spec Grade': return 1.4
        case 'Restricted': return 3.6
        case 'Classified': return 12
        case 'Covert': return 38
        case 'Extraordinary':
        case '★': return 95
        default: return 1
    }
}

// Pick `count` items spaced evenly across `arr` so the curated list
// keeps a representative spread of skin colors/rarities, not just the
// first N entries.
function sampleEvenly(arr, count) {
    if (!Array.isArray(arr) || arr.length === 0 || count <= 0) return []
    if (arr.length <= count) return arr.slice()
    const out = []
    const step = arr.length / count
    for (let i = 0; i < count; i += 1) {
        const idx = Math.min(arr.length - 1, Math.floor(i * step))
        out.push(arr[idx])
    }
    return out
}

async function main() {
    console.log('Downloading source...')
    const res = await fetch(SOURCE)
    if (!res.ok) throw new Error(`Source fetch failed: ${res.status}`)
    const all = await res.json()
    console.log(`Source has ${all.length} entries`)

    const cases = all.filter(c => c.type === 'Case' && PICKED.has(c.name))
    console.log(`Matched ${cases.length} curated cases`)

    const out = cases.map(c => {
        const rare = (c.contains_rare || []).map(it => ({ ...it, isRare: true }))
        const common = (c.contains || []).map(it => ({ ...it, isRare: false }))
        const slots = MAX_ITEMS_PER_CASE - rare.length
        const sampledCommon = slots > 0 ? sampleEvenly(common, slots) : []
        const items = [...rare, ...sampledCommon].map(it => ({
            id: it.id,
            name: it.name,
            image: it.image,
            rarity: it.rarity?.name || 'Mil-Spec Grade',
            color: it.rarity?.color || '#4b69ff',
            multiplier: pickRarityValue(it.rarity?.name),
            isRare: it.isRare,
        }))
        return {
            id: c.id,
            name: c.name,
            description: c.description || null,
            image: c.image,
            tier: PICK_TIER(c.name),
            items,
        }
    }).filter(c => c.items.length > 0)

    // Sort lowest tier first.
    const tierOrder = { low: 0, mid: 1, high: 2 }
    out.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier] || a.name.localeCompare(b.name))

    const targetPath = path.join(__dirname, '..', 'public', 'data', 'cs-cases.json')
    await fs.writeFile(targetPath, JSON.stringify(out, null, 0))
    const stat = await fs.stat(targetPath)
    console.log(`Wrote ${out.length} cases to ${targetPath} (${stat.size} bytes)`)
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
