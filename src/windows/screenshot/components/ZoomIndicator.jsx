import { useEffect, useState, useRef } from 'react';
import { useSnapshot } from 'valtio';
import { mouseStore } from '../store/mouseStore';

export default function ZoomIndicator({ scale, onReset, isLocked, onToggleLock, stageRegionManager }) {
  const [visible, setVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef(null);
  const prevScaleRef = useRef(scale);
  const [displayPosition, setDisplayPosition] = useState({ left: 16, top: 16 });

  const { position: mousePos } = useSnapshot(mouseStore);

  useEffect(() => {
    if (scale === prevScaleRef.current) return;
    
    prevScaleRef.current = scale;

    let targetScreen = null;
    if (mousePos && stageRegionManager) {
      targetScreen = stageRegionManager.getNearestScreen(mousePos.x, mousePos.y);
    }
    if (!targetScreen && stageRegionManager) {
      const bounds = stageRegionManager.getTotalBounds();
      if (bounds) {
        targetScreen = { x: bounds.x, y: bounds.y };
      }
    }
    setDisplayPosition({
      left: (targetScreen?.x ?? 0) + 16,
      top: (targetScreen?.y ?? 0) + 16,
    });
    
    setVisible(true);
    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    if (!isHovered) {
      timerRef.current = setTimeout(() => {
        setVisible(false);
      }, 1500);
    }
  }, [scale]); 

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    if (!isHovered && visible) {
      timerRef.current = setTimeout(() => {
        setVisible(false);
      }, 1500);
    }
    
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isHovered, visible]);

  if (!visible) return null;

  const percentage = Math.round(scale * 100);

  return (
    <div
      className="fixed z-50 flex items-center gap-2 px-3 py-2 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 select-none animate-in fade-in duration-150"
      style={{ left: displayPosition.left, top: displayPosition.top }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 tabular-nums">
        {percentage}%
      </span>
      {scale !== 1 && (
        <button
          onClick={onReset}
          className="flex items-center justify-center w-6 h-6 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="重置缩放 (100%)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      )}
      <button
        onClick={onToggleLock}
        className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
          isLocked 
            ? 'text-blue-500 hover:text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400' 
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
        title={isLocked ? '解锁缩放（自动适应屏幕）' : '锁定缩放'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {isLocked ? (
            <>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </>
          ) : (
            <>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
