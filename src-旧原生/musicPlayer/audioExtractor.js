// 音频文件提取器
import { AUDIO_EXTENSIONS } from './constants.js';

/**
 * 从列表中提取音频文件
 */
export function extractAudioFiles(list) {
  const audioFiles = [];
  
  if (!list || !Array.isArray(list)) {
    return audioFiles;
  }
  
  list.forEach((item, index) => {
    const contentType = item.content_type || item.contentType || item.type;
    
    if (contentType === 'file') {
      const filePaths = extractFilePaths(item);
      
      if (filePaths.length > 0) {
        filePaths.forEach(filePath => {
          if (isAudioFile(filePath)) {
            audioFiles.push({
              originalIndex: index,
              filePath: filePath,
              fileName: getFileName(filePath),
              timestamp: item.timestamp,
              item: item
            });
          }
        });
      }
    }
  });
  
  return audioFiles;
}

/**
 * 从剪贴板项中提取文件路径
 */
function extractFilePaths(item) {
  let filePaths = [];

  if (item.file_paths && Array.isArray(item.file_paths)) {
    return item.file_paths;
  }

  if (item.content && typeof item.content === 'string') {
    try {
      let jsonContent = item.content;
      if (jsonContent.startsWith('files:')) {
        jsonContent = jsonContent.substring(6);
      }

      const parsedContent = JSON.parse(jsonContent);

      if (parsedContent.files && Array.isArray(parsedContent.files)) {
        filePaths = parsedContent.files
          .filter(file => !file.is_directory)
          .map(file => file.path);
      }
    } catch (e) {

    }
  }
  
  return filePaths;
}

/**
 * 判断是否为音频文件
 */
export function isAudioFile(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }
  
  const lowerPath = filePath.toLowerCase();
  return AUDIO_EXTENSIONS.some(ext => lowerPath.endsWith(ext));
}

/**
 * 获取文件名
 */
export function getFileName(filePath) {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1];
}

/**
 * HTML转义
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 格式化时间
 */
export function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) {
    return '0:00';
  }
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}


