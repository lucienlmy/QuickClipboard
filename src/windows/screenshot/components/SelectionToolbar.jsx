import '@tabler/icons-webfont/dist/tabler-icons.min.css';

function SelectionToolbar({
  selection, isDrawing, isMoving, isResizing, stageRegionManager,
  onCancel, onConfirm, onPin, onSave,
  activeToolId, onToolChange, undo, redo, canUndo, canRedo
}) {
  if (!selection || selection.width <= 0 || selection.height <= 0) return null;
  if (isDrawing || isMoving || isResizing) return null;

  const getToolbarPosition = () => {
    const padding = 8;
    const toolbarHeight = 35;
    const toolbarWidth = 340; 

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
        y = selection.y + selection.height - toolbarHeight - padding;
        
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
    }
  ];

  const historyTools = [
    { id: 'redo', icon: 'ti ti-arrow-forward-up', title: '重做', onClick: redo, disabled: !canRedo, variant: 'default' },
    { id: 'undo', icon: 'ti ti-arrow-back-up', title: '撤销', onClick: undo, disabled: !canUndo, variant: 'default' },
  ];

  const drawingTools = [
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
      {actionTools.map(renderButton)}
      <Divider />
      {historyTools.map(renderButton)}
      <Divider />
      {drawingTools.map(renderButton)}
    </div>
  );
}

export default SelectionToolbar;
