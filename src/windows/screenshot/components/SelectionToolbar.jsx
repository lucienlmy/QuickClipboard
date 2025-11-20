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

    let x = selection.x + selection.width;
    let y = selection.y + selection.height + padding;
    
    if (stageRegionManager) {
      const centerX = selection.x + selection.width / 2;
      const centerY = selection.y + selection.height / 2;
      const targetScreen = stageRegionManager.getNearestScreen(centerX, centerY);
      
      if (targetScreen) {
        const screenBottom = targetScreen.y + targetScreen.height;
        const screenTop = targetScreen.y;
        const screenRight = targetScreen.x + targetScreen.width;
        const screenLeft = targetScreen.x;

        const hasBottomSpace = y + toolbarHeight <= screenBottom;
        
        if (!hasBottomSpace) {
          const yTop = selection.y - toolbarHeight - padding;
          const hasTopSpace = yTop >= screenTop;

          if (hasTopSpace) {
            y = yTop;
          } else {
            x = selection.x + selection.width - padding;
            y = selection.y + selection.height - toolbarHeight - padding;
          }
        }
        
        if (x > screenRight) {
          x = screenRight - padding;
        }
        if (x - 110 < screenLeft) {
           x = screenLeft + 110;
        }
      }
    } else {
      const estimatedWindowHeight = window.innerHeight || 1080;
      if (y + toolbarHeight > estimatedWindowHeight - 10) {
        const hasTopSpace = selection.y - toolbarHeight - padding >= 10;
        if (hasTopSpace) {
          y = selection.y - toolbarHeight - padding;
        } else {
          x = selection.x + selection.width - padding;
          y = selection.y + selection.height - toolbarHeight - padding;
        }
      }
    }
    
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
        tool.active 
          ? 'bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
          : tool.variant === 'primary'
          ? 'bg-blue-500 hover:bg-blue-600 border-blue-500 text-white shadow-sm'
          : tool.disabled
          ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700' 
          : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700',
        'transition-colors duration-150',
      ].join(' ')}
    >
      <i className={`${tool.icon} text-sm`}></i>
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
      id: 'pen', 
      icon: 'ti ti-pencil', 
      title: '画笔', 
      onClick: () => onToolChange && onToolChange(activeToolId === 'pen' ? null : 'pen'), 
      active: activeToolId === 'pen',
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
