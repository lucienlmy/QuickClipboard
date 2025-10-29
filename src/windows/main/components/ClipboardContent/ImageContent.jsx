import { useState, useEffect } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { getImageFilePath } from '@shared/api'

// 图片内容组件
function ImageContent({ item }) {
  const [imageSrc, setImageSrc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    loadImage()
  }, [item.id])

  const loadImage = async () => {
    try {
      setLoading(true)
      setError(false)

      let imageId = null

      // 从 image_id 字段获取
      if (item.image_id) {
        imageId = item.image_id
      } 
      // 从 content 字段解析 (格式: "image:xxx")
      else if (item.content?.startsWith('image:')) {
        imageId = item.content.substring(6)
      }
      // 直接是 base64 数据
      else if (item.content?.startsWith('data:image/')) {
        setImageSrc(item.content)
        setLoading(false)
        return
      }

      if (imageId) {
        const filePath = await getImageFilePath(`image:${imageId}`)
        const assetUrl = convertFileSrc(filePath, 'asset')
        setImageSrc(assetUrl)
      } else {
        setError(true)
      }
    } catch (err) {
      console.error('加载图片失败:', err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="w-full min-h-[80px] bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
        <span className="text-sm text-gray-500 dark:text-gray-400">加载中...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full min-h-[80px] bg-red-50 dark:bg-red-900/20 rounded flex items-center justify-center">
        <span className="text-sm text-red-500 dark:text-red-400">图片加载失败</span>
      </div>
    )
  }

  return (
    <div className="w-full h-full rounded overflow-hidden flex items-start justify-start bg-gray-100 dark:bg-gray-800">
      <img
        src={imageSrc}
        alt="剪贴板图片"
        className="max-w-full max-h-full object-contain object-left-top"
        loading="lazy"
        decoding="async"
      />
    </div>
  )
}

export default ImageContent

