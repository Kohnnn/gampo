# GamPo — UX, Slots, Progression & Animation Wave (2026-06-12)

Branch: `codex/gampo-polish-deploy`. Ships incrementally; this doc tracks plan + progress.

## Scope (from user direction)
1. **Header + Settings** — remove Fun Mode + Mute from the top bar entirely (settings-only);
   redesign the Settings page into clean grouped cards with toggles/sliders.
2. **Slot "How it plays"** — add plain-language explanations to every slot feature contract.
3. **Slot symbol sizing** — some assets render too small; per-template tuned scale bumps.
4. **Progression** — daily streak, achievement rewards, more achievements, rotating
   challenge pool, personal-best board.
5. **Bonus/animation polish** — FS-exit celebration, jackpot cinematic, retrigger pop,
   coin-meter fill-burst.
6. **QoL grab-bag**.

## Decisions
- Header: **remove all** audio/fun controls — top bar = settings gear + credit pill only.
- Progression: streak + achievement rewards + new achievements + **rotating challenges** + personal-best board.
- Symbol size: **moderate, per-template tuned**.
- Sequence: all batches, ship incrementally, single final commit + redeploy.

## Constraints (from investigation)
- Tests pin slot contract strings: iron-fist `2/3/5/10/20x` + `2x to 20x` (not `30x`),
  bars `30x headline jackpot` + `bonusEntry:null`, dust-rail no `sticky`/`retrigger`.
- Contract must keep `summary` + `mechanics[{name,detail}]`. New fields are fine.
- No test pins symbol-size CSS (safe to retune `slots.css:3177-3337`).
- Every new animation needs `.gampo-reduce-motion` (and ideally `.gampo-no-animations`) fallback.
- Progression chokepoint: `useGameSession.record`. Storage keys: `gampo_progress_stats`,
  `gampo_progress_unlocked`, `gampo_xp_state`, `gampo_missions_*`, `gampo_rewards`.

## Progress
- [x] B1 Header strip (Fun Mode + Mute removed; gear + credit pill only) + Settings hero/help copy refreshed; dead .header-funmode CSS removed
- [x] B2 Slot "How it plays" — auto-generated plain-language numbered steps on every template (buildHowToPlay), styled card above mechanics
- [x] B3 Slot symbol sizing — base scale/caps raised; mansion-megaways + vault-rush/dust-rail/iron-fist added to bump groups; mansion rank symbols bumped
- [x] B4 Progression — daily play streak (currentDayStreak/bestDayStreak/totalDaysPlayed), 16 new achievements incl. `daily` group, rotating daily challenge pool (deterministic per date) with claim, personal-best board in ProgressPanel
- [x] B5 Bonus/animation — bonus-exit celebration (gold treatment + falling coins + pulse on ≥20× sessions), jackpot cinematic (rotating ray burst + gold), reduce-motion + no-animations fallbacks
- [x] B6 QoL folded into B1-B5 (settings consolidation, plain-language explainers, streak, challenges, best board, celebration)
- [x] Gates: 511 tests green (+4), build clean, audit:all pass, smoke 0 overflow / 0 errors on /,/settings,/slots,/mansion-megaways,/cases

## Notes
- Welcome-modal "reappears each session" was investigated earlier and is not a bug (persists in localStorage; only re-shows in fresh browser profiles).
- mansion-megaways mobile smoke shows interaction=failed but errors=0 / overflow=0 — a harness probe quirk on the dense reel, not a regression.

