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
        click: null,
        reveal: null,
        win: null,
        lose: null,
        cashout: null,
    },
    dice: {
        click: null,
        roll: null,
        tick: null,
        land: null,
        win: null,
        lose: null,
    },
    mines: {
        click: null,
        reveal: null,
        cashout: null,
        win: null,
        lose: null,
    },
    keno: {
        click: null,
        reveal: null,
        win: null,
        lose: null,
    },
    limbo: {
        click: null,
        tick: null,
        win: null,
        lose: null,
    },
    crash: {
        click: null,
        tick: null,
        cashout: null,
        win: null,
        lose: null,
    },
    plinko: {
        click: null,
        peg: null,
        bucket: null,
        win: null,
        lose: null,
    },
    wheel: {
        click: null,
        tick: null,
        win: null,
        lose: null,
    },
    blackjack: {
        click: null,
        reveal: null,
        win: null,
        lose: null,
    },
    hilo: {
        click: null,
        flip: null,
        win: null,
        lose: null,
    },
    baccarat: {
        click: null,
        reveal: null,
        win: null,
        lose: null,
    },
    videopoker: {
        click: null,
        reveal: null,
        win: null,
        lose: null,
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
        click: null,
        // Wave 18: declared but silent until binaries land.
        // open    -> latch click as the lid pops
        // tick    -> per-tile tick while the carousel decelerates
        // land    -> final stop thunk when the pointer locks
        // rare    -> chime when a Covert/Extraordinary lands
        // reveal  -> generic reveal sting on the result card
        // win     -> profit > 0 sting
        // lose    -> profit <= 0 sting
        open: null,
        tick: null,
        land: null,
        rare: null,
        reveal: null,
        win: null,
        lose: null,
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
        click: null,
        reveal: null,
        win: null,
        lose: null,
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
        click: null,
        reveal: null,
        win: null,
        lose: null,
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
