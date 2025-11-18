import { Group } from 'react-konva';
import { Html } from 'react-konva-utils';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';

function SelectionToolbar({ selection, isDrawing, isMoving, isResizing, onCancel, onConfirm, onPin }) {
  if (!selection || selection.width <= 0 || selection.height <= 0) return null;
  if (isDrawing || isMoving || isResizing) return null;

  const getToolbarPosition = () => {
    const margin = 8;
    const x = selection.x + selection.width;
    const y = selection.y + selection.height + margin;
    return { x, y };
  };

  const tools = [
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
      id: 'confirm',
      icon: 'ti ti-check',
      title: '确定',
      onClick: onConfirm,
      variant: 'primary',
    },
  ];

  const { x, y } = getToolbarPosition();

  return (
    <Group x={x} y={y}>
      <Html>
        <div
          className="flex flex-row-reverse items-center gap-1.5 px-1.5 py-1 bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 select-none pointer-events-auto"
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
                'flex items-center justify-center w-7 h-7 rounded-md border text-gray-600 dark:text-gray-200',
                tool.variant === 'primary'
                  ? 'bg-blue-500 hover:bg-blue-600 border-blue-500 text-white shadow-sm'
                  : tool.variant === 'default'
                  ? 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700',
                'transition-colors duration-150',
              ].join(' ')}
            >
              <i className={`${tool.icon} text-base`}></i>
            </button>
          ))}
        </div>
      </Html>
    </Group>
  );
}

export default SelectionToolbar;
