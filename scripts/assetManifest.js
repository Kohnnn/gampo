// Manifest of bitmap assets for GamPo. Generated via 9Router image API.
// Each entry: { name, dir, prompt, size, model? }
// Run `node scripts/genAssets.js` (with NINEROUTER_URL/NINEROUTER_KEY set) to materialize.
//
// Style guard kept short and consistent so all assets share GamPo aesthetic:
const STYLE = 'casino UI asset, minimalism modern crypto-casino aesthetic, soft 3D render, centered subject, transparent background, clean edges, vibrant accent lighting, no text, no logos, no real brand marks, dark navy or transparent backdrop, no copyrighted characters'

const sq = '1024x1024'
const wide = '1792x1024'

export const assetManifest = [
    // === Lobby & promo banners ===
    { name: 'hero-originals', dir: 'lobby', size: wide, prompt: `Wide casino lobby hero banner showing abstract neon dice, plinko pegs, and crash rocket trail, GamPo aesthetic. ${STYLE}` },
    { name: 'hero-tables', dir: 'lobby', size: wide, prompt: `Wide casino lobby hero banner showing roulette wheel and stack of glowing chips, GamPo aesthetic. ${STYLE}` },
    { name: 'hero-arcade', dir: 'lobby', size: wide, prompt: `Wide casino lobby hero banner with playful neon arcade icons (coin, RPS hands, chicken silhouette), GamPo aesthetic. ${STYLE}` },
    { name: 'hero-slots', dir: 'lobby', size: wide, prompt: `Wide casino lobby hero banner showing abstract glowing slot symbols (gems, sevens) on dark gradient, GamPo aesthetic. ${STYLE}` },
    { name: 'hero-poker', dir: 'lobby', size: wide, prompt: `Wide casino lobby hero banner showing felt poker table with neon green light, glossy chips, abstract card shapes. ${STYLE}` },
    { name: 'promo-edge', dir: 'promo', size: sq, prompt: `Square promo banner: glowing scale balancing house edge vs probability, neon green accents. ${STYLE}` },
    { name: 'promo-race', dir: 'promo', size: sq, prompt: `Square promo banner: stylized podium with gold/silver/bronze ribbons, abstract motion lines. ${STYLE}` },
    { name: 'promo-verify', dir: 'promo', size: sq, prompt: `Square promo banner: glowing shield with hex pattern, indicating provably fair. ${STYLE}` },
    { name: 'promo-sports', dir: 'promo', size: sq, prompt: `Square promo banner: abstract stadium silhouette with floating odds numbers, blue glow. ${STYLE}` },

    // === Ambient backdrops ===
    { name: 'backdrop-felt-green', dir: 'backdrops', size: wide, prompt: `Wide deep-green casino felt texture with subtle radial gradient and soft vignette, seamless tile, no pattern. ${STYLE}` },
    { name: 'backdrop-felt-navy', dir: 'backdrops', size: wide, prompt: `Wide dark navy casino felt texture with subtle radial gradient, seamless tile. ${STYLE}` },
    { name: 'backdrop-neon-grid', dir: 'backdrops', size: wide, prompt: `Wide cyberpunk neon grid floor seen in perspective, magenta and cyan glow lines on dark navy, casino arcade. ${STYLE}` },
    { name: 'backdrop-stars', dir: 'backdrops', size: wide, prompt: `Wide deep-space starfield with subtle nebula gradient, dark navy. ${STYLE}` },
    { name: 'backdrop-parchment', dir: 'backdrops', size: wide, prompt: `Wide ancient mythic parchment texture with gold frame edges, fantasy slot backdrop. ${STYLE}` },

    // === Chips ===
    { name: 'chip-1', dir: 'chips', size: sq, prompt: `Single casino chip with green rim and "1" engraved, glossy 3D render, transparent background. ${STYLE}` },
    { name: 'chip-5', dir: 'chips', size: sq, prompt: `Single casino chip with red rim and "5" engraved, glossy 3D render, transparent background. ${STYLE}` },
    { name: 'chip-25', dir: 'chips', size: sq, prompt: `Single casino chip with blue rim and "25" engraved, glossy 3D render, transparent background. ${STYLE}` },
    { name: 'chip-100', dir: 'chips', size: sq, prompt: `Single casino chip with black rim and "100" engraved, glossy 3D render, transparent background. ${STYLE}` },
    { name: 'chip-500', dir: 'chips', size: sq, prompt: `Single casino chip with purple rim and "500" engraved, glossy 3D render, transparent background. ${STYLE}` },
    { name: 'chip-stack', dir: 'chips', size: sq, prompt: `Tall stack of mixed casino chips (green, red, blue, black, purple), glossy 3D render. ${STYLE}` },
    { name: 'chip-tower', dir: 'chips', size: sq, prompt: `Tall thin tower of glossy stacked chips, vertical orientation, casino UI. ${STYLE}` },

    // === Cards ===
    // GamPo-branded card back. Single design used across all card games.
    { name: 'card-back', dir: 'cards', size: sq, prompt: `Single playing card back, dark navy with neon green geometric pattern, centered glowing minimalist "G" monogram emblem (no other text), soft glow border, isolated card shape with rounded corners. Professional minimalist design, no other text or characters. ${STYLE}` },
    { name: 'card-blank', dir: 'cards', size: sq, prompt: `Plain white playing card front face with rounded corners, soft drop shadow, isolated, ready for overlay text. ${STYLE}` },
    // 13x4 card sprite atlas. Single sheet, sliced via CSS background-position.
    { name: 'card-atlas', dir: 'cards', size: '1792x1024', prompt: `Playing card sprite sheet: 13 columns by 4 rows, each cell shows one playing card front (Ace through King in Spades, Hearts, Diamonds, Clubs). Minimalist modern professional design, white card faces, large bold rank in top-left and bottom-right (rotated), centered suit pip, red hearts and diamonds, black spades and clubs, soft drop shadow, transparent background between cards, even spacing. No deviation from standard 52-card layout. ${STYLE}` },
    { name: 'card-suit-spade', dir: 'cards', size: sq, prompt: `Spade suit symbol on glossy card, isolated, professional minimalist. ${STYLE}` },
    { name: 'card-suit-heart', dir: 'cards', size: sq, prompt: `Heart suit symbol on glossy card, isolated, professional minimalist. ${STYLE}` },
    { name: 'card-suit-diamond', dir: 'cards', size: sq, prompt: `Diamond suit symbol on glossy card, isolated, professional minimalist. ${STYLE}` },
    { name: 'card-suit-club', dir: 'cards', size: sq, prompt: `Club suit symbol on glossy card, isolated, professional minimalist. ${STYLE}` },

    // === Dice ===
    { name: 'dice-set', dir: 'dice', size: sq, prompt: `Three white casino dice tumbling, glossy 3D render, isolated. ${STYLE}` },
    { name: 'dice-atlas', dir: 'dice', size: wide, prompt: `Six casino dice in a row showing pips 1 through 6, white dice with rounded corners, black pips, glossy 3D render, transparent background, evenly spaced. ${STYLE}` },

    // === Wheel & roulette ===
    { name: 'wheel-rim', dir: 'wheel', size: sq, prompt: `Casino spinning wheel rim, brushed brass with colored segments alternating green and red and gold, top-down view, isolated. ${STYLE}` },
    { name: 'roulette-wheel', dir: 'roulette', size: sq, prompt: `European single-zero roulette wheel from above, polished wood and brass, deep felt center, isolated. ${STYLE}` },
    { name: 'roulette-ball', dir: 'roulette', size: sq, prompt: `Small white ivory ball with subtle highlight, isolated, transparent background. ${STYLE}` },
    { name: 'roulette-felt', dir: 'roulette', size: wide, prompt: `Wide green casino roulette felt betting layout texture, seamless, top-down. ${STYLE}` },

    // === Mines ===
    { name: 'gem-green', dir: 'mines', size: sq, prompt: `Faceted green gem with neon glow, isolated, casino UI. ${STYLE}` },
    { name: 'gem-blue', dir: 'mines', size: sq, prompt: `Faceted blue gem with neon glow, isolated, casino UI. ${STYLE}` },
    { name: 'gem-purple', dir: 'mines', size: sq, prompt: `Faceted purple gem with neon glow, isolated, casino UI. ${STYLE}` },
    { name: 'gem-pink', dir: 'mines', size: sq, prompt: `Faceted pink gem with neon glow, isolated, casino UI. ${STYLE}` },
    { name: 'bomb', dir: 'mines', size: sq, prompt: `Cartoon round black bomb with lit fuse, isolated, casino UI. ${STYLE}` },
    { name: 'bomb-explosion', dir: 'mines', size: sq, prompt: `Bright orange and red explosion burst, transparent background. ${STYLE}` },
    { name: 'mines-tile', dir: 'mines', size: sq, prompt: `Glossy navy ceramic tile with neon green underglow, square with rounded corners, top-down. ${STYLE}` },

    // === Plinko ===
    { name: 'plinko-ball', dir: 'plinko', size: sq, prompt: `Glowing green plinko ball with subtle motion blur trail, isolated. ${STYLE}` },
    { name: 'plinko-peg', dir: 'plinko', size: sq, prompt: `Single chrome peg dot, glossy, isolated. ${STYLE}` },

    // === Crash ===
    { name: 'crash-rocket', dir: 'crash', size: sq, prompt: `Sleek pixel-perfect rocket pointing up-right with vibrant exhaust, isolated, glossy 3D. ${STYLE}` },
    { name: 'crash-trail', dir: 'crash', size: sq, prompt: `Long exhaust trail particle texture, orange to yellow gradient, isolated. ${STYLE}` },

    // === Tower ===
    { name: 'tower-tile', dir: 'tower', size: sq, prompt: `Single neon green tile glowing, isolated, casino UI. ${STYLE}` },
    { name: 'tower-broken', dir: 'tower', size: sq, prompt: `Broken cracked tile with red glow, isolated, casino UI. ${STYLE}` },

    // === Chicken Cross ===
    { name: 'chicken-idle', dir: 'chicken', size: sq, prompt: `Cute cartoon chicken character standing, friendly mascot, isolated, transparent background, casino-game art. ${STYLE}` },
    { name: 'chicken-hop', dir: 'chicken', size: sq, prompt: `Cute cartoon chicken mid-hop with motion lines, isolated, transparent background, casino-game art. ${STYLE}` },
    { name: 'chicken-splat', dir: 'chicken', size: sq, prompt: `Cute cartoon chicken with comical defeated expression and tire mark, isolated, transparent background, casino-game art. ${STYLE}` },
    { name: 'road-tile', dir: 'chicken', size: sq, prompt: `Top-down road lane with dashed yellow line, asphalt texture, square tileable. ${STYLE}` },
    { name: 'car-silhouette', dir: 'chicken', size: sq, prompt: `Top-down stylized casino car silhouette in red, isolated, transparent background. ${STYLE}` },

    // === Slot symbols (Classic) ===
    { name: 'slot-classic-7', dir: 'slots/classic', size: sq, prompt: `Bright red number 7 with chrome highlights, lucky-seven slot icon, isolated. ${STYLE}` },
    { name: 'slot-classic-bar', dir: 'slots/classic', size: sq, prompt: `Triple BAR slot icon, gold and red, isolated. ${STYLE}` },
    { name: 'slot-classic-cherry', dir: 'slots/classic', size: sq, prompt: `Pair of glossy red cherries with green stem, slot icon, isolated. ${STYLE}` },
    { name: 'slot-classic-bell', dir: 'slots/classic', size: sq, prompt: `Golden bell slot icon, glossy, isolated. ${STYLE}` },
    { name: 'slot-classic-coin', dir: 'slots/classic', size: sq, prompt: `Stack of glossy gold coins, slot icon, isolated. ${STYLE}` },
    { name: 'slot-classic-blank', dir: 'slots/classic', size: sq, prompt: `Subtle dim blank slot symbol with faint dot, isolated. ${STYLE}` },

    // === Slot symbols (Cyber) ===
    { name: 'slot-cyber-core', dir: 'slots/cyber', size: sq, prompt: `Glowing cyberpunk magenta core orb with hex pattern, slot icon, isolated. ${STYLE}` },
    { name: 'slot-cyber-chip', dir: 'slots/cyber', size: sq, prompt: `Cyan microchip with circuit lines, slot icon, isolated. ${STYLE}` },
    { name: 'slot-cyber-wave', dir: 'slots/cyber', size: sq, prompt: `Stylized teal sound wave glyph, slot icon, isolated. ${STYLE}` },
    { name: 'slot-cyber-node', dir: 'slots/cyber', size: sq, prompt: `Orange network node hub, slot icon, isolated. ${STYLE}` },
    { name: 'slot-cyber-data', dir: 'slots/cyber', size: sq, prompt: `Stylized data cube with binary glow, slot icon, isolated. ${STYLE}` },
    { name: 'slot-cyber-blank', dir: 'slots/cyber', size: sq, prompt: `Subtle dim blank cyber slot symbol with faint hex outline, isolated. ${STYLE}` },

    // === Slot symbols (Mythic) ===
    { name: 'slot-mythic-rune', dir: 'slots/mythic', size: sq, prompt: `Glowing golden rune stone, fantasy slot icon, isolated. ${STYLE}` },
    { name: 'slot-mythic-orb', dir: 'slots/mythic', size: sq, prompt: `Purple magic orb with sparkles, fantasy slot icon, isolated. ${STYLE}` },
    { name: 'slot-mythic-sword', dir: 'slots/mythic', size: sq, prompt: `Silver fantasy sword icon, slot symbol, isolated. ${STYLE}` },
    { name: 'slot-mythic-shield', dir: 'slots/mythic', size: sq, prompt: `Green emblem shield, fantasy slot icon, isolated. ${STYLE}` },
    { name: 'slot-mythic-leaf', dir: 'slots/mythic', size: sq, prompt: `Golden leaf with vine flourish, fantasy slot icon, isolated. ${STYLE}` },
    { name: 'slot-mythic-blank', dir: 'slots/mythic', size: sq, prompt: `Subtle dim mythic blank slot symbol with faint vine wisp, isolated. ${STYLE}` },

    // === Coin flip ===
    { name: 'coin-heads', dir: 'coin', size: sq, prompt: `Casino coin showing crowned eagle heads, gold metal, isolated. ${STYLE}` },
    { name: 'coin-tails', dir: 'coin', size: sq, prompt: `Casino coin showing fancy ornamental tails design, gold metal, isolated. ${STYLE}` },

    // === RPS ===
    { name: 'rps-rock', dir: 'rps', size: sq, prompt: `Stylized neon rock fist icon for rock-paper-scissors, isolated. ${STYLE}` },
    { name: 'rps-paper', dir: 'rps', size: sq, prompt: `Stylized neon paper hand icon for rock-paper-scissors, isolated. ${STYLE}` },
    { name: 'rps-scissors', dir: 'rps', size: sq, prompt: `Stylized neon scissors hand icon for rock-paper-scissors, isolated. ${STYLE}` },

    // === Lottery ===
    { name: 'lottery-ball', dir: 'lottery', size: sq, prompt: `Glossy lottery draw ball with painted number, multiple colors, isolated. ${STYLE}` },
    { name: 'lottery-tumbler', dir: 'lottery', size: sq, prompt: `Glass lottery tumbler machine with balls, isolated, transparent background. ${STYLE}` },

    // === Sport crests ===
    { name: 'crest-soccer', dir: 'sports', size: sq, prompt: `Stylized soccer ball crest with neon ring, isolated, no text. ${STYLE}` },
    { name: 'crest-basketball', dir: 'sports', size: sq, prompt: `Stylized basketball crest with neon ring, isolated, no text. ${STYLE}` },
    { name: 'crest-tennis', dir: 'sports', size: sq, prompt: `Stylized tennis ball with racket crest, neon ring, isolated, no text. ${STYLE}` },
    { name: 'crest-hockey', dir: 'sports', size: sq, prompt: `Stylized hockey puck and crossed sticks crest, neon ring, isolated, no text. ${STYLE}` },
    { name: 'crest-f1', dir: 'sports', size: sq, prompt: `Stylized formula one car silhouette crest, neon ring, isolated, no text, no real team marks. ${STYLE}` },
    { name: 'crest-esports', dir: 'sports', size: sq, prompt: `Stylized esports controller crest, neon ring, isolated, no text. ${STYLE}` },
    { name: 'crest-nfl', dir: 'sports', size: sq, prompt: `Stylized american football crest with neon ring, isolated, no real team marks, no text. ${STYLE}` },
    { name: 'crest-mlb', dir: 'sports', size: sq, prompt: `Stylized baseball crest with crossed bats, neon ring, isolated, no real team marks, no text. ${STYLE}` },

    // === Poker ===
    { name: 'poker-felt', dir: 'poker', size: wide, prompt: `Wide poker table felt texture, dark green, soft radial vignette, brass border edge, top-down. ${STYLE}` },
    { name: 'poker-dealer-button', dir: 'poker', size: sq, prompt: `White poker dealer button puck with bold black "D", isolated, glossy. ${STYLE}` },
    { name: 'poker-blinds-sb', dir: 'poker', size: sq, prompt: `Small blind marker chip, navy with white "SB", isolated. ${STYLE}` },
    { name: 'poker-blinds-bb', dir: 'poker', size: sq, prompt: `Big blind marker chip, red with white "BB", isolated. ${STYLE}` },
    { name: 'poker-avatar-1', dir: 'poker', size: sq, prompt: `Generic stylized neutral poker avatar portrait, geometric minimalist, no real-person likeness, neon color palette. ${STYLE}` },
    { name: 'poker-avatar-2', dir: 'poker', size: sq, prompt: `Generic stylized neutral poker avatar portrait variant 2, geometric minimalist, neon color palette. ${STYLE}` },
    { name: 'poker-avatar-3', dir: 'poker', size: sq, prompt: `Generic stylized neutral poker avatar portrait variant 3, geometric minimalist, neon color palette. ${STYLE}` },
    { name: 'poker-avatar-4', dir: 'poker', size: sq, prompt: `Generic stylized neutral poker avatar portrait variant 4, geometric minimalist, neon color palette. ${STYLE}` },
    { name: 'poker-avatar-5', dir: 'poker', size: sq, prompt: `Generic stylized neutral poker avatar portrait variant 5, geometric minimalist, neon color palette. ${STYLE}` },

    // === Game-card thumbnails (HomePage category rows + GameGrid) ===
    // Portrait-ish 768x1024 keeps the aspect close to the existing 8 thumbnail images.
    { name: 'card-dice', dir: 'cards/games', size: '768x1024', prompt: `Vertical casino game card thumbnail for "Dice": glossy white casino dice rolling with neon teal trail and over/under range slider glow, no text, dark navy backdrop. ${STYLE}` },
    { name: 'card-limbo', dir: 'cards/games', size: '768x1024', prompt: `Vertical casino game card thumbnail for "Limbo": rocket-style multiplier rising into deep purple starfield, glowing target reticle, no text, dark navy backdrop. ${STYLE}` },
    { name: 'card-keno', dir: 'cards/games', size: '768x1024', prompt: `Vertical casino game card thumbnail for "Keno": grid of glowing numbered keno balls falling, gold and amber accents, no text, dark navy backdrop. ${STYLE}` },
    { name: 'card-wheel', dir: 'cards/games', size: '768x1024', prompt: `Vertical casino game card thumbnail for "Wheel": colorful spinning fortune wheel from above with pointer, neon segments, no text, dark navy backdrop. ${STYLE}` },
    { name: 'card-roulette', dir: 'cards/games', size: '768x1024', prompt: `Vertical casino game card thumbnail for "Roulette": European single-zero roulette wheel angled view, ivory ball, glossy 3D, no text, dark navy backdrop. ${STYLE}` },
    { name: 'card-blackjack', dir: 'cards/games', size: '768x1024', prompt: `Vertical casino game card thumbnail for "Blackjack": fanned playing cards Ace + King of spades on green felt, no text on cards, dark navy backdrop. ${STYLE}` },
    { name: 'card-slots', dir: 'cards/games', size: '768x1024', prompt: `Vertical casino game card thumbnail for "Slots": three glowing slot reels showing abstract sevens and bell symbols, neon gold accents, no text labels, dark navy backdrop. ${STYLE}` },
    { name: 'card-sicbo', dir: 'cards/games', size: '768x1024', prompt: `Vertical casino game card thumbnail for "Sic Bo": three white casino dice in glass tumbler with neon orange glow, top down view, no text, dark navy backdrop. ${STYLE}` },
    { name: 'card-baccarat', dir: 'cards/games', size: '768x1024', prompt: `Vertical casino game card thumbnail for "Baccarat": elegant pair of glossy playing cards on green felt with gold trim, abstract suit pips, no text, dark navy backdrop. ${STYLE}` },
    { name: 'card-videopoker', dir: 'cards/games', size: '768x1024', prompt: `Vertical casino game card thumbnail for "Video Poker": fanned five-card royal flush silhouette with neon green glow on dark felt, no rank text, dark navy backdrop. ${STYLE}` },
    { name: 'card-color', dir: 'cards/games', size: '768x1024', prompt: `Vertical casino game card thumbnail for "Color Pick": rainbow color wheel split into four quadrants with center pointer, glossy 3D, no text, dark navy backdrop. ${STYLE}` },
    { name: 'card-tower', dir: 'cards/games', size: '768x1024', prompt: `Vertical casino game card thumbnail for "Tower Climb": glowing stack of climbing tiles ascending into neon mist, multiplier ladder shape, no text, dark navy backdrop. ${STYLE}` },
    { name: 'card-lottery', dir: 'cards/games', size: '768x1024', prompt: `Vertical casino game card thumbnail for "Lottery Draw": glass lottery tumbler with multicolor numbered balls mid-tumble, gold rim, no text, dark navy backdrop. ${STYLE}` },
    { name: 'card-war', dir: 'cards/games', size: '768x1024', prompt: `Vertical casino game card thumbnail for "Casino War": two crossed playing-card backs in pink/magenta neon, dueling motif, no text, dark navy backdrop. ${STYLE}` },
    { name: 'card-chickencross', dir: 'cards/games', size: '768x1024', prompt: `Vertical casino game card thumbnail for "Chicken Cross": cute cartoon chicken hopping across glowing road lanes with multiplier columns, no text, dark navy backdrop. ${STYLE}` },
]

export const STYLE_GUARD = STYLE
