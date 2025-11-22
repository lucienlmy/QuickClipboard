//工具参数持久化管理模块，管理每个工具的参数持久化状态和本地存储

const STORAGE_PREFIX = 'screenshot_tool_params_';
const PERSISTENCE_CONFIG_KEY = 'screenshot_tool_persistence_config';

// 获取持久化配置
export function getPersistenceConfig() {
  try {
    const stored = localStorage.getItem(PERSISTENCE_CONFIG_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Failed to load persistence config:', error);
    return {};
  }
}

// 保存持久化配置
export function savePersistenceConfig(config) {
  try {
    localStorage.setItem(PERSISTENCE_CONFIG_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Failed to save persistence config:', error);
  }
}

// 切换某个工具的持久化状态
export function toggleToolPersistence(toolId, enabled) {
  const config = getPersistenceConfig();
  config[toolId] = enabled;
  savePersistenceConfig(config);
  
  if (!enabled) {
    clearToolParameters(toolId);
  }
}

// 检查某个工具是否启用了持久化
export function isToolPersistenceEnabled(toolId) {
  const config = getPersistenceConfig();
  return config[toolId] === true;
}

//获取工具的存储key
function getStorageKey(toolId) {
  return `${STORAGE_PREFIX}${toolId}`;
}

//保存工具参数到本地存储
export function saveToolParameters(toolId, parameters) {
  if (!isToolPersistenceEnabled(toolId)) {
    return;
  }
  
  try {
    const key = getStorageKey(toolId);
    localStorage.setItem(key, JSON.stringify(parameters));
  } catch (error) {
    console.error(`Failed to save parameters for tool ${toolId}:`, error);
  }
}

//从本地存储加载工具参数
export function loadToolParameters(toolId, defaultParameters = {}) {
  if (!isToolPersistenceEnabled(toolId)) {
    return { ...defaultParameters };
  }
  
  try {
    const key = getStorageKey(toolId);
    const stored = localStorage.getItem(key);
    
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...defaultParameters, ...parsed };
    }
  } catch (error) {
    console.error(`Failed to load parameters for tool ${toolId}:`, error);
  }
  
  return { ...defaultParameters };
}

// 清除某个工具的存储参数
export function clearToolParameters(toolId) {
  try {
    const key = getStorageKey(toolId);
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Failed to clear parameters for tool ${toolId}:`, error);
  }
}

// 清除所有工具的存储参数
export function clearAllToolParameters() {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('Failed to clear all tool parameters:', error);
  }
}

// 创建一个持久化管理器实例
export function createPersistenceManager(tools) {
  const loadInitialToolStyles = () => {
    return Object.entries(tools).reduce((acc, [toolId, tool]) => {
      const defaultStyle = tool?.getDefaultStyle ? tool.getDefaultStyle() : {};
      acc[toolId] = loadToolParameters(toolId, defaultStyle);
      return acc;
    }, {});
  };

  return {
    loadInitialToolStyles,
    updateParameter(toolId, paramId, value, currentStyles) {
      const updatedStyle = {
        ...currentStyles[toolId],
        [paramId]: value,
      };
      
      // 实时保存到本地存储
      saveToolParameters(toolId, updatedStyle);
      
      return {
        ...currentStyles,
        [toolId]: updatedStyle,
      };
    },

    togglePersistence(toolId, enabled, currentStyles) {
      toggleToolPersistence(toolId, enabled);
      
      // 如果启用持久化，保存当前参数
      if (enabled) {
        saveToolParameters(toolId, currentStyles[toolId]);
        return currentStyles;
      }
      
      // 如果禁用持久化，恢复默认参数
      const tool = tools[toolId];
      const defaultStyle = tool?.getDefaultStyle ? tool.getDefaultStyle() : {};
      
      return {
        ...currentStyles,
        [toolId]: defaultStyle,
      };
    },

    resetToDefault(toolId, currentStyles) {
      const tool = tools[toolId];
      const defaultStyle = tool?.getDefaultStyle ? tool.getDefaultStyle() : {};
      
      // 如果启用了持久化，也要更新存储
      if (isToolPersistenceEnabled(toolId)) {
        saveToolParameters(toolId, defaultStyle);
      }
      
      return {
        ...currentStyles,
        [toolId]: defaultStyle,
      };
    },

    //获取持久化配置
    getPersistenceConfig,

    //检查是否启用持久化
    isToolPersistenceEnabled,
  };
}
