import { useEffect, useRef } from 'react'
import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import { processHTMLImages } from '@shared/utils/htmlProcessor'

// HTML 富文本内容组件
function HtmlContent({ htmlContent, lineClampClass }) {
  const contentRef = useRef(null)

  useEffect(() => {
    if (!contentRef.current) return

    // 异步加载 HTML 中的图片
    const loadImages = async () => {
      const images = contentRef.current.querySelectorAll('img.html-image-pending')
      
      for (const img of images) {
        const imageId = img.getAttribute('data-image-id')
        if (imageId) {
          try {
            const filePath = await invoke('get_image_file_path', { 
              content: `image:${imageId}` 
            })
            const assetUrl = convertFileSrc(filePath, 'asset')
            img.src = assetUrl
            img.classList.remove('html-image-pending')
          } catch (error) {
            console.error('加载 HTML 图片失败:', error, 'imageId:', imageId)
            // 显示错误占位图
            const errorSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2ZmZWJlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjEyIiBmaWxsPSIjYzYyODI4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+5Zu+54mH5Yqg6L295aSx6LSlPC90ZXh0Pjwvc3ZnPg=='
            img.src = errorSrc
            img.alt = '图片加载失败'
            img.classList.remove('html-image-pending')
          }
        }
      }
    }

    loadImages()
  }, [htmlContent])

  // 处理 HTML 内容（清理并处理图片）
  const processedHTML = processHTMLImages(htmlContent)

  return (
    <div 
      ref={contentRef}
      className={`text-sm text-gray-800 dark:text-gray-200 leading-relaxed html-content ${lineClampClass}`}
      dangerouslySetInnerHTML={{ __html: processedHTML }}
      style={{
        wordBreak: 'break-all',
        overflow: 'hidden'
      }}
    />
  )
}

export default HtmlContent

