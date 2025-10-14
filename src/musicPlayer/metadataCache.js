// 音频元数据缓存模块
import { invoke } from '@tauri-apps/api/core';

// 元数据缓存
const metadataCache = new Map();

const loadingPromises = new Map();

/**
 * 获取音频元数据
 */
export async function getAudioMetadata(filePath) {
  // 检查缓存
  if (metadataCache.has(filePath)) {
    return metadataCache.get(filePath);
  }
  
  // 检查是否正在加载
  if (loadingPromises.has(filePath)) {
    return loadingPromises.get(filePath);
  }
  
  // 创建加载 Promise
  const loadPromise = loadMetadata(filePath);
  loadingPromises.set(filePath, loadPromise);
  
  try {
    const metadata = await loadPromise;
    // 缓存结果
    metadataCache.set(filePath, metadata);
    return metadata;
  } finally {
    // 清除加载状态
    loadingPromises.delete(filePath);
  }
}

/**
 * 实际加载元数据
 */
async function loadMetadata(filePath) {
  try {
    const metadata = await invoke('get_audio_metadata', { filePath });
    return metadata;
  } catch (error) {
    // 加载失败，返回默认值
    return {
      path: filePath,
      title: null,
      artist: null,
      album: null,
      duration: null,
      cover_data: null
    };
  }
}

/**
 * 批量预加载元数据
 */
export function preloadMetadataBatch(filePaths) {
  if ('requestIdleCallback' in window) {
    let index = 0;
    
    const loadNext = (deadline) => {
      while (deadline.timeRemaining() > 0 && index < filePaths.length) {
        const filePath = filePaths[index];
        if (!metadataCache.has(filePath) && !loadingPromises.has(filePath)) {
          getAudioMetadata(filePath);
        }
        index++;
      }
      
      if (index < filePaths.length) {
        requestIdleCallback(loadNext);
      }
    };
    
    requestIdleCallback(loadNext);
  } else {
    let index = 0;
    const batchSize = 5;
    
    const loadBatch = () => {
      const batch = filePaths.slice(index, index + batchSize);
      batch.forEach(filePath => {
        if (!metadataCache.has(filePath) && !loadingPromises.has(filePath)) {
          getAudioMetadata(filePath);
        }
      });
      
      index += batchSize;
      if (index < filePaths.length) {
        setTimeout(loadBatch, 100);
      }
    };
    
    loadBatch();
  }
}

/**
 * 清除缓存
 */
export function clearMetadataCache() {
  metadataCache.clear();
  loadingPromises.clear();
}

/**
 * 获取缓存大小
 */
export function getCacheSize() {
  return metadataCache.size;
}

