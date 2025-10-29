// 搜索引擎管理模块
const SEARCH_ENGINES_KEY = 'quickclipboard_search_engines';

// 预设的搜索引擎
const DEFAULT_SEARCH_ENGINES = [
  {
    id: 'bing',
    name: 'Bing',
    favicon: 'https://www.bing.com/favicon.ico',
    url: 'https://www.bing.com/search?q=%s',
    isDefault: true
  },
  {
    id: 'google',
    name: 'Google',
    favicon: 'https://www.google.com/favicon.ico',
    url: 'https://www.google.com/search?q=%s'
  },
  {
    id: 'baidu',
    name: '百度',
    favicon: 'https://www.baidu.com/favicon.ico',
    url: 'https://www.baidu.com/s?wd=%s'
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    favicon: 'https://duckduckgo.com/favicon.ico',
    url: 'https://duckduckgo.com/?q=%s'
  }
];

// 清理重复的搜索引擎数据（一次性迁移）
function cleanupDuplicateEngines() {
  try {
    const stored = localStorage.getItem(SEARCH_ENGINES_KEY);
    if (!stored) return;
    
    const engines = JSON.parse(stored);
    const defaultIds = DEFAULT_SEARCH_ENGINES.map(e => e.id);
    
    // 只保留真正的自定义引擎（不在默认列表中的）
    const cleanCustomEngines = engines.filter(engine => 
      !defaultIds.includes(engine.id) && 
      !engine.isDefault && 
      engine.isCustom
    );
    
    // 更新存储
    localStorage.setItem(SEARCH_ENGINES_KEY, JSON.stringify(cleanCustomEngines));
  } catch (error) {
    console.error('清理重复引擎失败:', error);
  }
}

// 获取所有搜索引擎
export function getSearchEngines() {
  try {
    // 首次运行时清理重复数据
    if (!localStorage.getItem('quickclipboard_engines_cleaned')) {
      cleanupDuplicateEngines();
      localStorage.setItem('quickclipboard_engines_cleaned', 'true');
    }
    
    const stored = localStorage.getItem(SEARCH_ENGINES_KEY);
    const customEngines = stored ? JSON.parse(stored) : [];
    
    // 总是返回默认引擎 + 自定义引擎
    return [...DEFAULT_SEARCH_ENGINES, ...customEngines];
  } catch (error) {
    console.error('获取搜索引擎失败:', error);
    return DEFAULT_SEARCH_ENGINES;
  }
}

// 获取当前选中的搜索引擎
export function getCurrentSearchEngine() {
  try {
    const currentId = localStorage.getItem('quickclipboard_current_search_engine');
    const engines = getSearchEngines();
    const engine = engines.find(e => e.id === currentId);
    return engine || engines.find(e => e.isDefault) || engines[0];
  } catch (error) {
    console.error('获取当前搜索引擎失败:', error);
    return DEFAULT_SEARCH_ENGINES[0];
  }
}

// 设置当前搜索引擎
export function setCurrentSearchEngine(engineId) {
  try {
    localStorage.setItem('quickclipboard_current_search_engine', engineId);
    return true;
  } catch (error) {
    console.error('设置当前搜索引擎失败:', error);
    return false;
  }
}

// 添加自定义搜索引擎
export function addCustomSearchEngine(engine) {
  try {
    // 获取现有的自定义引擎
    const stored = localStorage.getItem(SEARCH_ENGINES_KEY);
    const customEngines = stored ? JSON.parse(stored) : [];
    
    // 生成唯一ID
    const id = 'custom_' + Date.now();
    const newEngine = {
      id,
      name: engine.name,
      favicon: engine.favicon || 'https://www.google.com/s2/favicons?domain=' + new URL(engine.url.replace('%s', '')).hostname,
      url: engine.url,
      isCustom: true
    };
    
    // 验证URL是否包含 %s 占位符
    if (!newEngine.url.includes('%s')) {
      throw new Error('搜索URL必须包含 %s 占位符');
    }
    
    // 只添加到自定义引擎列表
    customEngines.push(newEngine);
    
    localStorage.setItem(SEARCH_ENGINES_KEY, JSON.stringify(customEngines));
    return newEngine;
  } catch (error) {
    console.error('添加自定义搜索引擎失败:', error);
    throw error;
  }
}

// 删除自定义搜索引擎
export function removeCustomSearchEngine(engineId) {
  try {
    // 获取现有的自定义引擎
    const stored = localStorage.getItem(SEARCH_ENGINES_KEY);
    const customEngines = stored ? JSON.parse(stored) : [];
    
    // 过滤掉要删除的引擎
    const filteredEngines = customEngines.filter(e => e.id !== engineId);
    localStorage.setItem(SEARCH_ENGINES_KEY, JSON.stringify(filteredEngines));
    
    // 如果删除的是当前选中的引擎，切换到默认引擎
    if (getCurrentSearchEngine().id === engineId) {
      setCurrentSearchEngine(DEFAULT_SEARCH_ENGINES[0].id);
    }
    
    return true;
  } catch (error) {
    console.error('删除自定义搜索引擎失败:', error);
    return false;
  }
}

// 使用指定搜索引擎搜索
export function searchWithEngine(text, engineId = null) {
  const engine = engineId ? 
    getSearchEngines().find(e => e.id === engineId) : 
    getCurrentSearchEngine();
  
  if (!engine) {
    throw new Error('找不到指定的搜索引擎');
  }
  
  const query = encodeURIComponent(text);
  return engine.url.replace('%s', query);
}
