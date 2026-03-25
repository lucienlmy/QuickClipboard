import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { pasteClipboardItem, clipboardStore, refreshClipboardHistory } from '@shared/store/clipboardStore';
import { useItemCommon } from '@shared/hooks/useItemCommon.jsx';
import { useSortable, CSS } from '@shared/hooks/useSortable';
import { useDragWithThreshold } from '@shared/hooks/useDragWithThreshold';
import { showClipboardItemContextMenu } from '@shared/utils/contextMenu';
import { getPrimaryType } from '@shared/utils/contentType';
import { useTranslation } from 'react-i18next';
import { addClipboardToFavorites, togglePinClipboardItem, showPreviewWindow, closePreviewWindow } from '@shared/api';
import { openEditorForClipboard } from '@shared/api/textEditor';
import { toast, TOAST_SIZES, TOAST_POSITIONS } from '@shared/store/toastStore';
import { moveClipboardItemToTop } from '@shared/api';
import { useTheme } from '@shared/hooks/useTheme';
import Tooltip from '@shared/components/common/Tooltip.jsx';
import { getClipboardItemPasteOptions } from '@shared/api/clipboard';
import { extractFormatKinds, formatKindsToLabels } from '@shared/utils/pasteFormatHints';
import { settingsStore } from '@shared/store/settingsStore';
import { getOneTimePasteEnabled } from '@shared/services/oneTimePaste';
import {
  DISPLAY_FORMAT_HTML,
  DISPLAY_FORMAT_IMAGE,
  resolveDisplayFormatByPriority,
} from '@shared/utils/displayFormatPriority';
import logoIcon from '@/assets/icon1024.png';

const PREVIEW_MODE_TEXT = 'text';
const PREVIEW_MODE_HTML = 'html';
const PREVIEW_MODE_IMAGE = 'image';
const PREVIEW_HOVER_DELAY_MS = 120;
const clipboardFormatKindsCache = new Map();

const getItemPreviewMode = (item, type, displayPriorityOrder) => {
  const primaryType = getPrimaryType(type || item?.content_type);
  if (primaryType === 'image') return PREVIEW_MODE_IMAGE;
  if (primaryType === 'file') return null;

  if (primaryType === 'text' || primaryType === 'rich_text' || primaryType === 'link') {
    const displayFormat = resolveDisplayFormatByPriority(item, displayPriorityOrder);
    if (displayFormat === DISPLAY_FORMAT_IMAGE) return PREVIEW_MODE_IMAGE;
    if (displayFormat === DISPLAY_FORMAT_HTML) return PREVIEW_MODE_HTML;
    return PREVIEW_MODE_TEXT;
  }

  return null;
};

function ClipboardItem({
  item,
  index,
  onClick,
  sortId,
  isSelected = false,
  isMultiSelected = false,
  isMultiSelectMode = false,
  onHover,
  isDragActive = false,
  isDraggable = true,
  showShortcut = true,
  animationDelay = 0
}) {
  const {
    t
  } = useTranslation();
  const isPasted = item.paste_count > 0;
  const {
    settings,
    getHeightClass,
    getLineClampClass,
    renderType,
    formatTime,
    renderContent
  } = useItemCommon(item);
  const { isBackground } = useTheme();
  const isFileType = renderType === 'file';
  const isImageType = renderType === 'image';
  const isImageOrFileType = isFileType || isImageType;
  const previewMode = getItemPreviewMode(item, renderType, settings.displayPriorityOrder);
  const previewEnabled = previewMode === PREVIEW_MODE_IMAGE
    ? settings.imagePreview !== false
    : (previewMode === PREVIEW_MODE_TEXT || previewMode === PREVIEW_MODE_HTML)
      ? settings.textPreview !== false
      : false;
  const sortTooltipContent = t('clipboard.dragSortOnlyRight', '拖拽排序');
  const [showDragSideTooltips, setShowDragSideTooltips] = useState(false);
  const [formatKinds, setFormatKinds] = useState(() => extractFormatKinds([], item));
  const formatKindsLoadedRef = useRef(false);
  const previewTimerRef = useRef(null);

  const [sourceIconUrl, setSourceIconUrl] = useState(null);
  const [iconLoadFailed, setIconLoadFailed] = useState(false);

  const isLanSyncRemote = Boolean(item?.is_remote);

  const sourceTitle = (() => {
    if (!isLanSyncRemote) return item.source_app || '';

    const parts = [];
    if (typeof item.source_device_id === 'string' && item.source_device_id.trim()) {
      parts.push(`设备：${item.source_device_id.trim()}`);
    }
    if (typeof item.source_app === 'string' && item.source_app.trim()) {
      parts.push(`应用：${item.source_app.trim()}`);
    }
    return parts.join('\n');
  })();

  useEffect(() => {
    if (isLanSyncRemote) {
      setSourceIconUrl(logoIcon);
      setIconLoadFailed(false);
      return;
    }

    if (item.source_icon_hash) {
      setIconLoadFailed(false);
      invoke('get_data_directory').then(dataDir => {
        const iconPath = `${dataDir}/app_icons/${item.source_icon_hash}.png`;
        setSourceIconUrl(convertFileSrc(iconPath, 'asset'));
      }).catch(() => {
        setIconLoadFailed(true);
      });
    } else {
      setSourceIconUrl(null);
      setIconLoadFailed(false);
    }
  }, [item.source_icon_hash, isLanSyncRemote]);

  const hasFileMissing = (() => {
    if (!isFileType && !isImageType) return false;
    if (!item.content?.startsWith('files:')) return false;
    try {
      const filesData = JSON.parse(item.content.substring(6));
      return filesData.files?.some(f => f.exists === false) || false;
    } catch {
      return false;
    }
  })();

  // 外部拖拽信息：用于“左侧外部拖拽”Tooltip + 左侧实际触发 startDrag。
  const externalDragInfo = (() => {
    if (!isImageOrFileType) {
      return { paths: [], iconPath: null, tooltipContent: undefined };
    }

    if (isImageType) {
      if (!item.content?.startsWith('files:')) {
        return { paths: [], iconPath: null, tooltipContent: undefined };
      }
      try {
        const filesData = JSON.parse(item.content.substring(6));
        const first = filesData?.files?.[0];
        if (!first || first.exists === false) {
          return { paths: [], iconPath: null, tooltipContent: undefined };
        }
        const actualPath = first.actual_path || first.path;
        if (!actualPath) {
          return { paths: [], iconPath: null, tooltipContent: undefined };
        }
        return {
          paths: [actualPath],
          iconPath: actualPath,
          tooltipContent: t('clipboard.dragImageToExternal', '拖拽到外部应用'),
        };
      } catch {
        return { paths: [], iconPath: null, tooltipContent: undefined };
      }
    }

    if (isFileType) {
      if (!item.content?.startsWith('files:')) {
        return { paths: [], iconPath: null, tooltipContent: undefined };
      }
      try {
        const filesData = JSON.parse(item.content.substring(6));
        const draggablePaths = filesData.files?.filter(f => f.exists !== false).map(f => f.path).filter(Boolean) || [];
        if (!draggablePaths.length) {
          return { paths: [], iconPath: null, tooltipContent: undefined };
        }
        const tooltipContent = draggablePaths.length > 1
          ? t('clipboard.dragFilesToExternal', '拖拽到外部应用（共{{count}}个文件）', { count: draggablePaths.length })
          : t('clipboard.dragFileToExternal', '拖拽到外部应用');
        return {
          paths: draggablePaths,
          iconPath: draggablePaths[0],
          tooltipContent,
        };
      } catch {
        return { paths: [], iconPath: null, tooltipContent: undefined };
      }
    }

    return { paths: [], iconPath: null, tooltipContent: undefined };
  })();

  const externalDragTooltipContent = externalDragInfo.tooltipContent;
  const externalDragPaths = externalDragInfo.paths;
  const externalDragIconPath = externalDragInfo.iconPath;
  const canExternalDrag = externalDragPaths.length > 0;

  const handleExternalDragMouseDown = useDragWithThreshold({
    onDragStart: () => {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      // 外部拖拽时关闭图片预览，避免拖拽过程中占用/闪烁
      if (previewEnabled) {
        closePreviewWindow().catch(() => { });
      }
    }
  });

  // 拖拽开始时关闭预览
  useEffect(() => {
    if (isDragActive && previewEnabled) {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      closePreviewWindow().catch(() => { });
    }
  }, [isDragActive, previewEnabled]);

  useEffect(() => {
    if (!isMultiSelectMode) {
      return;
    }
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    closePreviewWindow().catch(() => { });
    if (isImageOrFileType) {
      setShowDragSideTooltips(false);
    }
  }, [isImageOrFileType, isMultiSelectMode]);

  useEffect(() => {
    setFormatKinds(extractFormatKinds([], item));
    formatKindsLoadedRef.current = false;
  }, [item.id, item.content_type, item.content, item.html_content]);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
    };
  }, []);

  const ensureFormatKindsLoaded = useCallback(() => {
    if (settings.textPreview !== false || formatKindsLoadedRef.current) {
      return;
    }

    const cacheKey = String(item.id);
    if (clipboardFormatKindsCache.has(cacheKey)) {
      setFormatKinds(clipboardFormatKindsCache.get(cacheKey) || []);
      formatKindsLoadedRef.current = true;
      return;
    }

    formatKindsLoadedRef.current = true;
    getClipboardItemPasteOptions(item.id)
      .then((options) => {
        const kinds = extractFormatKinds(options, item);
        clipboardFormatKindsCache.set(cacheKey, kinds);
        setFormatKinds(kinds);
      })
      .catch(() => {
        clipboardFormatKindsCache.set(cacheKey, extractFormatKinds([], item));
      });
  }, [settings.textPreview, item]);

  // 拖拽功能
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: sortId || `clipboard-${index}`,
    disabled: !isDraggable
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms ease',
    opacity: isDragging ? 0 : 1,
    cursor: isDragging ? 'grabbing' : 'pointer',
    zIndex: isDragging ? 1000 : 'auto'
  };

  // 处理点击粘贴
  const handleClick = async (event) => {
    const handledByParent = onClick ? await onClick(item, index, event) : false;
    if (handledByParent) {
      return;
    }
    try {
        await pasteClipboardItem(item.id);
        // 粘贴后置顶
        if (!getOneTimePasteEnabled() && settingsStore.pasteToTop && item.id && !item.is_pinned) {
          try {
            await moveClipboardItemToTop(item.id);
          } finally {
            clipboardStore.items = {};
          }
        }
      } catch (error) {
        console.error('粘贴失败:', error);
        toast.error(t('common.pasteFailed'), {
          size: TOAST_SIZES.EXTRA_SMALL,
          position: TOAST_POSITIONS.BOTTOM_RIGHT
        });
      }
  };

  // 处理鼠标悬停
  const handleMouseEnter = () => {
    if (isDragging || isDragActive || isMultiSelectMode) {
      return;
    }
    ensureFormatKindsLoaded();
    if (isImageOrFileType) {
      setShowDragSideTooltips(true);
    }
    if (onHover) {
      onHover();
    }

    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    // 预览窗口：延迟触发，避免鼠标快速掠过时频繁创建窗口
    if (previewMode && previewEnabled) {
      previewTimerRef.current = setTimeout(() => {
        showPreviewWindow(previewMode, 'clipboard', item.id).catch((error) => {
          console.error('显示图片预览失败:', error);
        });
      }, PREVIEW_HOVER_DELAY_MS);
    } else {
      closePreviewWindow().catch(() => { });
    }
  };

  // 处理鼠标离开
  const handleMouseLeave = useCallback(() => {
    if (isMultiSelectMode) {
      return;
    }
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    closePreviewWindow().catch(() => { });
    if (isImageOrFileType) {
      setShowDragSideTooltips(false);
    }
  }, [isImageOrFileType, isMultiSelectMode]);

  const handlePreviewWheel = useCallback((e) => {
    if (isMultiSelectMode || !e.ctrlKey || !previewMode || !previewEnabled) {
      return;
    }

    const canPreventDefault = Boolean(e?.cancelable ?? e?.nativeEvent?.cancelable);
    if (canPreventDefault) {
      e.preventDefault();
    }
    e.stopPropagation();

    if (e.altKey) {
      emit('preview-window-cycle-format', {
        source: 'clipboard',
        itemId: String(item.id),
        direction: e.deltaY < 0 ? 'prev' : 'next',
      }).catch(() => { });
      return;
    }

    emit('preview-window-scroll', {
      direction: e.deltaY < 0 ? 'up' : 'down',
      mode: previewMode,
      source: 'clipboard',
      itemId: String(item.id),
    }).catch(() => { });
  }, [isMultiSelectMode, previewMode, previewEnabled, item.id]);

  // 处理右键菜单
  const handleContextMenu = async e => {
    if (isMultiSelectMode) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    await showClipboardItemContextMenu(e, item, index);
  };

  // 处理置顶按钮点击
  const handlePinClick = async e => {
    e.stopPropagation();
    try {
      const isPinned = await togglePinClipboardItem(item.id);
      toast.success(isPinned ? t('contextMenu.pinned') : t('contextMenu.unpinned'), {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
      await refreshClipboardHistory();
    } catch (error) {
      console.error('置顶失败:', error);
    }
  };

  // 处理收藏按钮点击
  const handleFavoriteClick = async e => {
    e.stopPropagation();
    try {
      await addClipboardToFavorites(item.id);
      toast.success(t('contextMenu.addedToFavorites'), {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
    } catch (error) {
      console.error('添加到收藏失败:', error);
      toast.error(t('contextMenu.addToFavoritesFailed'), {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
    }
  };

  // 处理编辑按钮点击
  const handleEditClick = async e => {
    e.stopPropagation();
    try {
      await openEditorForClipboard(item, index);
    } catch (error) {
      console.error('编辑失败:', error);
      toast.error(t('common.editFailed'), {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
    }
  };

  // 处理删除按钮点击
  const handleDeleteClick = async e => {
    e.stopPropagation();

    if (previewEnabled) {
      closePreviewWindow().catch(() => { });
    }

    try {
      const {
        deleteClipboardItem
      } = await import('@shared/store/clipboardStore');
      await deleteClipboardItem(item.id);
      toast.success(t('common.deleted'), {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
    } catch (error) {
      console.error('删除失败:', error);
      toast.error(t('common.deleteFailed'), {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
    }
  };

  const getShortcut = () => {
    if (!settings.numberShortcuts) return null;

    if (index >= 9) return null;

    const modifier = settings.numberShortcutsModifier || 'Ctrl';

    if (modifier === 'None') {
      return `${index + 1}`;
    }

    if (modifier === 'F') {
      return `F${index + 1}`;
    }

    if (modifier.endsWith('+F')) {
      return `${modifier}${index + 1}`;
    }

    return `${modifier}+${index + 1}`;
  };
  const isSmallHeight = settings.rowHeight === 'small';
  const formatHintLabels = useMemo(() => formatKindsToLabels(formatKinds, t), [formatKinds, t]);
  const shouldShowFormatHintTooltip = settings.textPreview === false && formatHintLabels.length > 1;
  const formatHintTooltipContent = shouldShowFormatHintTooltip
    ? t('previewWindow.formatsHint', { formats: formatHintLabels.join(' / ') })
    : '';

  const isCardStyle = settings.listStyle === 'card';

  // 键盘选中样式
  const isActiveSelected = isMultiSelectMode ? isMultiSelected : isSelected;
  const baseSurfaceClasses = isBackground ? 'bg-qc-panel' : 'bg-transparent';
  const shouldShowDragOutlineOnly = isImageOrFileType && showDragSideTooltips;
  const selectedClasses = isCardStyle
    ? (
      shouldShowDragOutlineOnly
        ? baseSurfaceClasses
        : isActiveSelected
          ? `${baseSurfaceClasses} ring-2 ring-blue-500 ring-inset`
          : `${baseSurfaceClasses} ring-1 ring-qc-border ring-inset shadow-sm shadow-black/5`
    )
    : (
      shouldShowDragOutlineOnly
        ? baseSurfaceClasses
        : isActiveSelected
          ? `${baseSurfaceClasses} ring-2 ring-blue-500 ring-inset`
          : `${baseSurfaceClasses} border-b border-qc-border`
    );
  const smallElementClasses = `
    flex items-center justify-center
    w-5 h-5
    text-xs font-medium
    border rounded-md
    transition-all
  `.trim().replace(/\s+/g, ' ');

  // 顶部悬停操作按钮样式
  const actionButtonClasses = `
    flex items-center justify-center
    w-5 h-5
    text-xs font-medium
    text-qc-fg-subtle
    transition-colors
    rounded-none
    border-l border-qc-border
    first:border-l-0
    hover:bg-qc-hover
    hover:text-theme-9
  `.trim().replace(/\s+/g, ' ');

  const actionGroupClasses = `
    flex items-center
    overflow-hidden
    rounded-md
    border border-qc-border
    bg-qc-panel/80
    backdrop-blur-md
    shadow-sm
    opacity-0
    group-hover:opacity-100
    focus-within:opacity-100
    transition-opacity
  `.trim().replace(/\s+/g, ' ');

  // 序号样式
  const numberBadgeClasses = `
    ${smallElementClasses}
    text-blue-600
    border-qc-border
    bg-qc-panel/80
    backdrop-blur-md
    font-semibold
    w-auto px-1.5
  `.trim().replace(/\s+/g, ' ');

  const iconBadgeClasses = `
    relative flex items-center justify-center
    w-5 h-5
    rounded-md overflow-hidden
    border border-qc-border
    bg-qc-panel/60
    backdrop-blur-md
  `.trim().replace(/\s+/g, ' ');

  // 快捷键样式
  const shortcutClasses = `
    flex items-center justify-center
    h-5 px-1.5
    text-xs font-medium
    border rounded-md
    transition-all
    text-qc-fg-subtle
    border-qc-border
    bg-qc-panel/80
    backdrop-blur-md
  `.trim().replace(/\s+/g, ' ');

  const animationStyle = animationDelay > 0 ? {
    animation: `slideInLeft 0.2s ease-out ${animationDelay}ms backwards`
  } : {};

  const itemNode = (
    <div
      ref={setNodeRef}
      style={{ ...style, ...animationStyle }}
      {...(isImageOrFileType || !isDraggable ? {} : attributes)}
      {...(isImageOrFileType || !isDraggable ? {} : listeners)}
      data-index={index}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onWheel={handlePreviewWheel}
      className={`clipboard-item group relative flex flex-col ${isMultiSelectMode ? 'pl-9 pr-2.5' : 'px-2.5'} py-2 ${selectedClasses} ${isCardStyle ? 'rounded-md' : ''} ${isDraggable ? 'cursor-move' : 'cursor-pointer'} transition-all ${getHeightClass()}`}
    >
      {isMultiSelectMode && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
          <span className={`flex items-center justify-center w-5 h-5 rounded-md border text-[12px] transition-colors ${
            isMultiSelected
              ? 'border-blue-500 bg-blue-500 text-white'
              : 'border-qc-border bg-qc-panel text-transparent'
          }`}>
            <i className="ti ti-check" style={{ fontSize: 12 }}></i>
          </span>
        </div>
      )}
      {isImageOrFileType && !isMultiSelectMode && isDraggable && (
        <>
          {/* 拖拽分区提示：悬停时仅显示左右虚线分区 */}
          {showDragSideTooltips && (
            <>
              <div
                className={`absolute top-0 left-0 h-full border-2 border-dashed border-amber-400/80 z-[22] pointer-events-none ${isCardStyle ? 'rounded-l-md rounded-r-none' : ''}`}
                style={{
                  right: 'max(90px, 35%)'
                }}
              />
              <div
                className={`absolute top-0 right-0 h-full border-2 border-dashed border-blue-400/80 z-[23] pointer-events-none ${isCardStyle ? 'rounded-r-md rounded-l-none' : ''}`}
                style={{
                  width: 'max(90px, 35%)'
                }}
              />
            </>
          )}

          {/* 左侧：拖拽到外部应用 */}
          {externalDragTooltipContent && (
            <Tooltip
              content={externalDragTooltipContent}
              placement="top"
              asChild
              forceOpen={showDragSideTooltips}
            >
              <div
                className={`absolute top-0 left-0 h-full z-[15] pointer-events-auto ${canExternalDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                style={{
                  right: 'max(90px, 35%)'
                }}
                onMouseDown={canExternalDrag ? (e) => handleExternalDragMouseDown(e, externalDragPaths, externalDragIconPath) : undefined}
              />
            </Tooltip>
          )}

          {/* 右侧：拖拽排序 */}
          <Tooltip content={sortTooltipContent} placement="top" asChild forceOpen={showDragSideTooltips}>
            <div
              className="absolute top-0 right-0 h-full z-[20] cursor-grab active:cursor-grabbing bg-transparent"
              style={{
                width: 'max(90px, 35%)'
              }}
              onMouseDown={(e) => {
                // 避免触发左侧外部拖拽
                e.stopPropagation();
              }}
              {...attributes}
              {...listeners}
            />
          </Tooltip>
        </>
      )}
      {settings.showBadges !== false && (hasFileMissing || item.is_pinned || isPasted) && (
        <Tooltip content={hasFileMissing ? t('clipboard.fileNotFound', '文件不存在') : item.is_pinned ? t('contextMenu.pinned') : t('common.pasted')} placement="right" asChild>
          <div
            className={`absolute top-0 left-0 z-30 overflow-hidden ${isCardStyle ? 'rounded-tl-md' : ''}`}
            style={{ width: 20, height: 20 }}
          >
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 0,
              height: 0,
              borderStyle: 'solid',
              borderWidth: '20px 20px 0 0',
              borderColor: (hasFileMissing ? 'rgba(239,68,68,1)' : isPasted ? 'rgba(255,209,79,1)' : 'rgba(59,130,246,1)') + ' transparent transparent transparent',
            }} />
            {!hasFileMissing && item.is_pinned && isPasted && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 0,
                height: 0,
                borderStyle: 'solid',
                borderWidth: '16px 16px 0 0',
                borderColor: 'rgba(59,130,246,1) transparent transparent transparent',
              }} />
            )}
          </div>
        </Tooltip>
      )}
      {/* 顶部操作区域：操作按钮、快捷键、序号 */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 z-20">
        {/* 悬停操作按钮组 */}
        {!isMultiSelectMode && <div className={actionGroupClasses}>
          <Tooltip content={t('contextMenu.addToFavorites')} placement="bottom">
            <button className={actionButtonClasses} onClick={handleFavoriteClick}>
              <i className="ti ti-star" style={{ fontSize: 12 }}></i>
            </button>
          </Tooltip>
          {(renderType === 'text' || renderType === 'rich_text') && (
            <Tooltip content={t('common.edit')} placement="bottom">
              <button className={actionButtonClasses} onClick={handleEditClick}>
                <i className="ti ti-edit" style={{ fontSize: 12 }}></i>
              </button>
            </Tooltip>
          )}
          <Tooltip content={t('common.delete')} placement="bottom">
            <button className={actionButtonClasses} onClick={handleDeleteClick}>
              <i className="ti ti-trash" style={{ fontSize: 12 }}></i>
            </button>
          </Tooltip>
          <Tooltip content={item.is_pinned ? t('contextMenu.unpin') : t('contextMenu.pin')} placement="bottom">
            <button
              className={`${actionButtonClasses} ${item.is_pinned ? 'text-theme-9 bg-qc-active' : ''}`}
              onClick={handlePinClick}
            >
              <i className={item.is_pinned ? 'ti ti-pinned-filled' : 'ti ti-pin'} style={{ fontSize: 12 }}></i>
            </button>
          </Tooltip>
        </div>}
        {/* 快捷键 */}
        {showShortcut && getShortcut() && (
          <span className={`${shortcutClasses} pointer-events-none`}>
            {getShortcut()}
          </span>
        )}
        {/* 来源图标 */}
        {settings.showSourceIcon !== false && !iconLoadFailed && (sourceIconUrl || isLanSyncRemote) && (
          <Tooltip content={sourceTitle} placement="bottom" asChild>
            <span className={iconBadgeClasses}>
              {sourceIconUrl ? (
                <img
                  src={sourceIconUrl}
                  alt=""
                  className="w-full h-full object-cover pointer-events-none "
                  onError={() => setIconLoadFailed(true)}
                />
              ) : (
                <i className="ti ti-wifi" style={{ fontSize: 12 }}></i>
              )}
              {isLanSyncRemote && (
                <span
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{
                    background: 'transparent'
                  }}
                >
                  <i className="ti ti-wifi" style={{ fontSize: 13, color: 'rgba(59,130,246,1)', lineHeight: 1 }}></i>
                </span>
              )}
            </span>
          </Tooltip>
        )}
        {/* 序号 */}
        <span className={`${numberBadgeClasses} pointer-events-none`}>
          {index + 1}
        </span>
      </div>

      {isSmallHeight ?
        // 小行高模式：显示内容（隐藏时间）
        <div className="flex items-center gap-2 h-full overflow-hidden">
          <div className="flex-1 min-w-0 overflow-hidden h-full">
            {renderContent(true, false, {
              availableHeightPx: 50 - 16,
              disableExternalDrag: isImageOrFileType || isMultiSelectMode,
              disableExternalTooltip: isImageOrFileType || isMultiSelectMode,
            })}
          </div>
        </div> :
        // 中/大/自适应行高模式
        <>
          {/* 时间戳 */}
          <div className="flex items-center flex-shrink-0 mb-0.5 h-5">
            <span className="text-xs text-qc-fg-subtle leading-5">
              {formatTime()}
              {item.char_count != null && (
                <span className="ml-1.5">
                  {item.char_count.toLocaleString()} {t('common.chars', '字符')}
                </span>
              )}
            </span>
          </div>

          {/* 内容区 */}
          <div
            className={`flex-1 min-w-0 w-full overflow-hidden ${settings.rowHeight === 'auto' ? '' : 'h-full'}`}
          >
            {renderContent(false, false, {
              availableHeightPx: (() => {
                if (settings.rowHeight === 'auto') return undefined;
                const rowPx = 90;
                const base = settings.rowHeight === 'large' ? 120 : settings.rowHeight === 'medium' ? 90 : settings.rowHeight === 'small' ? 50 : rowPx;
                return base - 16 - 22;
              })(),
              disableExternalDrag: isImageOrFileType || isMultiSelectMode,
              disableExternalTooltip: isImageOrFileType || isMultiSelectMode,
            })}
          </div>
        </>}
    </div>
  );

  if (shouldShowFormatHintTooltip) {
    return (
      <Tooltip content={formatHintTooltipContent} placement="top" asChild>
        {itemNode}
      </Tooltip>
    );
  }

  return itemNode;
}
export default ClipboardItem;
