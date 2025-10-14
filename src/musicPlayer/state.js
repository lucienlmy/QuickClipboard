// 音频播放器状态管理
import { DEFAULT_CONFIG } from './constants.js';

// 播放器状态
export const playerState = {
  enabled: DEFAULT_CONFIG.enabled,
  isPlaying: false,
  currentIndex: -1,
  currentList: DEFAULT_CONFIG.currentList,
  selectedList: DEFAULT_CONFIG.selectedList,
  volume: DEFAULT_CONFIG.volume,
  isPanelExpanded: false,
  audioFiles: [],
  repeatMode: DEFAULT_CONFIG.repeatMode,
  playMode: DEFAULT_CONFIG.playMode,
  playHistory: [], // 随机播放历史
  isMuted: false
};

// 获取状态的便捷方法
export function getState(key) {
  return playerState[key];
}

// 设置状态的便捷方法
export function setState(key, value) {
  playerState[key] = value;
}

// 批量更新状态
export function updateState(updates) {
  Object.assign(playerState, updates);
}

// 重置状态
export function resetState() {
  Object.assign(playerState, {
    ...DEFAULT_CONFIG,
    isPlaying: false,
    currentIndex: -1,
    currentList: DEFAULT_CONFIG.currentList,
    selectedList: DEFAULT_CONFIG.selectedList,
    isPanelExpanded: false,
    audioFiles: [],
    playHistory: [],
    isMuted: false
  });
}


