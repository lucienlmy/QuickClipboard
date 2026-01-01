import { useState, useRef, useEffect, useMemo } from 'react';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';

function SelectionInfoBar({ 
  selection, 
  cornerRadius, 
  aspectRatio,
  isMoving,
  isDrawing,
  isResizing,
  isDrawingShape,
  stageRegionManager,
  onCornerRadiusChange, 
  onAspectRatioChange,
  onSizeChange,
  getScaleForPosition,
}) {
  const [showSizeEditor, setShowSizeEditor] = useState(false);
  const [editWidth, setEditWidth] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const sizeButtonRef = useRef(null);
  const sizeEditorRef = useRef(null);
  const widthInputRef = useRef(null);

  useEffect(() => {
    if (!showSizeEditor) return;
    const handleClickOutside = (e) => {
      if (
        sizeEditorRef.current && !sizeEditorRef.current.contains(e.target) &&
        sizeButtonRef.current && !sizeButtonRef.current.contains(e.target)
      ) {
        setShowSizeEditor(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside, true);
    return () => document.removeEventListener('pointerdown', handleClickOutside, true);
  }, [showSizeEditor]);

  useEffect(() => {
    if (showSizeEditor && selection) {
      setEditWidth(Math.round(selection.width).toString());
      setEditHeight(Math.round(selection.height).toString());
      setTimeout(() => widthInputRef.current?.select(), 0);
    }
  }, [showSizeEditor]);

  if (!selection || selection.width <= 0 || selection.height <= 0 || isMoving) {
    return null;
  }

  const handleSizeSubmit = () => {
    let w = parseInt(editWidth) || selection.width;
    let h = parseInt(editHeight) || selection.height;
    if (w > 0 && h > 0 && onSizeChange) {
      if (stageRegionManager) {
        const bounds = stageRegionManager.getTotalBounds();
        if (bounds) {
          const maxW = bounds.x + bounds.width - selection.x;
          const maxH = bounds.y + bounds.height - selection.y;
          w = Math.min(w, maxW);
          h = Math.min(h, maxH);
        }
      }
      onSizeChange(Math.max(1, w), Math.max(1, h));
    }
    setShowSizeEditor(false);
  };

  const handleSizeKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSizeSubmit();
    } else if (e.key === 'Escape') {
      setShowSizeEditor(false);
    }
  };

  const getInfoBarPosition = () => {
    const padding = 8;
    const infoBarHeight = 28;
    const infoBarWidth = 220;
    const toolbarHeight = 35;
    const toolbarWidthEst = 110; 

    let x = selection.x;
    let y = selection.y - infoBarHeight - padding;
    let isInsideSelection = false; // 标记是否在选区内部
    
    if (stageRegionManager) {
      const centerX = selection.x + selection.width / 2;
      const centerY = selection.y + selection.height / 2;
      const targetScreen = stageRegionManager.getNearestScreen(centerX, centerY);
      
      if (targetScreen) {
        const screenTop = targetScreen.y;
        const screenBottom = targetScreen.y + targetScreen.height;
        const screenLeft = targetScreen.x;
        const screenRight = targetScreen.x + targetScreen.width;

        const hasBottomSpaceForToolbar = selection.y + selection.height + padding + toolbarHeight <= screenBottom;
        const hasTopSpaceForToolbar = selection.y - toolbarHeight - padding >= screenTop;
        const hasTopSpaceForInfoBar = y >= screenTop;

        if (hasBottomSpaceForToolbar) {
          if (!hasTopSpaceForInfoBar) {
             x = selection.x + padding;
             y = selection.y + padding;
             isInsideSelection = true;
          }
        } else {
          if (hasTopSpaceForToolbar) {
             if (hasTopSpaceForInfoBar) {
                const totalWidthNeeded = infoBarWidth + toolbarWidthEst + padding * 2;
                if (selection.width < totalWidthNeeded) {
                   x = selection.x + padding;
                   y = selection.y + padding;
                   isInsideSelection = true;
                }
             } else {
                x = selection.x + padding;
                y = selection.y + padding;
                isInsideSelection = true;
             }
          } else {
             if (!hasTopSpaceForInfoBar) {
                x = selection.x + padding;
                y = selection.y + padding;
                isInsideSelection = true;
             }
          }
        }
        
        if (x + infoBarWidth > screenRight) {
          x = screenRight - infoBarWidth - padding;
        }
        if (x < screenLeft) {
          x = screenLeft + padding;
        }
      }
    } else {
      if (y < 10) {
        x = selection.x + padding;
        y = selection.y + padding;
        isInsideSelection = true;
      }
    }
    
    return { x, y, isInsideSelection };
  };

  const handleCornerRadiusInput = (e) => {
    const value = parseInt(e.target.value) || 0;
    const maxRadius = Math.min(selection.width, selection.height) / 2;
    onCornerRadiusChange(Math.max(0, Math.min(value, maxRadius)));
  };

  const handleAspectRatioChange = (e) => {
    const bounds = stageRegionManager?.getTotalBounds() || null;
    onAspectRatioChange(e.target.value, bounds);
  };

  const { x, y, isInsideSelection } = getInfoBarPosition();
  const disablePointerEvents = isDrawing || isResizing || isDrawingShape;
  const isAspectLocked = aspectRatio !== 'free';
  const transformOrigin = isInsideSelection ? 'top left' : 'bottom left';
  
  const uiScale = useMemo(() => {
    if (!getScaleForPosition) return 1;
    return getScaleForPosition(x, y);
  }, [getScaleForPosition, x, y]);

  const handleToggleAspectLock = () => {
    if (isAspectLocked) {
      onAspectRatioChange('free');
      return;
    }
    if (selection.height === 0) return;
    const ratio = selection.width / selection.height;
    const value = isFinite(ratio) && ratio > 0 ? ratio.toFixed(3) : '1';
    const bounds = stageRegionManager?.getTotalBounds() || null;
    onAspectRatioChange(value, bounds);
  };

  return (
    <div
      style={{ 
        position: 'absolute', 
        left: x, 
        top: y, 
        transform: `scale(${uiScale})`,
        transformOrigin,
        pointerEvents: disablePointerEvents ? 'none' : 'auto',
        opacity: disablePointerEvents ? 0.5 : 1,
        transition: disablePointerEvents 
          ? 'opacity 1500ms ease-out' 
          : 'opacity 300ms ease-out', 
      }}
    >
      <div className="flex items-center gap-1.5 px-1.5 py-1 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-md shadow-sm border border-gray-200/50 dark:border-gray-700/50 select-none">
        {/* 比例锁定 */}
        <button
          onClick={handleToggleAspectLock}
          className={`flex items-center justify-center h-5 w-5 rounded transition-colors ${isAspectLocked
            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700/50'}`}
          title={isAspectLocked ? '解除比例锁定' : '锁定当前比例'}
        >
          <i className={`ti ${isAspectLocked ? 'ti-lock' : 'ti-lock-open-2'} text-xs`}></i>
        </button>

        {/* 尺寸展示 */}
        <div className="relative flex items-center">
          <button
            ref={sizeButtonRef}
            onClick={() => setShowSizeEditor(!showSizeEditor)}
            className="flex items-center h-5 px-1.5 font-mono text-[11px] font-medium text-gray-600 dark:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            title="点击编辑尺寸"
          >
            {Math.round(selection.width)} × {Math.round(selection.height)}
          </button>
          
          {showSizeEditor && (
            <div
              ref={sizeEditorRef}
              className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-1.5">
                <label className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded px-1.5 h-6">
                  <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">W</span>
                  <input
                    ref={widthInputRef}
                    type="number"
                    value={editWidth}
                    onChange={(e) => setEditWidth(e.target.value)}
                    onKeyDown={handleSizeKeyDown}
                    min="1"
                    className="w-12 text-[11px] font-mono bg-transparent text-gray-700 dark:text-gray-200 outline-none text-center appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </label>
                <span className="text-gray-300 dark:text-gray-600 text-xs">×</span>
                <label className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded px-1.5 h-6">
                  <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">H</span>
                  <input
                    type="number"
                    value={editHeight}
                    onChange={(e) => setEditHeight(e.target.value)}
                    onKeyDown={handleSizeKeyDown}
                    min="1"
                    className="w-12 text-[11px] font-mono bg-transparent text-gray-700 dark:text-gray-200 outline-none text-center appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </label>
                <button
                  onClick={handleSizeSubmit}
                  className="flex items-center justify-center h-6 w-6 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                  title="确认"
                >
                  <i className="ti ti-check text-xs"></i>
                </button>
              </div>
            </div>
          )}
        </div>
        
        <div className="w-px h-3.5 bg-gray-200 dark:bg-gray-700"></div>
        
        {/* 比例选择 */}
        <div className="relative flex items-center">
          <select
            value={aspectRatio}
            onChange={handleAspectRatioChange}
            className="h-5 appearance-none pl-1.5 pr-4 text-[11px] font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-700/50 dark:hover:bg-gray-600/50 text-gray-600 dark:text-gray-300 rounded cursor-pointer outline-none transition-colors"
            title="比例"
          >
            <option value="free">自由</option>
            <option value="1">1:1</option>
            <option value="1.333">4:3</option>
            <option value="1.778">16:9</option>
            <option value="0.5625">9:16</option>
          </select>
          <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 dark:text-gray-500">
            <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
        </div>

        {cornerRadius > 0 && (
          <>
            <div className="w-px h-3.5 bg-gray-200 dark:bg-gray-700"></div>
            {/* 圆角设置 */}
            <label className="flex items-center gap-0.5 h-5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700/50 dark:hover:bg-gray-600/50 rounded px-1.5 transition-colors cursor-text">
              <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">R</span>
              <input
                type="number"
                value={Math.round(cornerRadius)}
                onChange={handleCornerRadiusInput}
                min="0"
                max={Math.min(selection.width, selection.height) / 2}
                className="w-5 text-[11px] font-mono bg-transparent text-gray-600 dark:text-gray-300 outline-none text-center appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}

export default SelectionInfoBar;
