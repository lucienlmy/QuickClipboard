import { useRef, useEffect, useCallback, useState } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { pasteClipboardItem, clipboardStore, refreshClipboardHistory } from '@shared/store/clipboardStore';
import { useItemCommon } from '@shared/hooks/useItemCommon.jsx';
import { useSortable, CSS } from '@shared/hooks/useSortable';
import { showClipboardItemContextMenu } from '@shared/utils/contextMenu';
import { getPrimaryType } from '@shared/utils/contentType';
import { useTranslation } from 'react-i18next';
import { addClipboardToFavorites, togglePinClipboardItem } from '@shared/api';
import { openEditorForClipboard } from '@shared/api/textEditor';
import { toast, TOAST_SIZES, TOAST_POSITIONS } from '@shared/store/toastStore';
import { moveClipboardItemToTop } from '@shared/api';
import { getToolState } from '@shared/services/toolActions';
import { useSnapshot } from 'valtio';
import { settingsStore } from '@shared/store/settingsStore';

const closeImagePreview = (previewTimerRef) => {
  if (previewTimerRef.current) {
    clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
  }
  invoke('close_image_preview').catch(() => {});
};

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
  const { theme, systemIsDark } = useSnapshot(settingsStore);
  const isDark = theme === 'dark' || (theme === 'auto' && systemIsDark);
  const isPasted = item.paste_count > 0;
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
  
  const [sourceIconUrl, setSourceIconUrl] = useState(null);
  const [iconLoadFailed, setIconLoadFailed] = useState(false);
  
  useEffect(() => {
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
  }, [item.source_icon_hash]);

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

  // 拖拽开始时关闭预览
  useEffect(() => {
    if (isDragActive && isImageType) {
      closeImagePreview(previewTimerRef);
    }
  }, [isDragActive, isImageType]);

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
          const filePath = filesData?.files?.[0]?.actual_path || filesData?.files?.[0]?.path || null
          await invoke('pin_image_from_file', { filePath, previewMode: true });
        } catch (error) {
          console.error('显示图片预览失败:', error);
        }
      }, 300);
    }
  };
  
  // 处理鼠标离开
  const handleMouseLeave = useCallback(() => {
    if (isImageType) {
      closeImagePreview(previewTimerRef);
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
    
    if (isImageType) {
      closeImagePreview(previewTimerRef);
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

    return `${modifier}+${index + 1}`;
  };
  const isSmallHeight = settings.rowHeight === 'small';



  // 键盘选中样式
  const selectedClasses = isSelected ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-500 dark:border-blue-400 shadow-md ring-2 ring-blue-500 dark:ring-blue-400 ring-opacity-50 border-1.5' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 border-1.5';
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

  const iconBadgeClasses = `
    relative flex items-center justify-center
    w-5 h-5
    rounded-md overflow-hidden
    border border-gray-200 dark:border-gray-600
    bg-white/60 dark:bg-gray-900/60
    backdrop-blur-md
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
      {settings.showBadges !== false && (hasFileMissing || item.is_pinned || isPasted) && (
        <div 
          className="absolute top-0 left-0 z-30 pointer-events-none overflow-hidden rounded-tl-md"
          style={{ width: 20, height: 20 }}
          title={hasFileMissing ? t('clipboard.fileNotFound', '文件不存在') : item.is_pinned ? t('contextMenu.pinned') : t('common.pasted')}
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
      )}
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
        {sourceIconUrl && !iconLoadFailed ? (
          <span className={`${iconBadgeClasses} pointer-events-none`} title={item.source_app || ''}>
            <img 
              src={sourceIconUrl} 
              alt="" 
              className="w-full h-full object-cover"
              onError={() => setIconLoadFailed(true)}
            />
            <span 
              className="absolute inset-0 flex items-center justify-center text-xs font-bold"
              style={{ 
                color: !isDark ? '#fff' : '#000',
                WebkitTextStroke: !isDark ? '2px #000' : '2px #fff',
                paintOrder: 'stroke fill'
              }}
            >
              {index + 1}
            </span>
          </span>
        ) : (
          <span className={`${numberBadgeClasses} pointer-events-none`}>
            {index + 1}
          </span>
        )}
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
          <div className={`flex-1 min-w-0 w-full overflow-hidden ${settings.rowHeight === 'auto' ? '' : 'h-full'}`}>
            {renderContent()}
          </div>
        </>}
    </div>;
}
export default ClipboardItem;