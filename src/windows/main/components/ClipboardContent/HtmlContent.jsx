import { useEffect, useRef } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { sanitizeHTML } from '@shared/utils/htmlProcessor'
import { invoke } from '@tauri-apps/api/core'

const PLACEHOLDER_SRC = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2YwZjBmMCIvPjwvc3ZnPg=='
const ERROR_SRC = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2ZmZWJlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjEyIiBmaWxsPSIjYzYyODI4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+5Zu+54mH5Yqg6L295aSx6LSlPC90ZXh0Pjwvc3ZnPg=='

// HTML 富文本内容组件
function HtmlContent({ htmlContent, lineClampClass }) {
  const contentRef = useRef(null)
  const processedRef = useRef(null)

  useEffect(() => {
    if (!contentRef.current || processedRef.current === htmlContent) return
    
    processedRef.current = htmlContent
    
    const cleanHTML = sanitizeHTML(htmlContent)
    
    contentRef.current.innerHTML = cleanHTML
    
    const images = contentRef.current.querySelectorAll('img')
    
    images.forEach(img => {
      const imageId = img.getAttribute('data-image-id')
      const src = img.getAttribute('src')
      
      // 优先使用 data-image-id
      if (imageId) {
        const originalSrc = img.src
        img.src = PLACEHOLDER_SRC
        img.classList.add('html-image-pending')
        
        invoke('get_data_directory')
          .then(dataDir => {
            const filePath = `${dataDir}/clipboard_images/${imageId}.png`
            const assetUrl = convertFileSrc(filePath, 'asset')
            img.src = assetUrl
            img.classList.remove('html-image-pending')
          })
          .catch(error => {
            console.error('加载本地图片失败，恢复原始src:', error, 'imageId:', imageId)
            img.src = originalSrc
            img.classList.remove('html-image-pending')
          })
      }
      else if (src && src.startsWith('image-id:')) {
        const legacyImageId = src.substring(9)
        
        img.src = PLACEHOLDER_SRC
        img.classList.add('html-image-pending')
        
        invoke('get_data_directory')
          .then(dataDir => {
            const filePath = `${dataDir}/clipboard_images/${legacyImageId}.png`
            const assetUrl = convertFileSrc(filePath, 'asset')
            img.src = assetUrl
            img.classList.remove('html-image-pending')
          })
          .catch(error => {
            console.error('加载 HTML 图片失败:', error, 'imageId:', legacyImageId)
            img.src = ERROR_SRC
            img.alt = '图片加载失败'
            img.classList.remove('html-image-pending')
          })
      }
    })
  }, [htmlContent])

  return (
    <div 
      ref={contentRef}
      className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed html-content overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent"
      style={{
        wordBreak: 'break-all',
        maxHeight: '100%',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingRight: '4px',
        isolation: 'isolate',
        contain: 'layout style paint'
      }}
      data-html-content-scope="true"
    />
  )
}

export default HtmlContent

