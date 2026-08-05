import { pickWeighted, round2 } from '../../../utils/simulationMath.js'
import { nextRoll } from '../../../utils/fairRng.js'
import { SLOT_RTP_SCALARS } from './slotRtpScalars.js'

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
// Wave 8 themed packs
const ronin = '/assets/games/slots/ronin'
const iron = '/assets/games/slots/iron'
const coop = '/assets/games/slots/coop'
const spirit = '/assets/games/slots/spirit'
const forge = '/assets/games/slots/forge'
const gummy = '/assets/games/slots/gummy'

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
            coinMeter: { target: 30, symbolId: 'coin', pay: 0.32, fillTrigger: 5, burstFreeSpins: 6 },
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
            // S3: any line win that uses a wild substitute pays double.
            wildMultiplier: { multiplier: 2 },
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
            // S3: line wins using an expanded wild badge pay double.
            wildMultiplier: { multiplier: 2 },
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
            // S3: ways wins carried by an expanded wild reel pay triple.
            wildMultiplier: { multiplier: 3 },
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
            // Multiplier orbs (Gates-style) — tuned tighter than gummy-drops
            // since this 4x5 cluster has a smaller board / fewer orb landings.
            multiplierOrbs: {
                symbolId: 'orb',
                values: [2, 3, 5, 10, 25, 100],
                weights: [40, 26, 18, 10, 5, 1],
            },
            maxWinMultiplier: 5000,
        },
        symbols: [
            symbol('guitar', 'GTR', `${cyber}/slot-cyber-wave.png`, 5, 7),
            symbol('amp', 'AMP', `${cyber}/slot-cyber-chip.png`, 8, 3.8),
            symbol('record', 'DISC', `${classic}/slot-classic-bar.png`, 12, 1.8),
            symbol('light', 'LITE', `${classic}/slot-classic-bell.png`, 15, 1),
            symbol('ace', 'A', `${classic}/slot-classic-7.png`, 18, 0.65),
            symbol('queen', 'Q', `${mythic}/slot-mythic-orb.png`, 20, 0.45),
            symbol('orb', 'ORB', `${mythic}/slot-mythic-rune.png`, 3, 0, { type: 'orb' }),
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
            classicThreeReel: { jackpotSymbolId: 'seven', jackpotMultiplier: 30 },
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
            // S4: ~3% of base spins drop 2-4 random samurai wilds onto the reels
            // before evaluation (announced via the random-feature event).
            randomFeature: { chance: 0.03, mode: 'wilds', minWilds: 2, maxWilds: 4 },
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

    // ---- Wave 8 templates ----

    {
        id: 'ghostblade-strike',
        title: 'Ghostblade Strike',
        benchmark: 'Ghostblade',
        skin: 'ronin',
        accent: '#5fd1ff',
        rtpTarget: 0.945,
        volatility: 'High',
        layout: { rows: 4, cols: 5, evaluation: 'lines' },
        backdrop: '/assets/games/backdrops/backdrop-stars.png',
        featureText: 'Stacked ronin wilds turn full reels wild. Three middle reels carry a 3x multiplier zone.',
        controls: { buyBonus: true, turbo: true, auto: true },
        features: {
            scatter: { symbolId: 'amulet', trigger: 3, awardFreeSpins: 8, pay: 1.3 },
            anticipation: { scatterMin: 2 },
            stackedWildReel: { wildSymbolId: 'ghost', minStack: 3, lineBoost: 1.6 },
            multiplierZones: { columns: [1, 2, 3], multiplier: 3 },
            // S4: ~2.5% of base spins turn one random reel fully wild before
            // evaluation (announced via the random-feature event).
            randomFeature: { chance: 0.025, mode: 'wildReel' },
            buyBonus: {
                costMultiplier: 80,
                guaranteedScatters: 3,
                tiers: [
                    { id: 'std', label: 'Spirit Buy', costMultiplier: 80, guaranteedScatters: 3 },
                    { id: 'super', label: 'Ronin Buy', costMultiplier: 180, guaranteedScatters: 4, persistentMultiplier: 2 },
                ],
            },
        },
        symbols: [
            symbol('mask', 'MASK', `${ronin}/ghostblade-strike-hero.png`, 5, 8.5),
            symbol('katana', 'KATA', `${ronin}/ghostblade-strike-mid1.png`, 8, 4.4),
            symbol('blossom', 'BLSM', `${ronin}/ghostblade-strike-mid2.png`, 12, 2.2),
            symbol('rank-a', 'A', `${classic}/slot-classic-7.png`, 18, 0.7),
            symbol('rank-k', 'K', `${classic}/slot-classic-bar.png`, 20, 0.5),
            symbol('rank-q', 'Q', `${classic}/slot-classic-bell.png`, 22, 0.4),
            symbol('ghost', 'GHST', `${ronin}/ghostblade-strike-bonus.png`, 6, 0, { type: 'wild' }),
            symbol('amulet', 'BONUS', `${ronin}/ghostblade-strike-bonus.png`, 4, 0, { type: 'scatter' }),
        ],
    },
    {
        id: 'iron-fist',
        title: 'Iron Fist Demolition',
        benchmark: 'Fist of Demolition',
        skin: 'iron',
        accent: '#ff7b3a',
        rtpTarget: 0.94,
        volatility: 'Very high',
        layout: { rows: 4, cols: 5, evaluation: 'ways' },
        backdrop: '/assets/games/backdrops/backdrop-parchment.png',
        featureText: 'Hacksaw-style multiplier wheel feature gate. Trigger 3+ gongs to spin a 2x to 20x multiplier.',
        controls: { buyBonus: true, turbo: true, auto: true },
        features: {
            scatter: { symbolId: 'gong', trigger: 3, awardFreeSpins: 6, pay: 1.4 },
            anticipation: { scatterMin: 2 },
            multiplierWheel: { values: [2, 3, 5, 10, 20], weights: [46, 30, 16, 6, 2] },
            darkWinOverlay: true,
            buyBonus: {
                costMultiplier: 70,
                guaranteedScatters: 3,
                tiers: [
                    { id: 'std', label: 'Bell Buy', costMultiplier: 70, guaranteedScatters: 3 },
                    { id: 'super', label: 'Knockout Buy', costMultiplier: 180, guaranteedScatters: 4, persistentMultiplier: 3 },
                ],
            },
        },
        symbols: [
            symbol('fist', 'FIST', `${iron}/iron-fist-hero.png`, 5, 9),
            symbol('belt', 'BELT', `${iron}/iron-fist-mid1.png`, 8, 4.4),
            symbol('bell', 'BELL', `${iron}/iron-fist-mid2.png`, 12, 2.2),
            symbol('rank-a', 'A', `${classic}/slot-classic-7.png`, 18, 0.7),
            symbol('rank-k', 'K', `${classic}/slot-classic-bar.png`, 20, 0.5),
            symbol('rank-q', 'Q', `${classic}/slot-classic-bell.png`, 22, 0.4),
            symbol('gong', 'GONG', `${iron}/iron-fist-bonus.png`, 4, 0, { type: 'scatter' }),
        ],
    },
    {
        id: 'coop-cluck',
        title: 'Coop Cluck Cluster',
        benchmark: 'Motherclucker',
        skin: 'coop',
        accent: '#ffd166',
        rtpTarget: 0.945,
        volatility: 'Medium high',
        layout: { rows: 6, cols: 6, evaluation: 'cluster' },
        backdrop: '/assets/games/backdrops/backdrop-felt-green.png',
        featureText: 'Cluster pays plus a flock-collect meter. Land 30 chicks to enter the bonus barn.',
        controls: { buyBonus: true, turbo: true, auto: true },
        features: {
            scatter: { symbolId: 'basket', trigger: 4, awardFreeSpins: 8, pay: 1.2 },
            anticipation: { scatterMin: 3 },
            clusterMin: 5,
            coinMeter: { target: 30, symbolId: 'egg', pay: 0.32, fillTrigger: 6, burstFreeSpins: 4 },
            buyBonus: {
                costMultiplier: 80,
                guaranteedScatters: 4,
                tiers: [
                    { id: 'std', label: 'Coop Buy', costMultiplier: 80, guaranteedScatters: 4 },
                    { id: 'super', label: 'Barn Buy', costMultiplier: 180, guaranteedScatters: 5 },
                ],
            },
        },
        symbols: [
            symbol('hen', 'HEN', `${coop}/coop-cluck-hero.png`, 5, 7),
            symbol('egg-pay', 'EGG+', `${coop}/coop-cluck-mid1.png`, 8, 3.6),
            symbol('barn', 'BARN', `${coop}/coop-cluck-mid2.png`, 12, 2),
            symbol('rank-a', 'A', `${classic}/slot-classic-7.png`, 18, 0.7),
            symbol('rank-k', 'K', `${classic}/slot-classic-bar.png`, 20, 0.5),
            symbol('rank-q', 'Q', `${classic}/slot-classic-bell.png`, 22, 0.4),
            symbol('egg', 'COIN', `${coop}/coop-cluck-mid1.png`, 9, 0.25, { type: 'coin' }),
            symbol('basket', 'BONUS', `${coop}/coop-cluck-bonus.png`, 4, 0, { type: 'scatter' }),
        ],
    },
    {
        id: 'miko-spirit',
        title: 'Miko Spirit Lanterns',
        benchmark: 'MIKO',
        skin: 'spirit',
        accent: '#ff8db4',
        rtpTarget: 0.945,
        volatility: 'High',
        layout: { rows: 5, cols: 5, evaluation: 'ways' },
        backdrop: '/assets/games/backdrops/backdrop-stars.png',
        featureText: 'Lantern collect respin. Each lantern locks as a sticky wild for the rest of the bonus.',
        controls: { buyBonus: true, turbo: true, auto: true },
        features: {
            scatter: { symbolId: 'torii', trigger: 3, awardFreeSpins: 7, pay: 1.3 },
            anticipation: { scatterMin: 2 },
            stackedWildReel: { wildSymbolId: 'lantern', minStack: 3, lineBoost: 1.4, sticky: true },
            stickyWild: true,
            persistentMultiplier: 1,
            buyBonus: {
                costMultiplier: 70,
                guaranteedScatters: 3,
                tiers: [
                    { id: 'std', label: 'Lantern Buy', costMultiplier: 70, guaranteedScatters: 3 },
                    { id: 'super', label: 'Spirit Buy', costMultiplier: 160, guaranteedScatters: 4, persistentMultiplier: 2 },
                ],
            },
        },
        symbols: [
            symbol('miko', 'MIKO', `${spirit}/miko-spirit-hero.png`, 5, 8),
            symbol('lantern-pay', 'LANT', `${spirit}/miko-spirit-mid1.png`, 8, 4.4),
            symbol('fox', 'FOX', `${spirit}/miko-spirit-mid2.png`, 12, 2.2),
            symbol('rank-a', 'A', `${classic}/slot-classic-7.png`, 18, 0.7),
            symbol('rank-k', 'K', `${classic}/slot-classic-bar.png`, 20, 0.5),
            symbol('rank-q', 'Q', `${classic}/slot-classic-bell.png`, 22, 0.4),
            symbol('lantern', 'WILD', `${spirit}/miko-spirit-mid1.png`, 6, 0, { type: 'wild' }),
            symbol('torii', 'BONUS', `${spirit}/miko-spirit-bonus.png`, 4, 0, { type: 'scatter' }),
        ],
    },
    {
        id: 'forge-anvil',
        title: 'Forge of the Anvil',
        benchmark: 'Waylanders Forge',
        skin: 'forge',
        accent: '#ffae44',
        rtpTarget: 0.94,
        volatility: 'High',
        layout: { rows: 3, cols: 5, evaluation: 'lines' },
        backdrop: '/assets/games/backdrops/backdrop-parchment.png',
        featureText: 'Hold-and-respin coin board. Land 6+ coins to fill the anvil and trigger jackpot tiers.',
        controls: { buyBonus: true, turbo: true, auto: true },
        features: {
            scatter: { symbolId: 'gem', trigger: 3, awardFreeSpins: 6, pay: 1.2 },
            anticipation: { scatterMin: 2 },
            holdAndRespin: {
                triggerSymbolId: 'molten-coin',
                triggerCount: 6,
                respins: 3,
                jackpots: [
                    { name: 'Mini', multiplier: 8 },
                    { name: 'Minor', multiplier: 25 },
                    { name: 'Major', multiplier: 80 },
                    { name: 'Grand', multiplier: 200 },
                ],
            },
            buyBonus: {
                costMultiplier: 90,
                guaranteedScatters: 3,
                tiers: [
                    { id: 'std', label: 'Anvil Buy', costMultiplier: 90, guaranteedScatters: 3 },
                    { id: 'super', label: 'Grand Buy', costMultiplier: 220, guaranteedScatters: 4, persistentMultiplier: 2 },
                ],
            },
        },
        symbols: [
            symbol('molten-coin', 'COIN', `${forge}/forge-anvil-hero.png`, 5, 7),
            symbol('hammer', 'HMR', `${forge}/forge-anvil-mid1.png`, 8, 4),
            symbol('anvil', 'ANV', `${forge}/forge-anvil-mid2.png`, 12, 2.2),
            symbol('rank-a', 'A', `${classic}/slot-classic-7.png`, 18, 0.7),
            symbol('rank-k', 'K', `${classic}/slot-classic-bar.png`, 20, 0.5),
            symbol('rank-q', 'Q', `${classic}/slot-classic-bell.png`, 22, 0.4),
            symbol('gem', 'BONUS', `${forge}/forge-anvil-bonus.png`, 4, 0, { type: 'scatter' }),
        ],
    },
    {
        id: 'gummy-drops',
        title: 'Gummy Drops',
        benchmark: 'Gummy Drop 1000 / Sweet Fiesta',
        skin: 'gummy',
        accent: '#ff66c4',
        rtpTarget: 0.94,
        volatility: 'Very high',
        layout: { rows: 8, cols: 8, evaluation: 'cluster' },
        backdrop: '/assets/games/backdrops/backdrop-neon-grid.png',
        featureText: '8x8 cluster pays with a multiplier orb that grows with each cascade. Sweet, sticky, dangerous.',
        controls: { buyBonus: true, turbo: true, auto: true },
        features: {
            scatter: { symbolId: 'lollipop', trigger: 5, awardFreeSpins: 12, pay: 1.5 },
            anticipation: { scatterMin: 4 },
            // 8+ of a kind pays (Sweet-Bonanza style). On the 8x8 board a min of 6
            // meant the common low symbols cleared the threshold nearly every spin
            // (≈100% hit rate, degenerate scalar). 8 makes a paid cluster a real
            // probabilistic event and matches the "Very high" volatility target.
            clusterMin: 8,
            cascade: { tumbleMultiplierLadder: [1, 2, 3, 4, 6, 8] },
            persistentMultiplier: 1,
            // Multiplier orbs (Gates-style): orb cells carry a random ×; on any
            // winning tumble the orb sum multiplies the win total. The orb symbol
            // must be RARE (low weight) so it reads as a feature, not wallpaper —
            // an 8x8 board with a high orb weight lands orbs every spin, which
            // forces a degenerate RTP scalar that rounds normal wins to 0 (the
            // 2026-06-11 audit risk #1). Tuned so orbs appear on a minority of
            // spins and the per-orb ceiling is bounded; the win then spreads
            // across a real distribution instead of collapsing to ~1x.
            multiplierOrbs: {
                symbolId: 'orb',
                values: [2, 3, 5, 8, 12, 20, 50, 100],
                weights: [40, 26, 16, 9, 5, 2.5, 1, 0.5],
            },
            // Max-win cap (player-facing multiplier). Bounds the 8x8 cluster +
            // cascade + persistent-multiplier fat tail so the displayed RTP is
            // actually experienced and verifiable. Lowered from 5000 -> 2000: the
            // old ceiling was never reached once the scalar crushed the tail, so
            // it was cosmetic. 2000x is a genuine, reachable top end for this
            // very-high-volatility title.
            maxWinMultiplier: 2000,
            buyBonus: {
                costMultiplier: 100,
                guaranteedScatters: 5,
                tiers: [
                    { id: 'std', label: 'Sweet Buy', costMultiplier: 100, guaranteedScatters: 5 },
                    { id: 'super', label: 'Sugar Rush', costMultiplier: 250, guaranteedScatters: 6, persistentMultiplier: 2 },
                ],
            },
        },
        symbols: [
            symbol('bear', 'BEAR', `${gummy}/gummy-drops-hero.png`, 5, 7),
            symbol('heart', 'HRT', `${gummy}/gummy-drops-mid1.png`, 8, 3.8),
            symbol('ring', 'RING', `${gummy}/gummy-drops-mid2.png`, 12, 2),
            symbol('rank-a', 'A', `${classic}/slot-classic-7.png`, 18, 0.7),
            symbol('rank-k', 'K', `${classic}/slot-classic-bar.png`, 20, 0.5),
            symbol('rank-q', 'Q', `${classic}/slot-classic-bell.png`, 22, 0.4),
            symbol('rank-j', 'J', `${classic}/slot-classic-cherry.png`, 22, 0.32),
            symbol('orb', 'ORB', `${mythic}/slot-mythic-orb.png`, 0.12, 0, { type: 'orb' }),
            symbol('lollipop', 'BONUS', `${gummy}/gummy-drops-bonus.png`, 4, 0, { type: 'scatter' }),
        ],
    },
]

// Attach the calibrated per-template RTP scalar (see scripts/calibrateSlots.mjs)
// so resolveSlotSpin converges each template to its rtpTarget. Templates without
// a scalar default to 1 (no change).
for (const template of SLOT_TEMPLATES) {
    template.rtpScalar = SLOT_RTP_SCALARS[template.id] ?? 1
}

export function getSlotTemplate(id) {
    const base = SLOT_TEMPLATES.find(template => template.id === id) || SLOT_TEMPLATES[0]
    return applyRankArt(base)
}

// Wave 32 follow-up: rewrite each template's `rank-*` / `ace` / `king` /
// `queen` / `jack` symbols so their `asset` points at the per-template
// rank PNGs generated by `scripts/genSlotRankArt.mjs` +
// `scripts/sliceSlotRankArt.mjs`. Falls back to the original asset if a
// template doesn't have a rank art set yet (`rankArtBase` is undefined).
const RANK_LABEL_TO_KEY = {
    'A': 'A',
    'K': 'K',
    'Q': 'Q',
    'J': 'J',
    '10': '10',
}
const RANK_ID_TO_KEY = {
    'rank-a': 'A',
    'rank-k': 'K',
    'rank-q': 'Q',
    'rank-j': 'J',
    'rank-10': '10',
    ace: 'A',
    king: 'K',
    queen: 'Q',
    jack: 'J',
    ten: '10',
}

// Map template id -> { dir, base }. The dir matches the per-skin folder
// under `public/assets/games/slots/<dir>/`. The base is the file stem
// (e.g. `slot-rank-vault-rush` -> per-rank slices end in -10.png, -J.png).
const RANK_ART_INDEX = {
    'vault-rush':         { dir: 'vault',   base: 'slot-rank-vault-rush' },
    'river-catcher':      { dir: 'catcher', base: 'slot-rank-river-catcher' },
    'dust-rail':          { dir: 'western', base: 'slot-rank-dust-rail' },
    'storm-banner':       { dir: 'mythic',  base: 'slot-rank-storm-banner' },
    'bassline-bonus':     { dir: 'rock',    base: 'slot-rank-bassline-bonus' },
    'scarab-spin':        { dir: 'mythic',  base: 'slot-rank-scarab-spin' },
    'bars':               { dir: 'classic', base: 'slot-rank-bars' },
    'blue-samurai':       { dir: 'cyber',   base: 'slot-rank-blue-samurai' },
    'wanted-revelation':  { dir: 'wanted',  base: 'slot-rank-wanted-revelation' },
    'gates-ascent':       { dir: 'olympus', base: 'slot-rank-gates-ascent' },
    'bass-bayou':         { dir: 'bayou',   base: 'slot-rank-bass-bayou' },
    'mummy-cascade':      { dir: 'mummy',   base: 'slot-rank-mummy-cascade' },
    'phoenix-megaways':   { dir: 'phoenix', base: 'slot-rank-phoenix-megaways' },
    'mansion-megaways':   { dir: 'mansion', base: 'slot-rank-mansion-megaways' },
    'ghostblade-strike':  { dir: 'ronin',   base: 'slot-rank-ghostblade-strike' },
    'iron-fist':          { dir: 'iron',    base: 'slot-rank-iron-fist' },
    'coop-cluck':         { dir: 'coop',    base: 'slot-rank-coop-cluck' },
    'miko-spirit':        { dir: 'spirit',  base: 'slot-rank-miko-spirit' },
    'forge-anvil':        { dir: 'forge',   base: 'slot-rank-forge-anvil' },
    'gummy-drops':        { dir: 'gummy',   base: 'slot-rank-gummy-drops' },
}

const THEME_SYMBOL_ART_TEMPLATES = new Set([
    'vault-rush',
    'river-catcher',
    'dust-rail',
    'storm-banner',
    'bassline-bonus',
    'scarab-spin',
    'bars',
    'blue-samurai',
    'wanted-revelation',
    'gates-ascent',
    'bass-bayou',
    'mummy-cascade',
    'phoenix-megaways',
    'mansion-megaways',
    'ghostblade-strike',
    'iron-fist',
    'coop-cluck',
    'miko-spirit',
    'forge-anvil',
    'gummy-drops',
])

export function applyRankArt(config) {
    const idx = RANK_ART_INDEX[config.id]
    if (!idx) return config
    const root = `/assets/games/slots/${idx.dir}`
    // Wave 40: also rewrite high-paying theme symbols. Templates ship a
    // 4-asset set under `<dir>/<config.id>-{hero,mid1,mid2,bonus}.png`.
    // Any symbol still pointing at `slot-classic-*` art for hero / mid /
    // bonus gets swapped to the themed equivalent based on payout band.
    const themeAssetMap = {}
    if (THEME_SYMBOL_ART_TEMPLATES.has(config.id)) {
        const themeBase = `${root}/${config.id}`
        const heroAssets = {
            hero: `${themeBase}-hero.png`,
            mid1: `${themeBase}-mid1.png`,
            mid2: `${themeBase}-mid2.png`,
            bonus: `${themeBase}-bonus.png`,
        }
        // Sort theme-eligible symbols by payout descending so the highest pays
        // get the hero asset, the next two get mid1/mid2, scatter/wild get bonus.
        const themeEligibleIds = config.symbols
            .filter(s => !RANK_ID_TO_KEY[s.id] && !RANK_LABEL_TO_KEY[s.label])
            .map(s => s.id)
        const sortedTheme = config.symbols
            .filter(s => themeEligibleIds.includes(s.id))
            .slice()
            .sort((a, b) => (b.payout || 0) - (a.payout || 0))
        let heroAssigned = false
        let mid1Assigned = false
        let mid2Assigned = false
        for (const sym of sortedTheme) {
            if (sym.type === 'scatter' || sym.type === 'wild' || sym.type === 'mystery') {
                themeAssetMap[sym.id] = heroAssets.bonus
                continue
            }
            if (sym.type === 'coin' || sym.type === 'money') {
                themeAssetMap[sym.id] = heroAssets.mid2
                continue
            }
            if (!heroAssigned) { themeAssetMap[sym.id] = heroAssets.hero; heroAssigned = true; continue }
            if (!mid1Assigned) { themeAssetMap[sym.id] = heroAssets.mid1; mid1Assigned = true; continue }
            if (!mid2Assigned) { themeAssetMap[sym.id] = heroAssets.mid2; mid2Assigned = true; continue }
            themeAssetMap[sym.id] = heroAssets.mid2
        }
    }
    const symbols = config.symbols.map(sym => {
        const rankKey = RANK_ID_TO_KEY[sym.id] || RANK_LABEL_TO_KEY[sym.label]
        if (rankKey) return { ...sym, asset: `${root}/${idx.base}-${rankKey}.png` }
        if (themeAssetMap[sym.id]) return { ...sym, asset: themeAssetMap[sym.id] }
        return sym
    })
    return { ...config, symbols }
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
    // Megaways indexes cells COLUMN-major (see evaluateMegaways: cellOffset
    // accumulates per column, and the megaways grid renders column-by-column),
    // so per-column variable row counts must be walked column-first.
    if (config.layout.evaluation === 'megaways') {
        for (let col = 0; col < config.layout.cols; col += 1) {
            const rows = getColumnRows(config, col)
            for (let row = 0; row < rows; row += 1) {
                positions.push({ col, row })
            }
        }
        return positions
    }
    // All other layouts index cells ROW-major (`evaluateLines`/`evaluateWays`
    // use `row * cols + col`) and the standard reel grid auto-flows row-major in
    // the DOM. Returning column-major here desynced WinPathOverlay (and the
    // cascade trace / retrigger flyers / anticipation column logic) from the
    // engine's actual winning indexes — the win lines traced the wrong cells.
    const { rows, cols } = config.layout
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
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
    // gampo:allow-math-random-visual — idle-grid visual pre-fill only; spinning uses
    // the provably-fair nextRoll pipeline and payouts do not flow through this helper.
    return config.symbols[Math.floor(Math.random() * config.symbols.length)] || config.symbols[0]
}

// Calibration/sim seam: when set, ALL slot rolls use this fast RNG instead of
// the async-HMAC nextRoll. Production never sets this (stays null).
let calibrationRng = null
export function __setSlotCalibrationRng(fn) { calibrationRng = typeof fn === 'function' ? fn : null }

function roll(config, channel, rng) {
    // Calibration/tests can inject a fast deterministic RNG via `rng` (or the
    // module-level calibrationRng), bypassing the async-HMAC-backed nextRoll
    // (which is far too slow for large sims).
    if (typeof rng === 'function') return rng()
    if (calibrationRng) return calibrationRng()
    return nextRoll(`slots:${config.id}:${channel}`).roll
}

function pickSymbol(config, index, bonusBuy, rng) {
    const boosted = config.symbols.map(item => {
        if (!bonusBuy || item.type !== 'scatter') return item
        return { ...item, weight: item.weight + 18 }
    })
    return pickWeighted(boosted, () => roll(config, `cell:${index}`, rng))
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
    return item && item.type !== 'scatter' && item.type !== 'coin' && item.type !== 'money' && item.type !== 'mystery' && item.type !== 'orb'
}

// ---- mystery symbol pre-reveal ----

function applyMysteryReveal(cells, config, rng) {
    const mystery = config.features?.mysterySymbol
    if (!mystery) return { cells, mysteryReveal: null }
    const candidates = (mystery.candidates || [])
        .map(id => config.symbols.find(item => item.id === id))
        .filter(Boolean)
    if (!candidates.length) return { cells, mysteryReveal: null }
    const triggered = cells.some(item => item.id === mystery.id || item.type === 'mystery')
    if (!triggered) return { cells, mysteryReveal: null }
    const reveal = candidates[Math.floor(roll(config, 'mystery', rng) * candidates.length)]
    const next = cells.map(item => (item.id === mystery.id || item.type === 'mystery') ? reveal : item)
    return { cells: next, mysteryReveal: reveal }
}

// ---- wild transforms (expanding / stacked reels) ----

// Column cell-index ranges, handling megaways variable column heights.
function columnIndexRanges(config) {
    const { cols } = config.layout
    const ranges = []
    let offset = 0
    for (let col = 0; col < cols; col += 1) {
        const colRows = getColumnRows(config, col)
        ranges.push({ col, start: offset, rows: colRows })
        offset += colRows
    }
    return ranges
}

// expandingWilds: any column that contains at least one wild becomes a full wild
// column before evaluation (classic expanding-wild mechanic). Returns the new
// cells plus the columns that expanded (for presentation).
function applyExpandingWilds(cells, config) {
    if (!config.features?.expandingWilds) return { cells, expandedColumns: [] }
    const wildSymbol = config.symbols.find(item => item.type === 'wild')
    if (!wildSymbol) return { cells, expandedColumns: [] }
    const next = [...cells]
    const expandedColumns = []
    for (const { col, start, rows } of columnIndexRanges(config)) {
        let hasWild = false
        for (let r = 0; r < rows; r += 1) {
            if (next[start + r]?.type === 'wild') { hasWild = true; break }
        }
        if (hasWild) {
            for (let r = 0; r < rows; r += 1) next[start + r] = wildSymbol
            expandedColumns.push(col)
        }
    }
    return { cells: next, expandedColumns }
}

// stackedWildReel: a column with >= minStack wilds becomes a full wild reel and
// flags a lineBoost applied to wins that use it. Returns new cells + stacked
// columns + the lineBoost factor.
function applyStackedWildReels(cells, config) {
    const cfg = config.features?.stackedWildReel
    if (!cfg) return { cells, stackedColumns: [], lineBoost: 1 }
    const wildSymbol = config.symbols.find(item => item.id === cfg.wildSymbolId)
        || config.symbols.find(item => item.type === 'wild')
    if (!wildSymbol) return { cells, stackedColumns: [], lineBoost: 1 }
    const minStack = cfg.minStack || 3
    const next = [...cells]
    const stackedColumns = []
    for (const { col, start, rows } of columnIndexRanges(config)) {
        let wilds = 0
        for (let r = 0; r < rows; r += 1) {
            if (next[start + r]?.type === 'wild') wilds += 1
        }
        if (wilds >= minStack) {
            for (let r = 0; r < rows; r += 1) next[start + r] = wildSymbol
            stackedColumns.push(col)
        }
    }
    return {
        cells: next,
        stackedColumns,
        lineBoost: stackedColumns.length ? (cfg.lineBoost || 1) : 1,
    }
}

// ---- random base-game feature (S4) ----
// `features.randomFeature = { chance, mode, count?, minWilds?, maxWilds? }`.
// With probability `chance` (per base spin), inject extra wilds onto the board
// BEFORE evaluation — the classic "random wilds / wild reel drops in" base-game
// surprise. Two modes:
//   'wilds'   -> scatter a random number of wilds (minWilds..maxWilds) onto
//                non-special cells.
//   'wildReel'-> turn one random full column wild.
// Returns the mutated cells plus a descriptor for the announce animation, or
// null when it did not fire. Pure function of the injected rng/roll so it stays
// deterministic for calibration + tests.
function applyRandomFeature(cells, config, rng) {
    const cfg = config.features?.randomFeature
    if (!cfg || !(cfg.chance > 0)) return { cells, randomFeature: null }
    const wildSymbol = config.symbols.find(item => item.type === 'wild')
    if (!wildSymbol) return { cells, randomFeature: null }
    if (roll(config, 'randomFeature', rng) >= cfg.chance) return { cells, randomFeature: null }

    const next = [...cells]
    const mode = cfg.mode === 'wildReel' ? 'wildReel' : 'wilds'
    const placed = []

    if (mode === 'wildReel') {
        const ranges = columnIndexRanges(config)
        if (!ranges.length) return { cells, randomFeature: null }
        const pick = Math.floor(roll(config, 'randomFeatureCol', rng) * ranges.length)
        const { start, rows } = ranges[Math.min(pick, ranges.length - 1)]
        for (let r = 0; r < rows; r += 1) {
            next[start + r] = wildSymbol
            placed.push(start + r)
        }
        return {
            cells: next,
            randomFeature: { mode, label: 'Wild reel drop', wildIndexes: placed },
        }
    }

    // 'wilds' mode: scatter count wilds onto random non-special cells.
    const minW = Math.max(1, cfg.minWilds || 2)
    const maxW = Math.max(minW, cfg.maxWilds || 4)
    const span = maxW - minW
    const count = minW + Math.round(roll(config, 'randomFeatureCount', rng) * span)
    // Candidate cells: anything that is a normal pay symbol (don't overwrite
    // scatters / existing wilds / money / coin / mystery — those drive other
    // features).
    const candidates = []
    next.forEach((item, index) => {
        if (item && item.type !== 'wild' && isPaySymbol(item)) candidates.push(index)
    })
    for (let i = 0; i < count && candidates.length; i += 1) {
        const pickAt = Math.floor(roll(config, `randomFeatureWild:${i}`, rng) * candidates.length)
        const cellIndex = candidates.splice(pickAt, 1)[0]
        next[cellIndex] = wildSymbol
        placed.push(cellIndex)
    }
    if (!placed.length) return { cells, randomFeature: null }
    return {
        cells: next,
        randomFeature: { mode, label: `${placed.length} random wilds`, wildIndexes: placed },
    }
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

// ---- multiplier-zone boost (Wave 9) ----
// When the config declares `features.multiplierZones = { columns: number[], multiplier: number }`,
// any winning line/way/megaways that crosses one of those columns gets its multiplier scaled.
// For cluster/pay-anywhere we treat any winning index whose column matches as boost-eligible.

function applyMultiplierZones(wins, config) {
    const zone = config.features?.multiplierZones
    if (!zone || !zone.columns?.length || !zone.multiplier) return { wins, zoneHits: 0 }
    const cols = config.layout.cols
    const evaluation = config.layout.evaluation
    const colOf = (index) => {
        if (evaluation === 'megaways') {
            let cursor = 0
            for (let c = 0; c < cols; c += 1) {
                const colRows = getColumnRows(config, c)
                if (index < cursor + colRows) return c
                cursor += colRows
            }
            return -1
        }
        return index % cols
    }
    let zoneHits = 0
    const out = wins.map(win => {
        const indexes = win.indexes || []
        const crosses = indexes.some(index => zone.columns.includes(colOf(index)))
        if (!crosses) return win
        zoneHits += 1
        return {
            ...win,
            multiplier: round2(win.multiplier * zone.multiplier),
            zoneBoost: zone.multiplier,
        }
    })
    return { wins: out, zoneHits }
}

// ---- wild multiplier (S3) ----
// `features.wildMultiplier = { multiplier: number }` (e.g. 2 or 3). Any winning
// line/way/cluster whose winning cells include a wild gets its multiplier scaled
// by that factor — the classic "wild win pays double/triple" mechanic. Stacking:
// when multiple distinct wilds land in one win we use a single flat multiplier
// (matches most real titles); set `perWild: true` to instead multiply by
// multiplier^(#wilds in the win), capped by `maxStack`.
function applyWildMultiplier(wins, cells, config) {
    const cfg = config.features?.wildMultiplier
    if (!cfg || !(cfg.multiplier > 1)) return { wins, wildBoostHits: 0 }
    const isWild = (index) => cells[index]?.type === 'wild'
    let wildBoostHits = 0
    const out = wins.map(win => {
        const indexes = win.indexes || []
        const wildCount = indexes.reduce((n, index) => n + (isWild(index) ? 1 : 0), 0)
        if (wildCount <= 0) return win
        wildBoostHits += 1
        let factor = cfg.multiplier
        if (cfg.perWild) {
            const maxStack = cfg.maxStack || wildCount
            factor = Math.pow(cfg.multiplier, Math.min(wildCount, maxStack))
        }
        return {
            ...win,
            multiplier: round2(win.multiplier * factor),
            wildBoost: factor,
        }
    })
    return { wins: out, wildBoostHits }
}


// `features.multiplierWheel = { values: number[], weights: number[] }`. When 3+ scatters
// trigger the feature, we resolve a wheel pick deterministically via the round-keyed roll.
// The wheel award is added to the spin multiplier and surfaced as a feature event so the
// UI can render a wheel cinematic.

function resolveMultiplierWheel(config, rng) {
    const wheel = config.features?.multiplierWheel
    if (!wheel || !Array.isArray(wheel.values) || !wheel.values.length) return null
    const weights = Array.isArray(wheel.weights) && wheel.weights.length === wheel.values.length
        ? wheel.weights
        : wheel.values.map(() => 1)
    const total = weights.reduce((sum, w) => sum + w, 0)
    if (total <= 0) return null
    const r = roll(config, 'wheel', rng) * total
    let cumulative = 0
    for (let i = 0; i < wheel.values.length; i += 1) {
        cumulative += weights[i]
        if (r < cumulative) {
            return { value: wheel.values[i], index: i }
        }
    }
    return { value: wheel.values[wheel.values.length - 1], index: wheel.values.length - 1 }
}

// ---- hold-and-respin coin board resolve (Wave 9) ----
// `features.holdAndRespin = { triggerSymbolId, triggerCount, respins, jackpots: [{ name, multiplier }] }`.
// When triggerCount+ trigger symbols land we simulate a 3x4 coin board respin sequence
// deterministically and return the awarded jackpot tier.

function resolveHoldAndRespin(config, cells, rng) {
    const hr = config.features?.holdAndRespin
    if (!hr) return null
    const trigger = hr.triggerSymbolId
    if (!trigger) return null
    const triggers = cells.reduce((sum, item) => sum + (item.id === trigger ? 1 : 0), 0)
    if (triggers < (hr.triggerCount || 6)) return null
    // Simulate a 12-slot board; pre-fill with the triggers, then run `respins` rounds where
    // each empty slot has a small chance to fill on each respin (deterministic per round).
    const boardSize = 12
    const filled = Math.min(boardSize, triggers)
    let board = Array.from({ length: boardSize }, (_, idx) => idx < filled)
    const startFilledIndexes = board
        .map((slot, index) => slot ? index : -1)
        .filter(index => index >= 0)
    const respinLog = []
    const respins = hr.respins || 3
    let remaining = respins
    for (let step = 0; step < respins; step += 1) {
        let added = 0
        const r = roll(config, `hold:step:${step}`, rng)
        // Each empty slot has ~r * 0.3 chance to fill, gated by filled count to avoid runaway.
        board = board.map((slot, idx) => {
            if (slot) return slot
            const fillRoll = roll(config, `hold:fill:${step}:${idx}`, rng)
            if (fillRoll < 0.18 + r * 0.12) {
                added += 1
                return true
            }
            return slot
        })
        respinLog.push({ step: step + 1, added, totalFilled: board.filter(Boolean).length })
        if (added > 0) remaining = respins // reset on fill (classic hold-and-respin)
        else remaining -= 1
        if (remaining <= 0) break
    }
    const finalFilled = board.filter(Boolean).length
    const filledIndexes = board
        .map((slot, index) => slot ? index : -1)
        .filter(index => index >= 0)
    const newFillIndexes = filledIndexes.filter(index => !startFilledIndexes.includes(index))
    const jackpots = Array.isArray(hr.jackpots) ? hr.jackpots : []
    let award = null
    if (finalFilled >= boardSize && jackpots.length) {
        award = jackpots[jackpots.length - 1] // Grand
    } else if (finalFilled >= boardSize - 2 && jackpots.length >= 3) {
        award = jackpots[jackpots.length - 2] // Major
    } else if (finalFilled >= filled + 3 && jackpots.length >= 2) {
        award = jackpots[1] // Minor
    } else if (jackpots.length) {
        award = jackpots[0] // Mini
    }
    return {
        triggers,
        boardSize,
        startFilled: filled,
        startFilledIndexes,
        finalFilled,
        filledIndexes,
        newFillIndexes,
        respins,
        respinLog,
        award,
    }
}

// ---- multiplier orb resolve (Gates-style) ----
// `features.multiplierOrbs = { symbolId, values: number[], weights?: number[] }`.
// Orb cells are a non-paying special symbol (type 'orb'). Each orb that lands
// carries a multiplier picked from the weighted `values` table. When the spin
// produces ANY win (including across the full cascade chain), the orb values are
// SUMMED and the running win total is multiplied by that sum. No win => orbs do
// nothing (classic tumble behaviour). Purely engine-side; the value per cell is
// returned so the UI can render the orb face + a coin-shower on apply.
function resolveMultiplierOrbs(cells, config, rng) {
    const cfg = config.features?.multiplierOrbs
    if (!cfg || !cfg.symbolId || !Array.isArray(cfg.values) || !cfg.values.length) {
        return { orbValues: [], orbTotal: 0 }
    }
    const weights = Array.isArray(cfg.weights) && cfg.weights.length === cfg.values.length
        ? cfg.weights
        : cfg.values.map(() => 1)
    const weightTotal = weights.reduce((sum, w) => sum + w, 0)
    const orbValues = []
    let orbTotal = 0
    cells.forEach((item, index) => {
        if (!item || item.id !== cfg.symbolId) return
        const r = roll(config, `orb:${index}`, rng) * weightTotal
        let cumulative = 0
        let value = cfg.values[cfg.values.length - 1]
        for (let i = 0; i < cfg.values.length; i += 1) {
            cumulative += weights[i]
            if (r < cumulative) { value = cfg.values[i]; break }
        }
        orbValues.push({ index, value })
        orbTotal += value
    })
    return { orbValues, orbTotal }
}

// ---- money symbol resolve ----
function resolveMoneyValues(cells, config, rng) {
    const moneyDefs = config.symbols.filter(item => item.type === 'money')
    if (!moneyDefs.length) return { moneyValues: [], moneyTotal: 0 }
    const moneyValues = []
    let moneyTotal = 0
    cells.forEach((item, index) => {
        if (item.type !== 'money') return
        const range = item.valueRange || [1, 5]
        const r = roll(config, `money:${index}`, rng)
        const value = round2(range[0] + r * (range[1] - range[0]))
        moneyValues.push({ index, value, symbol: item })
        moneyTotal = round2(moneyTotal + value)
    })
    return { moneyValues, moneyTotal }
}

// ---- cascade tumble ----

function cascadeTumble(cells, config, baseWins, baseIndexes, rng, baseWildBoostHits = 0) {
    const ladder = config.features?.cascade?.tumbleMultiplierLadder
    if (!ladder || !baseWins.length) return { cells, cascadedWins: baseWins, cascadeSteps: 0, cascadeFrames: [], wildBoostHits: baseWildBoostHits }
    let working = [...cells]
    let cascadedWins = [...baseWins]
    let wildBoostHits = baseWildBoostHits
    let step = 0
    let lastIndexes = baseIndexes
    // Per-step frames so the UI can animate real tumbles (pop -> collapse ->
    // refill) instead of only showing the final grid. Frame 0 captures the
    // pre-tumble board with its winning cells; each later frame captures the
    // board AFTER a refill plus the new winning cells found on it.
    const cascadeFrames = [{
        cells: [...cells],
        winCells: [...baseIndexes],
        stepPayout: round2(baseWins.reduce((sum, w) => sum + w.multiplier, 0)),
        stepMultiplier: ladder[0] ?? 1,
    }]
    while (lastIndexes && lastIndexes.size && step < ladder.length - 1) {
        // Replace winning cells with new picks; for cluster/pay-anywhere we rebuild positions.
        working = working.map((item, index) => {
            if (!lastIndexes.has(index)) return item
            const replaced = pickSymbol(config, index + step * 1009, false, rng)
            return replaced
        })
        const next = evaluateBaseWins(working, config)
        if (!next.wins.length) {
            // Final settle frame: refilled board with no further wins.
            cascadeFrames.push({ cells: [...working], winCells: [], stepPayout: 0, stepMultiplier: 0 })
            break
        }
        const { wins: wildBoostedWins, wildBoostHits: stepWildBoostHits } = applyWildMultiplier(next.wins, working, config)
        wildBoostHits += stepWildBoostHits
        const stepMultiplier = ladder[Math.min(step + 1, ladder.length - 1)]
        const stepWins = wildBoostedWins.map(win => ({
            ...win,
            multiplier: round2(win.multiplier * stepMultiplier),
            cascadeStep: step + 1,
        }))
        cascadedWins.push(...stepWins)
        cascadeFrames.push({
            cells: [...working],
            winCells: [...next.winningIndexes],
            stepPayout: round2(stepWins.reduce((sum, win) => sum + win.multiplier, 0)),
            stepMultiplier,
        })
        lastIndexes = next.winningIndexes
        step += 1
    }
    return { cells: working, cascadedWins, cascadeSteps: step, cascadeFrames, wildBoostHits }
}

// ---- main resolver ----

export function resolveSlotSpin(config, options = {}) {
    const bonusBuy = Boolean(options.bonusBuy)
    const buyTier = options.buyTier || null
    const stickyWilds = Array.isArray(options.stickyWilds) ? options.stickyWilds : []
    const total = getCellCount(config)
    const rng = typeof options.rng === 'function' ? options.rng : null
    let cells = Array.from({ length: total }, (_, index) => pickSymbol(config, index, bonusBuy, rng))

    // Buy tier guaranteed scatters
    if (bonusBuy) {
        const guaranteed = buyTier?.guaranteedScatters
            ?? config.features?.buyBonus?.guaranteedScatters
            ?? 3
        cells = forceGuaranteedScatters(cells, config, guaranteed)
    }

    // Sticky wilds (Wave 9): force these cell indexes to be wild before mystery/evaluation.
    if (stickyWilds.length) {
        const wildSymbol = config.symbols.find(item => item.type === 'wild')
        if (wildSymbol) {
            cells = cells.map((item, index) => stickyWilds.includes(index) ? wildSymbol : item)
        }
    }

    // Random base-game feature (S4): low-probability surprise injection of extra
    // wilds (or a full wild reel) BEFORE expanding/stacking/evaluation, so the
    // injected wilds also benefit from expansion + wild multipliers downstream.
    const { cells: randomFeatureCells, randomFeature } = applyRandomFeature(cells, config, rng)
    cells = randomFeatureCells

    // Expanding wilds: a column containing a wild becomes a full wild column.
    const { cells: expandedCells, expandedColumns } = applyExpandingWilds(cells, config)
    cells = expandedCells

    // Stacked wild reels: a column with >= minStack wilds becomes a full wild
    // reel and applies a lineBoost to wins that include it.
    const { cells: stackedCells, stackedColumns, lineBoost } = applyStackedWildReels(cells, config)
    cells = stackedCells

    // Scarab respin: when >= triggerCount scarab wilds land, lock them and run a
    // respin where the locked cells stay wild. The lockBoost scales the respin
    // wins. Modelled as a single bonus respin folded into this spin's result.
    const scarabCfg = config.features?.scarabRespin
    let scarabRespun = false
    if (scarabCfg) {
        const wildIdxs = cells
            .map((item, index) => item.type === 'wild' ? index : -1)
            .filter(i => i >= 0)
        if (wildIdxs.length >= (scarabCfg.triggerCount || 3)) {
            scarabRespun = true
            const wildSymbol = config.symbols.find(item => item.type === 'wild')
            // Respin: re-pick every non-locked cell; locked scarabs stay wild.
            cells = cells.map((item, index) => (
                wildIdxs.includes(index) ? wildSymbol : pickSymbol(config, index + 7919, false, rng)
            ))
        }
    }

    // Mystery reveal pre-evaluate
    const { cells: revealedCells, mysteryReveal } = applyMysteryReveal(cells, config, rng)
    cells = revealedCells

    // Money values
    const { moneyValues, moneyTotal } = resolveMoneyValues(cells, config, rng)

    // Base evaluation
    const baseEval = evaluateBaseWins(cells, config)
    let { wins } = baseEval
    let winningIndexes = new Set(baseEval.winningIndexes)

    // Cascade tumble (cluster / pay-anywhere / megaways).
    let cascadeSteps = 0
    let cascadeFrames = []
    let wildBoostHits = 0
    const isCascade = Boolean(config.features?.cascade && (config.layout.evaluation === 'cluster' || config.layout.evaluation === 'pay-anywhere' || config.layout.evaluation === 'megaways'))
    if (isCascade) {
        const baseWildBoost = applyWildMultiplier(wins, cells, config)
        wins = baseWildBoost.wins
        wildBoostHits = baseWildBoost.wildBoostHits
        const cascadeResult = cascadeTumble(cells, config, wins, winningIndexes, rng, wildBoostHits)
        cells = cascadeResult.cells
        wins = cascadeResult.cascadedWins
        cascadeSteps = cascadeResult.cascadeSteps
        cascadeFrames = cascadeResult.cascadeFrames
        wildBoostHits = cascadeResult.wildBoostHits
    }

    // Multiplier zones (Wave 9): scale wins crossing zone columns.
    const { wins: zonedWins, zoneHits } = applyMultiplierZones(wins, config)
    wins = zonedWins

    // Wild multiplier (S3): non-cascade wins whose final cells include a wild pay x2/x3.
    if (!isCascade) {
        const wildBoost = applyWildMultiplier(wins, cells, config)
        wins = wildBoost.wins
        wildBoostHits = wildBoost.wildBoostHits
    }

    // Stacked-wild line boost: scale wins when a full wild reel formed.
    if (lineBoost > 1) {
        wins = wins.map(win => ({ ...win, multiplier: round2(win.multiplier * lineBoost) }))
    }

    // Scarab respin lock boost: reward the locked-wild respin.
    if (scarabRespun && (scarabCfg?.lockBoost || 1) > 1) {
        wins = wins.map(win => ({ ...win, multiplier: round2(win.multiplier * scarabCfg.lockBoost) }))
    }

    let multiplier = wins.reduce((sum, item) => sum + item.multiplier, 0)
    const featureEvents = []

    // Multiplier orbs (Gates-style): orb cells on the settled board carry random
    // multipliers. They only matter when the spin produced a win — the SUM of all
    // orb values then scales the win-derived multiplier. Applied before scatter /
    // wheel / hold flat awards so those bonus add-ons aren't double-multiplied.
    const { orbValues, orbTotal } = resolveMultiplierOrbs(cells, config, rng)
    const orbsApplied = orbValues.length > 0 && multiplier > 0 && orbTotal > 0
    if (orbsApplied) {
        multiplier = round2(multiplier * orbTotal)
        orbValues.forEach(({ index }) => winningIndexes.add(index))
        // NOTE: the 'multiplier-orbs' feature event is pushed at the end of the
        // resolver (after the RTP scalar + max-win cap) and only if the FINAL
        // paid multiplier is still > 0. On extreme-variance templates the scalar
        // can round a small win to 0, and a feature event must never claim a win
        // that the player did not actually receive.
    }

    if (expandedColumns.length) {
        featureEvents.push({ type: 'expanding-wilds', label: `Expanding wild × ${expandedColumns.length}`, columns: expandedColumns })
    }
    if (stackedColumns.length) {
        featureEvents.push({ type: 'stacked-wild', label: `Wild reel × ${stackedColumns.length}`, columns: stackedColumns, lineBoost })
    }
    if (scarabRespun) {
        featureEvents.push({ type: 'scarab-respin', label: 'Scarab lock & respin' })
    }

    if (zoneHits > 0) {
        featureEvents.push({
            type: 'multiplier-zone',
            label: `${config.features.multiplierZones.multiplier}x zone × ${zoneHits}`,
            zoneHits,
            multiplier: config.features.multiplierZones.multiplier,
        })
    }

    if (wildBoostHits > 0) {
        featureEvents.push({
            type: 'wild-multiplier',
            label: `Wild win ×${config.features.wildMultiplier.multiplier}`,
            wildBoostHits,
            multiplier: config.features.wildMultiplier.multiplier,
        })
    }

    if (randomFeature) {
        featureEvents.push({
            type: 'random-feature',
            label: randomFeature.label,
            mode: randomFeature.mode,
            wildIndexes: randomFeature.wildIndexes,
        })
    }

    const scatter = config.features?.scatter
    let triggeredFreeSpins = false
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
            triggeredFreeSpins = true
            featureEvents.push({
                type: 'free-spins',
                label: `${scatter.awardFreeSpins} Free Spins`,
                freeSpins: scatter.awardFreeSpins,
                indexes: scatterIndexes,
                persistentMultiplier: buyTier?.persistentMultiplier || config.features?.persistentMultiplier || 0,
            })
        }
    }

    // Multiplier wheel (Wave 9): only when free spins triggered and config has the wheel.
    let wheel = null
    if (triggeredFreeSpins) {
        wheel = resolveMultiplierWheel(config, rng)
        if (wheel) {
            multiplier += wheel.value
            featureEvents.push({
                type: 'multiplier-wheel',
                label: `Wheel awarded ${wheel.value}x`,
                value: wheel.value,
            })
        }
    }

    // Hold-and-respin coin board (Wave 9): triggers when triggerCount+ COIN symbols land.
    const holdAndRespin = resolveHoldAndRespin(config, cells, rng)
    if (holdAndRespin?.award) {
        multiplier += holdAndRespin.award.multiplier
        featureEvents.push({
            type: 'hold-and-respin',
            label: `${holdAndRespin.award.name} ${holdAndRespin.award.multiplier}x`,
            award: holdAndRespin.award,
            board: {
                size: holdAndRespin.boardSize,
                startFilled: holdAndRespin.startFilled,
                startFilledIndexes: holdAndRespin.startFilledIndexes,
                finalFilled: holdAndRespin.finalFilled,
                filledIndexes: holdAndRespin.filledIndexes,
                newFillIndexes: holdAndRespin.newFillIndexes,
                respins: holdAndRespin.respins,
                log: holdAndRespin.respinLog,
            },
        })
    }

    const coinMeter = config.features?.coinMeter
    let coinHits = 0
    let coinMeterFilled = false
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
        // Meter fill: when this spin's coins reach the per-spin fill trigger, the
        // vault/barn cracks open for a free-spins burst. (The running meter is
        // tracked by the UI; here we award when enough coins land at once.)
        const fillTrigger = coinMeter.fillTrigger || Math.max(4, Math.round((coinMeter.target || 30) * 0.2))
        if (coinHits >= fillTrigger && !triggeredFreeSpins) {
            coinMeterFilled = true
            triggeredFreeSpins = true
            const burst = coinMeter.burstFreeSpins || 5
            featureEvents.push({
                type: 'coin-meter-fill',
                label: `Vault burst · ${burst} free spins`,
                freeSpins: burst,
            })
            featureEvents.push({
                type: 'free-spins',
                label: `${burst} Free Spins`,
                freeSpins: burst,
                indexes: [],
                persistentMultiplier: config.features?.persistentMultiplier || 0,
                source: 'coin-meter',
            })
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

    // Classic 3-reel jackpot: all paying cells identical to the jackpot symbol
    // pays jackpotMultiplier (e.g. triple sevens on Bars). Replaces the line
    // ladder for that specific symbol so the headline jackpot actually lands.
    const classic = config.features?.classicThreeReel
    if (classic?.jackpotSymbolId && classic?.jackpotMultiplier) {
        const payCells = cells.filter(isPaySymbol)
        if (payCells.length && payCells.every(item => item.id === classic.jackpotSymbolId)) {
            multiplier += classic.jackpotMultiplier
            cells.forEach((_, index) => winningIndexes.add(index))
            featureEvents.push({ type: 'jackpot', label: `JACKPOT ${classic.jackpotMultiplier}x`, multiplier: classic.jackpotMultiplier })
        }
    }

    // Persistent multiplier: during a free-spin session the running multiplier
    // (grown by retriggers/cascades, capped) scales the whole spin return.
    // options.persistentMultiplier is threaded in by SlotsGame for free spins.
    const persistCap = config.features?.persistentMultiplierCap || 10
    const activePersistent = Math.min(persistCap, Math.max(1, Number(options.persistentMultiplier) || 1))
    if (config.features?.persistentMultiplier && activePersistent > 1) {
        multiplier = round2(multiplier * activePersistent)
        featureEvents.push({ type: 'persistent-multiplier', label: `${activePersistent}x persistent`, value: activePersistent })
    }

    // New wild positions surfaced for sticky-wild lock tracking by the UI.
    const wildIndexes = cells
        .map((item, index) => item.type === 'wild' ? index : -1)
        .filter(index => index >= 0)

    multiplier = round2(multiplier)
    // RTP calibration: scale the raw multiplier by the per-template scalar so
    // realized RTP converges to config.rtpTarget. The scalar is precomputed by
    // scripts/calibrateSlots.mjs and stored on config.rtpScalar (defaults to 1
    // if absent). `options.rtpScalar` lets the calibration harness measure the
    // RAW multiplier (scalar = 1) without recursion. Fun Mode multiplies it.
    const rtpScalar = options.rtpScalar != null
        ? options.rtpScalar
        : (Number(config.rtpScalar) > 0 ? config.rtpScalar : 1)
    if (rtpScalar !== 1) multiplier = round2(multiplier * rtpScalar)
    // Max-win cap: real slots bound a single round's return (e.g. "max win
    // 5000x"). This clips the pathological fat tail on high-variance titles so
    // the experienced RTP converges to target far faster, without touching the
    // mean for typical rounds. The cap is applied to the calibration harness too
    // (no options.rtpScalar override) so calibration sees the same bounded math.
    const maxWin = Number(config.features?.maxWinMultiplier) || 0
    if (maxWin > 0 && multiplier > maxWin) multiplier = maxWin
    // Surface the multiplier-orbs feature event only when the FINAL paid
    // multiplier is positive (see note at orb application above). orbValues /
    // orbTotal are always returned for UI rendering regardless.
    if (orbsApplied && multiplier > 0) {
        featureEvents.push({
            type: 'multiplier-orbs',
            label: `Orbs ×${orbTotal}`,
            orbValues,
            orbTotal,
        })
    }
    return {
        cells,
        wins,
        winningIndexes: Array.from(winningIndexes),
        multiplier,
        featureEvents,
        coinHits,
        moneyValues,
        moneyTotal,
        orbValues,
        orbTotal,
        mysteryReveal,
        cascadeSteps,
        cascadeFrames,
        zoneHits,
        wildBoostHits,
        randomFeature,
        wheel,
        holdAndRespin,
        wildIndexes,
        triggeredFreeSpins,
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
