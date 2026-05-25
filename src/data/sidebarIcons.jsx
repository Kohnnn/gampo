// Sidebar SVG icon set (extracted from Sidebar.jsx in Wave 23 for reuse +
// tree-shaking). Icons are rendered as plain SVG path children — keep
// 24x24 viewBox semantics. Stroke + fill are set by the consumer.

import {
    Award,
    BarChart3,
    Compass,
    Coins,
    Flame,
    Gift,
    MessageCircle,
    Pin,
    Play,
    Sparkles,
    Trophy,
    User2,
} from 'lucide-react'

// Sidebar nav + game glyphs as SVG <path> JSX (consumer wraps in <svg>).
export const sidebarPaths = {
    // sidebar nav
    home:        <path d="M3 12 12 4l9 8v8a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-8z" />,
    originals:   <path d="M12 2 14.5 8.5 21 9.27 16 13.97l1.5 6.78L12 17.27 6.5 20.75 8 13.97 3 9.27l6.5-.77L12 2z" />,
    slotsLobby:  <path d="M3 6h18v12H3V6zm2 2v8h4V8H5zm6 0v8h2V8h-2zm4 0v8h4V8h-4z" />,
    live:        <path d="M5 6h14v10H5V6zm-2 12h18v2H3v-2zm6-9 5 4-5 4V9z" />,
    sports:      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4 3 2-1 4 3 2-3 2 1 4-3-2-3 2 1-4-3-2 3-2-1-4 3-2z" />,
    gift:        <path d="M20 8h-3.18a3 3 0 0 0-4.82-3 3 3 0 0 0-4.82 3H4v4h2v9h12v-9h2V8zm-9 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm2-2a1 1 0 1 1 2 0 1 1 0 0 1-2 0z" />,
    mission:     <path d="M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3zm-1 14-4-4 1.5-1.5L11 13l4.5-4.5L17 10l-6 6z" />,
    vip:         <path d="M5 16 3 6l5 3 4-7 4 7 5-3-2 10H5zm0 2h14v3H5v-3z" />,
    academy:     <path d="M12 3 1 9l11 6 9-4.91V17h2V9L12 3zm-7 9.18v4l7 3.82 7-3.82v-4l-7 3.82-7-3.82z" />,
    verify:      <path d="m9 16.2-3.5-3.5L4 14.2 9 19.2 20 8.2l-1.5-1.5L9 16.2z" />,
    race:        <path d="M5 4v6h2V8h2v8H6v2h12v-2h-3V8h2v2h2V4H5zm6 4v8h2V8h-2z" />,
    activity:    <path d="M3 12h4l2-7 4 14 2-7h6v2h-4l-3 9-4-14-1 5H3v-2z" />,
    pin:         <path d="M16 3 21 8l-3 1-2 5-4-4 5-2 1-3-2-2zm-4 8 4 4-1 6-2-1-2-7-3 3-2-2 6-3z" />,
    pinFilled:   <path d="M16 3 21 8l-3 1-2 5-4-4 5-2 1-3-2-2zm-4 8 4 4-1 6-2-1-2-7-3 3-2-2 6-3z" />,

    // utility actions
    chat:        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" />,
    pnl:         <path d="M3 17h4v4H3v-4zm6-6h4v10H9V11zm6-8h4v18h-4V3z" />,
    progress:    <path d="M12 2 9.6 7.5 4 8.3l4.1 3.9L7 18l5-2.6L17 18l-1.1-5.8L20 8.3l-5.6-.8L12 2z" />,

    // sportsbook nav
    radio:       <path d="M3.5 12c0-3.5 1.4-6.7 3.6-9l1.4 1.4C6.6 6.4 5.5 9 5.5 12s1.1 5.6 3 7.6l-1.4 1.4C4.9 18.7 3.5 15.5 3.5 12zm12 0c0 2-1.6 3.5-3.5 3.5S8.5 14 8.5 12s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5zm-3.5-2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM17 4.4c2.2 2.3 3.5 5.5 3.5 9s-1.3 6.7-3.5 9l-1.4-1.4c1.9-2 3-4.6 3-7.6s-1.1-5.6-3-7.6L17 4.4z" />,
    clock:       <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a1 1 0 0 1 1 1v5l4 2-1 1.7-5-2.5V7a1 1 0 0 1 1-1z" />,
    grid:        <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zm-9 9h7v7H4v-7zm9 0h7v7h-7v-7z" />,
    list:        <path d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h18v2H3v-2zM2 5h2v2H2V5zm0 6h2v2H2v-2zm0 6h2v2H2v-2z" />,
    soccer:      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3 5 3-1 5h-8L7 8l5-3zm-2 11h4l1 4-3 1-3-1 1-4z" />,
    tennis:      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2c2.5 0 4.7 1 6.4 2.6A8 8 0 0 0 14 12c0 2.2.9 4.2 2.4 5.4A8 8 0 0 1 12 20a8 8 0 0 1-4.4-1.6A8 8 0 0 0 10 12a8 8 0 0 0-4.4-7.4A8 8 0 0 1 12 4z" />,
    cricket:     <path d="m4 19 9-9 1 1-9 9-1-1zm10-10 5-5 2 2-5 5-2-2zm-1 1 2 2-2 2-2-2 2-2zm-7 7 2 2-1 1H5l-1-2 1-1z" />,
    basket:      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM4.5 8h15M4.5 16h15M12 4.5v15M5.6 5.6l12.8 12.8m0-12.8L5.6 18.4" />,
    hockey:      <path d="M3 17h12l4 3 1-2-3-2 2-2-2-2-3 2-2-2-3 2H3v3zm14-12h2v8h-2V5zm-2 0h-2v6h2V5z" />,
    baseball:    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM7 6c1.5 1 2 2.5 2 4s-.5 3-2 4l1 1c2-1 3-2.5 3-5s-1-4-3-5l-1 1zm10 0-1-1c-2 1-3 2.5-3 5s1 4 3 5l1-1c-1.5-1-2-2.5-2-4s.5-3 2-4z" />,
    football:    <path d="M12 2 7 7l-3 7 3 3 7-3 5-5 1-5-5-1-3-1zm0 4 4 2 1 4-2 4-4-2-1-4 2-4z" />,
    esports:     <path d="M3 9c0-1.7 1.3-3 3-3h12c1.7 0 3 1.3 3 3v6c0 1.7-1.3 3-3 3h-1l-2-2H8l-2 2H6c-1.7 0-3-1.3-3-3V9zm5 1v3M6 11h4M14 10v1M14 13v1M16 11.5v1M18 11.5v1" />,
    racing:      <path d="m3 18 4-2 6 2-2 4-4-1-4-3zm5-7 8-4 5 6-7 4-6-2-1-3 1-1zm5 1 2-1 1 1-1 1-2-1z" />,
    medal:       <path d="M7 4h10l-1 5h2l-3 4 1 6-5-3-5 3 1-6-3-4h2L7 4z" />,
    trophy:      <path d="M6 4h12v2h2v3a3 3 0 0 1-3 3h-1v1l1 4h2v3H7v-3h2l1-4v-1H9a3 3 0 0 1-3-3V6h0V4zm0 4v1a1 1 0 0 0 1 1h0V8H6zm12 0v2h0a1 1 0 0 0 1-1V8h-1z" />,

    // generic glyph fallback
    dot:         <circle cx="12" cy="12" r="3" />,
}

// lucide-react icon refs by key for non-path consumers (e.g. sportsbook).
export const sidebarLucide = {
    award: Award,
    barChart: BarChart3,
    compass: Compass,
    coins: Coins,
    flame: Flame,
    gift: Gift,
    chat: MessageCircle,
    pin: Pin,
    play: Play,
    sparkles: Sparkles,
    trophy: Trophy,
    user: User2,
}
