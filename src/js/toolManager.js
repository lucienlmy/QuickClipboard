// 统一工具管理器 - 规范化工具按钮的注册、渲染和状态管理
import { invoke } from '@tauri-apps/api/core';
import { setPasteWithFormat, getPasteWithFormat, setIsPinned, isPinned, setIsOneTimePaste, isOneTimePaste, setIsAiTranslationEnabled, isAiTranslationEnabled } from './config.js';
import { openSettingsWindow } from './window.js';
import { startScreenshot } from './screenshot.js';
import { toggleAiTranslation, updateAllAiTranslationButtons } from './aiTranslation.js';
import { toggleMusicPlayer, getMusicPlayerState, setMusicPlayerState } from '../musicPlayer/index.js';

// 工具注册表 - 单一数据源
const TOOL_REGISTRY = {
  'pin-button': {
    id: 'pin-button',
    icon: 'ti ti-pin',
    title: '固定窗口',
    type: 'toggle',
    defaultLocation: 'titlebar',
    action: 'togglePin',
    getState: () => isPinned,
    setState: setIsPinned
  },
  'settings-button': {
    id: 'settings-button', 
    icon: 'ti ti-settings',
    title: '设置',
    type: 'action',
    defaultLocation: 'titlebar',
    action: 'openSettings'
  },
  'screenshot-button': {
    id: 'screenshot-button',
    icon: 'ti ti-screenshot', 
    title: '截屏',
    type: 'action',
    defaultLocation: 'panel',
    action: 'takeScreenshot'
  },
  'one-time-paste-button': {
    id: 'one-time-paste-button',
    icon: 'ti ti-trash',
    title: '一次性粘贴',
    type: 'toggle',
    defaultLocation: 'panel',
    action: 'toggleOneTimePaste',
    getState: () => isOneTimePaste,
    setState: setIsOneTimePaste
  },
  'ai-translation-button': {
    id: 'ai-translation-button',
    icon: 'ti ti-language',
    title: 'AI翻译',
    type: 'toggle', 
    defaultLocation: 'panel',
    action: 'toggleAiTranslation',
    getState: () => isAiTranslationEnabled,
    setState: setIsAiTranslationEnabled
  },
  'format-toggle-button': {
    id: 'format-toggle-button',
    icon: 'ti ti-typography',
    title: '格式切换',
    type: 'toggle',
    defaultLocation: 'panel', 
    action: 'toggleFormatMode',
    getState: getPasteWithFormat,
    setState: setPasteWithFormat,
    defaultActive: true  // 默认开启格式粘贴
  },
  'music-player-button': {
    id: 'music-player-button',
    icon: 'ti ti-music',
    title: '音频播放器',
    type: 'toggle',
    defaultLocation: 'panel',
    action: 'toggleMusicPlayer',
    getState: getMusicPlayerState,
    setState: setMusicPlayerState
  }
};

// 当前布局状态
let currentLayout = {
  titlebar: [],
  panel: []
};

// 存储键名
const LAYOUT_STORAGE_KEY = 'unified-tool-layout';

// 工具操作映射
const TOOL_ACTIONS = {
  togglePin: async (toolId) => {
    const currentState = isPinned;
    const newState = !currentState;
    setIsPinned(newState);
    
    try {
      await invoke('set_window_pinned', { pinned: newState });
      updateToolState(toolId, newState);
    } catch (error) {
      console.error('设置固定状态失败:', error);
      setIsPinned(currentState); // 回滚
    }
  },
  
  openSettings: () => {
    openSettingsWindow();
  },
  
  takeScreenshot: () => {
    startScreenshot();
  },
  
  toggleOneTimePaste: (toolId) => {
    const tool = TOOL_REGISTRY[toolId];
    if (tool && tool.getState && tool.setState) {
      const currentState = tool.getState();
      const newState = !currentState;
      tool.setState(newState);
      updateToolState(toolId, newState);
    }
  },
  
  toggleAiTranslation: async (toolId) => {
    // 使用原始的AI翻译逻辑
    const success = await toggleAiTranslation();
    if (success) {
      // 如果成功，更新工具状态显示
      const tool = TOOL_REGISTRY[toolId];
      if (tool && tool.getState) {
        updateToolState(toolId, tool.getState());
      }
    }
  },
  
  toggleFormatMode: async (toolId) => {
    const currentFormat = getPasteWithFormat();
    const newFormat = !currentFormat;
    
    setPasteWithFormat(newFormat);
    updateToolState(toolId, newFormat);
    
    try {
      await invoke('save_settings', {
        settings: { pasteWithFormat: newFormat }
      });
      
      // 触发格式变化事件
      window.dispatchEvent(new CustomEvent('format-mode-changed', { 
        detail: { withFormat: newFormat } 
      }));
    } catch (error) {
      console.error('保存格式设置失败:', error);
    }
  },
  
  toggleMusicPlayer: (toolId) => {
    toggleMusicPlayer();
    const tool = TOOL_REGISTRY[toolId];
    if (tool && tool.getState) {
      updateToolState(toolId, tool.getState());
    }
  }
};

// 初始化工具管理器
export function initToolManager() {
  console.log('初始化统一工具管理器');
  
  // 恢复保存的布局
  restoreLayout();
  
  // 渲染所有工具
  renderAllTools();
  
  // 绑定事件委托
  setupEventDelegation();
  
  // 初始化所有工具状态
  initializeToolStates();
}

// 渲染所有工具到指定容器
function renderAllTools() {
  const titlebarContainer = document.querySelector('#titlebar .controls');
  const panelContainer = document.querySelector('#tools-panel .tools-panel-content');
  
  if (!titlebarContainer || !panelContainer) {
    console.warn('工具容器未找到');
    return;
  }
  
  // 清空现有内容（保留固定的toggle按钮）
  const toggleButton = titlebarContainer.querySelector('#tools-panel-toggle');
  
  // 完全清空容器
  titlebarContainer.innerHTML = '';
  panelContainer.innerHTML = '';
  
  // 重新添加固定的toggle按钮
  if (toggleButton) {
    titlebarContainer.appendChild(toggleButton);
  } else {
    // 如果toggle按钮不存在，创建它
    const newToggleButton = document.createElement('button');
    newToggleButton.id = 'tools-panel-toggle';
    newToggleButton.className = 'control-button';
    newToggleButton.title = '工具面板';
    newToggleButton.innerHTML = '<i class="ti ti-apps"></i>';
    titlebarContainer.appendChild(newToggleButton);
  }
  
  // 渲染标题栏工具
  currentLayout.titlebar.forEach(toolId => {
    const tool = TOOL_REGISTRY[toolId];
    if (tool) {
      const element = createToolElement(tool, 'titlebar');
      titlebarContainer.appendChild(element);
    }
  });
  
  // 渲染面板工具
  currentLayout.panel.forEach(toolId => {
    const tool = TOOL_REGISTRY[toolId];
    if (tool) {
      const element = createToolElement(tool, 'panel');
      panelContainer.appendChild(element);
    }
  });
  
  console.log('工具布局渲染完成:', currentLayout);
}

// 创建工具元素
function createToolElement(tool, location) {
  if (location === 'titlebar') {
    // 标题栏：直接的button元素
    const button = document.createElement('button');
    button.id = tool.id;
    button.className = `control-button unified-tool ${tool.type === 'toggle' ? 'toggle-button' : ''}`;
    button.setAttribute('draggable', 'true');
    button.setAttribute('data-tool-id', tool.id);
    button.setAttribute('data-tool-type', tool.type);
    button.title = tool.title;
    button.innerHTML = `<i class="${tool.icon}"></i>`;
    
    // 如果是切换按钮且有默认激活状态
    if (tool.type === 'toggle' && tool.defaultActive) {
      button.classList.add('active');
    }
    
    return button;
  } else {
    // 工具面板：div包裹button的结构
    const wrapper = document.createElement('div');
    wrapper.className = 'tool-item';
    wrapper.setAttribute('draggable', 'true');
    wrapper.setAttribute('data-tool-id', tool.id);
    
    const button = document.createElement('button');
    button.id = tool.id;
    button.className = `tool-button unified-tool ${tool.type === 'toggle' ? 'toggle-button' : ''}`;
    button.setAttribute('data-tool-id', tool.id);
    button.setAttribute('data-tool-type', tool.type);
    button.title = tool.title;
    button.innerHTML = `<i class="${tool.icon}"></i>`;
    
    // 如果是切换按钮且有默认激活状态
    if (tool.type === 'toggle' && tool.defaultActive) {
      button.classList.add('active');
    }
    
    wrapper.appendChild(button);
    return wrapper;
  }
}

// 设置事件委托
function setupEventDelegation() {
  // 统一的点击事件处理
  document.addEventListener('click', (e) => {
    const toolElement = e.target.closest('.unified-tool');
    if (!toolElement) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const toolId = toolElement.getAttribute('data-tool-id');
    const tool = TOOL_REGISTRY[toolId];
    
    if (tool && tool.action && TOOL_ACTIONS[tool.action]) {
      TOOL_ACTIONS[tool.action](toolId);
    }
  }, true);
}

// 初始化所有工具状态
function initializeToolStates() {
  Object.values(TOOL_REGISTRY).forEach(tool => {
    if (tool.type === 'toggle' && tool.getState) {
      updateToolState(tool.id, tool.getState());
    }
  });
  
  // 特别处理AI翻译按钮，使用专门的更新函数
  setTimeout(() => {
    updateAllAiTranslationButtons();
  }, 100);
}

// 更新工具状态显示
export function updateToolState(toolId, state) {
  const tool = TOOL_REGISTRY[toolId];
  if (!tool) return;
  
  // 查找所有该工具的实例（可能在标题栏或面板中）
  const elements = document.querySelectorAll(`[data-tool-id="${toolId}"]`);
  
  elements.forEach(element => {
    const button = element.classList.contains('unified-tool') ? element : element.querySelector('.unified-tool');
    if (!button) return;
    
    if (tool.type === 'toggle') {
      if (state) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
      
      // 更新title
      const baseTitle = tool.title;
      button.title = `${baseTitle} - ${state ? '已开启' : '已关闭'}`;
    }
  });
}

// 移动工具到指定位置
export function moveToolToLocation(toolId, fromLocation, toLocation, index = -1) {
  // 从原位置移除
  const fromArray = currentLayout[fromLocation];
  const toolIndex = fromArray.indexOf(toolId);
  if (toolIndex > -1) {
    fromArray.splice(toolIndex, 1);
  }
  
  // 添加到新位置
  const toArray = currentLayout[toLocation];
  if (index >= 0 && index < toArray.length) {
    toArray.splice(index, 0, toolId);
  } else {
    toArray.push(toolId);
  }
  
  // 重新渲染
  renderAllTools();
  
  // 重新初始化状态
  initializeToolStates();
  
  // 保存布局
  saveLayout();
}

// 保存布局到本地存储
function saveLayout() {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(currentLayout));
  } catch (error) {
    console.error('保存工具布局失败:', error);
  }
}

// 恢复布局
function restoreLayout() {
  try {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
      const layout = JSON.parse(saved);
      
      // 验证保存的布局数据
      if (layout.titlebar && layout.panel && Array.isArray(layout.titlebar) && Array.isArray(layout.panel)) {
        currentLayout = layout;
        
        // 确保所有工具都存在于某个位置
        const allToolIds = Object.keys(TOOL_REGISTRY);
        const placedTools = [...currentLayout.titlebar, ...currentLayout.panel];
        
        allToolIds.forEach(toolId => {
          if (!placedTools.includes(toolId)) {
            const tool = TOOL_REGISTRY[toolId];
            currentLayout[tool.defaultLocation].push(toolId);
          }
        });
        
        return;
      }
    }
    
    // 尝试从旧格式迁移
    migrateLegacyLayout();
  } catch (error) {
    console.error('恢复工具布局失败:', error);
    // 使用默认布局
    resetToDefaultLayout();
  }
}

// 从旧格式迁移布局
function migrateLegacyLayout() {
  try {
    const legacyLayout = localStorage.getItem('titlebar-controls-layout');
    if (!legacyLayout) {
      resetToDefaultLayout();
      return;
    }
    
    const legacy = JSON.parse(legacyLayout);
    console.log('检测到旧版布局，正在迁移...');
    
    currentLayout = {
      titlebar: [],
      panel: []
    };
    
    // 迁移标题栏控件
    if (legacy.titlebarControls && Array.isArray(legacy.titlebarControls)) {
      legacy.titlebarControls.forEach(control => {
        if (control.id && TOOL_REGISTRY[control.id]) {
          currentLayout.titlebar.push(control.id);
        }
      });
    }
    
    // 迁移工具面板项
    if (legacy.toolsPanelItems && Array.isArray(legacy.toolsPanelItems)) {
      legacy.toolsPanelItems.forEach(item => {
        if (item.id && TOOL_REGISTRY[item.id]) {
          currentLayout.panel.push(item.id);
        }
      });
    }
    
    // 确保所有工具都被放置
    const allToolIds = Object.keys(TOOL_REGISTRY);
    const placedTools = [...currentLayout.titlebar, ...currentLayout.panel];
    
    allToolIds.forEach(toolId => {
      if (!placedTools.includes(toolId)) {
        const tool = TOOL_REGISTRY[toolId];
        currentLayout[tool.defaultLocation].push(toolId);
      }
    });
    
    // 保存新格式
    saveLayout();
    
    // 清理旧格式
    localStorage.removeItem('titlebar-controls-layout');
    console.log('布局迁移完成');
    
  } catch (error) {
    console.error('迁移旧版布局失败:', error);
    resetToDefaultLayout();
  }
}

// 重置为默认布局
export function resetToDefaultLayout() {
  currentLayout = {
    titlebar: [],
    panel: []
  };
  
  Object.values(TOOL_REGISTRY).forEach(tool => {
    currentLayout[tool.defaultLocation].push(tool.id);
  });
  
  renderAllTools();
  initializeToolStates();
  saveLayout();
}

// 获取当前布局
export function getCurrentLayout() {
  return { ...currentLayout };
}

// 获取工具信息
export function getToolInfo(toolId) {
  return TOOL_REGISTRY[toolId];
}

// 获取所有工具信息
export function getAllTools() {
  return { ...TOOL_REGISTRY };
}

// 清除保存的布局
export function clearSavedLayout() {
  try {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
    resetToDefaultLayout();
  } catch (error) {
    console.error('清除工具布局失败:', error);
  }
}

// 导出供其他模块使用的方法
export function updateFormatButtonStatus() {
  const formatTool = TOOL_REGISTRY['format-toggle-button'];
  if (formatTool && formatTool.getState) {
    updateToolState('format-toggle-button', formatTool.getState());
  }
}

// 添加新工具到注册表
export function registerTool(toolConfig) {
  if (!toolConfig.id) {
    console.error('工具配置必须包含id');
    return false;
  }
  
  TOOL_REGISTRY[toolConfig.id] = {
    defaultLocation: 'panel',
    type: 'action',
    ...toolConfig
  };
  
  // 如果工具管理器已初始化，重新渲染
  if (Object.keys(currentLayout).length > 0) {
    // 将新工具添加到默认位置
    const location = toolConfig.defaultLocation || 'panel';
    if (!currentLayout[location].includes(toolConfig.id)) {
      currentLayout[location].push(toolConfig.id);
      renderAllTools();
      initializeToolStates();
      saveLayout();
    }
  }
  
  return true;
}

// 移除工具
export function unregisterTool(toolId) {
  if (!TOOL_REGISTRY[toolId]) {
    console.warn(`工具 ${toolId} 不存在`);
    return false;
  }
  
  // 从注册表中移除
  delete TOOL_REGISTRY[toolId];
  
  // 从布局中移除
  currentLayout.titlebar = currentLayout.titlebar.filter(id => id !== toolId);
  currentLayout.panel = currentLayout.panel.filter(id => id !== toolId);
  
  // 重新渲染
  renderAllTools();
  saveLayout();
  
  return true;
}

// 自定义工具布局
export function setCustomLayout(customLayout) {
  if (!customLayout || typeof customLayout !== 'object') {
    console.error('无效的布局配置');
    return false;
  }
  
  // 验证布局配置
  const titlebar = customLayout.titlebar || [];
  const panel = customLayout.panel || [];
  
  // 确保所有工具ID都存在于注册表中
  const allToolIds = [...titlebar, ...panel];
  const validToolIds = allToolIds.filter(id => TOOL_REGISTRY[id]);
  
  if (validToolIds.length !== allToolIds.length) {
    console.warn('布局中包含未注册的工具，将被忽略');
  }
  
  // 应用新布局
  currentLayout = {
    titlebar: titlebar.filter(id => TOOL_REGISTRY[id]),
    panel: panel.filter(id => TOOL_REGISTRY[id])
  };
  
  // 确保所有已注册的工具都有位置
  Object.keys(TOOL_REGISTRY).forEach(toolId => {
    if (!currentLayout.titlebar.includes(toolId) && !currentLayout.panel.includes(toolId)) {
      const tool = TOOL_REGISTRY[toolId];
      currentLayout[tool.defaultLocation].push(toolId);
    }
  });
  
  renderAllTools();
  initializeToolStates();
  saveLayout();
  
  return true;
}

// 供全局访问
if (typeof window !== 'undefined') {
  window.toolManager = {
    resetToDefaultLayout,
    clearSavedLayout,
    updateFormatButtonStatus,
    getCurrentLayout,
    moveToolToLocation,
    registerTool,
    unregisterTool,
    setCustomLayout,
    getAllTools,
    getToolInfo
  };
}
