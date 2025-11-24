import '@tabler/icons-webfont/dist/tabler-icons.min.css';

function SelectionToolbar({
  selection, isDrawing, isMoving, isResizing, stageRegionManager,
  onCancel, onConfirm, onPin, onSave,
  activeToolId, onToolChange, undo, redo, canUndo, canRedo,
  clearCanvas, canClearCanvas,
  // 长截屏相关
  longScreenshotMode,
  isLongScreenshotCapturing,
  hasLongScreenshotPreview,
  onLongScreenshotEnter,
  onLongScreenshotStart,
  onLongScreenshotStop,
  onLongScreenshotSave,
  onLongScreenshotCancel,
}) {
  if (!selection || selection.width <= 0 || selection.height <= 0) return null;
  if (isDrawing || isMoving || isResizing) return null;

  const toolbarWidth = 340;
  const toolbarHeight = 35;

  const getToolbarPosition = (isLongScreenshot = longScreenshotMode) => {
    const padding = 8; 

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
        // 长截图模式：优先内右上角
        if (isLongScreenshot) {
          y = selection.y + padding;
        } else {
          // 普通模式：内右下角
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
        tool.active
          ? 'bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
          : tool.variant === 'primary'
            ? 'bg-blue-500 hover:bg-blue-600 border-blue-500 text-white shadow-sm'
            : tool.disabled
              ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
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
      title: '完成长截屏',
      onClick: onLongScreenshotSave,
      variant: 'primary',
      disabled: !hasLongScreenshotPreview,
    },
    {
      id: 'longScreenshot-cancel',
      icon: 'ti ti-x',
      title: '取消',
      onClick: onLongScreenshotCancel,
      variant: 'ghost',
    },
    {
      id: 'longScreenshot-toggle',
      icon: isLongScreenshotCapturing ? 'ti ti-player-stop' : 'ti ti-player-play',
      title: isLongScreenshotCapturing ? '停止捕获' : '开始捕获',
      onClick: isLongScreenshotCapturing ? onLongScreenshotStop : onLongScreenshotStart,
      variant: isLongScreenshotCapturing ? 'default' : 'primary',
    },
  ];

  // 普通模式的按钮
  const actionTools = [
    {
      id: 'confirm',
      icon: 'ti ti-check',
      title: '确定',
      onClick: onConfirm,
      variant: 'primary',
    },
    {
      id: 'cancel',
      icon: 'ti ti-x',
      title: '取消',
      onClick: onCancel,
      variant: 'ghost',
    },
    {
      id: 'pin',
      icon: 'ti ti-pin',
      title: '贴图',
      onClick: onPin,
      variant: 'default',
    },
    {
      id: 'save',
      icon: 'ti ti-download',
      title: '保存',
      onClick: onSave,
      variant: 'default',
    },
    {
      id: 'longScreenshot',
      icon: 'ti ti-viewport-tall',
      title: '长截屏',
      onClick: () => {
        const pos = getToolbarPosition(true); // 使用长截图模式的位置计算
        const toolbarPosition = {
          x: pos.x - toolbarWidth,
          y: pos.y,
          width: toolbarWidth,
          height: toolbarHeight,
        };
        onLongScreenshotEnter(toolbarPosition);
      },
      variant: 'default'
    }
  ];

  const historyTools = [
    { id: 'clear', icon: 'ti ti-trash', title: '清空画布', onClick: clearCanvas, disabled: !canClearCanvas, variant: 'default' },
    { id: 'redo', icon: 'ti ti-arrow-forward-up', title: '重做', onClick: redo, disabled: !canRedo, variant: 'default' },
    { id: 'undo', icon: 'ti ti-arrow-back-up', title: '撤销', onClick: undo, disabled: !canUndo, variant: 'default' },
  ];

  const drawingTools = [
    {
      id: 'ocr',
      icon: 'ti ti-text-scan-2',
      title: 'OCR识别',
      onClick: () => onToolChange && onToolChange(activeToolId === 'ocr' ? null : 'ocr'),
      active: activeToolId === 'ocr',
      variant: 'default'
    },
     {
      id: 'shape',
      icon: 'ti ti-triangle-square-circle',
      title: '形状',
      onClick: () => onToolChange && onToolChange(activeToolId === 'shape' ? null : 'shape'),
      active: activeToolId === 'shape',
      variant: 'default'
    },
    {
      id: 'curveArrow',
      icon: 'ti ti-arrow-ramp-right',
      title: '箭头',
      onClick: () => onToolChange && onToolChange(activeToolId === 'curveArrow' ? null : 'curveArrow'),
      active: activeToolId === 'curveArrow',
      variant: 'default'
    },
    {
      id: 'number',
      icon: 'ti ti-circle-number-1',
      title: '序号',
      onClick: () => onToolChange && onToolChange(activeToolId === 'number' ? null : 'number'),
      active: activeToolId === 'number',
      variant: 'default'
    },
    {
      id: 'watermark',
      icon: 'ti ti-droplet-half-2',
      title: '水印',
      onClick: () => onToolChange && onToolChange(activeToolId === 'watermark' ? null : 'watermark'),
      active: activeToolId === 'watermark',
      variant: 'default'
    },
    {
      id: 'mosaic',
      icon: 'ti ti-blur',
      title: '马赛克',
      onClick: () => onToolChange && onToolChange(activeToolId === 'mosaic' ? null : 'mosaic'),
      active: activeToolId === 'mosaic',
      variant: 'default'
    },
    {
      id: 'text',
      icon: 'ti ti-typography',
      title: '文本',
      onClick: () => onToolChange && onToolChange(activeToolId === 'text' ? null : 'text'),
      active: activeToolId === 'text',
      variant: 'default'
    },
    {
      id: 'pen',
      icon: 'ti ti-pencil',
      title: '画笔',
      onClick: () => onToolChange && onToolChange(activeToolId === 'pen' ? null : 'pen'),
      active: activeToolId === 'pen',
      variant: 'default'
    },
    {
      id: 'select',
      icon: 'ti ti-pointer',
      title: '选择',
      onClick: () => onToolChange && onToolChange(activeToolId === 'select' ? null : 'select'),
      active: activeToolId === 'select',
      variant: 'default'
    },
  ];

  const { x, y } = getToolbarPosition();

  return (
    <div
      className="flex flex-row-reverse items-center gap-1 px-2 py-[5px] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 select-none"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translateX(-100%)'
      }}
    >
      {longScreenshotMode ? (
        // 长截屏模式：只显示长截屏相关按钮
        <>
          {longScreenshotTools.map(renderButton)}
        </>
      ) : (
        // 普通模式：显示完整工具栏
        <>
          {actionTools.map(renderButton)}
          <Divider />
          {historyTools.map(renderButton)}
          <Divider />
          {drawingTools.map(renderButton)}
        </>
      )}
    </div>
  );
}

export default SelectionToolbar;
