import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { pasteFavorite, refreshFavorites } from '@shared/store/favoritesStore';
import { ROW_HEIGHT_CONFIG, useItemCommon } from '@shared/hooks/useItemCommon.jsx';
import { useSortable, CSS } from '@shared/hooks/useSortable';
import { useDragWithThreshold } from '@shared/hooks/useDragWithThreshold';
import { focusWindowImmediately, restoreFocus } from '@shared/hooks/useInputFocus';
import { useSnapshot } from 'valtio';
import { groupsStore } from '@shared/store/groupsStore';
import { showFavoriteItemContextMenu } from '@shared/utils/contextMenu';
import { getPrimaryType } from '@shared/utils/contentType';
import { useTranslation } from 'react-i18next';
import { deleteFavorite } from '@shared/store/favoritesStore';
import { openEditorForFavorite } from '@shared/api/textEditor';
import { updateFavorite, showPreviewWindow, closePreviewWindow } from '@shared/api';
import { toast, TOAST_SIZES, TOAST_POSITIONS } from '@shared/store/toastStore';
import { highlightText } from '@shared/utils/highlightText';
import { useTheme } from '@shared/hooks/useTheme';
import Tooltip from '@shared/components/common/Tooltip.jsx';
import { getFavoriteItemPasteOptions } from '@shared/api/favorites';
import { extractFormatKinds, formatKindsToLabels } from '@shared/utils/pasteFormatHints';
import {
  DISPLAY_FORMAT_HTML,
  DISPLAY_FORMAT_IMAGE,
  resolveDisplayFormatByPriority,
} from '@shared/utils/displayFormatPriority';
import {
  PREVIEW_MODE_TEXT,
  PREVIEW_MODE_HTML,
  PREVIEW_MODE_IMAGE,
  PREVIEW_MODE_FILE,
} from '@shared/utils/pasteFormatHints';

const PREVIEW_HOVER_DELAY_MS = 120;
const favoriteFormatKindsCache = new Map();

const getItemPreviewMode = (item, type, displayPriorityOrder) => {
  const primaryType = getPrimaryType(type || item?.content_type);
  if (primaryType === 'image') return PREVIEW_MODE_IMAGE;
  if (primaryType === 'file') return PREVIEW_MODE_FILE;

  if (primaryType === 'text' || primaryType === 'rich_text' || primaryType === 'link') {
    const displayFormat = resolveDisplayFormatByPriority(item, displayPriorityOrder);
    if (displayFormat === DISPLAY_FORMAT_IMAGE) return PREVIEW_MODE_IMAGE;
    if (displayFormat === DISPLAY_FORMAT_HTML) return PREVIEW_MODE_HTML;
    return PREVIEW_MODE_TEXT;
  }

  return null;
};

function FavoriteItem({
  item,
  index,
  sortId,
  isDraggable = true,
  isSelected = false,
  isMultiSelected = false,
  isMultiSelectMode = false,
  onHover,
  onClick,
  isDragActive = false,
  animationDelay = 0
}) {
  const {
    t
  } = useTranslation();
  const {
    settings,
    getHeightClass,
    renderType,
    formatTime,
    renderContent,
    searchKeyword
  } = useItemCommon(item, { isFavorite: true });
  const { isBackground } = useTheme();
  const isFileType = renderType === 'file';
  const isImageType = renderType === 'image';
  const isImageOrFileType = isFileType || isImageType;
  const previewMode = getItemPreviewMode(item, renderType, settings.displayPriorityOrder);
  const previewEnabled = (() => {
    if (previewMode === PREVIEW_MODE_IMAGE) {
      return settings.imagePreview !== false;
    }
    if (previewMode === PREVIEW_MODE_FILE) {
      return settings.filePreview !== false;
    }
    if (previewMode === PREVIEW_MODE_TEXT || previewMode === PREVIEW_MODE_HTML) {
      return settings.textPreview !== false;
    }
    return false;
  })();
  const sortTooltipContent = t('clipboard.dragSortOnlyRight', '拖拽排序');
  const [showDragSideTooltips, setShowDragSideTooltips] = useState(false);
  const [formatKinds, setFormatKinds] = useState(() => extractFormatKinds([], item));
  const formatKindsLoadedRef = useRef(false);
  const previewTimerRef = useRef(null);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
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
  const dragZoneHalfWidth = '50%';

  const handleExternalDragMouseDown = useDragWithThreshold({
    onDragStart: () => {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      if (previewEnabled) {
        closePreviewWindow().catch(() => { });
      }
    }
  });

  const isPasted = item.paste_count > 0;

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
    if (favoriteFormatKindsCache.has(cacheKey)) {
      setFormatKinds(favoriteFormatKindsCache.get(cacheKey) || []);
      formatKindsLoadedRef.current = true;
      return;
    }

    formatKindsLoadedRef.current = true;
    getFavoriteItemPasteOptions(item.id)
      .then((options) => {
        const kinds = extractFormatKinds(options, item);
        favoriteFormatKindsCache.set(cacheKey, kinds);
        setFormatKinds(kinds);
      })
      .catch(() => {
        favoriteFormatKindsCache.set(cacheKey, extractFormatKinds([], item));
      });
  }, [settings.textPreview, item]);

  const groups = useSnapshot(groupsStore);
  const showGroupBadge = groups.currentGroup === '全部' && item.group_name && item.group_name !== '全部';

  const getGroupColor = (groupName) => {
    const group = groups.groups.find(g => g.name === groupName);
    return group?.color || '#dc2626';
  };

  const groupColor = showGroupBadge ? getGroupColor(item.group_name) : null;

  // 拖拽功能
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: sortId,
    disabled: !isDraggable
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms ease',
    opacity: isDragging ? 0 : 1,
    cursor: isDragging ? 'grabbing' : 'pointer',
    zIndex: isDragging ? 1000 : 'auto'
  };

  // 点击粘贴
  const handleClick = async (event) => {
    const handledByParent = onClick ? await onClick(item, index, event) : false;
    if (handledByParent) {
      return;
    }
    try {
      await pasteFavorite(item.id);
    } catch (err) {
      console.error('粘贴收藏项失败:', err);
      toast.error(t('common.pasteFailed'), {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
    }
  };

  // 处理鼠标悬停
  const handleMouseEnter = () => {
    if (isDragActive || isDragging || isMultiSelectMode) {
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
        showPreviewWindow(previewMode, 'favorite', item.id).catch((error) => {
          console.error('显示预览失败:', error);
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
        source: 'favorite',
        itemId: String(item.id),
        direction: e.deltaY < 0 ? 'prev' : 'next',
      }).catch(() => { });
      return;
    }

    emit('preview-window-scroll', {
      direction: e.deltaY < 0 ? 'up' : 'down',
      mode: previewMode,
      source: 'favorite',
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
    await showFavoriteItemContextMenu(e, item, index);
  };

  // 处理编辑按钮点击
  const handleEditClick = async e => {
    e.stopPropagation();
    try {
      await openEditorForFavorite(item, index);
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
      const confirmedAndDeleted = await deleteFavorite(item.id);
      if (confirmedAndDeleted) {
        toast.success(t('common.deleted'), {
          size: TOAST_SIZES.EXTRA_SMALL,
          position: TOAST_POSITIONS.BOTTOM_RIGHT
        });
      }
    } catch (error) {
      console.error('删除失败:', error);
      toast.error(t('common.deleteFailed'), {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
    }
  };

  // 判断是否显示标题（只要有非空标题就显示）
  const shouldShowTitle = () => {
    return item.title && item.title.trim();
  };

  // 处理标题编辑（文件和图片类型）
  const handleTitleEditClick = (e) => {
    e.stopPropagation();
    setEditingTitle(item.title || '');
    setIsEditingTitle(true);
  };

  const handleTitleSave = async () => {
    const newTitle = editingTitle.trim();
    if (newTitle !== (item.title || '').trim()) {
      try {
        await updateFavorite(item.id, newTitle, item.content, item.group_name);
        await refreshFavorites();
        toast.success(t('common.saved'), {
          size: TOAST_SIZES.EXTRA_SMALL,
          position: TOAST_POSITIONS.BOTTOM_RIGHT
        });
      } catch (error) {
        console.error('保存标题失败:', error);
        toast.error(t('common.saveFailed'), {
          size: TOAST_SIZES.EXTRA_SMALL,
          position: TOAST_POSITIONS.BOTTOM_RIGHT
        });
      }
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
    }
  };

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

  // 分组标签样式
  const groupBadgeClasses = (color) => `
    flex items-center justify-center
    h-5 px-1.5
    text-xs font-medium
    border rounded-md
    transition-all
    backdrop-blur-md
    ${color ? 'text-white border-white/20 shadow-sm' : 'text-qc-fg-muted border-qc-border bg-qc-panel/80'}
  `.trim().replace(/\s+/g, ' ');
  const isCompactHeight = settings.rowHeight === 'small' || settings.rowHeight === 'xsmall';
  const isXSmallHeight = settings.rowHeight === 'xsmall';
  const compactRowHeightPx = (ROW_HEIGHT_CONFIG[settings.rowHeight] || ROW_HEIGHT_CONFIG.medium).px;
  const floatingControlsClasses = isXSmallHeight
    ? 'absolute top-1/2 right-2 -translate-y-1/2 flex items-center gap-1.5 z-20'
    : 'absolute top-2 right-2 flex items-center gap-1.5 z-20';
  const formatHintLabels = useMemo(() => formatKindsToLabels(formatKinds, t), [formatKinds, t]);
  const shouldShowFormatHintTooltip = settings.textPreview === false && formatHintLabels.length > 1;
  const formatHintTooltipContent = shouldShowFormatHintTooltip
    ? t('previewWindow.formatsHint', { formats: formatHintLabels.join(' / ') })
    : '';


  const isTextOrRichText = renderType === 'text' || renderType === 'rich_text';

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
      className={`favorite-item group relative flex flex-col ${isMultiSelectMode ? 'pl-9 pr-2.5' : 'px-2.5'} py-2 ${selectedClasses} ${isCardStyle ? 'rounded-md' : ''} ${isDraggable ? 'cursor-move' : 'cursor-pointer'} transition-all ${getHeightClass()}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onWheel={handlePreviewWheel}
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
                className={`absolute top-0 left-0 h-full border-2 border-dashed border-r-0 border-amber-400/70 z-[22] pointer-events-none ${isCardStyle ? 'rounded-l-md rounded-r-none' : ''}`}
                style={{
                  width: dragZoneHalfWidth
                }}
              />
              <div
                className={`absolute top-0 right-0 h-full border-2 border-dashed border-l-0 border-blue-400/70 z-[23] pointer-events-none ${isCardStyle ? 'rounded-r-md rounded-l-none' : ''}`}
                style={{
                  width: dragZoneHalfWidth
                }}
              />
              <div
                className="absolute top-1 bottom-1 left-1/2 -translate-x-1/2 border-l border-dashed border-qc-border/50 z-[24] pointer-events-none"
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
                  width: dragZoneHalfWidth
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
                width: dragZoneHalfWidth
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              {...attributes}
              {...listeners}
            />
          </Tooltip>
        </>
      )}
      {settings.showBadges !== false && (hasFileMissing || isPasted) && (
        <Tooltip content={hasFileMissing ? t('clipboard.fileNotFound', '文件不存在') : t('common.pasted')} placement="right" asChild>
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
              borderColor: (hasFileMissing ? 'rgba(239,68,68,1)' : 'rgba(255,209,79,1)') + ' transparent transparent transparent',
            }} />
          </div>
        </Tooltip>
      )}
      {/* 顶部操作区域：操作按钮、分组、序号 */}
      <div className={floatingControlsClasses}>
        {/* 悬停操作按钮组 */}
        {!isMultiSelectMode && <div className={actionGroupClasses}>
          {/* 编辑按钮 */}
          {isTextOrRichText ? (
            <Tooltip content={t('common.edit')} placement="bottom" asChild>
              <button className={actionButtonClasses} onClick={handleEditClick}>
                <i className="ti ti-edit" style={{ fontSize: 12 }}></i>
              </button>
            </Tooltip>
          ) : (
            <Tooltip content={t('favorites.editTitle', '编辑标题')} placement="bottom" asChild>
              <button className={actionButtonClasses} onClick={handleTitleEditClick}>
                <i className="ti ti-tag" style={{ fontSize: 12 }}></i>
              </button>
            </Tooltip>
          )}
          {/* 删除按钮 */}
          <Tooltip content={t('common.delete')} placement="bottom" asChild>
            <button className={actionButtonClasses} onClick={handleDeleteClick}>
              <i className="ti ti-trash" style={{ fontSize: 12 }}></i>
            </button>
          </Tooltip>
        </div>}
        {/* 分组标签 */}
        {showGroupBadge && (
          <Tooltip content={item.group_name} placement="bottom" asChild>
            <span
              className={`${groupBadgeClasses(groupColor)}`}
              style={groupColor ? {
                backgroundColor: groupColor,
                backgroundImage: `linear-gradient(135deg, ${groupColor}dd, ${groupColor})`
              } : {}}
            >
              {item.group_name.length > 6 ? item.group_name.substring(0, 6) + '...' : item.group_name}
            </span>
          </Tooltip>
        )}
        {/* 序号 */}
        <span className={`${numberBadgeClasses} pointer-events-none`}>
          {index + 1}
        </span>
      </div>

      {isCompactHeight ? <div className="flex items-center gap-2 h-full overflow-hidden">
        {isEditingTitle ? (
          <input
            type="text"
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            onFocus={focusWindowImmediately}
            onBlur={(e) => {
              restoreFocus();
              handleTitleSave();
            }}
            onKeyDown={handleTitleKeyDown}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="flex-1 min-w-0 text-sm text-qc-fg bg-qc-panel border border-blue-400 rounded px-1.5 outline-none focus:ring-1 focus:ring-blue-400"
            placeholder={t('favorites.titlePlaceholder', '输入标题...')}
          />
        ) : (
          <div className="flex-1 min-w-0 overflow-hidden h-full">
            {renderContent(true, false, {
              availableHeightPx: Math.max(compactRowHeightPx - 16, 16),
              disableExternalDrag: isImageOrFileType || isMultiSelectMode,
              disableExternalTooltip: isImageOrFileType || isMultiSelectMode,
            })}
          </div>
        )}
      </div> : <>
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

        {/* 标题 */}
        {isEditingTitle ? (
          <div className="flex-shrink-0 mb-0.5 pr-16">
            <input
              type="text"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onFocus={focusWindowImmediately}
              onBlur={(e) => {
                restoreFocus();
                handleTitleSave();
              }}
              onKeyDown={handleTitleKeyDown}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              className="w-full text-sm font-semibold text-qc-fg bg-qc-panel border border-blue-400 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-blue-400"
              placeholder={t('favorites.titlePlaceholder', '输入标题...')}
            />
          </div>
        ) : shouldShowTitle() && (
          <div className="flex-shrink-0 mb-0">
            <p className="text-sm font-semibold text-qc-fg truncate pr-16 leading-tight">
              {searchKeyword ? highlightText(item.title, searchKeyword) : item.title}
            </p>
          </div>
        )}

        {/* 内容区域 */}
        <div className={`flex-1 min-w-0 w-full overflow-hidden ${settings.rowHeight === 'auto' ? '' : 'h-full'}`}>
          {renderContent(false, shouldShowTitle(), {
            availableHeightPx: (() => {
              if (settings.rowHeight === 'auto') return undefined;
              const base = settings.rowHeight === 'large' ? 120 : settings.rowHeight === 'medium' ? 90 : settings.rowHeight === 'small' ? 50 : settings.rowHeight === 'xsmall' ? 34 : 90;
              const timeCost = 22;
              const titleCost = shouldShowTitle() ? 20 : 0;
              return base - 16 - timeCost - titleCost;
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
export default FavoriteItem;
