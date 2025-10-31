import { useSnapshot } from 'valtio'
import { clipboardStore } from '@shared/store/clipboardStore'
import ClipboardList from './ClipboardList'

function ClipboardTab({ contentFilter, searchQuery }) {
  const snap = useSnapshot(clipboardStore)

  // 过滤逻辑
  const filteredItems = snap.items.filter(item => {
    // 搜索过滤
    if (searchQuery && !item.content?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    
    // 类型过滤
    const contentType = item.content_type || item.type || 'text'
    if (contentFilter !== 'all') {
      if (contentFilter === 'text') {
        if (contentType !== 'text' && contentType !== 'rich_text') {
          return false
        }
      } else if (contentType !== contentFilter) {
        return false
      }
    }
    
    return true
  })

  return (
    <div className="h-full flex flex-col">
      {/* 列表 */}
      <ClipboardList items={filteredItems} />
    </div>
  )
}

export default ClipboardTab

