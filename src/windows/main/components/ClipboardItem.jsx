import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { pasteClipboardItem, clipboardStore } from '@shared/store/clipboardStore';
import { useItemCommon } from '@shared/hooks/useItemCommon.jsx';
import { useSortable, CSS } from '@shared/hooks/useSortable';
import { showClipboardItemContextMenu } from '@shared/utils/contextMenu';
import { getPrimaryType } from '@shared/utils/contentType';
import { useTranslation } from 'react-i18next';
import { addClipboardToFavorites } from '@shared/api';
import { openEditorForClipboard } from '@shared/api/textEditor';
import { toast, TOAST_SIZES, TOAST_POSITIONS } from '@shared/store/toastStore';
import { moveClipboardItem } from '@shared/api';
import { getToolState } from '@shared/services/toolActions';

function ClipboardItem({
  item,
  index,
  onClick,
  sortId,
  isSelected = false,
  onHover
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
    opacity: isDragging ? 0.5 : 1,
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
        if (settings.pasteToTop && !oneTimeEnabled && typeof index === 'number' && index > 0) {
          try {
            await moveClipboardItem(index, 0);
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
  const handleMouseEnter = () => {
    if (onHover) {
      onHover();
    }
  };

  // 处理右键菜单
  const handleContextMenu = async e => {
    e.preventDefault();
    e.stopPropagation();
    await showClipboardItemContextMenu(e, item, index);
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

  // 快捷键提示
  const getShortcut = () => {
    if (index < 9) {
      return `Ctrl+${index + 1}`;
    }
    return null;
  };
  const isSmallHeight = settings.rowHeight === 'small';

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
  return <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={handleClick} onContextMenu={handleContextMenu} onMouseEnter={handleMouseEnter} className={`clipboard-item group relative flex flex-col px-2.5 py-2 ${selectedClasses} rounded-md cursor-move transition-all border ${getHeightClass()}`}>
      {/* 悬浮序号和快捷键提示 */}
      <div className="absolute top-1 right-2 flex flex-col items-end gap-0 pointer-events-none  z-20">
        {/* 序号 */}
        <span className={numberBadgeClasses}>
          {index + 1}
        </span>
        {/* 快捷键 */}
        {getShortcut() && <span className={shortcutClasses}>
            {getShortcut()}
          </span>}
      </div>

      {/* 操作按钮区域 */}
      <div className="absolute top-1 right-10 flex items-center gap-1 pointer-events-auto z-20">
        {/* 收藏按钮 */}
        <button className={actionButtonClasses} onClick={handleFavoriteClick} title={t('contextMenu.addToFavorites')}>
          <i className="ti ti-star" style={{
          fontSize: 12
        }}></i>
        </button>

        {/* 编辑按钮 */}
        {(getPrimaryType(contentType) === 'text' || getPrimaryType(contentType) === 'rich_text') && <button className={actionButtonClasses} onClick={handleEditClick} title={t('common.edit')}>
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

      {isSmallHeight ?
    // 小行高模式：显示内容（隐藏时间）
    <div className="flex items-center gap-2 h-full overflow-hidden">
          <div className="flex-1 min-w-0 overflow-hidden h-full">
            {getPrimaryType(contentType) === 'image' || getPrimaryType(contentType) === 'file' ?
        // 图片和文件：显示实际内容（紧凑模式）
        renderContent(true) :
        // 文本和富文本：显示文字内容
        <p className={`text-sm text-gray-800 dark:text-gray-200 break-all leading-relaxed ${getLineClampClass()}`}>
                {item.content || ''}
              </p>}
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
          <div className={`flex-1 min-w-0 w-full ${isFileType ? 'overflow-auto' : 'overflow-hidden'} ${settings.rowHeight === 'auto' ? '' : 'h-full'}`}>
            {renderContent()}
          </div>
        </>}
    </div>;
}
export default ClipboardItem;