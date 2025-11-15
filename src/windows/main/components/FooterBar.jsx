import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import { useSnapshot } from 'valtio';
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

  const dragRef = useWindowDrag({
    excludeSelectors: ['[data-no-drag]', 'button', '[role="button"]'],
    allowChildren: true
  });

  const menuItems = [{
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
  const toggleShortcutHint = settings.toggleShortcut || 'Alt+V';
  let numberShortcutHint = null;
  if (settings.numberShortcuts) {
    const modifier = settings.numberShortcutsModifier || 'Ctrl';
    if (modifier === 'None') {
      numberShortcutHint = '1~9';
    } else {
      numberShortcutHint = `${modifier}+1~9`;
    }
  }
  return <div ref={dragRef} className="flex-shrink-0 h-5 flex items-center px-3 bg-gray-200 dark:bg-gray-900 border-t border-gray-300 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 relative footer-bar">
    <div className="flex items-center gap-2 text-[10px]">
      <span>{toggleShortcutHint} {t('footer.openClipboard')}</span>
      {/* {numberShortcutHint && <span>{numberShortcutHint} {t('footer.pasteShortcut')}</span>} */}
    </div>

    <div className="absolute right-3 top-0 h-full flex items-center gap-2 pl-4" data-no-drag>

      <div className="relative flex items-center gap-2">
        <BottomMenuPopup
          icon="ti ti-list"
          label={t('listSettings.title')}
          title={t('listSettings.title')}
          menuItems={menuItems}
          width={120}
        />

        {children}
      </div>
    </div>
  </div>;
}
export default FooterBar;