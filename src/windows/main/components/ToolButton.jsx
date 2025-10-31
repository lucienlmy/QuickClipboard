import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { toolsStore } from '@shared/store/toolsStore'
import { TOOL_REGISTRY } from '@shared/config/tools'

function ToolButton({ toolId, location, isDraggable = true, onAction }) {
  const { t } = useTranslation()
  const { states } = useSnapshot(toolsStore)
  
  const tool = TOOL_REGISTRY[toolId]
  if (!tool) return null
  
  const isActive = tool.type === 'toggle' ? states[toolId] : false
  const IconComponent = tool.icon
  
  const handleClick = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (onAction) {
      onAction(toolId, tool)
    } else {
      await toolsStore.handleToolClick(toolId)
    }
  }
  
  // 标题栏样式
  if (location === 'titlebar') {
    return (
      <button
        className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 ${
          isActive 
            ? 'bg-blue-500 text-white hover:bg-blue-600' 
            : 'hover:bg-white/80 dark:hover:bg-gray-700/60 hover:shadow-sm hover:scale-105 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
        }`}
        title={t(tool.titleKey)}
        onClick={handleClick}
        data-tool-id={toolId}
        data-tool-type={tool.type}
        data-draggable={isDraggable}
      >
        <IconComponent size={16} stroke={1.5} />
      </button>
    )
  }
  
  // 工具面板样式
  return (
    <button
      className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 ${
        isActive 
          ? 'bg-blue-500 text-white hover:bg-blue-600' 
          : 'hover:bg-white/80 dark:hover:bg-gray-700/60 hover:shadow-sm hover:scale-105 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
      }`}
      title={t(tool.titleKey)}
      onClick={handleClick}
      data-tool-id={toolId}
      data-tool-type={tool.type}
      data-draggable={isDraggable}
    >
      <IconComponent size={16} stroke={1.5} />
    </button>
  )
}

export default ToolButton

