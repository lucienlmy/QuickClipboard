import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInputFocus } from '@shared/hooks/useInputFocus';
import { showError, showMessage } from '@shared/utils/dialog';
import Tooltip from '@shared/components/common/Tooltip.jsx';
import * as imageLibrary from '@shared/api/imageLibrary';

const DEFAULT_IMAGE_GROUP_NAME = '默认';

const PRESET_COLORS = [
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#2563eb',
  '#7c3aed',
  '#6b7280',
];

const AVAILABLE_ICONS = [
  'ti ti-mood-smile', 'ti ti-mood-happy', 'ti ti-mood-wink',
  'ti ti-mood-heart', 'ti ti-mood-kid', 'ti ti-face-id',
  'ti ti-heart', 'ti ti-heart-filled', 'ti ti-message-circle-heart',
  'ti ti-star', 'ti ti-star-filled', 'ti ti-sparkles',
  'ti ti-icons', 'ti ti-sticker', 'ti ti-gif',
  'ti ti-photo', 'ti ti-library-photo', 'ti ti-camera',
  'ti ti-palette', 'ti ti-brush', 'ti ti-color-swatch',
  'ti ti-balloon', 'ti ti-gift', 'ti ti-cake', 'ti ti-confetti',
  'ti ti-flower', 'ti ti-plant', 'ti ti-sun', 'ti ti-moon',
  'ti ti-cloud', 'ti ti-bolt', 'ti ti-flame',
  'ti ti-crown', 'ti ti-diamond', 'ti ti-music',
  'ti ti-device-gamepad-2', 'ti ti-ghost', 'ti ti-alien',
  'ti ti-robot', 'ti ti-apple', 'ti ti-pizza',
  'ti ti-coffee', 'ti ti-shirt', 'ti ti-car', 'ti ti-plane',
  'ti ti-baby-carriage', 'ti ti-friends', 'ti ti-user-heart',
];

function ImageGroupModal({ group, onClose, onSave }) {
  const { t } = useTranslation();
  const [name, setName] = useState(group?.name || '');
  const [selectedIcon, setSelectedIcon] = useState(group?.icon || 'ti ti-photo');
  const [selectedColor, setSelectedColor] = useState(group?.color || '#2563eb');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const inputRef = useInputFocus();
  const isEditing = Boolean(group);
  const isDefaultGroup = group?.name === DEFAULT_IMAGE_GROUP_NAME;
  const itemCount = group?.item_count || 0;
  const canDelete = isEditing && !isDefaultGroup;

  useEffect(() => {
    setName(group?.name || '');
    setSelectedIcon(group?.icon || 'ti ti-photo');
    setSelectedColor(group?.color || '#2563eb');
    setShowDeleteConfirm(false);
  }, [group]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      await showMessage(t('groups.modal.nameRequired'), t('common.confirm'));
      return;
    }

    setSaving(true);
    try {
      const savedGroup = group
        ? await imageLibrary.updateImageGroup(group.name, trimmedName, selectedIcon, selectedColor)
        : await imageLibrary.addImageGroup(trimmedName, selectedIcon, selectedColor);
      onSave?.(savedGroup);
    } catch (error) {
      console.error('保存图库分组失败:', error);
      await showError(t('common.saveFailed'), t('common.confirm'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async (moveImagesToDefault) => {
    if (!canDelete || deleting) return;

    setDeleting(true);
    try {
      const groups = await imageLibrary.deleteImageGroup(group.name, moveImagesToDefault);
      onSave?.({ deleted: true, deletedName: group.name, groups });
    } catch (error) {
      console.error('删除图库分组失败:', error);
      await showError(t('groups.deleteFailed'), t('common.confirm'));
    } finally {
      setDeleting(false);
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter') handleSave();
    else if (e.key === 'Escape') onClose();
  };

  const handleOverlayClick = e => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-[5px] rounded-[8px] overflow-hidden flex items-center justify-center z-50 backdrop-blur-[6px]"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--qc-surface) 28%, transparent)',
      }}
      onClick={handleOverlayClick}
    >
      <div className="bg-qc-panel rounded-lg shadow-xl w-[320px] max-h-[80vh] overflow-hidden flex flex-col border border-qc-border">
        <div className="flex items-center justify-between px-4 py-3 border-b border-qc-border">
          <h3 className="text-lg font-semibold text-qc-fg">
            {isEditing ? t('groups.modal.titleEdit') : t('groups.modal.titleNew')}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-qc-hover text-qc-fg-muted"
          >
            <i className="ti ti-x" style={{ fontSize: 20 }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {showDeleteConfirm ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
                <i className="ti ti-alert-triangle mt-0.5 text-lg"></i>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {t('groups.imageDelete.title', { name: group.name })}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed">
                    {itemCount > 0
                      ? t('groups.imageDelete.nonEmptyDesc', { count: itemCount, target: DEFAULT_IMAGE_GROUP_NAME })
                      : t('groups.imageDelete.emptyDesc')}
                  </div>
                </div>
              </div>

              {itemCount > 0 ? (
                <div className="space-y-2">
                  <button
                    onClick={() => handleDeleteGroup(true)}
                    disabled={deleting}
                    className="w-full px-3 py-2 text-sm font-medium rounded-md border border-qc-border text-qc-fg hover:bg-qc-hover transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <i className="ti ti-folder-symlink text-base"></i>
                    {t('groups.imageDelete.moveThenDelete')}
                  </button>
                  <button
                    onClick={() => handleDeleteGroup(false)}
                    disabled={deleting}
                    className="w-full px-3 py-2 text-sm font-medium rounded-md bg-red-500 text-white hover:bg-red-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <i className="ti ti-trash text-base"></i>
                    {t('groups.imageDelete.deleteAll')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleDeleteGroup(false)}
                  disabled={deleting}
                  className="w-full px-3 py-2 text-sm font-medium rounded-md bg-red-500 text-white hover:bg-red-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <i className="ti ti-trash text-base"></i>
                  {t('groups.imageDelete.deleteEmpty')}
                </button>
              )}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-qc-fg mb-2">
                  {t('groups.modal.nameLabel')}
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('groups.modal.namePlaceholder')}
                  disabled={isDefaultGroup}
                  className="w-full px-3 py-2 appearance-none bg-qc-panel-2 border border-qc-border rounded-md text-qc-fg placeholder:text-qc-fg-subtle focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: 'var(--qc-panel-2)',
                    color: 'var(--qc-fg)',
                    colorScheme: 'light',
                  }}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-qc-fg mb-2">
                  颜色
                </label>
                <div className="flex gap-2">
                  <Tooltip content={t('groups.modal.customColor')} placement="top" asChild>
                    <label className="w-8 h-8 rounded-md border border-qc-border-strong flex items-center justify-center cursor-pointer hover:border-blue-500 transition text-qc-fg-muted">
                      <input
                        type="color"
                        value={selectedColor}
                        onChange={e => setSelectedColor(e.target.value)}
                        className="absolute opacity-0 w-0 h-0"
                      />
                      <i className="ti ti-adjustments" />
                    </label>
                  </Tooltip>
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`w-8 h-8 rounded-md border transition ${
                        selectedColor === color
                          ? 'border-blue-500 scale-110 shadow'
                          : 'border-qc-border hover:border-qc-border-strong'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-qc-fg mb-2">
                  {t('groups.modal.iconLabel')}
                </label>
                <div className="grid grid-cols-6 gap-2 max-h-[300px] overflow-y-auto p-2 bg-qc-panel-2 rounded-md">
                  {AVAILABLE_ICONS.map(iconName => (
                    <button
                      key={iconName}
                      onClick={() => setSelectedIcon(iconName)}
                      className={`p-2 rounded-md transition flex items-center justify-center border ${
                        selectedIcon === iconName
                          ? 'bg-blue-500 border-blue-500 text-white shadow-md'
                          : 'bg-qc-panel text-qc-fg border-qc-border hover:border-blue-400'
                      }`}
                    >
                      <i
                        className={iconName}
                        style={{
                          fontSize: 18,
                          color: selectedIcon === iconName ? '#fff' : selectedColor,
                          filter: selectedIcon === iconName ? 'none' : 'grayscale(0.3) opacity(0.8)',
                          transition: 'all 0.2s',
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-qc-border">
          {canDelete && !showDeleteConfirm && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={saving || deleting}
              className="mr-auto px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <i className="ti ti-trash text-base"></i>
              {t('groups.delete')}
            </button>
          )}
          <button
            onClick={showDeleteConfirm ? () => setShowDeleteConfirm(false) : onClose}
            className="px-4 py-2 text-sm font-medium text-qc-fg hover:bg-qc-hover rounded-md transition"
          >
            {t('common.cancel')}
          </button>
          {!showDeleteConfirm && (
            <button
              onClick={handleSave}
              disabled={saving || deleting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? t('groups.modal.saving') : t('common.save')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImageGroupModal;
