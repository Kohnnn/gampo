import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const coreSource = readFileSync(new URL('./CoreStageFrame.jsx', import.meta.url), 'utf8')
const primitivesCss = readFileSync(new URL('./primitives.css', import.meta.url), 'utf8')
const betPanelSource = readFileSync(new URL('./BetPanel.jsx', import.meta.url), 'utf8')
const preloaderSource = readFileSync(new URL('../resources/useOriginalsPreloader.js', import.meta.url), 'utf8')
const minesSource = readFileSync(new URL('../mines/MinesGame.jsx', import.meta.url), 'utf8')
const minesCss = readFileSync(new URL('../mines/mines.css', import.meta.url), 'utf8')
const slotsSource = readFileSync(new URL('../slots/SlotsGame.jsx', import.meta.url), 'utf8')
const slotsCss = readFileSync(new URL('../slots/slots.css', import.meta.url), 'utf8')
const plinkoCss = readFileSync(new URL('../plinko/plinko.css', import.meta.url), 'utf8')
const plinkoSource = readFileSync(new URL('../plinko/PlinkoGame.jsx', import.meta.url), 'utf8')
const plinkoEngineSource = readFileSync(new URL('../plinko/engine/PlinkoEngine.js', import.meta.url), 'utf8')
const limboCss = readFileSync(new URL('../limbo/limbo.css', import.meta.url), 'utf8')
const rouletteCss = readFileSync(new URL('../roulette/roulette.css', import.meta.url), 'utf8')
const baccaratCss = readFileSync(new URL('../baccarat/baccarat.css', import.meta.url), 'utf8')
const blackjackCss = readFileSync(new URL('../blackjack/blackjack.css', import.meta.url), 'utf8')
const rouletteSource = readFileSync(new URL('../roulette/RouletteGame.jsx', import.meta.url), 'utf8')
const baccaratSource = readFileSync(new URL('../baccarat/BaccaratGame.jsx', import.meta.url), 'utf8')
const blackjackSource = readFileSync(new URL('../blackjack/BlackjackGame.jsx', import.meta.url), 'utf8')
const crashSource = readFileSync(new URL('../crash/CrashGame.jsx', import.meta.url), 'utf8')
const coinflipSource = readFileSync(new URL('../coinflip/CoinFlipGame.jsx', import.meta.url), 'utf8')
const rpsSource = readFileSync(new URL('../rps/RpsGame.jsx', import.meta.url), 'utf8')
const sicboSource = readFileSync(new URL('../sicbo/SicBoGame.jsx', import.meta.url), 'utf8')
const videopokerSource = readFileSync(new URL('../videopoker/VideoPokerGame.jsx', import.meta.url), 'utf8')
const videopokerCss = readFileSync(new URL('../videopoker/videopoker.css', import.meta.url), 'utf8')
const kenoSource = readFileSync(new URL('../keno/KenoGame.jsx', import.meta.url), 'utf8')
const hiloSource = readFileSync(new URL('../hilo/HiloGame.jsx', import.meta.url), 'utf8')
const diceSource = readFileSync(new URL('../dice/DiceGame.jsx', import.meta.url), 'utf8')
const educationSource = readFileSync(new URL('../../EducationPanel.jsx', import.meta.url), 'utf8')
const smokeSource = readFileSync(new URL('../../../../scripts/browserSmoke.mjs', import.meta.url), 'utf8')
const packageSource = readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../../Layout.jsx', import.meta.url), 'utf8')
const headerSource = readFileSync(new URL('../../Header.jsx', import.meta.url), 'utf8')
const mobileNavSource = readFileSync(new URL('../../MobileBottomNav.jsx', import.meta.url), 'utf8')
const gameShellSource = readFileSync(new URL('./GameShell.jsx', import.meta.url), 'utf8')
const casesCss = readFileSync(new URL('../cases/cases.css', import.meta.url), 'utf8')

describe('QA layout and loader contracts', () => {
    it('clamps shared stages to viewport height and exposes smoke selectors', () => {
        expect(coreSource).toContain('data-game-stage')
        expect(coreSource).toContain('calc(100dvh - 220px)')
        expect(primitivesCss).toMatch(/\.core-stage\s*\{[^}]*--core-stage-min-height/s)
        expect(primitivesCss).toMatch(/@media \(max-width: 760px\)[\s\S]*\.core-stage/s)
    })

    it('prevents asset preloaders from blanking games forever', () => {
        expect(preloaderSource).toContain('timeoutMs = 4500')
        expect(preloaderSource).toContain('window.setTimeout')
        expect(preloaderSource).toContain('finish(false)')
    })

    it('keeps reported game stages responsive and readable', () => {
        expect(plinkoCss).toContain('.plinko-stage .sim-bet-strip')
        expect(plinkoCss).toContain('height: clamp(170px, 30dvh, 240px)')
        expect(plinkoCss).toContain('position: absolute')
        expect(plinkoEngineSource).toContain("this.canvas.style.width = ''")
        expect(plinkoEngineSource).toContain("this.canvas.style.height = ''")
        expect(minesCss).toMatch(/\.mines-grid\s*\{[^}]*aspect-ratio:\s*1 \/ 1/s)
        expect(minesCss).toContain('width: min(100%, clamp(190px, calc(100dvh - 500px), 220px))')
        expect(limboCss).toContain('@media (max-height: 740px)')
        expect(limboCss).toContain('width: min(300px, 64vw, 40dvh)')
    })

    it('keeps mobile playfields before controls and exposes one shared action dock', () => {
        expect(betPanelSource).toContain('createPortal')
        expect(betPanelSource).toContain('bp-mobile-layer')
        expect(betPanelSource).toContain('data-mobile-action-dock')
        expect(betPanelSource).toContain('data-mobile-primary-action')
        expect(betPanelSource).toContain('data-mobile-hit-target="primary"')
        expect(betPanelSource).toContain('data-ux-primary-action')
        expect(betPanelSource).toContain('mobilePlayLabel')
        expect(primitivesCss).toMatch(/\.gs-playfield\s*\{[^}]*order:\s*1/s)
        expect(primitivesCss).toMatch(/\.gs-panel\s*\{[^}]*order:\s*2/s)
        expect(primitivesCss).toContain('var(--z-mobile-action, 1400)')
        expect(primitivesCss).toContain('var(--z-mobile-sheet, 1410)')
        expect(primitivesCss).toContain('var(--z-modal, 1500)')
        expect(primitivesCss).toContain('var(--z-toast, 1600)')
        expect(primitivesCss).toContain('pointer-events: auto')
        expect(primitivesCss).toContain('bottom: calc(var(--mobile-safe-bottom, 138px) + 10px)')
        expect(coreSource).toContain('mobileScrollable')
        expect(coreSource).toContain('data-mobile-scroll-surface')
        expect(primitivesCss).toContain('core-stage-mobile-scroll')
        expect(rouletteCss).not.toMatch(/>\s*\.gs-panel\s*\{[\s\S]*order:\s*1;/)
        expect(baccaratCss).not.toMatch(/>\s*\.gs-panel\s*\{[\s\S]*order:\s*1;/)
    })

    it('keeps slot spin reachable with a slot-owned mobile dock', () => {
        expect(slotsSource).toContain('data-slot-mobile-dock')
        expect(slotsSource).toContain('data-slot-action="spin"')
        expect(slotsSource).toContain('data-mobile-hit-target="primary"')
        expect(slotsSource).toContain('data-ux-primary-action')
        expect(slotsSource).toContain("style={{ '--slot-accent': config.accent }}")
        expect(slotsCss).toContain('.slot-mobile-dock')
        expect(slotsCss).toContain('position: fixed')
        expect(slotsCss).toContain('var(--z-mobile-action, 1400)')
        expect(slotsCss).toContain('bottom: calc(var(--mobile-nav-height, 0px) + max(8px, env(safe-area-inset-bottom)))')
        expect(slotsCss).toMatch(/@media \(max-width: 760px\)[\s\S]*\.slot-controls-v2\s*\{[\s\S]*display:\s*none/s)
    })

    it('marks audited mobile critical surfaces for browser smoke visibility checks', () => {
        for (const source of [
            rouletteSource,
            baccaratSource,
            blackjackSource,
            crashSource,
            coinflipSource,
            rpsSource,
            minesSource,
            plinkoSource,
            sicboSource,
            videopokerSource,
            kenoSource,
            hiloSource,
            diceSource,
        ]) {
            expect(source).toContain('data-mobile-critical-surface')
        }
        expect(blackjackCss).toContain('position: sticky')
        expect(rouletteCss).not.toContain('max-height: 190px')
        expect(baccaratCss).not.toContain('max-height: 242px')
        expect(baccaratSource).toContain('deriveBaccaratAutoBets')
        expect(baccaratSource).toContain('data-baccarat-auto-source')
        expect(videopokerCss).toContain('grid-template-columns: repeat(5, minmax(0, 1fr))')
        expect(videopokerSource).toContain('vp-paytable-shell')
        expect(sicboSource).toContain('Two-Dice Combos')
        expect(sicboSource).toContain('combo-${a}-${b}')
    })

    it('enables Mines auto mode with a safe cashout target', () => {
        expect(minesSource).not.toContain('disableAuto')
        expect(minesSource).toContain('autoCashoutPicks')
        expect(minesSource).toContain("mode === 'auto'")
        expect(minesSource).toContain('Mines auto cashout')
    })

    it('adds accessibility affordances for disabled rebet and probability lab discovery', () => {
        expect(betPanelSource).toContain('data-disabled-reason')
        expect(betPanelSource).toContain('Place your first bet to enable Rebet')
        expect(educationSource).toContain('data-scroll-hint')
        expect(educationSource).toContain('Probability Lab below')
    })

    it('lets npm-provided smoke args reach browserSmoke on Windows', () => {
        expect(smokeSource).toContain('process.env[envKey]')
        expect(smokeSource).toContain('npm_config_clean')
        expect(smokeSource).toContain('/sportsbook/soccer')
        expect(smokeSource).toContain('elementFromPoint')
        expect(smokeSource).toContain('mobileActionHit')
        expect(smokeSource).toContain('runMobileInteraction')
    })

    it('adds UX benchmark hooks and script for cross-device scorecards', () => {
        expect(packageSource).toContain('"ux:benchmark"')
        expect(packageSource).toContain('--mode=ux')
        expect(smokeSource).toContain('output/ux-benchmark')
        expect(smokeSource).toContain('data-ux-primary-action')
        expect(smokeSource).toContain('document.querySelector(\'.sb-page\')')
        expect(smokeSource).toContain('[data-mobile-hit-target="primary"], [data-mobile-primary-action], [data-ux-primary-action]')
        expect(smokeSource).toContain('document.querySelector(\'[data-slot-mobile-dock]\')')
        expect(smokeSource).toContain('scrollReachable')
        expect(smokeSource).toContain('playfieldPriority')
        expect(smokeSource).toContain('UX Score')
        expect(layoutSource).toContain('data-ux-surface="shell"')
        expect(headerSource).toContain('data-ux-surface="controls"')
        expect(mobileNavSource).toContain('data-ux-surface="dock"')
        expect(gameShellSource).toContain('data-ux-surface="stage"')
        expect(coreSource).toContain('data-ux-surface="stage"')
    })

    it('keeps cases desktop controls in a three-pane shell without hiding mobile controls', () => {
        expect(casesCss).toContain('@media (min-width: 1181px)')
        expect(casesCss).toContain('grid-template-columns: minmax(210px, 240px) minmax(0, 1fr) minmax(300px, 340px) !important')
        expect(casesCss).toContain('display: flex')
        expect(casesCss).toContain('flex-direction: column')
        expect(casesCss).toContain('min-height: 48px')
    })
})
