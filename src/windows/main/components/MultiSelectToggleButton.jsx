import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import { useSnapshot } from 'valtio';
import Tooltip from '@shared/components/common/Tooltip.jsx';
import { clipboardStore } from '@shared/store/clipboardStore';
import { favoritesStore } from '@shared/store/favoritesStore';

function MultiSelectToggleButton({ activeTab }) {
  const { t } = useTranslation();
  const clipboardSnap = useSnapshot(clipboardStore);
  const favoritesSnap = useSnapshot(favoritesStore);

  const currentStore = activeTab === 'clipboard'
    ? clipboardStore
    : activeTab === 'favorites'
      ? favoritesStore
      : null;

  const isMultiSelectMode = activeTab === 'clipboard'
    ? clipboardSnap.isMultiSelectMode
    : activeTab === 'favorites'
      ? favoritesSnap.isMultiSelectMode
      : false;

  if (!currentStore) {
    return null;
  }

  const handleToggleMode = () => {
    if (isMultiSelectMode) {
      currentStore.exitMultiSelectMode();
    } else {
      currentStore.enterMultiSelectMode();
    }
  };

  return (
    <Tooltip
      content={isMultiSelectMode ? t('multiSelect.exitMode') : t('multiSelect.enterMode')}
      placement="top"
      asChild
    >
      <button
        className={`
          flex items-center justify-center
          w-full h-full px-3
          transition-colors duration-200
          ${isMultiSelectMode ? 'bg-qc-active text-theme-9' : 'text-qc-fg-muted hover:bg-qc-hover hover:text-qc-fg'}
        `.trim().replace(/\s+/g, ' ')}
        onClick={handleToggleMode}
      >
        <i className={isMultiSelectMode ? 'ti ti-checklist' : 'ti ti-list-check'} style={{ fontSize: 12 }}></i>
      </button>
    </Tooltip>
  );
}

export default MultiSelectToggleButton;
