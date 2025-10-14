// 文件图标工具函数
import { convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentSettings } from '../settings/js/settingsManager.js';

/**
 * 设置文件图标，支持直接访问图片文件
 */
function setFileIcon(iconElement, file, defaultIcon = null) {
  const defaultIconData = defaultIcon || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBmaWxsPSIjQ0NDQ0NDIi8+Cjwvc3ZnPgo=';

  // 检查是否是图片文件且启用了预览
  const settings = getCurrentSettings();
  const isImageFile = ['PNG', 'JPG', 'JPEG', 'GIF', 'BMP', 'WEBP', 'ICO'].includes(file.file_type?.toUpperCase());
  
  if (isImageFile && settings.showImagePreview && file.path) {
    // 使用文件路径直接加载图片预览
    iconElement.src = convertFileSrc(file.path, 'asset');
    iconElement.style.objectFit = 'cover';
    iconElement.style.borderRadius = '2px';
  } else if (file.icon_data) {
    // 使用图标数据（base64）
    iconElement.src = file.icon_data;
    iconElement.style.objectFit = 'contain';
    iconElement.style.borderRadius = '0';
  } else {
    iconElement.src = defaultIconData;
  }
}

/**
 * 检查文件是否为图片类型
 */
function isImageFile(file) {
  const imageExtensions = ['PNG', 'JPG', 'JPEG', 'GIF', 'BMP', 'WEBP', 'ICO', 'SVG'];
  return imageExtensions.includes(file.file_type?.toUpperCase());
}

/**
 * 创建文件图标元素
 */
function createFileIconElement(file) {
  const iconElement = document.createElement('img');
  iconElement.classList.add('file-icon');
  iconElement.alt = file.name || 'File';

  // 设置图标
  setFileIcon(iconElement, file);

  return iconElement;
}

// 导出函数供其他模块使用
export {
  setFileIcon,
  isImageFile,
  createFileIconElement
};

if (typeof window !== 'undefined') {
  window.setFileIcon = setFileIcon;
  window.isImageFile = isImageFile;
  window.createFileIconElement = createFileIconElement;
}