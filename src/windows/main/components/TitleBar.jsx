import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import { useSnapshot } from 'valtio';
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { useWindowDrag } from '@shared/hooks/useWindowDrag';
import { toolsStore } from '@shared/store/toolsStore';
import { useSortableList, useSortable, CSS } from '@shared/hooks/useSortable';
import { DragOverlay, useDroppable } from '@dnd-kit/core';
import { MAX_TITLEBAR_TOOLS } from '@shared/config/tools';
import logoIcon from '@/assets/icon1024.png';
import ToolButton from './ToolButton';
import TitleBarSearch from './TitleBarSearch';

// 可拖拽的工具项
function SortableToolItem({
  toolId,
  location
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: toolId
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms ease',
    opacity: isDragging ? 0.3 : 1
  };
  return <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ToolButton toolId={toolId} location={location} />
    </div>;
}

// 可放置区域（标题栏）
function DroppableTitlebar({
  children,
  isEmpty,
  isVertical
}) {
  const {
    setNodeRef,
    isOver
  } = useDroppable({
    id: 'titlebar-drop-zone'
  });
  return <div ref={setNodeRef} className={`flex ${isVertical ? 'flex-col items-center' : 'items-center'} gap-1 ${isEmpty ? (isVertical ? 'h-1 w-7' : 'w-1 h-7') + ' overflow-visible' : ''} ${isOver && isEmpty ? (isVertical ? '!h-auto py-8' : '!w-auto px-8') + ' bg-blue-50 dark:bg-blue-900/20 rounded-lg' : ''}`}>
      {children}
    </div>;
}
const TitleBar = forwardRef(({
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  onNavigate,
  position = 'top'
}, ref) => {
  const {
    t
  } = useTranslation();
  const {
    layout,
    isExpanded
  } = useSnapshot(toolsStore);
  const [activeId, setActiveId] = useState(null);
  const containerRef = useRef(null);
  const searchRef = useRef(null);
  const isVertical = position === 'left' || position === 'right';
  const dragRef = useWindowDrag({
    excludeSelectors: ['[data-no-drag]', 'button', '[role="button"]', '[data-tool-id]', 'input', 'textarea'],
    allowChildren: true
  });

  // 点击外部折叠面板
  useEffect(() => {
    if (!isExpanded) return;
    const handleClickOutside = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        const toggleButton = e.target.closest('#tools-toggle');
        if (!toggleButton) {
          toolsStore.collapse();
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded]);
  const allTools = [...layout.titlebar, ...layout.panel];

  // 拖拽处理
  const handleDragStart = event => {
    setActiveId(event.active.id);
  };
  const handleDragCancel = () => {
    setActiveId(null);
  };
  const handleDragEnd = event => {
    const {
      active,
      over
    } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const activeId = active.id;
    const overId = over.id;

    // 确定源位置
    const fromLocation = layout.titlebar.includes(activeId) ? 'titlebar' : 'panel';

    // 确定目标位置
    let toLocation = fromLocation;
    let toIndex = -1;

    // 拖到标题栏放置区域
    if (overId === 'titlebar-drop-zone') {
      toLocation = 'titlebar';
      // 检查标题栏是否已满
      if (fromLocation !== 'titlebar' && layout.titlebar.length >= MAX_TITLEBAR_TOOLS) {
        console.warn(`标题栏最多只能放置${MAX_TITLEBAR_TOOLS}个工具`);
        return;
      }
      toIndex = layout.titlebar.length; // 添加到末尾
    } else {
      // 拖到具体的工具上
      toLocation = layout.titlebar.includes(overId) ? 'titlebar' : 'panel';

      // 跨区域拖拽检查
      if (fromLocation !== toLocation && toLocation === 'titlebar') {
        if (layout.titlebar.length >= MAX_TITLEBAR_TOOLS) {
          console.warn(`标题栏最多只能放置${MAX_TITLEBAR_TOOLS}个工具`);
          return;
        }
      }

      // 计算目标索引
      const toArray = toLocation === 'titlebar' ? layout.titlebar : layout.panel;
      toIndex = toArray.findIndex(id => id === overId);
    }
    toolsStore.moveTool(activeId, fromLocation, toLocation, toIndex >= 0 ? toIndex : toLocation === 'titlebar' ? layout.titlebar.length : layout.panel.length);
  };
  const {
    DndContext,
    SortableContext,
    sensors,
    collisionDetection
  } = useSortableList({
    items: allTools,
    onDragEnd: handleDragEnd
  });

  // 获取当前拖拽项的位置
  const activeLocation = activeId ? layout.titlebar.includes(activeId) ? 'titlebar' : 'panel' : null;

  // 暴露搜索框的 focus 方法
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (searchRef.current?.focus) {
        searchRef.current.focus();
      }
    }
  }));
  return <div ref={dragRef} className={`title-bar flex-shrink-0 flex ${isVertical ? 'w-10 h-full flex-col items-center justify-between py-2 bg-gray-100 dark:bg-gray-900 ' + (position === 'left' ? 'border-r border-gray-300/80 dark:border-gray-700/30' : 'border-l border-gray-300/80 dark:border-gray-700/30') : 'h-9 flex-row items-center justify-between px-2 bg-gray-100 dark:bg-gray-900 ' + (position === 'top' ? 'border-b border-gray-300/80 dark:border-gray-700/30' : 'border-t border-gray-300/80 dark:border-gray-700/30')} shadow-sm transition-colors duration-500`}>
      {/* Logo */}
      <div className="flex items-center gap-1.5 flex-shrink-0 pointer-events-none">
        <div className="w-6 h-6 flex items-center justify-center">
          <img src={logoIcon} alt="QuickClipboard" className="w-5 h-5" />
        </div>
      </div>

      {/* 搜索 + 工具按钮容器 */}
      <div className={`flex ${isVertical ? 'flex-col items-center gap-2' : 'flex-row items-center gap-1'} relative ${isVertical ? '' : 'flex-shrink-0'}`} ref={containerRef}>
        {/* 搜索框 */}
        <TitleBarSearch ref={searchRef} value={searchQuery} onChange={onSearchChange} placeholder={searchPlaceholder} onNavigate={onNavigate} isVertical={isVertical} position={position} />
        <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
          <SortableContext items={allTools}>
            {/* 标题栏工具 */}
            <DroppableTitlebar isEmpty={layout.titlebar.length === 0} isVertical={isVertical}>
              {layout.titlebar.map(toolId => <SortableToolItem key={toolId} toolId={toolId} location="titlebar" />)}
            </DroppableTitlebar>

            {/* 展开/折叠按钮 */}
            {layout.panel.length > 0 && <button id="tools-toggle" className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 ${isExpanded ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 text-gray-600 hover:text-blue-500 dark:hover:bg-gray-700 dark:text-gray-300'}`} title={t('tools.panel')} onClick={() => toolsStore.toggleExpand()}>
                {isExpanded ? <i className="ti ti-chevron-up" style={{
              fontSize: 16
            }}></i> : <i className="ti ti-chevron-down" style={{
              fontSize: 16
            }}></i>}
              </button>}

            {/* 展开面板 */}
            {isExpanded && layout.panel.length > 0 && <div className={`tools-panel absolute ${isVertical ? position === 'left' ? 'left-full bottom-0 ml-1' : 'right-full bottom-0 mr-1' : position === 'bottom' ? 'bottom-full right-0 mb-1' : 'top-full right-0 mt-1'} bg-white/80 border border-gray-200/80 rounded-lg shadow-lg py-2 px-2.5 z-40 backdrop-blur-sm dark:bg-gray-800/80 dark:border-gray-700/80`}>
                <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                  {layout.panel.map(toolId => <SortableToolItem key={toolId} toolId={toolId} location="panel" />)}
                </div>

                {/* 底部操作 */}
                <div className="mt-2 pt-2 border-t border-gray-200/80 dark:border-gray-700/80">
                  <button className="w-full text-xs text-gray-600 hover:text-blue-500 transition-colors text-center py-1 dark:text-gray-300" onClick={() => toolsStore.resetLayout()}>
                    {t('tools.reset')}
                  </button>
                </div>
              </div>}
          </SortableContext>

          {/* 拖拽覆盖层 */}
          <DragOverlay dropAnimation={null} style={{
          zIndex: 9999
        }}>
            {activeId ? <div className="opacity-90 cursor-grabbing shadow-lg">
                <ToolButton toolId={activeId} location={activeLocation} />
              </div> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>;
});
TitleBar.displayName = 'TitleBar';
export default TitleBar;