import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { clipboardStore } from '@shared/store/clipboardStore'
import SearchBar from './SearchBar'
import ClipboardList from './ClipboardList'

function ClipboardTab({ contentFilter }) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const snap = useSnapshot(clipboardStore)

  // 过滤逻辑
  const filteredItems = snap.items.filter(item => {
    // 搜索过滤
    if (searchQuery && !item.content?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    
    // 类型过滤
    const contentType = item.content_type || item.type || 'text'
    if (contentFilter !== 'all' && contentType !== contentFilter) {
      return false
    }
    
    return true
  })

  return (
    <div className="h-full flex flex-col">
      {/* 搜索栏 */}
      <SearchBar 
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder={t('search.placeholder') || '搜索剪贴板内容...'}
      />
      
      {/* 列表 */}
      <ClipboardList items={filteredItems} />
    </div>
  )
}

export default ClipboardTab

