import { useState, useEffect, useRef, useCallback } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useSnapshot } from 'valtio';
import { useDragWithThreshold } from '@shared/hooks/useDragWithThreshold';
import { settingsStore } from '@shared/store/settingsStore';
import { formatFileSize } from '@shared/utils/format';

const MAX_IMAGE_SIZE_MB = 30;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

function ImageContent({
  item
}) {
  const settings = useSnapshot(settingsStore);
  const isAutoHeight = settings.rowHeight === 'auto';
  const { t } = useTranslation();
  
  const handleDragStart = useCallback(() => {
    invoke('close_image_preview').catch(() => {});
  }, []);

  const [imageSrc, setImageSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fileExists, setFileExists] = useState(true);
  const [isOversized, setIsOversized] = useState(false);
  const [fileSize, setFileSize] = useState(null);
  const [fileName, setFileName] = useState(null);
  const imagePathRef = useRef(null);
  
  useEffect(() => {
    loadImage();
  }, [item.id, item.content]);
  
  const loadImage = () => {
    try {
      setLoading(true);
      setError(false);
      setFileExists(true);
      setIsOversized(false);
      setFileSize(null);
      setFileName(null);

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
          const size = file.size || 0;
          const name = file.name || actualPath.split(/[/\\]/).pop();
          
          imagePathRef.current = actualPath;
          setFileExists(exists);
          setFileSize(size);
          setFileName(name);
          
          if (exists) {
            if (size > MAX_IMAGE_SIZE_BYTES) {
              setIsOversized(true);
            } else {
              const assetUrl = convertFileSrc(actualPath, 'asset');
              setImageSrc(assetUrl);
            }
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

  const handleDragMouseDown = useDragWithThreshold({ onDragStart: handleDragStart });

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
  if (isOversized || !fileExists) {
    const statusText = !fileExists 
      ? t('clipboard.fileNotFound', '文件不存在')
      : t('clipboard.imageTooLarge', '图片过大');
    const sizeText = !fileExists 
      ? null 
      : `${formatFileSize(fileSize)} / ${MAX_IMAGE_SIZE_MB} MB ${t('clipboard.maxLimit', '上限')}`;

    const colorClasses = !fileExists
      ? 'from-red-50 to-red-50 dark:from-red-900/20 dark:to-red-900/20 border-red-300/60 dark:border-red-700/60'
      : 'from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200/60 dark:border-amber-700/40';
    const iconColorClass = !fileExists
      ? 'text-red-400 dark:text-red-500'
      : 'text-amber-400 dark:text-amber-500';
    const textColorClass = !fileExists
      ? 'text-red-600 dark:text-red-400'
      : 'text-amber-600 dark:text-amber-400';
    const subTextColorClass = !fileExists
      ? 'text-red-500/70 dark:text-red-500/50'
      : 'text-amber-500/70 dark:text-amber-500/50';
    const badgeColorClass = !fileExists
      ? 'bg-red-500 dark:bg-red-600'
      : 'bg-amber-500 dark:bg-amber-600';
    const iconName = !fileExists ? 'ti-photo-off' : 'ti-photo';
    const badgeIcon = !fileExists ? 'ti-x' : 'ti-alert-triangle';
    
    return (
      <div 
        className={`w-full h-full rounded overflow-hidden flex items-center bg-gradient-to-br ${colorClasses} border cursor-grab active:cursor-grabbing ${isAutoHeight ? 'justify-center py-4' : 'justify-start px-3 gap-3'} ${!fileExists ? 'opacity-60' : ''}`}
        onMouseDown={imagePathRef.current && fileExists ? (e) => handleDragMouseDown(e, [imagePathRef.current], imagePathRef.current) : undefined}
        data-drag-ignore={imagePathRef.current && fileExists ? "true" : undefined}
        title={imagePathRef.current ? (fileExists ? t('clipboard.dragImageToExternal', '拖拽到外部') : fileName) : undefined}
      >
        {isAutoHeight ? (
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="relative">
              <i className={`ti ${iconName} text-4xl ${iconColorClass}`} />
              <div className={`absolute -bottom-1 -right-1 ${badgeColorClass} rounded-full w-4 h-4 flex items-center justify-center`}>
                <i className={`ti ${badgeIcon} text-white text-xs`} />
              </div>
            </div>
            <div className="text-center max-w-full px-4">
              <p className={`text-sm font-medium ${textColorClass}`}>
                {statusText}
              </p>
              <p className={`text-xs ${subTextColorClass} mt-0.5 truncate`} title={fileName}>
                {fileName}
              </p>
              {sizeText && (
                <p className={`text-xs ${subTextColorClass} opacity-80 mt-0.5`}>
                  {sizeText}
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="relative flex-shrink-0">
              <i className={`ti ${iconName} text-2xl ${iconColorClass}`} />
              <div className={`absolute -bottom-0.5 -right-0.5 ${badgeColorClass} rounded-full w-3 h-3 flex items-center justify-center`}>
                <i className={`ti ${badgeIcon} text-white`} style={{ fontSize: 8 }} />
              </div>
            </div>
            <div className="flex flex-col min-w-0">
              <p className={`text-sm ${textColorClass} truncate ${!fileExists ? 'line-through' : ''}`} title={fileName}>
                {fileName}
              </p>
              <p className={`text-xs ${subTextColorClass} truncate`}>
                {statusText}{sizeText ? ` · ${formatFileSize(fileSize)}` : ''}
              </p>
            </div>
          </>
        )}
      </div>
    );
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