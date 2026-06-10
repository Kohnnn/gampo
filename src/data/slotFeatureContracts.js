// slotFeatureContracts.js — Wave 32 deeper per-template explanations.
//
// Each entry maps a slot template id to a structured contract that the
// SlotsGame "Feature contract" panel renders. The shape is:
//   {
//     summary:    short 1-line pitch
//     mechanics:  array of { name, detail } describing each feature
//     bonusEntry: how the bonus is triggered (or null)
//     bonusFlow:  array of bullets describing the bonus
//     volatility: math note (per-template hint)
//     buyBonus:   note on bonus buy if applicable
//   }
//
// Math is unchanged from `slotFactory.js`. The contracts here just
// surface the rules in plain English so the player knows what to expect.

export const SLOT_FEATURE_CONTRACTS = {
    'vault-rush': {
        summary: 'Bank-themed coin meter slot. Collect coins to fill the vault, then unlock free spins.',
        mechanics: [
            { name: 'Coin meter', detail: 'Each coin symbol that lands counts toward a 30-coin meter. Each coin pays 0.32x bet on the spot. Filling the meter triggers the vault feature.' },
            { name: 'Scatter free spins', detail: '3+ bonus scatters across the reels award 6 free spins.' },
            { name: 'Anticipation', detail: 'Reels 4 and 5 slow down dramatically when 2+ scatters land in earlier reels.' },
            { name: 'Wins', detail: 'Pays both ways across 5 reels using ways-pays evaluation. Vault symbol pays the headline 8x.' },
        ],
        bonusEntry: 'Land 3+ bonus scatters or fill the coin meter.',
        bonusFlow: [
            '6 free spins triggered.',
            'Scatter respin pulses + persistent coin counts.',
            'Coin meter resets at the end of the bonus.',
        ],
        volatility: 'High volatility — small wins frequent, headline wins rare.',
        buyBonus: 'Buy options: 30x (lite, 2 scatters), 45x (standard, 3 scatters), 90x (super, 4 scatters).',
    },
    'river-catcher': {
        summary: 'Fishing-themed line pays with hook bonuses and shell free spins.',
        mechanics: [
            { name: '20 paylines', detail: 'Wins are evaluated left-to-right across 20 fixed paylines.' },
            { name: 'Hook hero', detail: 'The catcher symbol pays the headline 9x and substitutes nothing — line pay only.' },
            { name: 'Wild', detail: 'Substitutes for any non-scatter symbol on a payline.' },
            { name: 'Anticipation', detail: 'Reels slow on 2+ scatters in a single spin.' },
        ],
        bonusEntry: '3+ shell scatters anywhere on the reels.',
        bonusFlow: [
            '7 free spins triggered.',
            'Scatter retrigger keeps the bonus rolling.',
            'Side character animations on big hits.',
        ],
        volatility: 'High volatility, ~94.5% RTP.',
        buyBonus: 'Buy options: 60x (3 scatters), 120x (super, 4 scatters).',
    },
    'dust-rail': {
        summary: 'Western-themed expanding-wild slot with sheriff badges.',
        mechanics: [
            { name: 'Expanding wilds', detail: 'When a wild lands on reel 2-5 it expands to cover the full reel for the spin.' },
            { name: 'Lines', detail: '20 paylines, left-to-right.' },
            { name: 'Bonus badges', detail: '3+ badges trigger 5 free spins. Expanding wilds stay active during the bonus.' },
        ],
        bonusEntry: '3+ sheriff badge scatters.',
        bonusFlow: [
            '5 free spins.',
            'Wilds keep expanding to fill their reel during the bonus.',
        ],
        volatility: 'Medium-high volatility.',
        buyBonus: 'Buy options: 50x (standard), 100x (super).',
    },
    'storm-banner': {
        summary: 'Mythic ways-pays with total-win banner reveals.',
        mechanics: [
            { name: 'Ways pays', detail: 'No paylines — pays anywhere a matching symbol appears in 3+ adjacent reels left-to-right.' },
            { name: 'Total win banner', detail: 'When a win lands, a centered banner draws in showing the total credits.' },
            { name: 'Expanding wilds', detail: 'Wilds expand to fill the reel they land on.' },
        ],
        bonusEntry: '3+ rune scatters.',
        bonusFlow: [
            '8 free spins.',
            'Expanding wilds remain expanded.',
            'Persistent multiplier seeds at 1x.',
        ],
        volatility: 'High volatility, ~95% RTP.',
        buyBonus: null,
    },
    'bassline-bonus': {
        summary: 'Neon rock theme with cluster pays and a tumble multiplier ladder.',
        mechanics: [
            { name: 'Cluster pays', detail: '5+ matching symbols touching orthogonally form a cluster. Larger clusters = bigger pay.' },
            { name: 'Cascade', detail: 'Winning symbols disappear and new ones tumble in. Each cascade bumps the multiplier ladder: 1x → 2x → 3x → 5x → 10x.' },
            { name: 'Multiplier orbs', detail: 'Orb symbols carry a random 2x–100x value. On any winning tumble the orb values are summed and multiply the whole win.' },
            { name: 'Intro overlay', detail: 'First spin shows a neon intro card with the volatility cue.' },
        ],
        bonusEntry: '3+ ticket scatters.',
        bonusFlow: [
            '6 free spins.',
            'Cascade ladder resets every spin.',
            'Big-energy result pulses on every cluster.',
        ],
        volatility: 'High volatility — wide variance from cascade chains.',
        buyBonus: null,
    },
    'scarab-spin': {
        summary: 'Egyptian respin slot. Scarabs trigger a guaranteed-win respin.',
        mechanics: [
            { name: 'Scarab respin', detail: 'Land 3+ scarabs to trigger a respin where every scarab locks as a wild.' },
            { name: 'Lock boost', detail: 'Each locked wild applies a 1.4x multiplier to any winning line that crosses it.' },
            { name: 'Total win banner', detail: 'Big wins replace the reel with a centered total-win celebration.' },
        ],
        bonusEntry: 'Land 3+ scarab symbols anywhere on the reels.',
        bonusFlow: [
            '1 respin where existing scarabs are locked as wilds.',
            'New scarabs that land also lock until the respin ends.',
            'Total win banner if the respin produces a stake-sized win.',
        ],
        volatility: 'High volatility, ~94.5% RTP.',
        buyBonus: null,
    },
    'bars': {
        summary: 'Classic 3-reel single-line slot. Sevens pay the jackpot.',
        mechanics: [
            { name: 'Single line', detail: 'One payline, three reels.' },
            { name: 'Jackpot', detail: 'Triple sevens pay the 30x headline jackpot.' },
            { name: 'Bar tiers', detail: 'BBB / BB / B and bell + cherry symbols form a classic ladder.' },
        ],
        bonusEntry: null,
        bonusFlow: [],
        volatility: 'Low volatility — small wins frequent.',
        buyBonus: null,
    },
    'blue-samurai': {
        summary: 'Stacked-wild reel slot. A full samurai stack turns the reel wild.',
        mechanics: [
            { name: 'Stacked wild reel', detail: 'When a samurai stack of 4+ lands on a single reel, the entire reel turns wild for the spin.' },
            { name: 'Lines', detail: '20 paylines with a 1.3x boost when a stacked-wild reel is part of the win.' },
        ],
        bonusEntry: 'Stacked wilds — feature trigger is automatic when a 4+ stack lands.',
        bonusFlow: [
            'Reel wilds in for the rest of the spin.',
            'Wins that cross the wild reel get a 1.3x boost.',
        ],
        volatility: 'High volatility, ~94.5% RTP.',
        buyBonus: null,
    },
    'wanted-revelation': {
        summary: 'Mystery-symbol slot. Each spin a paying symbol is randomly revealed.',
        mechanics: [
            { name: 'Mystery reveal', detail: 'Wanted symbols on the reels morph into the same paying symbol before evaluation. The "wanted-poster" overlay shows which symbol won.' },
            { name: 'Lines', detail: '20 paylines, left-to-right.' },
            { name: 'Dark win overlay', detail: 'Big wins fade the backdrop so the reveal pops.' },
        ],
        bonusEntry: '3+ star scatters.',
        bonusFlow: [
            '6 free spins.',
            'Wanted reveal still applies during free spins.',
        ],
        volatility: 'High volatility, ~94.5% RTP.',
        buyBonus: 'Lite (40x), Standard (60x), Super (120x).',
    },
    'gates-ascent': {
        summary: 'Pay-anywhere 6×6 grid. Persistent multiplier ratchets up across free spins.',
        mechanics: [
            { name: 'Pay anywhere', detail: '8+ matching symbols anywhere on the grid form a win.' },
            { name: 'Persistent multiplier', detail: 'During free spins the multiplier increments each scatter retrigger.' },
            { name: 'Anticipation', detail: '4+ scatters cue the trigger animation.' },
        ],
        bonusEntry: '4+ gate scatters.',
        bonusFlow: [
            '8 free spins.',
            'Persistent multiplier seeds at 1x.',
            'Each retrigger adds another multiplier step.',
        ],
        volatility: 'High volatility — designed for big-multiplier hits.',
        buyBonus: 'Standard (100x, 4 scatters), Olympus (220x, 5 scatters + 2x persistent).',
    },
    'bass-bayou': {
        summary: 'Bayou money-symbol collect. Free spins collect every prize on the board.',
        mechanics: [
            { name: 'Money symbols', detail: 'Each money symbol carries a credit value. They pay only during free-spin collect rounds.' },
            { name: 'Lines', detail: '20 paylines, left-to-right.' },
            { name: 'Collect overlay', detail: 'A green "Angler collects +X" ribbon pops up when money totals come in.' },
        ],
        bonusEntry: '3+ tag scatters.',
        bonusFlow: [
            '8 free spins.',
            'Every money symbol that lands is added to the angler collect.',
            'Collect total pays at the end of the bonus.',
        ],
        volatility: 'Medium-high.',
        buyBonus: 'Bayou (80x), Trophy (160x).',
    },
    'mummy-cascade': {
        summary: 'Mummy cluster pays with a cascading multiplier ladder.',
        mechanics: [
            { name: 'Cluster pays', detail: '5+ touching symbols form a cluster.' },
            { name: 'Cascade ladder', detail: 'Each cascade bumps the multiplier: 1x → 2x → 3x → 5x → 10x.' },
            { name: '6×6 grid', detail: 'Larger grid means more cluster shapes.' },
        ],
        bonusEntry: '4+ flame scatters.',
        bonusFlow: [
            '10 free spins.',
            'Cascade ladder persists across the bonus, not just per spin.',
        ],
        volatility: 'High volatility.',
        buyBonus: 'Tomb (90x), Pharaoh (200x).',
    },
    'phoenix-megaways': {
        summary: 'Megaways slot with variable rows per reel and re-igniting phoenix wilds.',
        mechanics: [
            { name: 'Megaways', detail: 'Each spin shows a different number of rows per reel (4-6). Total ways = product of rows across reels.' },
            { name: 'Cascade', detail: 'Winning symbols vanish and new ones tumble; multiplier ladder applies.' },
            { name: 'Persistent multiplier', detail: 'Free spins bonus seeds the multiplier at 1x and grows it on cascades.' },
        ],
        bonusEntry: '4+ egg scatters.',
        bonusFlow: [
            '10 free spins.',
            'Phoenix wilds reignite the cascade ladder.',
        ],
        volatility: 'Very high volatility.',
        buyBonus: null,
    },
    'mansion-megaways': {
        summary: 'Gothic megaways with a persistent free-spin multiplier and retrigger steps.',
        mechanics: [
            { name: 'Megaways', detail: '7-row max with a 3/5/7/7/5/3 column shape (49 to 1944 ways).' },
            { name: 'Cascade', detail: 'Multiplier ladder 1x → 2x → 3x → 4x → 6x.' },
            { name: 'Persistent multiplier', detail: 'Free spins keep a multiplier that climbs on every retrigger.' },
        ],
        bonusEntry: '4+ candle scatters.',
        bonusFlow: [
            '12 free spins.',
            'Each retrigger adds +1 to the persistent multiplier.',
        ],
        volatility: 'High volatility.',
        buyBonus: 'Mansion (110x), Crypt (250x + 2x persistent).',
    },
    'ghostblade-strike': {
        summary: 'Stacked ronin wilds + a 3-reel multiplier zone in the middle of the grid.',
        mechanics: [
            { name: 'Stacked wild reel', detail: 'A 3+ stack of ghosts on any reel turns the entire reel wild for the spin (1.6x line boost).' },
            { name: 'Multiplier zones', detail: 'Reels 2, 3, 4 carry a 3x multiplier zone — wins that cross any of those columns are tripled.' },
            { name: 'Lines', detail: '20 paylines.' },
        ],
        bonusEntry: '3+ amulet scatters.',
        bonusFlow: [
            '8 free spins.',
            'Stacked wild reels trigger more often during the bonus.',
        ],
        volatility: 'High volatility.',
        buyBonus: 'Spirit (80x), Ronin (180x + 2x persistent).',
    },
    'iron-fist': {
        summary: 'Hacksaw-style multiplier wheel slot. Trigger 3+ gongs to spin for 2x to 20x.',
        mechanics: [
            { name: 'Multiplier wheel', detail: '3+ gongs spin a 2/3/5/10/20x wheel. Wheel weights bias toward 2x and 3x; 20x is rare. The wheel multiplier applies across the free-spin session.' },
            { name: 'Ways pays', detail: 'Pays anywhere a matching symbol appears in 3+ adjacent columns left-to-right across the 5×4 grid.' },
            { name: 'Dark win overlay', detail: 'Big wins fade the reels so the wheel value pops.' },
        ],
        bonusEntry: '3+ gong scatters trigger the wheel + 6 free spins.',
        bonusFlow: [
            'Wheel spin reveals the session multiplier (2x–20x).',
            'Multiplier applies to all 6 free spins.',
            'Re-triggering during the session re-spins the wheel.',
        ],
        volatility: 'Very high volatility — the wheel multiplier drives rare but large sessions. RTP locked to 94%.',
        buyBonus: 'Bell (70x), Knockout (180x + 3x persistent).',
    },
    'coop-cluck': {
        summary: 'Farm cluster pays with a flock-collect meter. 30 chicks fill the barn.',
        mechanics: [
            { name: 'Cluster pays', detail: '5+ touching symbols form a cluster on a 6×6 grid.' },
            { name: 'Coin meter', detail: 'Each egg counts toward a 30-egg meter. 30 eggs trigger the barn bonus.' },
            { name: 'Anticipation', detail: 'Reels slow on 3+ scatters.' },
        ],
        bonusEntry: '4+ basket scatters or fill the egg meter.',
        bonusFlow: [
            '8 free spins.',
            'Egg meter progress carries over across spins.',
        ],
        volatility: 'Medium-high volatility.',
        buyBonus: 'Coop (80x), Barn (180x).',
    },
    'miko-spirit': {
        summary: 'Sticky-wild lantern collect respin with persistent multiplier.',
        mechanics: [
            { name: 'Stacked wild reel', detail: '3+ lanterns stack on a reel and lock as sticky wilds for the bonus.' },
            { name: 'Sticky wild', detail: 'Locked lanterns persist across spins until the bonus ends.' },
            { name: 'Persistent multiplier', detail: 'Bonus seeds the multiplier at 1x and grows on retriggers.' },
        ],
        bonusEntry: '3+ torii scatters.',
        bonusFlow: [
            '7 free spins.',
            'Lanterns that land lock as wilds for the rest of the bonus.',
            '★ badges show on locked positions.',
        ],
        volatility: 'High volatility.',
        buyBonus: 'Lantern (70x), Spirit (160x + 2x persistent).',
    },
    'forge-anvil': {
        summary: 'Hold-and-respin coin board. Fill the anvil for jackpot tiers.',
        mechanics: [
            { name: 'Hold and respin', detail: '6+ molten coins trigger the hold-and-respin board. Each respin can fill empty slots; respin counter resets when a slot fills.' },
            { name: 'Jackpot tiers', detail: 'Mini (8x), Minor (25x), Major (80x), Grand (200x). Filling the whole 12-slot board awards Grand.' },
            { name: 'Lines', detail: '20 paylines on a 3-row 5-reel grid.' },
        ],
        bonusEntry: '6+ molten coin symbols on a single spin.',
        bonusFlow: [
            'Triggered coins lock on the board.',
            '3 respins. Respin counter resets when a new coin lands.',
            'Final fill count maps to a jackpot tier.',
        ],
        volatility: 'High volatility.',
        buyBonus: 'Anvil (90x), Grand (220x + 2x persistent).',
    },
    'gummy-drops': {
        summary: 'Sweet 8×8 cluster slot with an explosive multiplier orb.',
        mechanics: [
            { name: 'Cluster pays', detail: '6+ touching symbols on an 8×8 (64-cell) grid form a cluster; bigger clusters pay more.' },
            { name: 'Cascade ladder', detail: 'Winning clusters clear and new candy tumbles in. Each cascade bumps a 1x → 2x → 3x → 5x → 8x → 12x multiplier ladder (capped to keep the swing fair).' },
            { name: 'Multiplier orbs', detail: 'Orb symbols carry a random 2x–250x value. On any winning tumble the orb values are summed and multiply the whole win.' },
            { name: 'Persistent multiplier', detail: 'During the bonus the ladder seeds at 1x and persists across free spins.' },
        ],
        bonusEntry: '5+ lollipop scatters award 12 free spins.',
        bonusFlow: [
            '12 free spins with a persistent cascade ladder.',
            'Ladder carries across spins for escalating chains.',
        ],
        volatility: 'Very high volatility — long dry spells then big cascade chains. RTP locked to 94%.',
        buyBonus: 'Sweet (100x), Sugar Rush (250x + 2x persistent).',
    },
}

export function getFeatureContract(templateId) {
    return SLOT_FEATURE_CONTRACTS[templateId] || null
}
