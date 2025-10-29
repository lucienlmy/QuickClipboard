// 音乐文件夹管理模块
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { FOLDERS_STORAGE_KEY } from './constants.js';
import { isAudioFile, getFileName } from './audioExtractor.js';

// 文件夹列表
let customFolders = [];

/**
 * 初始化文件夹列表
 */
export function initFolders() {
  restoreFolders();
}

/**
 * 获取所有文件夹
 */
export function getCustomFolders() {
  return customFolders;
}

/**
 * 添加文件夹
 */
export async function addFolder() {
  try {
    // 打开文件夹选择对话框
    const selected = await open({
      directory: true,
      multiple: false,
      title: '选择音乐文件夹'
    });
    
    if (selected && typeof selected === 'string') {
      // 检查是否已存在
      if (customFolders.some(f => f.path === selected)) {
        return { success: false, message: '该文件夹已存在' };
      }
      
      // 添加文件夹
      customFolders.push({
        path: selected,
        name: getFolderName(selected),
        addedAt: Date.now()
      });
      
      // 保存到本地存储
      saveFolders();
      
      return { success: true, folder: selected };
    }
    
    return { success: false, message: '未选择文件夹' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * 移除文件夹
 */
export function removeFolder(folderPath) {
  const index = customFolders.findIndex(f => f.path === folderPath);
  if (index > -1) {
    customFolders.splice(index, 1);
    saveFolders();
    return true;
  }
  return false;
}

/**
 * 扫描文件夹中的音频文件
 */
export async function scanFoldersForAudio() {
  const audioFiles = [];
  
  if (customFolders.length === 0) {
    return audioFiles;
  }
  
  for (const folder of customFolders) {
    try {
      // 调用后端扫描文件夹
      const files = await invoke('scan_folder_for_audio', { 
        folderPath: folder.path 
      });
      
      files.forEach((filePath, index) => {
        audioFiles.push({
          originalIndex: audioFiles.length,
          filePath: filePath,
          fileName: getFileName(filePath),
          folderPath: folder.path,
          folderName: folder.name,
          timestamp: Date.now()
        });
      });
    } catch (error) {
    }
  }
  
  return audioFiles;
}

/**
 * 获取文件夹名称
 */
function getFolderName(folderPath) {
  const parts = folderPath.split(/[/\\]/);
  return parts[parts.length - 1] || folderPath;
}

/**
 * 保存文件夹列表
 */
function saveFolders() {
  try {
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(customFolders));
  } catch (error) {
    // 保存失败，静默处理
  }
}

/**
 * 恢复文件夹列表
 */
function restoreFolders() {
  try {
    const saved = localStorage.getItem(FOLDERS_STORAGE_KEY);
    if (saved) {
      customFolders = JSON.parse(saved);
    }
  } catch (error) {
    customFolders = [];
  }
}

/**
 * 清除所有文件夹
 */
export function clearAllFolders() {
  customFolders = [];
  saveFolders();
}

