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

  // 路径别名
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
      mode: 'global', // 使用全局模式，确保样式在所有入口中共享
    }),
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
      // 多窗口入口配置
      input: {
        main: resolve(__dirname, 'src/windows/main/index.html'),
        settings: resolve(__dirname, 'src/windows/settings/index.html'),
        preview: resolve(__dirname, 'src/windows/preview/index.html'),
        screenshot: resolve(__dirname, 'src/windows/screenshot/index.html'),
        textEditor: resolve(__dirname, 'src/windows/textEditor/index.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
          // 将共享代码分离
          if (id.includes('/shared/')) {
            return 'shared';
          }
        },
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
      },
    },
  },
})
