import { useState, useEffect, useMemo, useRef } from 'react';
import { useSnapshot } from 'valtio';
import { KEYBOARD_SHORTCUTS, getToolShortcuts } from '../constants/keyboardShortcuts';
import { DRAWING_TOOLS } from '../constants/tools';
import { mouseStore } from '../store/mouseStore';

export default function KeyboardShortcutsHelp({ stageRegionManager, longScreenshotMode, isDrawingShape }) {
  const { position: mousePos } = useSnapshot(mouseStore);
  const [visible, setVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isHintHovered, setIsHintHovered] = useState(false);
  const hintRef = useRef(null);

  const disablePointerEvents = isDrawingShape;

  useEffect(() => {
    const handleKeyDown = (e) => {
      // ? 键显示/隐藏快捷键帮助
      if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        if (!visible) {
          setVisible(true);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setIsAnimating(true);
            });
          });
        } else {
          setIsAnimating(false);
          setTimeout(() => setVisible(false), 300);
        }
      }
      // Esc 键隐藏
      if (e.key === 'Escape' && visible) {
        setIsAnimating(false);
        setTimeout(() => setVisible(false), 300);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible]);

  useEffect(() => {
    if (visible || !hintRef.current) return;

    const handleMouseMove = (e) => {
      const rect = hintRef.current?.getBoundingClientRect();
      if (!rect) return;

      const isInside = 
        e.clientX >= rect.left && 
        e.clientX <= rect.right && 
        e.clientY >= rect.top && 
        e.clientY <= rect.bottom;

      setIsHintHovered(isInside);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [visible]);

  // 计算帮助面板应该显示在哪个屏幕的中心
  const panelPosition = useMemo(() => {
    if (!mousePos || !stageRegionManager) {
      return { left: '50%', top: '50%' };
    }

    // 获取鼠标所在屏幕
    const targetScreen = stageRegionManager.getNearestScreen(mousePos.x, mousePos.y);
    
    if (!targetScreen) {
      return { left: '50%', top: '50%' };
    }

    const centerX = targetScreen.x + targetScreen.width / 2;
    const centerY = targetScreen.y + targetScreen.height / 2;
    
    const hintLeft = targetScreen.x + 16;
    const hintBottom = targetScreen.y + targetScreen.height - 16;

    return {
      centerX,
      centerY,
      hintLeft,
      hintBottom,
    };
  }, [mousePos, stageRegionManager]);

  const hintPosition = useMemo(() => {
    if (!mousePos || !stageRegionManager) {
      return { bottom: '16px', left: '16px' };
    }

    const targetScreen = stageRegionManager.getNearestScreen(mousePos.x, mousePos.y);
    
    if (!targetScreen) {
      return { bottom: '16px', left: '16px' };
    }

    const bottom = targetScreen.y + targetScreen.height - 16;
    const left = targetScreen.x + 16;

    return {
      bottom: `calc(100% - ${bottom}px)`,
      left: `${left}px`,
    };
  }, [mousePos, stageRegionManager]);

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(() => setVisible(false), 300);
  };

  if (!visible) {
    if (longScreenshotMode) {
      return null;
    }
    
    const hintBaseOpacity = isHintHovered ? 0 : 1;
    const hintFinalOpacity = disablePointerEvents ? hintBaseOpacity * 0.5 : hintBaseOpacity;

    return (
      <div 
        ref={hintRef}
        className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 px-3 py-2 pointer-events-none select-none"
        style={{
          ...hintPosition,
          opacity: hintFinalOpacity,
          transition: disablePointerEvents 
            ? 'opacity 1500ms ease-out' 
            : 'opacity 200ms ease-out',
        }}
      >
        <div className="text-xs text-gray-700 dark:text-gray-300 space-y-1">
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded font-mono text-[10px]">↑↓←→</kbd>
            <span>方向键移动光标</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded font-mono text-[10px]">Shift</kbd>
            <span>切换颜色格式</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded font-mono text-[10px]">C</kbd>
            <span>复制颜色</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded font-mono text-[10px]">1~9</kbd>
            <span>数字1~9切换工具</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded font-mono text-[10px]">Shift+?</kbd>
            <span>显示快捷键帮助</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`fixed inset-0 bg-black/50 z-[10000] transition-opacity duration-300 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
      onClick={handleClose}
    >
      <div 
        className="absolute bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 max-w-2xl w-full max-h-[80vh] overflow-auto transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          left: isAnimating ? `${panelPosition.centerX || '50%'}px` : `${panelPosition.hintLeft || 16}px`,
          top: isAnimating ? `${panelPosition.centerY || '50%'}px` : `${panelPosition.hintBottom || 16}px`,
          transform: `translate(-50%, -50%) scale(${isAnimating ? 1 : 0.1})`,
          opacity: isAnimating ? 1 : 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">快捷键列表</h2>
          <button
            onClick={handleClose}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <i className="ti ti-x text-xl" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-6">
          {/* 工具切换 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">工具切换</h3>
            <div className="grid grid-cols-2 gap-2">
              {DRAWING_TOOLS.map((tool) => (
                <ShortcutItem
                  key={tool.id}
                  description={tool.title}
                  keys={getToolShortcuts(tool.id)}
                />
              ))}
            </div>
          </section>

          {/* 编辑操作 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">编辑操作</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(KEYBOARD_SHORTCUTS.actions).map(([actionId, config]) => (
                <ShortcutItem
                  key={actionId}
                  description={config.description}
                  keys={config.keys}
                />
              ))}
            </div>
          </section>

          {/* 完成操作 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">完成操作</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(KEYBOARD_SHORTCUTS.confirm).map(([actionId, config]) => (
                <ShortcutItem
                  key={actionId}
                  description={config.description}
                  keys={config.keys}
                />
              ))}
            </div>
          </section>

          {/* 选区操作 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">选区操作</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(KEYBOARD_SHORTCUTS.selection).map(([actionId, config]) => (
                <ShortcutItem
                  key={actionId}
                  description={config.description}
                  keys={config.keys}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// 单个快捷键项组件
function ShortcutItem({ description, keys }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
      <span className="text-sm text-gray-700 dark:text-gray-300">{description}</span>
      <div className="flex items-center gap-1">
        {keys.slice(0, 2).map((key, index) => (
          <kbd
            key={index}
            className="px-2 py-1 bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs text-gray-700 dark:text-gray-300 font-mono shadow-sm"
          >
            {key}
          </kbd>
        ))}
        {keys.length > 2 && (
          <span className="text-gray-400 dark:text-gray-500 text-xs">+{keys.length - 2}</span>
        )}
      </div>
    </div>
  );
}
