// 音频播放器 UI 管理
import { invoke } from '@tauri-apps/api/core';
import { playerState } from './state.js';
import { escapeHtml } from './audioExtractor.js';

// DOM 元素引用
export let titleIcon = null;
export let musicPanel = null;
export let audioElement = null;

/**
 * 创建音频元素
 */
export function createAudioElement() {
  audioElement = document.createElement('audio');
  audioElement.id = 'music-player-audio';
  audioElement.volume = playerState.volume;
  document.body.appendChild(audioElement);
  return audioElement;
}

/**
 * 获取标题栏图标元素并创建音乐图标
 */
export function initTitleIcon() {
  // 获取标题栏中的应用图标
  const appIcon = document.querySelector('.title-bar .title img');
  
  if (!appIcon) {
    return null;
  }
  
  // 获取 title 容器
  const titleContainer = document.querySelector('.title-bar .title');
  if (!titleContainer) {
    return null;
  }
  
  // 添加原始图标类
  appIcon.classList.add('app-original-icon');
  
  // 创建音乐图标元素
  const musicIconWrapper = document.createElement('div');
  musicIconWrapper.className = 'music-icon-wrapper';
  musicIconWrapper.innerHTML = '<i class="ti ti-music music-icon-main"></i>';
  musicIconWrapper.style.display = 'none';
  
  // 插入到 title 容器中
  titleContainer.appendChild(musicIconWrapper);
  
  // 保存引用
  titleIcon = titleContainer;
  
  return titleIcon;
}

/**
 * 创建音乐面板
 */
export function createMusicPanel() {
  musicPanel = document.createElement('div');
  musicPanel.id = 'music-panel';
  musicPanel.className = 'music-panel';
  musicPanel.style.display = 'none';
  
  musicPanel.innerHTML = `
    <div class="music-panel-header">
      <div class="music-panel-title">
        <i class="ti ti-music"></i>
        <span>音频播放器</span>
      </div>
      <div class="music-panel-actions">
        <button class="music-panel-refresh" title="刷新列表">
          <i class="ti ti-refresh"></i>
        </button>
        <button class="music-panel-close" title="关闭">
          <i class="ti ti-x"></i>
        </button>
      </div>
    </div>
    
    <div class="music-panel-tabs">
      <button class="music-tab-btn active" data-tab="clipboard">
        <i class="ti ti-clipboard"></i>
        剪贴板
        <span class="tab-count">0</span>
      </button>
      <button class="music-tab-btn" data-tab="quick-texts">
        <i class="ti ti-star"></i>
        常用
        <span class="tab-count">0</span>
      </button>
      <button class="music-tab-btn" data-tab="custom-folder">
        <i class="ti ti-folder-music"></i>
        文件夹
        <span class="tab-count">0</span>
      </button>
    </div>
    
    <div class="music-panel-content">
      <div class="music-list-container active" data-list="clipboard">
        <div class="music-list-empty">
          <i class="ti ti-music-off"></i>
          <p>剪贴板中没有音频文件</p>
        </div>
        <div class="music-list"></div>
      </div>
      <div class="music-list-container" data-list="quick-texts">
        <div class="music-list-empty">
          <i class="ti ti-music-off"></i>
          <p>常用中没有音频文件</p>
        </div>
        <div class="music-list"></div>
      </div>
      <div class="music-list-container" data-list="custom-folder">
        <div class="music-list-empty">
          <i class="ti ti-folder-plus"></i>
          <p>暂无音乐文件夹</p>
          <button class="add-folder-btn" id="add-music-folder-btn">
            <i class="ti ti-folder-plus"></i>
            添加文件夹
          </button>
        </div>
        <div class="folder-list"></div>
        <div class="music-list"></div>
      </div>
    </div>
      
      <div class="music-player-controls">
        <div class="music-progress-container">
          <div class="music-progress-header">
            <div class="music-title-scroll">
              <div class="music-title">未播放</div>
            </div>
            <div class="music-time">
              <span class="current-time">0:00</span>
              <span class="total-time">0:00</span>
            </div>
          </div>
          <div class="music-progress-bar">
            <div class="music-progress-fill"></div>
            <div class="music-progress-handle"></div>
          </div>
        </div>
        
        <div class="music-controls-main">
          <div class="music-info">
            <div class="music-cover">
              <i class="ti ti-music"></i>
            </div>
            <div class="music-details">
              <div class="music-artist-scroll">
                <div class="music-artist">未知艺术家</div>
              </div>
            </div>
          </div>
          
          <div class="music-control-buttons">
            <button class="music-control-btn" id="music-shuffle-btn" title="播放模式: 顺序播放">
              <i class="ti ti-arrows-shuffle"></i>
            </button>
            <button class="music-control-btn" id="music-prev-btn" title="上一首">
              <i class="ti ti-player-skip-back"></i>
            </button>
            <button class="music-control-btn music-play-btn" id="music-play-btn" title="播放">
              <i class="ti ti-player-play"></i>
            </button>
            <button class="music-control-btn" id="music-next-btn" title="下一首">
              <i class="ti ti-player-skip-forward"></i>
            </button>
            <button class="music-control-btn" id="music-repeat-btn" title="循环模式: 不循环">
              <i class="ti ti-repeat-off"></i>
            </button>
            <button class="music-control-btn" id="music-volume-btn" title="音量">
              <i class="ti ti-volume"></i>
              <div class="music-volume-slider">
                <input type="range" min="0" max="100" value="70" id="music-volume-range">
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(musicPanel);
  return musicPanel;
}

/**
 * 启用/禁用音频播放器图标
 */
export function enableMusicIcon() {
  if (!titleIcon) return;
  
  const appIcon = titleIcon.querySelector('.app-original-icon');
  const musicWrapper = titleIcon.querySelector('.music-icon-wrapper');
  
  if (appIcon && musicWrapper) {
    // 隐藏应用图标，显示音乐图标
    appIcon.classList.add('minimized');
    musicWrapper.style.display = 'flex';
    
    // 添加状态类
    titleIcon.classList.add('music-enabled');
    musicWrapper.title = '音频播放器（点击打开）';
    
    // 检查当前是否有播放的音乐，如果有则加载封面
    if (playerState.currentIndex >= 0 && playerState.audioFiles.length > 0) {
      const currentAudio = playerState.audioFiles[playerState.currentIndex];
      if (currentAudio) {
        restoreTitleIconCover(currentAudio);
      }
    }
  }
}

/**
 * 恢复左上角图标的封面
 */
async function restoreTitleIconCover(audioFile) {
  try {
    const { getAudioMetadata } = await import('./metadataCache.js');
    const metadata = await getAudioMetadata(audioFile.filePath);
    
    const musicWrapper = titleIcon?.querySelector('.music-icon-wrapper');
    if (musicWrapper && metadata.cover_data) {
      musicWrapper.innerHTML = `<img src="${metadata.cover_data}" alt="封面" class="music-title-cover">`;
      musicWrapper.classList.add('has-cover');
    }
  } catch (error) {
    // 加载失败，保持默认图标
  }
}

export function disableMusicIcon() {
  if (!titleIcon) return;
  
  const appIcon = titleIcon.querySelector('.app-original-icon');
  const musicWrapper = titleIcon.querySelector('.music-icon-wrapper');
  
  if (appIcon && musicWrapper) {
    // 显示应用图标，隐藏音乐图标
    appIcon.classList.remove('minimized');
    musicWrapper.style.display = 'none';
    
    // 移除状态类
    titleIcon.classList.remove('music-enabled', 'music-playing', 'panel-open');
    musicWrapper.classList.remove('has-cover');
    musicWrapper.title = '';
    
    // 恢复默认音乐图标
    musicWrapper.innerHTML = '<i class="ti ti-music music-icon-main"></i>';
  }
}

/**
 * 显示/隐藏面板
 */
export function showPanel() {
  if (!musicPanel) return;
  
  musicPanel.style.display = 'flex';
  playerState.isPanelExpanded = true;
  
  if (titleIcon) {
    const musicWrapper = titleIcon.querySelector('.music-icon-wrapper');
    if (musicWrapper) {
      musicWrapper.classList.add('panel-open');
    }
  }
  
  setTimeout(() => {
    musicPanel.classList.add('show');
  }, 10);
}

export function hidePanel() {
  if (!musicPanel) return;
  
  musicPanel.classList.remove('show');
  playerState.isPanelExpanded = false;
  
  if (titleIcon) {
    const musicWrapper = titleIcon.querySelector('.music-icon-wrapper');
    if (musicWrapper) {
      musicWrapper.classList.remove('panel-open');
    }
  }
  
  setTimeout(() => {
    musicPanel.style.display = 'none';
  }, 300);
}

/**
 * 更新标签计数
 */
export function updateTabCount(tab, count) {
  if (!musicPanel) return;
  
  const tabBtn = musicPanel.querySelector(`.music-tab-btn[data-tab="${tab}"]`);
  if (tabBtn) {
    const countSpan = tabBtn.querySelector('.tab-count');
    countSpan.textContent = count;
  }
}

export function highlightSelectedList(selectedList) {
  if (!musicPanel || !selectedList) return;

  const tabButtons = musicPanel.querySelectorAll('.music-tab-btn');
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === selectedList);
  });

  const listContainers = musicPanel.querySelectorAll('.music-list-container');
  listContainers.forEach(container => {
    container.classList.toggle('active', container.getAttribute('data-list') === selectedList);
  });
}

export function highlightMissingFiles() {
  if (!musicPanel) return;

  const items = musicPanel.querySelectorAll('.music-item');
  if (items.length === 0) return;

  items.forEach(item => {
    const audioIndex = Number(item.getAttribute('data-index'));
    const audioList = playerState.audioFiles;
    const isMissing = audioIndex >= 0 && audioList[audioIndex]?.fileMissing;
    applyMissingStyles(item, Boolean(isMissing));
  });
}

export async function updateMusicItemFileStatus(item) {
  const filePath = item.getAttribute('data-file-path');
  if (!filePath) {
    applyMissingStyles(item, false);
    return true;
  }

  let exists = true;
  try {
    exists = await invoke('file_exists', { path: filePath });
  } catch (error) {
    // 调用失败时，保守地认为存在以避免误报
    exists = true;
  }

  applyMissingStyles(item, !exists);
  return exists;
}

function applyMissingStyles(item, isMissing) {
  item.classList.toggle('file-missing', isMissing);
  item.setAttribute('data-file-missing', isMissing ? 'true' : 'false');

  const artistElement = item.querySelector('.music-item-artist');
  if (artistElement) {
    if (isMissing) {
      artistElement.textContent = '文件不存在';
    } else if (artistElement.textContent === '文件不存在' || !artistElement.textContent) {
      artistElement.textContent = '加载中...';
    }
  }

  const playButton = item.querySelector('.music-item-play');
  const icon = playButton?.querySelector('i');

  if (playButton) {
    playButton.title = isMissing ? '文件不存在' : '播放';
    playButton.disabled = isMissing;
  }

  if (icon) {
    if (isMissing) {
      icon.className = 'ti ti-alert-triangle';
    } else {
      const isActive = item.classList.contains('active');
      icon.className = `ti ${isActive && playerState.isPlaying ? 'ti-player-pause' : 'ti-player-play'}`;
    }
  }

  const listType = item.getAttribute('data-list');
  const index = Number(item.getAttribute('data-index'));
  if (!Number.isNaN(index) && listType === playerState.currentList && playerState.audioFiles[index]) {
    playerState.audioFiles[index].fileMissing = isMissing;
  }
}

/**
 * 渲染音频列表
 */
export function renderAudioList(listType, audioFiles, onItemClick, onPlayClick) {
  if (!musicPanel) return;
  
  const container = musicPanel.querySelector(`.music-list-container[data-list="${listType}"]`);
  const musicList = container.querySelector('.music-list');
  const emptyMessage = container.querySelector('.music-list-empty');
  
  if (audioFiles.length === 0) {
    musicList.innerHTML = '';
    emptyMessage.style.display = 'flex';
    return;
  }
  
  emptyMessage.style.display = 'none';
  
  const html = audioFiles.map((audio, index) => {
    const isActive = playerState.currentList === listType &&
                     playerState.currentIndex === index;
    const isMissing = Boolean(audio.fileMissing);
    const title = escapeHtml(audio.fileName);
    const artistText = isMissing ? '文件不存在' : '加载中...';
    const playTitle = isMissing ? '文件不存在' : '播放';
    const iconClass = isMissing ? 'ti ti-alert-triangle' : `ti ${isActive && playerState.isPlaying ? 'ti-player-pause' : 'ti-player-play'}`;
    const disabledAttr = isMissing ? 'disabled' : '';
    
    return `
      <div class="music-item ${isActive ? 'active' : ''} ${isMissing ? 'file-missing' : ''}" data-index="${index}" data-file-path="${escapeHtml(audio.filePath)}" data-file-missing="${isMissing ? 'true' : 'false'}" data-list="${listType}">
        <div class="music-item-icon">
          <i class="ti ti-music"></i>
        </div>
        <div class="music-item-info">
          <div class="music-item-title">${title}</div>
          <div class="music-item-artist">${artistText}</div>
        </div>
        <button class="music-item-play" title="${playTitle}" ${disabledAttr}>
          <i class="${iconClass}"></i>
        </button>
      </div>
    `;
  }).join('');
  
  musicList.innerHTML = html;
  
  // 绑定事件
  const musicItems = musicList.querySelectorAll('.music-item');
  musicItems.forEach((item, index) => {
    updateMusicItemFileStatus(item);
    
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.music-item-play')) {
        const isMissing = item.getAttribute('data-file-missing') === 'true';
        onItemClick(index, listType, isMissing);
      }
    });
    
    const playBtn = item.querySelector('.music-item-play');
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isMissing = item.getAttribute('data-file-missing') === 'true';
      onPlayClick(index, listType, isMissing);
    });
  });
  
  // 异步加载所有音频的元数据
  loadListMetadata(musicList, audioFiles);
}

/**
 * 更新音乐信息显示
 */
export function updateMusicInfo(audioFile) {
  if (!musicPanel) return;
  
  const titleElement = musicPanel.querySelector('.music-title');
  const artistElement = musicPanel.querySelector('.music-artist');
  const coverElement = musicPanel.querySelector('.music-cover');
  
  // 显示文件名
  titleElement.textContent = audioFile.fileName;
  titleElement.title = audioFile.fileName;
  
  // 重置艺术家显示
  if (artistElement) {
    artistElement.textContent = '未知艺术家';
  }
  
  // 重置封面
  if (coverElement) {
    coverElement.innerHTML = '<i class="ti ti-music"></i>';
  }
  
  // 检查文本是否溢出，启用滚动
  checkTextOverflow();
  
  // 异步加载元数据
  loadAndUpdateMetadata(audioFile);
}

/**
 * 检查文本是否溢出，启用滚动动画
 */
function checkTextOverflow() {
  requestAnimationFrame(() => {
    const titleScroll = musicPanel.querySelector('.music-title-scroll');
    const titleElement = musicPanel.querySelector('.music-title');
    const artistScroll = musicPanel.querySelector('.music-artist-scroll');
    const artistElement = musicPanel.querySelector('.music-artist');
    
    // 检查歌名
    if (titleScroll && titleElement) {
      const containerWidth = titleScroll.offsetWidth;
      const textWidth = titleElement.scrollWidth;
      
      if (textWidth > containerWidth + 5) {
        titleScroll.classList.add('text-overflow');
        titleElement.style.setProperty('--container-width', containerWidth + 'px');
      } else {
        titleScroll.classList.remove('text-overflow');
      }
    }
    
    // 检查艺术家
    if (artistScroll && artistElement) {
      const containerWidth = artistScroll.offsetWidth;
      const textWidth = artistElement.scrollWidth;
      
      if (textWidth > containerWidth + 5) {
        artistScroll.classList.add('text-overflow');
        artistElement.style.setProperty('--container-width', containerWidth + 'px');
      } else {
        artistScroll.classList.remove('text-overflow');
      }
    }
  });
}

/**
 * 异步加载并更新元数据
 */
async function loadAndUpdateMetadata(audioFile) {
  try {
    const { getAudioMetadata } = await import('./metadataCache.js');
    const metadata = await getAudioMetadata(audioFile.filePath);
    
    // 更新标题
    const titleElement = document.querySelector('.music-title');
    if (titleElement && metadata.title) {
      titleElement.textContent = metadata.title;
      titleElement.title = metadata.title;
    }
    
    // 更新艺术家
    const artistElement = document.querySelector('.music-artist');
    if (artistElement) {
      if (metadata.artist) {
        artistElement.textContent = metadata.artist;
      } else {
        artistElement.textContent = '未知艺术家';
      }
    }
    
    // 元数据更新后重新检查文本溢出
    setTimeout(() => checkTextOverflow(), 200);
    
    // 更新播放器信息区封面
    const coverElement = document.querySelector('.music-cover');
    if (coverElement && metadata.cover_data) {
      coverElement.innerHTML = `<img src="${metadata.cover_data}" alt="封面">`;
    }
    
    // 更新左上角音乐图标为封面
    const musicWrapper = titleIcon?.querySelector('.music-icon-wrapper');
    if (musicWrapper && metadata.cover_data) {
      musicWrapper.innerHTML = `<img src="${metadata.cover_data}" alt="封面" class="music-title-cover">`;
      musicWrapper.classList.add('has-cover');
    } else if (musicWrapper) {
      musicWrapper.innerHTML = '<i class="ti ti-music music-icon-main"></i>';
      musicWrapper.classList.remove('has-cover');
    }
  } catch (error) {
    // 加载失败，保持默认显示
  }
}

/**
 * 异步加载列表元数据
 */
async function loadListMetadata(musicList, audioFiles) {
  if (!musicList || audioFiles.length === 0) return;
  
  try {
    const { getAudioMetadata } = await import('./metadataCache.js');
    
    // 逐个加载元数据
    for (let i = 0; i < audioFiles.length; i++) {
      const audio = audioFiles[i];
      const item = musicList.querySelector(`.music-item[data-index="${i}"]`);
      
      if (!item) continue;
      
      // 异步加载
      getAudioMetadata(audio.filePath).then(metadata => {
        const titleElement = item.querySelector('.music-item-title');
        const artistElement = item.querySelector('.music-item-artist');
        const iconElement = item.querySelector('.music-item-icon');
        
        // 更新标题
        if (titleElement && metadata.title) {
          titleElement.textContent = metadata.title;
          titleElement.title = metadata.title;
        }
        
        // 更新艺术家
        if (artistElement) {
          if (metadata.artist) {
            artistElement.textContent = metadata.artist;
          } else {
            artistElement.textContent = '';
          }
        }
        
        // 更新封面
        if (iconElement && metadata.cover_data) {
          iconElement.innerHTML = `<img src="${metadata.cover_data}" alt="" class="music-item-cover-img">`;
        }
      }).catch(() => {
        const artistElement = item.querySelector('.music-item-artist');
        if (artistElement) {
          artistElement.textContent = '';
        }
      });

      if (i < audioFiles.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  } catch (error) {
    // 加载失败，静默处理
  }
}

/**
 * 更新播放按钮状态
 */
export function updatePlayButton() {
  if (!musicPanel) return;
  
  const playBtn = musicPanel.querySelector('#music-play-btn');
  const icon = playBtn.querySelector('i');
  
  if (playerState.isPlaying) {
    icon.className = 'ti ti-player-pause';
    playBtn.title = '暂停';
    // 音乐图标添加播放动画
    if (titleIcon) {
      const musicWrapper = titleIcon.querySelector('.music-icon-wrapper');
      if (musicWrapper) {
        musicWrapper.classList.add('is-playing');
      }
    }
  } else {
    icon.className = 'ti ti-player-play';
    playBtn.title = '播放';
    // 移除播放动画
    if (titleIcon) {
      const musicWrapper = titleIcon.querySelector('.music-icon-wrapper');
      if (musicWrapper) {
        musicWrapper.classList.remove('is-playing');
      }
    }
  }
}

/**
 * 更新激活的音乐项
 */
export function updateActiveItem(listType) {
  if (!musicPanel) return;
  
  const container = musicPanel.querySelector(`.music-list-container[data-list="${listType}"]`);
  if (!container) return;
  
  const items = container.querySelectorAll('.music-item');
  items.forEach((item, index) => {
    const isActive = index === playerState.currentIndex;
    item.classList.toggle('active', isActive);
    
    const playBtn = item.querySelector('.music-item-play i');
    if (isActive && playerState.isPlaying) {
      playBtn.className = 'ti ti-player-pause';
    } else {
      playBtn.className = 'ti ti-player-play';
    }
  });
}

/**
 * 更新循环模式按钮
 */
export function updateRepeatButton() {
  if (!musicPanel) return;
  
  const repeatBtn = musicPanel.querySelector('#music-repeat-btn');
  if (!repeatBtn) return;
  
  const icon = repeatBtn.querySelector('i');
  
  switch (playerState.repeatMode) {
    case 'none':
      icon.className = 'ti ti-repeat-off';
      repeatBtn.title = '循环模式: 不循环';
      repeatBtn.classList.remove('active');
      break;
    case 'one':
      icon.className = 'ti ti-repeat-once';
      repeatBtn.title = '循环模式: 单曲循环';
      repeatBtn.classList.add('active');
      break;
    case 'all':
      icon.className = 'ti ti-repeat';
      repeatBtn.title = '循环模式: 列表循环';
      repeatBtn.classList.add('active');
      break;
  }
}

/**
 * 更新播放模式按钮
 */
export function updatePlayModeButton() {
  if (!musicPanel) return;
  
  const shuffleBtn = musicPanel.querySelector('#music-shuffle-btn');
  if (!shuffleBtn) return;
  
  const icon = shuffleBtn.querySelector('i');
  
  if (playerState.playMode === 'random') {
    icon.className = 'ti ti-arrows-shuffle';
    shuffleBtn.title = '播放模式: 随机播放';
    shuffleBtn.classList.add('active');
  } else {
    icon.className = 'ti ti-arrows-sort';
    shuffleBtn.title = '播放模式: 顺序播放';
    shuffleBtn.classList.remove('active');
  }
}

