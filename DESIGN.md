# GamPo Design System

## 1. Atmosphere & Identity

GamPo is a dark fake-credit casino, sportsbook, arcade, slot, and progression simulator. The product feels like a real betting site but carries no real-money framing: all balances are local practice credits, all outcomes are deterministic educational simulations.

The signature is **tonal depth in darkness** -- the UI uses layered shades of teal-blue (`#1a2c38` primary, `#0f212e` secondary) separated by subtle tonal shifts and thin hairlines rather than large shadows. A single bright green accent (`#00e701`) marks every interactive CTA, active selection, and win state. The visual language targets a confident, high-density gaming dashboard: tight spacing, heavy font weights (800-950), uppercase labels, and gold-tinted celebration effects that read as earned progression rather than gambling hype.

## 2. Color

### Palette

All tokens are defined in `src/styles/index.css:6-82`. The palette is dark-only (no light mode).

| Role | Token | Value | Usage |
|------|-------|-------|-------|
| Surface/primary | `--bg-primary` | `#1a2c38` | Main background, app body |
| Surface/secondary | `--bg-secondary` | `#0f212e` | Sidebar, header, panels, game titlebar |
| Surface/tertiary | `--bg-tertiary` | `#2f4553` | Hover states, input wrappers, nav items, search background |
| Surface/input | `--bg-input` | `#0f212e` | Input fields, tab bars, players-info |
| Text/primary | `--text-primary` | `#ffffff` | Headlines, body, active labels |
| Text/secondary | `--text-secondary` | `#b1bad3` | Captions, hints, inactive nav, metadata |
| Text/muted | `--text-muted` | `#909cb0` | Placeholder, disabled, secondary data |
| Border/default | `--border-color` | `#2f4553` | Dividers, input outlines, card borders |
| Accent/primary | `--accent-green` | `#00e701` | CTAs, win states, active selections, logo accent |
| Accent/green-hover | `--accent-green-hover` | `#00c700` | Button hover |
| Accent/blue | `--accent-blue` | `#1475e1` | Demo/create buttons, credit buy-ins |
| Accent/orange | `--accent-orange` | `#f7931a` | Cashout buttons, credit icon gradient |
| Accent/yellow | `--accent-yellow` | `#ffc107` | Pin active state, status gradients |
| Accent/red | `--accent-red` | `#ed4245` | Loss states, stop buttons, errors |
| Accent/purple | `--accent-purple` | `#9c27b0` | Mega history pills, hot-bet pills |
| Bet marker | `--bet-marker` | `#6db7ff` | Active bet chips on game cells |
| Bet marker/soft | `--bet-marker-soft` | `rgba(109,183,255,0.18)` | Bet chip background tint |
| Bet marker/strong | `--bet-marker-strong` | `rgba(109,183,255,0.5)` | Bet chip highlight |
| Feature gold | `--feature-gold` | `#ffe680` | Big-win, jackpot, VIP/premium signals |
| Feature gold/soft | `--feature-gold-soft` | `rgba(255,207,90,0.18)` | Gold celebration backgrounds |
| Warn | `--warn` | `#ffcf5a` | Real warnings (cap reached, max bet exceeded) |
| Warn/soft | `--warn-soft` | `rgba(255,207,90,0.18)` | Warning background tint |
| Stage/bg | `--stage-bg` | `linear-gradient(180deg, #14242f, #0c151c)` | Game stage background |
| Stage/glow | `--stage-glow` | `rgba(120,200,255,0.14)` | Per-game stage accent glow |
| Tile/bg | `--tile-bg` | `rgba(0,0,0,0.34)` | Grid tiles, game cells |
| Tile/border | `--tile-border` | `rgba(255,255,255,0.07)` | Tile outline |
| Tile/radius | `--tile-radius` | `14px` | tile corner rounding |

**Per-game accent override**: The `--accent` token defaults to `#00e701` at root. GameShell sets a per-game accent on `.game-shell`. Slots set `--slot-accent` per skin/theme (18+ skins defined in `slots.css:414-432`).

**Color-role rules**:
- `--accent-green` is for CTAs, win states, and active UI. Never decorative.
- `--bet-marker` shades are for active bets and chips on game cells. Blue, neutral -- never green or gold.
- `--feature-gold` is for big-win, jackpot, and VIP/premium celebrations only.
- `--warn` is for real warnings (cap reached, max bet exceeded). Amber.
- The per-game `--accent` drives the play CTA, tab active state, and focus rings via `color-mix()`.

## 3. Typography

### Font Stack

- **Logo / display**: `'Dancing Script', cursive` -- weight 700, used only for the GamPo wordmark in header and sidebar.
- **Primary**: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` -- set as `--font-family` for all body and UI text.
- **Monospace**: `ui-monospace, SFMono-Regular, Menlo, monospace` -- used in FairnessDrawer, seed display, error messages.

### Scale

The codebase does not use a formal type scale table. The following sizes appear repeatedly:

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Hero / page title | 28px | 950 | Error/not-found pages |
| Logo | 32px (desktop), 26px (mobile) | 700 | Wordmark |
| Section title | 20px | 950 | Game titlebar heading |
| Card title | 16px | 900-950 | Panel headers, sheets |
| Body default | 14px | 600-800 | Bet input, buttons, nav items |
| Body small | 13px | 600-800 | Game labels, stat items, betting rows |
| Caption / label | 12px | 700-900 | Input labels, stat labels, uppercase headers |
| Overline / badge | 10-11px | 900-950 | All-uppercase section titles, game badges |
| Tiny | 9px | 800-900 | Bet rows meta, inline hints |
| Game multiplier | 64px (desktop), 48px (mobile) | 800 | Crash multiplier value |
| Bet button | 15px | 700 | Primary CTA text |

### Rules

- All body text is 14px minimum. 13px for secondary info.
- Captions and labels are frequently uppercase with `letter-spacing: 0.04em` to `0.12em`.
- Heavy font weights (800-950) are the norm for labels, headings, and buttons. The heaviest available weight in Inter is used for emphasis.
- No serif font is used outside the Dancing Script logo.

## 4. Spacing & Layout

### Base Unit

All spacing derives from a base of **4px**. Common values:

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Gap between pills, tab padding |
| --space-2 | 8px | Component gap, mobile edge padding |
| --space-3 | 12px | Game shell padding, titlebar padding, input padding |
| --space-4 | 16px | Header padding, card padding, panel padding |
| --space-5 | 20px | Chart container margin, credit dropdown padding |
| --space-6 | 24px | Generous section inner spacing |
| --space-8 | 32px | Separated groups, route fallback padding |

### Layout structure

- **App layout**: `.app-layout` flexbox: sidebar (240px) + main wrapper. Sidebar collapses to 60px via `.app-sidebar-hidden` or at `≤1200px`.
- **Header**: 60px fixed height. Flex layout with left (logo + mode), center (search), right (credit/actions).
- **Main content**: flex column, flex: 1, overflow hidden.
- **Game shell** (`.game-shell`): flex column container, padding 12px, max-width 1480px centered.
- **Game layout** (`.gs-layout`): 3-column grid (`260-300px | 1fr | 240-280px`) for game panels. Collapses to 2-col at `≤1419px`, 1-col at `≤768px`.
- **Bet panel** (`.bp-panel`): padding 18px, gap 14px, flex column.

### Mobile

- **Breakpoints**: 768px (tablet/phone), 480px (small phone), 560px (play surface), 520px (landscape phone height).
- **Mobile nav**: fixed bottom nav at `--mobile-nav-height: 64px`, pill-shaped (border-radius 18px), gradient background with backdrop blur.
- **Mobile action**: `--mobile-action-height: 74px`.
- **Safe area**: `--mobile-safe-bottom` computed from nav + action + `env(safe-area-inset-bottom)`.
- **Landscape phone** (`≤520px height`): bet panel collapses to a slide-up sheet anchored to bottom, max-height 56vh, transform-based peek.
- **Touch targets**: `min-height: 44px` on interactive elements via `@media (pointer: coarse)`.

### Max content width

- **App content**: unconstrained (flex fills).
- **Game shell**: 1480px max-width, auto margins.
- **Search dropdown**: capped at `min(360px, calc(100dvh - 76px))`.
- **Credit dropdown**: 360px.

## 5. Components

Documented reusable patterns extracted from existing code. Only components used 2+ times are listed.

### Shell (`.game-shell`)
- **Structure**: flex column container with radial-gradient backdrop tinted by `--accent`, dark overlay via `::before`, relative positioning for children.
- **Variants**: None (single structure, per-game accent via `--accent`).
- **Spacing**: padding 12px (8px mobile), gap 10px (8px mobile).
- **States**: N/A (layout container).
- **Depth**: backdrop radial gradients, overlay gradient, `--shell-backdrop` for optional cover image.

### Titlebar (`.gs-titlebar`)
- **Structure**: 3-column grid (`1fr auto auto`) with glass-style background (`backdrop-filter: blur(12px)`, `rgba(15,33,46,0.92)`), 14px border-radius, subtle inset.
- **Variants**: `.gs-titlebar-extras` for bonus action slot on mobile.
- **Spacing**: padding 10px 16px, gap 18px.
- **States**: N/A.
- **Motion**: none.

### BetPanel (`.bp-panel`)
- **Structure**: flex column inside `.gs-panel`, padding 18px, gap 14px, scrollable.
- **Variants**: Tab bar (`.bp-tabs`), bet amount input (`.bp-bet-input`), quick amount buttons (`.bp-bet-btn`), play CTA (`.bp-play`), auto/cashout mode.
- **States**: `.bp-play` has default (green gradient), `.bp-play.stop` (red gradient), `.bp-play.busy`/disabled (opacity 0.6).
- **Depth**: glass background, gradient play button with inset highlight and glow shadow.
- **Mobile**: slides up as a bottom sheet with peek handle.

### Mobile bottom nav
- **Structure**: fixed to bottom edge, 5-column grid, pill border-radius 18px, frosted glass (`backdrop-filter: blur(14px)`), gradient background.
- **Variants**: Active state uses green tint (`rgba(0,231,1,0.12)` + green text).
- **Spacing**: padding 6px, gap 4px, min-height 56px.

### Dropdown panels
- **Credit dropdown**: absolute position, 360px wide, 12px border-radius, `--bg-secondary` background, border, box-shadow, slide-in animation. Contains balance, quick-amount grid, input, transactions.
- **Game tools popover** (`.gt-popover`): absolute/fixed position, glass background, 12px border-radius, min-width 200px. On mobile: fixed to bottom edge.

### Toasts and banners
- **Credit toast** (`.credit-toast`): positioned below header, 8px border-radius, border-coded by type (bet=orange, win=green, loss=red, error=orange). Slide-in animation.
- **Achievement toast** (`.ach-toast`): fixed top-right, grid layout (icon + body + progress bar), 14px border-radius, tier-tinted borders (bronze/silver/gold/platinum/levelup). Bar animation, 5.2s auto-dismiss.
- **Mission toast** (`.mission-toast`): similar to achievement toast but for missions. Has weekly/lifetime variants.
- **BigWin overlay** (`.bigwin-overlay`): fixed fullscreen, z-index 1600, 2.7s fade with particle effects, shockwave, coin rain, tiered visuals (default/huge/mega). Gold border-image with gradient.

### Game stage
- **Structure**: per-game layout container inside `.gs-playfield`. Uses `--stage-bg` gradient, `--stage-glow` radial accent, tile grid with `--tile-bg`/`--tile-border`/`--tile-radius`.
- **Slot stage** (`.slot-stage-v2`): 4-row grid, 16px border-radius, cover image backdrop blurred at 18% opacity, accent border glow during bonus, per-template skin classes.
- **States**: `.is-loading`, `.is-bonus-active`, phase classes (`.phase-spinning`).

### History pills (`.history-pill`)
- **Structure**: inline pill, border-radius 9999px, font-weight 700, font-size 12px, slide-in animation.
- **Variants**: `.low` (dark bg, muted text), `.medium`/`.high` (green bg shades), `.mega` (purple bg).

### Betting controls (shared primitives)
- **Tab bar** (`.bp-tabs`/`.bet-tabs`): flex row with 4px gap, dark background, active tab tinted by accent via `color-mix()`.
- **Input row** (`.bp-bet-input`): dark input with border, accent focus ring.
- **Quick buttons** (`.bp-quick-actions`): flex wrap, dark bg, accent border on hover.
- **Stepper** (`.slot-control-bet-stepper`): up/down grid, 44x24 buttons.
- **Spin button** (`.slot-control-spin`): circular (78x78), radial gradient, 3px dark ring, hover lift.

### Win feedback
- **Win flash** (`.win-flash`): green inset glow animation 0.8s.
- **Loss flash** (`.loss-flash`): red inset glow animation 0.6s.
- **Result banner** (`.slot-result-banner`): centered overlay, gold glow, tier labels (Nice/Good/Great/Big/Huge/Mega), pop-in animation.
- **Recent results strip** (`.rrs-strip`): flex wrap pill row, win/loss/push colored pills with green/red gradients.

## 6. Motion & Interaction

### Transition tokens

Defined in `src/styles/index.css:67-68`:

- `--transition-fast`: 0.15s ease (hover, focus, toggle, button states)
- `--transition-normal`: 0.3s ease (panels, layout shifts)

### Keyframe animation patterns

| Name | Duration | Easing | Usage |
|------|----------|--------|-------|
| `slideIn` | 0.3s | ease | History pills entering |
| `creditDropIn` | 0.2s | ease-out | Credit dropdown appear |
| `creditToastSlide` | 0.28s | ease-out | Toast enter |
| `rrsPop` | 0.32s | cubic-bezier(0.2,0.8,0.2,1) | Result chip appear |
| `shellWinFlash` | 0.8s | ease | Win glow pulse |
| `shellLossFlash` | 0.6s | ease | Loss glow pulse |
| `shake` / `gampoShake` | 0.4-0.5s | ease / cubic-bezier | Error shake, crash state |
| `screenShake` | 0.45s | cubic-bezier(0.36,0.07,0.19,0.97) | Heavy loss/shake |
| `blink` | 2s | ease-in-out infinite | Connection status dot |
| `bigwinPop` | 0.7s | cubic-bezier(0.2,0.8,0.2,1) | BigWin card entrance |
| `slotReelMotion` | 0.09s | linear infinite | Reel spin vertical scroll |
| `slotCellLand` | 0.34s | cubic-bezier(0.18,1.3,0.4,1) | Reel stop bounce |
| `slotResultIn` | 0.34s | cubic-bezier(0.16,1,0.3,1) | Result banner entrance |
| `pageEnter` | 0.32s | cubic-bezier(0.2,0.8,0.2,1) | Main content page transition |
| `achToastIn` | 0.32s | cubic-bezier(0.2,0.8,0.2,1) | Achievement toast enter |
| `achToastBar` | 5.2s | linear | Toast progress bar drain |

### Utility FX classes

Defined in `src/components/fx/fx.css`:

- `.fx-pulse`: scale 1.04 loop, 1.6s
- `.fx-pop`: 0.6->1 scale entrance, 0.45s
- `.fx-flip`: 3D Y-rotation reveal, 0.55s
- `.fx-shake`: X-axis shake, 0.4s
- `.fx-glow`: currentColor box-shadow pulse loop, 1.4s
- `.fx-ripple`: radial click ripple via `::after`
- `.fx-particles`: positioned particle burst via `--dx`/`--dy` CSS vars
- `.fx-number-roll`: Y-bump on value change, 0.35s
- `.fx-confetti`: particle scatter upward, 1.2s

### Animation control layers

GamPo has three animation-control mechanisms, applied in order:

1. **`prefers-reduced-motion: reduce`** (accessibility) -- kills all keyframe animations, disables decorative pseudo-elements. Present in `index.css`, `fx.css`, `primitives.css`, `slots.css`, and every game CSS file.
2. **`.gampo-reduce-motion`** (accessibility, set by Settings) -- mirrors the reduce-motion behavior via class selector. Same effect as prefers-reduced-motion but user-opt-in.
3. **`.gampo-no-animations`** (player preference, Settings > Gameplay) -- master switch that sets `animation-duration: 0.001ms !important` and `animation-iteration-count: 1 !important` on all elements. Transitions are kept short (not killed) so controls remain responsive. Only looping/decorative animations are stopped.

### Interaction rules

- Hover: `--transition-fast` (0.15s) color/background/border changes. Brightness filter on buttons (1.1-1.15x). Subtle Y-lift on bet controls (`-1px` to `-2px`).
- Active/focus: `scale(0.98)` press on bet buttons. Focus-visible accent outline (2px). Accent focus ring on inputs via box-shadow.
- Disabled: opacity 0.45-0.6, cursor not-allowed, no hover effects.
- Entry animations use `cubic-bezier(0.2, 0.8, 0.2, 1)` throughout for consistent snap/overshoot feel.
- GPU-composited only: `transform`, `opacity`, `filter`. No layout-animating properties.

## 7. Depth & Surface

### Strategy: **Tonal-shift + borders** (mixed, with borders as primary separator)

GamPo uses background color hierarchy to create depth, reinforced by thin translucent borders and occasional shadows for elevated elements.

**Surface hierarchy**:
- Page background: `--bg-primary` (`#1a2c38`)
- Panels, sidebar, header: `--bg-secondary` (`#0f212e`) -- darker, receding
- Interactive surfaces (hover, active, inputs): `--bg-tertiary` (`#2f4553`) -- lighter, forward
- Glass surfaces (titlebar, mobile nav, popovers): `rgba(15,33,46,0.92-0.98)` + `backdrop-filter: blur(8-14px)`

**Borders**:
| Type | Value | Usage |
|------|-------|-------|
| Default | `1px solid var(--border-color)` / `rgba(255,255,255,0.05-0.08)` | Panels, cards, sections |
| Tile | `1px solid rgba(255,255,255,0.07)` | Game grid cells |
| Hairline | `1px solid rgba(255,255,255,0.04-0.06)` | Subtle dividers |

**Shadows**:
| Level | Token / Value | Usage |
|-------|---------------|-------|
| Subtle | `--shadow-sm: 0 1px 2px rgba(0,0,0,0.3)` | Small surfaces |
| Default | `--shadow-md: 0 4px 6px rgba(0,0,0,0.3)` | Cards, panels |
| Prominent | `--shadow-lg: 0 10px 15px rgba(0,0,0,0.3)` | Elevated elements |
| Dropdown | `0 8px 32px rgba(0,0,0,0.4)` | Credit dropdown |
| Modal | `0 18-24px 42-56px rgba(0,0,0,0.48-0.55)` | Popovers, drawers, modals |
| Game shell | `0 8px 24px rgba(0,0,0,0.35)` | Titlebar, panels |

**Backdrop blur**:
| Level | Usage |
|-------|-------|
| `blur(4px)` | Backdrop behind modals, FairnessDrawer |
| `blur(8px)` | Game panel glass surfaces |
| `blur(12-14px)` | Titlebar, mobile nav, BigWin overlay |

**Z-index layer stack** (from `:root` in `index.css:74-82`):

| Layer | Value | Usage |
|-------|-------|-------|
| Shell | `--z-shell: 100` | Header, app shell |
| Search | `--z-search: 240` | Search dropdown |
| Dock | `--z-dock: 900` | Chat dock |
| Mobile nav | `--z-mobile-nav: 1200` | Fixed bottom nav |
| Mobile action | `--z-mobile-action: 1400` | Mobile action sheet |
| Mobile sheet | `--z-mobile-sheet: 1410` | Bottom sheets, popovers on mobile |
| Modal | `--z-modal: 1500` | Modals, drawers, fairness panel |
| Toast | `--z-toast: 1600` | Toasts, BigWin overlay |

**Inset highlights**: glass surfaces use `inset 0 1px 0 rgba(255,255,255,0.04-0.06)` for a subtle top-edge catchlight, creating perceived elevation without stronger shadows.
