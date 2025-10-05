// 类型筛选和搜索工具函数
import { itemContainsLinks } from './linkUtils.js';

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
      try {
        // 创建临时DOM元素来提取HTML中的纯文本
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = item.html_content;
        const htmlText = tempDiv.textContent || tempDiv.innerText || '';
        htmlTextMatch = htmlText.toLowerCase().includes(term);
      } catch (error) {
        // 如果解析HTML失败，忽略HTML内容搜索
        htmlTextMatch = false;
      }
    }
    
    return contentMatch || titleMatch || htmlTextMatch;
  }
}
