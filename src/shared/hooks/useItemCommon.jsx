import { useSnapshot } from 'valtio';
import { settingsStore } from '@shared/store';
import { clipboardStore } from '@shared/store/clipboardStore';
import { favoritesStore } from '@shared/store/favoritesStore';
import { TextContent, ImageContent, FileContent, HtmlContent } from '@windows/main/components/ClipboardContent';
import { getPrimaryType } from '@shared/utils/contentType';

// 行高配置常量
export const ROW_HEIGHT_CONFIG = {
  auto: { px: 90, cardPx: 90, class: '', cardClass: '', itemClass: 'min-h-[50px] max-h-[350px]', lineClamp: 'line-clamp-none' },
  large: { px: 120, cardPx: 132, class: 'h-[120px]', cardClass: 'h-[132px]', itemClass: 'h-full', lineClamp: 'line-clamp-4' },
  medium: { px: 90, cardPx: 102, class: 'h-[90px]', cardClass: 'h-[102px]', itemClass: 'h-full', lineClamp: 'line-clamp-2' },
  small: { px: 50, cardPx: 62, class: 'h-[50px]', cardClass: 'h-[62px]', itemClass: 'h-full', lineClamp: 'line-clamp-1' }
};

// 剪贴板和收藏项的共同逻辑
export function useItemCommon(item, options = {}) {
  const settings = useSnapshot(settingsStore);
  const clipSnap = useSnapshot(clipboardStore);
  const favSnap = useSnapshot(favoritesStore);
  const rowConfig = ROW_HEIGHT_CONFIG[settings.rowHeight] || ROW_HEIGHT_CONFIG.medium;

  const searchKeyword = options.searchKeyword ?? ((options.isFavorite ? favSnap.filter : clipSnap.filter) || '');

  // 获取固定行高
  const getHeightClass = () => rowConfig.itemClass;

  // 获取文本行数限制
  const getLineClampClass = () => rowConfig.lineClamp;

  // 获取内容类型
  const contentType = item.content_type || item.type || 'text';

  // 格式化时间
  const formatTime = () => {
    const timestamp = item.created_at || item.timestamp;
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const recordDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const timeFormat = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    let timeStr = '';

    // 今天
    if (recordDate.getTime() === today.getTime()) {
      timeStr = `今天 ${timeFormat}`;
    }
    // 昨天
    else if (recordDate.getTime() === yesterday.getTime()) {
      timeStr = `昨天 ${timeFormat}`;
    }
    // 一周内
    else if (recordDate >= oneWeekAgo) {
      const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      timeStr = `${days[date.getDay()]} ${timeFormat}`;
    }
    // 更早的日期
    else {
      timeStr = `${date.getMonth() + 1}/${date.getDate()} ${timeFormat}`;
    }

    // 如果是文件类型，添加文件数量
    if (getPrimaryType(contentType) === 'file') {
      try {
        if (item.content?.startsWith('files:')) {
          const filesData = JSON.parse(item.content.substring(6));
          const fileCount = filesData.files?.length || 0;
          timeStr += ` • ${fileCount} 个文件`;
        }
      } catch (e) {
        // 解析失败，只显示时间
      }
    }
    return timeStr;
  };

  // 渲染内容组件
  const renderContent = (compact = false) => {
    const lineClampClass = getLineClampClass();
    const primaryType = getPrimaryType(contentType);

    // 图片类型
    if (primaryType === 'image') {
      return <ImageContent item={item} />;
    }

    // 文件类型
    if (primaryType === 'file') {
      return <FileContent item={item} compact={compact} searchKeyword={searchKeyword} />;
    }

    // HTML 富文本类型
    if (primaryType === 'rich_text') {
      // 根据格式设置决定显示 HTML 还是纯文本
      if (settings.pasteWithFormat && item.html_content) {
        return <HtmlContent htmlContent={item.html_content} lineClampClass={lineClampClass} searchKeyword={searchKeyword} />;
      } else {
        return <TextContent content={item.content || ''} lineClampClass={lineClampClass} searchKeyword={searchKeyword} />;
      }
    }

    // 默认文本类型
    return <TextContent content={item.content || ''} lineClampClass={lineClampClass} searchKeyword={searchKeyword} />;
  };
  return {
    settings,
    getHeightClass,
    getLineClampClass,
    contentType,
    formatTime,
    renderContent,
    searchKeyword
  };
}