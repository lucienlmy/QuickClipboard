import { defineConfig } from 'vite'
import { resolve } from 'path'
import removeConsole from 'vite-plugin-remove-console'

export default defineConfig({
  root: 'src',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },

  envPrefix: ['VITE_', 'TAURI_'],

  // 插件配置
  plugins: [
    // 判断是否为生产环境
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
    // 启用 CSS 代码分割
    cssCodeSplit: true,
    // 设置 chunk 大小警告限制
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        settings: resolve(__dirname, 'src/settings/index.html'),
        preview: resolve(__dirname, 'src/preview.html'),
        textEditor: resolve(__dirname, 'src/textEditor.html'),
        screenshot: resolve(__dirname, 'src/screenshot/index.html'),
        pinImage: resolve(__dirname, 'src/pinImage/pinImage.html'),
        contextMenu: resolve(__dirname, 'src/plugins/context_menu/contextMenu.html'),
        inputDialog: resolve(__dirname, 'src/plugins/input_dialog/inputDialog.html'),
      },
      output: {
        // 手动分割代码块，减小单个文件大小
        manualChunks(id) {
          // 将 node_modules 中的依赖分离到 vendor chunk
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
        // 优化资源文件名
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
      },
    },
  },
})