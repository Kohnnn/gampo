import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const coreSource = readFileSync(new URL('./CoreStageFrame.jsx', import.meta.url), 'utf8')
const primitivesCss = readFileSync(new URL('./primitives.css', import.meta.url), 'utf8')
const betPanelSource = readFileSync(new URL('./BetPanel.jsx', import.meta.url), 'utf8')
const preloaderSource = readFileSync(new URL('../resources/useOriginalsPreloader.js', import.meta.url), 'utf8')
const minesSource = readFileSync(new URL('../mines/MinesGame.jsx', import.meta.url), 'utf8')
const minesCss = readFileSync(new URL('../mines/mines.css', import.meta.url), 'utf8')
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
const sicboSource = readFileSync(new URL('../sicbo/SicBoGame.jsx', import.meta.url), 'utf8')
const videopokerSource = readFileSync(new URL('../videopoker/VideoPokerGame.jsx', import.meta.url), 'utf8')
const kenoSource = readFileSync(new URL('../keno/KenoGame.jsx', import.meta.url), 'utf8')
const diceSource = readFileSync(new URL('../dice/DiceGame.jsx', import.meta.url), 'utf8')
const educationSource = readFileSync(new URL('../../EducationPanel.jsx', import.meta.url), 'utf8')
const smokeSource = readFileSync(new URL('../../../../scripts/browserSmoke.mjs', import.meta.url), 'utf8')

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
        expect(minesCss).toContain('width: min(100%, clamp(230px, calc(100dvh - 350px), 340px))')
        expect(limboCss).toContain('@media (max-height: 740px)')
        expect(limboCss).toContain('width: min(300px, 64vw, 40dvh)')
    })

    it('keeps mobile playfields before controls and exposes one shared action dock', () => {
        expect(betPanelSource).toContain('data-mobile-action-dock')
        expect(betPanelSource).toContain('data-mobile-primary-action')
        expect(primitivesCss).toMatch(/\.gs-playfield\s*\{[^}]*order:\s*1/s)
        expect(primitivesCss).toMatch(/\.gs-panel\s*\{[^}]*order:\s*2/s)
        expect(rouletteCss).not.toMatch(/>\s*\.gs-panel\s*\{[\s\S]*order:\s*1;/)
        expect(baccaratCss).not.toMatch(/>\s*\.gs-panel\s*\{[\s\S]*order:\s*1;/)
    })

    it('marks audited mobile critical surfaces for browser smoke visibility checks', () => {
        for (const source of [
            rouletteSource,
            baccaratSource,
            blackjackSource,
            crashSource,
            coinflipSource,
            minesSource,
            plinkoSource,
            sicboSource,
            videopokerSource,
            kenoSource,
            diceSource,
        ]) {
            expect(source).toContain('data-mobile-critical-surface')
        }
        expect(blackjackCss).toContain('position: sticky')
        expect(rouletteCss).not.toContain('max-height: 190px')
        expect(baccaratCss).not.toContain('max-height: 242px')
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
    })
})
