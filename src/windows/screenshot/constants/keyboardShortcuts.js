//截图窗口快捷键配置

import { DRAWING_TOOLS } from './tools';

export const KEYBOARD_SHORTCUTS = {
  // 工具切换
  tools: {
    numberKeys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
  },
  
  // 编辑操作
  actions: {
    undo: { keys: ['Ctrl+Z'], description: '撤销' },
    redo: { keys: ['Ctrl+Shift+Z', 'Ctrl+Y'], description: '重做' },
    delete: { keys: ['Delete', 'Backspace'], description: '删除选中' },
    clearCanvas: { keys: ['Ctrl+Shift+C'], description: '清空画布' },
    cancel: { keys: ['Escape'], description: '取消工具/选区' },
  },
  
  // 完成操作
  confirm: {
    save: { keys: ['Ctrl+S'], description: '保存截图' },
    confirm: { keys: ['Enter'], description: '确认截图' },
    pin: { keys: ['Ctrl+P'], description: '贴图' },
  },
  
  // 选区操作
  selection: {
    selectAll: { keys: ['Ctrl+A'], description: '全选对象' },
  },
};

//检查键盘事件是否匹配快捷键
export function matchShortcut(event, shortcut) {
  const parts = shortcut.split('+');
  const key = parts[parts.length - 1].toLowerCase();
  const modifiers = parts.slice(0, -1).map(m => m.toLowerCase());
  
  // 检查主键
  const eventKey = event.key.toLowerCase();
  if (eventKey !== key.toLowerCase()) {
    return false;
  }
  
  // 检查修饰键
  const hasCtrl = modifiers.includes('ctrl');
  const hasAlt = modifiers.includes('alt');
  const hasShift = modifiers.includes('shift');
  const hasMeta = modifiers.includes('meta');
  
  return (
    event.ctrlKey === hasCtrl &&
    event.altKey === hasAlt &&
    event.shiftKey === hasShift &&
    event.metaKey === hasMeta
  );
}

//检查键盘事件是否匹配任一快捷键
export function matchAnyShortcut(event, shortcuts) {
  return shortcuts.some(shortcut => matchShortcut(event, shortcut));
}

//根据快捷键获取工具ID
export function getToolIdByKey(key) {
  const numberIndex = KEYBOARD_SHORTCUTS.tools.numberKeys.indexOf(key);
  if (numberIndex !== -1 && numberIndex < DRAWING_TOOLS.length) {
    return DRAWING_TOOLS[numberIndex].id;
  }
  
  return null;
}

//获取工具的快捷键显示文本（仅数字键）
export function getToolShortcuts(toolId) {
  const index = DRAWING_TOOLS.findIndex(t => t.id === toolId);
  if (index === -1 || index >= 9) return [];
  
  return [(index + 1).toString()];
}

//获取所有快捷键的扁平化映射
export function getFlatShortcutMap() {
  const map = new Map();
  DRAWING_TOOLS.forEach((tool, index) => {
    if (index < 9) {
      const numberKey = (index + 1).toString();
      map.set(numberKey, {
        type: 'tool',
        action: tool.id,
        description: tool.title,
      });
    }
  });
  
  // 操作快捷键
  Object.entries(KEYBOARD_SHORTCUTS.actions).forEach(([actionId, config]) => {
    config.keys.forEach(key => {
      map.set(key.toLowerCase(), {
        type: 'action',
        action: actionId,
        description: config.description,
      });
    });
  });
  
  // 确认操作快捷键
  Object.entries(KEYBOARD_SHORTCUTS.confirm).forEach(([actionId, config]) => {
    config.keys.forEach(key => {
      map.set(key.toLowerCase(), {
        type: 'confirm',
        action: actionId,
        description: config.description,
      });
    });
  });
  
  // 选区操作快捷键
  Object.entries(KEYBOARD_SHORTCUTS.selection).forEach(([actionId, config]) => {
    config.keys.forEach(key => {
      map.set(key.toLowerCase(), {
        type: 'selection',
        action: actionId,
        description: config.description,
      });
    });
  });
  
  return map;
}

//获取工具在工具栏中的位置索引
export function getToolIndex(toolId) {
  return DRAWING_TOOLS.findIndex(t => t.id === toolId);
}
