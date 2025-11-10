import { useSnapshot } from 'valtio';
import { settingsStore } from '@shared/store';
import { TextContent, ImageContent, FileContent, HtmlContent } from '@windows/main/components/ClipboardContent';
import { getPrimaryType } from '@shared/utils/contentType';

// 剪贴板和收藏项的共同逻辑
export function useItemCommon(item) {
  const settings = useSnapshot(settingsStore);

  // 获取固定行高
  const getHeightClass = () => {
    switch (settings.rowHeight) {
      case 'auto':
        return 'min-h-[50px] max-h-[350px]';
      case 'large':
        return 'h-full';
      case 'medium':
        return 'h-full';
      case 'small':
        return 'h-full';
      default:
        return 'h-full';
    }
  };

  // 获取文本行数限制
  const getLineClampClass = () => {
    switch (settings.rowHeight) {
      case 'auto':
        return 'line-clamp-none';
      case 'large':
        return 'line-clamp-4';
      case 'medium':
        return 'line-clamp-2';
      case 'small':
        return 'line-clamp-1';
      default:
        return 'line-clamp-2';
    }
  };

  // 获取内容类型
  const contentType = item.content_type || item.type || 'text';

  // 格式化时间
  const formatTime = () => {
    const timestamp = item.created_at || item.timestamp;
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now - date;
    let timeStr = '';

    // 今天
    if (diff < 86400000) {
      timeStr = `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    // 昨天
    else if (diff < 172800000) {
      timeStr = `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    // 周几
    else if (diff < 604800000) {
      const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      timeStr = `${days[date.getDay()]} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    // 日期
    else {
      timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
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
      return <FileContent item={item} compact={compact} />;
    }

    // HTML 富文本类型
    if (primaryType === 'rich_text') {
      // 根据格式设置决定显示 HTML 还是纯文本
      if (settings.pasteWithFormat && item.html_content) {
        return <HtmlContent htmlContent={item.html_content} lineClampClass={lineClampClass} />;
      } else {
        return <TextContent content={item.content || ''} lineClampClass={lineClampClass} />;
      }
    }

    // 默认文本类型
    return <TextContent content={item.content || ''} lineClampClass={lineClampClass} />;
  };
  return {
    settings,
    getHeightClass,
    getLineClampClass,
    contentType,
    formatTime,
    renderContent
  };
}