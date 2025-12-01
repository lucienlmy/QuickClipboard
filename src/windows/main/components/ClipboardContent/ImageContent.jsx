import { useState, useEffect, useRef } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useDragWithThreshold } from '@shared/hooks/useDragWithThreshold';

function ImageContent({
  item
}) {
  const { t } = useTranslation();

  const [imageSrc, setImageSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const imagePathRef = useRef(null);
  useEffect(() => {
    loadImage();
  }, [item.id]);
  const loadImage = async () => {
    try {
      setLoading(true);
      setError(false);
      let imageId = null;

      if (item.image_id) {
        imageId = item.image_id;
      }
      else if (item.content?.startsWith('image:')) {
        imageId = item.content.substring(6);
      }
      else if (item.content?.startsWith('data:image/')) {
        setImageSrc(item.content);
        setLoading(false);
        return;
      }
      else if (item.content?.startsWith('files:')) {
        const filesData = JSON.parse(item.content.substring(6));
        if (filesData.files && filesData.files.length > 0) {
          const filePath = filesData.files[0].path;
          imagePathRef.current = filePath;
          const assetUrl = convertFileSrc(filePath, 'asset');
          setImageSrc(assetUrl);
          setLoading(false);
          return;
        } else {
          setError(true);
          setLoading(false);
          return;
        }
      }

      if (imageId) {
        const dataDir = await invoke('get_data_directory');
        const filePath = `${dataDir}/clipboard_images/${imageId}.png`;
        imagePathRef.current = filePath;
        const assetUrl = convertFileSrc(filePath, 'asset');
        setImageSrc(assetUrl);
      } else {
        setError(true);
      }
    } catch (err) {
      console.error('加载图片失败:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleDragMouseDown = useDragWithThreshold();

  if (loading) {
    return <div className="w-full min-h-[80px] bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
      <span className="text-sm text-gray-500 dark:text-gray-400">加载中...</span>
    </div>;
  }
  if (error) {
    return <div className="w-full min-h-[80px] bg-red-50 dark:bg-red-900/20 rounded flex items-center justify-center">
      <span className="text-sm text-red-500 dark:text-red-400">图片加载失败</span>
    </div>;
  }
  return <div 
    className="w-full h-full rounded overflow-hidden flex items-center justify-start bg-gray-100 dark:bg-gray-800 cursor-grab active:cursor-grabbing"
    onMouseDown={imagePathRef.current ? (e) => handleDragMouseDown(e, [imagePathRef.current], imagePathRef.current) : undefined}
    data-drag-ignore={imagePathRef.current ? "true" : undefined}
    title={imagePathRef.current ? t('clipboard.dragImageToExternal', '拖拽到外部') : undefined}
  >
    <img src={imageSrc} alt="剪贴板图片" className="max-w-full max-h-full object-contain pointer-events-none" loading="lazy" decoding="async" />
  </div>;
}
export default ImageContent;