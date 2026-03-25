import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { useSnapshot } from 'valtio';
import { useWindowDrag } from '@shared/hooks/useWindowDrag';
import { toggleWindowPin, getWindowPinState, openAppSettings } from '@shared/services/titleBarActions';
import { clipboardStore } from '@shared/store/clipboardStore';
import { favoritesStore } from '@shared/store/favoritesStore';
import { settingsStore } from '@shared/store/settingsStore';
import { showContextMenuFromEvent, createMenuItem, createSeparator } from '@/plugins/context_menu/index.js';
import { hideMainWindow } from '@shared/api/window';
import { clearClipboardHistory } from '@shared/api';
import {
  startScreenshot,
  startScreenshotQuickSave,
  startScreenshotQuickPin,
  startScreenshotQuickOcr
} from '@shared/api/system';
import { toast, TOAST_SIZES, TOAST_POSITIONS } from '@shared/store/toastStore';
import {
  getOneTimePasteEnabled,
  toggleOneTimePasteEnabled,
  getOneTimePasteEventName,
  getOneTimePasteStorageKey
} from '@shared/services/oneTimePaste';
import { normalizeDisplayPriorityValue } from '@shared/utils/displayFormatPriority';
import logoIcon from '@/assets/icon1024.png';
import TitleBarSearch from './TitleBarSearch';
import Tooltip from '@shared/components/common/Tooltip.jsx';

const ACTIVE_ICON_BUTTON_CLASS = 'bg-blue-500 bg-dynamic-primary text-white hover:bg-blue-600';
const TOAST_CONFIG = {
  size: TOAST_SIZES.EXTRA_SMALL,
  position: TOAST_POSITIONS.BOTTOM_RIGHT
};

const TitleBar = forwardRef(({
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  onNavigate,
  position = 'top',
  activeTab = 'clipboard'
}, ref) => {
  const { t } = useTranslation();
  const clipboardSnap = useSnapshot(clipboardStore);
  const favoritesSnap = useSnapshot(favoritesStore);
  const settingsSnap = useSnapshot(settingsStore);
  const searchRef = useRef(null);
  const [isPinned, setIsPinned] = useState(() => Boolean(getWindowPinState()));
  const [oneTimePasteEnabled, setOneTimePasteEnabledState] = useState(() => getOneTimePasteEnabled());
  const isVertical = position === 'left' || position === 'right';
  const tooltipPlacement = isVertical ? (position === 'left' ? 'right' : 'left') : 'bottom';

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

  useEffect(() => {
    const syncState = () => {
      setOneTimePasteEnabledState(getOneTimePasteEnabled());
    };
    const handleStorage = (event) => {
      if (event.key === getOneTimePasteStorageKey()) {
        syncState();
      }
    };

    const eventName = getOneTimePasteEventName();
    window.addEventListener(eventName, syncState);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(eventName, syncState);
      window.removeEventListener('storage', handleStorage);
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

  const handleToggleMultiSelect = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!currentStore) {
      return;
    }
    if (isMultiSelectMode) {
      currentStore.exitMultiSelectMode();
    } else {
      currentStore.enterMultiSelectMode();
    }
  };

  const startScreenshotFromMenu = async (mode) => {
    try {
      await hideMainWindow();
      const waitTime = settingsStore.clipboardAnimationEnabled !== false ? 170 : 50;
      await new Promise(resolve => setTimeout(resolve, waitTime));

      if (mode === 'normal') {
        await startScreenshot();
      } else if (mode === 'quick-save') {
        await startScreenshotQuickSave();
      } else if (mode === 'quick-pin') {
        await startScreenshotQuickPin();
      } else if (mode === 'quick-ocr') {
        await startScreenshotQuickOcr();
      }
    } catch (error) {
      console.error('标题栏启动截屏失败:', error);
    }
  };

  const handleMoreMenu = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const checkIcon = enabled => (enabled ? 'ti ti-check' : undefined);
    const normalizedDisplayPriority = normalizeDisplayPriorityValue(settingsSnap.displayPriorityOrder);
    const displayPriorityOptions = [{
      id: 'text-html-image',
      value: 'text,html,image',
      label: t('settings.clipboard.displayPriorityTextHtmlImage')
    }, {
      id: 'text-image-html',
      value: 'text,image,html',
      label: t('settings.clipboard.displayPriorityTextImageHtml')
    }, {
      id: 'html-text-image',
      value: 'html,text,image',
      label: t('settings.clipboard.displayPriorityHtmlTextImage')
    }, {
      id: 'html-image-text',
      value: 'html,image,text',
      label: t('settings.clipboard.displayPriorityHtmlImageText')
    }, {
      id: 'image-text-html',
      value: 'image,text,html',
      label: t('settings.clipboard.displayPriorityImageTextHtml')
    }, {
      id: 'image-html-text',
      value: 'image,html,text',
      label: t('settings.clipboard.displayPriorityImageHtmlText')
    }];
    const displayPriorityValueByMenuId = Object.fromEntries(
      displayPriorityOptions.map((option) => [`menu-display-priority-${option.id}`, option.value])
    );

    const screenshotItem = createMenuItem('menu-screenshot-group', t('tools.moreMenu.screenshot'), {
      icon: 'ti ti-screenshot',
      disabled: settingsSnap.screenshotEnabled === false
    });
    screenshotItem.children = [
      createMenuItem('menu-screenshot-normal', t('tools.screenshot'), { icon: 'ti ti-screenshot' }),
      createMenuItem('menu-screenshot-quick-save', t('settings.shortcuts.screenshotQuickSave'), { icon: 'ti ti-copy' }),
      createMenuItem('menu-screenshot-quick-pin', t('settings.shortcuts.screenshotQuickPin'), { icon: 'ti ti-pinned' }),
      createMenuItem('menu-screenshot-quick-ocr', t('settings.shortcuts.screenshotQuickOcr'), { icon: 'ti ti-text-scan-2' })
    ];

    const previewItem = createMenuItem('menu-preview-group', t('tools.moreMenu.contentPreview'), { icon: 'ti ti-eye' });
    previewItem.children = [
      createMenuItem('menu-preview-text', t('settings.clipboard.textPreview'), { icon: checkIcon(settingsSnap.textPreview !== false) }),
      createMenuItem('menu-preview-image', t('settings.clipboard.imagePreview'), { icon: checkIcon(settingsSnap.imagePreview !== false) })
    ];

    const displayPriorityItem = createMenuItem('menu-display-priority-group', t('settings.clipboard.displayPriority'), { icon: 'ti ti-sort-descending-2' });
    displayPriorityItem.children = displayPriorityOptions.map((option) =>
      createMenuItem(`menu-display-priority-${option.id}`, option.label, { icon: checkIcon(normalizedDisplayPriority === option.value) })
    );

    const pasteItem = createMenuItem('menu-paste-group', t('tools.moreMenu.globalPaste'), { icon: 'ti ti-clipboard' });
    pasteItem.children = [
      createMenuItem('menu-paste-format', t('tools.formatToggle'), { icon: checkIcon(settingsSnap.pasteWithFormat !== false) }),
      createMenuItem('menu-paste-to-top', t('settings.clipboard.pasteToTop'), { icon: checkIcon(settingsSnap.pasteToTop === true) }),
      createMenuItem('menu-paste-one-time', t('tools.oneTimePaste'), { icon: checkIcon(oneTimePasteEnabled) })
    ];

    const menuItems = [
      screenshotItem,
      previewItem,
      displayPriorityItem,
      pasteItem,
      createSeparator(),
      createMenuItem('menu-clear-clipboard-history', t('contextMenu.clearAll'), { icon: 'ti ti-trash-x' }),
      createMenuItem('menu-open-settings', t('tools.moreMenu.settings'), { icon: 'ti ti-settings' })
    ];

    const result = await showContextMenuFromEvent(event, menuItems, {
      theme: settingsStore.theme,
      darkThemeStyle: settingsStore.darkThemeStyle
    });
    if (!result) {
      return;
    }

    const displayPriorityValue = displayPriorityValueByMenuId[result];
    if (displayPriorityValue) {
      try {
        await settingsStore.saveSetting('displayPriorityOrder', displayPriorityValue);
      } catch (error) {
        console.error('切换展示优先级失败:', error);
      }
      return;
    }

    switch (result) {
      case 'menu-screenshot-normal':
        await startScreenshotFromMenu('normal');
        break;
      case 'menu-screenshot-quick-save':
        await startScreenshotFromMenu('quick-save');
        break;
      case 'menu-screenshot-quick-pin':
        await startScreenshotFromMenu('quick-pin');
        break;
      case 'menu-screenshot-quick-ocr':
        await startScreenshotFromMenu('quick-ocr');
        break;
      case 'menu-preview-text':
        try {
          await settingsStore.saveSetting('textPreview', settingsSnap.textPreview === false);
        } catch (error) {
          console.error('切换文本预览失败:', error);
        }
        break;
      case 'menu-preview-image':
        try {
          await settingsStore.saveSetting('imagePreview', settingsSnap.imagePreview === false);
        } catch (error) {
          console.error('切换图片预览失败:', error);
        }
        break;
      case 'menu-paste-format':
        try {
          await settingsStore.saveSetting('pasteWithFormat', settingsSnap.pasteWithFormat === false);
        } catch (error) {
          console.error('切换格式粘贴失败:', error);
        }
        break;
      case 'menu-paste-to-top':
        try {
          await settingsStore.saveSetting('pasteToTop', !Boolean(settingsStore.pasteToTop));
        } catch (error) {
          console.error('切换粘贴后置顶失败:', error);
        }
        break;
      case 'menu-paste-one-time':
        setOneTimePasteEnabledState(toggleOneTimePasteEnabled());
        break;
      case 'menu-clear-clipboard-history':
        try {
          const { showConfirm } = await import('@shared/utils/dialog');
          const confirmed = await showConfirm(
            t('contextMenu.clearAllConfirm'),
            t('contextMenu.clearAllConfirmTitle')
          );
          if (!confirmed) {
            break;
          }

          await clearClipboardHistory();
          const { loadClipboardItems } = await import('@shared/store/clipboardStore');
          await loadClipboardItems();
          toast.success(t('contextMenu.allCleared'), TOAST_CONFIG);
        } catch (error) {
          console.error('标题栏清空剪贴板失败:', error);
          toast.error(t('common.operationFailed'), TOAST_CONFIG);
        }
        break;
      case 'menu-open-settings':
        try {
          await openAppSettings();
        } catch (error) {
          console.error('标题栏打开设置失败:', error);
        }
        break;
      default:
        break;
    }
  };

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
      className={`title-bar flex-shrink-0 flex ${
        isVertical
          ? `w-10 h-full flex-col items-center justify-between py-2 bg-qc-panel ${
              position === 'left' ? 'border-r border-qc-border' : 'border-l border-qc-border'
            }`
          : `h-9 flex-row items-center justify-between px-2 bg-qc-panel ${
              position === 'top' ? 'border-b border-qc-border' : 'border-t border-qc-border'
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
          <Tooltip content={isMultiSelectMode ? t('multiSelect.exitMode') : t('multiSelect.enterMode')} placement={tooltipPlacement} asChild>
            <button
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 ${
                !currentStore
                  ? 'text-qc-fg-subtle opacity-60 cursor-not-allowed'
                  : isMultiSelectMode
                    ? ACTIVE_ICON_BUTTON_CLASS
                    : 'hover:bg-qc-hover text-qc-fg-muted'
              }`}
              aria-label={isMultiSelectMode ? t('multiSelect.exitMode') : t('multiSelect.enterMode')}
              type="button"
              onClick={handleToggleMultiSelect}
              disabled={!currentStore}
            >
              <i className={isMultiSelectMode ? 'ti ti-list' : 'ti ti-list-check'} style={{ fontSize: 16 }} data-stroke="1.5"></i>
            </button>
          </Tooltip>

          <Tooltip content={t('tools.pin')} placement={tooltipPlacement} asChild>
            <button
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 ${
                isPinned ? ACTIVE_ICON_BUTTON_CLASS : 'hover:bg-qc-hover text-qc-fg-muted'
              }`}
              onClick={handleTogglePin}
              aria-label={t('tools.pin')}
            >
              <i className="ti ti-pin" style={{ fontSize: 16 }} data-stroke="1.5"></i>
            </button>
          </Tooltip>

          <Tooltip content={t('tools.more')} placement={tooltipPlacement} asChild>
            <button
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 hover:bg-qc-hover text-qc-fg-muted"
              aria-label={t('tools.more')}
              type="button"
              onClick={handleMoreMenu}
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
