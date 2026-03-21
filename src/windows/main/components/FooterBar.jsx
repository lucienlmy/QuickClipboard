import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import { useSnapshot } from 'valtio';
import { useRef, useState, useEffect } from 'react';
import { useWindowDrag } from '@shared/hooks/useWindowDrag';
import Tooltip from '@shared/components/common/Tooltip.jsx';
import { settingsStore } from '@shared/store/settingsStore';

const FOOTER_MIN_HEIGHT = 20;
const FOOTER_MAX_HEIGHT = 36;
const RESIZE_HANDLE_HEIGHT = 6;
const FOOTER_HEIGHT_STORAGE_KEY = 'footerHeight';

function clampFooterHeight(height) {
  return Math.max(FOOTER_MIN_HEIGHT, Math.min(FOOTER_MAX_HEIGHT, Math.round(height)));
}

function FooterBar({
  leftContent,
  children
}) {
  const { t } = useTranslation();
  const settings = useSnapshot(settingsStore);
  const containerRef = useRef(null);
  const resizeStateRef = useRef({
    startY: 0,
    startHeight: FOOTER_MIN_HEIGHT
  });
  const [leftRatio, setLeftRatio] = useState(() => {
    return settings.footerLeftRatio ?? 0.5;
  });
  const leftRatioRef = useRef(leftRatio);
  const [footerHeight, setFooterHeight] = useState(() => {
    const savedHeight = Number.parseFloat(localStorage.getItem(FOOTER_HEIGHT_STORAGE_KEY) || '');
    return Number.isFinite(savedHeight) ? clampFooterHeight(savedHeight) : FOOTER_MIN_HEIGHT;
  });
  const footerHeightRef = useRef(footerHeight);
  const [isDividerDragging, setIsDividerDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const dragRef = useWindowDrag({
    excludeSelectors: ['[data-no-drag]', 'button', '[role="button"]'],
    allowChildren: true
  });

  // 吸附点位
  const snapPoints = [0.3, 0.5, 0.7];
  const snapThreshold = 0.03;

  const handleDividerMouseDown = (e) => {
    e.preventDefault();
    setIsDividerDragging(true);
  };

  useEffect(() => {
    leftRatioRef.current = leftRatio;
  }, [leftRatio]);

  useEffect(() => {
    footerHeightRef.current = footerHeight;
  }, [footerHeight]);

  useEffect(() => {
    if (!isDividerDragging) return;

    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let ratio = Math.max(0.2, Math.min(0.8, x / rect.width));

      for (const snap of snapPoints) {
        if (Math.abs(ratio - snap) < snapThreshold) {
          ratio = snap;
          break;
        }
      }
      
      setLeftRatio(ratio);
      leftRatioRef.current = ratio;
    };

    const handleMouseUp = () => {
      setIsDividerDragging(false);
      settingsStore.setFooterLeftRatio(leftRatioRef.current);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDividerDragging]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      const deltaY = resizeStateRef.current.startY - e.clientY;
      const nextHeight = clampFooterHeight(resizeStateRef.current.startHeight + deltaY);
      setFooterHeight(nextHeight);
      footerHeightRef.current = nextHeight;
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem(FOOTER_HEIGHT_STORAGE_KEY, String(footerHeightRef.current));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleResizeMouseDown = (e) => {
    e.preventDefault();
    resizeStateRef.current = {
      startY: e.clientY,
      startHeight: footerHeightRef.current
    };
    setIsResizing(true);
  };

  const handleAreaClasses = (isActive, direction) => `
    flex items-center justify-center
    transition-colors
    ${direction === 'vertical'
      ? 'absolute top-0 left-0 right-0 cursor-row-resize'
      : 'h-full w-1 cursor-col-resize shrink-0'}
    ${isActive ? 'bg-qc-active/70' : 'hover:bg-qc-hover/60'}
  `.trim().replace(/\s+/g, ' ');

  const handleGripClasses = (direction) => `
    rounded-full bg-qc-border-strong
    ${direction === 'vertical' ? 'w-8 h-0.5' : 'w-0.5 h-8'}
  `.trim().replace(/\s+/g, ' ');

  return <div
    ref={(el) => {
      dragRef.current = el;
      containerRef.current = el;
    }}
    className="flex-shrink-0 flex bg-qc-panel border-t border-qc-border relative footer-bar"
    style={{ height: `${footerHeight}px` }}
  >
    <Tooltip content={t('footer.resizeHeight')} placement="top" asChild>
      <div
        className={handleAreaClasses(isResizing, 'vertical')}
        style={{ height: `${RESIZE_HANDLE_HEIGHT}px`, zIndex: 10 }}
        onMouseDown={handleResizeMouseDown}
        data-no-drag
      >
        <div className={handleGripClasses('vertical')}></div>
      </div>
    </Tooltip>

    {/* 左侧：空白 */}
    <div className="h-full flex items-center justify-center text-[10px] font-medium text-qc-fg-muted select-none" style={{ width: `${leftRatio * 100}%` }} data-no-drag>
      {leftContent}
    </div>

    {/* 分隔条 */}
    <Tooltip content={t('footer.adjustLayout')} placement="top" asChild>
      <div
        className={handleAreaClasses(isDividerDragging, 'horizontal')}
        onMouseDown={handleDividerMouseDown}
        data-no-drag
      >
        <div className={handleGripClasses('horizontal')}></div>
      </div>
    </Tooltip>

    {/* 右侧：分组等 */}
    <div className="h-full" style={{ width: `${(1 - leftRatio) * 100}%` }} data-no-drag>
      {children}
    </div>
  </div>;
}
export default FooterBar;
