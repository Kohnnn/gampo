import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import { sportsbookProviderProxy } from './server/sportsbookProviderProxy.js'
import { plinkoOutcomesStaticPlugin } from './scripts/plinkoOutcomesStaticPlugin.js'
import { resolveZrokDevAllowedHosts } from './src/config/devAllowedHosts.js'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')

    return {
        plugins: [react(), plinkoOutcomesStaticPlugin(), sportsbookProviderProxy(env)],
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./src"),
            },
        },
        server: {
            host: '0.0.0.0',
            allowedHosts: resolveZrokDevAllowedHosts(mode, env.GAMPO_ZROK_DEV_HOST),
            port: 5173,
            open: false,
            watch: {
                ignored: ['**/example/**'],
            },
        },
        build: {
            outDir: 'dist',
            // Plinko outcome tables are emitted as static JSON assets rather than
            // transformed JavaScript chunks; keep warnings focused on app chunks.
            chunkSizeWarningLimit: 2100,
            cssCodeSplit: false,
            rollupOptions: {
                output: {
                    manualChunks: {
                        'react-vendor': ['react', 'react-dom', 'react-router-dom'],
                        'chart': ['chart.js'],
                    },
                },
            },
        },
        test: {
            include: ['src/**/*.test.{js,jsx,ts,tsx}'],
            environment: 'node',
            // slotRtp.test.js runs Monte Carlo sims (~20s); vitest 4 default is 5s
            testTimeout: 60000,
        }
    }
})
