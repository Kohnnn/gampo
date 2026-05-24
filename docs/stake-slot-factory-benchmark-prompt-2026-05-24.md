# Stake Slot Factory Benchmark Prompt

Use this prompt when handing the cleaned Stake expanded audit to another AI agent for the next Gampo slot-development pass.

```text
You are improving the Gampo fake-credit casino app by building a local slot-game factory inspired by the cleaned Stake expanded audit.

Audit root:
D:\gampo\rainbetclone\stake-expanded-games-audit-2026-05-24\

Primary gameplay references:
- Read screenshot-quality-manifest.json first.
- Use screenshots with status "primary" as gameplay references.
- Prefer screenshots/**/50-demo-session-*.png through 53-demo-session-*.png.
- Also use screenshots/**/71-stage-focus-loaded.png and screenshots/**/72-stage-focus-intro-dismissed.png when available.
- The verified stage-focus captures are 1094x452 PNGs and should drive gameplay layout, animation timing, reel framing, controls, win overlays, and feature behavior.
- Use status "context" screenshots only for lobby/page/control context.
- Do not use status "quarantine" screenshots as gameplay reference.

Hard rules:
- Do not copy Stake/provider source, art, shaders, WASM, audio, or CDN assets.
- Build clone-owned, generated, or licensed resources only.
- Keep Gampo fake-credit/educational: no deposits, withdrawals, real-money wagering, or provider RGS calls in v1.
- FortuneEngine can inspire future template/RGS planning, but do not integrate it in v1.

Goal:
Build Gampo-owned slot templates that feel close in gameplay structure and animation rhythm to the reference games, while using original themes/assets and deterministic fake-credit math.

Current first-wave implementation:
1. Runtime/config system: src/components/games/slots/slotFactory.js
2. Shared React slot shell: src/components/games/slots/SlotsGame.jsx
3. Shared stage styling: src/components/games/slots/slots.css
4. First-wave templates:
   - Vault Rush, benchmarked against The Big Bank
   - River Catcher, benchmarked against Le Catcher
   - Dust Rail Bounty, benchmarked against Bone and Bullets
   - Storm Banner, benchmarked against Angel of Asgard
   - Bassline Bonus, benchmarked against Big Bass Rock and Roll

Next implementation priorities:
1. Improve reel-stop animation with per-column easing and stronger anticipation on near-scatter states.
2. Add proper autoplay UX with stop conditions, session limits, and visible fake-credit safety copy.
3. Add per-template feature screens:
   - Coin collection and vault meter for Vault Rush
   - Character-side bonus framing for River Catcher
   - Wild column pulse for Dust Rail Bounty
   - Total-win reveal banner for Storm Banner
   - Intro volatility overlay and cascade-ready hits for Bassline Bonus
4. Replace placeholder symbol art with generated/licensed Gampo-owned symbols sized for the reel cells.
5. Add benchmark notes per title comparing:
   - layout
   - controls
   - spin timing
   - win/result presentation
   - feature affordances
   - missing deltas

Acceptance:
- npm run build passes.
- Each first-wave slot route can play fake-credit spins without real-money behavior.
- Each title has idle, spin/motion, result, and big-win/feature-visible states.
- Visual checks show no page-scroll or cropped-reference mistakes.
- Quarantined screenshots remain ignored for gameplay work.
```

## Reference Policy

The audit pack is visual and behavioral reference material only. Resource parity means matching visual role, timing, dimensions, and behavior using Gampo-owned resources, not copying provider binaries.
