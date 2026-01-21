import { useRef, useEffect, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { pasteFavorite, refreshFavorites } from '@shared/store/favoritesStore';
import { useItemCommon } from '@shared/hooks/useItemCommon.jsx';
import { useTextPreview } from '@shared/hooks/useTextPreview';
import { useSortable, CSS } from '@shared/hooks/useSortable';
import { focusWindowImmediately, restoreFocus } from '@shared/hooks/useInputFocus';
import { useSnapshot } from 'valtio';
import { groupsStore } from '@shared/store/groupsStore';
import { showFavoriteItemContextMenu } from '@shared/utils/contextMenu';
import { getPrimaryType } from '@shared/utils/contentType';
import { useTranslation } from 'react-i18next';
import { deleteFavorite } from '@shared/store/favoritesStore';
import { openEditorForFavorite } from '@shared/api/textEditor';
import { updateFavorite } from '@shared/api';
import { toast, TOAST_SIZES, TOAST_POSITIONS } from '@shared/store/toastStore';
import { highlightText } from '@shared/utils/highlightText';

const closeImagePreview = (previewTimerRef) => {
  if (previewTimerRef.current) {
    clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
  }
  invoke('close_native_image_preview').catch(() => {});
  invoke('close_image_preview').catch(() => {});
};

function FavoriteItem({
  item,
  index,
  sortId,
  isDraggable = true,
  isSelected = false,
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
    contentType,
    formatTime,
    renderContent,
    searchKeyword
  } = useItemCommon(item, { isFavorite: true });
  const isFileType = getPrimaryType(contentType) === 'file';
  const isImageType = getPrimaryType(contentType) === 'image';
  const previewTimerRef = useRef(null);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const { previewTitle, loadPreview, clearPreview } = useTextPreview(
    item, 
    contentType, 
    formatTime, 
    t, 
    true,
    settings.textPreview !== false
  );

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

  const isPasted = item.paste_count > 0;

  // 拖拽开始时关闭预览
  useEffect(() => {
    if (isDragActive && isImageType) {
      closeImagePreview(previewTimerRef);
    }
  }, [isDragActive, isImageType]);

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
  const handleClick = async () => {
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
  const handleMouseEnter = async () => {
    if (isDragActive || isDragging) {
      return;
    }
    if (onHover) {
      onHover();
    }
    
    // 图片类型：延迟显示预览
    if (isImageType && settings.imagePreview !== false) {
      previewTimerRef.current = setTimeout(async () => {
        try {
          const filesData = JSON.parse(item.content.substring(6));
          const filePath = filesData?.files?.[0]?.actual_path || filesData?.files?.[0]?.path || null;
          try {
            await invoke('show_native_image_preview', { filePath });
          } catch (nativeError) {
            if (nativeError?.toString?.()?.includes('not found') || nativeError?.toString?.()?.includes('Command')) {
              await invoke('pin_image_from_file', { filePath, previewMode: true });
            } else {
              throw nativeError;
            }
          }
        } catch (error) {
          console.error('显示图片预览失败:', error);
        }
      }, 300);
    }
    await loadPreview();
  };
  
  // 处理鼠标离开
  const handleMouseLeave = useCallback(() => {
    if (isImageType) {
      closeImagePreview(previewTimerRef);
    }
    clearPreview();
  }, [isImageType, clearPreview]);

  // 处理右键菜单
  const handleContextMenu = async e => {
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
    
    if (isImageType) {
      closeImagePreview(previewTimerRef);
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
  const selectedClasses = isCardStyle
    ? (isSelected 
        ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-500 dark:border-blue-400 shadow-md ring-2 ring-blue-500 dark:ring-blue-400 ring-opacity-50 border' 
        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 border')
    : (isSelected 
        ? 'bg-blue-100 dark:bg-blue-900/40 border-b border-gray-200 dark:border-gray-700' 
        : 'bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700');
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
    hover:text-amber-600 dark:hover:text-amber-400
    hover:border-amber-300 dark:hover:border-amber-700
    hover:bg-amber-50/80 dark:hover:bg-amber-900/40
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

  // 分组标签样式
  const groupBadgeClasses = (color) => `
    flex items-center justify-center
    h-5 px-1.5
    text-xs font-medium
    border rounded-md
    transition-all
    backdrop-blur-md
    ${color ? 'text-white border-white/20 shadow-sm' : 'text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600 bg-gray-100/80 dark:bg-gray-700/80'}
  `.trim().replace(/\s+/g, ' ');
  const isSmallHeight = settings.rowHeight === 'small';


  const isTextOrRichText = getPrimaryType(contentType) === 'text' || getPrimaryType(contentType) === 'rich_text';

  const animationStyle = animationDelay > 0 ? {
    animation: `slideInLeft 0.2s ease-out ${animationDelay}ms backwards`
  } : {};

  return <div ref={setNodeRef} style={{...style, ...animationStyle}} {...attributes} {...listeners} className={`favorite-item group relative flex flex-col px-2.5 py-2 ${selectedClasses} ${isCardStyle ? 'rounded-md' : ''} cursor-move transition-all ${settings.uiAnimationEnabled !== false ? 'hover:translate-y-[-3px]' : ''} ${getHeightClass()}`} onClick={handleClick} onContextMenu={handleContextMenu} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} title={previewTitle || undefined}>
    {settings.showBadges !== false && (hasFileMissing || isPasted) && (
      <div 
        className={`absolute top-0 left-0 z-30 pointer-events-none overflow-hidden ${isCardStyle ? 'rounded-tl-md' : ''}`}
        style={{ width: 20, height: 20 }}
        title={hasFileMissing ? t('clipboard.fileNotFound', '文件不存在') : t('common.pasted')}
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
    )}
    {/* 顶部操作区域：操作按钮、分组、序号 */}
    <div className="absolute top-2 right-2 flex items-center gap-1 z-20">
      {/* 编辑按钮（文本/富文本用编辑器，文件/图片用标题编辑） */}
      {isTextOrRichText ? (
        <button className={actionButtonClasses} onClick={handleEditClick} title={t('common.edit')}>
          <i className="ti ti-edit" style={{ fontSize: 12 }}></i>
        </button>
      ) : (
        <button className={actionButtonClasses} onClick={handleTitleEditClick} title={t('favorites.editTitle', '编辑标题')}>
          <i className="ti ti-tag" style={{ fontSize: 12 }}></i>
        </button>
      )}
      {/* 删除按钮 */}
      <button className={actionButtonClasses} onClick={handleDeleteClick} title={t('common.delete')}>
        <i className="ti ti-trash" style={{ fontSize: 12 }}></i>
      </button>
      {/* 分组标签 */}
      {showGroupBadge && <span
        className={`${groupBadgeClasses(groupColor)} pointer-events-none`}
        style={groupColor ? {
          backgroundColor: groupColor,
          backgroundImage: `linear-gradient(135deg, ${groupColor}dd, ${groupColor})`
        } : {}}
        title={item.group_name}
      >
        {item.group_name.length > 6 ? item.group_name.substring(0, 6) + '...' : item.group_name}
      </span>}
      {/* 序号 */}
      <span className={`${numberBadgeClasses} pointer-events-none`}>
        {index + 1}
      </span>
    </div>

    {isSmallHeight ? <div className="flex items-center gap-2 h-full overflow-hidden">
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
          className="flex-1 min-w-0 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border border-blue-400 dark:border-blue-500 rounded px-1.5 outline-none focus:ring-1 focus:ring-blue-400"
          placeholder={t('favorites.titlePlaceholder', '输入标题...')}
        />
      ) : (
        <div className="flex-1 min-w-0 overflow-hidden h-full">
          {renderContent(true)}
        </div>
      )}
    </div> : <>
      {/* 时间戳 */}
      <div className="flex items-center flex-shrink-0 mb-0.5 h-5">
        <span className="text-xs text-gray-400 dark:text-gray-500 leading-5">
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
            className="w-full text-sm font-semibold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border border-blue-400 dark:border-blue-500 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-blue-400"
            placeholder={t('favorites.titlePlaceholder', '输入标题...')}
          />
        </div>
      ) : shouldShowTitle() && (
        <div className="flex-shrink-0 mb-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate pr-16 leading-tight">
            {searchKeyword ? highlightText(item.title, searchKeyword) : item.title}
          </p>
        </div>
      )}

      {/* 内容区域 */}
      <div className={`flex-1 min-w-0 w-full overflow-hidden ${settings.rowHeight === 'auto' ? '' : 'h-full'}`}>
        {renderContent(false, shouldShowTitle())}
      </div>
    </>}
  </div>;
}
export default FavoriteItem;