import { Group } from 'react-konva';
import { Html } from 'react-konva-utils';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';

function SelectionToolbar({ selection, isDrawing, isMoving, isResizing, stageRegionManager, onCancel, onConfirm, onPin }) {
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

  const tools = [
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
    }
  ];

  const { x, y } = getToolbarPosition();

  return (
    <Group x={x} y={y}>
      <Html>
        <div
          className="flex flex-row-reverse items-center gap-2 px-2 py-[5px] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 select-none pointer-events-auto"
          style={{ transform: 'translateX(-100%)' }}
        >
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={tool.onClick}
              title={tool.title}
              aria-label={tool.title}
              className={[
                'flex items-center justify-center w-6 h-6 rounded-md border text-gray-600 dark:text-gray-200',
                tool.variant === 'primary'
                  ? 'bg-blue-500 hover:bg-blue-600 border-blue-500 text-white shadow-sm'
                  : tool.variant === 'default'
                  ? 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700',
                'transition-colors duration-150',
              ].join(' ')}
            >
              <i className={`${tool.icon} text-sm`}></i>
            </button>
          ))}
        </div>
      </Html>
    </Group>
  );
}

export default SelectionToolbar;
