// Lightweight Dino engine — canvas + atlas sprite. Standalone (no Phaser) and
// designed to be driven from the betting wrapper which calls jump()/cashOut().
//
// Lifecycle:
//   const engine = new DinoEngine(canvas, opts)
//   engine.start()                 // begins idle loop with looping demo run
//   engine.beginRun()              // starts a real betting run
//   engine.jump()                  // input from outside (player tries to clear next obstacle)
//   engine.die()                   // forces death (cashout-on-fail flow)
//   engine.stop()                  // cancel RAF
//
// Outputs callbacks `onStep` (cleared an obstacle) and `onDie` (failed) so the
// React wrapper can settle the round through CreditContext.

import { FRAMES, RUN_CYCLE, IDLE_CYCLE, BIRD_CYCLE, CACTI, loadAtlas } from './atlas'

const W = 600
const H = 200
const GROUND_Y = 160
const PLAYER_X = 60
const GRAVITY = 1500            // px/s^2
const JUMP_VY = -540            // px/s
const RUN_FPS = 10
const BIRD_FPS = 8

// World state shape: { phase, x, y, vy, frame, frameTimer, obstacles, scroll, speed }

export default class DinoEngine {
    constructor(canvas, opts = {}) {
        this.canvas = canvas
        this.ctx = canvas.getContext('2d')
        this.opts = opts
        this.atlas = loadAtlas()
        this.raf = 0
        this.last = 0
        this.demoMode = true
        this.world = createWorld()
        this.onStep = opts.onStep || (() => {})
        this.onDie = opts.onDie || (() => {})
        this.setupHDPI()
    }

    setupHDPI() {
        const dpr = window.devicePixelRatio || 1
        this.canvas.width  = W * dpr
        this.canvas.height = H * dpr
        this.canvas.style.width = '100%'
        this.canvas.style.height = 'auto'
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    start() {
        this.last = performance.now()
        const loop = (ts) => {
            const dt = Math.min(0.05, (ts - this.last) / 1000)
            this.last = ts
            this.update(dt)
            this.draw()
            this.raf = requestAnimationFrame(loop)
        }
        this.raf = requestAnimationFrame(loop)
    }

    stop() {
        cancelAnimationFrame(this.raf)
        this.raf = 0
    }

    beginRun(speed = 280) {
        this.demoMode = false
        this.world = createWorld()
        this.world.phase = 'running'
        this.world.speed = speed
        this.world.scrollSpeed = speed
        // Pre-spawn a couple of obstacles ahead.
        spawnObstacle(this.world, W + 200)
    }

    endRun() {
        this.demoMode = true
        this.world = createWorld()
    }

    jump(strength = 1.0) {
        const w = this.world
        if (w.phase !== 'running') return
        if (w.y < GROUND_Y) return // already in air
        w.vy = JUMP_VY * strength
    }

    // Caller can force death (used when survival roll fails).
    die() {
        const w = this.world
        if (w.phase !== 'running') return
        w.phase = 'dead'
        w.vy = 0
    }

    update(dt) {
        const w = this.world

        // Animate frame timer
        w.frameTimer += dt
        const fps = (w.phase === 'running' || this.demoMode) ? RUN_FPS : 4
        if (w.frameTimer > 1 / fps) {
            w.frame = (w.frame + 1) % 2
            w.frameTimer = 0
        }
        // Bird wing flap
        w.birdFrameTimer += dt
        if (w.birdFrameTimer > 1 / BIRD_FPS) {
            w.birdFrame = (w.birdFrame + 1) % 2
            w.birdFrameTimer = 0
        }

        if (this.demoMode) {
            // Idle demo: scroll ground, bob the dino slightly, spawn occasional cactus.
            w.scroll = (w.scroll + dt * 220) % FRAMES.ground.w
            w.demoSpawnTimer += dt
            // gampo:allow-math-random-sim — idle attract-loop spawn cadence, no stake in play.
            if (w.demoSpawnTimer > 2.5 + Math.random() * 1.5) {
                w.demoSpawnTimer = 0
                spawnObstacle(w, W + 120)
            }
            for (const o of w.obstacles) o.x -= 220 * dt
            w.obstacles = w.obstacles.filter(o => o.x > -100)
            return
        }

        if (w.phase === 'dead') {
            // Decelerate scroll for a smooth halt.
            w.scrollSpeed = Math.max(0, w.scrollSpeed - 600 * dt)
            w.scroll = (w.scroll + dt * w.scrollSpeed) % FRAMES.ground.w
            // Apply gravity to make the dino fall if it was airborne.
            w.vy += GRAVITY * dt
            w.y = Math.min(GROUND_Y, w.y + w.vy * dt)
            return
        }

        // running
        w.scroll = (w.scroll + dt * w.scrollSpeed) % FRAMES.ground.w
        w.vy += GRAVITY * dt
        w.y = Math.min(GROUND_Y, w.y + w.vy * dt)
        if (w.y >= GROUND_Y) { w.y = GROUND_Y; w.vy = 0 }

        // Move obstacles, detect cleared (passed PLAYER_X without collision)
        for (const o of w.obstacles) {
            o.x -= w.speed * dt
            if (!o.cleared && o.x + getFrame(o.kind).w / o.scale < PLAYER_X) {
                o.cleared = true
                this.onStep()
            }
        }
        w.obstacles = w.obstacles.filter(o => o.x > -160)

        // Auto-spawn the next obstacle ahead. Spacing depends on speed.
        w.spawnTimer += dt
        // gampo:allow-math-random-visual — obstacle spacing jitter; the run outcome is nextRoll-driven.
        const spacing = 1.0 + Math.random() * 0.9
        if (w.spawnTimer > spacing) {
            w.spawnTimer = 0
            spawnObstacle(w, W + 80)
        }

        // Gradually accelerate
        w.speed = Math.min(620, w.speed + dt * 14)
        w.scrollSpeed = w.speed
    }

    draw() {
        const ctx = this.ctx
        const w = this.world
        ctx.clearRect(0, 0, W, H)

        // Sky / horizon line
        ctx.fillStyle = 'rgba(255,255,255,0.04)'
        ctx.fillRect(0, GROUND_Y + 22, W, 1)

        // Parallax cloud layer (Phase F game-feel) — slower than the ground.
        const cloud = FRAMES.cloud
        if (cloud) {
            const cs = (w.scroll * 0.4) % (cloud.w + 200)
            ctx.globalAlpha = 0.55
            for (let cx = -cs; cx < W; cx += cloud.w + 220) {
                ctx.drawImage(this.atlas, cloud.x, cloud.y, cloud.w, cloud.h, cx, 28, cloud.w * 0.9, cloud.h * 0.9)
            }
            for (let cx = -cs + 110; cx < W; cx += cloud.w + 280) {
                ctx.drawImage(this.atlas, cloud.x, cloud.y, cloud.w, cloud.h, cx, 60, cloud.w * 0.7, cloud.h * 0.7)
            }
            ctx.globalAlpha = 1
        }

        // Ground (tiled by scrolling source x)
        const ground = FRAMES.ground
        const sx = Math.floor(w.scroll) % ground.w
        ctx.drawImage(this.atlas, ground.x + sx, ground.y, Math.min(ground.w - sx, W), ground.h, 0, GROUND_Y + 18, Math.min(ground.w - sx, W), ground.h)
        if (sx + W > ground.w) {
            const remainder = sx + W - ground.w
            ctx.drawImage(this.atlas, ground.x, ground.y, remainder, ground.h, ground.w - sx, GROUND_Y + 18, remainder, ground.h)
        }

        // Obstacles
        for (const o of w.obstacles) {
            const f = getFrame(o.kind)
            const dw = f.w / o.scale
            const dh = f.h / o.scale
            let dy = GROUND_Y + 24 - dh
            if (o.kind.startsWith('bird-')) {
                const frameName = BIRD_CYCLE[w.birdFrame]
                const bf = FRAMES[frameName]
                dy = o.flightY
                ctx.drawImage(this.atlas, bf.x, bf.y, bf.w, bf.h, o.x, dy, bf.w / o.scale, bf.h / o.scale)
            } else {
                ctx.drawImage(this.atlas, f.x, f.y, f.w, f.h, o.x, dy, dw, dh)
            }
        }

        // Player frame selection
        let frameName
        if (this.demoMode) frameName = IDLE_CYCLE[w.frame]
        else if (w.phase === 'dead') frameName = 'dino-dead'
        else if (w.y < GROUND_Y) frameName = 'dino-start'
        else frameName = RUN_CYCLE[w.frame]
        const pf = FRAMES[frameName]
        const ph = pf.h / 1.6
        const pw = pf.w / 1.6
        const drawY = w.y - ph + 24

        // Motion-blur trail when airborne (Phase F game-feel).
        if (!this.demoMode && w.phase === 'running' && w.y < GROUND_Y - 4) {
            ctx.globalAlpha = 0.32
            ctx.drawImage(this.atlas, pf.x, pf.y, pf.w, pf.h, PLAYER_X - 8, drawY + 4, pw, ph)
            ctx.globalAlpha = 0.18
            ctx.drawImage(this.atlas, pf.x, pf.y, pf.w, pf.h, PLAYER_X - 16, drawY + 8, pw, ph)
            ctx.globalAlpha = 1
        }

        ctx.drawImage(this.atlas, pf.x, pf.y, pf.w, pf.h, PLAYER_X, drawY, pw, ph)
    }
}

function createWorld() {
    return {
        phase: 'idle',
        x: PLAYER_X, y: GROUND_Y, vy: 0,
        frame: 0, frameTimer: 0,
        birdFrame: 0, birdFrameTimer: 0,
        scroll: 0, scrollSpeed: 220,
        speed: 0,
        obstacles: [],
        spawnTimer: 0,
        demoSpawnTimer: 1.5,
    }
}

function spawnObstacle(w, x) {
    // Obstacle shape/height is cosmetic: the dino run's stake outcome is decided by
    // nextRoll in DinoGame.jsx, not by which sprite happens to spawn.
    // gampo:allow-math-random-visual — obstacle kind mix (80% cactus / 20% bird), cosmetic only.
    const useBird = w.phase === 'running' && Math.random() < 0.2
    if (useBird) {
        // gampo:allow-math-random-visual — bird flight height jitter, purely a sprite offset.
        const flightY = GROUND_Y - 30 - Math.random() * 30
        w.obstacles.push({ kind: 'bird-1', x, scale: 1.1, flightY, cleared: false })
    } else {
        // gampo:allow-math-random-visual — which cactus sprite is drawn, cosmetic only.
        const kind = CACTI[Math.floor(Math.random() * CACTI.length)]
        w.obstacles.push({ kind, x, scale: 1.4, cleared: false })
    }
}

function getFrame(kind) {
    return FRAMES[kind] || FRAMES['cactus-small-1']
}
