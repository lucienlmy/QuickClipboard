import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import { useSnapshot } from 'valtio';
import { useRef, useState, useEffect } from 'react';
import { useWindowDrag } from '@shared/hooks/useWindowDrag';
import { settingsStore } from '@shared/store/settingsStore';
import BottomMenuPopup from './BottomMenuPopup';

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

  const menuItems = [{
    id: 'listStyle',
    label: t('listSettings.listStyle.label'),
    icon: "ti ti-layout-list",
    currentValue: settings.listStyle,
    options: [{
      value: 'compact',
      label: t('listSettings.listStyle.compact')
    }, {
      value: 'card',
      label: t('listSettings.listStyle.card')
    }],
    onSelect: value => settingsStore.setListStyle(value)
  }, {
    id: 'rowHeight',
    label: t('listSettings.rowHeight.label'),
    icon: "ti ti-row-insert-bottom",
    currentValue: settings.rowHeight,
    options: [{
      value: 'auto',
      label: t('listSettings.rowHeight.auto')
    }, {
      value: 'large',
      label: t('listSettings.rowHeight.large')
    }, {
      value: 'medium',
      label: t('listSettings.rowHeight.medium')
    }, {
      value: 'small',
      label: t('listSettings.rowHeight.small')
    }],
    onSelect: value => settingsStore.setRowHeight(value)
  }, {
    id: 'fileDisplayMode',
    label: t('listSettings.fileDisplayMode.label'),
    icon: "ti ti-layout-grid",
    currentValue: settings.fileDisplayMode,
    options: [{
      value: 'detailed',
      label: t('listSettings.fileDisplayMode.detailed')
    }, {
      value: 'iconOnly',
      label: t('listSettings.fileDisplayMode.iconOnly')
    }],
    onSelect: value => settingsStore.setFileDisplayMode(value)
  }];

  return <div ref={(el) => { dragRef.current = el; containerRef.current = el; }} className="flex-shrink-0 h-5 flex bg-gray-200 dark:bg-gray-900 border-t border-gray-300 dark:border-gray-700 relative footer-bar">
    {/* 左侧：列表设置 */}
    <div className="h-full" style={{ width: `${leftRatio * 100}%` }} data-no-drag>
      <BottomMenuPopup
        icon="ti ti-list"
        label={t('listSettings.title')}
        title={t('listSettings.title')}
        menuItems={menuItems}
      />
    </div>

    {/* 分隔条 */}
    <div
      className={`h-full w-1 cursor-col-resize flex items-center justify-center hover:bg-gray-400/50 dark:hover:bg-gray-600/50 transition-colors ${isDragging ? 'bg-blue-500/50' : ''}`}
      onMouseDown={handleDividerMouseDown}
      data-no-drag
    >
      <div className="w-0.5 h-2 bg-gray-400 dark:bg-gray-600 rounded-full"></div>
    </div>

    {/* 右侧：分组等 */}
    <div className="h-full" style={{ width: `${(1 - leftRatio) * 100}%` }} data-no-drag>
      {children}
    </div>
  </div>;
}
export default FooterBar;