import { Group, Rect } from 'react-konva';
import { Html } from 'react-konva-utils';
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
    const infoBarHeight = 35;
    const infoBarWidth = 270;
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

  return (
    <Group x={getInfoBarPosition().x} y={getInfoBarPosition().y}>
        <Html>
          <div className="flex items-center gap-2 px-2 py-1.5 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 select-none pointer-events-auto">
            <div className="flex items-center gap-1.5">
              <i className="ti ti-dimensions text-sm text-gray-500 dark:text-gray-400"></i>
              <span className="font-mono text-xs text-gray-700 dark:text-gray-300 min-w-20">
                {Math.round(selection.width)} × {Math.round(selection.height)}
              </span>
            </div>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600"></div>
            <div className="flex items-center gap-1.5">
              <i className="ti ti-aspect-ratio text-sm text-gray-500 dark:text-gray-400"></i>
              <select
                value={aspectRatio}
                onChange={handleAspectRatioChange}
                className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded cursor-pointer outline-none hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <option value="free">自由</option>
                <option value="1">1:1</option>
                <option value="1.333">4:3</option>
                <option value="1.778">16:9</option>
                <option value="0.5625">9:16</option>
              </select>
            </div>
            {cornerRadius > 0 && (
              <>
                <div className="w-px h-4 bg-gray-300 dark:bg-gray-600"></div>
                <label className="flex items-center gap-1.5">
                  <i className="ti ti-border-radius text-sm text-gray-500 dark:text-gray-400"></i>
                  <input
                    type="number"
                    value={Math.round(cornerRadius)}
                    onChange={handleCornerRadiusInput}
                    min="0"
                    max={Math.min(selection.width, selection.height) / 2}
                    className="w-14 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded outline-none focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
                  />
                </label>
              </>
            )}
          </div>
        </Html>
    </Group>
  );
}

export default SelectionInfoBar;
