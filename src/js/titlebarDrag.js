// 标题栏控件拖拽模块
import Sortable from 'sortablejs';
import { forceOpenPanel, forceClosePanel, isToolsPanelOpen } from './toolsPanel.js';
import { moveToolToLocation, updateFormatButtonStatus } from './toolManager.js';

let titlebarControls = null;
let toolsPanel = null;
let controlsSortable = null;
let toolsPanelSortable = null;
let wasPanelOpenBeforeDrag = false;


// 初始化标题栏拖拽功能
export function initTitlebarDrag() {
  // 延迟初始化，确保DOM完全加载
  setTimeout(() => {
    titlebarControls = document.querySelector('#titlebar .controls');
    toolsPanel = document.querySelector('#tools-panel .tools-panel-content');

    if (!titlebarControls || !toolsPanel) {
      return;
    }


    // 初始化标题栏控件拖拽
    initControlsSortable();
    
    // 初始化工具面板拖拽
    initToolsPanelSortable();
  }, 200);
}

// 初始化标题栏控件的拖拽
function initControlsSortable() {
  if (!titlebarControls) return;

  const options = {
    group: 'shared-tools',
    animation: 200,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    sort: true,
    
    // 过滤掉工具面板切换按钮，不允许拖拽
    filter: function(evt, item, originalEvent) {
      return item.id === 'tools-panel-toggle';
    },
    
    onStart: function(evt) {
      // 记录拖拽前的面板状态
      wasPanelOpenBeforeDrag = isToolsPanelOpen();
      
      // 自动展开工具面板
      if (!wasPanelOpenBeforeDrag) {
        forceOpenPanel();
      }
      
      document.body.classList.add('dragging');
      evt.item.classList.add('dragging-item');
      
      // 当前容器（标题栏）保持蓝色，其他容器（工具面板）显示绿色
      titlebarControls.classList.add('drag-source'); // 蓝色边框
      toolsPanel.classList.add('drag-target'); // 绿色边框
    },

    onEnd: function(evt) {
      document.body.classList.remove('dragging');
      evt.item.classList.remove('dragging-item');
      
      // 清除所有拖拽目标样式
      clearAllDragTargets();
      
      
      // 如果拖拽前面板是关闭的，拖拽结束后自动关闭
      if (!wasPanelOpenBeforeDrag) {
        // 延迟关闭，给用户一点时间看到结果
        setTimeout(() => {
          forceClosePanel();
        }, 500);
      }
    },

    onAdd: function(evt) {
      // 使用工具管理器处理移动
      const toolId = getToolIdFromElement(evt.item);
      if (toolId) {
        moveToolToLocation(toolId, 'panel', 'titlebar', evt.newIndex);
      }
    },

    onRemove: function(evt) {
    }
  };

  controlsSortable = Sortable.create(titlebarControls, options);
}

// 初始化工具面板的拖拽
function initToolsPanelSortable() {
  if (!toolsPanel) return;

  const options = {
    group: 'shared-tools',
    animation: 200,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    sort: true,
    
    onStart: function(evt) {
      document.body.classList.add('dragging');
      evt.item.classList.add('dragging-item');
      
      // 当前容器（工具面板）保持蓝色，其他容器（标题栏）显示绿色
      toolsPanel.classList.add('drag-source'); // 蓝色边框
      titlebarControls.classList.add('drag-target'); // 绿色边框
    },

    onEnd: function(evt) {
      document.body.classList.remove('dragging');
      evt.item.classList.remove('dragging-item');
      
      // 清除所有拖拽目标样式
      clearAllDragTargets();
      
    },

    onAdd: function(evt) {
      // 使用工具管理器处理移动
      const toolId = getToolIdFromElement(evt.item);
      if (toolId) {
        moveToolToLocation(toolId, 'titlebar', 'panel', evt.newIndex);
      }
    },

    onRemove: function(evt) {
    }
  };

  toolsPanelSortable = Sortable.create(toolsPanel, options);
}

// 从元素获取工具ID
function getToolIdFromElement(element) {
  // 尝试从data属性获取
  let toolId = element.getAttribute('data-tool-id');
  if (toolId) return toolId;
  
  // 尝试从子元素获取
  const button = element.querySelector('.unified-tool');
  if (button) {
    toolId = button.getAttribute('data-tool-id');
    if (toolId) return toolId;
  }
  
  // 最后尝试从ID获取
  if (element.id) return element.id;
  if (button && button.id) return button.id;
  
  return null;
}



// 销毁拖拽功能
export function destroyTitlebarDrag() {
  if (controlsSortable) {
    controlsSortable.destroy();
    controlsSortable = null;
  }
  
  if (toolsPanelSortable) {
    toolsPanelSortable.destroy();
    toolsPanelSortable = null;
  }
  
  // 清理拖拽状态
  document.body.classList.remove('dragging');
  const draggingItems = document.querySelectorAll('.dragging-item');
  draggingItems.forEach(item => item.classList.remove('dragging-item'));
  
  // 清理拖拽目标样式
  const dragTargets = document.querySelectorAll('.drag-target');
  dragTargets.forEach(target => target.classList.remove('drag-target'));
}

// 清除所有拖拽目标样式
function clearAllDragTargets() {
  const dragTargets = document.querySelectorAll('.drag-target');
  dragTargets.forEach(target => target.classList.remove('drag-target'));
  
  const dragSources = document.querySelectorAll('.drag-source');
  dragSources.forEach(source => source.classList.remove('drag-source'));
}

// 刷新拖拽功能
export function refreshTitlebarDrag() {
  destroyTitlebarDrag();
  initTitlebarDrag();
}


// 清除保存的布局
export function clearSavedLayout() {
  if (window.toolManager) {
    window.toolManager.clearSavedLayout();
  }
}

if (typeof window !== 'undefined') {
  window.refreshTitlebarDrag = refreshTitlebarDrag;
  window.clearSavedLayout = clearSavedLayout;
}