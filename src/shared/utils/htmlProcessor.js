// HTML 安全清理工具函数

export function sanitizeHTML(element) {
  const scripts = element.querySelectorAll('script')
  scripts.forEach(script => script.remove())

  const iframes = element.querySelectorAll('iframe, embed, object')
  iframes.forEach(frame => frame.remove())

  const forms = element.querySelectorAll('form')
  forms.forEach(form => form.remove())

  const dangerousAttributes = [
    'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur',
    'onchange', 'onsubmit', 'onreset', 'onkeydown', 'onkeyup', 'onkeypress',
    'onerror', 'onabort', 'oncontextmenu', 'ondblclick', 'ondrag', 'ondrop'
  ]

  function cleanElement(el) {
    dangerousAttributes.forEach(attr => {
      if (el.hasAttribute(attr)) {
        el.removeAttribute(attr)
      }
    })

    const style = el.getAttribute('style')
    if (style) {
      const cleanStyle = style
        .replace(/javascript:/gi, '')
        .replace(/expression\s*\(/gi, '')
      el.setAttribute('style', cleanStyle)
    }

    if (el.tagName === 'A') {
      el.removeAttribute('href')
      el.removeAttribute('target')
    }

    Array.from(el.children).forEach(child => cleanElement(child))
  }

  cleanElement(element)
}

