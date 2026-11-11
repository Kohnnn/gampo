// ponytail: unavailable until process ownership and cleanup can be proven safe.
process.exitCode = 2
console.error('IndexedDB atomicity probe unavailable: safe process ownership and cleanup are unverified; IndexedDB atomicity is not verified.')
