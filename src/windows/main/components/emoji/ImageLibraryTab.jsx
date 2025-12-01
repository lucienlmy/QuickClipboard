import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { startDrag } from '@crabnebula/tauri-plugin-drag';
import { toast, TOAST_SIZES, TOAST_POSITIONS } from '@shared/store/toastStore';
import { restoreLastFocus } from '@shared/api/window';
import { Virtuoso } from 'react-virtuoso';
import { useInputFocus } from '@shared/hooks/useInputFocus';
import { useCustomScrollbar } from '@shared/hooks/useCustomScrollbar';
import * as imageLibrary from '@shared/api/imageLibrary';
import { IMAGE_CATS, IMAGE_COLS } from './emojiData';
import CategorySidebar from './CategorySidebar';
import RenameDialog from './RenameDialog';

function ImageLibraryTab() {
  const { t } = useTranslation();
  const [imageCategory, setImageCategory] = useState('images');
  const [imageTotal, setImageTotal] = useState(0);
  const [imageItems, setImageItems] = useState([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [imageSearchQuery, setImageSearchQuery] = useState('');
  const [renamingItem, setRenamingItem] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const loadedRangeRef = useRef({ start: 0, end: 0 });
  const imageScrollerRef = useRef(null);
  const imageSearchInputRef = useInputFocus();
  const [scrollerElement, setScrollerElement] = useState(null);
  const scrollerRefCallback = useCallback(element => element && setScrollerElement(element), []);
  useCustomScrollbar(scrollerElement);
  const internalDragRef = useRef(false);

  useEffect(() => {
    const handleMouseUp = () => {
      if (internalDragRef.current) {
        internalDragRef.current = false;
      }
    };
    window.addEventListener('mouseup', handleMouseUp, true);
    return () => window.removeEventListener('mouseup', handleMouseUp, true);
  }, []);

  const loadImageCount = useCallback(async () => {
    try {
      const category = imageCategory === 'gifs' ? 'gifs' : 'images';
      const count = await imageLibrary.getImageCount(category);
      setImageTotal(count);
      if (count === 0) {
        setImageItems([]);
      }
    } catch (err) {
      console.error('加载图片总数失败:', err);
    }
  }, [imageCategory]);

  const loadImageRange = useCallback(async (startIndex, endIndex) => {
    if (imageLoading) return;
    
    const category = imageCategory === 'gifs' ? 'gifs' : 'images';
    const rowStart = Math.floor(startIndex / IMAGE_COLS) * IMAGE_COLS;
    const rowEnd = Math.ceil((endIndex + 1) / IMAGE_COLS) * IMAGE_COLS;
    
    if (rowStart >= loadedRangeRef.current.start && rowEnd <= loadedRangeRef.current.end) {
      return;
    }
    
    setImageLoading(true);
    try {
      const result = await imageLibrary.getImageList(category, rowStart, rowEnd - rowStart + 20);
      setImageItems(prev => {
        const newItems = [...prev];
        result.items.forEach((item, idx) => {
          newItems[rowStart + idx] = item;
        });
        return newItems;
      });
      loadedRangeRef.current = { 
        start: Math.min(loadedRangeRef.current.start || rowStart, rowStart), 
        end: Math.max(loadedRangeRef.current.end || rowEnd, rowStart + result.items.length) 
      };
    } catch (err) {
      console.error('加载图片列表失败:', err);
    } finally {
      setImageLoading(false);
    }
  }, [imageCategory, imageLoading]);

  useEffect(() => {
    setImageItems([]);
    setImageSearchQuery('');
    loadedRangeRef.current = { start: 0, end: 0 };
    loadImageCount();
  }, [imageCategory, loadImageCount]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (internalDragRef.current) return;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (internalDragRef.current) return;
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (internalDragRef.current) {
      internalDragRef.current = false;
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      toast.warning(t('emoji.noValidImages'), {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: imageFiles.length });

    let gifCount = 0;
    let imageCount = 0;

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      setUploadProgress({ current: i + 1, total: imageFiles.length });
      
      try {
        const buffer = await file.arrayBuffer();
        const data = new Uint8Array(buffer);
        const result = await imageLibrary.saveImage(file.name, data);
        if (result.category === 'gifs') gifCount++;
        else imageCount++;
      } catch (err) {
        console.error('保存图片失败:', err);
        toast.error(t('emoji.saveFailed', { name: file.name }), {
          size: TOAST_SIZES.EXTRA_SMALL,
          position: TOAST_POSITIONS.BOTTOM_RIGHT
        });
      }
    }

    setIsUploading(false);

    let message = '';
    if (imageCount > 0 && gifCount > 0) {
      message = t('emoji.addedBoth', { imageCount, gifCount });
    } else if (imageCount > 0) {
      message = t('emoji.addedImages', { count: imageCount });
    } else if (gifCount > 0) {
      message = t('emoji.addedGifs', { count: gifCount });
    }
    if (message) {
      toast.success(message, {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
    }
    
    loadImageCount();
    loadedRangeRef.current = { start: 0, end: 0 };
    setImageItems([]);
  }, [t, loadImageCount]);

  const handleImageClick = useCallback(async (item) => {
    if (!item || item.loading) return;
    
    try {
      await restoreLastFocus();
      await invoke('paste_image_file', { filePath: item.path });
      toast.success(t('common.pasted') || '已粘贴', {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
    } catch (err) {
      console.error('粘贴图片失败:', err);
      toast.error(t('common.pasteFailed') || '粘贴失败', {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
    }
  }, [t]);

  const handleDragStart = useCallback(async (e, item) => {
    if (!item || item.loading || e.button !== 0) return;
    if (e.target.closest('[data-drag-ignore="true"]')) return;
    internalDragRef.current = true;
    e.preventDefault();
    try {
      await startDrag({ item: [item.path], icon: item.path });
    } catch (err) {
      console.error('拖拽失败:', err);
    }
  }, []);

  const handleDeleteImage = useCallback(async (e, item) => {
    e.stopPropagation();
    if (!item || item.loading) return;
    
    try {
      await imageLibrary.deleteImage(item.category, item.filename);
      loadImageCount();
      loadedRangeRef.current = { start: 0, end: 0 };
      setImageItems([]);
    } catch (err) {
      console.error('删除图片失败:', err);
      toast.error(t('common.deleteFailed') || '删除失败', {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
    }
  }, [t, loadImageCount]);

  const handleRenameStart = useCallback((e, item) => {
    e.stopPropagation();
    if (!item || item.loading) return;
    const nameWithoutExt = item.filename.replace(/\.[^/.]+$/, '');
    setRenamingItem(item);
    setRenameValue(nameWithoutExt);
  }, []);

  const handleRenameConfirm = useCallback(async () => {
    if (!renamingItem || !renameValue.trim()) {
      setRenamingItem(null);
      return;
    }
    
    try {
      await imageLibrary.renameImage(renamingItem.category, renamingItem.filename, renameValue.trim());
      loadImageCount();
      loadedRangeRef.current = { start: 0, end: 0 };
      setImageItems([]);
      setRenamingItem(null);
    } catch (err) {
      console.error('重命名失败:', err);
      toast.error(t('emoji.renameFailed'), {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
    }
  }, [renamingItem, renameValue, loadImageCount, t]);

  const handleRenameCancel = useCallback(() => {
    setRenamingItem(null);
    setRenameValue('');
  }, []);

  const filteredImageItems = useMemo(() => {
    if (!imageSearchQuery.trim()) return imageItems;
    const query = imageSearchQuery.toLowerCase();
    return imageItems.filter(item => 
      item && !item.loading && item.filename.toLowerCase().includes(query)
    );
  }, [imageItems, imageSearchQuery]);

  const filteredImageTotal = useMemo(() => {
    if (!imageSearchQuery.trim()) return imageTotal;
    return filteredImageItems.length;
  }, [imageSearchQuery, imageTotal, filteredImageItems]);

  const imageRowCount = useMemo(() => {
    const total = imageSearchQuery.trim() ? filteredImageTotal : imageTotal;
    return Math.ceil(total / IMAGE_COLS);
  }, [imageTotal, filteredImageTotal, imageSearchQuery]);

  const renderImageRow = useCallback((rowIndex) => {
    const items = imageSearchQuery.trim() ? filteredImageItems : imageItems;
    const total = imageSearchQuery.trim() ? filteredImageTotal : imageTotal;
    const startIdx = rowIndex * IMAGE_COLS;
    const rowItems = [];
    
    for (let i = 0; i < IMAGE_COLS; i++) {
      const idx = startIdx + i;
      if (idx >= total) break;
      const item = items[idx];
      rowItems.push(item || { id: `loading-${idx}`, loading: true });
    }

    if (!imageSearchQuery.trim() && rowItems.some(item => item.loading)) {
      setTimeout(() => loadImageRange(startIdx, startIdx + IMAGE_COLS - 1), 0);
    }

    return (
      <div className="grid grid-cols-2 gap-2 px-2 py-1" data-no-drag>
        {rowItems.map((item) => (
          <div
            key={item.id}
            onClick={() => handleImageClick(item)}
            onMouseDown={(e) => handleDragStart(e, item)}
            role="button"
            title={item.loading ? '' : item.filename?.replace(/^\d+_?/, '').replace(/\.[^.]+$/, '') || ''}
            className="relative group aspect-square rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors overflow-hidden hover:ring-2 hover:ring-blue-400"
          >
            {item.loading ? (
              <i className="ti ti-loader-2 animate-spin text-2xl text-gray-400"></i>
            ) : (
              <>
                <img 
                  src={imageLibrary.getImageUrl(item.path)} 
                  alt={item.filename}
                  className="w-full h-full object-cover pointer-events-none"
                  loading="lazy"
                />
                <div
                  className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  data-drag-ignore="true"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => handleRenameStart(e, item)}
                    className="w-5 h-5 rounded-full bg-black/50 hover:bg-blue-500 text-white flex items-center justify-center"
                    title={t('common.rename') || '重命名'}
                  >
                    <i className="ti ti-pencil text-xs"></i>
                  </button>
                  <button
                    onClick={(e) => handleDeleteImage(e, item)}
                    className="w-5 h-5 rounded-full bg-black/50 hover:bg-red-500 text-white flex items-center justify-center"
                    title={t('common.delete') || '删除'}
                  >
                    <i className="ti ti-x text-xs"></i>
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }, [imageTotal, imageItems, filteredImageItems, filteredImageTotal, imageSearchQuery, loadImageRange, handleImageClick, handleDragStart, handleDeleteImage, handleRenameStart, t]);

  return (
    <div 
      className="h-full flex bg-gray-50 dark:bg-gray-900 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <CategorySidebar 
        categories={IMAGE_CATS}
        activeCategory={imageCategory}
        onCategoryClick={setImageCategory}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 搜索框 */}
        <div className="flex-shrink-0 p-2 border-b border-gray-200 dark:border-gray-700/50">
          <div className="relative">
            <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input
              ref={imageSearchInputRef}
              type="text"
              value={imageSearchQuery}
              onChange={e => setImageSearchQuery(e.target.value)}
              placeholder={t('emoji.searchImagePlaceholder') || '搜索文件名...'}
              className="w-full h-8 pl-8 pr-8 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
            {imageSearchQuery && (
              <button onClick={() => setImageSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <i className="ti ti-x text-sm"></i>
              </button>
            )}
          </div>
        </div>

        {imageTotal === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
            <div className={`w-20 h-20 rounded-2xl border-2 border-dashed flex items-center justify-center mb-3 transition-colors ${
              isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'
            }`}>
              <i className={`ti ${imageCategory === 'gifs' ? 'ti-gif' : 'ti-photo'} text-4xl ${isDragging ? 'text-blue-500' : ''}`}></i>
            </div>
            <p className="text-sm mb-1">{t('emoji.dragToAdd') || '拖入图片添加'}</p>
            <p className="text-xs text-gray-400">{t('emoji.supportFormats') || '支持 PNG, JPG, GIF, WebP'}</p>
          </div>
        ) : imageRowCount === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-400 dark:text-gray-500 text-sm">{t('common.noResults') || '无搜索结果'}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden custom-scrollbar-container">
            <Virtuoso
              ref={imageScrollerRef}
              totalCount={imageRowCount}
              itemContent={renderImageRow}
              computeItemKey={(index) => `row-${imageCategory}-${imageSearchQuery}-${index}`}
              scrollerRef={scrollerRefCallback}
              overscan={3}
              className="h-full"
              style={{ height: '100%' }}
            />
          </div>
        )}
      </div>

      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/10 pointer-events-none flex items-center justify-center z-10 ring-2 ring-blue-500 ring-inset">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg px-6 py-4 flex items-center gap-3">
            <i className="ti ti-upload text-2xl text-blue-500"></i>
            <span className="text-gray-700 dark:text-gray-200">{t('emoji.dropToAdd')}</span>
          </div>
        </div>
      )}

      {isUploading && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[9999]">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg px-6 py-4 flex flex-col items-center gap-3">
            <i className="ti ti-loader-2 animate-spin text-3xl text-blue-500"></i>
            <span className="text-gray-700 dark:text-gray-200">
              {t('emoji.uploading', { current: uploadProgress.current, total: uploadProgress.total })}
            </span>
            <div className="w-40 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-200"
                style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {renamingItem && (
        <RenameDialog
          value={renameValue}
          onChange={setRenameValue}
          onConfirm={handleRenameConfirm}
          onCancel={handleRenameCancel}
        />
      )}
    </div>
  );
}

export default ImageLibraryTab;
