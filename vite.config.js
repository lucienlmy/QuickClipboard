import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import UnoCSS from 'unocss/vite'
import { resolve } from 'path'
import { existsSync } from 'fs'

const isDev = process.env.NODE_ENV === 'development'
const isTauriDebug = process.env.TAURI_DEBUG === 'true'
const isCommunity = process.env.QC_COMMUNITY === '1'

export default defineConfig({
  root: 'src',
  clearScreen: false,

  server: {
    port: 1421,
    strictPort: true,
    fs: {
      allow: [
        resolve(__dirname, '.'),
        resolve(__dirname, 'node_modules'),
        resolve(__dirname, 'src'),
      ],
    },
  },

  envPrefix: ['VITE_', 'TAURI_'],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@windows': resolve(__dirname, 'src/windows'),
      'uno.css': 'virtual:uno.css',
    },
  },

  plugins: [
    UnoCSS({
      mode: 'global',
      inspector: false,
    }),
    react({
      babel: {
        plugins: [
          ['babel-plugin-react-compiler', {}],
        ],
      },
    }),
  ],

  build: {
    outDir: '../dist',
    target: process.env.TAURI_PLATFORM === 'windows'
      ? 'chrome105'
      : 'safari13',

    minify: isDev || isTauriDebug ? false : 'esbuild',

    esbuild: isDev || isTauriDebug
      ? {}
      : {
          drop: ['debugger'],
          pure: ['console.log', 'console.info', 'console.debug'],
        },

    sourcemap: isDev || isTauriDebug,
    cssCodeSplit: true,

    rollupOptions: {
      input: (() => {
        const inputs = {
          main: resolve(__dirname, 'src/windows/main/index.html'),
          settings: resolve(__dirname, 'src/windows/settings/index.html'),
          quickpaste: resolve(__dirname, 'src/windows/quickpaste/index.html'),
          textEditor: resolve(__dirname, 'src/windows/textEditor/index.html'),
          contextMenu: resolve(__dirname, 'src/plugins/context_menu/contextMenu.html'),
          inputDialog: resolve(__dirname, 'src/plugins/input_dialog/inputDialog.html'),
          pinImage: resolve(__dirname, 'src/windows/pinImage/pinImage.html'),
          updater: resolve(__dirname, 'src/windows/updater/index.html'),
        }
        const screenshotPath = resolve(__dirname, 'src/windows/screenshot/index.html')
        if (!isCommunity && existsSync(screenshotPath)) {
          inputs.screenshot = screenshotPath
        }
        return inputs
      })(),

      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',

        manualChunks(id) {
          const nmMatch = id.match(/[\\/]node_modules[\\/]/)

          const sharedMatch = id.includes('/shared/') || id.includes('\\shared\\')
          if (!nmMatch) {
            if (sharedMatch) return 'shared'
            return undefined
          }

          const nmIdx = Math.max(id.lastIndexOf('/node_modules/'), id.lastIndexOf('\\node_modules\\'))
          const after = nmIdx >= 0
            ? id.slice(nmIdx + (id[nmIdx] === '/' ? '/node_modules/'.length : '\\node_modules\\'.length))
            : id

          const segs = after.split(/[\\/]/).filter(Boolean)
          const pkg = segs[0]?.startsWith('@') ? `${segs[0]}/${segs[1] || ''}` : (segs[0] || '')

          if (
            pkg === 'pixi.js' ||
            pkg.startsWith('@pixi/') ||
            pkg === '@pixi/graphics-smooth' ||
            pkg === '@pixi' ||
            pkg === 'eventemitter3'
          ) {
            return 'pixi'
          }

          if (pkg === '@tabler/icons-webfont') return 'icons'

          if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') return 'react'

          if (pkg.startsWith('@codemirror/') || pkg === 'codemirror') return 'editor'

          if (pkg.startsWith('@tauri-apps/')) return 'tauri'

          return 'vendor'
        },
      },
    },
  },
})
