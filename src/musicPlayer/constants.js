// 音频播放器常量定义

// 支持的音频文件扩展名
export const AUDIO_EXTENSIONS = [
  '.mp3', 
  '.wav', 
  '.ogg', 
  '.m4a', 
  '.flac', 
  '.aac', 
  '.wma', 
  '.opus'
];

// 循环模式
export const REPEAT_MODES = {
  NONE: 'none',
  ONE: 'one',
  ALL: 'all'
};

// 播放模式
export const PLAY_MODES = {
  SEQUENCE: 'sequence',  // 顺序播放
  RANDOM: 'random'       // 随机播放
};

// 列表类型
export const LIST_TYPES = {
  CLIPBOARD: 'clipboard',
  QUICK_TEXTS: 'quick-texts',
  CUSTOM_FOLDER: 'custom-folder'
};

// 存储键名
export const STORAGE_KEY = 'music-player-state';
export const FOLDERS_STORAGE_KEY = 'music-player-folders';

// 默认配置
export const DEFAULT_CONFIG = {
  enabled: false,
  volume: 0.7,
  repeatMode: REPEAT_MODES.NONE,
  playMode: PLAY_MODES.SEQUENCE,
  currentList: LIST_TYPES.CLIPBOARD,
  selectedList: LIST_TYPES.CLIPBOARD
};


