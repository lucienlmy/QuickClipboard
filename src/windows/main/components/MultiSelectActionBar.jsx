import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import { useSnapshot } from 'valtio';
import Tooltip from '@shared/components/common/Tooltip.jsx';
import { showConfirm } from '@shared/utils/dialog';
import { clipboardStore, refreshClipboardHistory } from '@shared/store/clipboardStore';
import { favoritesStore, refreshFavorites } from '@shared/store/favoritesStore';
import { groupsStore } from '@shared/store/groupsStore';
import {
  deleteClipboardItems,
  mergeCopyClipboardItems,
  mergePasteClipboardItems,
} from '@shared/api/clipboard';
import {
  deleteFavoriteItems,
  mergeCopyFavoriteItems,
  mergePasteFavoriteItems,
} from '@shared/api/favorites';
import { toast, TOAST_POSITIONS, TOAST_SIZES } from '@shared/store/toastStore';
import { getSelectionMergeState } from '../utils/multiSelect';

function MultiSelectActionBar({ activeTab }) {
  const { t } = useTranslation();
  const clipboardSnap = useSnapshot(clipboardStore);
  const favoritesSnap = useSnapshot(favoritesStore);
  const groupsSnap = useSnapshot(groupsStore);

  const currentSnap = activeTab === 'clipboard'
    ? clipboardSnap
    : activeTab === 'favorites'
      ? favoritesSnap
      : null;
  const currentStore = activeTab === 'clipboard'
    ? clipboardStore
    : activeTab === 'favorites'
      ? favoritesStore
      : null;

  if (!currentSnap?.isMultiSelectMode || !currentStore) {
    return null;
  }

  const selectedEntries = currentSnap.selectedEntries || [];
  const selectedCount = selectedEntries.length;
  const selectedIds = currentStore.getSelectedIds();
  const mergeState = getSelectionMergeState(selectedEntries);

  const getDisabledTooltip = (reasonKey) => t(`multiSelect.${reasonKey}`);

  const makeActionButtonClasses = (disabled) => `
    flex items-center justify-center
    w-8 h-8
    rounded-md border
    transition-colors duration-200
    ${disabled
      ? 'cursor-not-allowed border-qc-border bg-qc-panel text-qc-fg-subtle opacity-60'
      : 'border-qc-border bg-qc-panel text-qc-fg-muted hover:bg-qc-hover hover:text-qc-fg'}
  `.trim().replace(/\s+/g, ' ');

  const withToastConfig = {
    size: TOAST_SIZES.EXTRA_SMALL,
    position: TOAST_POSITIONS.BOTTOM_RIGHT,
  };

  const handleMergeCopy = async () => {
    if (!selectedCount || !mergeState.canMerge) return;

    try {
      if (activeTab === 'clipboard') {
        await mergeCopyClipboardItems(selectedIds);
      } else {
        await mergeCopyFavoriteItems(selectedIds);
      }
      toast.success(t('multiSelect.mergeCopied'), withToastConfig);
    } catch (error) {
      console.error('合并复制失败:', error);
      toast.error(error?.message || t('common.copyFailed'), withToastConfig);
    }
  };

  const handleMergePaste = async () => {
    if (!selectedCount || !mergeState.canMerge) return;

    try {
      if (activeTab === 'clipboard') {
        await mergePasteClipboardItems(selectedIds);
      } else {
        await mergePasteFavoriteItems(selectedIds);
      }
      currentStore.exitMultiSelectMode();
      toast.success(t('multiSelect.mergePasted'), withToastConfig);
    } catch (error) {
      console.error('合并粘贴失败:', error);
      toast.error(error?.message || t('common.pasteFailed'), withToastConfig);
    }
  };

  const handleDelete = async () => {
    if (!selectedCount) return;

    const confirmed = await showConfirm(
      t('multiSelect.confirmDelete', { count: selectedCount }),
      t('multiSelect.confirmDeleteTitle')
    );
    if (!confirmed) {
      return;
    }

    try {
      if (activeTab === 'clipboard') {
        await deleteClipboardItems(selectedIds);
        await refreshClipboardHistory();
      } else {
        await deleteFavoriteItems(selectedIds);
        await refreshFavorites(groupsSnap.currentGroup);
      }
      currentStore.exitMultiSelectMode();
      toast.success(t('common.deleted'), withToastConfig);
    } catch (error) {
      console.error('批量删除失败:', error);
      toast.error(error?.message || t('common.deleteFailed'), withToastConfig);
    }
  };

  return (
    <div className="flex-shrink-0 h-11 px-3 border-t border-qc-border bg-qc-panel-2/70 backdrop-blur-sm">
      <div className="h-full flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-qc-fg">
          {t('multiSelect.selectedCount', { count: selectedCount })}
        </div>

        <div className="flex items-center gap-2">
          <Tooltip
            content={!selectedCount
              ? getDisabledTooltip('selectFirst')
              : !mergeState.canMerge
                ? getDisabledTooltip(mergeState.reasonKey)
                : t('multiSelect.mergeCopy')}
            placement="top"
            asChild
          >
            <button
              className={makeActionButtonClasses(!selectedCount || !mergeState.canMerge)}
              onClick={handleMergeCopy}
              aria-disabled={!selectedCount || !mergeState.canMerge}
            >
              <i className="ti ti-copy" style={{ fontSize: 15 }}></i>
            </button>
          </Tooltip>

          <Tooltip
            content={!selectedCount
              ? getDisabledTooltip('selectFirst')
              : !mergeState.canMerge
                ? getDisabledTooltip(mergeState.reasonKey)
                : t('multiSelect.mergePaste')}
            placement="top"
            asChild
          >
            <button
              className={makeActionButtonClasses(!selectedCount || !mergeState.canMerge)}
              onClick={handleMergePaste}
              aria-disabled={!selectedCount || !mergeState.canMerge}
            >
              <i className="ti ti-fold-down" style={{ fontSize: 15 }}></i>
            </button>
          </Tooltip>

          <Tooltip
            content={selectedCount ? t('multiSelect.deleteSelected') : getDisabledTooltip('selectFirst')}
            placement="top"
            asChild
          >
            <button
              className={makeActionButtonClasses(!selectedCount)}
              onClick={handleDelete}
              aria-disabled={!selectedCount}
            >
              <i className="ti ti-trash" style={{ fontSize: 15 }}></i>
            </button>
          </Tooltip>

          <Tooltip content={t('multiSelect.exitMode')} placement="top" asChild>
            <button
              className={makeActionButtonClasses(false)}
              onClick={() => currentStore.exitMultiSelectMode()}
            >
              <i className="ti ti-x" style={{ fontSize: 15 }}></i>
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

export default MultiSelectActionBar;
