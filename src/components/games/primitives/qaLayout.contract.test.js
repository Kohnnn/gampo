import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const coreSource = readFileSync(new URL('./CoreStageFrame.jsx', import.meta.url), 'utf8')
const primitivesCss = readFileSync(new URL('./primitives.css', import.meta.url), 'utf8')
const betPanelSource = readFileSync(new URL('./BetPanel.jsx', import.meta.url), 'utf8')
const preloaderSource = readFileSync(new URL('../resources/useOriginalsPreloader.js', import.meta.url), 'utf8')
const minesSource = readFileSync(new URL('../mines/MinesGame.jsx', import.meta.url), 'utf8')
const minesCss = readFileSync(new URL('../mines/mines.css', import.meta.url), 'utf8')
const plinkoCss = readFileSync(new URL('../plinko/plinko.css', import.meta.url), 'utf8')
const plinkoEngineSource = readFileSync(new URL('../plinko/engine/PlinkoEngine.js', import.meta.url), 'utf8')
const limboCss = readFileSync(new URL('../limbo/limbo.css', import.meta.url), 'utf8')
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
        expect(plinkoCss).toContain('height: clamp(116px, 22dvh, 190px)')
        expect(plinkoEngineSource).toContain("this.canvas.style.width = ''")
        expect(plinkoEngineSource).toContain("this.canvas.style.height = ''")
        expect(minesCss).toMatch(/\.mines-grid\s*\{[^}]*aspect-ratio:\s*1 \/ 1/s)
        expect(minesCss).toContain('width: min(100%, clamp(170px, calc(100dvh - 455px), 230px))')
        expect(limboCss).toContain('@media (max-height: 740px)')
        expect(limboCss).toContain('width: min(300px, 64vw, 40dvh)')
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
