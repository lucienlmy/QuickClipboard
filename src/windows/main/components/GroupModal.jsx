import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { addGroup, updateGroup } from '@shared/store/groupsStore';
import { useInputFocus } from '@shared/hooks/useInputFocus';
import { showMessage, showError } from '@shared/utils/dialog';
import Tooltip from '@shared/components/common/Tooltip.jsx';

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
  'ti ti-folder', 'ti ti-folder-plus',
  'ti ti-file', 'ti ti-file-text',
  'ti ti-book', 'ti ti-books',
  'ti ti-notebook', 'ti ti-note', 'ti ti-notes',
  'ti ti-clipboard', 'ti ti-archive',
  'ti ti-package', 'ti ti-box',
  'ti ti-photo', 'ti ti-video',
  'ti ti-music', 'ti ti-palette',
  'ti ti-code', 'ti ti-bulb',
  'ti ti-link', 'ti ti-link-plus',
  'ti ti-paperclip',
  'ti ti-mail', 'ti ti-mail-opened',
  'ti ti-message', 'ti ti-message-circle', 'ti ti-message-dots',
  'ti ti-send', 'ti ti-share',
  'ti ti-user', 'ti ti-users', 'ti ti-building',
  'ti ti-school', 'ti ti-certificate',
  'ti ti-tag', 'ti ti-category', 'ti ti-bookmark',
  'ti ti-star', 'ti ti-heart',
  'ti ti-flag',
  'ti ti-calendar',
  'ti ti-list', 'ti ti-checklist',
  'ti ti-map-pin',
  'ti ti-database', 'ti ti-manual-gearbox',
  'ti ti-chart-bar', 'ti ti-chart-pie',
  'ti ti-layers-intersect', 'ti ti-filter',
  'ti ti-language',
  'ti ti-home',
  'ti ti-device-desktop',
  'ti ti-world',
  'ti ti-cloud',
  'ti ti-shopping-cart',
  'ti ti-gift',
  'ti ti-lock',
  'ti ti-search'
];


function GroupModal({
  group,
  onClose,
  onSave
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(group?.name || '');
  const [selectedIcon, setSelectedIcon] = useState(group?.icon || 'ti ti-folder');
  const [selectedColor, setSelectedColor] = useState(group?.color || '#dc2626');
  const [saving, setSaving] = useState(false);

  // 输入框焦点管理
  const inputRef = useInputFocus();

  useEffect(() => {
    if (group) {
      setName(group.name);
      setSelectedIcon(group.icon);
      setSelectedColor(group.color || '#dc2626');
    } else {
      setSelectedColor('#dc2626');
    }
  }, [group]);

  // 保存
  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      await showMessage(t('groups.modal.nameRequired'), t('common.confirm'));
      return;
    }
    setSaving(true);
    try {
      if (group) {
        await updateGroup(group.name, trimmedName, selectedIcon, selectedColor);
      } else {
        await addGroup(trimmedName, selectedIcon, selectedColor);
      }
      onSave?.();
    } catch (error) {
      console.error('保存分组失败:', error);
      await showError(t('groups.deleteFailed'), t('common.confirm'));
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter') handleSave();
    else if (e.key === 'Escape') onClose();
  };

  const handleOverlayClick = (e) => {
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
      <div className="group-modal bg-qc-panel rounded-lg shadow-xl w-[320px] max-h-[80vh] overflow-hidden flex flex-col border border-qc-border">

        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-qc-border">
          <h3 className="text-lg font-semibold text-qc-fg">
            {group ? t('groups.modal.titleEdit') : t('groups.modal.titleNew')}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-qc-hover text-qc-fg-muted"
          >
            <i className="ti ti-x" style={{ fontSize: 20 }} />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* name */}
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
              className="w-full px-3 py-2 appearance-none bg-qc-panel-2 border border-qc-border rounded-md text-qc-fg placeholder:text-qc-fg-subtle focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{
                backgroundColor: 'var(--qc-panel-2)',
                color: 'var(--qc-fg)',
                colorScheme: 'light',
              }}
              autoFocus
            />
          </div>

          {/* color */}
          <div>
            <label className="block text-sm font-medium text-qc-fg mb-2">
              颜色
            </label>

            <div className="flex gap-2">

              {/* custom */}
              <Tooltip content={t('groups.modal.customColor')} placement="top" asChild>
                <label
                  className="w-8 h-8 rounded-md border border-qc-border-strong flex items-center justify-center cursor-pointer hover:border-blue-500 transition text-qc-fg-muted"
                >
                  <input
                    type="color"
                    value={selectedColor}
                    onChange={(e) => setSelectedColor(e.target.value)}
                    className="absolute opacity-0 w-0 h-0"
                  />
                  <i className="ti ti-adjustments" />
                </label>
              </Tooltip>

              {/* preset */}
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`w-8 h-8 rounded-md border transition
                  ${selectedColor === color
                      ? "border-blue-500 scale-110 shadow"
                      : "border-qc-border hover:border-qc-border-strong"
                    }`}
                  style={{ backgroundColor: color }}
                />
              ))}

            </div>
          </div>

          {/* icon */}
          <div>
            <label className="block text-sm font-medium text-qc-fg mb-2">
              {t('groups.modal.iconLabel')}
            </label>

            <div className="grid grid-cols-6 gap-2 max-h-[300px] overflow-y-auto p-2 bg-qc-panel-2 rounded-md">
              {AVAILABLE_ICONS.map(iconName => (
                <button
                  key={iconName}
                  onClick={() => setSelectedIcon(iconName)}
                  className={`p-2 rounded-md transition flex items-center justify-center border
                    ${selectedIcon === iconName
                      ? "bg-blue-500 border-blue-500 text-white shadow-md"
                      : "bg-qc-panel text-qc-fg border-qc-border hover:border-blue-400"
                    }`}
                >
                  <i
                    className={iconName}
                    style={{
                      fontSize: 18,
                      color: selectedIcon === iconName ? "#fff" : selectedColor,
                      filter: selectedIcon === iconName ? "none" : "grayscale(0.3) opacity(0.8)",
                      transition: "all 0.2s",
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-qc-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-qc-fg hover:bg-qc-hover rounded-md transition"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? t('groups.modal.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GroupModal;
