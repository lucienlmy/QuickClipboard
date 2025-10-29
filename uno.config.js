import { defineConfig, presetUno, presetAttributify, presetIcons } from 'unocss'

export default defineConfig({
  // 配置扫描的文件
  content: {
    pipeline: {
      include: [
        './windows/**/*.{html,js,jsx,ts,tsx}',
        './shared/**/*.{html,js,jsx,ts,tsx}',
        './index.html',
        './src/**/*.{html,js,jsx,ts,tsx}',
      ],
    },
  },
  presets: [
    presetUno(),
    presetAttributify(), 
    presetIcons({
      scale: 1.2,
      warn: true,
    }),
  ],
  shortcuts: {
    'btn': 'px-4 py-2 rounded cursor-pointer transition-all duration-200',
    'btn-primary': 'btn bg-blue-500 text-white hover:bg-blue-600',
    'btn-secondary': 'btn bg-gray-500 text-white hover:bg-gray-600',
    'card': 'bg-white dark:bg-gray-800 rounded-lg shadow-md p-4',
    'input': 'px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500',
  },
  theme: {
    colors: {
      primary: {
        50: '#eff6ff',
        100: '#dbeafe',
        200: '#bfdbfe',
        300: '#93c5fd',
        400: '#60a5fa',
        500: '#3b82f6',
        600: '#2563eb',
        700: '#1d4ed8',
        800: '#1e40af',
        900: '#1e3a8a',
      },
    },
  },
  safelist: [
    // 确保关键类名在首次加载时就生成
    'h-screen', 'w-screen', 'flex', 'flex-col', 'flex-1', 'overflow-hidden',
    'bg-white', 'bg-gray-50', 'bg-gray-100', 'bg-gray-200', 'bg-gray-800', 'bg-gray-900',
    'bg-white/90', 'dark:bg-gray-900/90',
    'dark:bg-gray-700', 'dark:bg-gray-800', 'dark:bg-gray-900',
    'bg-blue-50', 'dark:bg-blue-900/20',
    'text-gray-100', 'text-gray-200', 'text-gray-400', 'text-gray-500', 'text-gray-600', 'text-gray-700', 'text-gray-800', 'text-gray-900',
    'dark:text-gray-100', 'dark:text-gray-200', 'dark:text-gray-300', 'dark:text-gray-400', 'dark:text-gray-500',
    'text-blue-400', 'text-blue-600',
    'dark:text-blue-400',
    'border-gray-200', 'border-gray-300', 'border-gray-700', 'dark:border-gray-700',
    'border-blue-200', 'dark:border-blue-800',
    'rounded-lg', 'rounded-md', 'rounded-sm',
    'object-cover', 'object-contain',
    'h-7', 'h-10', 'h-11', 'h-[50px]', 'h-[90px]', 'h-[120px]',
    'px-1', 'px-1.5', 'px-2', 'px-2.5', 'px-3', 'py-0.5', 'py-1', 'py-1.5', 'py-2',
    'gap-0.5', 'gap-1', 'gap-1.5', 'gap-2', 'space-y-0.5', 'leading-tight', 'leading-none',
    'text-[9px]', 'text-[10px]', 'text-xs', 'text-sm', 'text-base',
    'min-w-[16px]', 'text-center', 'font-semibold', 'font-medium', 'pointer-events-none',
    'hover:bg-gray-100', 'hover:bg-gray-200', 'hover:bg-gray-300', 'dark:hover:bg-gray-700',
    'bg-blue-500', 'hover:bg-blue-600', 'text-white',
    'absolute', 'top-1', 'right-1', 'right-2', 'items-end',
  ],
  rules: [
  ],
})

