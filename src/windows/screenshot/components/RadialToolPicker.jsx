import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSnapshot } from 'valtio';
import { mouseStore } from '../store/mouseStore';
import { 
  RADIAL_PICKER_ITEM_SIZE,
  RADIAL_PICKER_ITEM_GAP,
  RADIAL_PICKER_RING_GAP,
  RADIAL_PICKER_INNER_RADIUS,
  RADIAL_PICKER_MAX_PER_RING,
  RADIAL_PICKER_HIT_RADIUS,
  RADIAL_PICKER_TRIGGER_KEY,
  RADIAL_PICKER_ANIM_DURATION,
  RADIAL_PICKER_ANIM_DELAY_IN,
  RADIAL_PICKER_ANIM_DELAY_OUT,
  RADIAL_PICKER_ANIM_EXIT_WAIT,
} from '../constants/radialPicker';
import { ALL_TOOLS } from '../constants/tools';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';

// 圆盘工具选择器
export default function RadialToolPicker({
  activeToolId,            
  onToolSelect,            
  actions,                 
  disabledActions,         
  disabled = false,       
  longScreenshotMode = false,
}) {
  const { position: mousePos } = useSnapshot(mouseStore);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [centerPos, setCenterPos] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  const toolPositions = useMemo(() => {
    if (!ALL_TOOLS.length) return [];
    
    const result = [];
    let remaining = [...ALL_TOOLS];
    let ringIndex = 0;
    let globalIndex = 0;
    
    while (remaining.length > 0) {
      const radius = RADIAL_PICKER_INNER_RADIUS + ringIndex * (RADIAL_PICKER_ITEM_SIZE + RADIAL_PICKER_RING_GAP);
      
      const circumference = 2 * Math.PI * radius;
      const itemSpace = RADIAL_PICKER_ITEM_SIZE + RADIAL_PICKER_ITEM_GAP;
      const maxInRing = Math.min(
        Math.floor(circumference / itemSpace),
        RADIAL_PICKER_MAX_PER_RING,
        remaining.length
      );
      
      const ringTools = remaining.splice(0, maxInRing);
      const angleStep = (2 * Math.PI) / ringTools.length;
      const startAngle = -Math.PI / 2;
      
      ringTools.forEach((tool, i) => {
        const angle = startAngle + i * angleStep;
        result.push({
          ...tool,
          index: globalIndex++,
          ring: ringIndex,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          disabled: tool.isAction ? disabledActions?.[tool.actionKey] : false,
          onClick: tool.isAction ? actions?.[tool.actionKey] : undefined,
        });
      });
      
      ringIndex++;
    }
    
    return result;
  }, [actions, disabledActions]);

  const maxRadius = useMemo(() => {
    if (!toolPositions.length) return RADIAL_PICKER_INNER_RADIUS;
    const maxRing = Math.max(...toolPositions.map(t => t.ring));
    return RADIAL_PICKER_INNER_RADIUS + maxRing * (RADIAL_PICKER_ITEM_SIZE + RADIAL_PICKER_RING_GAP);
  }, [toolPositions]);

  const calculateHoveredIndex = useCallback((mouseX, mouseY) => {
    if (!centerPos) return -1;
    
    let closestIndex = -1;
    let minDist = RADIAL_PICKER_HIT_RADIUS;
    
    toolPositions.forEach((tool, index) => {
      const toolX = centerPos.x + tool.x;
      const toolY = centerPos.y + tool.y;
      const dist = Math.sqrt((mouseX - toolX) ** 2 + (mouseY - toolY) ** 2);
      
      if (dist < minDist) {
        minDist = dist;
        closestIndex = index;
      }
    });
    
    return closestIndex;
  }, [centerPos, toolPositions]);

  useEffect(() => {
    if (disabled || longScreenshotMode) return;

    const handleKeyDown = (e) => {
      if (e.key === RADIAL_PICKER_TRIGGER_KEY) {
        e.preventDefault();
        if (!e.repeat && !visible && mousePos) {
          setCenterPos({ x: mousePos.x, y: mousePos.y });
          setVisible(true);
          setHoveredIndex(-1);
          requestAnimationFrame(() => setAnimating(true));
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === RADIAL_PICKER_TRIGGER_KEY) {
        e.preventDefault();
        if (!visible) return;
        
        if (hoveredIndex >= 0 && hoveredIndex < toolPositions.length) {
          const tool = toolPositions[hoveredIndex];
          if (!tool.disabled) {
            if (tool.isAction) {
              tool.onClick?.();
            } else {
              onToolSelect?.(tool.id);
            }
          }
        }
        
        setAnimating(false);
        setTimeout(() => {
          setVisible(false);
          setCenterPos(null);
          setHoveredIndex(-1);
        }, RADIAL_PICKER_ANIM_EXIT_WAIT);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [disabled, longScreenshotMode, visible, mousePos, hoveredIndex, toolPositions, onToolSelect]);

  useEffect(() => {
    if (!visible || !mousePos || !centerPos) return;
    
    const newIndex = calculateHoveredIndex(mousePos.x, mousePos.y);
    if (newIndex !== hoveredIndex) {
      setHoveredIndex(newIndex);
    }
  }, [visible, mousePos, centerPos, calculateHoveredIndex, hoveredIndex]);

  if (!visible || !centerPos) return null;

  const totalTools = toolPositions.length;
  const outerRadius = maxRadius + RADIAL_PICKER_ITEM_SIZE / 2 + 16;

  return (
    <div
      className="fixed inset-0 z-[9999]"
      style={{ pointerEvents: 'none' }}
    >
      {/* 圆盘容器 */}
      <div
        className="absolute"
        style={{
          left: centerPos.x,
          top: centerPos.y,
          transform: 'translate(-50%, -50%)',
        }}
      >
        {/* 工具项 */}
        {toolPositions.map((tool, index) => {
          const isHovered = hoveredIndex === index;
          const isActive = tool.id === activeToolId;
          const isDisabled = tool.disabled;
          
          const delay = animating 
            ? index * RADIAL_PICKER_ANIM_DELAY_IN 
            : (totalTools - index - 1) * RADIAL_PICKER_ANIM_DELAY_OUT;

          return (
            <div
              key={tool.id}
              className="absolute transition-all ease-out"
              style={{
                left: '50%',
                top: '50%',
                transform: animating 
                  ? `translate(-50%, -50%) translate(${tool.x}px, ${tool.y}px)`
                  : 'translate(-50%, -50%)',
                opacity: animating ? 1 : 0,
                transitionDuration: `${RADIAL_PICKER_ANIM_DURATION}ms`,
                transitionDelay: `${delay}ms`,
                zIndex: isHovered ? 10 : 1,
              }}
            >
              {/* 工具图标 */}
              <div
                className={`flex items-center justify-center rounded-xl backdrop-blur-md border transition-all duration-150 ${
                  isHovered
                    ? 'bg-blue-500 border-blue-400 scale-125 shadow-lg shadow-blue-500/30'
                    : isActive
                      ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-300 dark:border-blue-700'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 shadow-md'
                } ${isDisabled ? 'opacity-40' : ''}`}
                style={{
                  width: RADIAL_PICKER_ITEM_SIZE,
                  height: RADIAL_PICKER_ITEM_SIZE,
                }}
              >
                <i className={`${tool.icon} text-base transition-colors ${
                  isHovered
                    ? 'text-white'
                    : isActive
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-300'
                }`} />
              </div>

              {/* 工具名称提示 */}
              {isHovered && !isDisabled && (
                <div 
                  className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap mt-2 px-2 py-1 rounded-md bg-gray-900 dark:bg-gray-700 text-white text-[11px] font-medium shadow-lg"
                  style={{ top: '100%', zIndex: 100 }}
                >
                  {tool.title}
                </div>
              )}
            </div>
          );
        })}

        {/* 底部提示 */}
        <div 
          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-[11px] font-medium shadow-lg transition-opacity duration-150"
          style={{
            top: `calc(50% + ${outerRadius}px)`,
            opacity: animating ? 1 : 0,
            transitionDelay: animating ? '100ms' : '0ms',
          }}
        >
          {hoveredIndex === -1 ? '松开取消' : toolPositions[hoveredIndex]?.title}
        </div>
      </div>
    </div>
  );
}
