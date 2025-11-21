import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import SliderControl from './controls/SliderControl';
import ColorControl from './controls/ColorControl';
import SegmentedControl from './controls/SegmentedControl';

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

function renderControl(param, value, onChange) {
  switch (param.type) {
    case 'slider':
      return <SliderControl param={param} value={value} onChange={onChange} />;
    case 'segmented':
      return <SegmentedControl param={param} value={value} onChange={onChange} />;
    case 'color':
    default:
      return <ColorControl param={param} value={value} onChange={onChange} />;
  }
}

export default function ToolParameterPanel({
  selection,
  activeTool,
  parameters,
  values,
  stageRegionManager,
  onParameterChange,
}) {
  const panelRef = useRef(null);
  const [panelSize, setPanelSize] = useState(DEFAULT_PANEL_SIZE);
  const [position, setPosition] = useState({ x: -9999, y: -9999 });
  const [lockedPosition, setLockedPosition] = useState(null);
  const dragStateRef = useRef({ isDragging: false, offset: { x: 0, y: 0 } });
  const [isDragging, setIsDragging] = useState(false);

  const effectiveParameters = useMemo(() => parameters?.filter(Boolean) || [], [parameters]);
  const defaultStyle = useMemo(() => {
    if (!activeTool?.getDefaultStyle) return {};
    return activeTool.getDefaultStyle();
  }, [activeTool]);

  useLayoutEffect(() => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (Math.abs(width - panelSize.width) > 2 || Math.abs(height - panelSize.height) > 2) {
      setPanelSize({ width, height });
    }
  }, [effectiveParameters, values, activeTool?.id, panelSize.width, panelSize.height]);

  useEffect(() => {
    if (!selection || !activeTool || !panelSize) return;
    if (lockedPosition) return;

    const padding = 12;
    const centerX = selection.x + selection.width / 2;
    const centerY = selection.y + selection.height / 2;
    const screen = stageRegionManager?.getNearestScreen(centerX, centerY);
    const screenBounds = screen || {
      x: 0,
      y: 0,
      width: window.innerWidth || 1920,
      height: window.innerHeight || 1080,
    };

    const within = {
      left: screenBounds.x,
      right: screenBounds.x + screenBounds.width,
      top: screenBounds.y,
      bottom: screenBounds.y + screenBounds.height,
    };

    const attemptPositions = [
      {
        key: 'right',
        x: selection.x + selection.width + padding,
        y: centerY - panelSize.height / 2,
        fits: (selection.x + selection.width + padding + panelSize.width) <= within.right,
      },
      {
        key: 'left',
        x: selection.x - panelSize.width - padding,
        y: centerY - panelSize.height / 2,
        fits: (selection.x - padding - panelSize.width) >= within.left,
      },
      {
        key: 'bottom',
        x: centerX - panelSize.width / 2,
        y: selection.y + selection.height + padding,
        fits: (selection.y + selection.height + padding + panelSize.height) <= within.bottom,
      },
      {
        key: 'top',
        x: centerX - panelSize.width / 2,
        y: selection.y - panelSize.height - padding,
        fits: (selection.y - padding - panelSize.height) >= within.top,
      },
    ];

    let chosen = attemptPositions.find(pos => pos.fits) || attemptPositions[0];
    let { x, y } = chosen;

    if (!stageRegionManager) {
      x = clamp(x, within.left + 4, within.right - panelSize.width - 4);
      y = clamp(y, within.top + 4, within.bottom - panelSize.height - 4);
    } else {
      const constrained = stageRegionManager.constrainRect({
        x,
        y,
        width: panelSize.width,
        height: panelSize.height,
      });
      x = constrained.x;
      y = constrained.y;
    }

    setPosition({ x, y });
  }, [selection, activeTool, panelSize, stageRegionManager, lockedPosition]);

  const handleDragMove = useCallback((event) => {
    if (!dragStateRef.current.isDragging) return;

    event.preventDefault();
    event.stopPropagation();

    const offset = dragStateRef.current.offset;
    let nextX = event.clientX - offset.x;
    let nextY = event.clientY - offset.y;

    if (stageRegionManager) {
      const constrained = stageRegionManager.constrainRect({
        x: nextX,
        y: nextY,
        width: panelSize.width,
        height: panelSize.height,
      });
      nextX = constrained.x;
      nextY = constrained.y;
    } else {
      const bounds = getFallbackBounds();
      nextX = clamp(nextX, bounds.left, bounds.right - panelSize.width);
      nextY = clamp(nextY, bounds.top, bounds.bottom - panelSize.height);
    }

    const nextPosition = { x: nextX, y: nextY };
    setPosition(nextPosition);
    setLockedPosition(nextPosition);
  }, [panelSize, stageRegionManager]);

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

  if (!selection || !activeTool || effectiveParameters.length === 0) {
    return null;
  }

  const panelControls = effectiveParameters.map((param) => {
    const value = values?.[param.id];
    const fallback = param.type === 'slider'
      ? param.min ?? 0
      : param.type === 'segmented'
        ? param.options?.[0]?.value
        : '#ffffff';
    const controlValue = value ?? fallback;

    return (
      <div key={param.id} className="flex flex-col gap-1">
        {renderControl(param, controlValue, (val) => onParameterChange?.(param.id, val))}
      </div>
    );
  });

  return (
    <div
      ref={panelRef}
      className="absolute z-20 select-none"
      style={{ left: position.x, top: position.y }}
    >
      <div className="min-w-[220px] max-w-[320px] bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-3 flex flex-col gap-3">
        <div
          className="flex items-center justify-between text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide cursor-grab active:cursor-grabbing rounded-lg px-1"
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
        <div className="flex flex-col gap-3">
          {panelControls}
        </div>
      </div>
    </div>
  );
}
