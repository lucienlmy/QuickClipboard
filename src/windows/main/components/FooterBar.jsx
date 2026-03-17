import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import { useSnapshot } from 'valtio';
import { useRef, useState, useEffect } from 'react';
import { useWindowDrag } from '@shared/hooks/useWindowDrag';
import { settingsStore } from '@shared/store/settingsStore';

function FooterBar({
  children
}) {
  const {
    t
  } = useTranslation();
  const settings = useSnapshot(settingsStore);
  const containerRef = useRef(null);
  const [leftRatio, setLeftRatio] = useState(() => {
    return settings.footerLeftRatio ?? 0.5;
  });
  const [isDragging, setIsDragging] = useState(false);

  const dragRef = useWindowDrag({
    excludeSelectors: ['[data-no-drag]', 'button', '[role="button"]'],
    allowChildren: true
  });

  // 吸附点位
  const snapPoints = [0.3, 0.5, 0.7];
  const snapThreshold = 0.03;

  const handleDividerMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

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
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      settingsStore.setFooterLeftRatio(leftRatio);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, leftRatio]);

  return <div ref={(el) => { dragRef.current = el; containerRef.current = el; }} className="flex-shrink-0 h-5 flex bg-qc-panel border-t border-qc-border relative footer-bar">
    {/* 左侧：文件传输 */}
    <div className="h-full flex items-center justify-center text-[10px] font-medium text-qc-fg-muted select-none" style={{ width: `${leftRatio * 100}%` }} data-no-drag>
      文件传输
    </div>

    {/* 分隔条 */}
    <div
      className={`h-full w-1 cursor-col-resize flex items-center justify-center hover:bg-qc-hover transition-colors ${isDragging ? 'bg-qc-active' : ''}`}
      onMouseDown={handleDividerMouseDown}
      data-no-drag
    >
      <div className="w-0.5 h-2 bg-qc-border-strong rounded-full"></div>
    </div>

    {/* 右侧：分组等 */}
    <div className="h-full" style={{ width: `${(1 - leftRatio) * 100}%` }} data-no-drag>
      {children}
    </div>
  </div>;
}
export default FooterBar;