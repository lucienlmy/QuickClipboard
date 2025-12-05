import { useEffect, useCallback, useRef } from 'react';
import { KEYBOARD_SHORTCUTS, matchAnyShortcut, getToolIdByKey } from '../constants/keyboardShortcuts';

//截图窗口快捷键管理 Hook
export default function useKeyboardShortcuts({
  activeToolId,
  setActiveToolId,
  onUndo,
  onRedo,
  onDelete,
  onClearCanvas,
  onCancel,
  onSave,
  onConfirm,
  onPin,
  onSelectAll,
  canUndo = false,
  canRedo = false,
  canDelete = false,
  canClearCanvas = false,
  longScreenshotMode = false,
  hasValidSelection = false,
  editingTextIndex = null,
}) {
  const enabledRef = useRef(true);

  // 检查是否在输入状态
  const isInTextInput = useCallback(() => {
    if (editingTextIndex !== null) return true;
    
    const activeElement = document.activeElement;
    if (activeElement) {
      const tagName = activeElement.tagName.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea') return true;
      if (activeElement.isContentEditable) return true;
    }
    
    return false;
  }, [editingTextIndex]);

  // 处理工具切换
  const handleToolSwitch = useCallback((toolId) => {
    if (longScreenshotMode) return;
    
    if (activeToolId === toolId) {
      setActiveToolId(null);
    } else {
      setActiveToolId(toolId);
    }
  }, [activeToolId, setActiveToolId, longScreenshotMode]);

  // 处理取消操作
  const handleCancel = useCallback(() => {
    if (longScreenshotMode) return;
    
    // 如果有活动工具，先取消工具
    if (activeToolId) {
      setActiveToolId(null);
    } else if (onCancel) {
      onCancel();
    }
  }, [activeToolId, setActiveToolId, onCancel, longScreenshotMode]);

  // 键盘事件处理
  const handleKeyDown = useCallback((event) => {
    if (!enabledRef.current) return;

    if (isInTextInput()) {
      return;
    }

    // 阻止某些默认行为
    const shouldPreventDefault = 
      matchAnyShortcut(event, KEYBOARD_SHORTCUTS.actions.undo.keys) ||
      matchAnyShortcut(event, KEYBOARD_SHORTCUTS.actions.redo.keys) ||
      matchAnyShortcut(event, KEYBOARD_SHORTCUTS.actions.clearCanvas.keys) ||
      matchAnyShortcut(event, KEYBOARD_SHORTCUTS.confirm.save.keys) ||
      matchAnyShortcut(event, KEYBOARD_SHORTCUTS.confirm.pin.keys) ||
      matchAnyShortcut(event, KEYBOARD_SHORTCUTS.selection.selectAll.keys);

    if (shouldPreventDefault) {
      event.preventDefault();
    }

    // 工具切换快捷键（数字键1-9）
    const toolId = getToolIdByKey(event.key);
    if (toolId) {
      handleToolSwitch(toolId);
      return;
    }

    // 撤销/重做
    if (matchAnyShortcut(event, KEYBOARD_SHORTCUTS.actions.undo.keys)) {
      if (canUndo && onUndo) {
        onUndo();
      }
      return;
    }

    if (matchAnyShortcut(event, KEYBOARD_SHORTCUTS.actions.redo.keys)) {
      if (canRedo && onRedo) {
        onRedo();
      }
      return;
    }

    // 删除
    if (matchAnyShortcut(event, KEYBOARD_SHORTCUTS.actions.delete.keys)) {
      if (canDelete && onDelete) {
        onDelete();
      }
      return;
    }

    // 清空画布
    if (matchAnyShortcut(event, KEYBOARD_SHORTCUTS.actions.clearCanvas.keys)) {
      if (canClearCanvas && onClearCanvas) {
        onClearCanvas();
      }
      return;
    }

    // 取消操作
    if (matchAnyShortcut(event, KEYBOARD_SHORTCUTS.actions.cancel.keys)) {
      handleCancel();
      return;
    }

    // 保存
    if (matchAnyShortcut(event, KEYBOARD_SHORTCUTS.confirm.save.keys)) {
      if (hasValidSelection && onSave) {
        onSave();
      }
      return;
    }

    // 确认
    if (matchAnyShortcut(event, KEYBOARD_SHORTCUTS.confirm.confirm.keys)) {
      if (hasValidSelection && onConfirm) {
        onConfirm();
      }
      return;
    }

    // 贴图
    if (matchAnyShortcut(event, KEYBOARD_SHORTCUTS.confirm.pin.keys)) {
      if (hasValidSelection && onPin) {
        onPin();
      }
      return;
    }

    // 全选
    if (matchAnyShortcut(event, KEYBOARD_SHORTCUTS.selection.selectAll.keys)) {
      if (onSelectAll && activeToolId === 'select') {
        onSelectAll();
      }
      return;
    }
  }, [
    handleToolSwitch,
    handleCancel,
    onUndo,
    onRedo,
    onDelete,
    onClearCanvas,
    onSave,
    onConfirm,
    onPin,
    onSelectAll,
    canUndo,
    canRedo,
    canDelete,
    canClearCanvas,
    hasValidSelection,
    activeToolId,
    isInTextInput,
  ]);

  // 注册全局键盘事件监听
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // 启用/禁用快捷键
  const setEnabled = useCallback((enabled) => {
    enabledRef.current = enabled;
  }, []);

  return {
    enabled: enabledRef.current,
    setEnabled,
  };
}
