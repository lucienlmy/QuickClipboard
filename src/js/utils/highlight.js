// 高亮搜索关键字工具函数

/**
 * 高亮文本中的搜索关键字
 */
export function highlightSearchTerm(text, searchTerm, highlightClass = 'search-highlight') {
  if (!searchTerm || !text) {
    return escapeHtml(text);
  }

  const escapedText = escapeHtml(text);
  const escapedSearchTerm = escapeHtml(searchTerm);

  const regex = new RegExp(`(${escapedSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  
  return escapedText.replace(regex, `<span class="${highlightClass}">$1</span>`);
}

/**
 * 高亮多个搜索关键字
 */
export function highlightMultipleSearchTerms(text, searchTerms, highlightClass = 'search-highlight') {
  if (!searchTerms || searchTerms.length === 0 || !text) {
    return escapeHtml(text);
  }

  let highlightedText = escapeHtml(text);

  const sortedTerms = [...searchTerms].sort((a, b) => b.length - a.length);

  sortedTerms.forEach(term => {
    if (term.trim()) {
      const escapedTerm = escapeHtml(term.trim());
      const regex = new RegExp(`(${escapedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      highlightedText = highlightedText.replace(regex, `<span class="${highlightClass}">$1</span>`);
    }
  });

  return highlightedText;
}

/**
 * 高亮HTML内容中的搜索关键字
 */
export function highlightMultipleSearchTermsInHTML(htmlContent, searchTerms, highlightClass = 'search-highlight') {
  if (!searchTerms || searchTerms.length === 0 || !htmlContent) {
    return htmlContent;
  }

  const TEMP_IMG_SRC_ATTR = 'data-quickclipboard-temp-src';

  const sanitizedHtmlContent = htmlContent.replace(/<img\b[^>]*?>/gi, (tag) => {
    if (!/\ssrc\s*=/.test(tag)) {
      return tag;
    }
    return tag.replace(/(\s)src(\s*=)/i, `$1${TEMP_IMG_SRC_ATTR}$2`);
  });

  // 创建临时DOM元素来解析HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = sanitizedHtmlContent;

  // 递归处理文本节点
  function highlightTextNodes(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (text && text.trim()) {
        let highlightedText = text;
        
        // 按长度排序搜索词，避免短词覆盖长词
        const sortedTerms = [...searchTerms].sort((a, b) => b.length - a.length);
        
        sortedTerms.forEach(term => {
          if (term.trim()) {
            const regex = new RegExp(`(${term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            highlightedText = highlightedText.replace(regex, `<span class="${highlightClass}">$1</span>`);
          }
        });

        // 如果文本被修改了，替换原节点
        if (highlightedText !== text) {
          const wrapper = document.createElement('span');
          wrapper.innerHTML = highlightedText;
          
          // 将wrapper的所有子节点插入到原位置
          const parent = node.parentNode;
          const fragment = document.createDocumentFragment();
          while (wrapper.firstChild) {
            fragment.appendChild(wrapper.firstChild);
          }
          parent.replaceChild(fragment, node);
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // 递归处理子节点（从后往前，避免索引问题）
      const children = Array.from(node.childNodes);
      for (let i = children.length - 1; i >= 0; i--) {
        highlightTextNodes(children[i]);
      }
    }
  }

  highlightTextNodes(tempDiv);
  return tempDiv.innerHTML.replace(new RegExp(TEMP_IMG_SRC_ATTR, 'gi'), 'src');
}

/**
 * 高亮多个搜索关键字并返回位置信息
 */
export function highlightMultipleSearchTermsWithPosition(text, searchTerms, highlightClass = 'search-highlight') {
  if (!searchTerms || searchTerms.length === 0 || !text) {
    return {
      html: escapeHtml(text),
      firstKeywordPosition: -1
    };
  }

  let highlightedText = escapeHtml(text);
  let firstKeywordPosition = -1;

  const sortedTerms = [...searchTerms].sort((a, b) => b.length - a.length);

  sortedTerms.forEach(term => {
    if (term.trim()) {
      const escapedTerm = escapeHtml(term.trim());
      const regex = new RegExp(`(${escapedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      
      const match = regex.exec(highlightedText);
      if (match && firstKeywordPosition === -1) {
        firstKeywordPosition = match.index;
      }
      
      highlightedText = highlightedText.replace(regex, `<span class="${highlightClass}">$1</span>`);
    }
  });

  return {
    html: highlightedText,
    firstKeywordPosition: firstKeywordPosition
  };
}

/**
 * 转义HTML特殊字符
 */
function escapeHtml(text) {
  if (typeof text !== 'string') {
    return String(text);
  }
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 获取当前搜索关键字
 */
export function getCurrentSearchTerm() {
  const clipboardSearch = document.getElementById('search-input');
  if (clipboardSearch && clipboardSearch.value) {
    return clipboardSearch.value.trim();
  }
  
  const quickTextsSearch = document.getElementById('quick-texts-search');
  if (quickTextsSearch && quickTextsSearch.value) {
    return quickTextsSearch.value.trim();
  }
  
  return '';
}

/**
 * 获取当前搜索关键字数组（按空格分割）
 */
export function getCurrentSearchTerms() {
  const searchTerm = getCurrentSearchTerm();
  if (!searchTerm) return [];
  
  return searchTerm.split(/\s+/).filter(term => term.trim());
}

/**
 * 自动滚动到第一个关键词位置
 */
export function scrollToKeyword(container, keywordPosition) {
  if (!container || keywordPosition === -1) return;
  
  try {
    const textContent = container.textContent || container.innerText;
    if (!textContent) return;
    
    if (container.scrollHeight <= container.clientHeight) return;
    
    const computedStyle = window.getComputedStyle(container);
    
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.visibility = 'hidden';
    tempDiv.style.whiteSpace = 'pre-wrap';
    tempDiv.style.wordWrap = 'break-word';
    tempDiv.style.width = container.clientWidth + 'px';
    tempDiv.style.font = computedStyle.font;
    tempDiv.style.lineHeight = computedStyle.lineHeight;
    tempDiv.style.padding = computedStyle.padding;
    tempDiv.textContent = textContent.substring(0, keywordPosition);
    
    document.body.appendChild(tempDiv);
    const textHeight = tempDiv.offsetHeight;
    document.body.removeChild(tempDiv);
    
    const containerHeight = container.clientHeight;
    const scrollTop = Math.max(0, textHeight - (containerHeight / 2));
    
    container.scrollTo({
      top: scrollTop,
      behavior: 'smooth'
    });
    
  } catch (error) {
    console.warn('滚动到关键词位置失败:', error);
  }
}

export function setupSearchResultScrolling() {
  setTimeout(() => {
    const searchableElements = document.querySelectorAll('.searchable[data-first-keyword]');
    
    searchableElements.forEach(element => {
      const keywordPosition = parseInt(element.getAttribute('data-first-keyword'));
      if (keywordPosition !== -1) {
        setTimeout(() => {
          scrollToKeywordImproved(element, keywordPosition);
        }, 200);
      }
    });
  }, 100);
}

// 监听DOM变化，处理虚拟滚动动态加载的内容
export function setupVirtualScrollScrolling() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 检查新添加的元素是否包含搜索关键字
            const searchableElements = node.querySelectorAll ? 
              node.querySelectorAll('.searchable[data-first-keyword]') : [];
            
            if (searchableElements.length > 0) {
              searchableElements.forEach(element => {
                const keywordPosition = parseInt(element.getAttribute('data-first-keyword'));
                if (keywordPosition !== -1) {
                  setTimeout(() => {
                    scrollToKeywordImproved(element, keywordPosition);
                  }, 200);
                }
              });
            }
            
            // 如果新添加的节点本身就是可搜索元素
            if (node.classList && node.classList.contains('searchable')) {
              const keywordPosition = parseInt(node.getAttribute('data-first-keyword'));
              if (keywordPosition !== -1) {
                setTimeout(() => {
                  scrollToKeywordImproved(node, keywordPosition);
                }, 200);
              }
            }
          }
        });
      }
    });
  });
  
  // 监听整个文档的变化
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  return observer;
}

/**
 * 改进的滚动定位函数
 */
export function scrollToKeywordImproved(container, keywordPosition) {
  if (!container || keywordPosition === -1) return;
  
  try {
    const textContent = container.textContent || container.innerText;
    if (!textContent) return;
    
    if (container.scrollHeight <= container.clientHeight) return;
    
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.visibility = 'hidden';
    tempDiv.style.whiteSpace = 'pre-wrap';
    tempDiv.style.wordWrap = 'break-word';
    tempDiv.style.width = container.clientWidth + 'px';
    tempDiv.style.font = window.getComputedStyle(container).font;
    tempDiv.style.lineHeight = window.getComputedStyle(container).lineHeight;
    tempDiv.style.padding = window.getComputedStyle(container).padding;
    tempDiv.textContent = textContent.substring(0, keywordPosition);
    
    document.body.appendChild(tempDiv);
    const textHeight = tempDiv.offsetHeight;
    document.body.removeChild(tempDiv);
    
    const containerHeight = container.clientHeight;
    const scrollTop = Math.max(0, textHeight - (containerHeight / 2));
    
    container.scrollTo({
      top: scrollTop,
      behavior: 'smooth'
    });
    
  } catch (error) {
    console.warn('滚动定位失败:', error);
  }
}