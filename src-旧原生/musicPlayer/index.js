// 音频播放器主入口文件
import { clipboardHistory, quickTexts } from '../js/config.js';
import { showNotification as notify } from '../js/notificationManager.js';
import { playerState, setState } from './state.js';
import { restorePlayerState, savePlayerState } from './storage.js';
import { extractAudioFiles } from './audioExtractor.js';
import { initFolders, scanFoldersForAudio, getCustomFolders } from './folderManager.js';
import { preloadMetadataBatch } from './metadataCache.js';
import { LIST_TYPES } from './constants.js';
import {
  createAudioElement,
  initTitleIcon,
  createMusicPanel,
  enableMusicIcon,
  disableMusicIcon,
  updateTabCount,
  renderAudioList,
  updateRepeatButton,
  updatePlayModeButton,
  highlightMissingFiles,
  highlightSelectedList,
  audioElement
} from './ui.js';
import { bindAudioEvents } from './player.js';
import { setupEventListeners, handleMusicItemClick, handlePlayButtonClick } from './events.js';

export const showNotification = notify;

/**
 * 初始化音频播放器
 */
export function initMusicPlayer() {
  // 创建UI元素
  createAudioElement();
  initTitleIcon();
  createMusicPanel();
  
  // 初始化文件夹
  initFolders();
  
  // 绑定音频事件
  bindAudioEvents();
  
  // 设置事件监听器
  setupEventListeners();
  
  // 从localStorage恢复状态
  restorePlayerState();
  
  // 应用恢复的状态
  if (audioElement) {
    audioElement.volume = playerState.volume;
    const volumeRange = document.querySelector('#music-volume-range');
    if (volumeRange) {
      volumeRange.value = playerState.volume * 100;
      volumeRange.style.setProperty('--volume-percent', `${playerState.volume * 100}%`);
    }
  }
  
  updateRepeatButton();
  updatePlayModeButton();
  
  // 标记为已初始化
  playerState._initialized = true;
  
  // 如果启用了播放器，激活标题图标
  if (playerState.enabled) {
    enableMusicIcon();
  }
  
  setTimeout(() => {
    if (window.toolManager && window.toolManager.updateToolState) {
      window.toolManager.updateToolState('music-player-button', playerState.enabled);
    }
  }, 100);
}

/**
 * 刷新音频文件列表
 */
export async function refreshAudioList(force = false) {
  if (!force && (!playerState.enabled || !playerState.isPanelExpanded)) {
    return;
  }
  
  const clipboardAudioFiles = extractAudioFiles(clipboardHistory);
  const quickTextsAudioFiles = extractAudioFiles(quickTexts);
  
  // 扫描自定义文件夹
  const customFolderAudioFiles = await scanFoldersForAudio();
  
  // 更新计数
  updateTabCount(LIST_TYPES.CLIPBOARD, clipboardAudioFiles.length);
  updateTabCount(LIST_TYPES.QUICK_TEXTS, quickTextsAudioFiles.length);
  updateTabCount(LIST_TYPES.CUSTOM_FOLDER, customFolderAudioFiles.length);
  
  // 渲染列表
  renderAudioList(
    LIST_TYPES.CLIPBOARD, 
    clipboardAudioFiles,
    handleMusicItemClick,
    handlePlayButtonClick
  );
  renderAudioList(
    LIST_TYPES.QUICK_TEXTS, 
    quickTextsAudioFiles,
    handleMusicItemClick,
    handlePlayButtonClick
  );
  renderAudioList(
    LIST_TYPES.CUSTOM_FOLDER,
    customFolderAudioFiles,
    handleMusicItemClick,
    handlePlayButtonClick
  );
  
  // 渲染文件夹列表
  renderFolderList();
  
  // 更新当前音频文件列表
  let currentFiles = [];
  const playbackList = playerState.currentList || LIST_TYPES.CLIPBOARD;

  if (playbackList === LIST_TYPES.CLIPBOARD) {
    currentFiles = clipboardAudioFiles;
  } else if (playbackList === LIST_TYPES.QUICK_TEXTS) {
    currentFiles = quickTextsAudioFiles;
  } else {
    currentFiles = customFolderAudioFiles;
  }
  
  setState('audioFiles', currentFiles);

  const selectedList = playerState.selectedList || playbackList;
  highlightSelectedList(selectedList);
  
  highlightMissingFiles();

  // 异步预加载元数据
  if (currentFiles.length > 0) {
    const filePaths = currentFiles.map(f => f.filePath);
    preloadMetadataBatch(filePaths);
  }
}

/**
 * 渲染文件夹列表
 */
function renderFolderList() {
  const container = document.querySelector('.music-list-container[data-list="custom-folder"]');
  if (!container) return;
  
  const folderList = container.querySelector('.folder-list');
  const folders = getCustomFolders();
  
  if (folders.length === 0) {
    folderList.innerHTML = '';
    return;
  }
  
  const html = folders.map(folder => `
    <div class="folder-item">
      <div class="folder-item-icon">
        <i class="ti ti-folder-music"></i>
      </div>
      <div class="folder-item-info">
        <div class="folder-item-name">${escapeHtml(folder.name)}</div>
        <div class="folder-item-path">${escapeHtml(folder.path)}</div>
      </div>
      <div class="folder-item-actions">
        <button class="folder-action-btn delete-btn" data-folder-path="${escapeHtml(folder.path)}" title="删除">
          <i class="ti ti-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
  
  folderList.innerHTML = html;
  
  // 绑定删除事件
  const deleteButtons = folderList.querySelectorAll('.delete-btn');
  deleteButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const folderPath = btn.getAttribute('data-folder-path');
      const { removeFolder } = await import('./folderManager.js');
      
      if (removeFolder(folderPath)) {
        showNotification('文件夹已删除', 'success');
        refreshAudioList(true);
      }
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 切换音频播放器开关
 */
export function toggleMusicPlayer() {
  setState('enabled', !playerState.enabled);
  
  if (playerState.enabled) {
    enableMusicIcon();
    showNotification('音频播放器已开启，点击左上角图标打开', 'success');
  } else {
    disableMusicIcon();
    
    // 停止播放
    if (playerState.isPlaying && audioElement) {
      audioElement.pause();
    }
    
    showNotification('音频播放器已关闭', 'info');
  }
  
  savePlayerState();
}

/**
 * 获取播放器状态
 */
export function getMusicPlayerState() {
  // 如果还未初始化，直接从 localStorage 读取
  if (playerState.enabled === false && !playerState._initialized) {
    try {
      const saved = localStorage.getItem('music-player-state');
      if (saved) {
        const state = JSON.parse(saved);
        return state.enabled || false;
      }
    } catch (error) {
      // 读取失败，返回默认值
    }
  }
  return playerState.enabled;
}

/**
 * 设置播放器状态
 */
export function setMusicPlayerState(enabled) {
  setState('enabled', enabled);
  
  if (enabled) {
    enableMusicIcon();
  } else {
    disableMusicIcon();
    if (playerState.isPlaying && audioElement) {
      audioElement.pause();
    }
  }
  
  savePlayerState();
}

// 导出供其他模块使用
export { refreshAudioList as default };

