import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { invoke } from '@tauri-apps/api/core'
import { Virtuoso } from 'react-virtuoso'
import { useSnapshot } from 'valtio'
import { useTranslation } from 'react-i18next'
import { navigationStore } from '@shared/store/navigationStore'
import { groupsStore } from '@shared/store/groupsStore'
import { clipboardStore, loadClipboardRange, pasteClipboardItem, initClipboardItems } from '@shared/store/clipboardStore'
import { favoritesStore, loadFavoritesRange, pasteFavorite, initFavorites } from '@shared/store/favoritesStore'
import { ImageContent, FileContent } from '@windows/main/components/ClipboardContent'
import { getPrimaryType } from '@shared/utils/contentType'

function QuickPasteWindow() {
  const { t } = useTranslation()
  const virtuosoRef = useRef(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isHoveringCancel, setIsHoveringCancel] = useState(false)

  const navSnap = useSnapshot(navigationStore)
  const groupSnap = useSnapshot(groupsStore)
  const clipSnap = useSnapshot(clipboardStore)
  const favSnap = useSnapshot(favoritesStore)

  const isClipboardTab = navSnap.activeTab === 'clipboard'
  const currentItems = isClipboardTab ? clipSnap.items : favSnap.items
  const totalCount = isClipboardTab ? clipSnap.totalCount : favSnap.totalCount

  const itemsArray = useMemo(() =>
    Array.from({ length: totalCount }, (_, i) => currentItems.get(i) || null),
    [currentItems, totalCount]
  )

  const title = isClipboardTab
    ? t('settings.quickpaste.window.clipboardHistory')
    : groupSnap.currentGroup

  // 处理点击取消
  const handleCancelClick = async () => {
    setIsHoveringCancel(true)
    const window = getCurrentWebviewWindow()
    await window.hide()
  }

  const handleItemClick = useCallback((item, index) => {
    if (!item) return
    setActiveIndex(index)
  }, [])

  // 窗口隐藏时执行粘贴
  useEffect(() => {
    const unlisten = listen('quickpaste-hide', async () => {
      if (isHoveringCancel) return
      const item = itemsArray[activeIndex]
      if (!item) return

      try {
        isClipboardTab
          ? await pasteClipboardItem(item.id)
          : await pasteFavorite(item.id)
      } catch (error) {
        console.error('粘贴失败:', error)
      }
    })
    return () => unlisten.then(fn => fn())
  }, [isHoveringCancel, activeIndex, itemsArray, isClipboardTab])

  useEffect(() => {
    const unlisten = listen('quickpaste-show', () => {
      setActiveIndex(0)
      setIsHoveringCancel(false)
      virtuosoRef.current?.scrollToIndex({ index: 0, align: 'start', behavior: 'auto' })
    })
    return () => unlisten.then(fn => fn())
  }, [])
  
  useEffect(() => {
    const unlisten = listen('navigation-changed', async (event) => {
      const { activeTab, currentGroup } = event.payload
      
      navigationStore.activeTab = activeTab
      if (currentGroup !== undefined) {
        groupsStore.currentGroup = currentGroup
      }
      
      if (activeTab === 'clipboard') {
        await initClipboardItems()
      } else {
        await initFavorites()
      }
    })
    return () => unlisten.then(fn => fn())
  }, [])

  useEffect(() => {
    setActiveIndex(0)
    virtuosoRef.current?.scrollToIndex({ index: 0, align: 'start', behavior: 'auto' })
  }, [navSnap.activeTab, groupSnap.currentGroup, totalCount])

  // 滚轮切换项
  useEffect(() => {
    const unlisten = listen('quickpaste-scroll', (e) => {
      setActiveIndex(prev => {
        const max = totalCount - 1
        return e.payload.direction === 'up'
          ? (prev > 0 ? prev - 1 : max)
          : (prev < max ? prev + 1 : 0)
      })
    })
    return () => unlisten.then(fn => fn())
  }, [totalCount])

  useEffect(() => {
    virtuosoRef.current?.scrollToIndex({ index: activeIndex, align: 'center', behavior: 'auto' })
  }, [activeIndex])

  const handleRangeChanged = useCallback(async ({ startIndex, endIndex }) => {
    let start = -1, end = -1
    for (let i = startIndex; i <= Math.min(endIndex, totalCount - 1); i++) {
      if (!currentItems.has(i)) {
        if (start === -1) start = i
        end = i
      }
    }
    if (start !== -1) {
      const s = Math.max(0, start - 10)
      const e = Math.min(totalCount - 1, end + 10)
      isClipboardTab
        ? await loadClipboardRange(s, e)
        : await loadFavoritesRange(groupSnap.currentGroup, s, e)
    }
  }, [totalCount, currentItems, isClipboardTab, groupSnap.currentGroup])

  useEffect(() => {
    let resizeTimeout
    
    const handleResize = async () => {
      const window = getCurrentWebviewWindow()
      const size = await window.innerSize()
      const scaleFactor = await window.scaleFactor()

      const logicalWidth = size.width / scaleFactor
      const logicalHeight = size.height / scaleFactor

      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(async () => {
        try {
          await invoke('save_quickpaste_window_size', {
            width: Math.round(logicalWidth),
            height: Math.round(logicalHeight)
          })
        } catch (error) {
          console.error('保存窗口尺寸失败:', error)
        }
      }, 500)
    }
    
    const unlisten = listen('tauri://resize', handleResize)
    
    return () => {
      clearTimeout(resizeTimeout)
      unlisten.then(fn => fn())
    }
  }, [])

  // 渲染内容
  const renderItemContent = (item) => {
    if (!item || !item.content_type) {
      return (
        <div className="w-full min-h-[32px] flex items-center">
          <span className="truncate text-gray-400">加载中...</span>
        </div>
      )
    }

    const primaryType = getPrimaryType(item.content_type)

    if (primaryType === 'image') {
      return (
        <div className="w-full h-14 overflow-hidden rounded-sm bg-gray-100 dark:bg-gray-900">
          <ImageContent item={item} />
        </div>
      )
    }

    if (primaryType === 'file') {
      return (
        <div className="w-full">
          <FileContent item={item} compact={true} />
        </div>
      )
    }

    return (
      <div className="w-full min-h-[32px] flex items-center">
        <span className="truncate">{item.content}</span>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-lg shadow-2xl overflow-hidden">
      <style>{`
        * { box-sizing: border-box; }
        .quickpaste-scrollbar-container div[style*="overflow"]{scrollbar-width:none!important;-ms-overflow-style:none!important}
        .quickpaste-scrollbar-container div[style*="overflow"]::-webkit-scrollbar{display:none!important}
      `}</style>

      {/* 顶部 */}
      <div className="flex-shrink-0 px-2 py-2 bg-gradient-to-b from-gray-50/50 dark:from-gray-800/50 to-transparent">
        <div className="flex items-center gap-1">
          <div className="w-0.5 h-3.5 bg-blue-500 dark:bg-blue-400 rounded-full flex-shrink-0" />
          <h2 className="flex-1 text-xs font-medium text-gray-700 dark:text-gray-300 truncate overflow-hidden">{title}</h2>
          <span className="text-[10px] text-gray-400 dark:text-gray-600 font-mono flex-shrink-0">{totalCount}</span>
        </div>
      </div>

      {/* 列表 */}
      {!totalCount ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-gray-400 dark:text-gray-600">
            {isClipboardTab ? t('settings.quickpaste.window.emptyClipboard') : t('settings.quickpaste.window.emptyFavorites')}
          </span>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden quickpaste-scrollbar-container">
          <Virtuoso
            ref={virtuosoRef}
            totalCount={totalCount}
            rangeChanged={handleRangeChanged}
            increaseViewportBy={{ top: 100, bottom: 100 }}
            style={{ height: '100%' }}
            itemContent={(index) => {
              const item = itemsArray[index]
              const active = activeIndex === index

              return item ? (
                <div className="px-2 py-1">
                  <div 
                    className={`relative pl-6 pr-2 py-2 rounded-md transition-all cursor-pointer ${active ? 'bg-gradient-to-r from-blue-500/20 to-blue-400/10 dark:from-blue-500/30 dark:to-blue-400/20 shadow-sm' : 'bg-gray-50/80 dark:bg-gray-800/50 hover:bg-gray-100/80 dark:hover:bg-gray-800/80'}`}
                    onClick={() => handleItemClick(item, index)}
                  >
                    {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3/4 bg-blue-500 dark:bg-blue-400 rounded-r-full" />}
                    <span className={`absolute left-1.5 top-2.5 text-[9px] font-bold ${active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-600'}`}>{index + 1}</span>
                    <div className={`text-xs ${active ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-700 dark:text-gray-400'}`}>
                      {renderItemContent(item)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-2 py-1">
                  <div className="px-2 py-2 bg-gray-100/50 dark:bg-gray-800/50 rounded-md overflow-hidden">
                    <div className="text-xs bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse h-10" />
                  </div>
                </div>
              )
            }}
          />
        </div>
      )}

      {/* 底部 */}
      <div
        className={`flex-shrink-0 px-2 py-2 text-center text-[10px] font-medium transition-all rounded-b-lg overflow-hidden cursor-pointer ${isHoveringCancel ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30' : 'bg-gradient-to-b from-transparent to-red-50/50 dark:to-red-900/10 text-red-500 dark:text-red-400'}`}
        onMouseEnter={() => setIsHoveringCancel(true)}
        onMouseLeave={() => setIsHoveringCancel(false)}
        onClick={handleCancelClick}
      >
        <span className="truncate overflow-hidden">
          {isHoveringCancel ? t('settings.quickpaste.window.cancelHover') : t('settings.quickpaste.window.cancelNormal')}
        </span>
      </div>
    </div>
  )
}

export default QuickPasteWindow
