import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { pasteClipboardItem } from '@shared/store/clipboardStore';
import { pasteFavorite } from '@shared/store/favoritesStore';
import { useItemCommon } from '@shared/hooks/useItemCommon.jsx';
import { useSortable, CSS } from '@shared/hooks/useSortable';
import { useSnapshot } from 'valtio';
import { groupsStore } from '@shared/store/groupsStore';
import { showFavoriteItemContextMenu } from '@shared/utils/contextMenu';
import { getPrimaryType } from '@shared/utils/contentType';
import { useTranslation } from 'react-i18next';
import { deleteFavorite } from '@shared/api';
import { openEditorForFavorite } from '@shared/api/textEditor';
import { toast, TOAST_SIZES, TOAST_POSITIONS } from '@shared/store/toastStore';
function FavoriteItem({
  item,
  index,
  isDraggable = true,
  isSelected = false,
  onHover,
  onClick
}) {
  const {
    t
  } = useTranslation();
  const {
    settings,
    getHeightClass,
    contentType,
    formatTime,
    renderContent
  } = useItemCommon(item);
  const isFileType = getPrimaryType(contentType) === 'file';
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
    id: item.id,
    disabled: !isDraggable
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms ease',
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'pointer',
    zIndex: isDragging ? 1000 : 'auto'
  };

  // 点击粘贴
  const handleClick = async () => {
    try {
      await pasteFavorite(item.id);
      toast.success(t('common.pasted'), {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
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
    if (onHover) {
      onHover();
    }
  };

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
    try {
      const result = await deleteFavorite(item.id);
      if (!result?.cancelled) {
        const {
          refreshFavorites
        } = await import('@shared/store/favoritesStore');
        await refreshFavorites();
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

  // 判断是否显示标题（纯文本和富文本显示标题）
  const shouldShowTitle = () => {
    const primaryType = getPrimaryType(contentType);
    return (primaryType === 'text' || primaryType === 'rich_text') && item.title;
  };

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
  return <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={`favorite-item group relative flex flex-col px-2.5 py-2 ${selectedClasses} rounded-md cursor-move transition-all border ${getHeightClass()}`} onClick={handleClick} onContextMenu={handleContextMenu} onMouseEnter={handleMouseEnter}>
    {/* 浮动的序号和分组 */}
    <div className={`absolute top-1 right-2 flex flex-col items-end ${isSmallHeight ? 'gap-0' : 'gap-0.5'} pointer-events-none z-20`}>
      <span className={numberBadgeClasses}>
        {index + 1}
      </span>
      {showGroupBadge && <span
        className={groupBadgeClasses(groupColor)}
        style={groupColor ? {
          backgroundColor: groupColor,
          backgroundImage: `linear-gradient(135deg, ${groupColor}dd, ${groupColor})`
        } : {}}
      >
        {item.group_name}
      </span>}
    </div>

    {/* 操作按钮区域 */}
    <div className="absolute top-1 right-10 flex items-center gap-1 pointer-events-auto z-20">
      {/* 编辑按钮 */}
      {isTextOrRichText && <button className={actionButtonClasses} onClick={handleEditClick} title={t('common.edit')}>
        <i className="ti ti-edit" style={{
          fontSize: 12
        }}></i>
      </button>}

      {/* 删除按钮 */}
      <button className={actionButtonClasses} onClick={handleDeleteClick} title={t('common.delete')}>
        <i className="ti ti-trash" style={{
          fontSize: 12
        }}></i>
      </button>
    </div>

    {isSmallHeight ? <div className="flex items-center gap-2 h-full overflow-hidden">
      <div className="flex-1 min-w-0 overflow-hidden h-full">
        {renderContent(true)}
      </div>
    </div> : <>
      {/* 时间戳 */}
      <div className="flex items-center flex-shrink-0 mb-0.5">
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {formatTime()}
        </span>
      </div>

      {/* 标题 */}
      {shouldShowTitle() && <div className="flex-shrink-0 mb-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate pr-16">
          {item.title}
        </p>
      </div>}

      {/* 内容区域 */}
      <div className={`flex-1 min-w-0 w-full ${isFileType ? 'overflow-auto' : 'overflow-hidden'} ${settings.rowHeight === 'auto' ? '' : 'h-full'}`}>
        {renderContent()}
      </div>
    </>}
  </div>;
}
export default FavoriteItem;