import { useState, useEffect, useRef } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useSnapshot } from 'valtio';
import { useDragWithThreshold } from '@shared/hooks/useDragWithThreshold';
import { settingsStore } from '@shared/store/settingsStore';

function ImageContent({
  item
}) {
  const settings = useSnapshot(settingsStore);
  const isAutoHeight = settings.rowHeight === 'auto';
  const { t } = useTranslation();

  const [imageSrc, setImageSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fileExists, setFileExists] = useState(true);
  const imagePathRef = useRef(null);
  
  useEffect(() => {
    loadImage();
  }, [item.id, item.content]);
  
  const loadImage = () => {
    try {
      setLoading(true);
      setError(false);
      setFileExists(true);

      if (item.content?.startsWith('data:image/')) {
        setImageSrc(item.content);
        setLoading(false);
        return;
      }
      
      if (item.content?.startsWith('files:')) {
        const filesData = JSON.parse(item.content.substring(6));
        if (filesData.files && filesData.files.length > 0) {
          const file = filesData.files[0];
          const exists = file.exists !== false;
          const actualPath = file.actual_path || file.path;
          
          imagePathRef.current = actualPath;
          setFileExists(exists);
          if (exists) {
            const assetUrl = convertFileSrc(actualPath, 'asset');
            setImageSrc(assetUrl);
          }
          setLoading(false);
          return;
        }
      }
      
      setError(true);
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
      <span className="text-sm text-red-500 dark:text-red-400">{t('clipboard.imageLoadFailed', '图片加载失败')}</span>
    </div>;
  }
  if (!fileExists) {
    return <div className="w-full h-full min-h-[80px] bg-red-50 dark:bg-red-900/20 rounded border border-red-300/60 dark:border-red-700/60 flex flex-col items-center justify-center gap-1 opacity-60">
      <svg className="w-8 h-8 text-red-400 dark:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <span className="text-xs text-red-500 dark:text-red-400">{t('clipboard.imageNotFound', '图片文件不存在')}</span>
    </div>;
  }
  return <div 
    className={`w-full rounded overflow-hidden flex items-center justify-start bg-transparent cursor-grab active:cursor-grabbing ${isAutoHeight ? 'max-h-[280px]' : 'h-full'}`}
    onMouseDown={imagePathRef.current ? (e) => handleDragMouseDown(e, [imagePathRef.current], imagePathRef.current) : undefined}
    data-drag-ignore={imagePathRef.current ? "true" : undefined}
    title={imagePathRef.current ? t('clipboard.dragImageToExternal', '拖拽到外部') : undefined}
  >
    <img src={imageSrc} alt="剪贴板图片" className={`max-w-full object-contain pointer-events-none ${isAutoHeight ? 'max-h-[280px]' : 'max-h-full'}`} loading="lazy" decoding="async" />
  </div>;
}
export default ImageContent;