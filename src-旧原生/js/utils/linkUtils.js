// 链接检测和处理工具函数

/**
 * 检查纯文本内容是否是单个URL
 */
export function isSingleUrl(text) {
  if (!text) return false;
  
  const urlRegex = /^https?:\/\/[^\s]+$/;
  return urlRegex.test(text.trim());
}

/**
 * 检查文本中是否包含URL（可以是多个或混合内容）
 */
export function containsUrl(text) {
  if (!text) return false;
  
  const urlRegex = /https?:\/\/[^\s]+/;
  return urlRegex.test(text);
}

/**
 * 从HTML内容中提取所有链接
 */
export function extractLinksFromHtml(htmlContent) {
  if (!htmlContent) return [];
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const linkElements = doc.querySelectorAll('a[href]');
    
    const links = [];
    linkElements.forEach(link => {
      const href = link.getAttribute('href');
      if (href && (href.startsWith('http') || href.startsWith('https') || href.startsWith('ftp'))) {
        links.push(href);
      }
    });
    
    return [...new Set(links)]; // 去重
  } catch (error) {
    console.warn('解析HTML内容失败:', error);
    return [];
  }
}

/**
 * 从文本中提取所有链接（包括www开头的）
 */
export function extractLinksFromText(text) {
  if (!text) return [];
  
  const links = [];
  
  // 提取标准URL格式（包含协议）
  const standardUrlPattern = /(https?:\/\/|ftp:\/\/|mailto:|tel:)[^\s]+/gi;
  let match;
  while ((match = standardUrlPattern.exec(text)) !== null) {
    links.push(match[0]);
  }
  
  // 提取www开头的URL（不包含协议）
  const wwwUrlPattern = /www\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,}([\/\w\-._~:/?#[\]@!$&'()*+,;=]*)?/gi;
  while ((match = wwwUrlPattern.exec(text)) !== null) {
    // 为www开头的链接添加https://协议
    links.push('https://' + match[0]);
  }
  
  return [...new Set(links)]; // 去重
}

/**
 * 从剪贴板项目中提取所有链接（支持纯文本和HTML）
 */
export function extractAllLinks(item) {
  if (!item) return [];
  
  const links = [];
  
  // 1. 优先从HTML内容中提取链接
  if (item.html_content) {
    const htmlLinks = extractLinksFromHtml(item.html_content);
    links.push(...htmlLinks);
    
    // 如果HTML中找到了链接，直接返回
    if (htmlLinks.length > 0) {
      return links;
    }
  }
  
  // 2. 从纯文本中提取链接
  if (item.content) {
    const textLinks = extractLinksFromText(item.content);
    links.push(...textLinks);
  }
  
  return [...new Set(links)]; // 去重
}

/**
 * 判断剪贴板项目是否包含链接
 */
export function itemContainsLinks(item) {
  if (!item) return false;
  
  // 检查HTML内容中的链接
  if (item.html_content) {
    const htmlLinks = extractLinksFromHtml(item.html_content);
    if (htmlLinks.length > 0) return true;
  }
  
  // 检查纯文本内容中的链接
  if (item.content) {
    return containsUrl(item.content);
  }
  
  return false;
}

/**
 * 判断剪贴板项目是否是纯链接内容（用于显示优化）
 */
export function isLinkContent(item) {
  if (!item || !item.html_content || !item.content) {
    return false;
  }
  
  // 检查纯文本内容是否是URL
  if (!isSingleUrl(item.content)) {
    return false;
  }
  
  // 检查HTML内容是否是简单的链接格式
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(item.html_content, 'text/html');
    const links = doc.querySelectorAll('a');
    
    // 如果只有一个链接且链接的href与纯文本内容匹配，则认为是纯链接
    if (links.length === 1) {
      const link = links[0];
      const linkHref = link.getAttribute('href');
      const linkText = link.textContent.trim();
      const plainText = item.content.trim();
      
      // 如果链接的href与纯文本匹配，或者链接文本与纯文本差异很大，则优先显示纯文本
      if (linkHref === plainText || (linkText !== plainText && linkText.length < plainText.length)) {
        return true;
      }
    }
  } catch (error) {
    console.warn('解析HTML内容失败:', error);
  }
  
  return false;
}
