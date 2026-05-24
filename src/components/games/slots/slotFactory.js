import { pickWeighted, round2 } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'

const classic = '/assets/games/slots/classic'
const cyber = '/assets/games/slots/cyber'
const mythic = '/assets/games/slots/mythic'
// Wave 7 themed packs
const wanted = '/assets/games/slots/wanted'
const olympus = '/assets/games/slots/olympus'
const bayou = '/assets/games/slots/bayou'
const mummy = '/assets/games/slots/mummy'
const phoenix = '/assets/games/slots/phoenix'
const mansion = '/assets/games/slots/mansion'

function symbol(id, label, asset, weight, payout, extra = {}) {
    return { id, label, asset, weight, payout, ...extra }
}

export const SLOT_TEMPLATES = [
    {
        id: 'vault-rush',
        title: 'Vault Rush',
        benchmark: 'The Big Bank',
        skin: 'bank',
        accent: '#f5c84b',
        rtpTarget: 0.94,
        volatility: 'High',
        layout: { rows: 4, cols: 5, evaluation: 'ways' },
        backdrop: '/assets/games/backdrops/backdrop-felt-navy.png',
        featureText: 'Collect 30 coin symbols to fill the vault meter.',
        controls: { buyBonus: true, turbo: true, auto: true },
        features: {
            coinMeter: { target: 30, symbolId: 'coin', pay: 0.32 },
            scatter: { symbolId: 'bonus', trigger: 3, awardFreeSpins: 6, pay: 1.2 },
            buyBonus: {
                costMultiplier: 45,
                guaranteedScatters: 3,
                tiers: [
                    { id: 'lite', label: 'Lite Buy', costMultiplier: 30, guaranteedScatters: 2 },
                    { id: 'std', label: 'Standard Buy', costMultiplier: 45, guaranteedScatters: 3 },
                    { id: 'super', label: 'Super Buy', costMultiplier: 90, guaranteedScatters: 4 },
                ],
            },
            anticipation: { scatterMin: 2 },
            darkWinOverlay: true,
        },
        symbols: [
            symbol('vault', 'VAULT', `${classic}/slot-classic-bar.png`, 5, 8),
            symbol('diamond', 'GEM', `${cyber}/slot-cyber-core.png`, 7, 5),
            symbol('watch', 'TIME', `${mythic}/slot-mythic-orb.png`, 11, 2.4),
            symbol('cash', 'CASH', `${classic}/slot-classic-coin.png`, 15, 1.4),
            symbol('rank-a', 'A', `${classic}/slot-classic-7.png`, 18, 0.8),
            symbol('rank-k', 'K', `${cyber}/slot-cyber-node.png`, 20, 0.55),
            symbol('coin', 'COIN', `${classic}/slot-classic-coin.png`, 10, 0.25, { type: 'coin' }),
            symbol('bonus', 'BONUS', `${mythic}/slot-mythic-rune.png`, 4, 0, { type: 'scatter' }),
        ],
    },
    {
        id: 'river-catcher',
        title: 'River Catcher',
        benchmark: 'Le Catcher',
        skin: 'catcher',
        accent: '#ffd24d',
        rtpTarget: 0.945,
        volatility: 'High',
        layout: { rows: 4, cols: 5, evaluation: 'lines' },
        backdrop: '/assets/games/backdrops/backdrop-felt-green.png',
        featureText: 'Fishing hooks, bonus shells, and compact spin controls.',
        controls: { buyBonus: true, turbo: true, auto: true },
        features: {
            scatter: { symbolId: 'shell', trigger: 3, awardFreeSpins: 7, pay: 1 },
            buyBonus: {
                costMultiplier: 60,
                guaranteedScatters: 3,
                tiers: [
                    { id: 'std', label: 'Bonus Buy', costMultiplier: 60, guaranteedScatters: 3 },
                    { id: 'super', label: 'Super Bonus', costMultiplier: 120, guaranteedScatters: 4 },
                ],
            },
            anticipation: { scatterMin: 2 },
            sideCharacter: true,
        },
        symbols: [
            symbol('catcher', 'HOOK', `${mythic}/slot-mythic-sword.png`, 5, 9),
            symbol('pearl', 'PEARL', `${mythic}/slot-mythic-orb.png`, 8, 4.5),
            symbol('bait', 'BAIT', `${classic}/slot-classic-cherry.png`, 12, 2.1),
            symbol('rod', 'ROD', `${cyber}/slot-cyber-wave.png`, 15, 1.1),
            symbol('ten', '10', `${classic}/slot-classic-bell.png`, 20, 0.55),
            symbol('q', 'Q', `${cyber}/slot-cyber-data.png`, 19, 0.45),
            symbol('wild', 'WILD', `${classic}/slot-classic-7.png`, 5, 0, { type: 'wild' }),
            symbol('shell', 'BONUS', `${mythic}/slot-mythic-rune.png`, 4, 0, { type: 'scatter' }),
        ],
    },
    {
        id: 'dust-rail',
        title: 'Dust Rail Bounty',
        benchmark: 'Bone and Bullets',
        skin: 'western',
        accent: '#f1cc48',
        rtpTarget: 0.94,
        volatility: 'Medium high',
        layout: { rows: 4, cols: 5, evaluation: 'lines' },
        backdrop: '/assets/games/backdrops/backdrop-parchment.png',
        featureText: 'Western reels, bonus buy, wild badges, and a dominant spin control.',
        controls: { buyBonus: true, turbo: true, auto: true },
        features: {
            scatter: { symbolId: 'badge', trigger: 3, awardFreeSpins: 5, pay: 1.4 },
            buyBonus: {
                costMultiplier: 50,
                guaranteedScatters: 3,
                tiers: [
                    { id: 'std', label: 'Bonus Buy', costMultiplier: 50, guaranteedScatters: 3 },
                    { id: 'super', label: 'Super Bonus', costMultiplier: 100, guaranteedScatters: 4 },
                ],
            },
            anticipation: { scatterMin: 2 },
            expandingWilds: true,
        },
        symbols: [
            symbol('revolver', 'GUN', `${cyber}/slot-cyber-core.png`, 6, 7.5),
            symbol('skull', 'SKULL', `${mythic}/slot-mythic-shield.png`, 8, 4),
            symbol('train', 'RAIL', `${classic}/slot-classic-bar.png`, 12, 2),
            symbol('gold', 'GOLD', `${classic}/slot-classic-coin.png`, 14, 1.2),
            symbol('ace', 'A', `${classic}/slot-classic-7.png`, 18, 0.7),
            symbol('jack', 'J', `${cyber}/slot-cyber-chip.png`, 20, 0.45),
            symbol('wild', 'WILD', `${mythic}/slot-mythic-sword.png`, 5, 0, { type: 'wild' }),
            symbol('badge', 'BONUS', `${mythic}/slot-mythic-rune.png`, 4, 0, { type: 'scatter' }),
        ],
    },
    {
        id: 'storm-banner',
        title: 'Storm Banner',
        benchmark: 'Angel of Asgard',
        skin: 'mythic',
        accent: '#9dd7ff',
        rtpTarget: 0.95,
        volatility: 'High',
        layout: { rows: 4, cols: 5, evaluation: 'ways' },
        backdrop: '/assets/games/backdrops/backdrop-stars.png',
        featureText: 'Mythic character framing with total-win banner reveals.',
        controls: { buyBonus: false, turbo: true, auto: true },
        features: {
            scatter: { symbolId: 'rune', trigger: 3, awardFreeSpins: 8, pay: 1.3 },
            anticipation: { scatterMin: 2 },
            totalWinBanner: true,
            expandingWilds: true,
        },
        symbols: [
            symbol('valkyrie', 'HERO', `${mythic}/slot-mythic-shield.png`, 5, 8),
            symbol('hammer', 'HAMR', `${mythic}/slot-mythic-sword.png`, 8, 4),
            symbol('wing', 'WING', `${cyber}/slot-cyber-wave.png`, 10, 2.4),
            symbol('ice', 'ICE', `${cyber}/slot-cyber-core.png`, 15, 1.2),
            symbol('ten', '10', `${classic}/slot-classic-bell.png`, 18, 0.65),
            symbol('king', 'K', `${classic}/slot-classic-bar.png`, 20, 0.5),
            symbol('wild', 'WILD', `${classic}/slot-classic-7.png`, 5, 0, { type: 'wild' }),
            symbol('rune', 'SCAT', `${mythic}/slot-mythic-rune.png`, 4, 0, { type: 'scatter' }),
        ],
    },
    {
        id: 'bassline-bonus',
        title: 'Bassline Bonus',
        benchmark: 'Big Bass Rock and Roll',
        skin: 'rock',
        accent: '#ff5fb7',
        rtpTarget: 0.94,
        volatility: 'High',
        layout: { rows: 4, cols: 5, evaluation: 'cluster' },
        backdrop: '/assets/games/backdrops/backdrop-neon-grid.png',
        featureText: 'Neon intro overlay, volatility cue, and high-energy result pulses.',
        controls: { buyBonus: false, turbo: true, auto: true },
        features: {
            scatter: { symbolId: 'ticket', trigger: 3, awardFreeSpins: 6, pay: 1.1 },
            clusterMin: 5,
            anticipation: { scatterMin: 2 },
            introOverlay: true,
            cascade: { tumbleMultiplierLadder: [1, 2, 3, 5, 10] },
        },
        symbols: [
            symbol('guitar', 'GTR', `${cyber}/slot-cyber-wave.png`, 5, 7),
            symbol('amp', 'AMP', `${cyber}/slot-cyber-chip.png`, 8, 3.8),
            symbol('record', 'DISC', `${classic}/slot-classic-bar.png`, 12, 1.8),
            symbol('light', 'LITE', `${classic}/slot-classic-bell.png`, 15, 1),
            symbol('ace', 'A', `${classic}/slot-classic-7.png`, 18, 0.65),
            symbol('queen', 'Q', `${mythic}/slot-mythic-orb.png`, 20, 0.45),
            symbol('wild', 'WILD', `${classic}/slot-classic-coin.png`, 5, 0, { type: 'wild' }),
            symbol('ticket', 'BONUS', `${mythic}/slot-mythic-rune.png`, 4, 0, { type: 'scatter' }),
        ],
    },
    {
        id: 'scarab-spin',
        title: 'Scarab Spin',
        benchmark: 'Stake Scarab Spin',
        skin: 'mythic',
        accent: '#ffcf5a',
        rtpTarget: 0.945,
        volatility: 'High',
        layout: { rows: 3, cols: 5, evaluation: 'ways' },
        backdrop: '/assets/games/backdrops/backdrop-parchment.png',
        featureText: 'Land 3+ scarabs to trigger a respin where every scarab locks as wild.',
        controls: { buyBonus: false, turbo: true, auto: true },
        features: {
            scarabRespin: { triggerCount: 3, respinCount: 1, lockBoost: 1.4 },
            anticipation: { scatterMin: 2 },
            totalWinBanner: true,
        },
        symbols: [
            symbol('pharaoh', 'PHA', `${mythic}/slot-mythic-shield.png`, 5, 8),
            symbol('eye', 'EYE', `${mythic}/slot-mythic-orb.png`, 8, 4.4),
            symbol('ankh', 'ANK', `${mythic}/slot-mythic-rune.png`, 12, 2.2),
            symbol('cat', 'CAT', `${mythic}/slot-mythic-sword.png`, 14, 1.4),
            symbol('rank-a', 'A', `${classic}/slot-classic-7.png`, 18, 0.7),
            symbol('rank-k', 'K', `${classic}/slot-classic-bar.png`, 22, 0.45),
            symbol('scarab', 'SCAR', `${mythic}/slot-mythic-rune.png`, 6, 0, { type: 'wild' }),
        ],
    },
    {
        id: 'bars',
        title: 'Bars',
        benchmark: 'Stake Bars',
        skin: 'classic',
        accent: '#ffd166',
        rtpTarget: 0.95,
        volatility: 'Low',
        layout: { rows: 1, cols: 3, evaluation: 'lines' },
        backdrop: '/assets/games/backdrops/backdrop-felt-navy.png',
        featureText: 'Classic 3-reel bars and sevens. Triple sevens land the headline payout.',
        controls: { buyBonus: false, turbo: true, auto: true },
        features: {
            classicThreeReel: { jackpotSymbolId: 'seven', jackpotMultiplier: 60 },
        },
        symbols: [
            symbol('seven', '7', `${classic}/slot-classic-7.png`, 4, 12),
            symbol('bar3', 'BBB', `${classic}/slot-classic-bar.png`, 6, 6),
            symbol('bar2', 'BB', `${classic}/slot-classic-bar.png`, 8, 3.2),
            symbol('bar1', 'B', `${classic}/slot-classic-bar.png`, 12, 1.6),
            symbol('bell', 'BELL', `${classic}/slot-classic-bell.png`, 14, 1.1),
            symbol('cherry', 'CHRY', `${classic}/slot-classic-cherry.png`, 18, 0.7),
            symbol('coin', 'COIN', `${classic}/slot-classic-coin.png`, 22, 0.4),
        ],
    },
    {
        id: 'blue-samurai',
        title: 'Blue Samurai',
        benchmark: 'Stake Blue Samurai',
        skin: 'cyber',
        accent: '#4cc9f0',
        rtpTarget: 0.945,
        volatility: 'High',
        layout: { rows: 4, cols: 5, evaluation: 'lines' },
        backdrop: '/assets/games/backdrops/backdrop-stars.png',
        featureText: 'Stacked Samurai across a full reel turns the entire reel wild for the spin.',
        controls: { buyBonus: false, turbo: true, auto: true },
        features: {
            stackedWildReel: { wildSymbolId: 'samurai', minStack: 4, lineBoost: 1.3 },
            anticipation: { scatterMin: 2 },
        },
        symbols: [
            symbol('shogun', 'SHGN', `${mythic}/slot-mythic-shield.png`, 5, 7.5),
            symbol('katana', 'KAT', `${mythic}/slot-mythic-sword.png`, 8, 4.2),
            symbol('blossom', 'BLSM', `${cyber}/slot-cyber-core.png`, 12, 2),
            symbol('dragon', 'DRGN', `${cyber}/slot-cyber-wave.png`, 14, 1.4),
            symbol('rank-a', 'A', `${classic}/slot-classic-7.png`, 18, 0.7),
            symbol('rank-k', 'K', `${cyber}/slot-cyber-node.png`, 20, 0.5),
            symbol('samurai', 'SAMU', `${cyber}/slot-cyber-chip.png`, 7, 0, { type: 'wild' }),
        ],
    },

    // ---- Wave 7 templates ----

    {
        id: 'wanted-revelation',
        title: 'Wanted Revelation',
        benchmark: 'Wanted Salvation / Sand and Ashes',
        skin: 'wanted',
        accent: '#f6a141',
        rtpTarget: 0.945,
        volatility: 'High',
        layout: { rows: 4, cols: 5, evaluation: 'lines' },
        backdrop: '/assets/games/backdrops/backdrop-parchment.png',
        featureText: 'Each spin a Wanted symbol is revealed; every wanted cell morphs to that paying symbol before evaluation.',
        controls: { buyBonus: true, turbo: true, auto: true },
        features: {
            scatter: { symbolId: 'star', trigger: 3, awardFreeSpins: 6, pay: 1.2 },
            anticipation: { scatterMin: 2 },
            mysterySymbol: {
                id: 'wanted',
                candidates: ['badge', 'watch', 'rope'],
                chance: 1,
            },
            buyBonus: {
                costMultiplier: 60,
                guaranteedScatters: 3,
                tiers: [
                    { id: 'lite', label: 'Wanted Lite', costMultiplier: 40, guaranteedScatters: 2 },
                    { id: 'std', label: 'Wanted Standard', costMultiplier: 60, guaranteedScatters: 3 },
                    { id: 'super', label: 'Wanted Super', costMultiplier: 120, guaranteedScatters: 4 },
                ],
            },
            darkWinOverlay: true,
        },
        symbols: [
            symbol('badge', 'BADGE', `${wanted}/wanted-revelation-hero.png`, 5, 9),
            symbol('watch', 'WATCH', `${wanted}/wanted-revelation-mid1.png`, 8, 4.4),
            symbol('rope', 'ROPE', `${wanted}/wanted-revelation-mid2.png`, 12, 2.2),
            symbol('rank-a', 'A', `${classic}/slot-classic-7.png`, 18, 0.7),
            symbol('rank-k', 'K', `${classic}/slot-classic-bar.png`, 20, 0.5),
            symbol('rank-q', 'Q', `${classic}/slot-classic-bell.png`, 22, 0.4),
            symbol('wanted', 'WNTD', `${wanted}/wanted-revelation-bonus.png`, 8, 0, { type: 'mystery' }),
            symbol('star', 'STAR', `${wanted}/wanted-revelation-bonus.png`, 4, 0, { type: 'scatter' }),
        ],
    },
    {
        id: 'gates-ascent',
        title: 'Gates of Ascent',
        benchmark: 'Gates of Heaven 1000',
        skin: 'olympus',
        accent: '#fbcd5b',
        rtpTarget: 0.94,
        volatility: 'High',
        layout: { rows: 6, cols: 6, evaluation: 'pay-anywhere' },
        backdrop: '/assets/games/backdrops/backdrop-stars.png',
        featureText: 'Pay anywhere on a 6x6 grid. Land 3+ scatters for free spins with a persistent multiplier that grows on retriggers.',
        controls: { buyBonus: true, turbo: true, auto: true },
        features: {
            scatter: { symbolId: 'gate', trigger: 4, awardFreeSpins: 8, pay: 1.6 },
            anticipation: { scatterMin: 3 },
            payAnywhereMin: 8,
            persistentMultiplier: 1,
            buyBonus: {
                costMultiplier: 100,
                guaranteedScatters: 4,
                tiers: [
                    { id: 'std', label: 'Ascent Buy', costMultiplier: 100, guaranteedScatters: 4 },
                    { id: 'super', label: 'Olympus Buy', costMultiplier: 220, guaranteedScatters: 5, persistentMultiplier: 2 },
                ],
            },
        },
        symbols: [
            symbol('bolt', 'BOLT', `${olympus}/gates-ascent-hero.png`, 5, 8),
            symbol('crown', 'CRWN', `${olympus}/gates-ascent-mid1.png`, 8, 4.4),
            symbol('sandal', 'SAND', `${olympus}/gates-ascent-mid2.png`, 12, 2),
            symbol('rank-a', 'A', `${classic}/slot-classic-7.png`, 18, 0.7),
            symbol('rank-k', 'K', `${classic}/slot-classic-bar.png`, 20, 0.5),
            symbol('rank-q', 'Q', `${classic}/slot-classic-bell.png`, 22, 0.4),
            symbol('rank-j', 'J', `${classic}/slot-classic-cherry.png`, 22, 0.32),
            symbol('gate', 'GATE', `${olympus}/gates-ascent-bonus.png`, 4, 0, { type: 'scatter' }),
        ],
    },
    {
        id: 'bass-bayou',
        title: 'Bass Bayou Collect',
        benchmark: 'Big Bass collect variant',
        skin: 'bayou',
        accent: '#9bd86b',
        rtpTarget: 0.945,
        volatility: 'Medium high',
        layout: { rows: 3, cols: 5, evaluation: 'lines' },
        backdrop: '/assets/games/backdrops/backdrop-felt-green.png',
        featureText: 'Money symbols carry attached prizes. Free spins collect every money value via the angler.',
        controls: { buyBonus: true, turbo: true, auto: true },
        features: {
            scatter: { symbolId: 'tag', trigger: 3, awardFreeSpins: 8, pay: 1.1 },
            anticipation: { scatterMin: 2 },
            buyBonus: {
                costMultiplier: 80,
                guaranteedScatters: 3,
                tiers: [
                    { id: 'std', label: 'Bayou Buy', costMultiplier: 80, guaranteedScatters: 3 },
                    { id: 'super', label: 'Trophy Buy', costMultiplier: 160, guaranteedScatters: 4 },
                ],
            },
        },
        symbols: [
            symbol('bass', 'BASS', `${bayou}/bass-bayou-hero.png`, 5, 7.5),
            symbol('rod', 'ROD', `${bayou}/bass-bayou-mid1.png`, 8, 4),
            symbol('tackle', 'TKL', `${bayou}/bass-bayou-mid2.png`, 12, 2),
            symbol('rank-a', 'A', `${classic}/slot-classic-7.png`, 18, 0.7),
            symbol('rank-k', 'K', `${classic}/slot-classic-bar.png`, 20, 0.5),
            symbol('rank-q', 'Q', `${classic}/slot-classic-bell.png`, 22, 0.4),
            symbol('money', 'PRIZE', `${bayou}/bass-bayou-bonus.png`, 6, 0, { type: 'money', valueRange: [1, 8] }),
            symbol('tag', 'BONUS', `${bayou}/bass-bayou-bonus.png`, 4, 0, { type: 'scatter' }),
        ],
    },
    {
        id: 'mummy-cascade',
        title: 'Mummy Cascade',
        benchmark: 'Flaming Mummy',
        skin: 'mummy',
        accent: '#f57c4a',
        rtpTarget: 0.945,
        volatility: 'High',
        layout: { rows: 6, cols: 6, evaluation: 'cluster' },
        backdrop: '/assets/games/backdrops/backdrop-parchment.png',
        featureText: 'Cluster pays cascade with a growing multiplier ladder. Wins remove cells; new ones tumble in.',
        controls: { buyBonus: true, turbo: true, auto: true },
        features: {
            scatter: { symbolId: 'flame', trigger: 4, awardFreeSpins: 10, pay: 1.4 },
            anticipation: { scatterMin: 3 },
            clusterMin: 5,
            cascade: { tumbleMultiplierLadder: [1, 2, 3, 5, 10] },
            buyBonus: {
                costMultiplier: 90,
                guaranteedScatters: 4,
                tiers: [
                    { id: 'std', label: 'Tomb Buy', costMultiplier: 90, guaranteedScatters: 4 },
                    { id: 'super', label: 'Pharaoh Buy', costMultiplier: 200, guaranteedScatters: 5 },
                ],
            },
        },
        symbols: [
            symbol('mask', 'MASK', `${mummy}/mummy-cascade-hero.png`, 5, 7.5),
            symbol('ankh', 'ANKH', `${mummy}/mummy-cascade-mid1.png`, 8, 4),
            symbol('sun', 'SUN', `${mummy}/mummy-cascade-mid2.png`, 12, 2.2),
            symbol('rank-a', 'A', `${classic}/slot-classic-7.png`, 18, 0.7),
            symbol('rank-k', 'K', `${classic}/slot-classic-bar.png`, 20, 0.5),
            symbol('rank-q', 'Q', `${classic}/slot-classic-bell.png`, 22, 0.4),
            symbol('flame', 'FLAME', `${mummy}/mummy-cascade-bonus.png`, 5, 0, { type: 'scatter' }),
        ],
    },
    {
        id: 'phoenix-megaways',
        title: 'Phoenix Megaways',
        benchmark: 'Lucky Phoenix Megaways',
        skin: 'phoenix',
        accent: '#ff6b3a',
        rtpTarget: 0.94,
        volatility: 'Very high',
        layout: { rows: 7, cols: 6, evaluation: 'megaways', columnRows: [4, 5, 6, 6, 5, 4] },
        backdrop: '/assets/games/backdrops/backdrop-stars.png',
        featureText: 'Megaways with variable rows per reel. Each cascade boosts the multiplier; phoenix wilds re-ignite.',
        controls: { buyBonus: false, turbo: true, auto: true },
        features: {
            scatter: { symbolId: 'egg', trigger: 4, awardFreeSpins: 10, pay: 1.5 },
            anticipation: { scatterMin: 3 },
            cascade: { tumbleMultiplierLadder: [1, 2, 3, 5, 10] },
            persistentMultiplier: 1,
        },
        symbols: [
            symbol('phoenix', 'PHX', `${phoenix}/phoenix-megaways-hero.png`, 5, 9),
            symbol('feather', 'FEA', `${phoenix}/phoenix-megaways-mid1.png`, 8, 4.5),
            symbol('sun', 'SUN', `${phoenix}/phoenix-megaways-mid2.png`, 12, 2.4),
            symbol('rank-a', 'A', `${classic}/slot-classic-7.png`, 18, 0.7),
            symbol('rank-k', 'K', `${classic}/slot-classic-bar.png`, 20, 0.5),
            symbol('rank-q', 'Q', `${classic}/slot-classic-bell.png`, 22, 0.4),
            symbol('rank-j', 'J', `${classic}/slot-classic-cherry.png`, 22, 0.32),
            symbol('egg', 'EGG', `${phoenix}/phoenix-megaways-bonus.png`, 4, 0, { type: 'scatter' }),
        ],
    },
    {
        id: 'mansion-megaways',
        title: 'Mansion Megaways',
        benchmark: 'The Dog Mansion Megaways',
        skin: 'mansion',
        accent: '#a47cff',
        rtpTarget: 0.945,
        volatility: 'High',
        layout: { rows: 7, cols: 6, evaluation: 'megaways', columnRows: [3, 5, 7, 7, 5, 3] },
        backdrop: '/assets/games/backdrops/backdrop-stars.png',
        featureText: 'Gothic megaways. Free spins keep a persistent multiplier that grows by +1 each scatter retrigger.',
        controls: { buyBonus: true, turbo: true, auto: true },
        features: {
            scatter: { symbolId: 'candle', trigger: 4, awardFreeSpins: 12, pay: 1.6 },
            anticipation: { scatterMin: 3 },
            cascade: { tumbleMultiplierLadder: [1, 2, 3, 4, 6] },
            persistentMultiplier: 1,
            buyBonus: {
                costMultiplier: 110,
                guaranteedScatters: 4,
                tiers: [
                    { id: 'std', label: 'Mansion Buy', costMultiplier: 110, guaranteedScatters: 4 },
                    { id: 'super', label: 'Crypt Buy', costMultiplier: 250, guaranteedScatters: 5, persistentMultiplier: 2 },
                ],
            },
        },
        symbols: [
            symbol('dog', 'DOG', `${mansion}/mansion-megaways-hero.png`, 5, 9),
            symbol('key', 'KEY', `${mansion}/mansion-megaways-mid1.png`, 8, 4.5),
            symbol('letter', 'LET', `${mansion}/mansion-megaways-mid2.png`, 12, 2.4),
            symbol('rank-a', 'A', `${classic}/slot-classic-7.png`, 18, 0.7),
            symbol('rank-k', 'K', `${classic}/slot-classic-bar.png`, 20, 0.5),
            symbol('rank-q', 'Q', `${classic}/slot-classic-bell.png`, 22, 0.4),
            symbol('rank-j', 'J', `${classic}/slot-classic-cherry.png`, 22, 0.32),
            symbol('candle', 'CNDL', `${mansion}/mansion-megaways-bonus.png`, 4, 0, { type: 'scatter' }),
        ],
    },
]

export function getSlotTemplate(id) {
    return SLOT_TEMPLATES.find(template => template.id === id) || SLOT_TEMPLATES[0]
}

// ---- layout helpers (megaways supports per-column row counts) ----

export function getColumnRows(config, col) {
    if (config.layout.evaluation === 'megaways' && Array.isArray(config.layout.columnRows)) {
        return config.layout.columnRows[col] ?? config.layout.rows
    }
    return config.layout.rows
}

export function getCellPositions(config) {
    const positions = []
    for (let col = 0; col < config.layout.cols; col += 1) {
        const rows = getColumnRows(config, col)
        for (let row = 0; row < rows; row += 1) {
            positions.push({ col, row })
        }
    }
    return positions
}

export function getCellCount(config) {
    return getCellPositions(config).length
}

export function makeInitialGrid(config) {
    const symbols = config.symbols.filter(item => item.type !== 'scatter')
    const total = getCellCount(config)
    return Array.from({ length: total }, (_, index) => symbols[index % symbols.length])
}

export function randomVisualSymbol(config) {
    return config.symbols[Math.floor(Math.random() * config.symbols.length)] || config.symbols[0]
}

function roll(config, channel) {
    return nextRoll(`slots:${config.id}:${channel}`).roll
}

function pickSymbol(config, index, bonusBuy) {
    const boosted = config.symbols.map(item => {
        if (!bonusBuy || item.type !== 'scatter') return item
        return { ...item, weight: item.weight + 18 }
    })
    return pickWeighted(boosted, () => roll(config, `cell:${index}`))
}

function forceGuaranteedScatters(cells, config, count) {
    const scatter = config.symbols.find(item => item.id === config.features?.scatter?.symbolId)
    const needed = count || 0
    if (!scatter || needed <= 0) return cells
    const next = [...cells]
    const positions = []
    const total = next.length
    for (let i = 0; i < needed; i += 1) {
        positions.push(Math.floor((total - 1) * (i + 1) / (needed + 1)))
    }
    positions.forEach(index => {
        if (index >= 0 && index < next.length) next[index] = scatter
    })
    return next
}

function isPaySymbol(item) {
    return item && item.type !== 'scatter' && item.type !== 'coin' && item.type !== 'money' && item.type !== 'mystery'
}

// ---- mystery symbol pre-reveal ----

function applyMysteryReveal(cells, config) {
    const mystery = config.features?.mysterySymbol
    if (!mystery) return { cells, mysteryReveal: null }
    const candidates = (mystery.candidates || [])
        .map(id => config.symbols.find(item => item.id === id))
        .filter(Boolean)
    if (!candidates.length) return { cells, mysteryReveal: null }
    const triggered = cells.some(item => item.id === mystery.id || item.type === 'mystery')
    if (!triggered) return { cells, mysteryReveal: null }
    const reveal = candidates[Math.floor(roll(config, 'mystery') * candidates.length)]
    const next = cells.map(item => (item.id === mystery.id || item.type === 'mystery') ? reveal : item)
    return { cells: next, mysteryReveal: reveal }
}

// ---- evaluation modes ----

function evaluateLines(cells, config) {
    const { rows, cols } = config.layout
    const wins = []
    const winningIndexes = new Set()
    for (let row = 0; row < rows; row += 1) {
        let anchor = null
        let count = 0
        const lineIndexes = []
        for (let col = 0; col < cols; col += 1) {
            const index = row * cols + col
            const item = cells[index]
            if (!isPaySymbol(item) && item.type !== 'wild') break
            if (item.type === 'wild') {
                count += 1
                lineIndexes.push(index)
                continue
            }
            if (!anchor) {
                anchor = item
                count += 1
                lineIndexes.push(index)
                continue
            }
            if (item.id === anchor.id) {
                count += 1
                lineIndexes.push(index)
            } else {
                break
            }
        }
        if (anchor && count >= 3) {
            const ladder = { 3: 0.5, 4: 1.4, 5: 3.2 }
            const multiplier = round2(anchor.payout * (ladder[count] || 1))
            lineIndexes.forEach(index => winningIndexes.add(index))
            wins.push({ type: 'line', label: `${anchor.label} ${count}`, multiplier, indexes: lineIndexes })
        }
    }
    return { wins, winningIndexes }
}

function evaluateWays(cells, config) {
    const { rows, cols } = config.layout
    const wins = []
    const winningIndexes = new Set()
    for (const symbolItem of config.symbols.filter(isPaySymbol)) {
        let columns = 0
        const indexes = []
        for (let col = 0; col < cols; col += 1) {
            const matches = []
            for (let row = 0; row < rows; row += 1) {
                const index = row * cols + col
                const item = cells[index]
                if (item.id === symbolItem.id || item.type === 'wild') matches.push(index)
            }
            if (!matches.length) break
            columns += 1
            indexes.push(...matches)
        }
        if (columns >= 3) {
            const multiplier = round2(symbolItem.payout * columns * 0.42)
            indexes.forEach(index => winningIndexes.add(index))
            wins.push({ type: 'ways', label: `${symbolItem.label} ${columns} ways`, multiplier, indexes })
        }
    }
    return { wins, winningIndexes }
}

function evaluateMegaways(cells, config) {
    const { cols } = config.layout
    const wins = []
    const winningIndexes = new Set()
    let cellOffset = 0
    const colCells = []
    for (let col = 0; col < cols; col += 1) {
        const colRows = getColumnRows(config, col)
        const slice = []
        for (let row = 0; row < colRows; row += 1) {
            slice.push({ index: cellOffset + row, item: cells[cellOffset + row] })
        }
        colCells.push(slice)
        cellOffset += colRows
    }
    for (const symbolItem of config.symbols.filter(isPaySymbol)) {
        let columns = 0
        let waysProduct = 1
        const indexes = []
        for (let col = 0; col < cols; col += 1) {
            const matches = colCells[col].filter(({ item }) => item.id === symbolItem.id || item.type === 'wild')
            if (!matches.length) break
            columns += 1
            waysProduct *= matches.length
            matches.forEach(({ index }) => indexes.push(index))
        }
        if (columns >= 3) {
            const multiplier = round2(symbolItem.payout * waysProduct * 0.18)
            indexes.forEach(index => winningIndexes.add(index))
            wins.push({ type: 'megaways', label: `${symbolItem.label} ${waysProduct} ways`, multiplier, indexes, ways: waysProduct })
        }
    }
    return { wins, winningIndexes }
}

function evaluateCluster(cells, config) {
    const min = config.features?.clusterMin || 5
    const wins = []
    const winningIndexes = new Set()
    for (const symbolItem of config.symbols.filter(isPaySymbol)) {
        const indexes = []
        cells.forEach((item, index) => {
            if (item.id === symbolItem.id || item.type === 'wild') indexes.push(index)
        })
        if (indexes.length >= min) {
            const multiplier = round2(symbolItem.payout * (indexes.length / min))
            indexes.forEach(index => winningIndexes.add(index))
            wins.push({ type: 'cluster', label: `${symbolItem.label} x${indexes.length}`, multiplier, indexes })
        }
    }
    return { wins, winningIndexes }
}

function evaluatePayAnywhere(cells, config) {
    const wins = []
    const winningIndexes = new Set()
    for (const symbolItem of config.symbols.filter(isPaySymbol)) {
        const indexes = []
        cells.forEach((item, index) => {
            if (item.id === symbolItem.id || item.type === 'wild') indexes.push(index)
        })
        const min = config.features?.payAnywhereMin || 8
        if (indexes.length >= min) {
            const multiplier = round2(symbolItem.payout * (indexes.length / min))
            indexes.forEach(index => winningIndexes.add(index))
            wins.push({ type: 'pay-anywhere', label: `${symbolItem.label} x${indexes.length}`, multiplier, indexes })
        }
    }
    return { wins, winningIndexes }
}

function evaluateBaseWins(cells, config) {
    if (config.layout.evaluation === 'cluster') return evaluateCluster(cells, config)
    if (config.layout.evaluation === 'megaways') return evaluateMegaways(cells, config)
    if (config.layout.evaluation === 'pay-anywhere') return evaluatePayAnywhere(cells, config)
    if (config.layout.evaluation === 'ways') return evaluateWays(cells, config)
    return evaluateLines(cells, config)
}

// ---- money symbol resolve ----

function resolveMoneyValues(cells, config) {
    const moneyDefs = config.symbols.filter(item => item.type === 'money')
    if (!moneyDefs.length) return { moneyValues: [], moneyTotal: 0 }
    const moneyValues = []
    let moneyTotal = 0
    cells.forEach((item, index) => {
        if (item.type !== 'money') return
        const range = item.valueRange || [1, 5]
        const r = roll(config, `money:${index}`)
        const value = round2(range[0] + r * (range[1] - range[0]))
        moneyValues.push({ index, value, symbol: item })
        moneyTotal = round2(moneyTotal + value)
    })
    return { moneyValues, moneyTotal }
}

// ---- cascade tumble ----

function cascadeTumble(cells, config, baseWins, baseIndexes) {
    const ladder = config.features?.cascade?.tumbleMultiplierLadder
    if (!ladder || !baseWins.length) return { cells, cascadedWins: baseWins, cascadeSteps: 0 }
    let working = [...cells]
    let cascadedWins = [...baseWins]
    let step = 0
    let lastIndexes = baseIndexes
    while (lastIndexes && lastIndexes.size && step < ladder.length - 1) {
        // Replace winning cells with new picks; for cluster/pay-anywhere we rebuild positions.
        working = working.map((item, index) => {
            if (!lastIndexes.has(index)) return item
            const replaced = pickSymbol(config, index + step * 1009, false)
            return replaced
        })
        const next = evaluateBaseWins(working, config)
        if (!next.wins.length) break
        const stepMultiplier = ladder[Math.min(step + 1, ladder.length - 1)]
        next.wins.forEach(win => {
            cascadedWins.push({
                ...win,
                multiplier: round2(win.multiplier * stepMultiplier),
                cascadeStep: step + 1,
            })
        })
        lastIndexes = next.winningIndexes
        step += 1
    }
    return { cells: working, cascadedWins, cascadeSteps: step }
}

// ---- main resolver ----

export function resolveSlotSpin(config, options = {}) {
    const bonusBuy = Boolean(options.bonusBuy)
    const buyTier = options.buyTier || null
    const total = getCellCount(config)
    let cells = Array.from({ length: total }, (_, index) => pickSymbol(config, index, bonusBuy))

    // Buy tier guaranteed scatters
    if (bonusBuy) {
        const guaranteed = buyTier?.guaranteedScatters
            ?? config.features?.buyBonus?.guaranteedScatters
            ?? 3
        cells = forceGuaranteedScatters(cells, config, guaranteed)
    }

    // Mystery reveal pre-evaluate
    const { cells: revealedCells, mysteryReveal } = applyMysteryReveal(cells, config)
    cells = revealedCells

    // Money values
    const { moneyValues, moneyTotal } = resolveMoneyValues(cells, config)

    // Base evaluation
    const baseEval = evaluateBaseWins(cells, config)
    let { wins } = baseEval
    let winningIndexes = new Set(baseEval.winningIndexes)

    // Cascade tumble (cluster/pay-anywhere only)
    let cascadeSteps = 0
    if (config.features?.cascade && (config.layout.evaluation === 'cluster' || config.layout.evaluation === 'pay-anywhere')) {
        const cascadeResult = cascadeTumble(cells, config, wins, winningIndexes)
        cells = cascadeResult.cells
        wins = cascadeResult.cascadedWins
        cascadeSteps = cascadeResult.cascadeSteps
    }

    let multiplier = wins.reduce((sum, item) => sum + item.multiplier, 0)
    const featureEvents = []

    const scatter = config.features?.scatter
    if (scatter) {
        const scatterIndexes = cells
            .map((item, index) => item.id === scatter.symbolId ? index : -1)
            .filter(index => index >= 0)
        if (scatterIndexes.length) {
            scatterIndexes.forEach(index => winningIndexes.add(index))
            multiplier += scatterIndexes.length >= scatter.trigger
                ? scatter.pay * scatterIndexes.length
                : scatter.pay * 0.25 * scatterIndexes.length
        }
        if (scatterIndexes.length >= scatter.trigger) {
            featureEvents.push({
                type: 'free-spins',
                label: `${scatter.awardFreeSpins} Free Spins`,
                freeSpins: scatter.awardFreeSpins,
                indexes: scatterIndexes,
                persistentMultiplier: buyTier?.persistentMultiplier || config.features?.persistentMultiplier || 0,
            })
        }
    }

    const coinMeter = config.features?.coinMeter
    let coinHits = 0
    if (coinMeter) {
        cells.forEach((item, index) => {
            if (item.id === coinMeter.symbolId) {
                coinHits += 1
                winningIndexes.add(index)
            }
        })
        if (coinHits) {
            multiplier += round2(coinHits * coinMeter.pay)
            featureEvents.push({ type: 'coin-meter', label: `Collected ${coinHits}`, coinHits })
        }
    }

    if (moneyValues.length) {
        moneyValues.forEach(({ index }) => winningIndexes.add(index))
        multiplier += moneyTotal
        featureEvents.push({ type: 'money-collect', label: `Collected ${moneyValues.length} prizes`, moneyTotal })
    }

    if (mysteryReveal) {
        featureEvents.push({ type: 'mystery', label: `Mystery: ${mysteryReveal.label}`, symbolId: mysteryReveal.id })
    }

    if (cascadeSteps > 0) {
        featureEvents.push({ type: 'cascade', label: `${cascadeSteps + 1}x cascade chain`, steps: cascadeSteps })
    }

    if (config.features?.expandingWilds && cells.some(item => item.type === 'wild')) {
        featureEvents.push({ type: 'wilds', label: 'Wild column pulse' })
    }

    multiplier = round2(multiplier)
    return {
        cells,
        wins,
        winningIndexes: Array.from(winningIndexes),
        multiplier,
        featureEvents,
        coinHits,
        moneyValues,
        moneyTotal,
        mysteryReveal,
        cascadeSteps,
    }
}

// ---- buy tier helpers ----

export function getBuyTiers(config) {
    if (!config.controls?.buyBonus) return []
    const buy = config.features?.buyBonus
    if (!buy) return []
    if (Array.isArray(buy.tiers) && buy.tiers.length) return buy.tiers
    if (buy.costMultiplier) {
        return [{
            id: 'std',
            label: 'Bonus Buy',
            costMultiplier: buy.costMultiplier,
            guaranteedScatters: buy.guaranteedScatters || 3,
        }]
    }
    return []
}

export function findBuyTier(config, tierId) {
    const tiers = getBuyTiers(config)
    return tiers.find(tier => tier.id === tierId) || tiers[0] || null
}

export function buyTierCost(config, tierId, baseBet) {
    const tier = findBuyTier(config, tierId)
    if (!tier) return baseBet
    return round2(baseBet * tier.costMultiplier)
}
