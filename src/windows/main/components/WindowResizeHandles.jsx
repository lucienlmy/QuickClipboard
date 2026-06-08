import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

const RESIZE_HANDLE_TRIGGER_SIZE = 16;
const RESIZE_HANDLE_SHOW_DELAY = 180;
const RESIZE_HANDLE_HIDE_DELAY = 160;
const RESIZE_HANDLE_COLOR = '#9ca3af';

const RESIZE_HANDLES = [
  {
    direction: 'NorthWest',
    label: '左上角',
    cursor: 'nwse-resize',
    className: 'left-0 top-0',
    path: 'M 22 2.5 H 13 A 10.5 10.5 0 0 0 2.5 13 V 22'
  },
  {
    direction: 'NorthEast',
    label: '右上角',
    cursor: 'nesw-resize',
    className: 'right-0 top-0',
    path: 'M 4 2.5 H 13 A 10.5 10.5 0 0 1 23.5 13 V 22'
  },
  {
    direction: 'SouthWest',
    label: '左下角',
    cursor: 'nesw-resize',
    className: 'bottom-0 left-0',
    path: 'M 2.5 4 V 13 A 10.5 10.5 0 0 0 13 23.5 H 22'
  },
  {
    direction: 'SouthEast',
    label: '右下角',
    cursor: 'nwse-resize',
    className: 'bottom-0 right-0',
    path: 'M 23.5 4 V 13 A 10.5 10.5 0 0 1 13 23.5 H 4'
  }
];

function WindowResizeHandles() {
  const [isVisible, setIsVisible] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);
  const showTimerRef = useRef(null);
  const hideTimerRef = useRef(null);

  const clearShowTimer = () => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const showImmediately = () => {
    clearShowTimer();
    clearHideTimer();
    setIsVisible(true);
  };

  const showWithDelay = () => {
    clearHideTimer();
    if (!isVisible && !showTimerRef.current) {
      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null;
        setIsVisible(true);
      }, RESIZE_HANDLE_SHOW_DELAY);
    }
  };

  const hideWithDelay = () => {
    clearShowTimer();
    if (isVisible && !hideTimerRef.current) {
      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null;
        setIsVisible(false);
      }, RESIZE_HANDLE_HIDE_DELAY);
    }
  };

  const stopResizing = () => {
    isResizingRef.current = false;
    setIsResizing(false);
    setIsVisible(false);
  };

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const stopResizingWhenReleased = event => {
      if (event.buttons === 0) {
        stopResizing();
      }
    };

    document.addEventListener('mouseup', stopResizing, true);
    document.addEventListener('pointerup', stopResizing, true);
    document.addEventListener('mousemove', stopResizingWhenReleased, true);
    document.addEventListener('pointermove', stopResizingWhenReleased, true);

    return () => {
      document.removeEventListener('mouseup', stopResizing, true);
      document.removeEventListener('pointerup', stopResizing, true);
      document.removeEventListener('mousemove', stopResizingWhenReleased, true);
      document.removeEventListener('pointermove', stopResizingWhenReleased, true);
    };
  }, [isResizing]);

  useEffect(() => {
    const handleMouseMove = event => {
      if (isResizingRef.current) {
        return;
      }

      const pointerX = event.clientX;
      const pointerY = event.clientY;
      const isNearReservedSpace =
        pointerX <= RESIZE_HANDLE_TRIGGER_SIZE ||
        pointerY <= RESIZE_HANDLE_TRIGGER_SIZE ||
        window.innerWidth - pointerX <= RESIZE_HANDLE_TRIGGER_SIZE ||
        window.innerHeight - pointerY <= RESIZE_HANDLE_TRIGGER_SIZE;

      if (isNearReservedSpace) {
        showWithDelay();
      } else {
        hideWithDelay();
      }
    };

    const handleMouseLeave = () => {
      if (!isResizingRef.current) {
        hideWithDelay();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.documentElement.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.documentElement.removeEventListener('mouseleave', handleMouseLeave);
      clearShowTimer();
      clearHideTimer();
    };
  }, [isVisible]);

  const handleMouseDown = (event, direction) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    isResizingRef.current = true;
    setIsResizing(true);
    showImmediately();

    getCurrentWindow().startResizeDragging(direction).catch(error => {
      console.error('启动窗口缩放失败:', error);
      isResizingRef.current = false;
      setIsResizing(false);
      setIsVisible(false);
    });
  };

  return (
    <>
      {RESIZE_HANDLES.map(handle => (
        <div
          key={handle.direction}
          data-no-drag
          aria-label={`调整窗口大小：${handle.label}`}
          className={`absolute z-50 h-[26px] w-[26px] transition-opacity duration-220 ease-out ${isVisible || isResizing ? 'pointer-events-auto' : 'pointer-events-none'} ${isVisible ? 'opacity-80' : 'opacity-0'} ${handle.className}`}
          style={{ cursor: handle.cursor }}
          onMouseDown={event => handleMouseDown(event, handle.direction)}
        >
          <svg
            aria-hidden="true"
            className="pointer-events-none h-full w-full overflow-visible"
            data-no-drag
            viewBox="0 0 26 26"
          >
            <path
              d={handle.path}
              fill="none"
              stroke="transparent"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="5"
              style={{ pointerEvents: 'none' }}
            />
            <path
              d={handle.path}
              fill="none"
              stroke={RESIZE_HANDLE_COLOR}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="4"
              style={{
                filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25))',
                pointerEvents: 'none'
              }}
            />
          </svg>
        </div>
      ))}
    </>
  );
}

export default WindowResizeHandles;
