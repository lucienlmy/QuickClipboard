// 文件图标工具函数

// 图片加载管理器
class ImageLoadManager {
  constructor() {
    this.cache = new Map(); // 缓存已加载的图片
    this.loadingQueue = []; // 待加载队列
    this.loadingCount = 0; // 当前加载中的数量
    this.maxConcurrent = 3; // 最大并发加载数
    this.observer = null; // Intersection Observer
    this.initIntersectionObserver();
  }

  // 初始化 Intersection Observer
  initIntersectionObserver() {
    if (typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const iconElement = entry.target;
            const filePath = iconElement.dataset.filePath;
            const defaultIcon = iconElement.dataset.defaultIcon;

            if (filePath) {
              this.loadImage(iconElement, filePath, defaultIcon);
              this.observer.unobserve(iconElement);
            }
          }
        });
      }, {
        rootMargin: '50px' // 提前50px开始加载
      });
    }
  }

  // 生成缓存key
  getCacheKey(filePath) {
    return filePath;
  }

  // 检查缓存
  getFromCache(filePath) {
    return this.cache.get(this.getCacheKey(filePath));
  }

  // 保存到缓存
  saveToCache(filePath, dataUrl) {
    const key = this.getCacheKey(filePath);
    this.cache.set(key, dataUrl);

    // 限制缓存大小，避免内存泄漏
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  // 懒加载图片
  lazyLoadImage(iconElement, filePath, defaultIcon) {
    // 先设置默认图标
    iconElement.src = defaultIcon;
    iconElement.style.opacity = '0.7';

    // 检查缓存
    const cached = this.getFromCache(filePath);
    if (cached) {
      iconElement.src = cached;
      iconElement.style.opacity = '1';
      return;
    }

    // 如果支持 Intersection Observer，使用懒加载
    if (this.observer) {
      iconElement.dataset.filePath = filePath;
      iconElement.dataset.defaultIcon = defaultIcon;
      this.observer.observe(iconElement);
    } else {
      // 降级到直接加载
      this.loadImage(iconElement, filePath, defaultIcon);
    }
  }

  // 加载图片
  async loadImage(iconElement, filePath, defaultIcon) {
    // 检查缓存
    const cached = this.getFromCache(filePath);
    if (cached) {
      iconElement.src = cached;
      iconElement.style.opacity = '1';
      return;
    }

    // 添加到队列
    return new Promise((resolve) => {
      this.loadingQueue.push({
        iconElement,
        filePath,
        defaultIcon,
        resolve
      });
      this.processQueue();
    });
  }

  // 处理加载队列
  async processQueue() {
    if (this.loadingCount >= this.maxConcurrent || this.loadingQueue.length === 0) {
      return;
    }

    const task = this.loadingQueue.shift();
    this.loadingCount++;

    try {
      await this.loadImageFromTauri(task);
    } catch (error) {
      console.warn('图片加载失败:', error);
      task.iconElement.src = task.defaultIcon;
      task.iconElement.style.opacity = '1';
    } finally {
      this.loadingCount--;
      task.resolve();
      // 继续处理队列
      this.processQueue();
    }
  }

  // 从 Tauri 加载图片
  async loadImageFromTauri({ iconElement, filePath, defaultIcon }) {
    try {
      if (!window.__TAURI__ || !window.__TAURI__.core) {
        throw new Error('Tauri API 不可用');
      }

      const imageDataUrl = await window.__TAURI__.core.invoke('read_image_file', {
        filePath: filePath
      });

      // 保存到缓存
      this.saveToCache(filePath, imageDataUrl);

      // 设置图片
      iconElement.src = imageDataUrl;
      iconElement.style.opacity = '1';

    } catch (error) {
      throw error;
    }
  }

  // 清理缓存
  clearCache() {
    this.cache.clear();
  }

  // 获取缓存统计
  getCacheStats() {
    return {
      size: this.cache.size,
      loadingCount: this.loadingCount,
      queueLength: this.loadingQueue.length
    };
  }
}

// 全局图片加载管理器实例
const imageLoadManager = new ImageLoadManager();

/**
 * 设置文件图标，支持直接访问图片文件
 */
function setFileIcon(iconElement, file, defaultIcon = null) {
  const defaultIconData = defaultIcon || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBmaWxsPSIjQ0NDQ0NDIi8+Cjwvc3ZnPgo=';

  if (!file.icon_data) {
    iconElement.src = defaultIconData;
    return;
  }

  // 检查是否是图片文件路径格式（以 image_file:// 开头）
  if (file.icon_data.startsWith('image_file://')) {
    const filePath = file.icon_data.substring(13); // 移除 'image_file://' 前缀

    // 设置图片样式，确保缩略图效果
    iconElement.style.objectFit = 'cover';
    iconElement.style.borderRadius = '2px';

    // 使用优化的懒加载机制
    imageLoadManager.lazyLoadImage(iconElement, filePath, defaultIconData);

  } else {
    // 使用原有的base64数据
    iconElement.src = file.icon_data;
    iconElement.style.objectFit = 'contain';
    iconElement.style.borderRadius = '0';
  }
}

/**
 * 清理图片缓存
 */
function clearImageCache() {
  imageLoadManager.clearCache();
}

/**
 * 获取图片缓存统计信息
 */
function getImageCacheStats() {
  return imageLoadManager.getCacheStats();
}

/**
 * 预加载图片（可选功能）
 * @param {string} filePath - 文件路径
 */
async function preloadImage(filePath) {
  const cached = imageLoadManager.getFromCache(filePath);
  if (!cached) {
    try {
      const imageDataUrl = await window.__TAURI__.core.invoke('read_image_file', {
        filePath: filePath
      });
      imageLoadManager.saveToCache(filePath, imageDataUrl);
    } catch (error) {
      console.warn('预加载图片失败:', error);
    }
  }
}

/**
 * 检查文件是否为图片类型
 */
function isImageFile(file) {
  if (!file.file_type) return false;

  const imageExtensions = ['JPG', 'JPEG', 'PNG', 'GIF', 'BMP', 'WEBP', 'TIFF', 'TIF', 'ICO', 'SVG'];
  return imageExtensions.includes(file.file_type.toUpperCase());
}

/**
 * 创建文件图标元素
 */
function createFileIconElement(file, size = 'medium') {
  const iconElement = document.createElement('img');
  iconElement.className = 'file-icon';
  iconElement.alt = file.file_type || '文件';

  // 根据大小设置尺寸
  const sizeMap = {
    small: '16px',
    medium: '20px',
    large: '24px'
  };

  const iconSize = sizeMap[size] || sizeMap.medium;
  iconElement.style.width = iconSize;
  iconElement.style.height = iconSize;

  // 设置图标
  setFileIcon(iconElement, file);

  return iconElement;
}

// 导出函数供其他模块使用
export {
  setFileIcon,
  isImageFile,
  createFileIconElement,
  clearImageCache,
  getImageCacheStats,
  preloadImage
};

// 同时将函数添加到全局作用域，以便在非模块环境中使用
if (typeof window !== 'undefined') {
  window.setFileIcon = setFileIcon;
  window.isImageFile = isImageFile;
  window.createFileIconElement = createFileIconElement;
  window.clearImageCache = clearImageCache;
  window.getImageCacheStats = getImageCacheStats;
  window.preloadImage = preloadImage;
  window.imageLoadManager = imageLoadManager; // 调试用

  // 页面卸载时清理资源
  window.addEventListener('beforeunload', () => {
    if (imageLoadManager.observer) {
      imageLoadManager.observer.disconnect();
    }
  });

  // 定期清理缓存（可选）
  setInterval(() => {
    const stats = imageLoadManager.getCacheStats();
    if (stats.size > 50) {
      console.log('图片缓存统计:', stats);
    }
  }, 60000); // 每分钟检查一次
}
