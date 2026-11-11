import { rarityDropWeight } from './caseEconomy'
import { buildCaseOutcome, STANDARD_WEARS, STATTRAK_CHANCE, SOUVENIR_CHANCE } from './caseOpening'

// Disclosure only: enumerate the live rounded payout, without consuming RNG.
export function caseDisclosure(caseData, rows = 1) {
    const items = caseData?.items
    const price = Number(caseData?.openPriceGc)
    if (!items?.length || !Number.isFinite(price) || price <= 0 || ![1, 3, 5, 10].includes(rows)) return null
    const totalWeight = items.reduce((sum, item) => sum + rarityDropWeight(item), 0)
    const wearWeight = STANDARD_WEARS.reduce((sum, wear) => sum + wear.weight, 0)
    const variants = [
        { statTrak: true, souvenir: false, probability: STATTRAK_CHANCE },
        { statTrak: false, souvenir: true, probability: (1 - STATTRAK_CHANCE) * SOUVENIR_CHANCE },
        { statTrak: false, souvenir: false, probability: (1 - STATTRAK_CHANCE) * (1 - SOUVENIR_CHANCE) },
    ]
    let baseEv = 0, grossEv = 0, winChance = 0
    for (const item of items) {
        const probability = rarityDropWeight(item) / totalWeight
        baseEv += probability * (item.valueGc || item.multiplier || 1)
        for (const wear of STANDARD_WEARS) for (const variant of variants) {
            const p = probability * wear.weight / wearWeight * variant.probability
            const outcome = buildCaseOutcome(item, { unitPrice: price, wear, float: wear.minFloat, ...variant })
            grossEv += p * outcome.valueGc
            if (outcome.valueGc > price) winChance += p
        }
    }
    return { baseEv, grossEv: grossEv * rows, netEv: (grossEv - price) * rows, rtp: grossEv / price, winChance: rows === 1 ? winChance : undefined }
}
