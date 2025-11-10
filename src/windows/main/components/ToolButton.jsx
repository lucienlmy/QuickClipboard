import { useTranslation } from 'react-i18next';
import { useSnapshot } from 'valtio';
import { toolsStore } from '@shared/store/toolsStore';
import { TOOL_REGISTRY } from '@shared/config/tools';
function ToolButton({
  toolId,
  location,
  isDraggable = true,
  onAction
}) {
  const {
    t
  } = useTranslation();
  const {
    states
  } = useSnapshot(toolsStore);
  const tool = TOOL_REGISTRY[toolId];
  if (!tool) return null;
  const isActive = tool.type === 'toggle' ? states[toolId] : false;
  const handleClick = async e => {
    e.preventDefault();
    e.stopPropagation();
    if (onAction) {
      onAction(toolId, tool);
    } else {
      await toolsStore.handleToolClick(toolId);
    }
  };

  // 标题栏样式
  if (location === 'titlebar') {
    return <button className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 ${isActive ? 'bg-blue-500 text-white hover:bg-blue-600' : 'hover:bg-gray-100 text-gray-600 dark:hover:bg-gray-700 dark:text-gray-300'}`} title={t(tool.titleKey)} onClick={handleClick} data-tool-id={toolId} data-tool-type={tool.type} data-draggable={isDraggable}>
        <i className={tool.icon} style={{
        fontSize: 16
      }} data-stroke="1.5"></i>

      </button>;
  }

  // 工具面板样式
  return <button className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 ${isActive ? 'bg-blue-500 text-white hover:bg-blue-600' : 'hover:bg-gray-100 text-gray-600 dark:hover:bg-gray-700 dark:text-gray-300'}`} title={t(tool.titleKey)} onClick={handleClick} data-tool-id={toolId} data-tool-type={tool.type} data-draggable={isDraggable}>
      <i className={tool.icon} style={{
      fontSize: 16
    }} data-stroke="1.5"></i>

    </button>;
}
export default ToolButton;