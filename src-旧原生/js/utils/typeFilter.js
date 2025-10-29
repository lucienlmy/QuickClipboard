// 类型筛选和搜索工具函数
import { itemContainsLinks } from './linkUtils.js';

let htmlTextParser = null;

function getPlainTextFromHtml(htmlContent) {
  if (!htmlContent) {
    return '';
  }

  try {
    if (!htmlTextParser) {
      htmlTextParser = new DOMParser();
    }

    // 避免解析过程中触发图片加载，移除 img 标签的 src 属性
    const sanitizedHtml = htmlContent.replace(/(<img[^>]*?)\s+src=("|')[^"']*("|')/gi, '$1');
    const doc = htmlTextParser.parseFromString(sanitizedHtml, 'text/html');
    return (doc.body && doc.body.textContent) ? doc.body.textContent : '';
  } catch (error) {
    console.warn('解析HTML内容失败:', error);
    return htmlContent.replace(/<[^>]+>/g, ' ');
  }
}

// 类型筛选工具函数
export function matchesFilter(contentType, filterType, item = null) {
  if (filterType === 'all') {
    return true;
  }
  
  // 将rich_text也归类到text筛选器中
  if (filterType === 'text' && (contentType === 'text' || contentType === 'rich_text')) {
    return true;
  }
  
  // 特殊处理：link筛选器应该包含所有包含链接的内容
  if (filterType === 'link') {
    if (contentType === 'link') {
      return true;
    }
      // 检查任何类型的内容是否包含链接
      if (item && itemContainsLinks(item)) {
        return true;
      }
  }
  
  return contentType === filterType;
}

// 搜索内容匹配
export function matchesSearch(item, searchTerm, contentType) {
  if (!searchTerm) {
    return true;
  }

  const term = searchTerm.toLowerCase();
  
  if (contentType === 'file') {
    // 文件类型：搜索文件名和路径
    try {
      const filesJson = item.content.substring(6); // 去掉 "files:" 前缀
      const filesData = JSON.parse(filesJson);
      const searchableText = filesData.files.map(file =>
        `${file.name} ${file.path} ${file.file_type || ''}`
      ).join(' ').toLowerCase();
      
      // 对于常用文本，还要搜索标题
      if (item.title) {
        return item.title.toLowerCase().includes(term) || searchableText.includes(term);
      }
      return searchableText.includes(term);
    } catch (error) {
      return item.title ? item.title.toLowerCase().includes(term) : false;
    }
  } else if (contentType === 'image') {
    // 图片类型：只搜索标题（如果有）
    return item.title ? item.title.toLowerCase().includes(term) : false;
  } else {
    // 文本、富文本和链接类型：搜索内容和标题
    const contentMatch = item.content.toLowerCase().includes(term);
    const titleMatch = item.title ? item.title.toLowerCase().includes(term) : false;
    
    // 如果有HTML内容，也搜索HTML中的纯文本内容
    let htmlTextMatch = false;
    if (item.html_content) {
      const htmlText = getPlainTextFromHtml(item.html_content);
      htmlTextMatch = htmlText.toLowerCase().includes(term);
    }
    
    return contentMatch || titleMatch || htmlTextMatch;
  }
}
