// 音频播放器事件处理
import { playerState, setState } from './state.js';
import { LIST_TYPES } from './constants.js';
import { invoke } from '@tauri-apps/api/core';
import { musicPanel, titleIcon, hidePanel, showPanel, highlightSelectedList, updateMusicItemFileStatus } from './ui.js';
import { 
  togglePlayPause, 
  playPrevious, 
  playNext, 
  toggleRepeatMode,
  togglePlayMode,
  setVolume,
  seekToPosition,
  playAudioByIndex
} from './player.js';
import { refreshAudioList } from './index.js';

/**
 * 设置所有事件监听器
 */
export function setupEventListeners() {
  setupPanelEvents();
  setupControlEvents();
  setupProgressBarEvents();
}

/**
 * 设置面板事件
 */
function setupPanelEvents() {
  // 音乐图标点击
  if (titleIcon) {
    const musicWrapper = titleIcon.querySelector('.music-icon-wrapper');
    if (musicWrapper) {
      musicWrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel();
      });
    }
  }
  
  // 关闭按钮
  const closeBtn = musicPanel.querySelector('.music-panel-close');
  closeBtn?.addEventListener('click', hidePanel);
  
  // 刷新按钮
  const refreshBtn = musicPanel.querySelector('.music-panel-refresh');
  refreshBtn?.addEventListener('click', () => {
    refreshAudioList(true);
    import('./index.js').then(({ showNotification }) => {
      showNotification('已刷新音频列表', 'success');
    });
  });
  
  // 标签切换
  const tabButtons = musicPanel.querySelectorAll('.music-tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchMusicTab(tab);
    });
  });
  
  // 添加文件夹按钮
  const addFolderBtn = musicPanel.querySelector('#add-music-folder-btn');
  addFolderBtn?.addEventListener('click', async () => {
    const { addFolder } = await import('./folderManager.js');
    const result = await addFolder();
    
    if (result.success) {
      import('./index.js').then(({ showNotification, refreshAudioList }) => {
        showNotification('文件夹已添加', 'success');
        refreshAudioList(true);
      });
    } else if (result.message) {
      import('./index.js').then(({ showNotification }) => {
        showNotification(result.message, 'warning');
      });
    }
  });
  
  // 点击面板外部关闭
  document.addEventListener('click', (e) => {
    if (playerState.isPanelExpanded &&
        !musicPanel.contains(e.target) &&
        !titleIcon?.contains(e.target)) {
      hidePanel();
    }
  });
}

/**
 * 设置控制按钮事件
 */
function setupControlEvents() {
  const playBtn = musicPanel.querySelector('#music-play-btn');
  const prevBtn = musicPanel.querySelector('#music-prev-btn');
  const nextBtn = musicPanel.querySelector('#music-next-btn');
  const shuffleBtn = musicPanel.querySelector('#music-shuffle-btn');
  const repeatBtn = musicPanel.querySelector('#music-repeat-btn');
  const volumeBtn = musicPanel.querySelector('#music-volume-btn');
  
  playBtn?.addEventListener('click', togglePlayPause);
  prevBtn?.addEventListener('click', playPrevious);
  nextBtn?.addEventListener('click', playNext);
  shuffleBtn?.addEventListener('click', () => {
    togglePlayMode();
    import('./ui.js').then(({ updatePlayModeButton }) => {
      updatePlayModeButton();
    });
  });
  repeatBtn?.addEventListener('click', () => {
    toggleRepeatMode();
    import('./ui.js').then(({ updateRepeatButton }) => {
      updateRepeatButton();
    });
  });
  volumeBtn?.addEventListener('click', toggleVolumeSlider);
  
  // 音量控制
  const volumeRange = musicPanel.querySelector('#music-volume-range');
  volumeRange?.addEventListener('input', (e) => {
    const volume = e.target.value / 100;
    setVolume(volume);
  });
}

/**
 * 设置进度条事件
 */
function setupProgressBarEvents() {
  const progressBar = musicPanel.querySelector('.music-progress-bar');
  let isDragging = false;
  
  progressBar?.addEventListener('mousedown', (e) => {
    isDragging = true;
    handleProgressClick(e);
  });
  
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      handleProgressClick(e);
    }
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}


/**
 * 切换面板显示
 */
function togglePanel() {
  if (playerState.isPanelExpanded) {
    hidePanel();
  } else {
    showPanel();
    refreshAudioList(true);
  }
}

/**
 * 切换音乐标签页
 */
function switchMusicTab(tab) {
  setState('selectedList', tab);
  highlightSelectedList(tab);
  refreshAudioList(true);
}

async function prepareListForPlayback(listType) {
  if (!listType) {
    return playerState.audioFiles;
  }
  
  if (playerState.currentList === listType && playerState.audioFiles.length > 0) {
    return playerState.audioFiles;
  }
  
  setState('currentList', listType);
  setState('selectedList', listType);
  
  const { extractAudioFiles } = await import('./audioExtractor.js');
  const { scanFoldersForAudio } = await import('./folderManager.js');
  const { clipboardHistory, quickTexts } = await import('../js/config.js');
  const { LIST_TYPES } = await import('./constants.js');
  
  let currentFiles = [];
  if (listType === LIST_TYPES.CLIPBOARD) {
    currentFiles = extractAudioFiles(clipboardHistory);
  } else if (listType === LIST_TYPES.QUICK_TEXTS) {
    currentFiles = extractAudioFiles(quickTexts);
  } else if (listType === LIST_TYPES.CUSTOM_FOLDER) {
    currentFiles = await scanFoldersForAudio();
  }
  
  setState('audioFiles', currentFiles);
  return currentFiles;
}

/**
 * 切换音量滑块显示
 */
function toggleVolumeSlider() {
  const volumeSlider = musicPanel.querySelector('.music-volume-slider');
  const isVisible = volumeSlider.classList.contains('show');
  
  if (isVisible) {
    volumeSlider.classList.remove('show');
  } else {
    volumeSlider.classList.add('show');
  }
  
  // 点击其他地方关闭音量滑块
  if (!isVisible) {
    const closeVolumeSlider = (e) => {
      if (!volumeSlider.contains(e.target) && 
          !e.target.closest('#music-volume-btn')) {
        volumeSlider.classList.remove('show');
        document.removeEventListener('click', closeVolumeSlider);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closeVolumeSlider);
    }, 10);
  }
}

/**
 * 处理进度条点击
 */
function handleProgressClick(e) {
  const progressBar = musicPanel.querySelector('.music-progress-bar');
  const rect = progressBar.getBoundingClientRect();
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  seekToPosition(percent);
}

/**
 * 处理音乐项点击
 */
export async function handleMusicItemClick(index, listType, isMissing = false) {
  if (isMissing) {
    import('./index.js').then(({ showNotification }) => {
      showNotification('文件不存在，无法播放', 'warning');
    });
    return;
  }

  if (listType && playerState.currentList !== listType) {
    await prepareListForPlayback(listType);
  }

  const container = musicPanel.querySelector(`.music-list-container[data-list="${listType}"]`);
  const itemElement = container?.querySelector(`.music-item[data-index="${index}"]`);

  if (itemElement) {
    const exists = await updateMusicItemFileStatus(itemElement);
    if (!exists) {
      import('./index.js').then(({ showNotification }) => {
        showNotification('文件不存在，无法播放', 'warning');
      });
      return;
    }
  }

  playAudioByIndex(index);
}

/**
 * 处理播放按钮点击
 */
export async function handlePlayButtonClick(index, listType, isMissing = false) {
  if (isMissing) {
    import('./index.js').then(({ showNotification }) => {
      showNotification('文件不存在，无法播放', 'warning');
    });
    return;
  }

  // 如果点击的是当前播放的歌曲，切换播放/暂停
  if (playerState.currentList === listType && playerState.currentIndex === index) {
    togglePlayPause();
    return;
  }
  
  // 如果不是当前列表，先切换列表并等待完成
  if (playerState.currentList !== listType) {
    await prepareListForPlayback(listType);
    switchMusicTab(listType);
  }

  const container = musicPanel.querySelector(`.music-list-container[data-list="${listType}"]`);
  const itemElement = container?.querySelector(`.music-item[data-index="${index}"]`);

  if (itemElement) {
    const exists = await updateMusicItemFileStatus(itemElement);
    if (!exists) {
      import('./index.js').then(({ showNotification }) => {
        showNotification('文件不存在，无法播放', 'warning');
      });
      return;
    }
  }
  
  // 然后播放指定歌曲
  playAudioByIndex(index);
}

