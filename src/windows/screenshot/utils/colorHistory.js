const COLOR_HISTORY_STORAGE_KEY = 'screenshot_color_history';
export const COLOR_HISTORY_EVENT = 'screenshot:color-history-updated';
export const MAX_COLOR_HISTORY = 8;

export const COLOR_PRESETS = ['#FF4D4F', '#FA8C16', '#FADB14', '#52C41A', '#13C2C2', '#1677FF', '#722ED1', '#EB2F96'];

export const normalizeHex = (hex) => {
  if (typeof hex !== 'string') return null;
  const trimmed = hex.trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized);
  if (!match) return null;
  return normalized.toUpperCase();
};

const getStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch (err) {
    console.warn('无法访问 localStorage:', err);
    return null;
  }
};

const notifyHistoryUpdate = (history) => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(COLOR_HISTORY_EVENT, { detail: history }));
  } catch (err) {
    console.warn('派发颜色历史事件失败:', err);
  }
};

export const readColorHistory = () => {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const stored = storage.getItem(COLOR_HISTORY_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === 'string');
  } catch (err) {
    console.warn('读取颜色历史失败:', err);
    return [];
  }
};

const persistHistory = (history) => {
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(COLOR_HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch (err) {
      console.warn('保存颜色历史失败:', err);
    }
  }
  notifyHistoryUpdate(history);
};

export const recordColorHistory = (hex) => {
  const normalized = normalizeHex(hex);
  if (!normalized) return;
  const current = readColorHistory();
  const filtered = current.filter((item) => item !== normalized);
  const next = [normalized, ...filtered].slice(0, MAX_COLOR_HISTORY);
  persistHistory(next);
};

export const clearColorHistory = () => {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(COLOR_HISTORY_STORAGE_KEY);
    } catch (err) {
      console.warn('清除颜色历史失败:', err);
    }
  }
  notifyHistoryUpdate([]);
};
