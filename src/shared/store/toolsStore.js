import { proxy } from 'valtio'
import { TOOL_REGISTRY, DEFAULT_LAYOUT, LAYOUT_STORAGE_KEY } from '@shared/config/tools'
import { executeToolAction } from '@shared/services/toolActions'

// 工具状态存储
export const toolsStore = proxy({
  // 工具布局（分为标题栏和面板两部分）
  layout: {
    titlebar: [], // 显示在标题栏的工具
    panel: []     // 显示在面板的工具
  },
  
  // 工具状态（toggle类型工具的开关状态）
  states: {},
  
  // 工具面板是否展开
  isExpanded: false,
  
  // 初始化布局
  initLayout() {
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY)
      if (saved) {
        const data = JSON.parse(saved)
        
        // 标准格式
        if (data.titlebar && data.panel && Array.isArray(data.titlebar) && Array.isArray(data.panel)) {
          this.layout = data
          
          // 确保所有工具都有位置
          const allToolIds = Object.keys(TOOL_REGISTRY)
          const placedTools = [...this.layout.titlebar, ...this.layout.panel]
          
          allToolIds.forEach(toolId => {
            if (!placedTools.includes(toolId)) {
              const tool = TOOL_REGISTRY[toolId]
              this.layout[tool.defaultLocation].push(toolId)
            }
          })
          
          this.initStates()
          return
        }
      }
      
      // 使用默认布局
      this.layout = { ...DEFAULT_LAYOUT }
      this.initStates()
      this.saveLayout()
    } catch (error) {
      console.error('初始化工具布局失败:', error)
      this.layout = { ...DEFAULT_LAYOUT }
      this.initStates()
    }
  },
  
  // 初始化工具状态
  async initStates() {
    // 先从配置文件同步到 localStorage 缓存
    const { settingsStore } = await import('@shared/store/settingsStore')
    const { initializeToolStates, getToolState } = await import('@shared/services/toolActions')
    await initializeToolStates(settingsStore)
    
    // 从 localStorage 读取所有工具状态
    Object.values(TOOL_REGISTRY).forEach(tool => {
      if (tool.type === 'toggle') {
        this.states[tool.id] = getToolState(tool.id)
      }
    })
  },
  
  // 保存布局
  saveLayout() {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(this.layout))
    } catch (error) {
      console.error('保存工具布局失败:', error)
    }
  },
  
  // 切换工具状态
  toggleToolState(toolId) {
    if (this.states.hasOwnProperty(toolId)) {
      const newState = !this.states[toolId]
      this.states[toolId] = newState

      import('@shared/services/toolActions').then(({ setToolState }) => {
        setToolState(toolId, newState)
      })
    }
  },
  
  // 设置工具状态
  setToolState(toolId, state) {
    if (this.states.hasOwnProperty(toolId)) {
      this.states[toolId] = state
      
      // 使用统一的状态管理
      import('@shared/services/toolActions').then(({ setToolState }) => {
        setToolState(toolId, state)
      })
    }
  },
  
  // 移动工具
  moveTool(toolId, fromLocation, toLocation, toIndex) {
    // 从原位置移除
    const fromArray = this.layout[fromLocation]
    const fromIndex = fromArray.indexOf(toolId)
    if (fromIndex > -1) {
      fromArray.splice(fromIndex, 1)
    }
    
    // 添加到新位置
    const toArray = this.layout[toLocation]
    if (toIndex >= 0 && toIndex <= toArray.length) {
      toArray.splice(toIndex, 0, toolId)
    } else {
      toArray.push(toolId)
    }
    
    this.saveLayout()
  },
  
  // 重置为默认布局
  resetLayout() {
    this.layout = {
      titlebar: [...DEFAULT_LAYOUT.titlebar],
      panel: [...DEFAULT_LAYOUT.panel]
    }
    this.saveLayout()
  },
  
  // 切换工具面板展开/折叠
  toggleExpand() {
    this.isExpanded = !this.isExpanded
  },
  
  // 折叠工具面板
  collapse() {
    this.isExpanded = false
  },
  
  // 执行工具操作
  async handleToolClick(toolId) {
    const tool = TOOL_REGISTRY[toolId]
    if (!tool) {
      console.warn(`未知的工具: ${toolId}`)
      return
    }
    
    try {
      // 执行工具操作
      const result = await executeToolAction(toolId)
      
      // 如果是toggle类型，更新状态
      if (tool.type === 'toggle' && result !== null && result !== undefined) {
        this.setToolState(toolId, result)
      }
    } catch (error) {
      console.error(`工具操作失败 ${toolId}:`, error)
    }
  }
})

// 初始化
export function initToolsStore() {
  toolsStore.initLayout()
}

