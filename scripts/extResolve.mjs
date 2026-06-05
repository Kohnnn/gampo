// Minimal ESM resolver hook so plain Node can import the app's extensionless
// relative imports (Vite resolves these; Node needs explicit .js). Used only by
// calibration/sim scripts. Run: node --import ./scripts/extResolve.mjs <script>
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export async function resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/i.test(specifier)) {
        try {
            const base = context.parentURL
            const candidate = new URL(specifier + '.js', base)
            if (existsSync(fileURLToPath(candidate))) {
                return nextResolve(specifier + '.js', context)
            }
        } catch { /* fall through */ }
    }
    return nextResolve(specifier, context)
}
