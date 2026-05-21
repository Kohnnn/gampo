import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

export default defineConfig({
    plugins: [react()],
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
        chunkSizeWarningLimit: 1500,
        rollupOptions: {
            output: {
                manualChunks: {
                    'react-vendor': ['react', 'react-dom', 'react-router-dom'],
                    'phaser': ['phaser'],
                    'matter': ['matter-js'],
                    'chart': ['chart.js'],
                },
            },
        },
    },
    test: {
        include: ['src/**/*.test.{js,jsx,ts,tsx}'],
        environment: 'node'
    }
})
