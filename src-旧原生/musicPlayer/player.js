// 音频播放器控制模块
import { convertFileSrc } from '@tauri-apps/api/core';
import { playerState, setState } from './state.js';
import { REPEAT_MODES, PLAY_MODES } from './constants.js';
import { formatTime } from './audioExtractor.js';
import { 
  audioElement, 
  updatePlayButton, 
  updateActiveItem, 
  updateMusicInfo,
  titleIcon
} from './ui.js';
import { savePlayerState } from './storage.js';

/**
 * 播放指定索引的音频
 */
export function playAudioByIndex(index, addToHistory = true) {
  if (index < 0 || index >= playerState.audioFiles.length) {
    return;
  }
  
  setState('currentIndex', index);
  const audioFile = playerState.audioFiles[index];

  if (audioFile?.fileMissing) {
    import('./index.js').then(({ showNotification, refreshAudioList }) => {
      showNotification('文件不存在，无法播放', 'warning');
      refreshAudioList();
    });
    return;
  }
  
  // 添加到播放历史
  if (addToHistory && playerState.playMode === PLAY_MODES.RANDOM) {
    playerState.playHistory.push(index);
    // 限制历史记录长度
    if (playerState.playHistory.length > 50) {
      playerState.playHistory.shift();
    }
  }
  
  try {
    const audioUrl = convertFileSrc(audioFile.filePath);
    
    // 设置音频源
    audioElement.src = audioUrl;
    audioElement.load();
    audioElement.play().catch(error => {
      import('./index.js').then(({ showNotification }) => {
        showNotification('播放失败: ' + error.message, 'error');
      });
    });
    
    // 更新UI
    updateMusicInfo(audioFile);
    updateActiveItem(playerState.currentList);
  } catch (error) {
    import('./index.js').then(({ showNotification }) => {
      showNotification('无法加载音频文件', 'error');
    });
  }
}

/**
 * 切换播放/暂停
 */
export function togglePlayPause() {
  if (!audioElement.src) {
    // 如果没有音频源，播放第一首
    if (playerState.audioFiles.length > 0) {
      playAudioByIndex(0);
    } else {
      import('./index.js').then(({ showNotification }) => {
        showNotification('没有可播放的音频文件', 'warning');
      });
    }
    return;
  }
  
  if (playerState.isPlaying) {
    audioElement.pause();
  } else {
    audioElement.play().catch(error => {
      import('./index.js').then(({ showNotification }) => {
        showNotification('播放失败: ' + error.message, 'error');
      });
    });
  }
}

/**
 * 播放上一首
 */
export function playPrevious() {
  if (playerState.audioFiles.length === 0) return;
  
  if (playerState.playMode === PLAY_MODES.RANDOM) {
    const previousIndex = getPreviousFromHistory();
    if (previousIndex !== null) {
      playAudioByIndex(previousIndex, false);
      return;
    }
    const randomIndex = getNextValidRandomIndex();
    if (randomIndex !== null) {
      playAudioByIndex(randomIndex);
    }
  } else {
    const prevIndex = getNextValidSequentialIndex(-1);
    if (prevIndex !== null) {
      playAudioByIndex(prevIndex);
    }
  }
}

/**
 * 播放下一首
 */
export function playNext() {
  if (playerState.audioFiles.length === 0) return;
  
  if (playerState.playMode === PLAY_MODES.RANDOM) {
    const randomIndex = getNextValidRandomIndex();
    if (randomIndex !== null) {
      playAudioByIndex(randomIndex);
    }
  } else {
    const nextIndex = getNextValidSequentialIndex(1);
    if (nextIndex !== null) {
      playAudioByIndex(nextIndex);
    }
  }
}

/**
 * 获取随机索引
 */
function getRandomIndex() {
  if (playerState.audioFiles.length === 1) {
    return 0;
  }
  
  let randomIndex;
  do {
    randomIndex = Math.floor(Math.random() * playerState.audioFiles.length);
  } while (randomIndex === playerState.currentIndex);
  
  return randomIndex;
}

function getNextValidSequentialIndex(direction = 1) {
  const list = playerState.audioFiles;
  const length = list.length;

  if (length === 0) return null;

  let attempts = 0;
  let index = playerState.currentIndex;

  do {
    index = (index + direction + length) % length;
    attempts++;
    const audio = list[index];
    if (!audio?.fileMissing) {
      return index;
    }
  } while (attempts < length && index !== playerState.currentIndex);

  return null;
}

function getNextValidRandomIndex() {
  const available = playerState.audioFiles
    .map((audio, idx) => ({ audio, idx }))
    .filter(({ audio }) => !audio?.fileMissing);

  if (available.length === 0) {
    import('./index.js').then(({ showNotification }) => {
      showNotification('没有可播放的音频文件', 'warning');
    });
    return null;
  }

  if (available.length === 1) {
    return available[0].idx;
  }

  let randomIndex;
  const currentIndex = playerState.currentIndex;
  do {
    randomIndex = available[Math.floor(Math.random() * available.length)].idx;
  } while (randomIndex === currentIndex && available.length > 1);

  return randomIndex;
}

function getPreviousFromHistory() {
  if (playerState.playHistory.length > 1) {
    playerState.playHistory.pop();
    const prevIndex = playerState.playHistory[playerState.playHistory.length - 1];
    if (playerState.audioFiles[prevIndex]?.fileMissing) {
      return getNextValidSequentialIndex(-1);
    }
    return prevIndex;
  }
  return null;
}

/**
 * 切换循环模式
 */
export function toggleRepeatMode() {
  const modes = [REPEAT_MODES.NONE, REPEAT_MODES.ONE, REPEAT_MODES.ALL];
  const currentIndex = modes.indexOf(playerState.repeatMode);
  const nextIndex = (currentIndex + 1) % modes.length;
  
  setState('repeatMode', modes[nextIndex]);
  savePlayerState();
}

/**
 * 切换播放模式（顺序/随机）
 */
export function togglePlayMode() {
  const newMode = playerState.playMode === PLAY_MODES.SEQUENCE 
    ? PLAY_MODES.RANDOM 
    : PLAY_MODES.SEQUENCE;
  
  setState('playMode', newMode);

  if (newMode === PLAY_MODES.RANDOM) {
    playerState.playHistory = [];
    if (playerState.currentIndex >= 0) {
      playerState.playHistory.push(playerState.currentIndex);
    }
  }
  
  savePlayerState();
}

/**
 * 设置音量
 */
export function setVolume(volume) {
  setState('volume', volume);
  audioElement.volume = volume;

  const volumeRange = document.querySelector('#music-volume-range');
  if (volumeRange) {
    volumeRange.style.setProperty('--volume-percent', `${volume * 100}%`);
  }
  
  // 更新音量图标
  updateVolumeIcon(volume);
  
  savePlayerState();
}

/**
 * 更新音量图标
 */
function updateVolumeIcon(volume) {
  const volumeBtn = document.querySelector('#music-volume-btn i');
  if (!volumeBtn) return;
  
  if (volume === 0) {
    volumeBtn.className = 'ti ti-volume-3';
  } else if (volume < 0.3) {
    volumeBtn.className = 'ti ti-volume-2';
  } else if (volume < 0.7) {
    volumeBtn.className = 'ti ti-volume';
  } else {
    volumeBtn.className = 'ti ti-volume';
  }
}

/**
 * 进度条跳转
 */
export function seekToPosition(percent) {
  if (!audioElement.duration) return;
  audioElement.currentTime = audioElement.duration * percent;
}

/**
 * 音频播放结束处理
 */
export function handleAudioEnded() {
  switch (playerState.repeatMode) {
    case REPEAT_MODES.ONE:
      audioElement.currentTime = 0;
      audioElement.play();
      break;
    case REPEAT_MODES.ALL:
      playNext();
      break;
    default:
      if (playerState.currentIndex < playerState.audioFiles.length - 1) {
        playNext();
      } else {
        setState('isPlaying', false);
        updatePlayButton();
      }
      break;
  }
}

/**
 * 音频时间更新处理
 */
export function handleTimeUpdate() {
  if (!audioElement.duration) return;
  
  const percent = (audioElement.currentTime / audioElement.duration) * 100;
  const currentTime = formatTime(audioElement.currentTime);
  
  const progressFill = document.querySelector('.music-progress-fill');
  const progressHandle = document.querySelector('.music-progress-handle');
  const currentTimeElement = document.querySelector('.current-time');
  
  if (progressFill) progressFill.style.width = percent + '%';
  if (progressHandle) progressHandle.style.left = percent + '%';
  if (currentTimeElement) currentTimeElement.textContent = currentTime;
}

/**
 * 音频元数据加载完成处理
 */
export function handleMetadataLoaded() {
  const totalTime = formatTime(audioElement.duration);
  const totalTimeElement = document.querySelector('.total-time');
  
  if (totalTimeElement) {
    totalTimeElement.textContent = totalTime;
  }
}

/**
 * 音频错误处理
 */
export function handleAudioError(e) {
  const currentAudio = playerState.audioFiles[playerState.currentIndex];

  if (currentAudio) {
    currentAudio.fileMissing = true;
  }

  import('./index.js').then(({ showNotification, refreshAudioList }) => {
    showNotification('音频加载失败，源文件可能已被删除', 'error');
    refreshAudioList();
  });
  
  // 尝试播放下一首
  if (playerState.audioFiles.length > 1) {
    playNext();
  }
}

/**
 * 绑定音频事件
 */
export function bindAudioEvents() {
  audioElement.addEventListener('ended', handleAudioEnded);
  audioElement.addEventListener('timeupdate', handleTimeUpdate);
  audioElement.addEventListener('loadedmetadata', handleMetadataLoaded);
  audioElement.addEventListener('error', handleAudioError);
  
  audioElement.addEventListener('play', () => {
    setState('isPlaying', true);
    updatePlayButton();
  });
  
  audioElement.addEventListener('pause', () => {
    setState('isPlaying', false);
    updatePlayButton();
  });
}

