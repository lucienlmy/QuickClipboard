import { Virtuoso } from 'react-virtuoso'
import ClipboardItem from './ClipboardItem'

function ClipboardList({ items }) {
  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          暂无剪贴板记录
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-white dark:bg-gray-900 overflow-hidden">
      <Virtuoso
        data={items}
        itemContent={(index, item) => (
          <div className="px-2.5 pb-2 pt-1">
            <ClipboardItem 
              item={item} 
              index={index}
            />
          </div>
        )}
        style={{ height: '100%' }}
      />
    </div>
  )
}

export default ClipboardList

