import '@tabler/icons-webfont/dist/tabler-icons.min.css';

function SelectionInfoBar({ 
  selection, 
  cornerRadius, 
  aspectRatio,
  isMoving,
  stageRegionManager,
  onCornerRadiusChange, 
  onAspectRatioChange 
}) {
  if (!selection || selection.width <= 0 || selection.height <= 0 || isMoving) {
    return null;
  }

  const getInfoBarPosition = () => {
    const padding = 8;
    const infoBarHeight = 28;
    const infoBarWidth = 220;
    const toolbarHeight = 35;
    const toolbarWidthEst = 110; 

    let x = selection.x;
    let y = selection.y - infoBarHeight - padding;
    
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
          }
        } else {
          if (hasTopSpaceForToolbar) {
             if (hasTopSpaceForInfoBar) {
                const totalWidthNeeded = infoBarWidth + toolbarWidthEst + padding * 2;
                if (selection.width < totalWidthNeeded) {
                   x = selection.x + padding;
                   y = selection.y + padding;
                }
             } else {
                x = selection.x + padding;
                y = selection.y + padding;
             }
          } else {
             if (!hasTopSpaceForInfoBar) {
                x = selection.x + padding;
                y = selection.y + padding;
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
      }
    }
    
    return { x, y };
  };

  const handleCornerRadiusInput = (e) => {
    const value = parseInt(e.target.value) || 0;
    const maxRadius = Math.min(selection.width, selection.height) / 2;
    onCornerRadiusChange(Math.max(0, Math.min(value, maxRadius)));
  };

  const handleAspectRatioChange = (e) => {
    onAspectRatioChange(e.target.value);
  };

  const { x, y } = getInfoBarPosition();

  return (
    <div
      style={{ 
        position: 'absolute', 
        left: x, 
        top: y, 
        pointerEvents: 'none' 
      }}
    >
      <div className="flex items-center gap-2 px-2 py-1.5 bg-white/85 dark:bg-gray-800/85 backdrop-blur-sm rounded-md shadow-sm border border-gray-200/50 dark:border-gray-700/50 select-none">
        {/* 尺寸展示 */}
            <div className="flex items-center px-0.5">
              <span className="font-mono text-xs font-medium text-gray-600 dark:text-gray-300 min-w-[70px] text-center">
                {Math.round(selection.width)} × {Math.round(selection.height)}
              </span>
            </div>
            
            <div className="w-px h-3 bg-gray-200 dark:bg-gray-700"></div>
            
            {/* 比例选择 */}
            <div className="relative flex items-center">
              <select
                value={aspectRatio}
                onChange={handleAspectRatioChange}
                style={{ pointerEvents: 'auto' }}
                className="appearance-none pl-2 pr-5 py-0.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-700/50 dark:hover:bg-gray-600/50 text-gray-700 dark:text-gray-200 rounded cursor-pointer outline-none transition-colors text-center min-w-[60px]"
                title="比例"
              >
                <option value="free">自由</option>
                <option value="1">1:1</option>
                <option value="1.333">4:3</option>
                <option value="1.778">16:9</option>
                <option value="0.5625">9:16</option>
              </select>
              {/* 自定义下拉箭头 */}
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </div>
            </div>

            {cornerRadius > 0 && (
              <>
                <div className="w-px h-3 bg-gray-200 dark:bg-gray-700"></div>
                {/* 圆角设置 */}
                <label style={{ pointerEvents: 'auto' }} className="group flex items-center gap-0.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700/50 dark:hover:bg-gray-600/50 rounded pl-1.5 pr-0.5 py-0.5 transition-colors cursor-text relative">
                  <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase mr-0.5">R</span>
                  <input
                    type="number"
                    value={Math.round(cornerRadius)}
                    onChange={handleCornerRadiusInput}
                    min="0"
                    max={Math.min(selection.width, selection.height) / 2}
                    className="w-6 text-xs bg-transparent text-gray-700 dark:text-gray-200 outline-none text-center font-medium appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <div className="flex flex-col -space-y-px opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        const maxRadius = Math.min(selection.width, selection.height) / 2;
                        onCornerRadiusChange(Math.min(Math.round(cornerRadius) + 1, maxRadius));
                      }}
                      className="flex items-center justify-center h-2 w-3 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 active:scale-95"
                    >
                      <svg width="6" height="3" viewBox="0 0 6 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 2.5L3 0.5L5 2.5"/>
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        onCornerRadiusChange(Math.max(0, Math.round(cornerRadius) - 1));
                      }}
                      className="flex items-center justify-center h-2 w-3 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 active:scale-95"
                    >
                      <svg width="6" height="3" viewBox="0 0 6 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 0.5L3 2.5L5 0.5"/>
                      </svg>
                    </button>
                  </div>
                </label>
              </>
            )}
      </div>
    </div>
  );
}

export default SelectionInfoBar;
