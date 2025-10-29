import { useTranslation } from 'react-i18next'

function App() {
  const { t } = useTranslation()

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      <header className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-bold text-gray-800 dark:text-white">
          {t('settings.title')}
        </h1>
      </header>
      
      <main className="flex-1 overflow-auto p-6">
        <p className="text-gray-600 dark:text-gray-400">
          {t('settings.general')}
        </p>
      </main>
    </div>
  )
}

export default App

