// Wave 9: this monolithic outcomes table was split into per-row chunks under
// `outcomes/rows-<N>.js` and is now loaded lazily via `plinkoOutcomesLoader.js`.
// The export is kept for backwards compatibility with anything that imported
// `OUTCOMES` directly. Existing code paths use the loader and never hit this.

export const OUTCOMES = {}
