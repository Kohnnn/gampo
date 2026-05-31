// Per-game SFX manifest. Roles map to file paths inside
// `public/audio/originals/<slug>/` (16-bit PCM mono .wav, 44.1 kHz).
//
// Wave 1 ships silent: no binaries committed. The manifest is the contract
// games declare against. Audio batch waves will fill the paths in.
//
// Common roles (cross-game):
//   click   -> generic UI click
//   reveal  -> reveal/select feedback
//   win     -> generic win sting
//   lose    -> generic lose sting
//   cashout -> generic cashout sting
//
// Per-game roles (examples):
//   dice.roll, dice.tick, dice.land
//   crash.tick, crash.cashout, crash.bust
//   plinko.peg, plinko.bucket, plinko.drop
//
// Manifest schema:
//   { [slug]: { [role]: '/audio/originals/<slug>/<file>.wav' } }
//
// `null` in this map means "intentionally silent right now". Useful for
// declaring intent without hardcoding a missing path that 404s.

export const sfxManifest = {
    common: {
        click: '/audio/common/click.wav',
        reveal: '/audio/common/reveal.wav',
        win: '/audio/common/win.wav',
        lose: '/audio/common/lose.wav',
        cashout: '/audio/common/cashout.wav',
        // Wave 27: shared BGM-bus markers per family. Treated as roles so
        // useSfx can preload them via the same path; in practice BGM uses
        // a separate hook (`useBgm`) for looping playback.
        bigwin: '/audio/common/bigwin.wav',
    },
    dice: {
        click: '/audio/common/click.wav',
        roll: '/audio/dice/roll.wav',
        tick: '/audio/cases/tick.wav',
        land: '/audio/dice/land.wav',
        win: '/audio/common/win.wav',
        lose: '/audio/common/lose.wav',
    },
    mines: {
        click: '/audio/common/click.wav',
        reveal: '/audio/mines/reveal.wav',
        cashout: '/audio/common/cashout.wav',
        win: '/audio/common/win.wav',
        lose: '/audio/common/lose.wav',
    },
    keno: {
        click: '/audio/common/click.wav',
        reveal: '/audio/common/reveal.wav',
        win: '/audio/common/win.wav',
        lose: '/audio/common/lose.wav',
    },
    limbo: {
        click: '/audio/common/click.wav',
        tick: '/audio/cases/tick.wav',
        win: '/audio/common/win.wav',
        lose: '/audio/common/lose.wav',
    },
    crash: {
        click: '/audio/common/click.wav',
        tick: '/audio/crash/tick.wav',
        cashout: '/audio/crash/cashout.wav',
        win: '/audio/common/win.wav',
        lose: '/audio/common/lose.wav',
    },
    plinko: {
        click: '/audio/common/click.wav',
        peg: '/audio/plinko/peg.wav',
        bucket: '/audio/plinko/bucket.wav',
        win: '/audio/common/win.wav',
        lose: '/audio/common/lose.wav',
    },
    wheel: {
        click: '/audio/common/click.wav',
        tick: '/audio/cases/tick.wav',
        win: '/audio/common/win.wav',
        lose: '/audio/common/lose.wav',
    },
    blackjack: {
        click: '/audio/kenney/casino/chip-lay-1.ogg',
        chip: '/audio/kenney/casino/chips-stack-1.ogg',
        deal: '/audio/kenney/casino/card-slide-1.ogg',
        reveal: '/audio/kenney/casino/card-place-1.ogg',
        shuffle: '/audio/kenney/casino/card-shuffle.ogg',
        win: '/audio/kenney/jingles/jingles_HIT03.ogg',
        lose: '/audio/common/lose.wav',
    },
    hilo: {
        click: '/audio/kenney/casino/chip-lay-1.ogg',
        flip: '/audio/kenney/casino/card-place-1.ogg',
        reveal: '/audio/kenney/casino/card-slide-1.ogg',
        win: '/audio/kenney/jingles/jingles_NES05.ogg',
        lose: '/audio/common/lose.wav',
    },
    baccarat: {
        click: '/audio/kenney/casino/chip-lay-1.ogg',
        chip: '/audio/kenney/casino/chips-collide-1.ogg',
        deal: '/audio/kenney/casino/card-slide-1.ogg',
        reveal: '/audio/kenney/casino/card-place-1.ogg',
        win: '/audio/kenney/jingles/jingles_HIT03.ogg',
        lose: '/audio/common/lose.wav',
    },
    videopoker: {
        click: '/audio/kenney/casino/chip-lay-1.ogg',
        deal: '/audio/kenney/casino/card-slide-1.ogg',
        reveal: '/audio/kenney/casino/card-place-1.ogg',
        shuffle: '/audio/kenney/casino/card-shuffle.ogg',
        win: '/audio/kenney/jingles/jingles_NES05.ogg',
        lose: '/audio/common/lose.wav',
    },
    flip: {
        click: null,
        reveal: null,
        win: null,
        lose: null,
    },
    diamonds: {
        click: null,
        reveal: null,
        win: null,
        lose: null,
    },
    darts: {
        click: null,
        reveal: null,
        win: null,
        lose: null,
    },
    pump: {
        click: null,
        reveal: null,
        cashout: null,
        win: null,
        lose: null,
    },
    slide: {
        click: null,
        reveal: null,
        win: null,
        lose: null,
    },
    moles: {
        click: null,
        reveal: null,
        win: null,
        lose: null,
    },
    snakes: {
        click: null,
        reveal: null,
        cashout: null,
        win: null,
        lose: null,
    },
    cases: {
        click: '/audio/kenney/casino/chip-lay-1.ogg',
        // Wave 18 + Wave 31: declared cases SFX, all wired to procedural binaries.
        // open      -> latch click as the lid pops
        // lid       -> heavy thud variant for crate slam
        // tick      -> per-tile tick while the carousel decelerates
        // multispin -> sting played when 3/5/10 rows kick off together
        // land      -> final stop thunk when the pointer locks
        // rare      -> chime when a Covert/Extraordinary lands
        // knife     -> ★ knife/gloves drop fanfare
        // gloves    -> alternative gloves sting
        // stattrak  -> short bright stinger when StatTrak™ flag rolls
        // souvenir  -> warm chord when a souvenir variant rolls
        // reveal    -> generic reveal sting on the result card
        // win       -> profit > 0 sting
        // lose      -> profit <= 0 sting
        open: '/audio/kenney/casino/cards-pack-open-1.ogg',
        lid: '/audio/cases/lid.wav',
        tick: '/audio/cases/tick.wav',
        multispin: '/audio/cases/multispin.wav',
        land: '/audio/cases/land.wav',
        rare: '/audio/cases/rare.wav',
        knife: '/audio/cases/knife.wav',
        gloves: '/audio/cases/gloves.wav',
        stattrak: '/audio/cases/stattrak.wav',
        souvenir: '/audio/cases/souvenir.wav',
        reveal: '/audio/cases/reveal.wav',
        win: '/audio/cases/win.wav',
        lose: '/audio/cases/lose.wav',
    },
    slots: {
        click: '/audio/common/click.wav',
        spin: '/audio/slots/spinStart.wav',
        spinStart: '/audio/slots/spinStart.wav',
        reelStop: '/audio/slots/reelStop.wav',
        reelTick: '/audio/slots/reelTick.wav',
        reveal: '/audio/slots/mysteryReveal.wav',
        settle: '/audio/slots/winLine.wav',
        win: '/audio/slots/winLine.wav',
        lose: '/audio/common/lose.wav',
        bigwin: '/audio/common/bigwin.wav',
        scatter: '/audio/slots/scatter.wav',
        bonus: '/audio/slots/scatter.wav',
        bonusEnter: '/audio/slots/scatter.wav',
        bonusExit: '/audio/slots/moneyCollect.wav',
        wheelLand: '/audio/slots/wheelLand.wav',
        holdFill: '/audio/slots/holdFill.wav',
        stickyLock: '/audio/slots/stickyLock.wav',
        mysteryReveal: '/audio/slots/mysteryReveal.wav',
        wantedSlam: '/audio/slots/wantedSlam.wav',
        moneyCollect: '/audio/slots/moneyCollect.wav',
        collect: '/audio/slots/moneyCollect.wav',
        cascadeStep: '/audio/slots/cascadeStep.wav',
        anticipation: '/audio/slots/anticipation.wav',
    },
    drill: {
        click: null,
        reveal: null,
        cashout: null,
        win: null,
        lose: null,
    },
    packs: {
        click: null,
        reveal: null,
        win: null,
        lose: null,
    },
    tomeoflife: {
        click: null,
        reveal: null,
        cashout: null,
        win: null,
        lose: null,
    },
    tarot: {
        click: '/audio/kenney/casino/chip-lay-1.ogg',
        deal: '/audio/kenney/casino/card-shuffle.ogg',
        reveal: '/audio/kenney/casino/card-place-1.ogg',
        major: '/audio/kenney/jingles/jingles_STEEL07.ogg',
        bonus: '/audio/kenney/jingles/jingles_PIZZI12.ogg',
        win: '/audio/kenney/jingles/jingles_NES05.ogg',
        lose: '/audio/common/lose.wav',
    },
    'scarab-spin': {
        click: null,
        reveal: null,
        win: null,
        lose: null,
    },
    bars: {
        click: null,
        reveal: null,
        win: null,
        lose: null,
    },
    'blue-samurai': {
        click: null,
        reveal: null,
        win: null,
        lose: null,
    },
    war: {
        click: '/audio/kenney/casino/chip-lay-1.ogg',
        deal: '/audio/kenney/casino/card-slide-1.ogg',
        reveal: '/audio/kenney/casino/card-place-1.ogg',
        win: '/audio/kenney/jingles/jingles_HIT03.ogg',
        lose: '/audio/common/lose.wav',
    },
    chickencross: {
        click: null,
        reveal: null,
        cashout: null,
        win: null,
        lose: null,
    },
    tower: {
        click: null,
        reveal: null,
        cashout: null,
        win: null,
        lose: null,
    },
    roulette: {
        click: '/audio/kenney/casino/chip-lay-1.ogg',
        chip: '/audio/kenney/casino/chips-stack-1.ogg',
        spin: '/audio/cases/multispin.wav',
        tick: '/audio/cases/tick.wav',
        land: '/audio/cases/land.wav',
        win: '/audio/kenney/jingles/jingles_HIT03.ogg',
        lose: '/audio/common/lose.wav',
    },
}

export function resolveSfx(slug, role) {
    const game = sfxManifest[slug]
    if (game && Object.prototype.hasOwnProperty.call(game, role)) {
        return game[role] || null
    }
    const common = sfxManifest.common || {}
    if (Object.prototype.hasOwnProperty.call(common, role)) {
        return common[role] || null
    }
    return null
}

// Per-template slot SFX roles. Each slot template can emit these when the
// matching feature fires; paths are mapped by `sfxManifest.slots` above.
export const slotSfxRoles = {
    spinStart: 'Reels start',
    reelStop: 'Per-reel stop',
    reelTick: 'Reel deceleration tick',
    settle: 'All reels settled',
    winLine: 'A line/cluster win plays',
    bigWin: 'Win threshold crossed',
    scatter: 'Scatter hit',
    bonusEnter: 'Bonus round enters',
    bonusExit: 'Bonus round closes',
    wheelLand: 'Multiplier wheel pointer lands',
    holdFill: 'Hold-and-respin tile fills',
    stickyLock: 'Sticky wild locks',
    mysteryReveal: 'Mystery symbol revealed',
    wantedSlam: 'Wanted-poster slam-in',
    moneyCollect: 'Bayou angler money collect',
    cascadeStep: 'Cascade tumble step',
    anticipation: 'Pre-stop anticipation',
}
