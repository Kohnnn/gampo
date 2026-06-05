# Gameplay + Odds + Progression Overhaul (2026-06-05)

User directives:
1. Realistic casino RTPs; add a **Fun Mode** that boosts odds, but ONLY in free play.
2. Auto-calibrate slot RTP via simulation.
3. No player-favorable games (house edge always > 0 in normal mode).
4. Make all 20 slot templates mechanically distinct (unique reels/anim/bonus), not reskins; describe mechanics in the feature contract.
5. Distinct animations + bonuses per template.
6. One-time starter pack + daily claim + level-up rewards = true single-player progression. Free play stays default.
7. Ship all tracks in order.

## Audit findings (pre-work)

### Slot RTP (slotFactory.js) — no normalization
`rtpTarget` is display-only. Payout constants are identical across templates → emergent RTP drifts wildly:
- ways: ~130–235% base (scarab-spin ~235%, vault-rush ~326% w/ features)
- cluster/pay-anywhere: mummy-cascade ~545%, gummy/coop similar
- lines: ~20–25% (Bars ~1%)
- free spins = zero-cost full-EV respins (compounds over-generosity)

### Non-slot games flagged (effective RTP vs stated)
| Game | Stated | Actual | Root cause |
|---|---|---|---|
| Diamonds | 96% | ~258% | 1.1x payout on near-certain 2-match |
| Wheel | 96% | 108–350% | segment averages > 1.0 |
| Moles | 96% | 96–144% | hit-lift formula favourable |
| RPS | 97% | 130% | push refunds stake (unfunded) |
| Pump | 96% | 104%/step | every pump +EV |
| Hi-Lo | 96% | ~104% | tie refunds stake (unfunded) |
| Tower | 96% | 85–100% | fixed growth, not RTP-locked |
| Chicken Cross | 98% | 90–100% | fixed growth |
| Keno | 92% | ~61% | paytable tuned for 80-ball; engine draws 10/40 |
| Baccarat | 98.9% | ~89% | tie loses instead of pushing |

Correct pattern already in Snakes/Slide: `multiplier = fairMultiplier * (1 - houseEdge)`.

### UI/UX bugs (confirmed live)
- Mobile action button transparent: bet dock portaled to `<body>`, `--accent` not inherited → `background: var(--accent)` empty.
- Roulette ball stuck center: transitions unregistered `--ball-radius`; `translateY(46%)` resolves vs 14px ball not wheel radius.
- Poker uses its own tiny PokerCard (not shared CardFace); GTO "Find hand" search in a 260px-capped mobile sidebar.

## Target RTPs (realistic casino, normal mode)
- Slots: 96.0% (high-vol templates 94.5–95.5%), per-template `rtpTarget` retained as the convergence goal.
- Blackjack 99.5%, Baccarat 98.9% (banker), Video Poker 99.5%, Roulette 97.3%, Sic Bo 97.2%.
- Dice/Limbo 99%, Coinflip 98%, Keno 92%, Wheel 96%, RPS 97%, Hi-Lo 96%, Color 96%, Guess 94%.
- Arcade (Diamonds/Moles/Pump/Tower/ChickenCross/Darts/Slide/Snakes/War): lock to stated via fair×(1−edge).

## Fun Mode
- Global toggle in CreditContext, persisted `gampo_fun_mode`. Default OFF.
- When ON (free play only): multiplies win probability / payout via a `funBoost` factor surfaced to game math (a shared `applyFunMode` helper). Clearly labelled "Fun Mode — boosted odds, not real casino math."
- Auto-disabled and hidden once a starter pack is claimed OR locked behind an explicit free-play indicator so progression stays honest.

## Tracks
- Track 2 (UI quick wins): dock accent, roulette ball, poker cards/GTO mobile, button contrast sweep.
- Track 1 (RTP engine): shared `rtpLock` helper + non-slot fixes; slot sim-calibration + convergence test.
- Track 3 (slots feel): reel strips, payline draw, per-template distinct mechanics + bonus + feature-contract detail.
- Track 4 (progression): one-time starter pack, daily claim, level-up rewards.

Ship + deploy after each track. Gate: vitest + build + browser smoke (492/375).

## Progress
- (in progress)
