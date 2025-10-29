import { useState } from 'react'
import { useTranslation } from 'react-i18next'

function QuickTextsTab() {
  const { t } = useTranslation()
  
  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-gray-500 dark:text-gray-400">
        {t('quickTexts.empty') || '暂无常用内容'}
      </p>
    </div>
  )
}

export default QuickTextsTab

