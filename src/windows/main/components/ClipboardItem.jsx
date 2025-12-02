import { useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { pasteClipboardItem, clipboardStore } from '@shared/store/clipboardStore';
import { useItemCommon } from '@shared/hooks/useItemCommon.jsx';
import { useSortable, CSS } from '@shared/hooks/useSortable';
import { showClipboardItemContextMenu } from '@shared/utils/contextMenu';
import { getPrimaryType } from '@shared/utils/contentType';
import { useTranslation } from 'react-i18next';
import { addClipboardToFavorites, togglePinClipboardItem } from '@shared/api';
import { refreshClipboardHistory } from '@shared/store/clipboardStore';
import { openEditorForClipboard } from '@shared/api/textEditor';
import { toast, TOAST_SIZES, TOAST_POSITIONS } from '@shared/store/toastStore';
import { moveClipboardItemToTop } from '@shared/api';
import { getToolState } from '@shared/services/toolActions';

function ClipboardItem({
  item,
  index,
  onClick,
  sortId,
  isSelected = false,
  onHover,
  isDragActive = false
}) {
  const {
    t
  } = useTranslation();
  const {
    settings,
    getHeightClass,
    getLineClampClass,
    contentType,
    formatTime,
    renderContent
  } = useItemCommon(item);
  const isFileType = getPrimaryType(contentType) === 'file';
  const isImageType = getPrimaryType(contentType) === 'image';
  const previewTimerRef = useRef(null);

  // 拖拽功能
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: sortId || `clipboard-${index}`
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms ease',
    opacity: isDragging ? 0 : 1,
    cursor: isDragging ? 'grabbing' : 'pointer',
    zIndex: isDragging ? 1000 : 'auto'
  };

  // 处理点击粘贴
  const handleClick = async () => {
    if (onClick) {
      onClick(item, index);
    } else {
      try {
        await pasteClipboardItem(item.id);
        toast.success(t('common.pasted'), {
          size: TOAST_SIZES.EXTRA_SMALL,
          position: TOAST_POSITIONS.BOTTOM_RIGHT
        });
        // 粘贴后置顶
        const oneTimeEnabled = getToolState('one-time-paste-button');
        if (settings.pasteToTop && !oneTimeEnabled && item.id && !item.is_pinned) {
          try {
            await moveClipboardItemToTop(item.id);
          } finally {
            clipboardStore.items = new Map();
          }
        }
      } catch (error) {
        console.error('粘贴失败:', error);
        toast.error(t('common.pasteFailed'), {
          size: TOAST_SIZES.EXTRA_SMALL,
          position: TOAST_POSITIONS.BOTTOM_RIGHT
        });
      }
    }
  };

  // 处理鼠标悬停
  const handleMouseEnter = async (e) => {
    if (isDragging || isDragActive) {
      return;
    }
    if (onHover) {
      onHover();
    }

    // 图片类型：延迟显示预览
    if (isImageType && settings.imagePreview !== false) {
      previewTimerRef.current = setTimeout(async () => {
        try {
          const filesData = JSON.parse(item.content.substring(6))
          const filePath = filesData?.files?.[0]?.path || null
          await invoke('pin_image_from_file', { filePath, previewMode: true });
        } catch (error) {
          console.error('显示图片预览失败:', error);
        }
      }, 300);
    }
  };
  
  // 处理鼠标离开
  const handleMouseLeave = useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    
    // 关闭预览窗口
    if (isImageType) {
      invoke('close_image_preview').catch(() => {});
    }
  }, [isImageType]);

  // 处理右键菜单
  const handleContextMenu = async e => {
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

    return `${modifier}+${index + 1}`;
  };
  const isSmallHeight = settings.rowHeight === 'small';

  // 自适应行高禁用内容滚轮滚动
  const contentRef = useRef(null);
  useEffect(() => {
    const el = contentRef.current;
    if (settings.rowHeight === 'auto' && el) {
      const handleWheel = (e) => {
        e.preventDefault();
        let parent = el.parentElement;
        while (parent) {
          const style = getComputedStyle(parent);
          const isScrollable = parent.scrollHeight > parent.clientHeight &&
            style.overflowY !== 'hidden' && style.overflowY !== 'visible';
          if (isScrollable) {
            parent.scrollTop += e.deltaY;
            break;
          }
          parent = parent.parentElement;
        }
      };
      el.addEventListener('wheel', handleWheel, { passive: false });
      return () => el.removeEventListener('wheel', handleWheel);
    }
  }, [settings.rowHeight]);

  // 键盘选中样式
  const selectedClasses = isSelected ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-500 dark:border-blue-400 shadow-md ring-2 ring-blue-500 dark:ring-blue-400 ring-opacity-50' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700';
  const smallElementClasses = `
    flex items-center justify-center
    w-5 h-5
    text-xs font-medium
    border rounded-md
    transition-all
  `.trim().replace(/\s+/g, ' ');

  // 按钮样式
  const actionButtonClasses = `
    ${smallElementClasses}
    text-gray-500 dark:text-gray-400
    border-gray-200 dark:border-gray-600
    bg-white/60 dark:bg-gray-900/60
    backdrop-blur-md
    hover:text-blue-600 dark:hover:text-blue-400
    hover:border-blue-300 dark:hover:border-blue-700
    hover:bg-blue-50/80 dark:hover:bg-blue-900/40
    opacity-0 group-hover:opacity-100
    focus:opacity-100
  `.trim().replace(/\s+/g, ' ');

  // 序号样式
  const numberBadgeClasses = `
    ${smallElementClasses}
    text-blue-600 dark:text-blue-400
    border-blue-200 dark:border-blue-700
    bg-blue-50/80 dark:bg-blue-900/40
    backdrop-blur-md
    font-semibold
  `.trim().replace(/\s+/g, ' ');

  // 快捷键样式
  const shortcutClasses = `
    flex items-center justify-center
    h-5 px-1.5
    text-xs font-medium
    border rounded-md
    transition-all
    text-gray-500 dark:text-gray-400
    border-gray-200 dark:border-gray-600
    bg-gray-100/80 dark:bg-gray-800/80
    backdrop-blur-md
  `.trim().replace(/\s+/g, ' ');
  return <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={handleClick} onContextMenu={handleContextMenu} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} className={`clipboard-item group relative flex flex-col px-2.5 py-2 ${selectedClasses} rounded-md cursor-move transition-all border hover:translate-y-[-3px] ${getHeightClass()}`}>
      {/* 顶部操作区域：操作按钮、快捷键、序号 */}
      <div className="absolute top-1 right-2 flex items-center gap-1 z-20">
        {/* 收藏按钮 */}
        <button className={actionButtonClasses} onClick={handleFavoriteClick} title={t('contextMenu.addToFavorites')}>
          <i className="ti ti-star" style={{ fontSize: 12 }}></i>
        </button>
        {/* 编辑按钮 */}
        {(getPrimaryType(contentType) === 'text' || getPrimaryType(contentType) === 'rich_text') && <button className={actionButtonClasses} onClick={handleEditClick} title={t('common.edit')}>
            <i className="ti ti-edit" style={{ fontSize: 12 }}></i>
          </button>}
        {/* 删除按钮 */}
        <button className={actionButtonClasses} onClick={handleDeleteClick} title={t('common.delete')}>
          <i className="ti ti-trash" style={{ fontSize: 12 }}></i>
        </button>
        {/* 置顶按钮 */}
        <button className={`${actionButtonClasses} ${item.is_pinned ? '!opacity-100 !text-blue-500 dark:!text-blue-400' : ''}`} onClick={handlePinClick} title={item.is_pinned ? t('contextMenu.unpin') : t('contextMenu.pin')}>
          <i className={item.is_pinned ? 'ti ti-pinned-filled' : 'ti ti-pin'} style={{ fontSize: 12 }}></i>
        </button>
        {/* 快捷键 */}
        {getShortcut() && <span className={`${shortcutClasses} pointer-events-none`}>
            {getShortcut()}
          </span>}
        {/* 序号 */}
        <span className={`${numberBadgeClasses} pointer-events-none`}>
          {index + 1}
        </span>
      </div>

      {isSmallHeight ?
    // 小行高模式：显示内容（隐藏时间）
    <div className="flex items-center gap-2 h-full overflow-hidden">
          <div className="flex-1 min-w-0 overflow-hidden h-full">
            {renderContent(true)}
          </div>
        </div> :
    // 中/大/自适应行高模式
    <>
          {/* 时间戳 */}
          <div className="flex items-center flex-shrink-0 mb-0.5">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatTime()}
            </span>
          </div>

          {/* 内容区 */}
          <div ref={contentRef} className={`flex-1 min-w-0 w-full ${settings.rowHeight === 'auto' ? 'overflow-auto' : 'overflow-hidden'} ${settings.rowHeight === 'auto' ? '' : 'h-full'}`}>
            {renderContent()}
          </div>
        </>}
    </div>;
}
export default ClipboardItem;