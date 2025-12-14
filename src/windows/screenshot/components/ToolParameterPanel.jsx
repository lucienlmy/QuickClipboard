import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import SliderControl from './controls/SliderControl';
import ColorControl from './controls/ColorControl';
import SegmentedControl from './controls/SegmentedControl';
import MultiToggleControl from './controls/MultiToggleControl';
import SelectControl from './controls/SelectControl';
import NumberInputControl from './controls/NumberInputControl';
import { isToolPersistenceEnabled } from '../utils/toolParameterPersistence';

const DEFAULT_PANEL_SIZE = { width: 240, height: 160 };

const clamp = (value, min, max) => {
  if (typeof min !== 'number' || typeof max !== 'number') return value;
  return Math.min(Math.max(value, min), max);
};

const getFallbackBounds = () => ({
  left: 0,
  top: 0,
  right: window.innerWidth || 1920,
  bottom: window.innerHeight || 1080,
});

// 按钮组件
function ActionButton({ param, onAction }) {
  const [status, setStatus] = useState('idle'); 
  
  const handleClick = async () => {
    try {
      await onAction?.(param.action);
      setStatus('success');
      setTimeout(() => setStatus('idle'), 1500);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 1500);
    }
  };
  
  const getButtonStyle = () => {
    if (status === 'success') return 'bg-green-500 text-white';
    if (status === 'error') return 'bg-red-500 text-white';
    if (param.variant === 'danger') return 'bg-red-500 hover:bg-red-600 text-white';
    return 'bg-blue-500 hover:bg-blue-600 text-white';
  };
  
  const getIcon = () => {
    if (status === 'success') return 'ti ti-check';
    if (status === 'error') return 'ti ti-x';
    return param.icon;
  };
  
  const getLabel = () => {
    if (status === 'success') return '已复制';
    if (status === 'error') return '失败';
    return param.label;
  };
  
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status !== 'idle'}
      className={[
        'px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
        'active:scale-95 active:brightness-90',
        getButtonStyle(),
      ].join(' ')}
    >
      {getIcon() && <i className={`${getIcon()} mr-2`}></i>}
      {getLabel()}
    </button>
  );
}

function renderControl(param, value, onChange, onAction, isFirstColor = false) {
  switch (param.type) {
    case 'slider':
      return <SliderControl param={param} value={value} onChange={onChange} />;
    case 'number':
      return <NumberInputControl param={param} value={value} onChange={onChange} />;
    case 'segmented':
      return <SegmentedControl param={param} value={value} onChange={onChange} />;
    case 'multiToggle':
      return <MultiToggleControl param={param} value={value} onChange={onChange} />;
    case 'select':
      return <SelectControl param={param} value={value} onChange={onChange} />;
    case 'button':
      return <ActionButton param={param} onAction={onAction} />;
    case 'textarea':
      return (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
            {param.label}
          </label>
          <textarea
            value={value || ''}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={param.placeholder}
            rows={param.rows || 3}
            readOnly={param.readOnly}
            className={[
              'w-full px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg resize-none placeholder:text-gray-400 dark:placeholder:text-gray-500',
              param.readOnly ? 'cursor-default' : 'focus:outline-none focus:ring-2 focus:ring-blue-500'
            ].join(' ')}
          />
        </div>
      );
    case 'color':
    default:
      return <ColorControl param={param} value={value} onChange={onChange} defaultExpanded={isFirstColor} />;
  }
}

export default function ToolParameterPanel({
  selection,
  activeTool,
  parameters,
  values,
  isSelectMode,
  isDrawingShape,
  stageRegionManager,
  onParameterChange,
  onAction,
  onTogglePersistence,
}) {
  const panelRef = useRef(null);
  const contentRef = useRef(null);
  const [panelSize, setPanelSize] = useState(DEFAULT_PANEL_SIZE);
  const [position, setPosition] = useState({ x: -9999, y: -9999 });
  const [lockedPosition, setLockedPosition] = useState(null);
  const dragStateRef = useRef({ isDragging: false, offset: { x: 0, y: 0 } });
  const [isDragging, setIsDragging] = useState(false);
  const [persistenceEnabled, setPersistenceEnabled] = useState(false);
  const [maxPanelHeight, setMaxPanelHeight] = useState(window.innerHeight - 40);

  const effectiveParameters = useMemo(() => parameters?.filter(Boolean) || [], [parameters]);
  const defaultStyle = useMemo(() => {
    if (!activeTool?.getDefaultStyle) return {};
    return activeTool.getDefaultStyle();
  }, [activeTool]);

  // 监听工具变化，更新持久化状态
  useEffect(() => {
    if (activeTool?.id) {
      setPersistenceEnabled(isToolPersistenceEnabled(activeTool.id));
    }
  }, [activeTool?.id]);

  // 处理持久化开关切换
  const handleTogglePersistence = useCallback(() => {
    if (!activeTool?.id) return;
    const newEnabled = !persistenceEnabled;
    setPersistenceEnabled(newEnabled);
    onTogglePersistence?.(activeTool.id, newEnabled);
  }, [activeTool?.id, persistenceEnabled, onTogglePersistence]);

  const panelSizeRef = useRef(panelSize);
  panelSizeRef.current = panelSize;

  useLayoutEffect(() => {
    if (!contentRef.current) return;
    
    const container = contentRef.current;
    const currentPanelSize = panelSizeRef.current;
    
    container.style.transition = 'none';
    container.style.height = 'auto';
    
    const rect = container.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    if (currentPanelSize.height > 0 && Math.abs(height - currentPanelSize.height) > 2) {
      container.style.height = `${currentPanelSize.height}px`;
      void container.offsetHeight;
      container.style.transition = 'height 200ms cubic-bezier(0.4, 0, 0.2, 1)';
      container.style.height = `${height}px`;
      const timer = setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.style.transition = 'none';
          contentRef.current.style.height = 'auto';
        }
      }, 200);
      setPanelSize({ width, height });
      return () => clearTimeout(timer);
    } else {
      container.style.height = 'auto';
      if (Math.abs(width - currentPanelSize.width) > 2 || Math.abs(height - currentPanelSize.height) > 2) {
        setPanelSize({ width, height });
      }
    }
  }, [effectiveParameters, values, activeTool?.id]);

  const getScreenBoundsForPosition = useCallback((x, y) => {
    const screen = stageRegionManager?.getNearestScreen(x, y);
    if (screen) {
      return {
        left: screen.x,
        right: screen.x + screen.width,
        top: screen.y,
        bottom: screen.y + screen.height,
      };
    }
    return {
      left: 0,
      right: window.innerWidth || 1920,
      top: 0,
      bottom: window.innerHeight || 1080,
    };
  }, [stageRegionManager]);

  useEffect(() => {
    if (!selection || !activeTool || !panelSize) return;

    const padding = 12;
    const centerX = selection.x + selection.width / 2;
    const centerY = selection.y + selection.height / 2;
    
    const within = getScreenBoundsForPosition(centerX, centerY);

    if (lockedPosition) {
      return;
    }

    const maxAvailableHeight = (within.bottom - within.top) - 40;
    const effectivePanelHeight = Math.min(panelSize.height, maxAvailableHeight);

    const attemptPositions = [
      {
        key: 'right',
        x: selection.x + selection.width + padding,
        y: centerY - effectivePanelHeight / 2,
        fits: (selection.x + selection.width + padding + panelSize.width) <= within.right,
      },
      {
        key: 'left',
        x: selection.x - panelSize.width - padding,
        y: centerY - effectivePanelHeight / 2,
        fits: (selection.x - padding - panelSize.width) >= within.left,
      },
      {
        key: 'bottom',
        x: centerX - panelSize.width / 2,
        y: selection.y + selection.height + padding,
        fits: (selection.y + selection.height + padding + effectivePanelHeight) <= within.bottom,
      },
      {
        key: 'top',
        x: centerX - panelSize.width / 2,
        y: selection.y - effectivePanelHeight - padding,
        fits: (selection.y - padding - effectivePanelHeight) >= within.top,
      },
    ];

    let chosen = attemptPositions.find(pos => pos.fits) || attemptPositions[0];
    let { x, y } = chosen;

    if (!stageRegionManager) {
      x = clamp(x, within.left + 4, within.right - panelSize.width - 4);
      y = clamp(y, within.top + 4, within.bottom - effectivePanelHeight - 4);
    } else {
      const constrained = stageRegionManager.constrainRect(
        {
          x,
          y,
          width: panelSize.width,
          height: effectivePanelHeight,
        },
        'move'
      );
      x = constrained.x;
      y = constrained.y;
    }

    setPosition({ x, y });

    const finalWithin = getScreenBoundsForPosition(x + panelSize.width / 2, y);
    const availableHeight = finalWithin.bottom - y;
    setMaxPanelHeight(Math.max(200, availableHeight));
  }, [selection, activeTool, panelSize.width, panelSize.height, stageRegionManager, lockedPosition, getScreenBoundsForPosition]);

  const handleDragMove = useCallback((event) => {
    if (!dragStateRef.current.isDragging) return;

    event.preventDefault();
    event.stopPropagation();

    const offset = dragStateRef.current.offset;
    let nextX = event.clientX - offset.x;
    let nextY = event.clientY - offset.y;

    const actualWidth = panelSize.width;
    
    const screenWithin = getScreenBoundsForPosition(nextX + actualWidth / 2, nextY);
    const availableHeight = screenWithin.bottom - nextY;
    const effectiveHeight = Math.min(panelSize.height, Math.max(200, availableHeight));

    if (stageRegionManager) {
      const constrained = stageRegionManager.constrainRect(
        {
          x: nextX,
          y: nextY,
          width: actualWidth,
          height: effectiveHeight,
        },
        'move'
      );
      nextX = constrained.x;
      nextY = constrained.y;
    } else {
      const bounds = getFallbackBounds();
      nextX = clamp(nextX, bounds.left, bounds.right - actualWidth);
      nextY = clamp(nextY, bounds.top, bounds.bottom - effectiveHeight);
    }

    const nextPosition = { x: nextX, y: nextY };
    setPosition(nextPosition);
    setLockedPosition(nextPosition);

    const finalScreenWithin = getScreenBoundsForPosition(nextX + actualWidth / 2, nextY);
    const finalAvailableHeight = finalScreenWithin.bottom - nextY;
    setMaxPanelHeight(Math.max(200, finalAvailableHeight));
  }, [panelSize.width, panelSize.height, stageRegionManager, getScreenBoundsForPosition]);

  const stopDragging = useCallback(() => {
    if (!dragStateRef.current.isDragging) return;
    dragStateRef.current.isDragging = false;
    setIsDragging(false);
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', handleDragMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointerleave', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handleDragMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointerleave', stopDragging);
    };
  }, [handleDragMove, stopDragging]);

  const handleDragStart = useCallback((event) => {
    if (!panelRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    dragStateRef.current = {
      isDragging: true,
      offset: {
        x: event.clientX - position.x,
        y: event.clientY - position.y,
      },
    };
    setIsDragging(true);
    setLockedPosition(position);
  }, [position]);

  // 找出第一个颜色参数
  const firstColorParamId = useMemo(() => {
    const visibleParams = effectiveParameters.filter((param) => {
      if (param.visible === undefined) return true;
      if (typeof param.visible === 'function') {
        return param.visible(values || {});
      }
      return param.visible;
    });
    const firstColorParam = visibleParams.find(p => p.type === 'color');
    return firstColorParam?.id;
  }, [effectiveParameters, values]);

  if (!selection || !activeTool || effectiveParameters.length === 0) {
    return null;
  }

  const panelControls = effectiveParameters
    .filter((param) => {
      if (param.visible === undefined) return true;
      if (typeof param.visible === 'function') {
        return param.visible(values || {});
      }
      return param.visible;
    })
    .map((param) => {
      const value = values?.[param.id];
      const fallback = param.type === 'slider'
        ? param.min ?? 0
        : param.type === 'segmented'
          ? param.options?.[0]?.value
          : '#ffffff';
      const controlValue = value ?? fallback;
      const isFirstColor = param.type === 'color' && param.id === firstColorParamId;

      return (
        <div key={param.id} className="flex flex-col gap-1">
          {renderControl(param, controlValue, (val) => onParameterChange?.(param.id, val), onAction, isFirstColor)}
        </div>
      );
    });

  return (
    <div
      ref={panelRef}
      data-panel="tool-parameter"
      className="absolute z-20 select-none"
      style={{ 
        left: position.x, 
        top: position.y,
        pointerEvents: isDrawingShape ? 'none' : 'auto',
        opacity: isDrawingShape ? 0.5 : 1,
        transition: isDrawingShape 
          ? 'opacity 1500ms ease-out' 
          : 'opacity 300ms ease-out', 
      }}
    >
      <div 
        ref={contentRef} 
        className="w-[220px] bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-3 flex flex-col gap-3 overflow-hidden"
        style={{ maxHeight: maxPanelHeight }}
      >
        <div
          className="flex items-center justify-between text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide cursor-grab active:cursor-grabbing rounded-lg px-1 flex-shrink-0"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onPointerDown={handleDragStart}
        >
          <span className="flex items-center gap-2">
            <i className="ti ti-adjustments-horizontal text-sm"></i>
            {activeTool.name}
          </span>
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-gray-400">
            <i className="ti ti-arrows-move text-xs"></i>
            拖拽
          </span>
        </div>

        {/* 持久化开关 - 不在选择模式下显示 */}
        {!isSelectMode && activeTool.id !== 'select' && (
          <div 
            className="flex items-center justify-between px-2 py-1.5 -mx-1 -mt-1 mb-0.5 rounded-lg bg-gray-50/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 cursor-pointer hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-colors flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePersistence();
            }}
            title={persistenceEnabled ? '点击关闭：关闭后使用默认参数，修改不保存' : '点击开启：开启后记住当前参数，下次使用'}
          >
            <div className="flex items-center gap-1.5">
              <i className={`ti ${persistenceEnabled ? 'ti-pin-filled' : 'ti-pin'} text-xs ${persistenceEnabled ? 'text-blue-500' : 'text-gray-400'}`}></i>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                {persistenceEnabled ? '已记住参数' : '已使用默认'}
              </span>
            </div>
            <button
              type="button"
              className={[
                'relative inline-flex h-4 w-7 items-center rounded-full transition-colors',
                persistenceEnabled 
                  ? 'bg-blue-500' 
                  : 'bg-gray-300 dark:bg-gray-600'
              ].join(' ')}
              role="switch"
              aria-checked={persistenceEnabled}
            >
              <span
                className={[
                  'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                  persistenceEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                ].join(' ')}
              />
            </button>
          </div>
        )}

        <div 
          className="tool-param-scroll flex flex-col gap-3 overflow-y-auto overflow-x-hidden flex-1 min-h-0 -mr-2 pr-2"
        >
          {panelControls}
          <style>{`
            .tool-param-scroll {
              scrollbar-width: thin;
              scrollbar-color: rgba(156, 163, 175, 0.4) transparent;
            }
            .tool-param-scroll::-webkit-scrollbar {
              width: 5px;
            }
            .tool-param-scroll::-webkit-scrollbar-track {
              background: transparent;
            }
            .tool-param-scroll::-webkit-scrollbar-thumb {
              background: rgba(156, 163, 175, 0.4);
              border-radius: 3px;
            }
            .tool-param-scroll::-webkit-scrollbar-thumb:hover {
              background: rgba(156, 163, 175, 0.6);
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}
