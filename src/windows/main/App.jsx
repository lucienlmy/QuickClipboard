import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { IconLanguage, IconPlus, IconSettings, IconCopy, IconClipboard } from '@tabler/icons-react'
import * as Switch from '@radix-ui/react-switch'
import * as Tabs from '@radix-ui/react-tabs'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { settingsStore } from '@shared/store/settingsStore'

function App() {
  const [count, setCount] = useState(0)
  const { t, i18n } = useTranslation()
  const { theme } = useSnapshot(settingsStore)

  const toggleLanguage = () => {
    const newLang = i18n.language === 'zh-CN' ? 'en-US' : 'zh-CN'
    i18n.changeLanguage(newLang)
    settingsStore.setLanguage(newLang)
  }

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    settingsStore.setTheme(newTheme)
  }

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden ${theme === 'dark' ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <IconClipboard size={32} className="text-blue-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-white">
              {t('app.title')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('app.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Tooltip.Provider>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  onClick={toggleLanguage}
                  className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <IconLanguage size={20} className="text-gray-600 dark:text-gray-300" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="bg-gray-900 text-white px-3 py-2 rounded-md text-sm"
                  sideOffset={5}
                >
                  {t('common.language')}: {i18n.language}
                  <Tooltip.Arrow className="fill-gray-900" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                <IconSettings size={20} className="text-gray-600 dark:text-gray-300" />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[220px] bg-white dark:bg-gray-800 rounded-lg p-2 shadow-lg border border-gray-200 dark:border-gray-700"
                sideOffset={5}
              >
                <DropdownMenu.Item className="flex items-center justify-between px-3 py-2 outline-none cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                  <span className="text-sm text-gray-700 dark:text-gray-200">{t('common.settings')}</span>
                </DropdownMenu.Item>
                
                <DropdownMenu.Separator className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
                
                <DropdownMenu.Item className="flex items-center justify-between px-3 py-2 outline-none">
                  <span className="text-sm text-gray-700 dark:text-gray-200">Dark Mode</span>
                  <Switch.Root
                    checked={theme === 'dark'}
                    onCheckedChange={toggleTheme}
                    className="w-11 h-6 bg-gray-300 rounded-full relative data-[state=checked]:bg-blue-500 transition-colors"
                  >
                    <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[22px]" />
                  </Switch.Root>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="h-full flex items-center justify-center p-6">
          <div className="w-full max-w-2xl">
            <Tabs.Root defaultValue="tab1" className="w-full">
              <Tabs.List className="flex gap-2 border-b border-gray-200 dark:border-gray-700 mb-6">
                <Tabs.Trigger
                  value="tab1"
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 border-b-2 border-transparent data-[state=active]:text-blue-500 data-[state=active]:border-blue-500 transition-colors"
                >
                  {t('clipboard.history')}
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="tab2"
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 border-b-2 border-transparent data-[state=active]:text-blue-500 data-[state=active]:border-blue-500 transition-colors"
                >
                  {t('screenshot.take')}
                </Tabs.Trigger>
              </Tabs.List>

              <Tabs.Content value="tab1" className="outline-none">
                <div className="card space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                      {t('app.description')}
                    </h3>
                    <button
                      onClick={() => setCount(count + 1)}
                      className="btn-primary flex items-center gap-2"
                    >
                      <IconPlus size={18} />
                      {t('common.count')}: {count}
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 mb-2">
                        <IconCopy size={20} className="text-blue-500" />
                        <span className="font-medium text-gray-700 dark:text-gray-200">
                          {t('clipboard.copy')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        UnoCSS + Radix UI
                      </p>
                    </div>
                    
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2 mb-2">
                        <IconClipboard size={20} className="text-green-500" />
                        <span className="font-medium text-gray-700 dark:text-gray-200">
                          {t('clipboard.paste')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        React 19 + i18n
                      </p>
                    </div>
                  </div>
                </div>
              </Tabs.Content>

              <Tabs.Content value="tab2" className="outline-none">
                <div className="card">
                  <p className="text-center text-gray-600 dark:text-gray-400">
                    {t('screenshot.take')} - {t('common.edit')}
                  </p>
                </div>
              </Tabs.Content>
            </Tabs.Root>
          </div>
        </div>
      </main>

      <footer className="flex-shrink-0 px-6 py-3 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-center text-gray-500 dark:text-gray-400">
          QuickClipboard v0.0.7-beta.1 • Powered by Tauri + React
        </p>
      </footer>
    </div>
  )
}

export default App

