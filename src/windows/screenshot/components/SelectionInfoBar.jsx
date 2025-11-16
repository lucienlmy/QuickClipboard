import { Group, Rect } from 'react-konva';
import { Html } from 'react-konva-utils';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';

function SelectionInfoBar({ 
  selection, 
  cornerRadius, 
  aspectRatio,
  isMoving,
  onCornerRadiusChange, 
  onAspectRatioChange 
}) {
  if (!selection || selection.width <= 0 || selection.height <= 0 || isMoving) {
    return null;
  }

  const getInfoBarPosition = () => {
    const padding = 8;
    let x = selection.x;
    let y = selection.y - 40;
    
    if (y < 10) {
      y = selection.y + selection.height + padding;
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
          <div className="flex items-center gap-3 px-3 py-1.5 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 select-none pointer-events-auto">
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
          </div>
        </Html>
    </Group>
  );
}

export default SelectionInfoBar;
