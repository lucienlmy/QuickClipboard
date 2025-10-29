import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import removeConsole from 'vite-plugin-remove-console'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  root: 'src',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },

  envPrefix: ['VITE_', 'TAURI_'],

  plugins: [
    UnoCSS(),
    react(),
    process.env.NODE_ENV === 'production' || (!process.env.TAURI_DEBUG && process.env.NODE_ENV !== 'development')
      ? removeConsole({
        includes: ['log', 'debug', 'info'],
        excludes: ['error', 'warn']
      })
      : null
  ].filter(Boolean),
  
  build: {
    outDir: '../dist',
    target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
      },
    },
  },
})
