import { NavLink, useLocation } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { Pin, PinOff } from 'lucide-react'
import { useSidebarPins } from '../hooks/useSidebarPins'
import { sidebarPaths } from '../data/sidebarIcons'
import { slotPath } from '../data/slotRoutes'
import { sportsbookPathForView } from '../sportsbook/sportsbookRoutes'

// ---- Casino sidebar data (unchanged from prior waves) ----
const navSections = [
    {
        title: 'Casino',
        items: [
            { icon: 'home', label: 'Lobby', path: '/' },
            { icon: 'originals', label: 'Originals', path: '/originals' },
            { icon: 'slotsLobby', label: 'Slots Lobby', path: '/slots-lobby' },
            { icon: 'live', label: 'Live Studio', path: '/live' },
            { icon: 'sports', label: 'Sportsbook', path: '/sportsbook' },
        ],
    },
    {
        title: 'Progress',
        items: [
            { icon: 'gift', label: 'Promotions', path: '/promotions' },
            { icon: 'mission', label: 'Missions', path: '/missions' },
            { icon: 'vip', label: 'VIP Lab', path: '/vip' },
            { icon: 'academy', label: 'Risk Academy', path: '/learn' },
            { icon: 'barChart', label: 'Strategy Sandbox', path: '/sandbox' },
            { icon: 'pnl', label: 'Session Insights', path: '/insights' },
        ],
    },
    {
        title: 'Account',
        items: [
            { icon: 'verify', label: 'Verify', path: '/verify' },
            { icon: 'race', label: 'Race', path: '/race' },
            { icon: 'activity', label: 'Activity', path: '/activity' },
            { icon: 'progress', label: 'Settings', path: '/settings' },
        ],
    },
]

const sidebarActions = [
    {
        icon: 'chat', label: 'Open Chat',
        onClick: () => document.dispatchEvent(new CustomEvent('gampo:open-chat', { detail: { tab: 'chat' } })),
    },
    {
        icon: 'pnl', label: 'PnL Stats',
        onClick: () => document.dispatchEvent(new CustomEvent('gampo:open-chat', { detail: { tab: 'stats' } })),
    },
    {
        icon: 'progress', label: 'Achievements',
        onClick: () => document.dispatchEvent(new CustomEvent('gampo:open-chat', { detail: { tab: 'progress' } })),
    },
]

// ---- Sportsbook sidebar data (Wave 22) ----
const sportsViews = [
    { id: 'home', icon: 'sports', label: 'Sportsbook Home', view: 'home' },
    { id: 'live', icon: 'radio', label: 'Live Events', view: 'live' },
    { id: 'starting', icon: 'clock', label: 'Starting Soon', view: 'starting' },
    { id: 'all', icon: 'grid', label: 'All Events', view: 'all' },
    { id: 'my-bets', icon: 'list', label: 'My Bets', view: 'my-bets' },
]

const sportsTopList = [
    { id: 'soccer', icon: 'soccer', label: 'Soccer' },
    { id: 'tennis', icon: 'tennis', label: 'Tennis' },
    { id: 'cricket', icon: 'cricket', label: 'Cricket' },
    { id: 'basketball', icon: 'basket', label: 'Basketball' },
    { id: 'ice-hockey', icon: 'hockey', label: 'Ice Hockey' },
    { id: 'baseball', icon: 'baseball', label: 'Baseball' },
    { id: 'football', icon: 'football', label: 'Football' },
    { id: 'handball', icon: 'sports', label: 'Handball' },
    { id: 'rugby', icon: 'football', label: 'Rugby' },
    { id: 'volleyball', icon: 'sports', label: 'Volleyball' },
    { id: 'formula-1', icon: 'race', label: 'Formula 1' },
    { id: 'mma', icon: 'sports', label: 'MMA' },
    { id: 'horse-racing', icon: 'racing', label: 'Horse Racing' },
]

const sportsEsports = [
    { id: 'cs2', icon: 'esports', label: 'CS2' },
    { id: 'dota-2', icon: 'esports', label: 'Dota 2' },
    { id: 'valorant', icon: 'esports', label: 'Valorant' },
    { id: 'league-of-legends', icon: 'esports', label: 'League of Legends' },
]

// ---- Casino games (unchanged) ----
const gameItems = [
    { group: 'Featured', icon: 'poker', label: 'Live Poker', path: '/poker' },
    { group: 'Featured', icon: 'crash', label: 'Crash', path: '/crash' },
    { group: 'Featured', icon: 'plinko', label: 'Plinko', path: '/plinko' },
    { group: 'Featured', icon: 'mines', label: 'Mines', path: '/mines' },
    { group: 'Featured', icon: 'dice', label: 'Dice', path: '/dice' },
    { group: 'Featured', icon: 'limbo', label: 'Limbo', path: '/limbo' },
    { group: 'Featured', icon: 'keno', label: 'Keno', path: '/keno' },
    { group: 'Featured', icon: 'wheel', label: 'Wheel', path: '/wheel' },

    { group: 'Originals', icon: 'dino', label: 'Dino Run', path: '/dino' },
    { group: 'Originals', icon: 'tower', label: 'Tower', path: '/tower' },
    { group: 'Originals', icon: 'chickencross', label: 'Chicken Cross', path: '/chickencross' },
    { group: 'Originals', icon: 'coinflip', label: 'Coin Flip', path: '/coinflip' },
    { group: 'Originals', icon: 'rps', label: 'RPS', path: '/rps' },
    { group: 'Originals', icon: 'guess', label: 'Guess Number', path: '/guess' },
    { group: 'Originals', icon: 'color', label: 'Color Pick', path: '/color' },
    { group: 'Originals', icon: 'lottery', label: 'Lottery', path: '/lottery' },

    { group: 'Slots', icon: 'slots-vault', label: 'Slot Factory', path: '/slots' },
    { group: 'Slots', icon: 'slots-vault', label: 'Vault Rush', path: slotPath('vault-rush') },
    { group: 'Slots', icon: 'slots-river', label: 'River Catcher', path: slotPath('river-catcher') },
    { group: 'Slots', icon: 'slots-west', label: 'Dust Rail Bounty', path: slotPath('dust-rail') },
    { group: 'Slots', icon: 'slots-mythic', label: 'Storm Banner', path: slotPath('storm-banner') },
    { group: 'Slots', icon: 'slots-rock', label: 'Bassline Bonus', path: slotPath('bassline-bonus') },
    { group: 'Slots', icon: 'slots-scarab', label: 'Scarab Spin', path: slotPath('scarab-spin') },
    { group: 'Slots', icon: 'slots-bars', label: 'Bars', path: slotPath('bars') },
    { group: 'Slots', icon: 'slots-samurai', label: 'Blue Samurai', path: slotPath('blue-samurai') },
    { group: 'Slots', icon: 'slots-wanted', label: 'Wanted Revelation', path: slotPath('wanted-revelation') },
    { group: 'Slots', icon: 'slots-olympus', label: 'Gates of Ascent', path: slotPath('gates-ascent') },
    { group: 'Slots', icon: 'slots-bayou', label: 'Bass Bayou', path: slotPath('bass-bayou') },
    { group: 'Slots', icon: 'slots-mummy', label: 'Mummy Cascade', path: slotPath('mummy-cascade') },
    { group: 'Slots', icon: 'slots-phoenix', label: 'Phoenix Megaways', path: slotPath('phoenix-megaways') },
    { group: 'Slots', icon: 'slots-mansion', label: 'Mansion Megaways', path: slotPath('mansion-megaways') },
    { group: 'Slots', icon: 'slots-ronin', label: 'Ghostblade Strike', path: slotPath('ghostblade-strike') },
    { group: 'Slots', icon: 'slots-iron', label: 'Iron Fist', path: slotPath('iron-fist') },
    { group: 'Slots', icon: 'slots-coop', label: 'Coop Cluck', path: slotPath('coop-cluck') },
    { group: 'Slots', icon: 'slots-spirit', label: 'Miko Spirit', path: slotPath('miko-spirit') },
    { group: 'Slots', icon: 'slots-forge', label: 'Forge Anvil', path: slotPath('forge-anvil') },
    { group: 'Slots', icon: 'slots-gummy', label: 'Gummy Drops', path: slotPath('gummy-drops') },

    { group: 'Tables', icon: 'roulette', label: 'Roulette', path: '/roulette' },
    { group: 'Tables', icon: 'blackjack', label: 'Blackjack', path: '/blackjack' },
    { group: 'Tables', icon: 'baccarat', label: 'Baccarat', path: '/baccarat' },
    { group: 'Tables', icon: 'war', label: 'Casino War', path: '/war' },
    { group: 'Tables', icon: 'sicbo', label: 'Sic Bo', path: '/sicbo' },

    { group: 'Cards', icon: 'videopoker', label: 'Video Poker', path: '/videopoker' },
    { group: 'Cards', icon: 'hilo', label: 'Hi-Lo Cards', path: '/hilo' },

    { group: 'Arcade', icon: 'arcade-cases', label: 'Cases', path: '/cases' },
    { group: 'Arcade', icon: 'arcade-drill', label: 'Drill', path: '/drill' },
    { group: 'Arcade', icon: 'arcade-packs', label: 'Packs', path: '/packs' },
    { group: 'Arcade', icon: 'arcade-tome', label: 'Tome of Life', path: '/tomeoflife' },
    { group: 'Arcade', icon: 'arcade-tarot', label: 'Tarot', path: '/tarot' },
    { group: 'Arcade', icon: 'arcade-flip', label: 'Flip', path: '/flip' },
    { group: 'Arcade', icon: 'arcade-diamonds', label: 'Diamonds', path: '/diamonds' },
    { group: 'Arcade', icon: 'arcade-darts', label: 'Darts', path: '/darts' },
    { group: 'Arcade', icon: 'arcade-pump', label: 'Pump', path: '/pump' },
    { group: 'Arcade', icon: 'arcade-slide', label: 'Slide', path: '/slide' },
    { group: 'Arcade', icon: 'arcade-moles', label: 'Moles', path: '/moles' },
    { group: 'Arcade', icon: 'arcade-snakes', label: 'Snakes', path: '/snakes' },
    { group: 'Arcade', icon: 'arcade-collection', label: 'Collections', path: '/collections' },
]

// ---- SVG glyphs (24x24 viewBox). Wave 23 expansion: per-template slot
// glyphs and unique arcade glyphs so icon-only collapse stays distinct. ----
const icons = {
    ...sidebarPaths,

    // games (legacy keys)
    crash:       <path d="M14 2h7v7l-3-3-5 5-3-3-7 7L2 13l9-9 3 3 0 -5z" />,
    plinko:      <path d="M12 3 4 17h16L12 3zm0 4 5.5 9.5h-11L12 7zm-4 4 4 7 4-7M9 12h2M13 12h2" />,
    dino:        <path d="M19 10V8h-2V6h-2V4h-3v2H9v3H6v3H3v3h3v3h3v-3h6v3h3v-3h3v-3h-3v-2zM12 8h2v2h-2V8z" />,
    mines:       <path d="M12 2 1 22h22L12 2zm0 5 7 12H5l7-12zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />,
    dice:        <path d="M5 5h14v14H5V5zm3 3v2h2V8H8zm6 6v2h2v-2h-2zM8 14v2h2v-2H8zm6-6v2h2V8h-2zm-3 3v2h2v-2h-2z" />,
    limbo:       <path d="M5 19 19 5m-7-2a9 9 0 0 1 9 9h-2a7 7 0 1 0-7 7v2a9 9 0 0 1 0-18z" />,
    keno:        <path d="M3 5h6v6H3V5zm12 0h6v6h-6V5zM3 13h6v6H3v-6zm12 4 6-6m-6 0 6 6" />,
    wheel:       <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 0v12m6-6H6" />,
    roulette:    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 1a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />,
    blackjack:   <path d="M9 4h2l5 5v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2zm5 4V4l4 4h-4zm-3 2 2 5-2 1-2-1 2-5z" />,
    baccarat:    <path d="M5 5h6v6H5V5zm8 8h6v6h-6v-6zm-8 8 4-6 2 2-2 4H5zm14-16-4 6-2-2 2-4h4z" />,
    war:         <path d="m6 4 12 12-2 2-12-12 2-2zm12 0 2 2-12 12-2-2 12-12zM4 18l2-2 2 2-2 2-2-2zm14 0 2-2 2 2-2 2-2-2z" />,
    sicbo:       <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7zm-6-7v1m6 5v1m-6 7v1m6-5v1" />,
    videopoker:  <path d="M5 3h10l4 4v14H5V3zm10 0v4h4M8 11h2v6H8v-6zm4 0h4v6h-4v-6z" />,
    color:       <path d="M12 3a9 9 0 0 0 0 18 3 3 0 0 0 3-3v-1a2 2 0 0 1 2-2h1a3 3 0 0 0 3-3 9 9 0 0 0-9-9zm-5 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3-5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm5 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3 5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />,
    tower:       <path d="M6 3h12v4H6V3zm-2 6h16v4H4V9zm-2 6h20v6H2v-6z" />,
    chickencross:<path d="M5 3v2h14V3H5zM3 7h18v2H3V7zm0 4h18v2H3v-2zm0 4h18v2H3v-2zm0 4h18v2H3v-2z" />,
    lottery:     <path d="M3 7c1 0 2-1 2-2h14c0 1 1 2 2 2v10c-1 0-2 1-2 2H5c0-1-1-2-2-2V7zm3 2v6h12V9H6zm2 1h2v4H8v-4z" />,
    coinflip:    <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 3a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm-1 2v2H9v2h2v4h2v-4h2V8h-2V6h-2z" />,
    rps:         <path d="M6 6a2 2 0 0 1 2-2 2 2 0 0 1 2 2v6h0v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a1 1 0 0 1 1-1 1 1 0 0 1 1 1zM14 4l4 8-2 2 4 4-2 2-4-4-2 2-4-8 6-6z" />,
    guess:       <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 13h2v2h-2v-2zm0-9a3 3 0 0 1 3 3c0 2-3 2-3 5h-2c0-3 3-3 3-5a1 1 0 0 0-1-1 1 1 0 0 0-1 1H9a3 3 0 0 1 3-3z" />,
    hilo:        <path d="M5 4h6v8H5V4zm2 2v4h2V6H7zm6-2h6v8h-6V4zm2 2v4h2V6h-2zM5 14h6v8H5v-8zm2 2v4h2v-4H7zm6-2h6v8h-6v-8zm2 2v4h2v-4h-2z" />,
    poker:       <path d="M12 2a4 4 0 0 0-4 4c0 2 1 3 2 4-2 0-4 1-4 4 0 2 2 4 4 4 1 0 2 0 2-1l-1 5h2l-1-5c0 1 1 1 2 1 2 0 4-2 4-4 0-3-2-4-4-4 1-1 2-2 2-4a4 4 0 0 0-4-4z" />,

    // Wave 23: per-skin slot glyphs (theme cues — vault, river, west, mythic, etc.)
    'slots-vault':   <path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm6 1a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-1 4v0h2v0h-2zm-1 4 0 2 4 0 0-2-4 0z" />,
    'slots-river':   <path d="M3 8c2 0 2 2 5 2s3-2 6-2 4 2 7 2v2c-3 0-4-2-7-2s-3 2-6 2-3-2-5-2V8zm0 6c2 0 2 2 5 2s3-2 6-2 4 2 7 2v2c-3 0-4-2-7-2s-3 2-6 2-3-2-5-2v-2z" />,
    'slots-west':    <path d="M12 2 6 6v3l3 1v3l-2 6h10l-2-6v-3l3-1V6l-6-4zm-2 7v3h4V9h-4z" />,
    'slots-mythic':  <path d="M12 2 9 9 2 9.3l5.5 4.4L5.5 21 12 17.5 18.5 21l-2-7.3L22 9.3 15 9 12 2zm0 4 1.8 4 4.2 0.4-3.3 2.7L16 16l-4-2-4 2 1.3-3 -3.3-2.7 4.2-0.4L12 6z" />,
    'slots-rock':    <path d="M9 3v8a3 3 0 1 0 2 3V6h7V4l-9-1zm-3 11a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm12 2a3 3 0 1 0 0 4 3 3 0 0 0 0-4z" />,
    'slots-scarab':  <path d="M12 2c-2 0-3 1-3 3v1H6L4 8l1 2h3v2H6l-2 2 2 3 4-2 2 4 2-4 4 2 2-3-2-2h-2v-2h3l1-2-2-2h-3V5c0-2-1-3-3-3z" />,
    'slots-bars':    <path d="M4 4h4v16H4V4zm6 0h4v16h-4V4zm6 0h4v16h-4V4z" />,
    'slots-samurai': <path d="m4 4 16 16-2 2-3-3-2 2-1-1 2-2L4 6V4zm12 0h4v4l-3 3-3-3 2-2-2-2 2 0z" />,
    'slots-wanted':  <path d="M5 3h14v18H5V3zm2 3v3h10V6H7zm0 5v6h10v-6H7zm2 1h6v1H9v-1zm0 2h6v1H9v-1z" />,
    'slots-olympus': <path d="M12 2 5 9h3v11h8V9h3l-7-7zm-2 9h4v9h-4v-9z" />,
    'slots-bayou':   <path d="M3 14c4-4 8 0 14-3l4 3-3 2c-4 0-8 4-12 0-2-1-3-2-3-2zm9-2 1 1 1-1-1-1-1 1z" />,
    'slots-mummy':   <path d="M8 3h8a2 2 0 0 1 2 2v3h-3v3h3v3h-3v3h3v2H6v-2h3v-3H6v-3h3V8H6V5a2 2 0 0 1 2-2zm1 5h6v0H9v0z" />,
    'slots-phoenix': <path d="M12 2c2 3 4 5 4 8 0 2-2 4-4 4s-4-2-4-4c0-3 2-5 4-8zm0 12c-3 0-6 2-6 5l4-1 2 4 2-4 4 1c0-3-3-5-6-5z" />,
    'slots-mansion': <path d="M3 21V11l9-7 9 7v10h-6v-7H9v7H3zm5-12 4-3 4 3v2H8V9z" />,
    'slots-ronin':   <path d="M12 2 4 8l3 1-1 6h2l1-3 3 3 3-3 1 3h2l-1-6 3-1-8-6zm-2 14v3h4v-3h-4z" />,
    'slots-iron':    <path d="M5 4h14v6H5V4zm0 8h14v8H5v-8zm2 2v4h10v-4H7zm2-7v3h6V7H9z" />,
    'slots-coop':    <path d="M9 3a3 3 0 0 1 6 0v1l3 3-2 2v3h2v8H6v-8h2v-3L6 7l3-3V3zm2 1v1h2V4h-2z" />,
    'slots-spirit':  <path d="M12 3a4 4 0 0 1 4 4v3h2v3l-2 1v3l-2-1-2 2-2-2-2 1v-3l-2-1V10h2V7a4 4 0 0 1 4-4zm-1 5v2h2V8h-2z" />,
    'slots-forge':   <path d="M3 19h18v2H3v-2zm5-4 4-10h2l4 10h-2l-1-3h-4l-1 3H8zm3-5h2l-1-3-1 3z" />,
    'slots-gummy':   <path d="M12 3c-4 0-7 2-7 5v8c0 3 3 5 7 5s7-2 7-5V8c0-3-3-5-7-5zm0 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm-3 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />,

    // Wave 23: arcade glyphs
    'arcade-cases':      <path d="M4 7l8-3 8 3v3l-8 3-8-3V7zm0 5 8 3 8-3v6l-8 3-8-3v-6z" />,
    'arcade-drill':      <path d="M3 8h6v8H3V8zm6 1h4v6H9V9zm4 1h4v4h-4v-4zm4 1h3v2h-3v-2z" />,
    'arcade-packs':      <path d="M4 8l8-4 8 4v8l-8 4-8-4V8zm8-2L6 9l6 3 6-3-6-3zm-7 4v6l6 3v-6L5 10zm14 0-6 3v6l6-3v-6z" />,
    'arcade-tome':       <path d="M5 3h10a4 4 0 0 1 4 4v14H8a3 3 0 0 1-3-3V3zm0 16a1 1 0 0 0 1 1h11v-2H6a1 1 0 0 0-1 1zM7 5v11h10V5H7z" />,
    'arcade-tarot':      <path d="M6 3h12v18H6V3zm2 2v14h8V5H8zm2 3 2 3 2-3-2-3-2 3zm0 4h4v4h-4v-4z" />,
    'arcade-flip':       <path d="M12 2a10 10 0 1 0 7 17l-1.5-1.5A8 8 0 1 1 19 12c0 4-3 7-7 7v2a10 10 0 0 0 0-19zm-1 5h2v6h-2V7zm0 7h2v2h-2v-2z" />,
    'arcade-diamonds':   <path d="M12 2 4 9l8 13 8-13-8-7zm0 4 5 4-5 8-5-8 5-4z" />,
    'arcade-darts':      <path d="M12 2a10 10 0 1 0 10 10h-3a7 7 0 1 1-7-7V2zm0 4a6 6 0 1 0 6 6h-2a4 4 0 1 1-4-4V6zm0 3a3 3 0 1 0 3 3h-1a2 2 0 1 1-2-2V9zM18 4l4 4h-4V4z" />,
    'arcade-pump':       <path d="M5 21h14v-3l-3-2v-2l3-1v-2l-3-2V8H8v1L5 11v2l3 1v2l-3 2v3zm5-9h4v3h-4v-3z" />,
    'arcade-slide':      <path d="M3 13l9-9 4 4-9 9H3v-4zm12-8 4 4-2 2-4-4 2-2zm-9 12 14 0v3H6v-3z" />,
    'arcade-moles':      <path d="M12 2a5 5 0 0 0-5 5v3l-3 5h4v3a4 4 0 0 0 8 0v-3h4l-3-5V7a5 5 0 0 0-5-5zm-2 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />,
    'arcade-snakes':     <path d="M3 6c0-1 1-2 2-2h6a2 2 0 1 1 0 4H6a2 2 0 0 0 0 4h12a4 4 0 0 1 0 8h-6a2 2 0 1 1 0-4h6a2 2 0 0 0 0-4H6a4 4 0 0 1-3-6z" />,
    'arcade-collection': <path d="M5 3h11l3 3v15H5V3zm2 2v14h10V8h-3V5H7zm2 5h6v2H9v-2zm0 4h6v2H9v-2z" />,

    // generic slots fallback (unchanged)
    slots:       <path d="M3 5h18v14H3V5zm3 3v8h3V8H6zm6 0v8h3V8h-3zm6 0v8h0V8h0zM5 7h2v2H5V7zm6 0h2v2h-2V7zm6 0h2v2h-2V7z" />,
}

function GameRow({ item, isPinned, onPinToggle }) {
    return (
        <div className="nav-row">
            <NavLink
                to={item.path}
                title={item.label}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
                <span className="nav-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icons[item.icon] || icons.dice}</svg>
                </span>
                <span>{item.label}</span>
            </NavLink>
            <button
                type="button"
                className={`nav-pin ${isPinned ? 'is-pinned' : ''}`}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPinToggle(item.path) }}
                title={isPinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
                aria-label={isPinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
            >
                {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
            </button>
        </div>
    )
}

function CasinoSidebar({ search, setSearch }) {
    const { pins, isPinned: hookIsPinned, togglePin } = useSidebarPins()
    const groupedGames = useMemo(() => {
        const q = search.trim().toLowerCase()
        const filtered = q ? gameItems.filter(item => item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q)) : gameItems
        return filtered.reduce((acc, item) => {
            if (!acc[item.group]) acc[item.group] = []
            acc[item.group].push(item)
            return acc
        }, {})
    }, [search])

    const pinnedItems = useMemo(() => (
        pins
            .map(path => gameItems.find(g => g.path === path))
            .filter(Boolean)
    ), [pins])

    return (
        <>
            {navSections.map(section => (
                <div key={section.title} className="nav-section compact">
                    <h3 className="nav-title">{section.title}</h3>
                    {section.items.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            title={item.label}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        >
                            <span className="nav-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icons[item.icon] || icons.home}</svg>
                            </span>
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </div>
            ))}

            <div className="nav-section compact">
                <h3 className="nav-title">Utility</h3>
                {sidebarActions.map((action) => (
                    <button
                        key={action.label}
                        type="button"
                        className="nav-item nav-item-action"
                        title={action.label}
                        onClick={action.onClick}
                    >
                        <span className="nav-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icons[action.icon] || icons.chat}</svg>
                        </span>
                        <span>{action.label}</span>
                    </button>
                ))}
            </div>

            <div className="nav-section">
                <h3 className="nav-title">Games</h3>
                <label className="nav-game-search">
                    <span>Search games</span>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Crash, poker, cards..." />
                </label>

                {pinnedItems.length > 0 && !search.trim() && (
                    <details className="nav-game-group" open>
                        <summary>Pinned<b>{pinnedItems.length}</b></summary>
                        {pinnedItems.map(item => (
                            <GameRow
                                key={`pinned-${item.path}-${item.label}`}
                                item={item}
                                isPinned
                                onPinToggle={togglePin}
                            />
                        ))}
                    </details>
                )}

                {Object.entries(groupedGames).map(([group, items]) => (
                    <details key={group} className="nav-game-group" open={group === 'Featured' || group === 'Slots' || search.trim()}>
                        <summary>{group}<b>{items.length}</b></summary>
                        {items.map((item) => (
                            <GameRow
                                key={`${group}-${item.label}-${item.path}`}
                                item={item}
                                isPinned={hookIsPinned(item.path)}
                                onPinToggle={togglePin}
                            />
                        ))}
                    </details>
                ))}
            </div>
        </>
    )
}

function SportsbookSidebar() {
    return (
        <>
            <div className="nav-section compact">
                <h3 className="nav-title">Sportsbook</h3>
                {sportsViews.map(view => (
                    <NavLink
                        key={view.id}
                        to={sportsbookPathForView({ view: view.view })}
                        end={view.view === 'home'}
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        title={view.label}
                    >
                        <span className="nav-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icons[view.icon] || icons.sports}</svg>
                        </span>
                        <span>{view.label}</span>
                    </NavLink>
                ))}
            </div>

            <div className="nav-section compact">
                <h3 className="nav-title">Top Sports</h3>
                {sportsTopList.map(sport => (
                    <NavLink
                        key={sport.id}
                        to={sportsbookPathForView({ view: 'sport', sportId: sport.id })}
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        title={sport.label}
                    >
                        <span className="nav-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icons[sport.icon] || icons.sports}</svg>
                        </span>
                        <span>{sport.label}</span>
                    </NavLink>
                ))}
            </div>

            <div className="nav-section compact">
                <h3 className="nav-title">Esports</h3>
                {sportsEsports.map(sport => (
                    <NavLink
                        key={sport.id}
                        to={sportsbookPathForView({ view: 'sport', sportId: sport.id })}
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        title={sport.label}
                    >
                        <span className="nav-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icons[sport.icon] || icons.esports}</svg>
                        </span>
                        <span>{sport.label}</span>
                    </NavLink>
                ))}
            </div>

            <div className="nav-section compact">
                <h3 className="nav-title">Account</h3>
                <NavLink to="/race" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Race">
                    <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icons.race}</svg></span>
                    <span>Race</span>
                </NavLink>
                <NavLink to="/activity" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Activity">
                    <span className="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icons.activity}</svg></span>
                    <span>Activity</span>
                </NavLink>
            </div>

            <div className="nav-section compact">
                <h3 className="nav-title">Utility</h3>
                {sidebarActions.map((action) => (
                    <button
                        key={action.label}
                        type="button"
                        className="nav-item nav-item-action"
                        title={action.label}
                        onClick={action.onClick}
                    >
                        <span className="nav-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icons[action.icon] || icons.chat}</svg>
                        </span>
                        <span>{action.label}</span>
                    </button>
                ))}
            </div>
        </>
    )
}

function Sidebar({ isOpen, toggleSidebar }) {
    const [gameSearch, setGameSearch] = useState('')
    const location = useLocation()
    const isSportsRoute = location.pathname.startsWith('/sportsbook') || location.pathname.startsWith('/sports')

    return (
        <aside className={`app-sidebar ${!isOpen ? 'app-sidebar-hidden' : ''} ${isSportsRoute ? 'app-sidebar-sports' : 'app-sidebar-casino'}`} data-ux-surface="shell">
            <div className="sidebar-header">
                <button className="icon-btn sidebar-toggle" onClick={toggleSidebar} aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'} title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 6h18v2H3V6m0 5h18v2H3v-2m0 5h18v2H3v-2z"></path></svg>
                </button>
                <div className="sidebar-switcher">
                    <NavLink to="/" end className={({ isActive }) => `switch-btn ${isActive || (!isSportsRoute) ? 'active' : ''}`}>
                        Games
                    </NavLink>
                    <NavLink to="/sportsbook" className={() => `switch-btn ${isSportsRoute ? 'active' : ''}`}>
                        Sports
                    </NavLink>
                </div>
            </div>

            <nav className="sidebar-nav">
                {isSportsRoute
                    ? <SportsbookSidebar />
                    : <CasinoSidebar search={gameSearch} setSearch={setGameSearch} />}
            </nav>
        </aside>
    )
}

export default Sidebar
