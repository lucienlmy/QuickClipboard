import { invoke } from '@tauri-apps/api/core'

// 播放指定音频文件
export async function playSound(path, volume = 0.5) {
  return await invoke('play_sound', { path, volume })
}

// 播放蜂鸣音
export async function playBeep(frequency = 800, durationMs = 100, volume = 0.5) {
  return await invoke('play_beep', { frequency, durationMs, volume })
}

// 播放复制音效
export async function playCopySound() {
  return await invoke('play_copy_sound')
}

// 播放粘贴音效
export async function playPasteSound() {
  return await invoke('play_paste_sound')
}

// 播放滚动音效
export async function playScrollSound() {
  return await invoke('play_scroll_sound')
}

