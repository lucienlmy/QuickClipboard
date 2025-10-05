// 可展开工具面板模块
import { setPasteWithFormat, getPasteWithFormat } from './config.js';
import { invoke } from '@tauri-apps/api/core';

let toolsPanelToggle = null;
let toolsPanel = null;
let isPanelOpen = false;

// 初始化工具面板
export function initToolsPanel() {
  toolsPanelToggle = document.getElementById('tools-panel-toggle');
  toolsPanel = document.getElementById('tools-panel');

  if (!toolsPanelToggle || !toolsPanel) {
    console.warn('工具面板元素未找到');
    return;
  }

  // 点击切换按钮
  toolsPanelToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanel();
  });

  // 点击面板外部关闭（使用捕获阶段，避免被内部stopPropagation影响）
  document.addEventListener('click', (e) => {
    if (!isPanelOpen) return;
    const target = e.target;
    if (!toolsPanel.contains(target) && !toolsPanelToggle.contains(target)) {
      closePanel();
    }
  }, true);

  // 阻止面板内部点击事件冒泡
  toolsPanel.addEventListener('click', (e) => {
    e.stopPropagation();
  });


  // 键盘事件
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isPanelOpen) {
      closePanel();
    }
  });

  console.log('工具面板已初始化');
}

// 切换面板显示状态
function togglePanel() {
  if (isPanelOpen) {
    closePanel();
  } else {
    openPanel();
  }
}

// 打开面板
function openPanel() {
  if (!toolsPanel) return;
  
  toolsPanel.classList.add('show');
  isPanelOpen = true;
  
  // 更新按钮状态
  if (toolsPanelToggle) {
    toolsPanelToggle.classList.add('active');
  }
}

// 关闭面板
function closePanel() {
  if (!toolsPanel) return;
  
  toolsPanel.classList.remove('show');
  isPanelOpen = false;
  
  // 更新按钮状态
  if (toolsPanelToggle) {
    toolsPanelToggle.classList.remove('active');
  }
}

// 获取面板状态
export function isToolsPanelOpen() {
  return isPanelOpen;
}

// 强制关闭面板（供其他模块调用）
export function forceClosePanel() {
  closePanel();
}

// 强制打开面板（供其他模块调用）
export function forceOpenPanel() {
  openPanel();
}


// 获取格式模式状态（供其他模块调用）
export function getFormatModeStatus() {
  return getPasteWithFormat();
}

// 更新格式按钮状态
export function updateFormatButtonStatus() {
  // 由工具管理器的 updateFormatButtonStatus() 处理
  if (window.toolManager && window.toolManager.updateFormatButtonStatus) {
    window.toolManager.updateFormatButtonStatus();
  }
}