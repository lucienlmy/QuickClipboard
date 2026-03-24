import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { useWindowDrag } from '@shared/hooks/useWindowDrag';
import { toggleWindowPin, getWindowPinState, openAppSettings } from '@shared/services/titleBarActions';
import logoIcon from '@/assets/icon1024.png';
import TitleBarSearch from './TitleBarSearch';
import Tooltip from '@shared/components/common/Tooltip.jsx';

const TitleBar = forwardRef(({
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  onNavigate,
  position = 'top'
}, ref) => {
  const { t } = useTranslation();
  const searchRef = useRef(null);
  const [isPinned, setIsPinned] = useState(() => Boolean(getWindowPinState()));
  const isVertical = position === 'left' || position === 'right';
  const tooltipPlacement = isVertical ? (position === 'left' ? 'right' : 'left') : 'bottom';

  const dragRef = useWindowDrag({
    excludeSelectors: ['[data-no-drag]', 'button', '[role="button"]', 'input', 'textarea'],
    allowChildren: true
  });

  useEffect(() => {
    const handlePinStateChanged = (event) => {
      const pinned = Boolean(event?.detail?.pinned);
      setIsPinned(pinned);
    };

    window.addEventListener('window-pin-state-changed', handlePinStateChanged);
    return () => {
      window.removeEventListener('window-pin-state-changed', handlePinStateChanged);
    };
  }, []);

  const handleTogglePin = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const result = await toggleWindowPin();
      setIsPinned(Boolean(result));
    } catch (error) {
      console.error('标题栏固定窗口失败:', error);
    }
  };

  const handleOpenSettings = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await openAppSettings();
    } catch (error) {
      console.error('标题栏打开设置失败:', error);
    }
  };

  // 暴露搜索框 focus 方法
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (searchRef.current?.focus) {
        searchRef.current.focus();
      }
    }
  }));

  return (
    <div
      ref={dragRef}
      className={`title-bar flex-shrink-0 flex ${isVertical
        ? `w-10 h-full flex-col items-center justify-between py-2 bg-qc-panel ${position === 'left' ? 'border-r border-qc-border' : 'border-l border-qc-border'
        }`
        : `h-9 flex-row items-center justify-between px-2 bg-qc-panel ${position === 'top' ? 'border-b border-qc-border' : 'border-t border-qc-border'
        }`
        } shadow-sm transition-colors duration-500`}
    >
      <div className="flex items-center gap-1.5 flex-shrink-0 pointer-events-none">
        <div className="w-6 h-6 flex items-center justify-center">
          <img src={logoIcon} alt="QuickClipboard" className="w-5 h-5" />
        </div>
      </div>

      <div className={`flex ${isVertical ? 'flex-col items-center gap-2' : 'flex-row items-center gap-1'} ${isVertical ? '' : 'flex-shrink-0'}`}>
        <TitleBarSearch
          ref={searchRef}
          value={searchQuery}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          onNavigate={onNavigate}
          isVertical={isVertical}
          position={position}
        />

        <div className={`flex ${isVertical ? 'flex-col items-center' : 'items-center'} gap-1`}>
          <Tooltip content="多选" placement={tooltipPlacement} asChild>
            <button
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 hover:bg-qc-hover text-qc-fg-muted"
              aria-label="多选"
              type="button"
            >
              <i className="ti ti-list-check" style={{ fontSize: 16 }} data-stroke="1.5"></i>
            </button>
          </Tooltip>

          <Tooltip content={t('tools.pin')} placement={tooltipPlacement} asChild>
            <button
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 ${isPinned ? 'bg-blue-500 text-white hover:bg-blue-600' : 'hover:bg-qc-hover text-qc-fg-muted'
                }`}
              onClick={handleTogglePin}
              aria-label={t('tools.pin')}
            >
              <i className="ti ti-pin" style={{ fontSize: 16 }} data-stroke="1.5"></i>
            </button>
          </Tooltip>

          <Tooltip content={t('tools.settings')} placement={tooltipPlacement} asChild>
            <button
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 hover:bg-qc-hover text-qc-fg-muted"
              onClick={handleOpenSettings}
              aria-label={t('tools.settings')}
            >
              <i className="ti ti-settings" style={{ fontSize: 16 }} data-stroke="1.5"></i>
            </button>
          </Tooltip>

          <Tooltip content="更多" placement={tooltipPlacement} asChild>
            <button
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 hover:bg-qc-hover text-qc-fg-muted"
              aria-label="更多"
              type="button"
            >
              <i className="ti ti-dots" style={{ fontSize: 16 }} data-stroke="1.5"></i>
            </button>
          </Tooltip>

        </div>
      </div>
    </div>
  );
});

TitleBar.displayName = 'TitleBar';

export default TitleBar;
