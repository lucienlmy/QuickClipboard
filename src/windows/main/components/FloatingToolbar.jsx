import { IconArrowBarToUp, IconPlus, IconGripHorizontal } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { useState, useRef, useEffect } from 'react'

function FloatingToolbar({ 
  showScrollTop = false, 
  showAddFavorite = false,
  onScrollTop,
  onAddFavorite 
}) {
  const { t } = useTranslation()
  const [bottomPosition, setBottomPosition] = useState(16)
  const [isDragging, setIsDragging] = useState(false)
  const [maxBottom, setMaxBottom] = useState(null)
  const dragRef = useRef({ startY: 0, startBottom: 0 })
  const containerRef = useRef(null)
  
  // 判断是否应该显示工具栏
  const shouldShow = showScrollTop || showAddFavorite
  
  // 计算最大位置并调整当前位置
  useEffect(() => {
    if (!containerRef.current) return
    
    const updateMaxBottom = () => {
      const parent = containerRef.current.offsetParent
      if (parent) {
        const parentHeight = parent.clientHeight
        const toolbarHeight = containerRef.current.clientHeight
        const newMaxBottom = parentHeight - toolbarHeight - 16
        setMaxBottom(newMaxBottom)
        
        setBottomPosition(prev => Math.min(prev, newMaxBottom))
      }
    }
    
    const timer = setTimeout(updateMaxBottom, 250)
    
    window.addEventListener('resize', updateMaxBottom)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', updateMaxBottom)
    }
  }, [shouldShow, showScrollTop, showAddFavorite])
  
  // 处理拖拽开始
  const handleDragStart = (e) => {
    e.preventDefault()
    setIsDragging(true)
    dragRef.current = {
      startY: e.clientY,
      startBottom: bottomPosition
    }
  }
  
  // 处理拖拽移动
  useEffect(() => {
    if (!isDragging) return
    
    const handleMouseMove = (e) => {
      const deltaY = dragRef.current.startY - e.clientY
      let newBottom = dragRef.current.startBottom + deltaY
      newBottom = Math.max(16, newBottom)
      if (maxBottom !== null) {
        newBottom = Math.min(newBottom, maxBottom)
      }
      setBottomPosition(newBottom)
    }
    
    const handleMouseUp = () => {
      setIsDragging(false)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, bottomPosition, maxBottom])
  
  // 工具栏容器类名
  const containerClasses = `
    absolute
    right-4
    flex flex-col
    bg-white dark:bg-gray-800
    rounded-md
    shadow-lg
    p-1
    z-30
    border border-gray-300/80 dark:border-gray-700/30
    ${isDragging ? '' : 'transition-all duration-300'}
    ${shouldShow ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}
  `.trim().replace(/\s+/g, ' ')
  
  // 按钮基础类名
  const buttonClasses = `
    flex items-center justify-center
    w-6 h-6
    rounded
    bg-gray-100 dark:bg-gray-700
    hover:bg-gray-200 dark:hover:bg-gray-600
    text-gray-700 dark:text-gray-200
    transition-colors duration-150
    cursor-pointer
  `.trim().replace(/\s+/g, ' ')

  const getButtonWrapperClasses = (show, hasMargin) => `
    transition-all duration-200 origin-center overflow-hidden
    ${show ? `opacity-100 scale-100 h-6 ${hasMargin ? 'mt-1' : ''}` : 'opacity-0 scale-0 h-0 mt-0'}
  `.trim().replace(/\s+/g, ' ')
  
  // 拖拽手柄类名
  const dragHandleClasses = `
    w-full h-2 mt-1
    flex items-center justify-center
    ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}
    text-gray-400 dark:text-gray-600
    hover:text-gray-600 dark:hover:text-gray-400
    transition-colors duration-150
  `.trim().replace(/\s+/g, ' ')
  
  return (
    <div 
      ref={containerRef}
      className={containerClasses}
      style={{ bottom: `${bottomPosition}px` }}
      data-no-drag
    >
      {/* 返回顶部按钮 */}
      <div className={getButtonWrapperClasses(showScrollTop, false)}>
        <button
          className={buttonClasses}
          onClick={onScrollTop}
          title={t('floatingToolbar.scrollToTop')}
          aria-label={t('floatingToolbar.scrollToTop')}
        >
          <IconArrowBarToUp size={14} stroke={2.5} />
        </button>
      </div>
      
      {/* 添加收藏按钮 */}
      <div className={getButtonWrapperClasses(showAddFavorite, showScrollTop)}>
        <button
          className={buttonClasses}
          onClick={onAddFavorite}
          title={t('floatingToolbar.addFavorite')}
          aria-label={t('floatingToolbar.addFavorite')}
        >
          <IconPlus size={14} stroke={2.5} />
        </button>
      </div>
      
      {/* 拖拽手柄 */}
      <div 
        className={dragHandleClasses}
        onMouseDown={handleDragStart}
        title={t('floatingToolbar.dragToMove')}
      >
        <IconGripHorizontal size={14} stroke={2.5} />
      </div>
    </div>
  )
}

export default FloatingToolbar

