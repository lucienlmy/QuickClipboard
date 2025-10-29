// HTML 处理工具函数

/**
 * 处理 HTML 内容中的图片
 * - 将 image-id: 格式的图片替换为占位符，并标记待加载
 * - 清理危险的 HTML 内容
 */
export function processHTMLImages(htmlContent) {
  // 创建临时 DOM
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = htmlContent

  // 安全清理
  sanitizeHTML(tempDiv)

  // 处理图片
  const images = tempDiv.querySelectorAll('img')
  const placeholderSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2YwZjBmMCIvPjwvc3ZnPg=='

  images.forEach((img, index) => {
    const originalSrc = img.getAttribute('src')
    
    if (originalSrc) {
      // 保存原始 src
      img.setAttribute('data-original-src', originalSrc)
      
      // 检查是否是 image-id: 格式
      if (originalSrc.startsWith('image-id:')) {
        const imageId = originalSrc.substring(9)
        img.setAttribute('data-image-id', imageId)
        img.src = placeholderSrc
        img.classList.add('html-image-pending')
      } else if (!originalSrc.startsWith('data:')) {
        // 外部图片，使用占位符
        img.src = placeholderSrc
      }
    }

    // 设置基本样式
    img.style.maxWidth = '100%'
    img.style.height = 'auto'
    img.style.display = 'inline-block'
  })

  return tempDiv.innerHTML
}

/**
 * HTML 安全清理函数
 */
function sanitizeHTML(element) {
  // 移除脚本
  const scripts = element.querySelectorAll('script')
  scripts.forEach(script => script.remove())

  // 移除链接跳转
  const links = element.querySelectorAll('a')
  links.forEach(link => {
    link.removeAttribute('href')
    link.removeAttribute('target')
    link.style.cursor = 'default'
    link.style.textDecoration = 'none'
    link.setAttribute('onclick', 'return false;')
  })

  // 移除表单
  const forms = element.querySelectorAll('form')
  forms.forEach(form => form.remove())

  // 移除 iframe
  const iframes = element.querySelectorAll('iframe, embed, object')
  iframes.forEach(frame => frame.remove())

  // 移除危险属性
  const dangerousAttributes = [
    'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur',
    'onchange', 'onsubmit', 'onreset', 'onkeydown', 'onkeyup', 'onkeypress',
    'onerror', 'onabort'
  ]

  function cleanElement(el) {
    dangerousAttributes.forEach(attr => {
      if (el.hasAttribute(attr)) {
        el.removeAttribute(attr)
      }
    })

    // 清理 style
    const style = el.getAttribute('style')
    if (style) {
      let cleanStyle = style
        .replace(/javascript:/gi, '')
        .replace(/expression\s*\(/gi, '')
        .replace(/position\s*:\s*(fixed|sticky|absolute)/gi, 'position: relative')
        .replace(/z-index\s*:\s*[^;]+/gi, '')
        .replace(/float\s*:\s*[^;]+/gi, '')

      el.setAttribute('style', cleanStyle)
    }

    // 递归处理子元素
    Array.from(el.children).forEach(child => cleanElement(child))
  }

  cleanElement(element)
}

