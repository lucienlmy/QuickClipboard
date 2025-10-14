// 音频播放器状态持久化
import { STORAGE_KEY } from './constants.js';
import { playerState, updateState } from './state.js';

/**
 * 保存播放器状态到 localStorage
 */
export function savePlayerState() {
  try {
    const state = {
      enabled: playerState.enabled,
      volume: playerState.volume,
      repeatMode: playerState.repeatMode,
      playMode: playerState.playMode,
      currentList: playerState.currentList,
      selectedList: playerState.selectedList
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    // 保存失败，静默处理
  }
}

/**
 * 从 localStorage 恢复播放器状态
 */
export function restorePlayerState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const state = JSON.parse(saved);
      updateState({
        enabled: state.enabled || false,
        volume: state.volume !== undefined ? state.volume : 0.7,
        repeatMode: state.repeatMode || 'none',
        playMode: state.playMode || 'sequence',
        currentList: state.currentList || 'clipboard',
        selectedList: state.selectedList || state.currentList || 'clipboard'
      });
      return true;
    }
  } catch (error) {
    // 恢复失败，使用默认值
  }
  return false;
}

/**
 * 清除保存的状态
 */
export function clearPlayerState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
  }
}


