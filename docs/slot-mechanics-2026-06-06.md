# Slot Mechanical Distinctness (2026-06-06)

Make all 20 slot templates mechanically distinct by wiring 7 declared-but-dead
features, recalibrating RTP, and adding per-mechanic presentation.

User decisions: all 7 features; cap persistent multiplier; keep current RTP
targets (recalibrate scalars to hold them); coin-meter fill → free-spins burst;
Phase C presentation must work desktop + mobile; ship A+B then C.

## Audit (pre-work) — dead features collapsing templates

| Dead feature | Templates | Reality |
|---|---|---|
| expandingWilds | dust-rail, storm-banner | wild acts ordinary; label event only |
| stackedWildReel (minStack/lineBoost) | blue-samurai, ghostblade, miko | no full-reel-wild, no boost |
| scarabRespin | scarab-spin | scarab = ordinary wild |
| classicThreeReel jackpot | bars | 60x jackpot never paid |
| persistentMultiplier | gates, phoenix, mansion, miko, gummy | never multiplied into return (display pill) |
| cascade on megaways | phoenix, mansion | tumble gated to cluster/pay-anywhere |
| coinMeter fill bonus | vault-rush, coop-cluck | filling meter does nothing |

Feel-alike buckets before fix: LINES+wild (river/dust/blue-samurai), WAYS+wild
(storm/scarab), CLUSTER+cascade (bassline/mummy/gummy), MEGAWAYS (phoenix/mansion).

Genuinely unique already: wanted (mystery), bass-bayou (money), ghostblade
(zones), iron-fist (wheel), forge (hold&respin), miko (sticky), gates
(pay-anywhere), bars (micro grid).

## Phase A — wire mechanics (slotFactory.js resolveSlotSpin)
1. expandingWilds: a landed wild expands to fill its column before eval.
2. stackedWildReel: >= minStack wilds in a column → whole column wild + lineBoost on wins using it.
3. scarabRespin: 3+ scarab(wild) lock + 1 respin; locked cells stay wild.
4. classicThreeReel: triple jackpot symbol pays jackpotMultiplier (bars).
5. persistentMultiplier: thread session multiplier into the returned multiplier; cap (default x10) so variance stays bounded; grows on retrigger/cascade.
6. cascade on megaways: extend tumble to megaways eval.
7. coinMeter fill: when the meter reaches target, award a free-spins burst (+ reset meter).

## Phase B — recalibrate
Each change shifts EV. Extend calibration session model (persistent mult, respin),
regenerate slotRtpScalars.js, verify all 20 within tolerance (±3pp; ±6/10 for very-high/wheel).

## Phase C — presentation (desktop + mobile)
Per-mechanic overlays/animation: expanding-wild reel sweep, stacked-wild glow,
scarab lock-in, jackpot flash, persistent-mult ramp badge, megaways tumble, coin
vault crack. Update feature contracts to describe the now-real mechanics.

## Progress
- (in progress)
