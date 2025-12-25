import { useRef, useState, useLayoutEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { DRAWING_TOOLS, HISTORY_TOOLS, ACTION_TOOLS } from '../constants/tools';
import { usePanelDrag } from '../hooks/usePanelDrag';

function SelectionToolbar({
  selection, isDrawing, isMoving, isResizing, isDrawingShape, stageRegionManager,
  onCancel, onConfirm, onPin, onSave,
  activeToolId, onToolChange, undo, redo, canUndo, canRedo,
  clearCanvas, canClearCanvas,
  // 长截屏相关
  longScreenshotMode,
  isLongScreenshotCapturing,
  isLongScreenshotSaving,
  hasLongScreenshotPreview,
  onLongScreenshotEnter,
  onLongScreenshotStart,
  onLongScreenshotStop,
  onLongScreenshotCopy,
  onLongScreenshotSave,
  onLongScreenshotCancel,
  // 贴图编辑模式
  pinEditMode = false,
  screens,
}) {
  const toolbarRef = useRef(null);
  const [toolbarSize, setToolbarSize] = useState({ width: 340, height: 35 });

  useLayoutEffect(() => {
    if (!toolbarRef.current) return;
    const rect = toolbarRef.current.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (width !== toolbarSize.width || height !== toolbarSize.height) {
      setToolbarSize({ width, height });
    }
  });

  // 工具栏位置变化时更新后端（长截屏模式）
  const handleToolbarPositionChange = useCallback((pos) => {
    if (!longScreenshotMode || !screens || screens.length === 0) return;
    
    const centerX = pos.x + pos.width / 2;
    const centerY = pos.y + pos.height / 2;
    const screen = stageRegionManager?.getNearestScreen(centerX, centerY);
    if (!screen) return;
    
    const scaleX = screen.physicalWidth / screen.width;
    const scaleY = screen.physicalHeight / screen.height;
    
    const relX = pos.x - screen.x;
    const relY = pos.y - screen.y;
    
    const physicalX = screen.physicalX + Math.round(relX * scaleX);
    const physicalY = screen.physicalY + Math.round(relY * scaleY);
    const physicalWidth = Math.round(pos.width * scaleX);
    const physicalHeight = Math.round(pos.height * scaleY);
    
    invoke('update_long_screenshot_toolbar', {
      x: physicalX,
      y: physicalY,
      width: physicalWidth,
      height: physicalHeight,
    }).catch(() => {});
  }, [longScreenshotMode, screens, stageRegionManager]);

  const {
    lockedPosition,
    isDragging,
    isSnapped,
    handleDragStart,
  } = usePanelDrag({
    panelRef: toolbarRef,
    panelSize: toolbarSize,
    selection,
    stageRegionManager,
    enableSnap: true,
    onPositionChange: handleToolbarPositionChange,
  });

  if (!selection || selection.width <= 0 || selection.height <= 0) return null;
  if (isDrawing || isMoving || isResizing) return null;

  const disablePointerEvents = isDrawingShape;

  const getToolbarPosition = (isLongScreenshot = longScreenshotMode) => {
    const padding = 8; 
    const { width: toolbarWidth, height: toolbarHeight } = toolbarSize;

    let x = selection.x + selection.width;
    let y = selection.y + selection.height + padding;

    const targetScreen = stageRegionManager 
      ? stageRegionManager.getNearestScreen(selection.x + selection.width, selection.y + selection.height)
      : null;

    const bounds = targetScreen || {
      x: 0,
      y: 0,
      width: window.innerWidth || 1920,
      height: window.innerHeight || 1080,
    };

    const screenRight = bounds.x + bounds.width;
    const screenBottom = bounds.y + bounds.height;
    const screenLeft = bounds.x;
    const screenTop = bounds.y;

    if (y + toolbarHeight > screenBottom) {
      const yTop = selection.y - toolbarHeight - padding;
      
      if (yTop >= screenTop) {
        y = yTop;
      } else {
        if (isLongScreenshot) {
          y = selection.y + padding;
        } else {
          y = selection.y + selection.height - toolbarHeight - padding;
        }
        
        if (y + toolbarHeight > screenBottom) {
          y = screenBottom - toolbarHeight - padding;
        }
      }
    }

    if (x > screenRight) {
      x = screenRight - padding;
    }

    if (x - toolbarWidth < screenLeft) {
      x = screenLeft + toolbarWidth + padding;
    }

    if (y < screenTop) y = screenTop + padding;
    if (y + toolbarHeight > screenBottom) y = screenBottom - toolbarHeight - padding;

    return { x, y };
  };

  const Divider = () => (
    <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-1" />
  );

  const renderButton = (tool) => (
    <button
      key={tool.id}
      type="button"
      onClick={tool.onClick}
      title={tool.title}
      disabled={tool.disabled}
      aria-label={tool.title}
      className={[
        'flex items-center justify-center w-6 h-6 rounded-md border text-gray-600 dark:text-gray-200',
        'active:scale-95 hover:scale-110',
        tool.disabled
          ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
          : tool.active
            ? 'bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
            : tool.variant === 'primary'
              ? 'bg-blue-500 hover:bg-blue-600 border-blue-500 text-white shadow-sm'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700',
        'transition-all duration-200 ease-in-out',
      ].join(' ')}
    >
      <i className={`${tool.icon} text-lg`}></i>
    </button>
  );

  // 长截屏模式的按钮
  const longScreenshotTools = [
    {
      id: 'longScreenshot-confirm',
      icon: 'ti ti-check',
      title: '复制到剪贴板',
      onClick: onLongScreenshotCopy,
      variant: 'primary',
      disabled: isLongScreenshotSaving || !hasLongScreenshotPreview,
    },
    {
      id: 'longScreenshot-cancel',
      icon: 'ti ti-x',
      title: '取消',
      onClick: onLongScreenshotCancel,
      variant: 'ghost',
      disabled: isLongScreenshotSaving,
    },
    {
      id: 'longScreenshot-save',
      icon: 'ti ti-download',
      title: '保存',
      onClick: onLongScreenshotSave,
      variant: 'default',
      disabled: isLongScreenshotSaving || !hasLongScreenshotPreview,
    },
    {
      id: 'longScreenshot-toggle',
      icon: isLongScreenshotCapturing ? 'ti ti-player-stop' : 'ti ti-player-play',
      title: isLongScreenshotCapturing ? '停止捕获' : '开始捕获',
      onClick: isLongScreenshotCapturing ? onLongScreenshotStop : onLongScreenshotStart,
      variant: isLongScreenshotCapturing ? 'default' : 'primary',
      disabled: isLongScreenshotSaving,
    },
  ];

  // 普通模式的按钮
  const actionCallbacks = { confirm: onConfirm, cancel: onCancel, pin: onPin, save: onSave };
  const actionVariants = { confirm: 'primary', cancel: 'ghost' };
  
  // 贴图编辑模式
  const pinEditActionTools = [
    { id: 'confirm', icon: 'ti ti-check', title: '确定', actionKey: 'confirm', onClick: onConfirm, variant: 'primary' },
    { id: 'cancel', icon: 'ti ti-x', title: '取消', actionKey: 'cancel', onClick: onCancel, variant: 'ghost' },
  ];
  
  const actionTools = pinEditMode ? pinEditActionTools : [
    ...ACTION_TOOLS.map(t => ({
      ...t,
      onClick: actionCallbacks[t.actionKey],
      variant: actionVariants[t.actionKey] || 'default',
    })),
    {
      id: 'longScreenshot',
      icon: 'ti ti-viewport-tall',
      title: '长截屏',
      onClick: () => {
        const pos = getToolbarPosition(true);
        onLongScreenshotEnter({
          x: pos.x - toolbarSize.width,
          y: pos.y,
          width: toolbarSize.width,
          height: toolbarSize.height,
        });
      },
      variant: 'default'
    }
  ];

  const historyActions = { undo, redo, clear: clearCanvas };
  const historyDisabled = { undo: !canUndo, redo: !canRedo, clear: !canClearCanvas };
  const historyTools = [...HISTORY_TOOLS].reverse().map(t => ({
    ...t,
    onClick: historyActions[t.actionKey],
    disabled: historyDisabled[t.actionKey],
    variant: 'default',
  }));

  const drawingTools = [...DRAWING_TOOLS].reverse().map(t => ({
    ...t,
    onClick: () => onToolChange?.(activeToolId === t.id ? null : t.id),
    active: activeToolId === t.id,
    variant: 'default',
  }));

  const autoPosition = getToolbarPosition();
  const finalPosition = lockedPosition || { x: autoPosition.x - toolbarSize.width, y: autoPosition.y };

  return (
    <div
      ref={toolbarRef}
      data-toolbar="selection"
      className={[
        'flex flex-row-reverse items-center gap-1 px-2 py-[5px] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 select-none',
        (isSnapped.x || isSnapped.y) && 'ring-2 ring-blue-400/50',
      ].filter(Boolean).join(' ')}
      style={{
        position: 'absolute',
        left: lockedPosition ? finalPosition.x : autoPosition.x,
        top: finalPosition.y,
        transform: lockedPosition ? 'none' : 'translateX(-100%)',
        pointerEvents: disablePointerEvents ? 'none' : 'auto',
        opacity: disablePointerEvents ? 0.5 : 1,
        transition: disablePointerEvents 
          ? 'opacity 1500ms ease-out' 
          : 'opacity 300ms ease-out', 
      }}
    >
      {longScreenshotMode ? (
        <>
          {longScreenshotTools.map(renderButton)}
        </>
      ) : (
        <>
          {actionTools.map(renderButton)}
          <Divider />
          {historyTools.map(renderButton)}
          <Divider />
          {drawingTools.map(renderButton)}
        </>
      )}
      {/* 拖拽手柄 */}
      <div
        className="flex items-center justify-center w-5 h-6 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onPointerDown={handleDragStart}
        title="拖拽移动工具栏"
      >
        <i className="ti ti-grip-vertical text-sm"></i>
      </div>
    </div>
  );
}

export default SelectionToolbar;
