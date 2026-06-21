import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import { sportsbookProviderProxy } from './server/sportsbookProviderProxy.js'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')

    return {
        plugins: [react(), sportsbookProviderProxy(env)],
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./src"),
            },
        },
        server: {
            host: '0.0.0.0',
            allowedHosts: ['vdklbvkzbd1g.share.zrok.io'],
            port: 5173,
            open: false,
            watch: {
                ignored: ['**/example/**'],
            },
        },
        build: {
            outDir: 'dist',
            // Plinko row outcome tables are generated, route-lazy, and intentionally
            // ~2 MB per active row-count chunk. Keep warnings focused on unexpected chunks.
            chunkSizeWarningLimit: 2100,
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
